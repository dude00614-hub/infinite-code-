$ErrorActionPreference = "Stop"

# Detect Visual Studio installation
$possiblePaths = @(
    "${env:ProgramFiles}\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles}\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\Professional\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\Enterprise\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\Community\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles}\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2017\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2017\Professional\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2017\Enterprise\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2017\Community\VC\Auxiliary\Build\vcvars64.bat"
)

$vcvarsPath = $null
foreach ($p in $possiblePaths) {
    if (Test-Path -LiteralPath $p) {
        $vcvarsPath = $p
        break
    }
}

if (-not $vcvarsPath) {
    Write-Host "ERROR: Visual Studio (or Build Tools) not found." -ForegroundColor Red
    Write-Host ""
    Write-Host "Install Visual Studio 2022 Build Tools from:" -ForegroundColor Yellow
    Write-Host "  https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022"
    Write-Host ""
    Write-Host "In the installer, select 'Desktop development with C++' workload."
    Write-Host ""
    Write-Host "Alternatively, install Visual Studio 2022 Community Edition from:" -ForegroundColor Yellow
    Write-Host "  https://visualstudio.microsoft.com/vs/community/"
    exit 1
}

Write-Host "Found VS environment script: $vcvarsPath" -ForegroundColor Green

# Detect WebView2 SDK include/lib paths
$webView2Paths = @(
    "packages\Microsoft.Web.WebView2",
    "${env:USERPROFILE}\.nuget\packages\microsoft.web.webview2",
    "${env:NUGET_PACKAGES}\microsoft.web.webview2"
)

$webView2Include = $null
$webView2Lib = $null

$foundPaths = @(Get-ChildItem -Path $webView2Paths -Filter "Microsoft.Web.WebView2*" -Directory -ErrorAction SilentlyContinue 2>$null)
if (-not $foundPaths) {
    # Try searching for WebView2 in common locations
    $searchPaths = @(
        "${env:ProgramFiles(x86)}\Microsoft WebView2\SDK",
        "${env:LOCALAPPDATA}\Microsoft\WebView2"
    )
    foreach ($sp in $searchPaths) {
        if (Test-Path -LiteralPath $sp) {
            $foundPaths = @(Get-ChildItem -LiteralPath $sp -Directory)
            if ($foundPaths) { break }
        }
    }
}

if ($foundPaths) {
    $sdkRoot = $foundPaths[0].FullName
    $includeCandidate = Join-Path -Path $sdkRoot -ChildPath "build\native\include"
    $libCandidate = Join-Path -Path $sdkRoot -ChildPath "build\native\lib\Win10\x64"

    if (Test-Path -LiteralPath $includeCandidate) {
        $webView2Include = $includeCandidate
    } elseif (Test-Path -LiteralPath (Join-Path -Path $sdkRoot -ChildPath "include")) {
        $webView2Include = Join-Path -Path $sdkRoot -ChildPath "include"
        $libCandidate = Join-Path -Path $sdkRoot -ChildPath "lib\x64"
    }

    if (Test-Path -LiteralPath $libCandidate) {
        $webView2Lib = $libCandidate
    }

    if ($webView2Include) {
        Write-Host "Found WebView2 SDK at: $sdkRoot" -ForegroundColor Green
    }
}

if (-not $webView2Include) {
    Write-Host "WARNING: WebView2 SDK not found in common locations." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Download the WebView2 SDK NuGet package manually:" -ForegroundColor Yellow
    Write-Host "  1. Go to https://www.nuget.org/packages/Microsoft.Web.WebView2/"
    Write-Host "  2. Download the package (or run: nuget install Microsoft.Web.WebView2)"
    Write-Host "  3. Extract the .nupkg (it's a .zip file) and note the include/lib paths"
    Write-Host ""
    Write-Host "Then edit this script to set `$webView2Include` and `$webView2Lib` manually."
    exit 1
}

# Set up MSVC environment
$vcvarsContent = @"
call "$vcvarsPath" x64
set INCLUDE=%INCLUDE%;$webView2Include
set LIB=%LIB%;$webView2Lib
cl main.cpp /EHsc /Fe:infinite-code.exe /I"$webView2Include" /link "$webView2Lib\WebView2StaticLib1.lib" user32.lib ole32.lib
"@

$batFile = Join-Path -Path $PSScriptRoot -ChildPath "_build_temp.bat"
Set-Content -Path $batFile -Value $vcvarsContent -Encoding ASCII

try {
    Write-Host "Building infinite-code.exe..." -ForegroundColor Cyan
    $output = cmd /c "`"$batFile`" 2>&1"
    Write-Host $output
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        Write-Host "ERROR: Build failed with exit code $exitCode" -ForegroundColor Red
        exit $exitCode
    }
    Write-Host ""
    Write-Host "SUCCESS: infinite-code.exe built!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  - Ensure WebView2Loader.dll is in the same directory as infinite-code.exe"
    Write-Host "    (it comes with the WebView2 Runtime or can be copied from the SDK)"
    Write-Host "  - Run: .\infinite-code.exe"
}
finally {
    if (Test-Path -LiteralPath $batFile) {
        Remove-Item -LiteralPath $batFile -Force
    }
}
