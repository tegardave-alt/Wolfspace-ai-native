const fs = require(`fs`);
const lines = fs.readFileSync(`C:/Users/dave/WOLFSPACE/server.cjs`, `utf8`).split(`\n`);
for (let i = 3295; i <= 3400; i++) {
  const line = lines[i] || ``;
  if (line.includes(`selfAgentStream`) || line.includes(`async function`) || line.includes(`module.exports`)) {
    console.log((i+1) + `: ` + line.slice(0, 200));
  }
}

