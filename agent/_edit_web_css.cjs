const fs = require('fs');
const path = 'C:\\Users\\dave\\WOLFSPACE\\agent\\web\\styles.css';
let src = fs.readFileSync(path, 'utf8');
let orig = src;
const NL = '\n';

const patterns = [
  '.ctb-ai { color: var(--brand); }' + NL,
  '.lang-trigger { display:inline-flex; align-items:center; gap:7px; background:var(--surface-2,#11151c); border:1px solid var(--line-strong,#26303c); color:var(--text,#e6edf3); border-radius:8px; padding:4px 8px; font-size:12px; cursor:pointer; transition:border-color .15s; }' + NL,
  '.lang-trigger:hover { border-color:var(--brand,#5eead4); }' + NL,
  '.lang-trigger .lang-name { font-weight:500; }' + NL,
  '.lang-trigger .chev { color:var(--text-muted,#8b98a9); }' + NL,
];

let changed = false;
patterns.forEach(p => {
  if (src.includes(p)) {
    src = src.replace(p, '');
    changed = true;
    console.log('Removed:', p.split('{')[0].trim());
  } else {
    console.log('Not found:', p.split('{')[0].trim());
    // Try with \r\n
    const p2 = p.replace(/\n/g, '\r\n');
    if (src.includes(p2)) {
      src = src.replace(p2, '');
      changed = true;
      console.log('  Found with CRLF');
    }
  }
});

if (changed) {
  fs.writeFileSync(path, src, 'utf8');
  console.log('Updated. Size:', orig.length, '->', src.length);
} else {
  console.log('No changes');
}

