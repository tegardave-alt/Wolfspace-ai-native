const fs = require(`fs`);
const lines = fs.readFileSync(`C:/Users/dave/WOLFSPACE/server.cjs`, `utf8`).split(`\n`);
for (let i = 4470; i <= 4510; i++) {
  console.log((i+1) + `: ` + lines[i]);
}

