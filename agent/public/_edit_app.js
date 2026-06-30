const fs = require(`fs`);
const fp = `C:/Users/dave/quantum/public/app.jsx`;
let s = fs.readFileSync(fp, `utf8`);

// Find and replace the streamSelfAgent call to add mode
const oldCall = `        await streamSelfAgent(
          { history: newHist, cloud: getCloud(), port: modelVal },
          (j) => {`;

const newCall = `        await streamSelfAgent(
          { history: newHist, cloud: getCloud(), port: modelVal, mode: mode },
          (j) => {`;

if (s.includes(oldCall)) {
  s = s.replace(oldCall, newCall);
  console.log(`OK: streamSelfAgent updated`);
} else {
  console.log(`FAIL: oldCall not found`);
  // Try to find what's there
  const idx = s.indexOf(`streamSelfAgent`);
  if (idx >= 0) {
    console.log(`Found at index ${idx}, context:`, s.slice(idx, idx+200));
  } else {
    console.log(`streamSelfAgent not found at all!`);
    process.exit(1);
  }
}

fs.writeFileSync(fp, s, `utf8`);
console.log(`File saved`);
