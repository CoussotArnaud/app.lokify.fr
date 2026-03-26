param(
  [ValidateSet("Electron", "Browser")]
  [string]$Mode = "Electron",
  [switch]$SkipElectron,
  [switch]$NoOpenTarget
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Path $PSScriptRoot -Parent
$runtimeRoot = Join-Path $projectRoot ".lokify-runtime"
$sessionStatePath = Join-Path $runtimeRoot "launcher-session.json"
$legacySessionStatePath = Join-Path $runtimeRoot "browser-session.json"
$launcherErrorLogPath = Join-Path $runtimeRoot "launcher-error.log"
$backupScriptPath = Join-Path $projectRoot "scripts\create-backup.ps1"
$frontendUrl = "http://localhost:3001/login"
$backendUrl = "http://localhost:4000/api/health"
$mutexCreated = $false
$launcherMutex = New-Object System.Threading.Mutex($true, "Global\LokifyLauncherMutex", [ref]$mutexCreated)

if (-not $mutexCreated) {
  exit 0
}

$npmCommand = $null
$startedProcesses = New-Object System.Collections.Generic.List[object]
$keepStartedProcessesRunning = $false

function Show-LauncherMessage {
  param(
    [string]$Message,
    [string]$Title = "APP.LOKIFY"
  )

  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    $Message,
    $Title,
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Warning
  ) | Out-Null
}

function Get-NpmCommand {
  $candidate = Get-Command npm.cmd -ErrorAction SilentlyContinue

  if ($candidate) {
    return $candidate.Source
  }

  $defaultPath = "C:\Program Files\nodejs\npm.cmd"
  if (Test-Path $defaultPath) {
    return $defaultPath
  }

  throw "npm.cmd introuvable sur cette machine."
}

function Ensure-RuntimeRoot {
  if (-not (Test-Path $runtimeRoot)) {
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
  }
}

function Invoke-ProjectBackup {
  if (-not (Test-Path -LiteralPath $backupScriptPath)) {
    throw "Script de sauvegarde introuvable: $backupScriptPath"
  }

  try {
    & $backupScriptPath | Out-Null
  }
  catch {
    throw "La sauvegarde automatique de lancement a echoue. $($_.Exception.Message)"
  }
}

function Write-LauncherError {
  param([string]$Message)

  Ensure-RuntimeRoot
  Set-Content -Path $launcherErrorLogPath -Value $Message -Encoding UTF8
}

function Test-PortOpen {
  param([int]$Port)

  $client = New-Object System.Net.Sockets.TcpClient

  try {
    $asyncResult = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $connected = $asyncResult.AsyncWaitHandle.WaitOne(1000, $false)

    if (-not $connected) {
      return $false
    }

    $null = $client.EndConnect($asyncResult)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Test-UrlReady {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -Method Get -TimeoutSec 3
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Wait-ServiceReady {
  param(
    [int]$Port,
    [string]$Url,
    [int]$TimeoutSeconds,
    $TrackedProcess = $null
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    if ($TrackedProcess -and $TrackedProcess.Process.HasExited) {
      return $false
    }

    if ((Test-PortOpen -Port $Port) -and (Test-UrlReady -Url $Url)) {
      return $true
    }

    Start-Sleep -Seconds 1
  }

  return $false
}

function Get-ElectronCommand {
  $electronPath = Join-Path $projectRoot "node_modules\electron\dist\electron.exe"

  if (Test-Path $electronPath) {
    return $electronPath
  }

  throw "electron.exe introuvable. Verifie les dependances du projet."
}

function ConvertTo-CmdValue {
  param([string]$Value)

  if ($null -eq $Value -or $Value -eq "") {
    return '""'
  }

  return '"' + ($Value -replace '"', '""') + '"'
}

function Start-TrackedProcess {
  param(
    [string]$ExecutablePath,
    [string[]]$ExecutableArguments,
    [string]$StdOutPath,
    [string]$StdErrPath
  )

  Remove-Item -LiteralPath $StdOutPath, $StdErrPath -Force -ErrorAction SilentlyContinue

  $commandParts = @((ConvertTo-CmdValue -Value $ExecutablePath))
  foreach ($argument in $ExecutableArguments) {
    $commandParts += ConvertTo-CmdValue -Value $argument
  }

  $commandString = [string]::Join(" ", $commandParts)
  $redirectedCommand = 'cmd.exe /d /c "{0} 1> {1} 2> {2}"' -f $commandString, (ConvertTo-CmdValue -Value $StdOutPath), (ConvertTo-CmdValue -Value $StdErrPath)
  $shell = New-Object -ComObject WScript.Shell
  $originalDirectory = $shell.CurrentDirectory

  try {
    $shell.CurrentDirectory = $projectRoot
    $exec = $shell.Exec($redirectedCommand)
  } finally {
    $shell.CurrentDirectory = $originalDirectory
  }

  try {
    return (Get-Process -Id $exec.ProcessID -ErrorAction Stop)
  } catch {
    throw "Impossible de recuperer le processus lance: $ExecutablePath"
  }
}

function Start-NpmScript {
  param(
    [string]$ScriptName,
    [string]$LogName
  )

  $stdoutPath = Join-Path $projectRoot ("lokify-{0}.out.log" -f $LogName)
  $stderrPath = Join-Path $projectRoot ("lokify-{0}.err.log" -f $LogName)
  $process = Start-TrackedProcess `
    -ExecutablePath $npmCommand `
    -ExecutableArguments @("run", $ScriptName) `
    -StdOutPath $stdoutPath `
    -StdErrPath $stderrPath

  return [PSCustomObject]@{
    Name = $ScriptName
    LogName = $LogName
    StdOut = $stdoutPath
    StdErr = $stderrPath
    Process = $process
  }
}

function Start-ElectronApp {
  $stdoutPath = Join-Path $projectRoot "lokify-electron-launcher.out.log"
  $stderrPath = Join-Path $projectRoot "lokify-electron-launcher.err.log"
  $process = Start-TrackedProcess `
    -ExecutablePath (Get-ElectronCommand) `
    -ExecutableArguments @(".") `
    -StdOutPath $stdoutPath `
    -StdErrPath $stderrPath

  return [PSCustomObject]@{
    Name = "electron"
    LogName = "electron-launcher"
    StdOut = $stdoutPath
    StdErr = $stderrPath
    Process = $process
  }
}

function Get-SessionStatePath {
  if (Test-Path $sessionStatePath) {
    return $sessionStatePath
  }

  if (Test-Path $legacySessionStatePath) {
    return $legacySessionStatePath
  }

  return $sessionStatePath
}

function Get-LiveTrackedProcesses {
  $statePath = Get-SessionStatePath

  if (-not (Test-Path $statePath)) {
    return @()
  }

  try {
    $state = Get-Content -Path $statePath -Raw | ConvertFrom-Json
  } catch {
    return @()
  }

  $liveProcesses = @()

  foreach ($processInfo in @($state.processes)) {
    if (-not $processInfo.pid) {
      continue
    }

    try {
      $process = Get-Process -Id ([int]$processInfo.pid) -ErrorAction Stop
      $liveProcesses += [PSCustomObject]@{
        Name = [string]$processInfo.name
        LogName = [string]$processInfo.name
        StdOut = [string]$processInfo.stdout
        StdErr = [string]$processInfo.stderr
        Process = $process
      }
    } catch {
    }
  }

  return $liveProcesses
}

function Save-LauncherState {
  param(
    [string]$SessionMode,
    [object[]]$AdditionalTrackedProcesses = @()
  )

  $mergedProcesses = @()
  $seenPids = @{}
  $trackedProcesses = New-Object System.Collections.Generic.List[object]

  foreach ($trackedProcess in @(Get-LiveTrackedProcesses)) {
    $trackedProcesses.Add($trackedProcess) | Out-Null
  }

  foreach ($trackedProcess in $startedProcesses) {
    $trackedProcesses.Add($trackedProcess) | Out-Null
  }

  foreach ($trackedProcess in @($AdditionalTrackedProcesses)) {
    $trackedProcesses.Add($trackedProcess) | Out-Null
  }

  foreach ($trackedProcess in $trackedProcesses) {
    if (-not $trackedProcess) {
      continue
    }

    try {
      if ($trackedProcess.Process.HasExited) {
        continue
      }
    } catch {
      continue
    }

    $pidValue = $trackedProcess.Process.Id
    if ($seenPids.ContainsKey($pidValue)) {
      continue
    }

    $seenPids[$pidValue] = $true
    $mergedProcesses += [PSCustomObject]@{
      name = $trackedProcess.Name
      pid = $pidValue
      stdout = $trackedProcess.StdOut
      stderr = $trackedProcess.StdErr
    }
  }

  if ($mergedProcesses.Count -eq 0) {
    Remove-Item -LiteralPath $sessionStatePath, $legacySessionStatePath -Force -ErrorAction SilentlyContinue
    return
  }

  Ensure-RuntimeRoot

  $state = [PSCustomObject]@{
    mode = $SessionMode
    createdAt = (Get-Date).ToString("o")
    frontendUrl = $frontendUrl
    processes = $mergedProcesses
  }

  $state |
    ConvertTo-Json -Depth 4 |
    Set-Content -Path $sessionStatePath -Encoding UTF8

  if (Test-Path $legacySessionStatePath) {
    Remove-Item -LiteralPath $legacySessionStatePath -Force -ErrorAction SilentlyContinue
  }
}

function Clear-LauncherState {
  Remove-Item -LiteralPath $sessionStatePath, $legacySessionStatePath -Force -ErrorAction SilentlyContinue
}

function Stop-TrackedProcess {
  param($TrackedProcess)

  if (-not $TrackedProcess) {
    return
  }

  if ($TrackedProcess.Process.HasExited) {
    return
  }

  & taskkill /PID $TrackedProcess.Process.Id /T /F | Out-Null
}

function Get-LogTail {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return ""
  }

  return (Get-Content -Path $Path -Tail 12 | Out-String).Trim()
}

function Format-StartupError {
  param(
    [string]$ServiceName,
    $TrackedProcess
  )

  if (-not $TrackedProcess) {
    return ("Lokify n'a pas pu confirmer que le service {0} etait pret. Verifie qu'aucun autre logiciel n'utilise deja ce port puis relance Lokify." -f $ServiceName)
  }

  $lines = @(
    ("Lokify n'a pas reussi a demarrer le service {0}." -f $ServiceName),
    "",
    ("Journal erreur : {0}" -f $TrackedProcess.StdErr),
    ("Journal sortie : {0}" -f $TrackedProcess.StdOut)
  )

  $tail = Get-LogTail -Path $TrackedProcess.StdErr
  if ($tail) {
    $lines += ""
    $lines += "Dernieres lignes du journal erreur :"
    $lines += $tail
  }

  return ($lines -join [Environment]::NewLine)
}

try {
  Remove-Item -LiteralPath $launcherErrorLogPath -Force -ErrorAction SilentlyContinue
  $npmCommand = Get-NpmCommand
  Invoke-ProjectBackup

  if ($SkipElectron) {
    $NoOpenTarget = $true
  }

  $backendTracked = $null
  $backendAlreadyOpening = (Test-PortOpen -Port 4000) -or (Test-UrlReady -Url $backendUrl)
  if (-not $backendAlreadyOpening) {
    $backendTracked = Start-NpmScript -ScriptName "start:backend" -LogName "backend-launcher"
    $startedProcesses.Add($backendTracked) | Out-Null
    Save-LauncherState -SessionMode $Mode
  }

  if (-not (Wait-ServiceReady -Port 4000 -Url $backendUrl -TimeoutSeconds 60 -TrackedProcess $backendTracked)) {
    throw (Format-StartupError -ServiceName "backend" -TrackedProcess $backendTracked)
  }

  $frontendTracked = $null
  $frontendAlreadyOpening = (Test-PortOpen -Port 3001) -or (Test-UrlReady -Url $frontendUrl)
  if (-not $frontendAlreadyOpening) {
    $frontendTracked = Start-NpmScript -ScriptName "serve:frontend" -LogName "frontend-launcher"
    $startedProcesses.Add($frontendTracked) | Out-Null
    Save-LauncherState -SessionMode $Mode
  }

  if (-not (Wait-ServiceReady -Port 3001 -Url $frontendUrl -TimeoutSeconds 120 -TrackedProcess $frontendTracked)) {
    throw (Format-StartupError -ServiceName "frontend" -TrackedProcess $frontendTracked)
  }

  if ($Mode -eq "Browser") {
    $keepStartedProcessesRunning = $true
    Save-LauncherState -SessionMode "Browser"

    if (-not $NoOpenTarget) {
      Start-Process $frontendUrl | Out-Null
    }

    exit 0
  }

  if ($NoOpenTarget) {
    exit 0
  }

  $electronTracked = Start-ElectronApp
  Save-LauncherState -SessionMode "Electron" -AdditionalTrackedProcesses @($electronTracked)
  $electronTracked.Process.WaitForExit()

  $sessionStateStillPresent = (Test-Path $sessionStatePath) -or (Test-Path $legacySessionStatePath)
  if (($electronTracked.Process.ExitCode -ne 0) -and $sessionStateStillPresent) {
    throw (Format-StartupError -ServiceName "electron" -TrackedProcess $electronTracked)
  }
} catch {
  $errorDetails = @(
    $_.Exception.Message,
    $_.ScriptStackTrace,
    ($_ | Format-List * -Force | Out-String).Trim()
  ) -join [Environment]::NewLine

  Write-LauncherError -Message $errorDetails
  Show-LauncherMessage -Message $_.Exception.Message
  exit 1
} finally {
  if (-not $keepStartedProcessesRunning) {
    foreach ($trackedProcess in $startedProcesses) {
      Stop-TrackedProcess -TrackedProcess $trackedProcess
    }

    Clear-LauncherState
  }

  if ($launcherMutex) {
    $launcherMutex.ReleaseMutex()
    $launcherMutex.Dispose()
  }
}

