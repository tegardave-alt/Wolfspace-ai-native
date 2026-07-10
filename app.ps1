# Launch WOLFSPACE as a native desktop app (Electron).
# Clears ELECTRON_RUN_AS_NODE (set globally on some machines) so Electron starts
# in app mode, not as plain Node.
$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electron)) {
  Write-Host "Electron not installed. Run:  bun install   (or npm install)" -ForegroundColor Yellow
  exit 1
}
Start-Process -FilePath $electron -ArgumentList 'electron/main.js' -WorkingDirectory $root

