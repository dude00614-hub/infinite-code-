# Infinite Code - One-Click Installer
# Creates a desktop shortcut to the app launcher.
# No Visual Studio, no compilation needed.

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcherPath = Join-Path $scriptDir "desktop\infinite-code.ps1"

if (-not (Test-Path $launcherPath)) {
    Write-Host "ERROR: Launcher not found at $launcherPath" -ForegroundColor Red
    exit 1
}

$shortcutPath = Join-Path $env:USERPROFILE "Desktop\Infinite Code.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$launcherPath`""
$shortcut.WorkingDirectory = (Split-Path $launcherPath -Parent)
$shortcut.Description = "Infinite Code Desktop App"
$shortcut.Save()

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Infinite Code - Installed!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "A shortcut 'Infinite Code' has been created on your desktop." -ForegroundColor Green
Write-Host ""
Write-Host "Double-click it to launch the app." -ForegroundColor White
Write-Host "On first run, it will download WebView2 DLLs automatically." -ForegroundColor Yellow
Write-Host ""
Write-Host "Requirements:" -ForegroundColor Cyan
Write-Host "  - Windows 10 or later" -ForegroundColor Gray
Write-Host "  - Internet connection (first run only)" -ForegroundColor Gray
Write-Host "  - PowerShell (pre-installed)" -ForegroundColor Gray
