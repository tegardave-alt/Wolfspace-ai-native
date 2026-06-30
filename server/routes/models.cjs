'use strict';
const fs = require('fs');
const path = require('path');

/**
 * GET /models - List configured models with on-disk size
 */
function handleGetModels(req, res, CONFIG) {
  if (req.method !== 'GET' || req.url !== '/models') return false;
  
  const md = CONFIG.modelDir || '';
  const out = (CONFIG.models || []).map(m => {
    let size = 0;
    try {
      if (m.file) size = fs.statSync(path.join(md, m.file)).size;
    } catch (e) {}
    return { name: m.name, port: m.port, default: !!m.default, file: m.file || '', size };
  });
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(out));
  return true;
}

module.exports = { handleGetModels };
