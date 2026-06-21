const fs = require('fs');
let c = fs.readFileSync('public/app.jsx', 'utf8');
// Remove lines that are empty or only whitespace between line 1777 and 1780
let lines = c.split('\n');
// Check and remove blank lines at indices 1777 and 1778 (0-based)
for (let i = 1777; i <= 1778; i++) {
  if (lines[i] && lines[i].trim() === '') {
    lines.splice(i, 1);
    i--;
  }
}
fs.writeFileSync('public/app.jsx', lines.join('\n'), 'utf8');
console.log('done');
