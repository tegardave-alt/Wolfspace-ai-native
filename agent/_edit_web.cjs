const fs = require('fs');
const path = 'C:\\Users\\dave\\WOLFSPACE\\agent\\web\\app.jsx';
let src = fs.readFileSync(path, 'utf8');
let orig = src;
const NL = '\n';

// 1. Remove LangSelect component
const langSelectIdx = src.indexOf('function LangSelect({ value, onChange }){');
const codeBlockIdx = src.indexOf('function CodeBlock({ lang, code');
if (langSelectIdx >= 0 && codeBlockIdx > langSelectIdx) {
  // Find the closing "}" of LangSelect before blank line before CodeBlock
  const beforeCodeBlock = src.lastIndexOf(NL + NL, codeBlockIdx);
  const langSelectEnd = src.lastIndexOf(NL + '}', beforeCodeBlock - 2) + 1;
  src = src.slice(0, langSelectIdx) + src.slice(langSelectEnd);
  console.log('Removed LangSelect component');
} else {
  console.log('LangSelect not found or already removed');
}

// 2. Remove onAiEdit/busy from CodeBlock signature, remove aiOpen/ins state, remove doAi
// Remove the doAi line
src = src.replace(
  NL + '  const doAi = () => { const t=ins.trim(); if(!t||busy) return; setAiOpen(false); setIns(""); onAiEdit(getCode(), language, t); };',
  ''
);
// Remove aiOpen and ins state lines
src = src.replace(
  '  const [language, setLanguage] = useState((lang || "python").toLowerCase());' + NL +
  '  const [aiOpen, setAiOpen] = useState(false);' + NL +
  '  const [ins, setIns] = useState("");',
  '  const [language, setLanguage] = useState((lang || "python").toLowerCase());'
);
// Remove "onAiEdit, busy" from CodeBlock signature
src = src.replace(
  'function CodeBlock({ lang, code, onAiEdit, busy }) {',
  'function CodeBlock({ lang, code }) {'
);
console.log('Updated CodeBlock');

// 3. Remove AI Edit button line
src = src.replace(
  '        <button className="ctb-btn ctb-ai" onClick={()=>setAiOpen(o=>!o)}><Icon.spark style={{width:13,height:13}} /> AI Edit</button>' + NL,
  ''
);
console.log('Removed AI Edit button');

// 4. Remove LangSelect line from toolbar
src = src.replace(
  '        <LangSelect value={language} onChange={setLanguage} />' + NL,
  ''
);
console.log('Removed LangSelect from toolbar');

// 5. Remove ai-panel block
const aiPanel = '      {aiOpen && (' + NL +
  '        <div className="ai-panel">' + NL +
  '          <textarea value={ins} onChange={(e)=>setIns(e.target.value)} placeholder="Instruksi AI… (mis. tambah error handling, ubah ke async)"' + NL +
  '            onKeyDown={(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); doAi(); } }} />' + NL +
  '          <div className="ai-row"><button className="ai-go" onClick={doAi}>✦ Generate</button><button className="ctb-btn" onClick={()=>setAiOpen(false)}>Batal</button></div>' + NL +
  '        </div>' + NL +
  '      )}' + NL;
if (src.includes(aiPanel)) {
  src = src.replace(aiPanel, '');
  console.log('Removed ai-panel');
} else {
  console.log('ai-panel not found with exact match');
}

// 6. Remove onAiEdit/busy from Blocks
src = src.replace(
  'function Blocks({ text, onAiEdit, busy }) {',
  'function Blocks({ text }) {'
);
// Remove onAiEdit={onAiEdit} busy={busy} from CodeBlock usage in Blocks
src = src.replace(
  '<CodeBlock key={i} lang={b.lang} code={b.code} onAiEdit={onAiEdit} busy={busy} />',
  '<CodeBlock key={i} lang={b.lang} code={b.code} />'
);
console.log('Updated Blocks');

// 7. Remove onAiEdit/busy from Message
src = src.replace(
  'function Message({ msg, onAiEdit, busy, onOpenCanvas }) {',
  'function Message({ msg, onOpenCanvas }) {'
);
// AgentSteps usage
src = src.replace(
  '<AgentSteps run={msg.agent||{}} onAiEdit={onAiEdit} busy={busy} />',
  '<AgentSteps run={msg.agent||{}} />'
);
// Blocks usage
src = src.replace(
  '<Blocks text={msg.text} onAiEdit={onAiEdit} busy={busy} />',
  '<Blocks text={msg.text} />'
);
console.log('Updated Message');

// 8. Remove onAiEdit/busy from AgentSteps
src = src.replace(
  'function AgentSteps({ run, onAiEdit, busy }){',
  'function AgentSteps({ run }){'
);
// Blocks in AgentSteps (2 occurrences)
src = src.replace(
  '<Blocks text={summary} onAiEdit={onAiEdit} busy={busy} />',
  '<Blocks text={summary} />'
);
console.log('Updated AgentSteps');

// 9. Remove aiEditCode function
const aiEditIdx = src.indexOf('const aiEditCode = (code, lang, instruction) => {');
if (aiEditIdx >= 0) {
  // Find the end: semicolon on the same line + newline
  const endMarker = '  };' + NL;
  const endIdx = src.indexOf(endMarker, aiEditIdx);
  if (endIdx >= 0) {
    src = src.slice(0, aiEditIdx) + src.slice(endIdx + endMarker.length);
    console.log('Removed aiEditCode function');
  } else {
    console.log('Could not find end of aiEditCode');
  }
} else {
  console.log('aiEditCode not found');
}

// 10. Remove onAiEdit={aiEditCode} busy={busy} from Message usage
src = src.replace(
  '<Message key={i} msg={m} onAiEdit={aiEditCode} busy={busy} onOpenCanvas={openCanvas} />',
  '<Message key={i} msg={m} onOpenCanvas={openCanvas} />'
);
console.log('Removed onAiEdit/busy from Message usage');

if (src === orig) {
  console.log('NO CHANGES MADE');
  // Debug
  const checks = ['LangSelect', 'doAi', 'aiOpen', 'ctb-ai', 'aiEditCode', '(msg.text)'];
  checks.forEach(c => {
    const idx = src.indexOf(c);
    if (idx >= 0) console.log(c, 'still present at', idx);
  });
} else {
  fs.writeFileSync(path, src, 'utf8');
  console.log('Updated web/app.jsx. Size:', orig.length, '->', src.length);
}

