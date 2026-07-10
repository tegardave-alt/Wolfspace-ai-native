const fs = require('fs');
const path = 'C:\\Users\\dave\\WOLFSPACE\\agent\\web\\app.jsx';
let src = fs.readFileSync(path, 'utf8');
const orig = src;

// Replace ALL remaining occurrences
const count = (src.match(/onAiEdit={onAiEdit} busy={busy}/g) || []).length;
if (count > 0) {
  // Use global replace to replace ALL occurrences
  src = src.replace(
    /onAiEdit=\{onAiEdit\} busy=\{busy\}/g,
    ''
  );
  // Clean up any double spaces left behind
  src = src.replace(/  +/g, ' ');
  // Clean up "> " artifacts
  src = src.replace(/> </g, '><');
  fs.writeFileSync(path, src, 'utf8');
  console.log('Replaced', count, 'occurrences. Size:', orig.length, '->', src.length);
} else {
  console.log('No remaining occurrences');
}

