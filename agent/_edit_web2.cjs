const fs = require('fs');
const path = 'C:\\Users\\dave\\WOLFSPACE\\agent\\web\\app.jsx';
let src = fs.readFileSync(path, 'utf8');
let orig = src;
const NL = '\r\n';

// 1. Remove LangSelect component
const langSelectIdx = src.indexOf('function LangSelect({ value, onChange }){');
const codeBlockIdx = src.indexOf('function CodeBlock({ lang, code');
if (langSelectIdx >= 0 && codeBlockIdx > langSelectIdx) {
  const beforeCodeBlock = src.lastIndexOf(NL + NL, codeBlockIdx);
  const langSelectEnd = src.lastIndexOf(NL + '}', beforeCodeBlock - 2) + 1;
  src = src.slice(0, langSelectIdx) + src.slice(langSelectEnd);
  console.log('Removed LangSelect component');
}

// 2. Remove onAiEdit/busy from CodeBlock signature
src = src.replace(
  'function CodeBlock({ lang, code, onAiEdit, busy }) {',
  'function CodeBlock({ lang, code }) {'
);

// 3. Remove doAi line
src = src.replace(
  '  const doAi = () => { const t=ins.trim(); if(!t||busy) return; setAiOpen(false); setIns(""); onAiEdit(getCode(), language, t); };' + NL,
  ''
);

// 4. Remove aiOpen and ins state lines
src = src.replace(
  '  const [language, setLanguage] = useState((lang || "python").toLowerCase());' + NL +
  '  const [aiOpen, setAiOpen] = useState(false);' + NL +
  '  const [ins, setIns] = useState("");',
  '  const [language, setLanguage] = useState((lang || "python").toLowerCase());'
);

// 5. Remove AI Edit button
src = src.replace(
  '        <button className="ctb-btn ctb-ai" onClick={()=>setAiOpen(o=>!o)}><Icon.spark style={{width:13,height:13}} /> AI Edit</button>' + NL,
  ''
);

// 6. Remove LangSelect from toolbar
src = src.replace(
  '        <LangSelect value={language} onChange={setLanguage} />' + NL,
  ''
);

// 7. Remove ai-panel block
src = src.replace(
  '      {aiOpen && (' + NL +
  '        <div className="ai-panel">' + NL +
  '          <textarea value={ins} onChange={(e)=>setIns(e.target.value)} placeholder="Instruksi AI… (mis. tambah error handling, ubah ke async)"' + NL +
  '            onKeyDown={(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); doAi(); } }} />' + NL +
  '          <div className="ai-row"><button className="ai-go" onClick={doAi}>✦ Generate</button><button className="ctb-btn" onClick={()=>setAiOpen(false)}>Batal</button></div>' + NL +
  '        </div>' + NL +
  '      )}' + NL,
  ''
);

// 8. Remove onAiEdit/busy from Blocks
src = src.replace(
  'function Blocks({ text, onAiEdit, busy }) {',
  'function Blocks({ text }) {'
);
src = src.replace(
  '<CodeBlock key={i} lang={b.lang} code={b.code} onAiEdit={onAiEdit} busy={busy} />',
  '<CodeBlock key={i} lang={b.lang} code={b.code} />'
);

// 9. Remove onAiEdit/busy from Message
src = src.replace(
  'function Message({ msg, onAiEdit, busy, onOpenCanvas }) {',
  'function Message({ msg, onOpenCanvas }) {'
);
src = src.replace(
  '<AgentSteps run={msg.agent||{}} onAiEdit={onAiEdit} busy={busy} />',
  '<AgentSteps run={msg.agent||{}} />'
);
src = src.replace(
  '<Blocks text={msg.text} onAiEdit={onAiEdit} busy={busy} />',
  '<Blocks text={msg.text} />'
);

// 10. Remove onAiEdit/busy from AgentSteps
src = src.replace(
  'function AgentSteps({ run, onAiEdit, busy }){',
  'function AgentSteps({ run }){'
);
// Replace both occurrences
src = src.replace(
  '<Blocks text={summary} onAiEdit={onAiEdit} busy={busy} />',
  '<Blocks text={summary} />'
);

// 11. Remove aiEditCode function
const aiEditIdx = src.indexOf('const aiEditCode = (code, lang, instruction) => {');
if (aiEditIdx >= 0) {
  const endMarker = '  };' + NL;
  const endIdx = src.indexOf(endMarker, aiEditIdx);
  if (endIdx >= 0) {
    src = src.slice(0, aiEditIdx) + src.slice(endIdx + endMarker.length);
    console.log('Removed aiEditCode');
  } else {
    console.log('aiEditCode end not found');
  }
}

// 12. Remove onAiEdit/busy from Message usage in JSX
src = src.replace(
  '<Message key={i} msg={m} onAiEdit={aiEditCode} busy={busy} onOpenCanvas={openCanvas} />',
  '<Message key={i} msg={m} onOpenCanvas={openCanvas} />'
);

if (src === orig) {
  console.log('NO CHANGES');
} else {
  fs.writeFileSync(path, src, 'utf8');
  console.log('Updated. Size:', orig.length, '->', src.length);
}

