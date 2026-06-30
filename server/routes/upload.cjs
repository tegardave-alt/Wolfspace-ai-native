'use strict';
const fs = require('fs');
const path = require('path');

function handle(req, res, deps) {
  if (req.method !== 'POST' || req.url !== '/upload') return false;
  
  const { dlog } = deps;
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    try {
      const { name, data } = JSON.parse(body);
      if (!name || !data) { res.writeHead(400); return res.end(JSON.stringify({ error: 'name & data required' })); }
      const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
      try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (e) {}
      const safe = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
      const fp = path.join(uploadDir, safe);
      const buf = Buffer.from(data, 'base64');
      fs.writeFileSync(fp, buf);
      dlog('http', 'info', 'file uploaded', { name: safe, size: buf.length });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: '/uploads/' + safe, name: safe, size: buf.length }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  });
  return true;
}

module.exports = { handle };
