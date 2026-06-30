const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'self_agent.cjs');
let content = fs.readFileSync(filePath, 'utf8');

// Find the SELF_FC_SYS array and replace it
const startMarker = 'const SELF_FC_SYS = [';
const endMarker = '].join';
const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker, startIdx);
const closeIdx = content.indexOf(';', endIdx);

if (startIdx === -1 || endIdx === -1) {
  console.error('ERROR: markers not found');
  process.exit(1);
}

// Find the actual newline after startMarker to include the full array
const afterStart = startIdx + startMarker.length;
const replacement = 'const SELF_FC_SYS = loadSelfAgentPrompt();';
const before = content.slice(0, startIdx);
const after = content.slice(closeIdx + 1);

const newContent = before + replacement + after;
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('OK: replaced array, size=' + fs.statSync(filePath).size);
