param(
  [switch]$FrontendOnly,
  [switch]$BackendOnly,
  [string]$BackendUrl = "",
  [string]$FrontendUrl = ""
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$rootLinkDir = Join-Path $root ".vercel"
$frontendLinkDir = Join-Path $root ".tmp-vercel-frontend-link"
$backendLinkDir = Join-Path $root ".tmp-vercel-backend-link"
$npxPath = "C:\Program Files\nodejs\npx.cmd"

function Invoke-VercelPreviewDeploy {
  param(
    [string]$LinkDir,
    [string[]]$Arguments
  )

  $projectFile = Join-Path $LinkDir ".vercel\project.json"

  if (-not (Test-Path $projectFile)) {
    throw "Projet Vercel non lie. Fichier manquant: $projectFile"
  }

  New-Item -ItemType Directory -Force -Path $rootLinkDir | Out-Null
  Copy-Item -Force $projectFile (Join-Path $rootLinkDir "project.json")

  $stdoutFile = [System.IO.Path]::GetTempFileName()
  $stderrFile = [System.IO.Path]::GetTempFileName()
  $argumentList = @("-y", "vercel", "deploy", "--yes") + $Arguments

  $previousLogLevel = $env:npm_config_loglevel
  $env:npm_config_loglevel = "error"

  $process = Start-Process `
    -FilePath $npxPath `
    -ArgumentList $argumentList `
    -WorkingDirectory $root `
    -NoNewWindow `
    -Wait `
    -PassThru `
    -RedirectStandardOutput $stdoutFile `
    -RedirectStandardError $stderrFile

  $env:npm_config_loglevel = $previousLogLevel

  $output = @()
  if (Test-Path $stdoutFile) {
    $output += Get-Content $stdoutFile
  }
  if (Test-Path $stderrFile) {
    $output += Get-Content $stderrFile
  }

  Remove-Item -Force $stdoutFile, $stderrFile -ErrorAction SilentlyContinue
  Remove-Item -Force (Join-Path $rootLinkDir "project.json") -ErrorAction SilentlyContinue

  if ($process.ExitCode -ne 0) {
    throw ($output -join [Environment]::NewLine)
  }

  $previewUrl = $output |
    ForEach-Object {
      [regex]::Matches($_.ToString(), 'https://[a-zA-Z0-9-]+\.vercel\.app') |
        ForEach-Object { $_.Value }
    } |
    Select-Object -Last 1

  if (-not $previewUrl) {
    throw "Impossible de recuperer l'URL preview pour $LinkDir.`n$($output -join [Environment]::NewLine)"
  }

  return $previewUrl.TrimEnd("/")
}

if (-not $FrontendOnly) {
  $resolvedClientUrl = $FrontendUrl

  if (-not $resolvedClientUrl) {
    $resolvedClientUrl = "https://app.lokify.fr"
  }

  $backendArgs = @(
    "--env", "ALLOW_VERCEL_PREVIEW_ORIGINS=true",
    "--env", "VERCEL_FRONTEND_PROJECT_NAME=app-lokify-fr",
    "--env", "CLIENT_URL=$resolvedClientUrl",
    "--env", "PASSWORD_RESET_BASE_URL=$resolvedClientUrl/reset-password",
    "--env", "CRON_SECRET=preview-cron-secret"
  )

  $BackendUrl = Invoke-VercelPreviewDeploy -LinkDir $backendLinkDir -Arguments $backendArgs
}

if (-not $BackendOnly) {
  if (-not $BackendUrl) {
    throw "Une URL backend preview est necessaire pour deployer le frontend."
  }

  $frontendArgs = @(
    "--build-env", "NEXT_PUBLIC_API_URL=$BackendUrl/api",
    "--build-env", "API_PROXY_TARGET=$BackendUrl/api"
  )

  $FrontendUrl = Invoke-VercelPreviewDeploy -LinkDir $frontendLinkDir -Arguments $frontendArgs
}

Write-Host ""
Write-Host "Preview backend : $BackendUrl"
Write-Host "Preview frontend: $FrontendUrl"
