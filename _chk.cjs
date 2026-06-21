const fs = require('fs');
const path = require('path');
const fp = path.join(__dirname, 'server.cjs');
let src = fs.readFileSync(fp, 'utf-8');

const marker = '// Flutter build — compile source to APK (or appbundle/web)';
const insertAt = src.indexOf(marker);

// CRLF aware — file uses \r\n
const beforeMarker = src.substring(Math.max(0, insertAt - 200), insertAt);
// Find the last `  }\r\n\r\n  ` before marker
const lastClose = beforeMarker.lastIndexOf('  }\r\n\r\n  ');
if (lastClose >= 0) {
  const afterClose = Math.max(0, insertAt - 200) + lastClose + 6; // past `  }\r\n\r\n  `
  const code = `  // Flutter SDK info — version, path, status
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
  console.log('OK');
} else {
  console.log('FAIL — trying simpler pattern');
  // Just find `    return;\r\n  }\r\n\r\n`
  const altClose = beforeMarker.lastIndexOf('    return;\r\n  }\r\n\r\n  ');
  console.log('altClose:', altClose);
  if (altClose >= 0) {
    const afterAlt = Math.max(0, insertAt - 200) + altClose + 19;
    const code = `  // Flutter SDK info — version, path, status
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
    console.log('OK (alt)');
  } else {
    console.log('FAIL');
  }
}
