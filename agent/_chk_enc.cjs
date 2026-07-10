const fs = require('fs');
const b = fs.readFileSync('C:\\Users\\dave\\WOLFSPACE\\agent\\public\\app.jsx');
console.log('size', b.length);
const i = b.indexOf('aiOpen');
console.log('aiOpen idx', i);
if (i !== -1) {
  const start = Math.max(0, i - 30);
  console.log('HEX:', b.slice(start, i + 60).toString('hex'));
  console.log('TXT:', b.slice(start, i + 60).toString('utf8'));
} else {
  console.log('NOT FOUND');
  // Try to find nearby text
  const s = b.indexOf('useState');
  console.log('useState idx', s);
  if (s !== -1) {
    console.log('hex around useState:', b.slice(Math.max(0,s-10), s+50).toString('hex'));
  }
}

