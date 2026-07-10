const fs = require('fs');
const path = 'C:\\Users\\dave\\WOLFSPACE\\agent\\public\\styles.css';
let src = fs.readFileSync(path, 'utf8');
let orig = src;
const NL = '\n';

// Remove .ctb-ai block
const ctbAi = '.ctb-ai {' + NL + '  color: var(--brand);' + NL + '}' + NL;
const ctbIdx = src.indexOf(ctbAi);
if (ctbIdx >= 0) {
  src = src.slice(0, ctbIdx) + src.slice(ctbIdx + ctbAi.length);
  console.log('Removed .ctb-ai');
} else {
  console.log('.ctb-ai not found with LF');
  // Try with CRLF
  const alt = '.ctb-ai {\r\n  color: var(--brand);\r\n}\r\n';
  const idx = src.indexOf(alt);
  console.log('With CRLF:', idx);
}

// Remove .lang-trigger rules (4 blocks)
// From ".lang-trigger {" to end of ".lang-trigger .chev { ... }"
const patterns = [
  '.lang-trigger {' + NL + '  display: inline-flex;' + NL + '  align-items: center;' + NL + '  gap: 7px;' + NL + '  background: var(--surface-2, #11151c);' + NL + '  border: 1px solid var(--line-strong, #26303c);' + NL + '  color: var(--text, #e6edf3);' + NL + '  border-radius: 8px;' + NL + '  padding: 4px 8px;' + NL + '  font-size: 12px;' + NL + '  cursor: pointer;' + NL + '  transition: border-color 0.15s;' + NL + '}' + NL,
  '.lang-trigger:hover {' + NL + '  border-color: var(--brand, #5eead4);' + NL + '}' + NL,
  '.lang-trigger .lang-name {' + NL + '  font-weight: 500;' + NL + '}' + NL,
  '.lang-trigger .chev {' + NL + '  color: var(--text-muted, #8b98a9);' + NL + '}' + NL,
];

let changed = false;
patterns.forEach(p => {
  if (src.includes(p)) {
    src = src.replace(p, '');
    changed = true;
    console.log('Removed:', p.split(NL)[0]);
  } else {
    console.log('Not found:', p.split(NL)[0]);
  }
});

if (changed) {
  fs.writeFileSync(path, src, 'utf8');
  console.log('Updated. Size:', orig.length, '->', src.length);
} else {
  console.log('No changes. Checking alt...');
  // Try with CRLF
  const alt = '.lang-trigger {\r\n  display: inline-flex;\r\n';
  const idx = src.indexOf(alt);
  console.log('CRLF version at:', idx);
}

