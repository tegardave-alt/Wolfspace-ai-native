const fs = require('fs');
const p = require('path');
let s = fs.readFileSync(p.join(__dirname, 'server.cjs'), 'utf-8');
const old = '// Flutter build \u2014 compile source to APK (or appbundle/web)\n';
const code = `  // Flutter SDK info \u2014 version, path, status
  if (req.method === 'GET' && req.url === '/flutter/sdk-info') {
    try {
      const { execSync } = require('child_process');
      let version = null;
      if (FLUTTER_BIN) {
        try {
          version = execSync('"'+FLUTTER_BIN+'" --version', { timeout: 10000, encoding: 'utf8', windowsHide: true }).split('\\n')[0].trim();
        } catch(_) { version = '(error)'; }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ found: !!FLUTTER_BIN, path: FLUTTER_BIN, version }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ found: false, path: null, version: null, error: e.message }));
    }
    return;
  }

  // Flutter build \u2014 compile source to APK (or appbundle/web)
`;
const idx = s.indexOf(old);
if (idx < 0) { console.log('FAIL'); process.exit(1); }
s = s.substring(0, idx) + code + s.substring(idx + old.length);
fs.writeFileSync(p.join(__dirname, 'server.cjs'), s, 'utf-8');
console.log('OK');
