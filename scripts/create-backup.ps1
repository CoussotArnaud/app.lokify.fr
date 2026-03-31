$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Path $PSScriptRoot -Parent
$backupRoot = Join-Path $projectRoot "SAUVEGARDE"
$timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
$backupName = "sauvegarde-$timestamp"
$backupPath = Join-Path $backupRoot $backupName

$requiredDirectories = @(
  "backend",
  "database",
  "electron",
  "frontend",
  "scripts"
)

$optionalDirectories = @(
  ".vercel",
  ".tmp-vercel-backend-link",
  ".tmp-vercel-frontend-link"
)

$rootFileExclusions = @(
  "*.log",
  ".tmp-*",
  "lokify-*.log"
)

$requiredRootFiles = @(
  "package.json",
  "package-lock.json",
  "README.md"
)

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
    "/NP",
    "/XF",
    "*.log"
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

function Test-ExcludedRootFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FileName
  )

  foreach ($pattern in $rootFileExclusions) {
    if ($FileName -like $pattern) {
      return $true
    }
  }

  return $false
}

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
New-Item -ItemType Directory -Force -Path $backupPath | Out-Null

$copiedDirectories = New-Object System.Collections.Generic.List[string]
$copiedRootFiles = New-Object System.Collections.Generic.List[string]

foreach ($directoryName in $requiredDirectories) {
  $sourcePath = Join-Path $projectRoot $directoryName

  if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) {
    throw "Required directory is missing: $sourcePath"
  }

  $destinationPath = Join-Path $backupPath $directoryName
  $excludedSubdirectories = @()

  if ($directoryName -in @("backend", "frontend")) {
    $excludedSubdirectories = @("node_modules", ".next", ".npm-cache")
  }

  Invoke-RobocopyDirectory -Source $sourcePath -Destination $destinationPath -ExcludedDirectories $excludedSubdirectories
  $copiedDirectories.Add($directoryName) | Out-Null
}

foreach ($directoryName in $optionalDirectories) {
  $sourcePath = Join-Path $projectRoot $directoryName

  if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) {
    continue
  }

  $destinationPath = Join-Path $backupPath $directoryName
  Invoke-RobocopyDirectory -Source $sourcePath -Destination $destinationPath
  $copiedDirectories.Add($directoryName) | Out-Null
}

Get-ChildItem -LiteralPath $projectRoot -Force -File |
  Where-Object { -not (Test-ExcludedRootFile -FileName $_.Name) } |
  ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $backupPath $_.Name) -Force
    $copiedRootFiles.Add($_.Name) | Out-Null
  }

foreach ($directoryName in $requiredDirectories) {
  $copiedPath = Join-Path $backupPath $directoryName

  if (-not (Test-Path -LiteralPath $copiedPath -PathType Container)) {
    throw "Backup validation failed: missing directory '$directoryName' in $backupPath"
  }
}

foreach ($fileName in $requiredRootFiles) {
  $copiedPath = Join-Path $backupPath $fileName

  if (-not (Test-Path -LiteralPath $copiedPath -PathType Leaf)) {
    throw "Backup validation failed: missing file '$fileName' in $backupPath"
  }
}

$metadata = [PSCustomObject]@{
  backup_name = $backupName
  created_at = (Get-Date).ToString("o")
  project_root = $projectRoot
  backup_path = $backupPath
  copied_directories = $copiedDirectories.ToArray()
  copied_root_files = $copiedRootFiles.ToArray()
}

$metadata |
  ConvertTo-Json -Depth 5 |
  Set-Content -LiteralPath (Join-Path $backupPath "backup-metadata.json") -Encoding UTF8

Get-ChildItem -LiteralPath $backupRoot -Directory |
  Where-Object { $_.Name -like "sauvegarde-*" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 5 |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Recurse -Force
  }

Get-ChildItem -LiteralPath $backupRoot -Directory |
  Where-Object { $_.Name -like "sauvegarde-*" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object Name, LastWriteTime, FullName
