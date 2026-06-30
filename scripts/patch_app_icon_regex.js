const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'public', 'app.jsx');
let t = fs.readFileSync(file, 'utf8');
const re = /<span\s+className=\"ar-fs-icon\"[\s\S]*?fsId\)[\s\S]*?<\/span>/m;
const rep = '              <span className="ar-fs-icon" style={getAgentStyle(fsId)}>\n                {getAgentIcon(fsId)({ width: 22, height: 22 })}\n              </span>';
if (!re.test(t)) {
  console.error('pattern not found');
  process.exit(1);
}
t = t.replace(re, rep);
fs.writeFileSync(file, t, 'utf8');
console.log('patched');
