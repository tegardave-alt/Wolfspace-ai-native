const fs = require(`fs`);
const buf = fs.readFileSync(`C:/Users/dave/WOLFSPACE/agent/self_agent.cjs`);
const lines = buf.toString(`utf8`).split(`\n`);
for (let i = 100; i <= 106; i++) {
  const hex = Buffer.from(lines[i]).toString(`hex`);
  console.log(`${i+1} (${lines[i].length} chars): ${JSON.stringify(lines[i].slice(0,80))}`);
  console.log(`  hex: ${hex.slice(0,120)}`);
}

