$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Path $PSScriptRoot -Parent
$backupRoot = Join-Path $projectRoot "SAUVEGARDE"
$timestamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$backupPath = Join-Path $backupRoot "sauvegarde-$timestamp"

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$excludedDirectories = @(
  $backupRoot,
  (Join-Path $projectRoot ".git"),
  (Join-Path $projectRoot "backups"),
  (Join-Path $projectRoot "SAUVEGARDES"),
  (Join-Path $projectRoot "frontend\node_modules"),
  (Join-Path $projectRoot "backend\node_modules"),
  (Join-Path $projectRoot "frontend\.next"),
  (Join-Path $projectRoot "frontend\.npm-cache"),
  (Join-Path $projectRoot "backend\.npm-cache")
)

$null = robocopy $projectRoot $backupPath /E /XJ /R:1 /W:1 /NFL /NDL /NJH /NJS /NP /XD $excludedDirectories /XF *.log

if ($LASTEXITCODE -ge 8) {
  throw "Robocopy failed with exit code $LASTEXITCODE"
}

if (-not (Test-Path $backupPath)) {
  throw "Backup folder was not created: $backupPath"
}

Get-ChildItem -Path $backupRoot -Directory |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 3 |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Recurse -Force
  }

Get-ChildItem -Path $backupRoot -Directory |
  Sort-Object LastWriteTime -Descending |
  Select-Object Name, LastWriteTime

