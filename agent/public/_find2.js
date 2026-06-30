const fs = require(`fs`);
const s = fs.readFileSync(`C:/Users/dave/quantum/server.cjs`, `utf8`);
const lines = s.split(`\n`);
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(`self`) || lines[i].includes(`/self`)) {
    console.log((i+1) + `: ` + lines[i].slice(0, 200));
  }
}
