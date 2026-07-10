import asar from '@electron/asar';
import fs from 'fs';
import path from 'path';

const ASAR = 'C:/Users/dave/AppData/Local/Programs/WOLFSPACE/resources/app.asar';
const TMP  = 'C:/Users/dave/AppData/Local/Programs/WOLFSPACE/resources/_asar_tmp';

// Extract
asar.extractAll(ASAR, TMP);
console.log('extracted');

let code = fs.readFileSync(path.join(TMP, 'server.cjs'), 'utf8');
const before = code;

// Patch 1: fillCloudKey — copy baseUrl from CLOUD_KEYS
code = code.replace(
  `  if (!cloud.key && cloud.provider && CLOUD_KEYS[cloud.provider]) {
    cloud.key = CLOUD_KEYS[cloud.provider].key;
    cloud.model = cloud.model || CLOUD_KEYS[cloud.provider].model;
  }
}`,
  `  if (!cloud.key && cloud.provider && CLOUD_KEYS[cloud.provider]) {
    cloud.key = CLOUD_KEYS[cloud.provider].key;
    cloud.model = cloud.model || CLOUD_KEYS[cloud.provider].model;
  }
  if (!cloud.baseUrl && cloud.provider && CLOUD_KEYS[cloud.provider] && CLOUD_KEYS[cloud.provider].baseUrl) {
    cloud.baseUrl = CLOUD_KEYS[cloud.provider].baseUrl;
  }
}`
);

// Patch 2: add port variable
code = code.replace(
  `let host = cfg.host, path = cfg.path, headers = { 'content-type': 'application/json' }, body, extract;`,
  `let host = cfg.host, path = cfg.path, port = null, headers = { 'content-type': 'application/json' }, body, extract;`
);

// Patch 3: extract port from baseUrl
code = code.replace(
  `try { const u = new URL(cloud.baseUrl.replace(/\\/+$/, '') + '/chat/completions'); host = u.hostname; path = u.pathname + (u.search || ''); } catch {}`,
  `try { const u = new URL(cloud.baseUrl.replace(/\\/+$/, '') + '/chat/completions'); host = u.hostname; path = u.pathname + (u.search || ''); if (u.port) port = parseInt(u.port); } catch {}`
);

// Patch 4: use http.request for localhost
code = code.replace(
  `const r = https.request({ hostname: host, path, method: 'POST', headers, timeout: 600000 }, s => {`,
  `const isLocal = host === '127.0.0.1' || host === 'localhost';
    const reqFn = isLocal ? http.request : https.request;
    const reqOpts = { hostname: host, path, method: 'POST', headers, timeout: 600000 };
    if (port) reqOpts.port = port;
    const r = reqFn(reqOpts, s => {`
);

if (code === before) {
  console.error('WARN: no patches applied — string not found, check manually');
  process.exit(1);
}

fs.writeFileSync(path.join(TMP, 'server.cjs'), code, 'utf8');
console.log('patched server.cjs');

// Backup original asar
fs.copyFileSync(ASAR, ASAR + '.bak');
console.log('backed up original asar');

// Repack
await asar.createPackage(TMP, ASAR);
console.log('repacked app.asar');

// Cleanup
fs.rmSync(TMP, { recursive: true, force: true });
console.log('done');

