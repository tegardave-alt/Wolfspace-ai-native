# sync-app.ps1 — salin file pengembangan ke aplikasi Quantum yang ter-install.
# Pakai: klik kanan > Run with PowerShell, atau dari terminal:  .\sync-app.ps1
# Aplikasi yang sedang berjalan akan ditutup dulu, lalu dibuka kembali otomatis.

$ErrorActionPreference = "Stop"

$src = $PSScriptRoot
$dst = "$env:LOCALAPPDATA\Programs\Quantum\resources\app.asar.unpacked"
$exe = "$env:LOCALAPPDATA\Programs\Quantum\Quantum.exe"

if (-not (Test-Path $dst)) {
    Write-Host "Aplikasi Quantum ter-install tidak ditemukan di $dst" -ForegroundColor Red
    Write-Host "Install dulu lewat installer (npm run dist), atau jalankan versi dev: node server.cjs"
    exit 1
}

Write-Host "Menutup Quantum yang sedang berjalan..." -ForegroundColor Cyan
Get-Process -Name Quantum -ErrorAction SilentlyContinue | Stop-Process -Force
# Server asli jalan sebagai `bun server.cjs` (atau node) — proses INI yang harus di-restart,
# bukan cuma Electron. Cari via command line dan hentikan (bridge.js JANGAN disentuh).
Get-CimInstance Win32_Process -Filter "Name='bun.exe' OR Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'server\.cjs' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep 1

# Hapus cache renderer Electron — tanpa ini jendela app bisa memuat app.jsx lama
foreach ($c in @("$env:APPDATA\quantum\Cache", "$env:APPDATA\quantum\Code Cache", "$env:APPDATA\Quantum\Cache", "$env:APPDATA\Quantum\Code Cache")) {
    if (Test-Path $c) { Remove-Item $c -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Host "Menyalin file..." -ForegroundColor Cyan
Copy-Item "$src\server.cjs"  "$dst\server.cjs" -Force
Copy-Item "$src\public\*"    "$dst\public\"    -Recurse -Force
if (Test-Path "$src\config.json") { Copy-Item "$src\config.json" "$dst\config.json" -Force }
# embedded Flutter Studio (built web bundle)
if (Test-Path "$src\studio\build\web") {
    New-Item -ItemType Directory -Force "$dst\studio\build" | Out-Null
    Copy-Item "$src\studio\build\web" "$dst\studio\build\" -Recurse -Force
    Write-Host "  studio     : disalin (Flutter build web)"
}

Write-Host "Tersalin:" -ForegroundColor Green
Write-Host ("  server.cjs : " + (Get-Item "$dst\server.cjs").LastWriteTime)
Write-Host ("  app.jsx    : " + (Get-Item "$dst\public\app.jsx").LastWriteTime)
Write-Host ("  styles.css : " + (Get-Item "$dst\public\styles.css").LastWriteTime)

# Restart server Bun (backend asli di port 8090). Tanpa ini, perubahan server.cjs TIDAK termuat.
$bun = "$env:LOCALAPPDATA\Programs\Qwen\resources\bun\bun.exe"
if (Test-Path $bun) {
    Write-Host "Menjalankan ulang server (bun server.cjs)..." -ForegroundColor Cyan
    $env:ELECTRON_RUN_AS_NODE = $null
    Start-Process -FilePath $bun -ArgumentList "server.cjs" -WorkingDirectory $src -WindowStyle Hidden
    Start-Sleep 2
    try { $code = (Invoke-WebRequest "http://localhost:8090/models" -UseBasicParsing -TimeoutSec 8).StatusCode; Write-Host "  server: $code" -ForegroundColor Green }
    catch { Write-Host "  server belum merespons (cek manual)" -ForegroundColor Yellow }
} else {
    Write-Host "bun.exe tidak ditemukan — start server manual: bun server.cjs" -ForegroundColor Yellow
}

if (Test-Path $exe) {
    Write-Host "Membuka kembali Quantum..." -ForegroundColor Cyan
    # ELECTRON_RUN_AS_NODE global (dari app Qwen) membuat Electron salah mode — kosongkan dulu
    $env:ELECTRON_RUN_AS_NODE = $null
    Start-Process $exe
}

Write-Host "Selesai." -ForegroundColor Green
