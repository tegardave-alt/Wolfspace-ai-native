// Quantum desktop app (Electron): launches the backend + local models, then
// opens a native window. Spawns the server as a SEPARATE process so the
// executor's process.execPath stays a real JS runtime (bun/node), not electron.
const { app, BrowserWindow, shell } = require('electron');
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8090;
const procs = [];

function findRuntime() {
  for (const c of ['bun', 'node']) {
    try {
      const p = execSync((process.platform === 'win32' ? 'where ' : 'which ') + c, { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
      if (p && fs.existsSync(p)) return p;
    } catch (e) {}
  }
  const bundled = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Qwen', 'resources', 'bun', 'bun.exe');
  if (fs.existsSync(bundled)) return bundled;
  return 'node';
}

function toolchainPath() {
  const maybe = [
    path.join(process.env.APPDATA || '', 'uv', 'python', 'cpython-3.12.10-windows-x86_64-none'),
    'C:/langs/mingw64/bin', 'C:/langs/go/bin', 'C:/langs/jdk-21.0.11+10/bin',
    'C:/langs/php', 'C:/langs/kotlinc/bin', path.join(process.env.USERPROFILE || '', '.cargo', 'bin'),
  ].filter(d => { try { return fs.existsSync(d); } catch (e) { return false; } });
  return maybe.join(path.delimiter);
}

function startBackend() {
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')); } catch (e) {}
  const env = { ...process.env, PATH: toolchainPath() + path.delimiter + (process.env.PATH || '') };

  // Local model servers (llama.cpp) — only if present
  const dir = cfg.modelDir;
  const exe = dir ? path.join(dir, 'llama-server.exe') : null;
  if (exe && fs.existsSync(exe)) {
    for (const m of (cfg.models || [])) {
      const mp = path.join(dir, m.file || '');
      if (m.file && fs.existsSync(mp)) {
        procs.push(spawn(exe, ['-m', mp, '--host', '127.0.0.1', '--port', String(m.port),
          '--ctx-size', String((cfg.llama && cfg.llama.ctxSize) || 2048),
          '--threads', String((cfg.llama && cfg.llama.threads) || 2), '--mlock'],
          { cwd: dir, stdio: 'ignore', env }));
      }
    }
  }
  // Web server (separate process, real JS runtime)
  procs.push(spawn(findRuntime(), ['server.cjs'], { cwd: ROOT, stdio: 'ignore', env }));
}

function waitReady(cb, tries = 60) {
  const ping = () => http.get({ host: '127.0.0.1', port: PORT, path: '/', timeout: 1500 }, r => { r.resume(); cb(); })
    .on('error', () => { if (--tries <= 0) cb(); else setTimeout(ping, 500); });
  ping();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 820, minWidth: 720, minHeight: 520,
    backgroundColor: '#0b0d11', title: 'Quantum', autoHideMenuBar: true,
  });
  win.loadURL('http://127.0.0.1:' + PORT + '/');
  // open real external links in the system browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => { startBackend(); waitReady(createWindow); });
app.on('window-all-closed', () => { for (const p of procs) { try { p.kill(); } catch (e) {} } app.quit(); });
