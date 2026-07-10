const fs = require(`fs`);
const lines = fs.readFileSync(`C:/Users/dave/WOLFSPACE/public/app.jsx`, `utf8`).split(`\n`);
for (let i = 515; i <= 560; i++) {
  console.log((i+1) + `: ` + lines[i]);
}

