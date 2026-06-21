const fs = require('fs');
const path = require('path');
const fp = path.join(__dirname, 'server.cjs');
let src = fs.readFileSync(fp, 'utf-8');

// The line after the flutter/compile block is:
// "  // Flutter build — compile source to APK (or appbundle/web)"
// We want to insert BEFORE this line.
const marker = '  // Flutter build \u2014 compile source to APK (or appbundle/web)';
const idx = src.indexOf(marker);
if (idx < 0) {
  console.log('FAIL: marker not found, trying ASCII dash');
  const marker2 = '  // Flutter build - compile source to APK (or appbundle/web)';
  const idx2 = src.indexOf(marker2);
  if (idx2 < 0) { console.log('FAIL: both markers not found'); process.exit(1); }
  const code = '\n  // Flutter SDK info \u2014 version, path, status\n' +
    '  if (req.method === \'GET\' && req.url === \'/flutter/sdk-info\') {\n' +
    '    try {\n' +
    '      const { execSync } = require(\'child_process\');\n' +
    '      let version = null;\n' +
    '      if (FLUTTER_BIN) {\n' +
    '        try {\n' +
    '          version = execSync(\'"\'+FLUTTER_BIN+\'" --version\', { timeout: 10000, encoding: \'utf8\', windowsHide: true }).split(\'\\\\n\')[0].trim();\n' +
    '        } catch(_) { version = \'(error)\'; }\n' +
    '      }\n' +
    '      res.writeHead(200, { \'Content-Type\': \'application/json\' });\n' +
    '      res.end(JSON.stringify({ found: !!FLUTTER_BIN, path: FLUTTER_BIN, version }));\n' +
    '    } catch (e) {\n' +
    '      res.writeHead(200, { \'Content-Type\': \'application/json\' });\n' +
    '      res.end(JSON.stringify({ found: false, path: null, version: null, error: e.message }));\n' +
    '    }\n' +
    '    return;\n' +
    '  }\n' +
    '\n' +
    '  // Flutter build - compile source to APK (or appbundle/web)';
  src = src.substring(0, idx2) + code + src.substring(idx2 + marker2.length);
  fs.writeFileSync(fp, src, 'utf-8');
  console.log('OK');
} else {
  const code = '\n  // Flutter SDK info \u2014 version, path, status\n' +
    '  if (req.method === \'GET\' && req.url === \'/flutter/sdk-info\') {\n' +
    '    try {\n' +
    '      const { execSync } = require(\'child_process\');\n' +
    '      let version = null;\n' +
    '      if (FLUTTER_BIN) {\n' +
    '        try {\n' +
    '          version = execSync(\'"\'+FLUTTER_BIN+\'" --version\', { timeout: 10000, encoding: \'utf8\', windowsHide: true }).split(\'\\\\n\')[0].trim();\n' +
    '        } catch(_) { version = \'(error)\'; }\n' +
    '      }\n' +
    '      res.writeHead(200, { \'Content-Type\': \'application/json\' });\n' +
    '      res.end(JSON.stringify({ found: !!FLUTTER_BIN, path: FLUTTER_BIN, version }));\n' +
    '    } catch (e) {\n' +
    '      res.writeHead(200, { \'Content-Type\': \'application/json\' });\n' +
    '      res.end(JSON.stringify({ found: false, path: null, version: null, error: e.message }));\n' +
    '    }\n' +
    '    return;\n' +
    '  }\n' +
    '\n' +
    '  // Flutter build \u2014 compile source to APK (or appbundle/web)';
  src = src.substring(0, idx) + code + src.substring(idx + marker.length);
  fs.writeFileSync(fp, src, 'utf-8');
  console.log('OK');
}
