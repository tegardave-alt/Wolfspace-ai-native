const fs = require('fs');
const path = 'C:\\Users\\dave\\WOLFSPACE\\agent\\public\\app.jsx';
let src = fs.readFileSync(path, 'utf8');
let orig = src;
const NL = '\r\n';

// 1. Remove LangSelect component (from "function LangSelect" to the closing "}" before "function CodeBlock")
src = src.replace(
  'function LangSelect({ value, onChange }) {' + NL +
  '  const [open, setOpen] = useState(false);' + NL +
  '  const ref = useRef(null);' + NL +
  NL +
  '  useEffect(() => {' + NL +
  '    if (!open) return;' + NL +
  '    const h = (e) => {' + NL +
  '      if (ref.current && !ref.current.contains(e.target)) setOpen(false);' + NL +
  '    };' + NL +
  '    document.addEventListener("mousedown", h);' + NL +
  '    return () => document.removeEventListener("mousedown", h);' + NL +
  '  }, [open]);' + NL +
  '  const meta = (l) =>' + NL +
  '    LANG_META[l] || { l, s: (l || "?").slice(0, 2), c: "#7c8aa0" };' + NL +
  '  const cur = meta(value);' + NL +
  '  return (' + NL +
  '    <div className="lang-select" ref={ref}>' + NL +
  '      <button' + NL +
  '        className="lang-trigger"' + NL +
  '        onClick={() => setOpen((o) => !o)}' + NL +
  '        title="Pilih bahasa"' + NL +
  '      >' + NL +
  '        <LangIcon lang={value} />' + NL +
  '        <span className="lang-name">{cur.l}</span>' + NL +
  '        <Icon.chev className="chev" style={{ width: 13, height: 13 }} />' + NL +
  '      </button>' + NL +
  '      {open && (' + NL +
  '        <div className="lang-menu">' + NL +
  '          {LANGS.map((l) => {' + NL +
  '            const m = meta(l);' + NL +
  '            return (' + NL +
  '              <button' + NL +
  '                key={l}' + NL +
  '                className={"lang-opt" + (l === value ? " active" : "")}' + NL +
  '                onClick={() => {' + NL +
  '                  onChange(l);' + NL +
  '                  setOpen(false);' + NL +
  '                }}' + NL +
  '              >' + NL +
  '                <LangIcon lang={l} />' + NL +
  '                <span>{m.l}</span>' + NL +
  '                {l === value ? (' + NL +
  '                  <Icon.check' + NL +
  '                    style={{ width: 13, height: 13, marginLeft: "auto" }}' + NL +
  '                  />' + NL +
  '                ) : null}' + NL +
  '              </button>' + NL +
  '            );' + NL +
  '          })}' + NL +
  '        </div>' + NL +
  '      )}' + NL +
  '    </div>' + NL +
  '  );' + NL +
  '}' + NL,
  ''
);

// 2. Remove onAiEdit and busy from Blocks component
src = src.replace(
  'function Blocks({ text, onAiEdit, busy }) {',
  'function Blocks({ text }) {'
);
src = src.replace(
  'onAiEdit={onAiEdit}' + NL + '            busy={busy}',
  ''
);

// 3. Remove onAiEdit and busy from Message component  
src = src.replace(
  'function Message({ msg, onAiEdit, busy, onOpenCanvas }) {',
  'function Message({ msg, onOpenCanvas }) {'
);
src = src.replace(
  /<AgentSteps run=\{msg\.agent \|\| \{\}\} onAiEdit=\{onAiEdit\} busy=\{busy\} \/>/g,
  '<AgentSteps run={msg.agent || {}} />'
);
src = src.replace(
  /<Blocks text=\{msg\.text\} onAiEdit=\{onAiEdit\} busy=\{busy\} \/>/g,
  '<Blocks text={msg.text} />'
);

// 4. Remove onAiEdit and busy from AgentSteps component
src = src.replace(
  'function AgentSteps({ run, onAiEdit, busy }) {',
  'function AgentSteps({ run }) {'
);
src = src.replace(
  /<Blocks text=\{summary\} onAiEdit=\{onAiEdit\} busy=\{busy\} \/>/g,
  '<Blocks text={summary} />'
);

// 5. Remove aiEditCode function
src = src.replace(
  "  const aiEditCode = (code, lang, instruction) => {" + NL +
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
  "  };" + NL,
  ''
);

// 6. Remove onAiEdit={aiEditCode} busy={busy} from Message usage  
src = src.replace(
  'onAiEdit={aiEditCode}' + NL + '                        busy={busy}',
  ''
);

if (src === orig) {
  console.log('NO CHANGES. Debug info:');
  const checks = ['function LangSelect', 'function Blocks({ text', 'function Message({ msg', 'function AgentSteps({ run', 'const aiEditCode = ', 'onAiEdit={aiEditCode}'];
  checks.forEach(c => {
    const idx = src.indexOf(c);
    console.log(c, idx);
  });
} else {
  fs.writeFileSync(path, src, 'utf8');
  console.log('Updated. Size:', orig.length, '->', src.length);
  console.log('Removed:', orig.length - src.length, 'bytes');
}

