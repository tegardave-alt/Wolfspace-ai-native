# WOLFSPACE launcher (Windows): starts local model servers (if any) + the web server.
# Portable: picks bun or node from PATH; only adds toolchain dirs that actually exist.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$cfg  = Get-Content (Join-Path $root 'config.json') -Raw | ConvertFrom-Json
$dir  = $cfg.modelDir
$serverExe = $null
if ($dir) { $serverExe = Join-Path $dir 'llama-server.exe' }

# 1) Local model servers (llama.cpp). Skipped entirely if llama-server is not present.
if ($serverExe -and (Test-Path $serverExe)) {
  foreach ($m in $cfg.models) {
    $path = Join-Path $dir $m.file
    if (-not (Test-Path $path)) { Write-Host "[skip] $($m.name): model file not found" -ForegroundColor DarkGray; continue }
    $up = $false
    try { $up = (Invoke-WebRequest "http://127.0.0.1:$($m.port)/health" -TimeoutSec 2 -UseBasicParsing).StatusCode -eq 200 } catch {}
    if ($up) { Write-Host "[ok] $($m.name) already running on :$($m.port)" -ForegroundColor Green; continue }
    Start-Process -FilePath $serverExe -WindowStyle Hidden -ArgumentList @(
      '-m', $path, '--host', '127.0.0.1', '--port', "$($m.port)", '--ctx-size', "$($cfg.llama.ctxSize)", '--threads', "$($cfg.llama.threads)", '--mlock'
    )
    Write-Host "[start] $($m.name) -> http://127.0.0.1:$($m.port)" -ForegroundColor Cyan
  }
} else {
  Write-Host "[info] llama-server not found in modelDir; local models skipped. Cloud models still work." -ForegroundColor DarkGray
}

# 2) Optional language toolchains: prepend only the dirs that exist on THIS machine.
$maybeTools = @(
  "$env:APPDATA\uv\python\cpython-3.12.10-windows-x86_64-none",
  'C:\langs\mingw64\bin', 'C:\langs\go\bin', 'C:\langs\jdk-21.0.11+10\bin',
  'C:\langs\php', 'C:\langs\kotlinc\bin', "$env:USERPROFILE\.cargo\bin"
)
$tools = $maybeTools | Where-Object { Test-Path $_ }
if ($tools) { $env:PATH = ($tools -join ';') + ';' + $env:PATH }

# 3) Web server: prefer bun, then node, then a bundled bun fallback.
$runtime = $null
foreach ($c in @('bun', 'node')) {
  $cmd = Get-Command $c -ErrorAction SilentlyContinue
  if ($cmd) { $runtime = $cmd.Source; break }
}
if (-not $runtime) {
  $bundled = "$env:LOCALAPPDATA\Programs\Qwen\resources\bun\bun.exe"
  if (Test-Path $bundled) { $runtime = $bundled }
}
if (-not $runtime) { Write-Host "ERROR: install Node.js (https://nodejs.org) or Bun first." -ForegroundColor Red; exit 1 }

Start-Sleep -Seconds 2
# 3b) Bersihkan proses server.cjs lama sebelum spawn baru.
#     Tanpa ini, setiap restart menambah proses baru tanpa mematikan yang lama.
$oldServers = Get-WmiObject Win32_Process -Filter "name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match [regex]::Escape($root) -and $_.CommandLine -match 'server\.cjs' }
if ($oldServers) {
  Write-Host "[cleanup] Menghentikan $($oldServers.Count) proses server.cjs lama..." -ForegroundColor Yellow
  $oldServers | ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
  }
  Start-Sleep -Milliseconds 500
}

Start-Process -FilePath $runtime -ArgumentList 'server.cjs' -WorkingDirectory $root -WindowStyle Hidden
$port = 8090
if ($cfg.server.port) { $port = $cfg.server.port }
Write-Host ""
Write-Host "WOLFSPACE -> http://127.0.0.1:$port  (runtime: $(Split-Path $runtime -Leaf))" -ForegroundColor Green
Write-Host "Stop everything:  Get-Process llama-server,bun,node | Stop-Process -Force" -ForegroundColor DarkGray

