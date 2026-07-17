'use strict';

// ── Terminal API (HTTP routes for PTY sessions) ──
// Extracted verbatim from server.cjs. All state (terminalSessions) and the
// PTY helpers stay in server.cjs and are injected via deps.

function handle(req, res, deps) {
  const urlPath = (req.url || '/').split('?')[0];
  const {
    terminalSessions,
    openTerminalSession,
    writeToTerminal,
    resizeTerminal,
    closeTerminalSession,
  } = deps;

  if (req.method === 'POST' && urlPath === '/api/terminal/open') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { cwd, shell } = JSON.parse(body || '{}');
        const r = openTerminalSession(cwd || undefined, shell || undefined);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(r));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return true;
  }

  if (req.method === 'POST' && urlPath === '/api/terminal/write') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { id, data } = JSON.parse(body);
        writeToTerminal(id, data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return true;
  }

  if (req.method === 'POST' && urlPath === '/api/terminal/resize') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { id, cols, rows } = JSON.parse(body);
        resizeTerminal(id, cols, rows);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return true;
  }

  if (req.method === 'POST' && urlPath === '/api/terminal/read') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { id, clear } = JSON.parse(body || '{}');
        const session = terminalSessions.get(id);
        if (!session) {
          res.writeHead(404);
          return res.end(JSON.stringify({ error: 'session not found' }));
        }
        const output = session.outputBuffer || '';
        if (clear) session.outputBuffer = '';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ output }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return true;
  }

  if (req.method === 'POST' && urlPath === '/api/terminal/close') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { id } = JSON.parse(body);
        closeTerminalSession(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return true;
  }

  if (req.method === 'GET' && urlPath === '/api/terminal/list') {
    const out = Array.from(terminalSessions.entries()).map(([id, s]) => ({
      id,
      shell: s.shell,
      cwd: s.cwd,
      createdAt: s.createdAt,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
    return true;
  }

  return false;
}

module.exports = { handle };
