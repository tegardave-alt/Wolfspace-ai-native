const fs = require('fs');
const files = ['tools.cjs', 'self_agent.cjs', 'runners.cjs', 'cloud.cjs', 'chat.cjs'];
for (const file of files) {
  let c = fs.readFileSync('agent/' + file, 'utf8');
  c = c.replace(/require\('(\.\/[a-z_]+)'\)/g, (m, p1) => "require('" + p1 + ".cjs')");
  fs.writeFileSync('agent/' + file, c);
}
let s = fs.readFileSync('server.cjs', 'utf8');
s = s.replace(/require\('(\.\/agent\/[a-z_]+)'\)/g, (m, p1) => "require('" + p1 + ".cjs')");
fs.writeFileSync('server.cjs', s);
console.log('Fixed');
