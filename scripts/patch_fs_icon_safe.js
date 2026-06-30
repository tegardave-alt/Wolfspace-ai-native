const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'public', 'app.jsx');
let t = fs.readFileSync(file, 'utf8');
const original = '  const fsId = fsAgent ? fsAgent.id || fsAgent.name : "";';
if (!t.includes(original)) {
  console.error('fsId line not found; aborting');
  process.exit(1);
}
const replacement = '  const fsId = fsAgent ? fsAgent.id || fsAgent.name : "";\n  const FSIcon = getAgentIcon(fsId);';

t = t.replace(original, replacement);
// Replace the inline call {getAgentIcon(fsId)({ width: 22, height: 22 })}
const iconCallRe = /\{getAgentIcon\(fsId\)\s*\(\{[\s\S]*?height: 22,?[\s\S]*?\}\)\}/m;
if (!iconCallRe.test(t)) {
  console.error('fs icon call not found; aborting');
  process.exit(1);
}
const iconReplacement = '{typeof FSIcon === "function" ? FSIcon({ width: 22, height: 22 }) : FSIcon}';

t = t.replace(iconCallRe, iconReplacement);
fs.writeFileSync(file, t, 'utf8');
console.log('patched');
