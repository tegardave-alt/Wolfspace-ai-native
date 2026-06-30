'use strict';

function handle(req, res, deps) {
  const _path = (req.url || '/').split('?')[0];
  if (req.method !== 'POST' || _path !== '/api/bash') return false;
  
  const { runSelfTool } = deps;
  let body = '';
  req.on('data', c => body += c);
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

module.exports = { handle };
