'use strict';

function handle(req, res, deps) {
  const _path = (req.url || '/').split('?')[0];
  
  if (req.method === 'POST' && _path === '/api/revert-hunk') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { hunkId } = JSON.parse(body);
        if (!hunkId) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'hunkId required' })); }
        const { rejectHunk } = require('../agent/tools.cjs');
        const r = rejectHunk(hunkId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(r));
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return true;
  }
  
  if (req.method === 'POST' && _path === '/api/apply-hunk') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { hunkId } = JSON.parse(body);
        if (!hunkId) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'hunkId required' })); }
        const { applyHunk } = require('../agent/tools.cjs');
        const r = applyHunk(hunkId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(r));
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return true;
  }
  
  return false;
}

module.exports = { handle };
