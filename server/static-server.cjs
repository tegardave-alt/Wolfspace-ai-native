// Bypass Lane — static file server that runs independently of server.cjs
// If server.cjs crashes, static files (frontend) remain accessible.
// Usage: node server/static-server.cjs [port]
//   or forked as child process by server.cjs
//
// This server ONLY serves files from public/ directory.
// API requests (/chat, /models, /api/*, etc.) are forwarded to
// the main server (port 8091 by default), or return a friendly error
// if the main server is down.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.STATIC_PORT || process.argv[2], 10) || 8091;
const MAIN_PORT = parseInt(process.env.MAIN_PORT || '8090', 10);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const HTML_FILE = path.join(PUBLIC_DIR, 'index.html');

const MIME_TYPES = {
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.jsx': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.md': 'text/markdown',
};

// ── Serve a static file from public/ ──
function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const ct = MIME_TYPES[ext] || 'application/octet-stream';
  const immutable = /\/(vendor|canvaskit|assets)\//.test(filePath) ||
    ['.woff2', '.ttf', '.otf', '.wasm'].includes(ext);

  res.writeHead(200, {
    'Content-Type': ct + '; charset=utf-8',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(filePath).pipe(res);
}

// ── Proxy API request to main server ──
function proxyToMain(req, res) {
  const options = {
    hostname: '127.0.0.1',
    port: MAIN_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${MAIN_PORT}` },
    timeout: 10000,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Forward status and headers
    const headers = { ...proxyRes.headers };
    delete headers['transfer-encoding']; // let Node handle chunking
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    // Main server is down — return graceful error
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: 'Server sedang tidak tersedia',
      detail: 'Main server (port ' + MAIN_PORT + ') tidak merespon. ' +
              'Frontend tetap tersedia melalui bypass lane (port ' + PORT + ').',
      code: 'SERVER_DOWN',
    }));
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Gateway Timeout', code: 'GATEWAY_TIMEOUT' }));
  });

  // Pipe request body if any
  req.pipe(proxyReq);
}

// ── HTTP Server ──
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const urlPath = (req.url || '/').split('?')[0];

  // ── Health check endpoint (langsung cek main server, bukan proxy) ──
  if (urlPath === '/api/health') {
    const hcReq = http.request({ hostname: '127.0.0.1', port: MAIN_PORT, path: '/', method: 'HEAD', timeout: 3000 }, (hcRes) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, status: 'online' }));
    });
    hcReq.on('error', () => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, status: 'offline' }));
    });
    hcReq.on('timeout', () => {
      hcReq.destroy();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, status: 'offline' }));
    });
    hcReq.end();
    return;
  }

  // ── API routes — proxy to main server ──
  const isApi = req.method !== 'GET' ||
    urlPath.startsWith('/api/') ||
    urlPath === '/chat' ||
    urlPath === '/self-agent' ||
    urlPath === '/complete' ||
    urlPath === '/pycomplete' ||
    urlPath === '/run' ||
    urlPath === '/models' ||
    urlPath.startsWith('/model/') ||
    urlPath.startsWith('/hf/') ||
    urlPath.startsWith('/ollama/') ||
    urlPath.startsWith('/flutter/') ||
    urlPath === '/cloud-providers' ||
    urlPath === '/cloud-save' ||
    urlPath === '/detect-key' ||
    urlPath.startsWith('/api') ||
    urlPath === '/dbg' ||
    urlPath.startsWith('/debug/');

  if (isApi) {
    return proxyToMain(req, res);
  }

  // ── Static files ──
  // Path traversal protection
  let relPath = path.normalize(urlPath).replace(/^(\.\.[\\/])+/, '');
  if (relPath === '/' || relPath === '') relPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, relPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return serveFile(res, filePath);
  }

  // SPA fallback: serve index.html for unknown routes
  if (fs.existsSync(HTML_FILE)) {
    return serveFile(res, HTML_FILE);
  }

  res.writeHead(404);
  res.end('Not found');
});

server.on('error', (err) => {
  console.error('[static-server] Error:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error('[static-server] Port ' + PORT + ' already in use.');
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`[static-server] Bypass lane aktif — serving ${PUBLIC_DIR} on port ${PORT}`);
  console.log(`[static-server] API proxy → 127.0.0.1:${MAIN_PORT}`);

  // Notify parent process (if forked)
  if (process.send) {
    process.send({ type: 'static-ready', port: PORT });
  }
});

// ── Graceful shutdown ──
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

// Prevent uncaught exceptions from crashing the static server
process.on('uncaughtException', (err) => {
  console.error('[static-server] Uncaught exception:', err.message);
  // Do NOT exit — bypass lane harus tetap hidup
});
process.on('unhandledRejection', (reason) => {
  console.error('[static-server] Unhandled rejection:', reason);
});
