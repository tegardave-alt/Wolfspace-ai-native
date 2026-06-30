const fs = require(`fs`);
const lines = fs.readFileSync(`C:/Users/dave/quantum/agent/self_agent.cjs`, `utf8`).split(`\n`);
for (let i = 103; i <= 110; i++) {
  console.log(JSON.stringify(lines[i]));
}
