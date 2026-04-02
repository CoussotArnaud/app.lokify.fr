param(
  [Parameter(Position = 0)]
  [string]$BackupName,
  [string]$BackupPath,
  [string]$TargetRoot,
  [switch]$SkipSafetyBackup,
  [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Path $PSScriptRoot -Parent
$backupRoot = Join-Path $projectRoot "SAUVEGARDE"
$legacyRoot = Join-Path $backupRoot "legacy"
$resolvedProjectRoot = (Resolve-Path $projectRoot).Path

$excludedTopLevelDirectories = @(
  ".git",
  "SAUVEGARDE",
  "node_modules"
)

$excludedTopLevelDirectoryPatterns = @(
  ".tmp*"
)

$excludedRootFilePatterns = @(
  "*.log",
  ".tmp-*",
  "lokify-*.log"
)

function Test-ExcludedTopLevelDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$DirectoryName
  )

  if ($DirectoryName -in $excludedTopLevelDirectories) {
    return $true
  }

  foreach ($pattern in $excludedTopLevelDirectoryPatterns) {
    if ($DirectoryName -like $pattern) {
      return $true
    }
  }

  return $false
}

function Test-ExcludedRootFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FileName
  )

  foreach ($pattern in $excludedRootFilePatterns) {
    if ($FileName -like $pattern) {
      return $true
    }
  }

  return $false
}

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
    [string]$Destination
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

  & robocopy @arguments | Out-Null

  if ($LASTEXITCODE -ge 8) {
    throw "Robocopy failed for '$Source' with exit code $LASTEXITCODE"
  }
}

function Resolve-RequestedBackupPath {
  param(
    [string]$RequestedBackupName,
    [string]$RequestedBackupPath
  )

  if (-not [string]::IsNullOrWhiteSpace($RequestedBackupPath)) {
    if (Test-Path -LiteralPath $RequestedBackupPath) {
      return (Resolve-Path -LiteralPath $RequestedBackupPath).Path
    }

    $candidateFromRoot = Join-Path $backupRoot $RequestedBackupPath
    if (Test-Path -LiteralPath $candidateFromRoot) {
      return (Resolve-Path -LiteralPath $candidateFromRoot).Path
    }

    $candidateFromLegacy = Join-Path $legacyRoot $RequestedBackupPath
    if (Test-Path -LiteralPath $candidateFromLegacy) {
      return (Resolve-Path -LiteralPath $candidateFromLegacy).Path
    }

    throw "Backup path not found: $RequestedBackupPath"
  }

  if ([string]::IsNullOrWhiteSpace($RequestedBackupName)) {
    throw "Provide -BackupName or -BackupPath. Example: -BackupName sauvegarde-2026-04-02-120000"
  }

  $candidates = @(
    (Join-Path $backupRoot $RequestedBackupName),
    (Join-Path $backupRoot "$RequestedBackupName.zip"),
    (Join-Path $legacyRoot $RequestedBackupName),
    (Join-Path $legacyRoot "$RequestedBackupName.zip")
  )

  foreach ($candidatePath in $candidates) {
    if (Test-Path -LiteralPath $candidatePath) {
      return (Resolve-Path -LiteralPath $candidatePath).Path
    }
  }

  throw "Backup not found for '$RequestedBackupName'"
}

function Get-BackupManifest {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkingRoot
  )

  $metadataPath = Join-Path $WorkingRoot "backup-metadata.json"

  if (Test-Path -LiteralPath $metadataPath -PathType Leaf) {
    return Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
  }

  $fallbackDirectories = Get-ChildItem -LiteralPath $WorkingRoot -Force -Directory |
    Where-Object { $_.Name -ne "backup-metadata.json" } |
    Sort-Object Name |
    Select-Object -ExpandProperty Name

  $fallbackFiles = Get-ChildItem -LiteralPath $WorkingRoot -Force -File |
    Where-Object { $_.Name -ne "backup-metadata.json" } |
    Sort-Object Name |
    Select-Object -ExpandProperty Name

  return [PSCustomObject]@{
    schema_version = 1
    format = "folder"
    backup_name = Split-Path -Path $WorkingRoot -Leaf
    included_directories = $fallbackDirectories
    included_root_files = $fallbackFiles
    required_directories = @("backend", "database", "electron", "frontend", "scripts")
    required_root_files = @("AGENTS.md", "README.md", "package-lock.json", "package.json")
  }
}

function Test-BackupDirectoryExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkingRoot,
    [Parameter(Mandatory = $true)]
    [string]$DirectoryName
  )

  return Test-Path -LiteralPath (Join-Path $WorkingRoot $DirectoryName) -PathType Container
}

function Test-BackupFileExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkingRoot,
    [Parameter(Mandatory = $true)]
    [string]$FileName
  )

  return Test-Path -LiteralPath (Join-Path $WorkingRoot $FileName) -PathType Leaf
}

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
New-Item -ItemType Directory -Force -Path $legacyRoot | Out-Null

$resolvedBackupPath = Resolve-RequestedBackupPath -RequestedBackupName $BackupName -RequestedBackupPath $BackupPath
$resolvedTargetRoot = if ([string]::IsNullOrWhiteSpace($TargetRoot)) { $resolvedProjectRoot } else { [System.IO.Path]::GetFullPath($TargetRoot) }
$workingRoot = $resolvedBackupPath
$extractedWorkingRoot = $null
$manifest = $null

Assert-PathWithinProject -Path $resolvedTargetRoot

try {
  if ((Get-Item -LiteralPath $resolvedBackupPath).PSIsContainer) {
    $workingRoot = $resolvedBackupPath
  } else {
    if ([System.IO.Path]::GetExtension($resolvedBackupPath) -ne ".zip") {
      throw "Unsupported backup format: $resolvedBackupPath"
    }

    $extractedWorkingRoot = Join-Path $backupRoot (".restore-source-" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $extractedWorkingRoot | Out-Null
    Expand-Archive -LiteralPath $resolvedBackupPath -DestinationPath $extractedWorkingRoot -Force
    $workingRoot = $extractedWorkingRoot
  }

  $manifest = Get-BackupManifest -WorkingRoot $workingRoot

  foreach ($directoryName in @($manifest.required_directories)) {
    if (-not (Test-BackupDirectoryExists -WorkingRoot $workingRoot -DirectoryName $directoryName)) {
      throw "Backup validation failed: missing directory '$directoryName' in $workingRoot"
    }
  }

  foreach ($fileName in @($manifest.required_root_files)) {
    if (-not (Test-BackupFileExists -WorkingRoot $workingRoot -FileName $fileName)) {
      throw "Backup validation failed: missing file '$fileName' in $workingRoot"
    }
  }

  if ($ValidateOnly) {
    [PSCustomObject]@{
      backup_name = [string]$manifest.backup_name
      backup_source = $resolvedBackupPath
      format = [string]$manifest.format
      validated_at = (Get-Date).ToString("o")
      included_directories = @($manifest.included_directories)
      included_root_files = @($manifest.included_root_files)
      target_root = $resolvedTargetRoot
      validation_only = $true
    }

    return
  }

  $isRestoringIntoProjectRoot = $resolvedTargetRoot.Equals($resolvedProjectRoot, [System.StringComparison]::OrdinalIgnoreCase)
  $safetyBackupName = ""
  $safetyBackupPath = ""

  if ($isRestoringIntoProjectRoot -and -not $SkipSafetyBackup) {
    $backupScript = Join-Path $PSScriptRoot "create-backup.ps1"
    $safetyBackup = & $backupScript
    $safetyBackupName = [string]$safetyBackup.backup_name
    $safetyBackupPath = [string]$safetyBackup.backup_path
  }

  if ($isRestoringIntoProjectRoot) {
    Get-ChildItem -LiteralPath $resolvedProjectRoot -Force -Directory |
      Where-Object { -not (Test-ExcludedTopLevelDirectory -DirectoryName $_.Name) } |
      ForEach-Object {
        if ($_.Name -notin @($manifest.included_directories)) {
          Remove-Item -LiteralPath $_.FullName -Recurse -Force
        }
      }

    Get-ChildItem -LiteralPath $resolvedProjectRoot -Force -File |
      Where-Object { -not (Test-ExcludedRootFile -FileName $_.Name) } |
      ForEach-Object {
        if ($_.Name -notin @($manifest.included_root_files)) {
          Remove-Item -LiteralPath $_.FullName -Force
        }
      }
  } else {
    if (Test-Path -LiteralPath $resolvedTargetRoot -PathType Container) {
      Remove-Item -LiteralPath $resolvedTargetRoot -Recurse -Force
    }

    New-Item -ItemType Directory -Force -Path $resolvedTargetRoot | Out-Null
  }

  foreach ($directoryName in @($manifest.included_directories)) {
    $sourcePath = Join-Path $workingRoot $directoryName
    $targetPath = Join-Path $resolvedTargetRoot $directoryName
    Assert-PathWithinProject -Path $targetPath

    if (Test-Path -LiteralPath $targetPath -PathType Container) {
      Remove-Item -LiteralPath $targetPath -Recurse -Force
    }

    Invoke-RobocopyDirectory -Source $sourcePath -Destination $targetPath
  }

  foreach ($fileName in @($manifest.included_root_files)) {
    $sourcePath = Join-Path $workingRoot $fileName
    $targetPath = Join-Path $resolvedTargetRoot $fileName
    Assert-PathWithinProject -Path $targetPath
    Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
  }

  [PSCustomObject]@{
    restored_from = $resolvedBackupPath
    backup_name = [string]$manifest.backup_name
    target_root = $resolvedTargetRoot
    restored_at = (Get-Date).ToString("o")
    validation_only = $false
    safety_backup_created = ($isRestoringIntoProjectRoot -and -not $SkipSafetyBackup)
    safety_backup_name = $safetyBackupName
    safety_backup_path = $safetyBackupPath
    restored_directories = @($manifest.included_directories)
    restored_root_files = @($manifest.included_root_files)
  }
} finally {
  if ($null -ne $extractedWorkingRoot -and (Test-Path -LiteralPath $extractedWorkingRoot)) {
    Remove-Item -LiteralPath $extractedWorkingRoot -Recurse -Force
  }
}
