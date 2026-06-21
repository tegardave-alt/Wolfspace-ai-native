const fs = require('fs');
const path = require('path');
const fp = path.join(__dirname, 'server.cjs');
let src = fs.readFileSync(fp, 'utf-8');

// Find the Flutter build section and insert sdk-info endpoint after it
const marker = '// Flutter build — compile source to APK (or appbundle/web)';
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

const idx = src.indexOf(marker);
if (idx >= 0) {
  // Find the end of the `return;` block after this marker (go to the next empty line + marker)
  const afterMarker = src.indexOf(marker) + marker.length;
  const afterBlock = src.indexOf('  // Flutter build', afterMarker + 1); // next occurrence
  // Actually we only want to insert before the NEXT `  // Flutter build` line
  // The structure is: `    return;\n  }\n\n  // Flutter build — compile ...`
  // Find the `    return;\n  }\n\n` that precedes the next Flutter build line
  const insertAt = src.indexOf(marker);
  // Actually, marker is AT the line we want to insert BEFORE. We want to insert AFTER
  // the `  }` line that ends the compile endpoint block.
  // Let's find the `  }` before this marker.
  const searchFrom = insertAt - 80;
  const before = src.substring(searchFrom, insertAt);
  // Find the last `  }\n\n` before marker
  const lastClose = src.lastIndexOf('  }\n\n', insertAt);
  if (lastClose >= searchFrom) {
    // Insert after the `  }\n\n` (i.e., before the empty line + `// Flutter build ...`)
    const afterClose = lastClose + 4; // past `  }\n\n`
    src = src.substring(0, afterClose) + code + src.substring(afterClose);
    fs.writeFileSync(fp, src, 'utf-8');
    console.log('OK — inserted sdk-info endpoint');
  } else {
    console.log('ERROR: could not find block boundary');
  }
} else {
  console.log('ERROR: marker not found');
}
