$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Path $PSScriptRoot -Parent
$backupRoot = Join-Path $projectRoot "SAUVEGARDE"
$legacyRoot = Join-Path $backupRoot "legacy"
$timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
$backupName = "sauvegarde-$timestamp"
$stagingPath = Join-Path $backupRoot ".staging-$backupName"
$backupFileName = "$backupName.zip"
$backupPath = Join-Path $backupRoot $backupFileName

$requiredDirectories = @(
  "backend",
  "database",
  "electron",
  "frontend",
  "scripts"
)

$requiredRootFiles = @(
  "AGENTS.md",
  "README.md",
  "package-lock.json",
  "package.json"
)

$excludedTopLevelDirectories = @(
  ".git",
  "SAUVEGARDE",
  "node_modules"
)

$excludedTopLevelDirectoryPatterns = @(
  ".tmp*"
)

$excludedNestedDirectories = @(
  ".next",
  ".npm-cache",
  "node_modules"
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

function Invoke-RobocopyDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Destination,
    [string[]]$ExcludedDirectories = @()
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

  if ($ExcludedDirectories.Count -gt 0) {
    $arguments += "/XD"
    $arguments += $ExcludedDirectories
  }

  & robocopy @arguments | Out-Null

  if ($LASTEXITCODE -ge 8) {
    throw "Robocopy failed for '$Source' with exit code $LASTEXITCODE"
  }
}

function Move-ExistingBackupArtifactsToLegacy {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceRoot,
    [Parameter(Mandatory = $true)]
    [string]$LegacyDestinationRoot
  )

  New-Item -ItemType Directory -Force -Path $LegacyDestinationRoot | Out-Null

  Get-ChildItem -LiteralPath $SourceRoot -Force |
    Where-Object {
      $_.Name -ne "legacy" -and
      $_.Name -notlike ".staging-*" -and
      $_.Name -notlike "sauvegarde-*.zip"
    } |
    ForEach-Object {
      $destinationPath = Join-Path $LegacyDestinationRoot $_.Name

      if (Test-Path -LiteralPath $destinationPath) {
        $destinationPath = Join-Path $LegacyDestinationRoot ("{0}-migrated-{1}" -f $_.Name, $timestamp)
      }

      Move-Item -LiteralPath $_.FullName -Destination $destinationPath -Force
    }
}

function Remove-StaleStagingDirectories {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceRoot
  )

  Get-ChildItem -LiteralPath $SourceRoot -Force -Directory |
    Where-Object { $_.Name -like ".staging-*" } |
    ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
}

function Test-ZipContainsDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$EntryNames,
    [Parameter(Mandatory = $true)]
    [string]$DirectoryName
  )

  $normalizedPrefix = "$DirectoryName/"
  return [bool]($EntryNames | Where-Object { $_ -like "$normalizedPrefix*" } | Select-Object -First 1)
}

foreach ($directoryName in $requiredDirectories) {
  $sourcePath = Join-Path $projectRoot $directoryName

  if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) {
    throw "Required directory is missing: $sourcePath"
  }
}

foreach ($fileName in $requiredRootFiles) {
  $sourcePath = Join-Path $projectRoot $fileName

  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Required root file is missing: $sourcePath"
  }
}

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
Remove-StaleStagingDirectories -SourceRoot $backupRoot
Move-ExistingBackupArtifactsToLegacy -SourceRoot $backupRoot -LegacyDestinationRoot $legacyRoot

$copiedDirectories = New-Object System.Collections.Generic.List[string]
$copiedRootFiles = New-Object System.Collections.Generic.List[string]
$rotatedBackupsRemoved = New-Object System.Collections.Generic.List[string]

try {
  New-Item -ItemType Directory -Force -Path $stagingPath | Out-Null

  Get-ChildItem -LiteralPath $projectRoot -Force -Directory |
    Where-Object { -not (Test-ExcludedTopLevelDirectory -DirectoryName $_.Name) } |
    Sort-Object Name |
    ForEach-Object {
      $destinationPath = Join-Path $stagingPath $_.Name
      Invoke-RobocopyDirectory -Source $_.FullName -Destination $destinationPath -ExcludedDirectories $excludedNestedDirectories
      $copiedDirectories.Add($_.Name) | Out-Null
    }

  Get-ChildItem -LiteralPath $projectRoot -Force -File |
    Where-Object { -not (Test-ExcludedRootFile -FileName $_.Name) } |
    Sort-Object Name |
    ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $stagingPath $_.Name) -Force
      $copiedRootFiles.Add($_.Name) | Out-Null
    }

  foreach ($directoryName in $requiredDirectories) {
    $copiedPath = Join-Path $stagingPath $directoryName

    if (-not (Test-Path -LiteralPath $copiedPath -PathType Container)) {
      throw "Backup validation failed: missing directory '$directoryName' in $stagingPath"
    }
  }

  foreach ($fileName in $requiredRootFiles) {
    $copiedPath = Join-Path $stagingPath $fileName

    if (-not (Test-Path -LiteralPath $copiedPath -PathType Leaf)) {
      throw "Backup validation failed: missing file '$fileName' in $stagingPath"
    }
  }

  $metadata = [PSCustomObject]@{
    schema_version = 2
    format = "zip"
    backup_name = $backupName
    backup_file_name = $backupFileName
    created_at = (Get-Date).ToString("o")
    project_root = $projectRoot
    backup_root = $backupRoot
    required_directories = $requiredDirectories
    required_root_files = $requiredRootFiles
    included_directories = $copiedDirectories.ToArray()
    included_root_files = $copiedRootFiles.ToArray()
    excluded_top_level_directories = $excludedTopLevelDirectories
    excluded_top_level_directory_patterns = $excludedTopLevelDirectoryPatterns
    excluded_nested_directories = $excludedNestedDirectories
    excluded_root_file_patterns = $excludedRootFilePatterns
  }

  $metadata |
    ConvertTo-Json -Depth 8 |
    Set-Content -LiteralPath (Join-Path $stagingPath "backup-metadata.json") -Encoding UTF8

  Add-Type -AssemblyName System.IO.Compression.FileSystem

  if (Test-Path -LiteralPath $backupPath) {
    Remove-Item -LiteralPath $backupPath -Force
  }

  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $stagingPath,
    $backupPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
  )

  if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
    throw "Backup creation failed: archive not found at $backupPath"
  }

  $backupFile = Get-Item -LiteralPath $backupPath
  if ($backupFile.Length -le 0) {
    throw "Backup creation failed: archive is empty at $backupPath"
  }

  $archive = [System.IO.Compression.ZipFile]::OpenRead($backupPath)

  try {
    $entryNames = $archive.Entries |
      ForEach-Object { $_.FullName.Replace("\", "/") }

    if ("backup-metadata.json" -notin $entryNames) {
      throw "Backup validation failed: missing backup-metadata.json inside $backupPath"
    }

    foreach ($directoryName in $requiredDirectories) {
      if (-not (Test-ZipContainsDirectory -EntryNames $entryNames -DirectoryName $directoryName)) {
        throw "Backup validation failed: missing directory '$directoryName' inside $backupPath"
      }
    }

    foreach ($fileName in $requiredRootFiles) {
      if ($fileName -notin $entryNames) {
        throw "Backup validation failed: missing root file '$fileName' inside $backupPath"
      }
    }
  } finally {
    $archive.Dispose()
  }

  Get-ChildItem -LiteralPath $backupRoot -File |
    Where-Object { $_.Name -like "sauvegarde-*.zip" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 5 |
    ForEach-Object {
      $rotatedBackupsRemoved.Add($_.Name) | Out-Null
      Remove-Item -LiteralPath $_.FullName -Force
    }

  [PSCustomObject]@{
    backup_name = $backupName
    backup_file_name = $backupFileName
    backup_path = $backupPath
    format = "zip"
    backup_root = $backupRoot
    legacy_root = $legacyRoot
    created_at = $metadata.created_at
    included_directories = $copiedDirectories.ToArray()
    included_root_files = $copiedRootFiles.ToArray()
    rotated_backups_removed = $rotatedBackupsRemoved.ToArray()
  }
} finally {
  if (Test-Path -LiteralPath $stagingPath) {
    Remove-Item -LiteralPath $stagingPath -Recurse -Force
  }
}
