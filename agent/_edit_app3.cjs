const fs = require('fs');
const path = 'C:\\Users\\dave\\WOLFSPACE\\agent\\public\\app.jsx';
let src = fs.readFileSync(path, 'utf8');
let orig = src;
const NL = '\r\n';

// 1. Remove LangSelect component (from "function LangSelect" to the closing "}" before empty line + "function CodeBlock")
const langSelectStart = src.indexOf('function LangSelect({ value, onChange }) {');
const codeBlockStart = src.indexOf('function CodeBlock({ lang, code }) {');
if (langSelectStart >= 0 && codeBlockStart > langSelectStart) {
  // Find the closing "}" of LangSelect - it's right before the empty line before CodeBlock
  const beforeCodeBlock = src.lastIndexOf(NL + NL, codeBlockStart);
  // The "}" closing LangSelect is on the line before the blank line
  const langSelectEnd = src.lastIndexOf(NL + '}', beforeCodeBlock - 2) + 1;
  src = src.slice(0, langSelectStart) + src.slice(langSelectEnd);
  console.log('Removed LangSelect component');
} else {
  console.log('LangSelect not found or already removed');
}

// 2. Remove onAiEdit, busy from Blocks signature + remove onAiEdit/busy from CodeBlock usage
src = src.replace(
  'function Blocks({ text, onAiEdit, busy }) {',
  'function Blocks({ text }) {'
);
// Remove onAiEdit={onAiEdit} and busy={busy} from CodeBlock (two consecutive lines)
src = src.replace(
  '          onAiEdit={onAiEdit}' + NL + '          busy={busy}' + NL,
  ''
);
console.log('Updated Blocks component');

// 3. Remove onAiEdit, busy from Message signature
src = src.replace(
  'function Message({ msg, onAiEdit, busy, onOpenCanvas }) {',
  'function Message({ msg, onOpenCanvas }) {'
);
// Remove onAiEdit/busy from AgentSteps usage in Message
src = src.replace(
  '<AgentSteps run={msg.agent || {}} onAiEdit={onAiEdit} busy={busy} />',
  '<AgentSteps run={msg.agent || {}} />'
);
// Remove onAiEdit/busy from Blocks usage in Message
src = src.replace(
  '<Blocks text={msg.text} onAiEdit={onAiEdit} busy={busy} />',
  '<Blocks text={msg.text} />'
);
console.log('Updated Message component');

// 4. Remove onAiEdit, busy from AgentSteps signature
src = src.replace(
  'function AgentSteps({ run, onAiEdit, busy }) {',
  'function AgentSteps({ run }) {'
);
// Remove onAiEdit/busy from Blocks usage in AgentSteps (2 occurrences)
src = src.replace(
  '<Blocks text={summary} onAiEdit={onAiEdit} busy={busy} />',
  '<Blocks text={summary} />'
);
console.log('Updated AgentSteps component');

// 5. Remove aiEditCode function
const aiEditFunc = "  const aiEditCode = (code, lang, instruction) => {" + NL +
  "    const prompt =" + NL +
  '      "Ubah kode berikut sesuai instruksi. Kembalikan HANYA satu blok kode (bertag bahasa " +' + NL +
  "      lang +" + NL +
  '      ").\\nInstruksi: " +' + NL +
  "      instruction +" + NL +
  '      "\\n\\n\`\`\`" +' + NL +
  "      lang +" + NL +
  '      "\\n" +' + NL +
  "      code +" + NL +
  '      "\\n\`\`\`";' + NL +
  "    doSend(prompt, \"\u2666 Ubah (\" + lang + \"): \" + instruction);" + NL +
  "  };" + NL;

if (src.includes(aiEditFunc)) {
  src = src.replace(aiEditFunc, '');
  console.log('Removed aiEditCode function');
} else {
  console.log('aiEditCode exact match NOT found');
  // Try to find where it starts
  const idx = src.indexOf('const aiEditCode');
  if (idx >= 0) {
    console.log('Found aiEditCode at', idx, 'but text differs');
    // Show context
    console.log('Context:', JSON.stringify(src.slice(idx, idx+250)));
  }
}

// 6. Remove onAiEdit={aiEditCode} and busy={busy} from Message usage
src = src.replace(
  '                        onAiEdit={aiEditCode}' + NL + '                        busy={busy}' + NL,
  ''
);
console.log('Removed onAiEdit/busy from Message usage');

if (src === orig) {
  console.log('NO CHANGES MADE');
} else {
  fs.writeFileSync(path, src, 'utf8');
  console.log('Updated. Size:', orig.length, '->', src.length);
  console.log('Removed:', orig.length - src.length, 'bytes');
}

