const as = require('@electron/asar');
const fs = require('fs');

const tmp = 'C:\\Users\\dave\\AppData\\Local\\Temp\\asar_extract';
as.extractAll('C:\\Users\\dave\\AppData\\Local\\Programs\\Quantum\\resources\\app.asar', tmp);

let m = fs.readFileSync(tmp + '\\electron\\main.js', 'utf8');

// Add debug logging for cancel
m = m.replace(
  'const st = { cancelled: false, req: null };',
  'const st = { cancelled: false, req: null }; console.log("[IPC] stream start id="+id+" st.cancelled="+st.cancelled);'
);
m = m.replace(
  'if (st) { st.cancelled = true;',
  'if (st) { st.cancelled = true; console.log("[IPC] CANCEL id="+id);'
);
m = m.replace(
  'Promise.resolve(fn(payload, emit, ctl)).then(finish,',
  'if(fn)console.log("[IPC] calling fn id="+id);Promise.resolve(fn(payload, emit, ctl)).then(finish,'
);
m = m.replace(
  'const finish = () => { _streams.delete(id);',
  'const finish = () => { console.log("[IPC] finish id="+id); _streams.delete(id);'
);

fs.writeFileSync(tmp + '\\electron\\main.js', m, 'utf8');
as.createPackage(tmp, 'C:\\Users\\dave\\AppData\\Local\\Programs\\Quantum\\resources\\app.asar');
console.log('OK');
