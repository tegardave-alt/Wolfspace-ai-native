'use strict';

// ── Hunk review API (apply/revert pending agent edits) ──
// Extracted verbatim from server.cjs; hunk buffer lives in agent/tools.cjs.

function handle(req, res, deps) {
  const urlPath = (req.url || '/').split('?')[0];

  if (req.method === 'POST' && urlPath === '/api/revert-hunk') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { hunkId } = JSON.parse(body);
        if (!hunkId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'hunkId wajib' }));
        }
        const { rejectHunk } = require('../../agent/tools.cjs');
        const r = rejectHunk(hunkId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(r));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return true;
  }

  // Apply a hunk (confirm an edit — removes from pending buffer)
  if (req.method === 'POST' && urlPath === '/api/apply-hunk') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { hunkId } = JSON.parse(body);
        if (!hunkId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'hunkId wajib' }));
        }
        const { applyHunk } = require('../../agent/tools.cjs');
        const r = applyHunk(hunkId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(r));
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
