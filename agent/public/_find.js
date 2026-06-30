const fs = require(`fs`);
const lines = fs.readFileSync(`C:/Users/dave/quantum/public/app.jsx`, `utf8`).split(`\n`);
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(`streamSelfAgent`) || lines[i].includes(`streamChat`)) {
    console.log((i+1) + `: ` + lines[i].slice(0, 200));
  }
}
