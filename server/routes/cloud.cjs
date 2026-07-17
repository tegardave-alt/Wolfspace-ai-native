'use strict';
const fs = require('fs');
const path = require('path');
const { resolveKeysPath } = require('../../agent/keys-path.cjs');

function handle(req, res, deps) {
  const { CLOUD_KEYS, CLOUD, PROVIDER_NAMES, loadCloudKeys, detectKey, fillCloudKey, dlog } = deps;
  
  // POST /cloud-save - Persist BYOK key server-side
  if (req.method === 'POST' && req.url === '/cloud-save') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { key, provider, model, baseUrl } = JSON.parse(body);
        if (!key || !provider) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'key & provider wajib' })); }
        let store = {};
        try { store = JSON.parse(fs.readFileSync(resolveKeysPath(), 'utf8')); } catch {}
        store[provider] = { key, model: model || '', ...(baseUrl ? { baseUrl } : {}) };
        fs.writeFileSync(resolveKeysPath(), JSON.stringify(store, null, 2));
        loadCloudKeys();
        dlog('http', 'info', 'cloud key saved server-side', { provider });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, provider }));
      } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return true;
  }

  // POST /detect-key - Detect key provider
  if (req.method === 'POST' && req.url === '/detect-key') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let out = { provider: 'openai', name: 'OpenAI', verified: false };
      try { const { key } = JSON.parse(body); if (key) out = await detectKey(key); } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
    return true;
  }

  // GET /cloud-providers - List providers with keys
  if (req.method === 'GET' && req.url === '/cloud-providers') {
    const out = Object.keys(CLOUD_KEYS).filter(p => CLOUD_KEYS[p] && CLOUD_KEYS[p].key)
      .map(p => ({ provider: p, name: PROVIDER_NAMES[p] || p, model: CLOUD_KEYS[p].model || (CLOUD[p] || {}).model || '' }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(out));
  }

  // DELETE /cloud-providers/:provider - Delete a key
  if (req.method === 'DELETE' && (req.url || '').startsWith('/cloud-providers/')) {
    const prov = decodeURIComponent((req.url || '').slice('/cloud-providers/'.length));
    try {
      let store = {};
      try { store = JSON.parse(fs.readFileSync(resolveKeysPath(), 'utf8')); } catch {}
      delete store[prov];
      fs.writeFileSync(resolveKeysPath(), JSON.stringify(store, null, 2));
      loadCloudKeys();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, provider: prov }));
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return true;
  }

  return false;
}

module.exports = { handle };
