'use strict';

// ── Agent Runner API (host external CLI agents: opencode, claude, etc.) ──
// Extracted verbatim from server.cjs. State (AGENT_REGISTRY, agentSessions)
// stays owned by server.cjs and is injected via deps since it's shared with
// other parts of the server (e.g. the debug/status surface).

function handle(req, res, deps) {
  const urlPath = (req.url || '/').split('?')[0];
  const { AGENT_REGISTRY, agentSessions, pty, CORS_ORIGIN, runSelfTool } = deps;

  if (req.method === 'GET' && urlPath === '/api/agents') {
    const { execSync } = require('child_process');
    for (const a of AGENT_REGISTRY) {
      if (a.id === 'WOLFSPACE') continue;
      const cmds = { opencode: 'opencode --version', claude: 'claude --version' };
      try {
        execSync(cmds[a.id], { shell: true, stdio: 'ignore', timeout: 3000 });
        a.available = true;
      } catch { a.available = false; }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(AGENT_REGISTRY));
  }

  if (req.method === 'POST' && urlPath === '/api/agents/start') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const { id, cwd, model, cols, rows } = JSON.parse(body || '{}');
        const agent = AGENT_REGISTRY.find((a) => a.id === id);
        if (!agent) { res.writeHead(404); return res.end(JSON.stringify({ error: 'agent not found' })); }
        if (id === 'WOLFSPACE') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'WOLFSPACE agent tidak bisa dijalankan lewat Agent Runner. Gunakan panel Chat biasa.' }));
        }
        const { execSync } = require('child_process');
        const verCmds = { opencode: 'opencode --version', claude: 'claude --version' };
        try {
          execSync(verCmds[id], { shell: true, stdio: 'ignore', timeout: 3000 });
          agent.available = true;
        } catch { agent.available = false; }
        if (!agent.available) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'agent not installed: ' + id }));
        }
        const existing = agentSessions.get(id);
        if (existing) {
          if (existing.proc) { try { existing.proc.kill(); } catch {} }
          if (existing.pty) { try { existing.pty.kill(); } catch {} }
        }
        const sess = {
          proc: null, pty: null, output: [], cwd: cwd || process.cwd(),
          model, exited: false, msgCount: 0, sendId: 0, sessionID: null, busy: false,
        };
        let shellCmd = id === 'opencode' ? 'opencode' : id;
        let shellArgs = [];
        if (model) {
          if (id === 'opencode') shellArgs.push('--model', model);
          if (id === 'claude') shellArgs.push('--model', model);
        }
        if (process.platform === 'win32') {
          shellArgs = ['/c', shellCmd, ...shellArgs];
          shellCmd = 'cmd.exe';
        }
        try {
          sess.pty = pty.spawn(shellCmd, shellArgs, {
            name: 'xterm-256color',
            cols: parseInt(cols) || 120,
            rows: parseInt(rows) || 40,
            cwd: sess.cwd,
            env: { ...process.env, FORCE_COLOR: '1', TERM: 'xterm-256color' },
            useConpty: process.platform === 'win32',
          });
          sess.pty.onData((data) => { sess.output.push(data); });
          sess.pty.onExit(({ exitCode }) => {
            sess.exited = true;
            sess.output.push(`\r\n[agent exited with code ${exitCode}]\r\n`);
          });
        } catch (spawnErr) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Failed to spawn agent: ' + spawnErr.message }));
        }
        agentSessions.set(id, sess);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, agent: id }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return true;
  }

  if (req.method === 'POST' && urlPath === '/api/agents/send') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const { id, text } = JSON.parse(body || '{}');
        const sess = agentSessions.get(id);
        if (!sess) { res.writeHead(404); return res.end(JSON.stringify({ error: 'agent session not found' })); }
        if (!sess.pty) {
          res.writeHead(404);
          return res.end(JSON.stringify({ error: 'agent session not found. Start agent first.' }));
        }
        sess.pty.write(text);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return true;
  }

  if (req.method === 'POST' && urlPath === '/api/agents/resize') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const { id, cols, rows } = JSON.parse(body || '{}');
        const sess = agentSessions.get(id);
        if (!sess || !sess.pty) { res.writeHead(404); return res.end(JSON.stringify({ error: 'agent session not found' })); }
        sess.pty.resize(parseInt(cols) || 120, parseInt(rows) || 40);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return true;
  }

  // SSE stream for agent PTY output (raw, no stripping)
  if (req.method === 'GET' && urlPath === '/api/agents/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': CORS_ORIGIN,
    });
    let lastLen = {};
    const interval = setInterval(() => {
      for (const [id, sess] of agentSessions) {
        const out = sess.output.join('');
        const prev = lastLen[id] || 0;
        if (out.length > prev) {
          const chunk = out.slice(prev);
          res.write('data: ' + JSON.stringify({ type: 'output', id, text: chunk }) + '\n\n');
          lastLen[id] = out.length;
        }
        if (sess.exited && !sess._exitSent) {
          res.write('data: ' + JSON.stringify({ type: 'done', id }) + '\n\n');
          sess._exitSent = true;
        }
      }
    }, 100);
    req.on('close', () => { clearInterval(interval); });
    return true;
  }

  if (req.method === 'POST' && urlPath === '/api/bash') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { command, cwd } = JSON.parse(body || '{}');
        const result = await runSelfTool('bash', { command, cwd: cwd || undefined });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: result.ok, output: result.output }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return true;
  }

  return false;
}

module.exports = { handle };
