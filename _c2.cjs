const fs = require('fs');
const l = fs.readFileSync('server.cjs','utf-8').split('\n');
console.log(JSON.stringify(l[2359]));
console.log(JSON.stringify(l[2360]));
console.log(JSON.stringify(l[2361]));
