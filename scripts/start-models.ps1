# WOLFSPACE -- launch each model in config.json on its own port (Windows)
$ErrorActionPreference = 'Stop'
$cfg = Get-Content (Join-Path $PSScriptRoot '..\config.json') -Raw | ConvertFrom-Json
$dir = $cfg.modelDir
$serverExe = Join-Path $dir 'llama-server.exe'
$threads = $cfg.llama.threads
$ctx = $cfg.llama.ctxSize

if (-not (Test-Path $serverExe)) {
    Write-Host "llama-server.exe missing. Run: powershell scripts/setup.ps1" -ForegroundColor Red; exit 1
}
foreach ($m in $cfg.models) {
    $path = Join-Path $dir $m.file
    if (-not (Test-Path $path)) { Write-Host "[skip] $($m.name): not downloaded" -ForegroundColor DarkGray; continue }
    $up = $false
    try { $up = (Invoke-WebRequest "http://127.0.0.1:$($m.port)/health" -TimeoutSec 2 -UseBasicParsing).StatusCode -eq 200 } catch {}
    if ($up) { Write-Host "[ok] $($m.name) already on :$($m.port)" -ForegroundColor Green; continue }
    Start-Process -FilePath $serverExe -WindowStyle Hidden -ArgumentList @(
        '-m', $path, '--host', '127.0.0.1', '--port', "$($m.port)", '--ctx-size', "$ctx", '--threads', "$threads", '--mlock'
    )
    Write-Host "[start] $($m.name) -> http://127.0.0.1:$($m.port)" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "Models starting (give them a few seconds). Then:  npm start" -ForegroundColor White
Write-Host "Stop all:  Get-Process llama-server | Stop-Process -Force" -ForegroundColor DarkGray

