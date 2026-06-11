# Quantum app launcher: starts the server (if needed), waits until ready,
# then opens Quantum in a clean app window (no browser tabs/URL bar).
$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot
$port = 8090
$url  = "http://127.0.0.1:$port/"

# 1) Start the server + local models (start.ps1 is idempotent: it skips what's already up)
& (Join-Path $root 'start.ps1') | Out-Null

# 2) Wait until the web server answers (max ~15s)
for ($i = 0; $i -lt 30; $i++) {
  try { if ((Invoke-WebRequest $url -TimeoutSec 2 -UseBasicParsing).StatusCode -eq 200) { break } } catch {}
  Start-Sleep -Milliseconds 500
}

# 3) Open in an app window (Edge or Chrome --app); fall back to the default browser
$browsers = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)
$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($browser) {
  Start-Process $browser -ArgumentList "--app=$url", "--window-size=1200,820"
} else {
  Start-Process $url
}
