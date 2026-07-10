# WOLFSPACE setup (Windows) -- downloads llama.cpp (CPU) + the models in config.json
$ErrorActionPreference = 'Stop'
$cfg = Get-Content (Join-Path $PSScriptRoot '..\config.json') -Raw | ConvertFrom-Json
$dir = $cfg.modelDir
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$curl = (Get-Command curl.exe -ErrorAction SilentlyContinue).Source
$serverExe = Join-Path $dir 'llama-server.exe'

# llama-server.exe (CPU / AVX2 build). Update the b#### tag if the URL 404s.
if (-not (Test-Path $serverExe)) {
    Write-Host "[download] llama.cpp (CPU build)..." -ForegroundColor Cyan
    $zip = Join-Path $env:TEMP 'llama-cpp.zip'
    $url = 'https://github.com/ggml-org/llama.cpp/releases/download/b4400/llama-b4400-bin-win-avx2-x64.zip'
    if ($curl) { & $curl -L --fail -o $zip $url } else { Invoke-WebRequest $url -OutFile $zip }
    Expand-Archive -Path $zip -DestinationPath $dir -Force; Remove-Item $zip -Force
    if (-not (Test-Path $serverExe)) {
        $f = Get-ChildItem $dir -Recurse -Filter 'llama-server.exe' | Select-Object -First 1
        if ($f) { Copy-Item $f.FullName $serverExe -Force }
    }
    if (Test-Path $serverExe) { Write-Host "[ok] llama-server.exe" -ForegroundColor Green }
    else { Write-Host "[warn] put llama-server.exe in $dir manually (github.com/ggml-org/llama.cpp/releases)" -ForegroundColor Yellow }
}

# models (resumable via curl -C -)
foreach ($m in $cfg.models) {
    $path = Join-Path $dir $m.file
    if ((Test-Path $path) -and ((Get-Item $path).Length -gt 100MB)) { Write-Host "[skip] $($m.file)" -ForegroundColor DarkGray; continue }
    Write-Host "[download] $($m.file) ..." -ForegroundColor Cyan
    if ($curl) { & $curl -L --fail -C - --retry 10 --no-progress-meter -o $path $m.url }
    else { (New-Object System.Net.WebClient).DownloadFile($m.url, $path) }
}

Write-Host ""
Write-Host "Setup done. Next:" -ForegroundColor Cyan
Write-Host "  powershell scripts/start-models.ps1   # launch the model servers" -ForegroundColor White
Write-Host "  npm start                             # launch WOLFSPACE (http://127.0.0.1:8090)" -ForegroundColor White

