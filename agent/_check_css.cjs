const fs = require('fs');
const path = 'C:\\Users\\dave\\WOLFSPACE\\agent\\public\\styles.css';
const src = fs.readFileSync(path, 'utf8');

// Find .ctb-ai
const idx1 = src.indexOf('.ctb-ai');
console.log('.ctb-ai at', idx1);
if (idx1 >= 0) {
  console.log('ctx:', JSON.stringify(src.slice(idx1, idx1+50)));
}

// Find .lang-trigger  
const idx2 = src.indexOf('.lang-trigger');
console.log('.lang-trigger at', idx2);
if (idx2 >= 0) {
  console.log('ctx:', JSON.stringify(src.slice(idx2, idx2+50)));
  // Find the matching end
  const idx3 = src.indexOf('}', idx2);
  console.log('first } at', idx3, ':', JSON.stringify(src.slice(idx2, idx3+1)));
}

