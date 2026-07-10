const fs = require('fs');
const path = 'C:\\Users\\dave\\WOLFSPACE\\agent\\public\\app.jsx';
let src = fs.readFileSync(path, 'utf8');
let orig = src;

// Remove aiEditCode function by finding start/end markers
const idx = src.indexOf('const aiEditCode = (code, lang, instruction) => {');
if (idx >= 0) {
  // Find the end: semicolon after doSend(...) + newline
  const endMarker = '  };' + '\r\n';
  const endIdx = src.indexOf(endMarker, idx);
  if (endIdx >= 0) {
    const funcEnd = endIdx + endMarker.length;
    src = src.slice(0, idx) + src.slice(funcEnd);
    console.log('Removed aiEditCode function at', idx);
  } else {
    console.log('Could not find end of aiEditCode');
  }
} else {
  console.log('aiEditCode not found');
}

if (src !== orig) {
  fs.writeFileSync(path, src, 'utf8');
  console.log('Updated. Size:', orig.length, '->', src.length);
} else {
  console.log('No changes');
}

