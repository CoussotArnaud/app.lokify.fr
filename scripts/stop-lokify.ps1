Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Path $PSScriptRoot -Parent
$runtimeRoot = Join-Path $projectRoot ".lokify-runtime"
$sessionStatePaths = @(
  (Join-Path $runtimeRoot "launcher-session.json"),
  (Join-Path $runtimeRoot "browser-session.json")
)

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

try {
  $statePath = $sessionStatePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

  if (-not $statePath) {
    exit 0
  }

  $state = Get-Content -Path $statePath -Raw | ConvertFrom-Json
  Remove-Item -LiteralPath $sessionStatePaths -Force -ErrorAction SilentlyContinue

  foreach ($processInfo in @($state.processes)) {
    if (-not $processInfo.pid) {
      continue
    }

    & taskkill /PID ([int]$processInfo.pid) /T /F | Out-Null
  }

  if ((Test-Path $runtimeRoot) -and -not (Get-ChildItem -LiteralPath $runtimeRoot -Force -ErrorAction SilentlyContinue | Select-Object -First 1)) {
    Remove-Item -LiteralPath $runtimeRoot -Force -ErrorAction SilentlyContinue
  }
} catch {
  Show-LauncherMessage -Message $_.Exception.Message
  exit 1
}

