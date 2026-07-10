const as = require('@electron/asar');
const fs = require('fs');
const tmp = 'C:\\Users\\dave\\AppData\\Local\\Temp\\asar_extract';

// Extract from backup
as.extractAll('C:\\Users\\dave\\AppData\\Local\\Programs\\WOLFSPACE\\resources\\app.asar.bak3', tmp);

let m = fs.readFileSync(tmp + '\\electron\\main.js', 'utf8');

// 1. emit: remove st.cancelled check
m = m.replace(
  "const emit = (msg) => { if (!st.cancelled) { try { e.sender.send('WOLFSPACE:chunk', { id, data: msg }); } catch (_) {} } };",
  "const emit = (msg) => { try { e.sender.send('WOLFSPACE:chunk', { id, data: msg }); } catch (_) {} };"
);

// 2. finish: send directly
m = m.replace(
  "const finish = () => { _streams.delete(id); emit({ done: true }); };",
  "const finish = () => { _streams.delete(id); try { e.sender.send('WOLFSPACE:chunk', { id, data: { done: true } }); } catch (_) {} };"
);

// 3. isCancelled: always return false
m = m.replace(
  "isCancelled: () => st.cancelled",
  "isCancelled: () => false"
);

// 4. preload path: already fixed in backup3
if (m.indexOf("preload: path.join(unpackedRoot()") < 0) {
  console.log('WARNING: preload path not using unpackedRoot');
}

fs.writeFileSync(tmp + '\\electron\\main.js', m, 'utf8');

// Verify
const x = fs.readFileSync(tmp + '\\electron\\main.js', 'utf8');
console.log('emit check:', x.includes("const emit = (msg) => { try"));
console.log('finish check:', x.includes("data: { done: true }"));
console.log('isCancelled check:', x.includes("isCancelled: () => false"));
console.log('preload check:', x.includes("unpackedRoot"));

// Repack
as.createPackage(tmp, 'C:\\Users\\dave\\AppData\\Local\\Programs\\WOLFSPACE\\resources\\app.asar');
console.log('Repacked OK');

