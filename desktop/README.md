# Infinite Code - Desktop App

A Win32 desktop wrapper for [Infinite Code](https://dude00614-hub.github.io/infinite-code-/) using Microsoft Edge WebView2.

## Prerequisites

- **Visual Studio Build Tools 2022** (or Visual Studio 2022 Community/Professional/Enterprise)
  - Workload: "Desktop development with C++"
  - Download: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
- **WebView2 Runtime** (usually pre-installed on Windows 10/11)
  - If missing: https://developer.microsoft.com/en-us/microsoft-edge/webview2/
- **WebView2 SDK** (headers and lib)
  - Install via NuGet: `nuget install Microsoft.Web.WebView2 -ExcludeVersion`
  - Or download from: https://www.nuget.org/packages/Microsoft.Web.WebView2/

## Build

Run from PowerShell in the `desktop` directory:

```powershell
.\build.ps1
```

The script detects Visual Studio, finds the WebView2 SDK, and compiles `main.cpp` into `infinite-code.exe`.

### Manual build (if script fails)

Open a **x64 Native Tools Command Prompt for VS 2022** and run:

```cmd
cl main.cpp /EHsc /I"path\to\webview2\include" /Fe:infinite-code.exe /link "path\to\webview2\lib\x64\WebView2StaticLib1.lib" user32.lib ole32.lib
```

## Run

```cmd
.\infinite-code.exe
```

The app creates a `data\` folder next to the EXE for WebView2 user data (localStorage, cookies, etc.).

## Notes

- The app requires `WebView2Loader.dll` to be in the same directory as the EXE. The build tools include it, or it ships with the WebView2 Runtime.
- Window size: 1200x800, centered on screen.
- DevTools and context menus are disabled.
