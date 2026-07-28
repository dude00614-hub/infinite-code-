$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dllCore = Join-Path $scriptDir "Microsoft.Web.WebView2.Core.dll"
$dllWinForms = Join-Path $scriptDir "Microsoft.Web.WebView2.WinForms.dll"
$dataDir = Join-Path $scriptDir "data"

# Auto-download WebView2 DLLs on first run
if (-not (Test-Path $dllCore) -or -not (Test-Path $dllWinForms)) {
    Write-Host "First run: downloading WebView2 SDK..." -ForegroundColor Cyan
    $nupkg = "$env:TEMP\Microsoft.Web.WebView2.nupkg"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $index = Invoke-RestMethod -Uri "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/index.json"
        $lastVer = $index.versions[-1]
        Invoke-WebRequest -Uri "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$lastVer/microsoft.web.webview2.$lastVer.nupkg" -OutFile $nupkg
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [System.IO.Compression.ZipFile]::OpenRead($nupkg)
        $extract = "$env:TEMP\webview2_dlls"
        if (Test-Path $extract) { Remove-Item -Recurse -Force $extract }
        New-Item -ItemType Directory -Path $extract -Force | Out-Null
        foreach ($e in $zip.Entries | Where-Object { $_.FullName -like "lib/net4.6.2/*.dll" }) {
            $tp = Join-Path $extract (Split-Path $e.FullName -Leaf)
            if ($tp -and $tp.Trim() -and -not $tp.EndsWith("\")) {
                try { [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, $tp, $true) } catch {}
            }
        }
        $zip.Dispose()
        $c = Get-ChildItem $extract -Filter "Microsoft.Web.WebView2.Core.dll" | Select-Object -First 1
        $w = Get-ChildItem $extract -Filter "Microsoft.Web.WebView2.WinForms.dll" | Select-Object -First 1
        if ($c -and $w) { Copy-Item $c.FullName $dllCore; Copy-Item $w.FullName $dllWinForms }
        Remove-Item -Recurse -Force $extract -ErrorAction SilentlyContinue
        Remove-Item $nupkg -ErrorAction SilentlyContinue
    } catch {
        Write-Host "Failed to download WebView2 SDK. Check internet." -ForegroundColor Red
        Write-Host "Fallback: Opening in Edge app mode instead." -ForegroundColor Yellow
        Start-Process "msedge.exe" -ArgumentList "--app=https://dude00614-hub.github.io/infinite-code-/"
        exit
    }
}

# Load WebView2 assemblies
Add-Type -Path $dllCore
Add-Type -Path $dllWinForms

# Create the window
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.Text = "Infinite Code"
$form.Size = New-Object System.Drawing.Size(1200, 800)
$form.StartPosition = "CenterScreen"
$form.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon("powershell.exe")

$webview = New-Object Microsoft.Web.WebView2.WinForms.WebView2
$webview.Dock = "Fill"
$form.Controls.Add($webview)

# Initialize with custom data folder
$envTask = $webview.EnsureCoreWebView2Async($scriptDir)
$webview.CoreWebView2InitializationCompleted = {
    $webview.CoreWebView2.Settings.AreDevToolsEnabled = $false
    $webview.CoreWebView2.Settings.AreDefaultContextMenusEnabled = $false
    $webview.CoreWebView2.Navigate("https://dude00614-hub.github.io/infinite-code-/")
}

$form.Add_Shown({ $form.Activate() })
[System.Windows.Forms.Application]::Run($form)
