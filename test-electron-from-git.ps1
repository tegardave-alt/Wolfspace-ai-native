param(
  [string]$Branch = "main",
  [switch]$PullOnly,
  [switch]$SkipElectronStart
)

$ErrorActionPreference = 'Stop'

function Stop-QuantumElectron {
  # Tries to stop any running Electron/Quantum processes.
  # Not perfect, but safe for dev/testing.
  $candidates = @(
    "Quantum*",
    "*Quantum*",
    "electron.exe",
    "Electron Helper*",
    "App*"
  )

  # Try to stop by name patterns (best effort)
  foreach ($pat in $candidates) {
    try {
      Get-Process | Where-Object { $_.ProcessName -like ($pat -replace "\*", "*") } | ForEach-Object {
        try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
      }
    } catch {}
  }

  # Also kill node servers bound to 8090 (optional but avoids port collisions)
  try {
    $conns = Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
      $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
      foreach ($pid in $pids) {
        try { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue } catch {}
      }
    }
  } catch {}
}

Write-Host "==> Checkout branch: $Branch"
& git checkout $Branch

Write-Host "==> Pull latest"
& git pull

if ($PullOnly) {
  Write-Host "--PullOnly: skip sync and app start."
  exit 0
}

Write-Host "==> Stop running Electron/servers (best effort)"
Stop-QuantumElectron

Write-Host "==> Sync app snapshot to Electron resources"
& "./sync-app.ps1"

if ($SkipElectronStart) {
  Write-Host "--SkipElectronStart: done."
  exit 0
}

Write-Host "==> Start Electron"
& npm run app

