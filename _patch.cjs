const fs = require('fs');
let b = fs.readFileSync('public/app.jsx', 'utf8');
const old = 'onVisualPicker={() => {\r\n          startPicker();\r\n        }}\r\n        canvasAuto={canvasAuto}';
const rep = 'onVisualPicker={() => {\r\n          startPicker();\r\n        }}\r\n        onZonePicker={() => {\r\n          startZonePicker();\r\n        }}\r\n        canvasAuto={canvasAuto}';
if (!b.includes(old)) { console.log('NOT FOUND'); process.exit(1); }
b = b.replace(old, rep);
fs.writeFileSync('public/app.jsx', b);
console.log('OK - patched');
n