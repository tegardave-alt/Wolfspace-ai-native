const fs = require('fs');
const path = 'C:\\Users\\dave\\WOLFSPACE\\agent\\web\\app.jsx';
let src = fs.readFileSync(path, 'utf8');
const orig = src;

// The remaining occurrence at line 1915
src = src.replace(
  '<Blocks text={summary} onAiEdit={onAiEdit} busy={busy} />',
  '<Blocks text={summary} />'
);

if (src !== orig) {
  fs.writeFileSync(path, src, 'utf8');
  console.log('Fixed remaining occurrence. Size:', orig.length, '->', src.length);
} else {
  console.log('No remaining occurrence found');
}

