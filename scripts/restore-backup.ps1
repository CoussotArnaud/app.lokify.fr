$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

param(
  [Parameter(Position = 0)]
  [string]$BackupName,
  [string]$BackupPath,
  [switch]$SkipSafetyBackup
)

$projectRoot = Split-Path -Path $PSScriptRoot -Parent
$backupRoot = Join-Path $projectRoot "SAUVEGARDE"
$resolvedProjectRoot = (Resolve-Path $projectRoot).Path
$resolvedBackupRoot = (Resolve-Path $backupRoot).Path

$requiredDirectories = @(
  "backend",
  "database",
  "electron",
  "frontend",
  "scripts"
)

$replaceDirectories = @(
  "backend",
  "database",
  "electron",
  "frontend"
)

$optionalDirectories = @(
  ".vercel",
  ".tmp-vercel-backend-link",
  ".tmp-vercel-frontend-link"
)

$requiredRootFiles = @(
  "package.json",
  "package-lock.json",
  "README.md"
)

function Assert-PathWithinProject {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $resolvedPath = [System.IO.Path]::GetFullPath($Path)

  if (-not $resolvedPath.StartsWith($resolvedProjectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify path outside project root: $resolvedPath"
  }
}

function Invoke-RobocopyDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Destination,
    [switch]$Mirror
  )

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null

  $arguments = @(
    $Source,
    $Destination,
    "/E",
    "/XJ",
    "/R:1",
    "/W:1",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/NP"
  )

  if ($Mirror) {
    $arguments += "/MIR"
  }

  & robocopy @arguments | Out-Null

  if ($LASTEXITCODE -ge 8) {
    throw "Robocopy failed for '$Source' with exit code $LASTEXITCODE"
  }
}

if ([string]::IsNullOrWhiteSpace($BackupPath)) {
  if ([string]::IsNullOrWhiteSpace($BackupName)) {
    throw "Provide -BackupName or -BackupPath. Example: -BackupName sauvegarde-2026-03-31-201534"
  }

  $BackupPath = Join-Path $backupRoot $BackupName
}

if (-not (Test-Path -LiteralPath $BackupPath -PathType Container)) {
  throw "Backup folder not found: $BackupPath"
}

$resolvedBackupPath = (Resolve-Path $BackupPath).Path

if (-not $resolvedBackupPath.StartsWith($resolvedBackupRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Backup must live inside $resolvedBackupRoot"
}

foreach ($directoryName in $requiredDirectories) {
  $sourcePath = Join-Path $resolvedBackupPath $directoryName

  if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) {
    throw "Backup validation failed: missing directory '$directoryName' in $resolvedBackupPath"
  }
}

foreach ($fileName in $requiredRootFiles) {
  $sourcePath = Join-Path $resolvedBackupPath $fileName

  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Backup validation failed: missing file '$fileName' in $resolvedBackupPath"
  }
}

if (-not $SkipSafetyBackup) {
  $backupScript = Join-Path $PSScriptRoot "create-backup.ps1"
  & powershell -ExecutionPolicy Bypass -File $backupScript | Out-Null
}

foreach ($directoryName in $replaceDirectories) {
  $targetPath = Join-Path $projectRoot $directoryName
  Assert-PathWithinProject -Path $targetPath

  if (Test-Path -LiteralPath $targetPath -PathType Container) {
    Remove-Item -LiteralPath $targetPath -Recurse -Force
  }

  Invoke-RobocopyDirectory -Source (Join-Path $resolvedBackupPath $directoryName) -Destination $targetPath
}

foreach ($directoryName in $optionalDirectories) {
  $sourcePath = Join-Path $resolvedBackupPath $directoryName
  $targetPath = Join-Path $projectRoot $directoryName
  Assert-PathWithinProject -Path $targetPath

  if (Test-Path -LiteralPath $targetPath -PathType Container) {
    Remove-Item -LiteralPath $targetPath -Recurse -Force
  }

  if (Test-Path -LiteralPath $sourcePath -PathType Container) {
    Invoke-RobocopyDirectory -Source $sourcePath -Destination $targetPath
  }
}

$scriptsSourcePath = Join-Path $resolvedBackupPath "scripts"
$scriptsTargetPath = Join-Path $projectRoot "scripts"
Assert-PathWithinProject -Path $scriptsTargetPath
Invoke-RobocopyDirectory -Source $scriptsSourcePath -Destination $scriptsTargetPath

Get-ChildItem -LiteralPath $resolvedBackupPath -Force -File |
  Where-Object { $_.Name -ne "backup-metadata.json" } |
  ForEach-Object {
    $targetPath = Join-Path $projectRoot $_.Name
    Assert-PathWithinProject -Path $targetPath
    Copy-Item -LiteralPath $_.FullName -Destination $targetPath -Force
  }

$summary = [PSCustomObject]@{
  restored_from = $resolvedBackupPath
  restored_at = (Get-Date).ToString("o")
  safety_backup_created = (-not $SkipSafetyBackup)
  replaced_directories = $replaceDirectories
  restored_optional_directories = $optionalDirectories
  restored_scripts = $true
}

$summary | ConvertTo-Json -Depth 5
