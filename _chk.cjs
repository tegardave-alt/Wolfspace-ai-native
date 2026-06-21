const fs = require('fs');
const path = require('path');
const fp = path.join(__dirname, 'server.cjs');
let src = fs.readFileSync(fp, 'utf-8');

const marker = '// Flutter build — compile source to APK (or appbundle/web)';
console.log('Marker index:', src.indexOf(marker));

const insertAt = src.indexOf(marker);
const searchFrom = Math.max(0, insertAt - 80);
const before = src.substring(searchFrom, insertAt);
console.log('Before marker:', JSON.stringify(before));

const lastClose = src.lastIndexOf('  }\n\n', insertAt);
console.log('lastClose:', lastClose, 'searchFrom:', searchFrom);

if (lastClose >= searchFrom) {
  const afterClose = lastClose + 4;
  const code = `
  // Flutter SDK info — version, path, status
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

`;
  src = src.substring(0, afterClose) + code + src.substring(afterClose);
  fs.writeFileSync(fp, src, 'utf-8');
  console.log('OK — inserted sdk-info endpoint');
} else {
  // Try different pattern
  console.log('Trying different pattern...');
  // Look for `    return;\n  }\n\n` before marker
  const altClose = src.lastIndexOf('    return;\n  }\n\n', insertAt);
  console.log('altClose:', altClose);
  if (altClose >= 0) {
    const afterAlt = altClose + 14; // past `    return;\n  }\n\n`
    const code = `
  // Flutter SDK info — version, path, status
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

`;
    src = src.substring(0, afterAlt) + code + src.substring(afterAlt);
    fs.writeFileSync(fp, src, 'utf-8');
    console.log('OK — inserted sdk-info endpoint (alt)');
  } else {
    console.log('ERROR: all patterns failed');
  }
}
