const fs = require('fs');
const path = 'C:\\Users\\dave\\WOLFSPACE\\agent\\web\\app.jsx';
const src = fs.readFileSync(path, 'utf8');

// Check ai-panel exact text
const idx = src.indexOf('ai-panel');
if (idx >= 0) {
  console.log('ai-panel context:', JSON.stringify(src.slice(idx - 20, idx + 400)));
}

// Check aiEditCode exact text
const idx2 = src.indexOf('const aiEditCode');
if (idx2 >= 0) {
  console.log('aiEditCode context:', JSON.stringify(src.slice(idx2, idx2 + 400)));
  const endMarker = '  };' + '\n';
  const endIdx = src.indexOf(endMarker, idx2);
  console.log('endMarker found at:', endIdx);
  if (endIdx >= 0) {
    console.log('end context:', JSON.stringify(src.slice(endIdx, endIdx + 10)));
  }
}

