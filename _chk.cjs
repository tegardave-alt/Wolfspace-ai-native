const fs = require('fs');
const lines = fs.readFileSync(__dirname + '/server.cjs', 'utf-8').split('\n');
for (let i = 2354; i < 2365; i++) {
  console.log(i+1, JSON.stringify(lines[i]));
}
