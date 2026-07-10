// WOLFSPACE desktop app (Electron): launches the backend + local models, then
// opens a native window. Spawns the server as a SEPARATE process so the
// executor's process.execPath stays a real JS runtime (bun/node), not electron.
const { app, BrowserWindow, shell, ipcMain, protocol } = require('electron');
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8090;
const procs = [];

// Custom app:// scheme serves the UI + studio from disk (no HTTP needed to LOAD
// the app). Must be declared privileged BEFORE app is ready. See docs/A2UI-DESIGN.md.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

// SINGLE SOURCE: run everything from one folder. Prefer the working folder
// C:\Users\dave\WOLFSPACE (so edits there are live with no sync/copy); fall back to
// the packaged app.asar.unpacked if it's ever absent.
function unpackedRoot() {
  const dev = 'C:\\Users\\dave\\WOLFSPACE';
  try { if (fs.existsSync(path.join(dev, 'server.cjs'))) return dev; } catch (e) {}
  return app.isPackaged ? ROOT.replace('app.asar', 'app.asar.unpacked') : ROOT;
}

const _MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.jsx':'text/javascript',
  '.css':'text/css', '.json':'application/json', '.wasm':'application/wasm', '.png':'image/png', '.jpg':'image/jpeg',
  '.svg':'image/svg+xml', '.ico':'image/x-icon', '.woff2':'font/woff2', '.ttf':'font/ttf', '.otf':'font/otf', '.map':'application/json' };

function registerAppProtocol() {
  const pubDir = path.join(unpackedRoot(), 'public');
  const studioDir = path.join(unpackedRoot(), 'studio', 'build', 'web');
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);            // app://WOLFSPACE/<path>
      let p = decodeURIComponent(url.pathname || '/');
      let base = pubDir, rel = p;
      if (p === '/' || p === '') rel = '/index.html';
      else if (p === '/studio' || p === '/studio/') { base = studioDir; rel = '/index.html'; }
      else if (p.startsWith('/studio/')) { base = studioDir; rel = p.slice('/studio'.length); }
      const fp = path.normalize(path.join(base, rel));
      if (!fp.startsWith(base)) return new Response('forbidden', { status: 403 });
      const data = await fs.promises.readFile(fp);
      const ext = path.extname(fp).toLowerCase();
      const immutable = /\/(vendor|canvaskit|assets)\//.test(p) || ['.woff2','.ttf','.otf','.wasm'].includes(ext);
      return new Response(data, { status: 200, headers: {
        'content-type': _MIME[ext] || 'application/octet-stream',
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
      } });
    } catch (e) { return new Response('not found: ' + (e && e.message), { status: 404 }); }
  });
}

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
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(unpackedRoot(), 'config.json'), 'utf8')); } catch (e) {}
  const env = { ...process.env, PATH: toolchainPath() + path.delimiter + (process.env.PATH || '') };

  // Local model servers (llama.cpp) â€” only if present
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
  // NO web server anymore: the backend logic runs IN-PROCESS via core.js, reached
  // by the renderer through Electron IPC (see registerIpc). Zero open ports.
}

// OBSOLETE: In Electron mode, server runs in-process via core.js IPC, no HTTP port.
// This function was used for web-server startup detection and is no longer needed.
function waitReady(cb, tries = 60) {
  // No-op: IPC-based backend is ready immediately after core() initialization.
  cb();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 820, minWidth: 720, minHeight: 520,
    backgroundColor: '#0b0d11', title: 'WOLFSPACE', autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'public', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL('app://WOLFSPACE/index.html');   // served from disk via the app:// protocol
  // open real external links in the system browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

// â”€â”€ IPC: renderer â†” Node core, no HTTP (see docs/A2UI-DESIGN.md step 2) â”€â”€
let _core = null;
function core() {
  if (_core) return _core;
  _core = require(path.join(unpackedRoot(), 'core.js'));   // single source; requiring does NOT open a port
  return _core;
}
const _streams = new Map();   // id -> { cancelled, req }

// Run a non-streaming HTTP endpoint IN-PROCESS via mock req/res against core's
// request handler â€” reuses every existing JSON handler without extracting them,
// so the renderer can drop fetch() in favour of IPC. (Streaming endpoints use
// WOLFSPACE:stream instead.)
const { PassThrough, Writable } = require('stream');
function apiCall({ method = 'GET', path = '/', body = null, headers = {} } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    const req = new PassThrough();
    req.method = method; req.url = path;
    req.headers = Object.assign({ 'content-type': 'application/json' }, headers);
    const res = new Writable();
    res.statusCode = 200; res._h = {}; res._chunks = []; res.writableEnded = false; res.writableFinished = false;
    res.setHeader = (k, v) => { res._h[String(k).toLowerCase()] = v; };
    res.getHeader = (k) => res._h[String(k).toLowerCase()];
    res.removeHeader = (k) => { delete res._h[String(k).toLowerCase()]; };
    res.writeHead = (code, h) => { res.statusCode = code; if (h) for (const k in h) res._h[String(k).toLowerCase()] = h[k]; return res; };
    res._write = (chunk, _enc, cb) => { res._chunks.push(Buffer.from(chunk)); cb(); };
    res.end = (chunk) => { if (chunk) res._chunks.push(Buffer.from(chunk)); res.writableEnded = true; res.writableFinished = true; done({ status: res.statusCode, headers: res._h, body: Buffer.concat(res._chunks).toString('utf8') }); };
    try { core().server.emit('request', req, res); } catch (e) { return done({ status: 500, headers: {}, body: JSON.stringify({ error: e.message }) }); }
    if (body != null) req.end(typeof body === 'string' ? body : JSON.stringify(body)); else req.end();
  });
}

// Streaming variant of apiCall: each res.write becomes an IPC chunk (for SSE
// endpoints like model downloads). Cancel destroys res â†’ handler's res.on('close').
function apiStream({ method = 'GET', path = '/', body = null, headers = {} } = {}, emit, ctl = {}) {
  return new Promise((resolve) => {
    const req = new PassThrough();
    req.method = method; req.url = path; req.headers = { 'content-type': 'application/json', ...headers };
    const res = new Writable();
    res.statusCode = 200; res._h = {}; res.writableEnded = false; res.writableFinished = false;
    res.setHeader = (k, v) => { res._h[String(k).toLowerCase()] = v; };
    res.getHeader = (k) => res._h[String(k).toLowerCase()];
    res.writeHead = (code, h) => { res.statusCode = code; if (h) for (const k in h) res._h[String(k).toLowerCase()] = h[k]; return res; };
    res._write = (chunk, _enc, cb) => { emit(chunk.toString('utf8')); cb(); };
    res.end = (chunk) => { if (chunk) emit(chunk.toString('utf8')); res.writableEnded = true; res.writableFinished = true; resolve(); };
    if (ctl.setCurReq) ctl.setCurReq(res);   // cancel â†’ res.destroy() â†’ 'close' â†’ handler aborts
    try { core().server.emit('request', req, res); } catch (e) { emit('data: ' + JSON.stringify({ t: 'err', m: e.message }) + '\n\n'); return resolve(); }
    if (body != null) req.end(typeof body === 'string' ? body : JSON.stringify(body)); else req.end();
  });
}

function registerIpc() {
  ipcMain.handle('WOLFSPACE:invoke', async (_e, { channel, payload }) => {
    if (channel === 'ping') return { ok: true, pong: Date.now() };
    // Hot-reload the backend WITHOUT restarting the app: drop every cached module
    // under the source root and re-require core. Lets edits to server.cjs/core.js
    // take effect live (front-end edits just need a renderer reload).
    if (channel === 'reloadCore') {
      try {
        const root = unpackedRoot();
        for (const k of Object.keys(require.cache)) { if (k.startsWith(root)) delete require.cache[k]; }
        _core = null; core();
        return { ok: true, at: Date.now() };
      } catch (e) { return { ok: false, error: e.message }; }
    }
    if (channel === 'api') return apiCall(payload);   // generic in-process HTTP-handler proxy
    const c = core();
    if (channel === 'cloudKeys') return Object.keys(c.getCloudKeys());   // names only, no secrets
    // Terminal PTY operations
    if (channel === 'terminal') {
      const { action } = payload || {};
      if (action === 'open') {
        const r = c.openTerminalSession(payload.cwd, payload.shell);
        return { ok: true, id: r.id, shell: r.shell, cwd: r.cwd };
      }
      if (action === 'write') {
        c.writeToTerminal(payload.id, payload.data);
        return { ok: true };
      }
      if (action === 'read') {
        const session = c.terminalSessions.get(payload.id);
        if (!session) return { ok: false, error: 'session not found' };
        const out = session.outputBuffer || '';
        if (payload.clear) session.outputBuffer = '';
        return { ok: true, output: out };
      }
      if (action === 'resize') {
        c.resizeTerminal(payload.id, payload.cols, payload.rows);
        return { ok: true };
      }
      if (action === 'close') {
        c.closeTerminalSession(payload.id);
        return { ok: true };
      }
      if (action === 'list') {
        const out = Array.from(c.terminalSessions.entries()).map(([id, s]) => ({ id, shell: s.shell, cwd: s.cwd, createdAt: s.createdAt }));
        return out;
      }
      throw new Error('unknown terminal action: ' + action);
    }
    throw new Error('unknown invoke channel: ' + channel);
  });
  ipcMain.on('WOLFSPACE:stream', (e, { id, channel, payload }) => {
    const st = { cancelled: false, req: null };
    _streams.set(id, st);
    const emit = (msg) => { if (!st.cancelled) { try { e.sender.send('WOLFSPACE:chunk', { id, data: msg }); } catch (_) {} } };
    const finish = () => { _streams.delete(id); try { e.sender.send('WOLFSPACE:chunk', { id, done: true }); } catch (_) {} };
    const ctl = { isCancelled: () => st.cancelled, setCurReq: (r) => { st.req = r; } };
    let fn = null;
    try { const c = core(); fn = channel === 'chat' ? c.chatStream : channel === 'self-agent' ? c.selfAgentStream : channel === 'api' ? apiStream : null; } catch (err) { emit({ t: 'err', m: 'core: ' + err.message }); return finish(); }
    if (!fn) { emit({ t: 'err', m: 'unknown stream channel: ' + channel }); return finish(); }
    Promise.resolve(fn(payload, emit, ctl)).then(finish, (err) => { emit({ t: 'err', m: err && err.message || String(err) }); finish(); });
  });
  ipcMain.on('WOLFSPACE:cancel', (_e, { id }) => {
    const st = _streams.get(id);
    if (st) { st.cancelled = true; if (st.req) { try { st.req.destroy(); } catch (_) {} } }
  });
}

app.whenReady().then(() => {
  registerAppProtocol(); registerIpc(); startBackend(); createWindow();
  // Hot reload: seluruh system WOLFSPACE tanpa reset manual
  try {
    const root = unpackedRoot();
    const backendDirs = ['agent', 'electron', 'scripts'];
    const backendFiles = ['server.cjs', 'terminal.cjs', 'core.js', 'config.json', 'bridge.js'];
    const frontendDirs = ['public'];
    let debounceTimer, backendTimer;
    const isBackend = (fp) => {
      const rel = path.relative(root, fp).replace(/\\/g, '/');
      if (rel.startsWith('public/') || rel.startsWith('.git/') || rel.startsWith('node_modules/') ||
          rel.startsWith('studio/') || rel.startsWith('.asar-pack/')) return false;
      for (const d of backendDirs) if (rel.startsWith(d + '/')) return true;
      for (const f of backendFiles) if (rel === f) return true;
      return false;
    };
    const isFrontend = (fp) => {
      const rel = path.relative(root, fp).replace(/\\/g, '/');
      return rel.startsWith('public/');
    };
    if (fs.existsSync(root) && !process.env.ELECTRON_RUN_AS_NODE) {
      fs.watch(root, { recursive: true }, (eventType, filename) => {
        if (!filename || path.basename(filename).startsWith('.') || filename.includes('node_modules') ||
            filename.includes('.git') || filename.endsWith('~') || filename.endsWith('.swp')) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const fullPath = path.join(root, filename);
          if (isFrontend(fullPath)) {
            try {
              const wins = BrowserWindow.getAllWindows();
              for (const w of wins) w.webContents.reload();
              console.log('[hot-reload] frontend reloaded due to:', filename);
            } catch (_) {}
          } else if (isBackend(fullPath)) {
            clearTimeout(backendTimer);
            backendTimer = setTimeout(() => {
              console.log('[hot-reload] backend changed, restarting app:', filename);
              try { app.relaunch(); app.exit(0); } catch (_) {}
            }, 500);
          }
        }, 300);
      });
    }
  } catch (_) {}
});
app.on('window-all-closed', () => { for (const p of procs) { try { p.kill(); } catch (e) {} } app.quit(); });

