const fs = require(`fs`);
const lines = fs.readFileSync(`C:/Users/dave/WOLFSPACE/public/app.jsx`, `utf8`).split(`\n`);
// Verify mode is passed to streamSelfAgent
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(`streamSelfAgent`)) {
    console.log(`Line ${i+1}: ${lines[i]}`);
    if (i+1 < lines.length) console.log(`Line ${i+2}: ${lines[i+1]}`);
  }
}
// Check mode state and handleModeChange exist
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(`handleModeChange`)) {
    console.log(`Line ${i+1}: ${lines[i].slice(0,150)}`);
  }
}
// Check Composer receives mode props
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(`onModeChange`)) {
    console.log(`Line ${i+1}: ${lines[i]}`);
    if (i > 0) console.log(`Line ${i}: ${lines[i-1]}`);
    if (i+1 < lines.length) console.log(`Line ${i+2}: ${lines[i+1]}`);
  }
}

