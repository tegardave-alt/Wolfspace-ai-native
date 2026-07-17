// start.cjs — WOLFSPACE launcher with bypass lane
// Starts the static file server (bypass lane) and the main server side by side.
// The static server serves public/ files directly from disk — INDEPENDENT of server.cjs.
// If server.cjs crashes, the frontend remains accessible through the bypass lane.
//
// Usage: node start.cjs
//   or:  STATIC_PORT=8090 MAIN_PORT=8092 node start.cjs

const { fork, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const STATIC_PORT = parseInt(process.env.STATIC_PORT, 10) || 8090;
const MAIN_PORT = parseInt(process.env.MAIN_PORT, 10) || 8092;

console.log(`\n  ⚡ WOLFSPACE — Bypass Lane Mode
  ─────────────────────────────
  Frontend  →  http://localhost:${STATIC_PORT}  (bypass lane — statis)
  API       →  http://localhost:${MAIN_PORT}    (server.cjs)
  (Frontend tetap hidup meski server.cjs crash)\n`);

// ── 1. Fork the static server (bypass lane) ──
const staticServerPath = path.join(ROOT, 'server', 'static-server.cjs');
const staticServer = fork(staticServerPath, [String(STATIC_PORT)], {
  env: { ...process.env, MAIN_PORT: String(MAIN_PORT), STATIC_PORT: String(STATIC_PORT) },
  stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  cwd: ROOT,
});

staticServer.on('message', (msg) => {
  if (msg.type === 'static-ready') {
    console.log(`  ✓ Bypass lane aktif di port ${msg.port}\n`);
  }
});
staticServer.stdout.on('data', (d) => process.stdout.write('[static] ' + d));
staticServer.stderr.on('data', (d) => process.stderr.write('[static] ' + d));
staticServer.on('exit', (code) => {
  console.error(`\n  ✗ Bypass lane berhenti (kode ${code})\n`);
});

// ── 2. Start the main server (server.cjs) as a child process ──
//    We set PORT env so server.cjs listens on MAIN_PORT
let mainServer = null;
let serverStartTime = 0;
let lockInTimer = null;
let crashStreak = 0; // crash beruntun dengan uptime pendek → backoff eksponensial

const SERVER_FILE = path.join(ROOT, 'server.cjs');
const BACKUP_FILE = path.join(ROOT, '.server_last_good.cjs');

function startMainServer() {
  serverStartTime = Date.now();
  const srv = spawn(process.execPath, [SERVER_FILE], {
    env: {
      ...process.env,
      PORT: String(MAIN_PORT),
      MAIN_PORT: String(MAIN_PORT),
      STATIC_PORT: String(STATIC_PORT),
    },
    stdio: 'pipe',
    cwd: ROOT,
  });

  // Lock-in Timer: If server survives for 3 seconds, save it as the last known good version
  clearTimeout(lockInTimer);
  lockInTimer = setTimeout(() => {
    if (srv.exitCode === null) {
      try {
        fs.copyFileSync(SERVER_FILE, BACKUP_FILE);
        console.log(`\n  ✅ [Auto-Rollback] Versi server.cjs saat ini sehat. Dikunci sebagai versi Aman.`);
      } catch (e) {
        console.error(`\n  ⚠ Gagal mengunci versi Aman:`, e.message);
      }
    }
  }, 3000);

  srv.stdout.on('data', (d) => process.stdout.write('[main] ' + d));
  srv.stderr.on('data', (d) => process.stderr.write('[main] ' + d));

  srv.on('exit', (code, sig) => {
    clearTimeout(lockInTimer);
    const uptime = Date.now() - serverStartTime;
    console.error(`\n  ⚠ Main server berhenti (kode ${code}, signal ${sig})`);
    
    // Auto-Rollback Logic
    if (code !== 0 && code !== null) {
      console.error(`  💥 SERVER CRASH DETECTED! (Uptime: ${uptime}ms)`);
      if (fs.existsSync(BACKUP_FILE)) {
        console.error(`  🔄 Memulai Auto-Rollback: Memulihkan server.cjs dari versi Aman...`);
        try {
          fs.copyFileSync(BACKUP_FILE, SERVER_FILE);
          console.error(`  ✅ Pemulihan berhasil. Layanan akan dilanjutkan dengan versi Aman.`);
        } catch (err) {
          console.error(`  ❌ Gagal menimpa file:`, err.message);
        }
      } else {
        console.error(`  ❌ Auto-Rollback Gagal: File cadangan (.server_last_good.cjs) tidak ditemukan.`);
      }
    }

    console.error(`  ✓ Bypass lane MASIH AKTIF di http://localhost:${STATIC_PORT}`);
    // Auto-restart dengan backoff eksponensial (unless we're shutting down).
    // Uptime > 10 detik dianggap sehat → streak direset ke 0.
    // Crash beruntun (mis. versi cadangan pun crash karena config.json rusak):
    // 1s → 2s → 4s → 8s → 16s → maks 30s, agar log tidak banjir dan penyebab terlihat.
    if (!_shuttingDown) {
      crashStreak = uptime > 10000 ? 0 : crashStreak + 1;
      const delay = Math.min(1000 * Math.pow(2, crashStreak), 30000);
      if (crashStreak >= 3) {
        console.error(`  🚨 ${crashStreak} crash beruntun — kemungkinan penyebabnya BUKAN server.cjs (cek config.json / dependensi).`);
      }
      console.error(`  🔄 Restart dalam ${delay / 1000} detik...\n`);
      setTimeout(startMainServer, delay);
    }
  });

  mainServer = srv;
  return srv;
}

// Track shutdown state to prevent auto-restart during intentional shutdown
let _shuttingDown = false;

// ── Graceful shutdown ──
function shutdown() {
  _shuttingDown = true;
  console.log('\n  Menghentikan semua proses...');
  if (mainServer) mainServer.kill('SIGTERM');
  staticServer.kill('SIGTERM');
  setTimeout(() => process.exit(0), 1000);
}

startMainServer();
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);

// Prevent uncaught exceptions in this launcher from killing everything
process.on('uncaughtException', (err) => {
  console.error('[start] Uncaught exception:', err.message);
  // Don't exit — let the child processes continue
});

