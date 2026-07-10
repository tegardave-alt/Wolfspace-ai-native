const fs = require('fs');
const c = fs.readFileSync('agent/public/app.jsx', 'utf8');
const fixed = c.replace(
  /(\s*)<\/span>\s*\r?\n/g,
  '\n'
);
fs.writeFileSync('agent/public/app.jsx', fixed, 'utf8');
console.log('Fixed agent/public/app.jsx');
