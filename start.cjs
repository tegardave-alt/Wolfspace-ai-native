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

function startMainServer() {
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.cjs')], {
    env: {
      ...process.env,
      PORT: String(MAIN_PORT),
      MAIN_PORT: String(MAIN_PORT),
      STATIC_PORT: String(STATIC_PORT),
    },
    stdio: 'pipe',
    cwd: ROOT,
  });

  srv.stdout.on('data', (d) => process.stdout.write('[main] ' + d));
  srv.stderr.on('data', (d) => process.stderr.write('[main] ' + d));

  srv.on('exit', (code, sig) => {
    console.error(`\n  ⚠ Main server berhenti (kode ${code}, signal ${sig})`);
    console.error(`  ✓ Bypass lane MASIH AKTIF di http://localhost:${STATIC_PORT}`);
    // Auto-restart after 1 second (unless we're shutting down)
    if (!_shuttingDown) {
      console.error(`  🔄 Restart dalam 1 detik...\n`);
      setTimeout(startMainServer, 1000);
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

