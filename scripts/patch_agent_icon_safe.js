const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'public', 'app.jsx');
let t = fs.readFileSync(file, 'utf8');
const find = "{runnerAgents.map((a) => {\n                        const id = a.id || a.name;\n                        return (";
if (t.indexOf(find) === -1) {
  console.error('map header not found; aborting');
  process.exit(1);
}
// insert Icon const after id line
const findIdLine = "const id = a.id || a.name;";
if (t.indexOf(findIdLine) === -1) {
  console.error('id line not found; aborting');
  process.exit(1);
}
// Replace the id line with id + Icon const
const replaceIdLine = "const id = a.id || a.name;\n                        const Icon = getAgentIcon(id);";
t = t.replace(findIdLine, replaceIdLine);
// Now replace the getAgentIcon(...) call inside the span
const iconCallRe = /\{getAgentIcon\(id\)\s*\(\{[\s\S]*?height: 18,?[\s\S]*?\}\)\}/m;
if (!iconCallRe.test(t)) {
  console.error('icon call pattern not found; aborting');
  process.exit(1);
}
const iconReplacement = '{typeof Icon === "function" ? Icon({ width: 18, height: 18 }) : Icon}';

t = t.replace(iconCallRe, iconReplacement);
fs.writeFileSync(file, t, 'utf8');
console.log('patched');
