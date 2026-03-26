Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Path $PSScriptRoot -Parent
$desktopPath = [Environment]::GetFolderPath("Desktop")
$iconPath = Join-Path $projectRoot "electron\lokify.ico"
$shell = New-Object -ComObject WScript.Shell

$shortcuts = @(
  [PSCustomObject]@{
    ShortcutPath = Join-Path $desktopPath "APP.LOKIFY.lnk"
    TargetPath = Join-Path $projectRoot "Lokify-App.cmd"
    Description = "Lancer APP.LOKIFY"
  },
  [PSCustomObject]@{
    ShortcutPath = Join-Path $desktopPath "Arreter APP.LOKIFY.lnk"
    TargetPath = Join-Path $projectRoot "Stop-Lokify.cmd"
    Description = "Arreter APP.LOKIFY"
  }
)

foreach ($shortcutConfig in $shortcuts) {
  $shortcut = $shell.CreateShortcut($shortcutConfig.ShortcutPath)
  $shortcut.TargetPath = $shortcutConfig.TargetPath
  $shortcut.WorkingDirectory = $projectRoot
  $shortcut.Description = $shortcutConfig.Description

  if (Test-Path $iconPath) {
    $shortcut.IconLocation = $iconPath
  }

  $shortcut.Save()
}
