# Build the WOLFSPACE execution sandbox image.
# Prereq: Docker Desktop installed and running.
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
Write-Host "Building WOLFSPACE-sandbox image..." -ForegroundColor Cyan
docker build -t WOLFSPACE-sandbox "$here"
Write-Host ""
Write-Host "Done. Enable it by adding to config.json:  `"sandbox`": true" -ForegroundColor Green
Write-Host "Then restart WOLFSPACE. Python/JS code will run isolated in containers." -ForegroundColor DarkGray

