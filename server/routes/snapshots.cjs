'use strict';

// ── Snapshot API (list + rollback) ──
// Extracted verbatim from server.cjs; snapshot engine lives in agent/snapshot.cjs.

function handle(req, res, deps) {
  const urlPath = (req.url || '/').split('?')[0];
  const { listSnapshots, rollback } = deps;

  if (req.method === 'GET' && urlPath === '/api/snapshots') {
    const snaps = listSnapshots().slice(0, 20).map((s) => ({
      id: s.id,
      ts: s.ts,
      label: s.label,
      files: s.files,
      age: Math.round((Date.now() - s.ts) / 1000 / 60) + ' menit lalu',
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, snapshots: snaps }));
    return true;
  }

  if (req.method === 'POST' && urlPath === '/api/rollback') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let id;
      try { ({ id } = JSON.parse(body)); } catch { res.writeHead(400); return res.end('bad json'); }
      if (!id) { res.writeHead(400); return res.end('id required'); }
      const result = rollback(id);
      res.writeHead(result.ok ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    return true;
  }

  return false;
}

module.exports = { handle };
