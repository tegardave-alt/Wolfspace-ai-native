# Quantum - jalankan model server + web server sekaligus (Windows, pakai Bun)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$cfg = Get-Content (Join-Path $root 'config.json') -Raw | ConvertFrom-Json
$dir = $cfg.modelDir
$serverExe = Join-Path $dir 'llama-server.exe'
$bun = "C:\Users\dave\AppData\Local\Programs\Qwen\resources\bun\bun.exe"

# 1) Model server (llama.cpp) untuk tiap model di config
foreach ($m in $cfg.models) {
    $path = Join-Path $dir $m.file
    if (-not (Test-Path $path)) { Write-Host "[skip] $($m.name): model belum diunduh" -ForegroundColor DarkGray; continue }
    $up = $false
    try { $up = (Invoke-WebRequest "http://127.0.0.1:$($m.port)/health" -TimeoutSec 2 -UseBasicParsing).StatusCode -eq 200 } catch {}
    if ($up) { Write-Host "[ok] $($m.name) sudah jalan di :$($m.port)" -ForegroundColor Green; continue }
    Start-Process -FilePath $serverExe -WindowStyle Hidden -ArgumentList @(
        '-m', $path, '--host', '127.0.0.1', '--port', "$($m.port)", '--ctx-size', "$($cfg.llama.ctxSize)", '--threads', "$($cfg.llama.threads)", '--mlock'
    )
    Write-Host "[start] $($m.name) -> http://127.0.0.1:$($m.port)" -ForegroundColor Cyan
}

# 2) Quantum web server (Bun, pengganti Node)
# Tambahkan semua toolchain ke PATH agar server.cjs bisa memanggil 'python' dll.
# (uv python diutamakan sebelum stub WindowsApps)
$toolDirs = @(
    'C:\Users\dave\AppData\Roaming\uv\python\cpython-3.12.10-windows-x86_64-none',  # python
    'C:\langs\mingw64\bin',                                                          # gcc/g++ (+ linker Rust)
    'C:\langs\go\bin',                                                               # go
    'C:\langs\jdk-21.0.11+10\bin',                                                   # java/javac
    'C:\langs\php',                                                                  # php
    'C:\langs\kotlinc\bin',                                                          # kotlinc
    'C:\Users\dave\.cargo\bin'                                                       # rustc/cargo
)
$env:PATH = ($toolDirs -join ';') + ';' + $env:PATH
Start-Sleep -Seconds 2
Start-Process -FilePath $bun -ArgumentList 'server.fullaccess.cjs' -WorkingDirectory $root -WindowStyle Hidden
Write-Host ""
Write-Host "Quantum -> http://127.0.0.1:$($cfg.server.port)" -ForegroundColor Green
Write-Host "Model perlu ~20-30 detik untuk siap. Stop semua:  Get-Process llama-server,bun | Stop-Process -Force" -ForegroundColor DarkGray
