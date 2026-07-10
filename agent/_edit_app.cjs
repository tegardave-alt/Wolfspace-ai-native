const fs = require('fs');
const path = 'C:\\Users\\dave\\WOLFSPACE\\agent\\public\\app.jsx';
let src = fs.readFileSync(path, 'utf8');
let orig = src;

// 1. Remove "onAiEdit, busy" from CodeBlock signature
src = src.replace(
  'function CodeBlock({ lang, code, onAiEdit, busy }) {',
  'function CodeBlock({ lang, code }) {'
);

// 2. Remove aiOpen and ins state lines + blank line after them
src = src.replace(
  "  const [language, setLanguage] = useState((lang || \"python\").toLowerCase());\r\n  const [aiOpen, setAiOpen] = useState(false);\r\n  const [ins, setIns] = useState(\"\");\r\n  const [runState, setRunState] = useState(\"idle\");",
  "  const [language, setLanguage] = useState((lang || \"python\").toLowerCase());\r\n  const [runState, setRunState] = useState(\"idle\");"
);

// 3. Remove doAi function 
src = src.replace(
  "  const doAi = () => {\r\n    const t = ins.trim();\r\n    if (!t || busy) return;\r\n    setAiOpen(false);\r\n    setIns(\"\");\r\n    onAiEdit(getCode(), language, t);\r\n  };\r\n",
  ""
);

// 4. Remove AI Edit button
src = src.replace(
  '        <button className="ctb-btn ctb-ai" onClick={() => setAiOpen((o) => !o)}>\r\n          <Icon.spark style={{ width: 13, height: 13 }} /> AI Edit\r\n        </button>\r\n',
  ""
);

// 5. Remove ai-panel block
src = src.replace(
  "      {aiOpen && (\r\n        <div className=\"ai-panel\">\r\n          <textarea\r\n            value={ins}\r\n            onChange={(e) => setIns(e.target.value)}\r\n            placeholder=\"Instruksi AI… (mis. tambah error handling, ubah ke async)\"\r\n            onKeyDown={(e) => {\r\n              if (e.key === \"Enter\" && !e.shiftKey) {\r\n                e.preventDefault();\r\n                doAi();\r\n              }\r\n            }}\r\n          />\r\n          <div className=\"ai-row\">\r\n            <button className=\"ai-go\" onClick={doAi}>\r\n              ✦ Generate\r\n            </button>\r\n            <button className=\"ctb-btn\" onClick={() => setAiOpen(false)}>\r\n              Batal\r\n            </button>\r\n          </div>\r\n        </div>\r\n      )}",
  ""
);

// 6. Remove LangSelect from toolbar
src = src.replace(
  '        <LangSelect value={language} onChange={setLanguage} />\r\n',
  ""
);

if (src === orig) {
  console.log('NO CHANGES MADE - patterns did not match');
  // Debug: check what's around the expected areas
  const idx1 = src.indexOf('CodeBlock');
  console.log('CodeBlock at', idx1);
  const idx2 = src.indexOf('aiOpen');
  console.log('aiOpen at', idx2);
  const idx3 = src.indexOf('doAi');
  console.log('doAi at', idx3);
  const idx4 = src.indexOf('ctb-ai');
  console.log('ctb-ai at', idx4);
  const idx5 = src.indexOf('ai-panel');
  console.log('ai-panel at', idx5);
  const idx6 = src.indexOf('LangSelect');
  console.log('LangSelect at', idx6);
} else {
  fs.writeFileSync(path, src, 'utf8');
  console.log('File updated. Size:', orig.length, '->', src.length);
  console.log('Bytes removed:', orig.length - src.length);
}

