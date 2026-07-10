const fs = require('fs');
const path = 'C:\\Users\\dave\\WOLFSPACE\\agent\\public\\styles.css';
let src = fs.readFileSync(path, 'utf8');
let orig = src;
const NL = '\r\n';

// Remove .ctb-ai block (3 lines)
src = src.replace(
  '.ctb-ai {' + NL + '  color: var(--brand);' + NL + '}' + NL,
  ''
);

// Remove .lang-trigger block (from .lang-trigger { to closing } of .lang-trigger .chev)
const langTriggerStart = src.indexOf('.lang-trigger {');
if (langTriggerStart >= 0) {
  // Find the end of the last .lang-trigger rule - the "}" of .lang-trigger .chev on line 3675
  const afterLastBlock = '.lang-trigger .chev {' + NL + '  color: var(--text-muted, #8b98a9);' + NL + '}' + NL;
  const afterIdx = src.indexOf(afterLastBlock, langTriggerStart);
  if (afterIdx >= 0) {
    const endIdx = afterIdx + afterLastBlock.length;
    // Also remove the blank line before
    const before = src.lastIndexOf(NL + NL, langTriggerStart);
    if (before >= 0 && before < langTriggerStart) {
      src = src.slice(0, before) + src.slice(endIdx);
    } else {
      src = src.slice(0, langTriggerStart) + src.slice(endIdx);
    }
    console.log('Removed .lang-trigger blocks');
  } else {
    console.log('Could not find end of .lang-trigger blocks');
  }
} else {
  console.log('.lang-trigger not found');
}

if (src !== orig) {
  fs.writeFileSync(path, src, 'utf8');
  console.log('Updated. Size:', orig.length, '->', src.length);
} else {
  console.log('No changes');
}

