const { useState, useRef, useEffect, useCallback } = React;

/* ----------------------------- Icons ----------------------------- */
const Icon = {
  spark: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 2.5l1.9 5.1 5.1 1.9-5.1 1.9L12 16.5l-1.9-5.1L5 9.5l5.1-1.9L12 2.5z" fill="currentColor"/><path d="M18.5 14.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4z" fill="currentColor" opacity="0.7"/></svg>),
  caret: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  chev: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  reset: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.3M3 4v3.3h3.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  copy: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  check: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  send: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M4 12l16-8-5 16-3.5-6L4 12z" fill="currentColor"/></svg>),
  target: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>),
  arrow: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  play: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M7 5l12 7-12 7V5z" fill="currentColor"/></svg>),
  pencil: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M14.5 5.5l4 4M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  loader: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 3a9 9 0 109 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>),
  sun: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  moon: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>),
};
const HubIcon = {
  back: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  search: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2"/><path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  download: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  check: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  loader: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 3a9 9 0 109 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>),
  star: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 2l2.9 6.3L22 9.2l-5 4.6 1.3 6.9L12 17.5l-6.3 3.2L7 13.8 2 9.2l7.1-.9L12 2z" fill="currentColor"/></svg>),
  dl: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 5v10m0 0l-3-3m3 3l3-3M6 17h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  hf: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M7.5 7.5a2.5 2.5 0 015 0v3h-5v-3zm4 0a2.5 2.5 0 015 0v3h-5v-3zm-5 5h5v4a2 2 0 01-2 2h-1a2 2 0 01-2-2v-4zm6 0h5v4a2 2 0 01-2 2h-1a2 2 0 01-2-2v-4z" fill="currentColor"/></svg>),
  empty: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="2"/><path d="M8 12h8M10 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
};
function BrandMark({ className }) { return (<span className={"brand-mark " + (className || "")}><Icon.spark style={{ color: "#fff" }} /></span>); }

/* ----------------------------- Backend glue ----------------------------- */
const PREFIXES = [["github_pat_","github","GitHub Models"],["ghp_","github","GitHub Models"],["sk-ant-","anthropic","Claude"],["sk-or-","openrouter","OpenRouter"],["gsk_","groq","Groq"],["AIza","gemini","Gemini"],["sk-","openai","OpenAI"]];
const CLOUD_DEFAULT = { anthropic:"claude", openai:"gpt-4o", openrouter:"anthropic/claude-opus-4-8", groq:"llama", qwen:"qwen", deepseek:"chat", github:"gpt-4o", gemini:"gemini-2.0-flash", custom:"gpt-4o" };
const PROVIDER_LABELS = { openai:"OpenAI", qwen:"Qwen", groq:"Groq", openrouter:"OpenRouter", anthropic:"Claude", deepseek:"DeepSeek", github:"GitHub Models", gemini:"Gemini", custom:"Custom" };
const PROVIDER_OPTS = ["auto","openai","qwen","deepseek","github","groq","openrouter","anthropic","gemini","custom"];
function detectPrefix(key){ key=(key||"").trim(); for(const [p,prov,name] of PREFIXES) if(key.startsWith(p)) return {provider:prov,name}; return key?{provider:"openai",name:"OpenAI"}:null; }
function keyish(s){ return /^(sk-|gsk_|AIza|github_pat_|ghp_)/.test((s||"").trim()); }
function getCloud(){ try{ return JSON.parse(localStorage.getItem("quantum_cloud")||"null"); }catch(e){ return null; } }
function setCloudLS(c){ if(c) localStorage.setItem("quantum_cloud", JSON.stringify(c)); else localStorage.removeItem("quantum_cloud"); }
function escHtml(s){ return s.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
function mdToHtml(s){ let h=escHtml(s); h=h.replace(/`([^`\n]+)`/g,'<span class="inline-code">$1</span>'); h=h.replace(/\*\*([^*\n]+)\*\*/g,"<strong>$1</strong>"); return h.replace(/\n/g,"<br/>"); }
function parseBlocks(text){
  const out=[]; const re=/```(\w*)\n?([\s\S]*?)```/g; let last=0,m;
  while((m=re.exec(text))){ const pre=text.slice(last,m.index); if(pre.trim()) out.push({type:"text",html:mdToHtml(pre)}); out.push({type:"code",lang:(m[1]||"text"),code:m[2].replace(/\n$/,"")}); last=re.lastIndex; }
  const tail=text.slice(last); const open=tail.indexOf("```");
  if(open>=0){ const pre=tail.slice(0,open); if(pre.trim()) out.push({type:"text",html:mdToHtml(pre)}); out.push({type:"code",lang:"",code:tail.slice(open).replace(/^```\w*\n?/,"")}); }
  else if(tail.trim()) out.push({type:"text",html:mdToHtml(tail)});
  return out;
}
function reqFor(modelVal, cloud, history){ return (modelVal==="cloud" && cloud) ? { history, cloud } : { history, port: modelVal }; }
async function streamChat(reqBody, onText, signal){
  let acc="", run=null;
  const r = await fetch("/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(reqBody),signal});
  const reader=r.body.getReader(); const dec=new TextDecoder(); let buf="";
  while(true){ const {done,value}=await reader.read(); if(done) break;
    buf+=dec.decode(value,{stream:true}); const lines=buf.split("\n"); buf=lines.pop();
    for(const line of lines){ const mm=line.match(/^data:\s*(.*)$/); if(!mm) continue; let j; try{ j=JSON.parse(mm[1]); }catch(e){ continue; }
      if(j.t==="tok"){ acc+=j.c; onText(acc,run); }
      else if(j.t==="retry"){ acc=""; run=null; onText(acc,run); }   // new fix attempt → drop the previous failed one
      else if(j.t==="run"){ run=j.run; onText(acc,run); }
      else if(j.t==="done"){ run=j.run||run; onText(acc,run); }
      else if(j.t==="err"){ acc+="\n["+j.m+"]"; onText(acc,run); }
    } }
  return { text: acc, run };
}

/* ----------------------------- Top bar ----------------------------- */
function TopBar({ models, modelVal, setModelVal, compare, setCompare, compareVal, setCompareVal, panelOpen, setPanelOpen, onReset, status, theme, setTheme }) {
  return (
    <header className="topbar">
      <button className={"brand-btn" + (panelOpen ? " open" : "")} onClick={() => setPanelOpen(!panelOpen)}>
        <BrandMark /><span className="brand-name">Quantum</span>
        <Icon.caret className="brand-caret" style={{ width: 14, height: 14 }} />
      </button>
      <div className="tb-spacer" /><span className="tb-label">Model</span>
      <div className="model-select">
        <select value={modelVal} onChange={(e) => setModelVal(e.target.value)}>
          {models.map((m) => <option key={m.value} value={m.value} disabled={m.disabled}>{m.label}</option>)}
        </select>
        <Icon.chev className="chev" style={{ width: 15, height: 15 }} />
      </div>
      <button className="tb-btn" onClick={onReset}><Icon.reset /> Reset</button>
      <button className={"compare" + (compare ? " on" : "")} onClick={() => setCompare(!compare)}><span className="toggle" />Bandingkan</button>
      {compare && (
        <div className="model-select">
          <select value={compareVal} onChange={(e) => setCompareVal(e.target.value)}>
            {models.map((m) => <option key={m.value} value={m.value} disabled={m.disabled}>{m.label}</option>)}
          </select>
          <Icon.chev className="chev" style={{ width: 15, height: 15 }} />
        </div>
      )}
      <div className="tb-spacer" />
      <button className="theme-toggle" title="Ganti tema" onClick={()=>setTheme(theme==="dark"?"light":"dark")}>{theme==="dark"?<Icon.sun/>:<Icon.moon/>}</button>
    </header>
  );
}

/* ----------------------------- HuggingFace models ----------------------------- */
function fmtSize(b){ if(!b) return ""; const gb=b/1073741824; return gb>=1 ? gb.toFixed(2)+" GB" : (b/1048576).toFixed(0)+" MB"; }
function HFModels({ onSaved }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [sel, setSel] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null);
  const [msg, setMsg] = useState("");
  const search = async () => { const t=q.trim(); if(!t) return; setMsg("mencari…"); setResults([]); setSel(""); setFiles([]);
    try { const r = await (await fetch("/hf/search?q="+encodeURIComponent(t))).json(); if(r.error) throw new Error(r.error); setResults(r); setMsg(r.length?"":"tidak ada hasil"); }
    catch(e){ setMsg("gagal: "+e.message); } };
  const pick = async (id) => { setSel(id); setFiles([]); setMsg("memuat file…");
    try { const r = await (await fetch("/hf/files?id="+encodeURIComponent(id))).json(); if(r.error) throw new Error(r.error); setFiles(r); setMsg(r.length?"":"tak ada file .gguf di repo ini"); }
    catch(e){ setMsg("gagal: "+e.message); } };
  const download = async (file) => { if(busy) return; setBusy(true); setProg(0); setMsg("mengunduh "+file.split("/").pop()+"…");
    try {
      const res = await fetch("/hf/download",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:sel,file})});
      const reader=res.body.getReader(); const dec=new TextDecoder(); let buf="";
      while(true){ const {done,value}=await reader.read(); if(done) break; buf+=dec.decode(value,{stream:true}); const lines=buf.split("\n"); buf=lines.pop();
        for(const line of lines){ const m=line.match(/^data:\s*(.*)$/); if(!m) continue; let j; try{ j=JSON.parse(m[1]); }catch(e){ continue; }
          if(j.t==="progress") setProg(j.pct);
          else if(j.t==="done"){ setMsg("✓ "+j.model.name+" diunduh & dijalankan (port "+j.model.port+"). Tunggu ~30 dtk, lalu pilih di dropdown Model."); onSaved && onSaved(); }
          else if(j.t==="err") setMsg("gagal: "+j.m);
        } }
    } catch(e){ setMsg("gagal: "+e.message); }
    setBusy(false); setProg(null);
  };
  return (
    <div className="hf">
      <label className="field-label">Model HuggingFace</label>
      <div className="hf-search">
        <input className="input" value={q} onChange={(e)=>setQ(e.target.value)} placeholder="cari GGUF… (mis. qwen coder)" onKeyDown={(e)=>{ if(e.key==="Enter") search(); }} />
        <button className="btn btn-primary" onClick={search}>Cari</button>
      </div>
      {results.length>0 && (
        <div className="hf-res">{results.map((m)=>(
          <button key={m.id} className={"hf-item"+(sel===m.id?" sel":"")} onClick={()=>pick(m.id)}>
            {m.id}<br/><span className="meta">↓ {m.downloads.toLocaleString()} · ♥ {m.likes}</span>
          </button>
        ))}</div>
      )}
      {sel && files.map((f)=>{ const heavy=f.size>4*1073741824; return (
        <div className="hf-file" key={f.path}>
          <span className="nm">{f.path.split("/").pop()}</span>
          <span className={"sz"+(heavy?" heavy":"")}>{fmtSize(f.size)}{heavy?" ⚠":""}</span>
          <button className="hf-dl" disabled={busy} onClick={()=>download(f.path)}>Unduh</button>
        </div>
      ); })}
      {prog!==null && <div className="hf-bar"><div style={{width:prog+"%"}} /></div>}
      {msg && <div className="hf-msg">{msg}</div>}
    </div>
  );
}

/* ----------------------------- Settings panel ----------------------------- */
function SettingsPanel({ onClose, onSaved, onVisualPicker, onOpenHub }) {
  const stored = getCloud();
  const [cfgOpen, setCfgOpen] = useState(false);
  const [key, setKey] = useState("");
  const [provider, setProvider] = useState(stored ? (stored.baseUrl ? "custom" : stored.provider) : "auto");
  const [model, setModelName] = useState(stored ? (keyish(stored.model) ? "" : stored.model) : "");
  const [baseUrl, setBaseUrl] = useState(stored ? (stored.baseUrl || "") : "");
  const [hint, setHint] = useState(stored ? ("provider " + stored.provider + " ·" + stored.key.slice(-4) + " · aktif") : "Tempel API key, lalu Deteksi atau pilih provider.");

  const detect = async () => {
    const k = key.trim() || (stored && stored.key);
    if (!k) { setHint("Tempel API key dulu."); return; }
    setHint("🔍 Mendeteksi…");
    try {
      const d = await (await fetch("/detect-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:k})})).json();
      if (PROVIDER_LABELS[d.provider]) setProvider(d.provider);
      setHint(d.verified ? ("✓ Terverifikasi: " + d.name) : ("Tebakan: " + d.name + " (belum terverifikasi)"));
    } catch(e){ setHint("Deteksi gagal: " + e.message); }
  };
  const save = () => {
    const k = key.trim() || (stored && stored.key);
    if (!k) { setHint("Tempel API key dulu."); return; }
    let prov, name, bu;
    if (provider === "auto") { const d = detectPrefix(k); prov = d.provider; name = d.name; }
    else if (provider === "custom") { prov = "custom"; name = "Custom"; bu = baseUrl.trim(); if(!bu){ setHint("Isi Base URL untuk custom."); return; } }
    else { prov = provider; name = PROVIDER_LABELS[provider]; }
    let mdl = model.trim();
    if (stored && stored.provider !== prov) mdl = "";
    if (!mdl || keyish(mdl)) mdl = CLOUD_DEFAULT[prov] || "gpt-4o";
    setCloudLS({ key:k, provider:prov, name, model:mdl, baseUrl:bu });
    setHint("Tersimpan: " + prov + " ·" + k.slice(-4) + " → " + mdl);
    onSaved();
  };
  const clear = () => { setCloudLS(null); setKey(""); setModelName(""); setBaseUrl(""); setProvider("auto"); setHint("Dihapus."); onSaved(); };

  return (
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><BrandMark /><span className="name">Quantum</span>{stored && <span className="tag">·{stored.key.slice(-4)}</span>}</div>
        <div className="panel-body">
          <div className={"cfg" + (cfgOpen ? " open" : "")}>
            <button className="cfg-toggle" onClick={() => setCfgOpen((o) => !o)}>
              <span className="status-dot" /><span className="cfg-title">Cloud API</span>
              {!cfgOpen && <span className="cfg-summary">{stored ? stored.provider + " · ·" + stored.key.slice(-4) : "belum diatur"}</span>}
              <Icon.caret className="cfg-caret" style={{ width: 15, height: 15 }} />
            </button>
            {cfgOpen && (
              <div className="cfg-content">
                <div className="field"><label className="field-label">Cloud API Key</label>
                  <input className="input" type="password" autoComplete="new-password" value={key} onChange={(e)=>setKey(e.target.value)}
                    placeholder={stored ? ("Key tersimpan (…" + stored.key.slice(-4) + ") — kosongkan untuk tetap") : "Tempel API key apa saja…"} />
                </div>
                <button className="btn btn-ghost" onClick={detect}>🔍 Deteksi provider dari key</button>
                <div className="field"><label className="field-label">Provider</label>
                  <div className="select-wrap">
                    <select value={provider} onChange={(e)=>setProvider(e.target.value)}>
                      <option value="auto">Auto-deteksi</option>
                      {PROVIDER_OPTS.filter(p=>p!=="auto").map(p=><option key={p} value={p}>{p==="custom"?"OpenAI-compatible (URL custom)":PROVIDER_LABELS[p]}</option>)}
                    </select>
                    <Icon.chev className="chev" style={{ width: 15, height: 15 }} />
                  </div>
                </div>
                {provider === "custom" && (
                  <div className="field"><label className="field-label">Base URL</label>
                    <input className="input" value={baseUrl} onChange={(e)=>setBaseUrl(e.target.value)} placeholder="https://host/v1" /></div>
                )}
                <div className="field"><label className="field-label">Model</label>
                  <input className="input" value={model} onChange={(e)=>setModelName(e.target.value)} placeholder="opsional — mis. qwen, coder, gpt-4o" /></div>
                <div className="provider-status"><span className="status-dot" />{hint}</div>
                <div className="btn-row">
                  <button className="btn btn-primary" onClick={save}><Icon.check style={{width:14,height:14}} /> Simpan</button>
                  <button className="btn btn-danger" onClick={clear}>Hapus</button>
                </div>
              </div>
            )}
          </div>
          <div className="panel-section"><label className="field-label">Alat</label>
            <button className="tool-btn" onClick={onOpenHub}><span className="tool-ico" style={{background:"rgba(255,157,0,0.16)",color:"#ff9d00"}}><HubIcon.hf style={{width:15,height:15}} /></span>Model Hub — Hugging Face<Icon.arrow className="chev" style={{ width: 16, height: 16 }} /></button>
            <button className="tool-btn" style={{marginTop:8}} onClick={onVisualPicker}><span className="tool-ico"><Icon.target style={{width:15,height:15}} /></span>Visual Picker<Icon.arrow className="chev" style={{ width: 16, height: 16 }} /></button>
          </div>
          <div className="panel-footer">— ruang untuk fitur lain —</div>
        </div>
      </div>
    </>
  );
}

/* ----------------------------- Syntax highlight ----------------------------- */
const KW = {
  python: "def class return if elif else for while in and or not import from as with try except finally lambda None True False print pass break continue is global nonlocal yield assert raise del self".split(" "),
  javascript: "function return if else for while const let var class new typeof instanceof import from export default await async try catch finally throw switch case break continue this null undefined true false of in delete void yield".split(" "),
};
KW.typescript = KW.javascript; KW.go = "func return if else for range var const type struct interface package import map chan go defer nil true false switch case break continue".split(" ");
function highlight(code, lang){
  const kws = KW[lang] || KW.javascript;
  const re = /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+\.?\d*\b)|([A-Za-z_$][\w$]*)(\s*\()?/g;
  let out="", last=0, m;
  while((m=re.exec(code))){
    out += escHtml(code.slice(last, m.index));
    if(m[1]) out += '<span class="t-com">'+escHtml(m[1])+'</span>';
    else if(m[2]) out += '<span class="t-str">'+escHtml(m[2])+'</span>';
    else if(m[3]) out += '<span class="t-num">'+escHtml(m[3])+'</span>';
    else if(m[4]!==undefined){
      const w=m[4], paren=m[5]||"";
      if(kws.indexOf(w)>=0) out += '<span class="t-kw">'+escHtml(w)+'</span>';
      else if(paren) out += '<span class="t-fn">'+escHtml(w)+'</span>';
      else out += escHtml(w);
      out += escHtml(paren);
    }
    last = re.lastIndex;
  }
  out += escHtml(code.slice(last));
  return out;
}

/* ----------------------------- Code block ----------------------------- */
const LANGS = ["python","javascript","typescript","bash","go","c","cpp","java","php","rust","kotlin","html","css","json"];
const MLANG = { js:"javascript", javascript:"javascript", node:"javascript", ts:"typescript", typescript:"typescript",
  py:"python", python:"python", go:"go", golang:"go", c:"c", cpp:"cpp", "c++":"cpp", java:"java", php:"php",
  rust:"rust", kotlin:"kotlin", html:"html", css:"css", json:"json", bash:"shell", sh:"shell", shell:"shell", sql:"sql", yaml:"yaml", markdown:"markdown" };
function mLang(l){ return MLANG[(l||"").toLowerCase()] || "plaintext"; }

// Per-language monogram badge (color + short symbol) — clean, no heavy logo assets.
const LANG_META = {
  python:    { l:"Python",     s:"Py",  c:"#3776AB" },
  javascript:{ l:"JavaScript", s:"JS",  c:"#F7DF1E", d:1 },
  typescript:{ l:"TypeScript", s:"TS",  c:"#3178C6" },
  bash:      { l:"Bash",       s:">_",  c:"#4EAA25" },
  go:        { l:"Go",         s:"Go",  c:"#00ADD8" },
  c:         { l:"C",          s:"C",   c:"#5C6BC0" },
  cpp:       { l:"C++",        s:"C+",  c:"#00599C" },
  java:      { l:"Java",       s:"Jv",  c:"#E76F00" },
  php:       { l:"PHP",        s:"php", c:"#777BB4" },
  rust:      { l:"Rust",       s:"Rs",  c:"#D9844B" },
  kotlin:    { l:"Kotlin",     s:"Kt",  c:"#7F52FF" },
  html:      { l:"HTML",       s:"<>",  c:"#E34F26" },
  css:       { l:"CSS",        s:"#",   c:"#1572B6" },
  json:      { l:"JSON",       s:"{}",  c:"#A0A6B0" },
};
const LANG_LOGOS = new Set(["python","javascript","typescript","bash","go","c","cpp","java","php","rust","kotlin","html","css","json"]);
function LangIcon({ lang }){
  const m = LANG_META[lang] || { l:lang, s:(lang||"?").slice(0,2), c:"#7c8aa0" };
  if(LANG_LOGOS.has(lang))
    return <img className="lang-logo" src={"/vendor/lang/"+lang+".svg"} alt={m.l} loading="lazy"
      onError={(e)=>{ const sp=document.createElement("span"); sp.className="lang-badge"; sp.style.background=m.c; sp.style.color=m.d?"#111":"#fff"; sp.textContent=m.s; e.target.replaceWith(sp); }} />;
  return <span className="lang-badge" style={{ background:m.c, color:m.d?"#111":"#fff" }}>{m.s}</span>;
}
function LangSelect({ value, onChange }){
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if(!open) return;
    const h = (e) => { if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const meta = (l) => LANG_META[l] || { l, s:(l||"?").slice(0,2), c:"#7c8aa0" };
  const cur = meta(value);
  return (
    <div className="lang-select" ref={ref}>
      <button className="lang-trigger" onClick={()=>setOpen(o=>!o)} title="Pilih bahasa">
        <LangIcon lang={value} /><span className="lang-name">{cur.l}</span><Icon.chev className="chev" style={{width:13,height:13}} />
      </button>
      {open && (
        <div className="lang-menu">
          {LANGS.map(l => { const m = meta(l); return (
            <button key={l} className={"lang-opt"+(l===value?" active":"")} onClick={()=>{ onChange(l); setOpen(false); }}>
              <LangIcon lang={l} /><span>{m.l}</span>{l===value?<Icon.check style={{width:13,height:13,marginLeft:"auto"}} />:null}
            </button>
          ); })}
        </div>
      )}
    </div>
  );
}

function CodeBlock({ lang, code, onAiEdit, busy }) {
  const [copied, setCopied] = useState(false);
  const [language, setLanguage] = useState((lang || "python").toLowerCase());
  const [aiOpen, setAiOpen] = useState(false);
  const [ins, setIns] = useState("");
  const [runState, setRunState] = useState("idle");
  const [out, setOut] = useState(null);
  const hostRef = useRef(null);
  const edRef = useRef(null);
  const focusedRef = useRef(false);
  const getCode = () => edRef.current ? edRef.current.getValue() : code;

  useEffect(() => {
    let disposed = false;
    if (!window.monacoReady) return;
    window.monacoReady.then((monaco) => {
      if (disposed || !hostRef.current) return;
      const ed = monaco.editor.create(hostRef.current, { value: code, language: mLang(language), theme: "vs-dark",
        automaticLayout: true, minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 13, lineNumbers: "on",
        renderLineHighlight: "none", tabSize: 4, scrollbar: { alwaysConsumeMouseWheel: false }, padding: { top: 8, bottom: 8 }, wordWrap: "off" });
      edRef.current = ed;
      const fit = () => { if (!hostRef.current) return; hostRef.current.style.height = Math.min(Math.max(ed.getContentHeight(), 38), 540) + "px"; ed.layout(); };
      ed.onDidContentSizeChange(fit); fit();
      ed.onDidFocusEditorText(() => { focusedRef.current = true; });
      ed.onDidBlurEditorText(() => { focusedRef.current = false; });
    });
    return () => { disposed = true; if (edRef.current) { edRef.current.dispose(); edRef.current = null; } };
  }, []);
  // follow streaming text until the user starts editing
  useEffect(() => { const ed = edRef.current; if (ed && !focusedRef.current && ed.getValue() !== code) ed.setValue(code); }, [code]);
  useEffect(() => { const ed = edRef.current; if (ed && window.monaco) window.monaco.editor.setModelLanguage(ed.getModel(), mLang(language)); }, [language]);

  const copyCode = () => { navigator.clipboard?.writeText(getCode()); setCopied(true); setTimeout(()=>setCopied(false),1500); };
  const run = async () => {
    setRunState("running"); setOut(null);
    try { const r = await fetch("/run",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({language:language,code:getCode()})}); setOut(await r.json()); }
    catch(e){ setOut({ ok:false, error:"server tidak terjangkau: "+e.message }); }
    setRunState("done");
  };
  const doAi = () => { const t=ins.trim(); if(!t||busy) return; setAiOpen(false); setIns(""); onAiEdit(getCode(), language, t); };

  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-dots"><span style={{background:"#ff5f57"}}/><span style={{background:"#febc2e"}}/><span style={{background:"#28c840"}}/></span>
        <span className="code-lang">{language}</span><span className="lang-spacer" />
      </div>
      <div className="monaco-host" ref={hostRef} />
      <div className="code-toolbar">
        <button className="ctb-btn ctb-run" onClick={run} disabled={runState==="running"}>
          {runState==="running" ? <><Icon.loader className="spin" /> Running…</> : <><Icon.play /> Run</>}
        </button>
        <button className="ctb-btn ctb-ai" onClick={()=>setAiOpen(o=>!o)}><Icon.spark style={{width:13,height:13}} /> AI Edit</button>
        <button className={"ctb-btn"+(copied?" copied":"")} onClick={copyCode}>{copied?<Icon.check/>:<Icon.copy/>} {copied?"Copied":"Copy"}</button>
        <LangSelect value={language} onChange={setLanguage} />
      </div>
      {aiOpen && (
        <div className="ai-panel">
          <textarea value={ins} onChange={(e)=>setIns(e.target.value)} placeholder="Instruksi AI… (mis. tambah error handling, ubah ke async)"
            onKeyDown={(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); doAi(); } }} />
          <div className="ai-row"><button className="ai-go" onClick={doAi}>✦ Generate</button><button className="ctb-btn" onClick={()=>setAiOpen(false)}>Batal</button></div>
        </div>
      )}
      {runState==="done" && out && (
        <div className={"code-output " + (out.ok ? "ok" : "err")}>
          <div className="output-head"><span className="ok-mark">{out.ok?<><Icon.check/> ran (exit 0)</>:<>✗ error</>} · {language}</span></div>
          <div className="output-body">{(out.output||"") + (out.error?("\n"+out.error):"") || "(no output)"}</div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Message ----------------------------- */
function Blocks({ text, onAiEdit, busy }) {
  const blocks = parseBlocks(text);
  if (!blocks.length) return <div className="typing"><span/><span/><span/></div>;
  return blocks.map((b,i) => b.type==="code"
    ? <CodeBlock key={i} lang={b.lang} code={b.code} onAiEdit={onAiEdit} busy={busy} />
    : <p key={i} dangerouslySetInnerHTML={{ __html: b.html }} />);
}
function Verdict({ run }) {
  if (!run) return null;
  const q = run.quality;
  const tier = !q ? "" : q.score >= 85 ? "q-hi" : q.score >= 60 ? "q-mid" : "q-lo";
  return (
    <div className="verdict-wrap">
      <div className={"verdict " + (run.ok ? "ok" : "bad")}>{run.ok ? "✓ terverifikasi (exit 0)" : "⚠ belum lolos"}</div>
      {q && (
        <div className={"quality " + tier}>
          <span className="q-score">kualitas {q.score}/100</span>
          {q.hasTest ? <span className="q-tag">· ada self-test</span> : null}
          {q.notes && q.notes.length > 0 && (
            <ul className="q-notes">
              {q.notes.map((n, i) => <li key={i} className={"q-" + n.sev}>{n.msg}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
function Message({ msg, onAiEdit, busy, onOpenCanvas }) {
  if (msg.role === "user") return (<div className="msg user"><span className="msg-role">you</span><div className="bubble-user">{msg.text}</div></div>);
  if (msg.role === "compare") return (
    <div className="msg model"><span className="msg-role">bandingkan</span>
      <div className="cmp-grid">
        {["a","b"].map((s)=>(
          <div className="cmp-col" key={s}>
            <div className="cmp-head">{s.toUpperCase()} · {msg[s].label}</div>
            <div className="bubble-model">{msg[s].text ? <Blocks text={msg[s].text} onAiEdit={onAiEdit} busy={busy} /> : <div className="typing"><span/><span/><span/></div>}</div>
            <Verdict run={msg[s].run} />
          </div>
        ))}
      </div>
    </div>
  );
  const web = msg.text ? buildPreview(msg.text) : { has:false };
  return (
    <div className="msg model"><span className="msg-role">model</span>
      <div className="bubble-model">{msg.text ? <Blocks text={msg.text} onAiEdit={onAiEdit} busy={busy} /> : <div className="typing"><span/><span/><span/></div>}</div>
      <Verdict run={msg.run} />
      {web.has && onOpenCanvas && <button className="open-canvas-btn" onClick={()=>onOpenCanvas(msg.text, msg.run)}><Icon.spark style={{width:13,height:13}} /> Buka di Canvas (split)</button>}
    </div>
  );
}

/* ----------------------------- Composer ----------------------------- */
// Line icons for the composer "+" menu (match the reference design).
const svg = (p) => <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{p}</svg>;
const MI = {
  plus:   svg(<><path d="M12 5v14"/><path d="M5 12h14"/></>),
  upload: svg(<><path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></>),
  research: svg(<><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v4c0 1.1 2.7 3 6 3s6-1.9 6-3v-4"/></>),
  image:  svg(<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5L5 20"/></>),
  video:  svg(<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M10 9l5 3-5 3V9z"/></>),
  webdev: svg(<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 10l-2 2 2 2"/><path d="M15 10l2 2-2 2"/></>),
  slides: svg(<><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4"/><path d="M8 20h8"/></>),
  more:   svg(<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>),
};
function Composer({ onSend, onCancel, busy, canvasAuto, onToggleCanvas }) {
  const [val, setVal] = useState("");
  const [menu, setMenu] = useState(false);
  const [soon, setSoon] = useState("");
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const grow = () => { const el=ref.current; if(!el) return; el.style.height="auto"; el.style.height=Math.min(el.scrollHeight,180)+"px"; };
  const submit = () => { const v=val.trim(); if(!v||busy) return; onSend(v); setVal(""); requestAnimationFrame(()=>{ if(ref.current) ref.current.style.height="auto"; }); };
  useEffect(() => {
    if(!menu) return;
    const h = (e) => { if(wrapRef.current && !wrapRef.current.contains(e.target)) setMenu(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [menu]);
  const webDev = () => { setMenu(false); onToggleCanvas(); };
  const notYet = (name) => { setMenu(false); setSoon(name + " — segera hadir"); setTimeout(()=>setSoon(""), 2600); };
  return (
    <div className="composer-wrap">
      <div className="composer">
        <div className="composer-add-wrap" ref={wrapRef}>
          <button className={"composer-add"+(menu?" open":"")} title="Tambah" onClick={()=>setMenu(m=>!m)}>{MI.plus}</button>
          {menu && (
            <div className="composer-menu">
              <button className="cm-item" onClick={()=>notYet("Upload attachment")}><i>{MI.upload}</i><span className="cm-lbl"><b>Upload attachment</b><small>file, image, video, audio</small></span></button>
              <div className="cm-sep" />
              <button className={"cm-item"+(canvasAuto?" active":"")} onClick={webDev}><i>{MI.webdev}</i> Web Dev{canvasAuto?<span className="cm-on">aktif</span>:null}</button>
              <div className="cm-sep" />
              <button className="cm-item" onClick={()=>notYet("More")}><i>{MI.more}</i> More <span className="cm-caret">›</span></button>
            </div>
          )}
        </div>
        <textarea ref={ref} rows={1} value={val} placeholder="How can I help you today?"
          onChange={(e)=>{ setVal(e.target.value); grow(); }}
          onKeyDown={(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); submit(); } }} />
        <button className={"send-btn"+(busy?" cancel":"")} onClick={busy?onCancel:submit} disabled={!busy && !val.trim()}>
          {busy ? "Cancel" : <>Send <Icon.send /></>}
        </button>
      </div>
      <div className="composer-hint">
        {soon ? <b style={{color:"var(--brand)"}}>{soon}</b>
              : <><kbd>Enter</kbd> kirim · <kbd>Shift</kbd>+<kbd>Enter</kbd> baris baru{canvasAuto?<> · <b style={{color:"var(--brand)"}}>Web Dev (Canvas) aktif</b></>:null}</>}
      </div>
    </div>
  );
}

/* ----------------------------- Visual Picker ----------------------------- */
function useVisualPicker(){
  return useCallback(()=>{
    let hover=null;
    const move=(e)=>{ const el=e.target; if(hover&&hover!==el) hover.classList.remove("vp-hover"); hover=el; el.classList.add("vp-hover"); };
    const sel=(el)=>{ if(el.id) return "#"+el.id; let s=el.tagName.toLowerCase(); if(typeof el.className==="string"&&el.className.trim()) s+="."+el.className.trim().split(/\s+/)[0]; return s; };
    const click=(e)=>{ e.preventDefault(); e.stopPropagation(); const d=sel(e.target); navigator.clipboard?.writeText(d); stop(); alert("Tersalin selector: "+d); };
    const key=(e)=>{ if(e.key==="Escape") stop(); };
    function stop(){ document.body.classList.remove("vp-on"); if(hover) hover.classList.remove("vp-hover"); document.removeEventListener("mouseover",move,true); document.removeEventListener("click",click,true); document.removeEventListener("keydown",key,true); }
    document.body.classList.add("vp-on");
    document.addEventListener("mouseover",move,true); document.addEventListener("click",click,true); document.addEventListener("keydown",key,true);
  },[]);
}

/* ----------------------------- Model Hub view (real HF) ----------------------------- */
const HUB_CATS = [
  { key:"all", label:"Semua", q:"gguf" }, { key:"code", label:"Code", q:"coder gguf" },
  { key:"chat", label:"Chat", q:"instruct gguf" }, { key:"small", label:"Kecil", q:"1b gguf" },
  { key:"qwen", label:"Qwen", q:"qwen gguf" }, { key:"llama", label:"Llama", q:"llama gguf" },
];
function iconColorFor(s){ const c=["blue","purple","green","orange","red"]; let h=0; for(const ch of s) h=(h*31+ch.charCodeAt(0))>>>0; return c[h%c.length]; }
function fmtN(n){ return n>=1e6?(n/1e6).toFixed(1)+"M":n>=1e3?(n/1e3).toFixed(1)+"k":(""+n); }
function fmtDate(iso){ if(!iso) return ""; try { return new Date(iso).toLocaleDateString("id-ID",{year:"numeric",month:"short"}); } catch(e){ return ""; } }
function ModelHubView({ onBack, theme, setTheme, onUse, onChanged }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [dl, setDl] = useState({});
  const [local, setLocal] = useState([]);
  const ctrls = useRef({});
  const loadLocal = useCallback(async () => { try { setLocal(await (await fetch("/models")).json()); } catch(e){} }, []);
  useEffect(() => { loadLocal(); }, [loadLocal]);
  const stop = (id) => { const c = ctrls.current[id]; if(c){ try{ c.abort(); }catch(e){} } setDl(d=>({ ...d, [id]:{ state:"idle" } })); };
  const delModel = async (port) => { if(!window.confirm("Hapus model ini dari disk?")) return; try { await fetch("/model/delete",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ port }) }); } catch(e){} loadLocal(); onChanged && onChanged(); };
  const [sizes, setSizes] = useState({});       // id -> {bytes, quant}  (the q4 download size)
  const sizeReq = useRef(0);
  const resolveSizes = useCallback(async (list) => {
    const token = ++sizeReq.current;
    for (const m of list) {
      if (token !== sizeReq.current) return;     // a newer search started — stop
      try {
        const files = await (await fetch("/hf/files?id=" + encodeURIComponent(m.id))).json();
        if (Array.isArray(files) && files.length) {
          const pick = files.find(f=>/q4_k_m/i.test(f.path)) || files.find(f=>/q4/i.test(f.path)) || files.slice().sort((a,b)=>a.size-b.size)[0];
          const quant = ((pick.path.match(/q\d[a-z0-9_]*|f16|bf16/i) || [])[0] || "").toLowerCase();
          setSizes(s => ({ ...s, [m.id]: { bytes: pick.size, quant } }));
        } else setSizes(s => ({ ...s, [m.id]: { bytes: 0 } }));
      } catch(e) {}
    }
  }, []);
  const doSearch = useCallback(async (query) => {
    setLoading(true); setMsg("");
    try { const r = await (await fetch("/hf/search?q=" + encodeURIComponent(query))).json(); if(r.error) throw new Error(r.error); setResults(r); setSizes({}); resolveSizes(r); if(!r.length) setMsg("Tidak ada model."); }
    catch(e){ setResults([]); setMsg("Gagal memuat: " + e.message); }
    setLoading(false);
  }, [resolveSizes]);
  useEffect(() => { const c = HUB_CATS.find(x=>x.key===cat) || HUB_CATS[0]; doSearch(q.trim() || c.q); }, [cat]);
  const submit = () => { const c = HUB_CATS.find(x=>x.key===cat) || HUB_CATS[0]; doSearch(q.trim() || c.q); };
  const download = async (id) => {
    if (dl[id] && (dl[id].state==="downloading"||dl[id].state==="resolving")) return;
    setDl(d=>({ ...d, [id]:{ state:"resolving", progress:0 } }));
    try {
      const files = await (await fetch("/hf/files?id=" + encodeURIComponent(id))).json();
      if (files.error || !files.length) { setDl(d=>({ ...d, [id]:{ state:"idle" } })); setMsg('Repo "'+id+'" tak punya file .gguf — coba repo berakhiran "-GGUF".'); return; }
      const pick = files.find(f=>/q4_k_m/i.test(f.path)) || files.find(f=>/q4/i.test(f.path)) || files.slice().sort((a,b)=>a.size-b.size)[0];
      setDl(d=>({ ...d, [id]:{ state:"downloading", progress:0 } }));
      const ctrl = new AbortController(); ctrls.current[id] = ctrl;
      const res = await fetch("/hf/download",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id, file:pick.path }), signal: ctrl.signal });
      const reader=res.body.getReader(); const dec=new TextDecoder(); let buf="";
      while(true){ const {done,value}=await reader.read(); if(done) break; buf+=dec.decode(value,{stream:true}); const lines=buf.split("\n"); buf=lines.pop();
        for(const line of lines){ const m=line.match(/^data:\s*(.*)$/); if(!m) continue; let j; try{ j=JSON.parse(m[1]); }catch(e){ continue; }
          if(j.t==="progress") setDl(d=>({ ...d, [id]:{ state:"downloading", progress:j.pct } }));
          else if(j.t==="done"){ setDl(d=>({ ...d, [id]:{ state:"done", progress:100, port:j.model.port } })); loadLocal(); onChanged && onChanged(); }
          else if(j.t==="err"){ setDl(d=>({ ...d, [id]:{ state:"idle" } })); setMsg("Gagal unduh: "+j.m); }
        } }
    } catch(e){ if(e.name!=="AbortError"){ setDl(d=>({ ...d, [id]:{ state:"idle" } })); setMsg("Gagal: "+e.message); } }
  };
  return (
    <div className="hub">
      <header className="hub-header">
        <button className="hub-back" onClick={onBack}><HubIcon.back /> Kembali</button>
        <span className="tb-divider" />
        <div className="hub-title-group"><span className="hub-hf-mark"><HubIcon.hf /></span><span className="hub-title">Model Hub</span><span className="hub-subtitle">Hugging Face · GGUF</span></div>
        <div className="tb-spacer" />
        <button className="theme-toggle" onClick={()=>setTheme(theme==="dark"?"light":"dark")}>{theme==="dark"?<Icon.sun/>:<Icon.moon/>}</button>
      </header>
      <div className="hub-body"><div className="hub-inner">
        {local.length > 0 && (
          <div className="hub-local">
            <div className="hub-local-title">📦 Model Terunduh ({local.length})</div>
            {local.map(m => (
              <div className="hub-local-row" key={m.port}>
                <div className="hub-local-info"><b>{m.name}</b><span>{m.size ? fmtSize(m.size) : ""} · port {m.port}</span></div>
                <button className="m-use-btn" onClick={()=>onUse(m.port)}>Gunakan</button>
                <button className="hub-del" onClick={()=>delModel(m.port)}>Hapus</button>
              </div>
            ))}
          </div>
        )}
        <div className="hub-controls">
          <div className="hub-search"><HubIcon.search /><input placeholder="Cari model GGUF… (llama, coder, qwen, phi)" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") submit(); }} /></div>
        </div>
        <div className="hub-filters">{HUB_CATS.map(c=><button key={c.key} className={"hub-filter"+(cat===c.key?" active":"")} onClick={()=>{ setQ(""); setCat(c.key); }}>{c.label}</button>)}</div>
        {loading ? (
          <div className="hub-empty"><HubIcon.loader className="spin" /><div>Memuat dari Hugging Face…</div></div>
        ) : results.length ? (
          <div className="hub-grid">{results.map(m=>{ const d=dl[m.id]||{}; const st=d.state||"idle"; const author=m.id.split("/")[0]||"?"; const name=m.id.split("/").pop();
            return (
            <div className="m-card" key={m.id}>
              <div className="m-card-head">
                {m.avatar
                  ? <img className="m-card-logo" src={m.avatar} alt={author} loading="lazy" onError={(e)=>{ e.target.style.display="none"; e.target.nextSibling.style.display="grid"; }} />
                  : null}
                <div className={"m-card-icon "+iconColorFor(author)} style={{display: m.avatar?"none":"grid"}}>{author[0].toUpperCase()}</div>
                <div className="m-card-info"><div className="m-card-name">{name}</div><div className="m-card-id">{m.id}</div></div>
              </div>
              {(m.pipeline || (m.tags && m.tags.length) || m.library) && (
                <div className="m-card-tags">
                  {m.pipeline && <span className={"m-tag "+(/code/i.test(m.pipeline)?"code":"gen")}>{m.pipeline}</span>}
                  {m.library && <span className="m-tag-soft">{m.library}</span>}
                  {(m.tags||[]).slice(0,2).map(t=><span className="m-tag-soft" key={t}>{t}</span>)}
                  {m.gated && <span className="m-tag-soft">🔒 gated</span>}
                </div>
              )}
              <div className="m-card-meta">
                <span><HubIcon.dl style={{width:12,height:12}} /> {fmtN(m.downloads)} unduhan</span>
                <span><HubIcon.star style={{width:12,height:12,color:"var(--brand)"}} /> {fmtN(m.likes)}</span>
                {m.updated && <span>↻ {fmtDate(m.updated)}</span>}
                {sizes[m.id]
                  ? <span><code>{sizes[m.id].bytes ? ("⬇ " + fmtSize(sizes[m.id].bytes) + (sizes[m.id].quant ? " · " + sizes[m.id].quant : "")) : "—"}</code></span>
                  : <span style={{opacity:.5}}>⬇ menghitung…</span>}
              </div>
              {st==="downloading" && <div className="m-progress"><div className="m-progress-bar"><div className="m-progress-fill" style={{width:(d.progress||0)+"%"}} /></div><div className="m-progress-info"><span>Mengunduh…</span><span>{Math.round(d.progress||0)}%</span></div></div>}
              <div className="m-card-foot">
                {st==="done" ? (<><span className="m-done-badge"><HubIcon.check /> Terunduh</span><button className="m-use-btn active" onClick={()=>onUse(d.port)}>Gunakan</button><button className="hub-del" onClick={()=>delModel(d.port)}>Hapus</button></>)
                 : st==="downloading" ? (<><button className="m-dl-btn" disabled><HubIcon.loader className="spin" /> Mengunduh…</button><button className="hub-del" onClick={()=>stop(m.id)}>Stop</button></>)
                 : st==="resolving" ? <button className="m-dl-btn" disabled><HubIcon.loader className="spin" /> Menyiapkan…</button>
                 : <button className="m-dl-btn" onClick={()=>download(m.id)}><HubIcon.download /> Download</button>}
              </div>
            </div>); })}</div>
        ) : (
          <div className="hub-empty"><HubIcon.empty /><div>{msg || "Ketik untuk mencari model."}</div></div>
        )}
        {msg && results.length>0 && <div className="hf-msg" style={{marginTop:14}}>{msg}</div>}
      </div></div>
    </div>
  );
}

/* ----------------------------- Canvas (live web/app split view) ----------------------------- */
// Detect web/app output in a reply and assemble ONE previewable HTML document.
function buildPreview(text){
  const t = text || "";
  // Tolerant fence scan: capture closed blocks AND a still-streaming trailing one.
  const blocks = [];
  const re = /```([\w+#.-]*)[^\n]*\n([\s\S]*?)```/g; let m;
  while((m = re.exec(t))) blocks.push({ lang:(m[1]||"").toLowerCase(), code:m[2] });
  const tail = t.slice(re.lastIndex);
  const om = tail.match(/```([\w+#.-]*)[^\n]*\n([\s\S]*)$/);
  if(om && om[2]) blocks.push({ lang:(om[1]||"").toLowerCase(), code:om[2] });
  const find = (re2) => blocks.find(b => re2.test(b.lang||""));
  let html = find(/^html$/);
  const css = find(/^css$/), js = find(/^(js|javascript|jsx)$/);
  // also treat any block whose body looks like an HTML document/fragment as web
  if(!html) html = blocks.find(b => /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]|<div[\s>]|<style[\s>]|<canvas[\s>]/i.test(b.code||""));
  const domJs = js && /document\.|window\.|innerHTML|appendChild|querySelector|getElementById|React|createRoot/.test(js.code);
  const isWeb = !!html || (!!css && !!js) || domJs;
  if(!isWeb) return { has:false };
  let doc;
  if(html){
    doc = html.code;
    if(css && !/<style/i.test(doc)){
      doc = /<\/head>/i.test(doc) ? doc.replace(/<\/head>/i, "<style>\n"+css.code+"\n</style></head>") : ("<style>\n"+css.code+"\n</style>\n"+doc);
    }
    if(js && !/<script/i.test(doc)){
      doc = /<\/body>/i.test(doc) ? doc.replace(/<\/body>/i, "<script>\n"+js.code+"\n<\/script></body>") : (doc+"\n<script>\n"+js.code+"\n<\/script>");
    }
  } else {
    doc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
      (css?("<style>\n"+css.code+"\n</style>"):"")+'</head><body>'+
      (js?("<script>\n"+js.code+"\n<\/script>"):"")+'</body></html>';
  }
  return { has:true, doc };
}

function CanvasPanel({ project, onClose }){
  const [tab, setTab] = useState("preview");
  const [doc, setDoc] = useState(project.doc);
  const [nonce, setNonce] = useState(0);
  useEffect(()=>{ setDoc(project.doc); setNonce(n=>n+1); }, [project.doc]);
  const run = project.run, q = run && run.quality;
  const openTab = () => { const w = window.open(); if(w){ w.document.open(); w.document.write(doc); w.document.close(); } };
  return (
    <div className="canvas">
      <div className="canvas-head">
        <span className="canvas-title"><Icon.spark style={{width:14,height:14}} /> Canvas</span>
        <div className="canvas-tabs">
          <button className={tab==="preview"?"active":""} onClick={()=>setTab("preview")}>Preview</button>
          <button className={tab==="code"?"active":""} onClick={()=>setTab("code")}>Code</button>
        </div>
        <span className="tb-spacer" />
        <button className="canvas-icon" title="Muat ulang" onClick={()=>setNonce(n=>n+1)}>↻</button>
        <button className="canvas-icon" title="Buka di tab baru" onClick={openTab}>⇱</button>
        <button className="canvas-icon canvas-close" title="Tutup" onClick={onClose}>✕</button>
      </div>
      <div className="canvas-body">
        {tab==="preview"
          ? <iframe key={nonce} className="canvas-frame" sandbox="allow-scripts allow-modals allow-forms allow-popups" srcDoc={doc} title="preview" />
          : <textarea className="canvas-code" value={doc} spellCheck={false} onChange={e=>setDoc(e.target.value)} />}
      </div>
      <div className="canvas-foot">
        {run ? <span className={"verdict-mini "+(run.ok?"ok":"bad")}>{run.ok?"✓ logika terverifikasi":"⚠ belum lolos"}</span>
             : <span className="verdict-mini">● live preview</span>}
        {q ? <span className={"q-mini "+(q.score>=85?"q-hi":q.score>=60?"q-mid":"q-lo")}>kualitas {q.score}</span> : null}
        <span className="tb-spacer" />
        <span className="canvas-hint">edit di tab Code → preview live</span>
      </div>
    </div>
  );
}

/* ----------------------------- App ----------------------------- */
const SUGGESTIONS = ["Contoh syntax Python", "Buatkan fungsi rekursif Python dengan assert", "Jelaskan async/await", "Tulis is_prime(n) + tes"];
const CANVAS_BUILDING = '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0d11;color:#5eead4;font-family:system-ui">'+
  '<div style="text-align:center"><div style="font-size:13px;letter-spacing:2px;opacity:.7">QUANTUM</div><div style="margin-top:10px;font-size:15px">membangun antarmuka…</div></div></body></html>';
function App() {
  const [models, setModels] = useState([{value:"",label:"memuat…",disabled:true}]);
  const [modelVal, setModelVal] = useState("");
  const [compareVal, setCompareVal] = useState("");
  const [compare, setCompare] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("memuat model…");
  const [view, setView] = useState("chat");
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("quantum_theme") || "dark"; } catch(e){ return "dark"; } });
  const [canvas, setCanvas] = useState(null);          // {doc, run} when the split Canvas is open
  const [canvasAuto, setCanvasAuto] = useState(false); // toggled from the composer
  const [canvasPct, setCanvasPct] = useState(46);      // canvas width % (draggable divider)
  const lastProject = useRef(null);
  const scrollRef = useRef(null);
  const ctrlRef = useRef(null);
  const toggleCanvas = () => setCanvasAuto(v => {
    const nv = !v;
    if (nv && lastProject.current) setCanvas(lastProject.current);   // turning on reopens last web output
    if (!nv) setCanvas(null);                                        // turning off closes the split
    return nv;
  });
  const openCanvas = (text, run) => {                                // manual open from a message
    const p = buildPreview(text); if(!p.has) return;
    lastProject.current = { doc:p.doc, run };
    setCanvas({ doc:p.doc, run });
    setCanvasAuto(true);
  };
  const onDividerDown = (e) => {
    e.preventDefault();
    const move = (ev) => { const w = window.innerWidth; const pct = Math.min(72, Math.max(28, (w - ev.clientX) / w * 100)); setCanvasPct(pct); };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); document.body.style.userSelect = ""; };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  };
  const startPicker = useVisualPicker();
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem("quantum_theme", theme); } catch(e){} }, [theme]);

  const loadModels = useCallback(async () => {
    let list = [];
    try { list = await (await fetch("/models")).json(); } catch(e) {}
    const opts = list.map(m => ({ value:String(m.port), label:m.name + (m.size ? " · " + fmtSize(m.size) : ""), default:m.default }));
    const cloud = getCloud();
    if (cloud && cloud.key) opts.push({ value:"cloud", label:"☁ "+cloud.name+" ("+cloud.model+") ·"+cloud.key.slice(-4) });
    if (!opts.length) opts.push({ value:"", label:"tidak ada model", disabled:true });
    setModels(opts);
    const def = (cloud&&cloud.key) ? "cloud" : (opts.find(o=>o.default)||opts[0]).value;
    setModelVal(v => v && opts.some(o=>o.value===v) ? v : def);
    setCompareVal(v => v && opts.some(o=>o.value===v) ? v : (opts.find(o=>o.value!==def)||opts[0]).value);
    setStatus(cloud&&cloud.key ? "cloud: "+cloud.name : (opts.length?"siap":"jalankan start-models"));
  }, []);
  useEffect(() => { loadModels(); }, [loadModels]);
  useEffect(() => { const el=scrollRef.current; if(el) el.scrollTop=el.scrollHeight; }, [messages]);

  const labelOf = (v) => (models.find(m=>m.value===v)||{}).label || v;

  const doSend = async (content, display) => {
    if (!content || busy) return;
    const newHist = [...history, { role:"user", content }];
    setHistory(newHist);
    setBusy(true); setStatus("typing…");
    const ctrl = new AbortController(); ctrlRef.current = ctrl;
    if (compare) {
      setMessages(m => [...m, { role:"user", text: display||content }, { role:"compare", a:{label:labelOf(modelVal),text:"",run:null}, b:{label:labelOf(compareVal),text:"",run:null} }]);
      const upd = (side,t,run)=> setMessages(m=>{ const c=m.slice(); const last={...c[c.length-1]}; last[side]={...last[side],text:t,run}; c[c.length-1]=last; return c; });
      try {
        setStatus("A…"); const ra = await streamChat(reqFor(modelVal,getCloud(),newHist),(t,run)=>upd("a",t,run),ctrl.signal); upd("a",ra.text,ra.run);
        setStatus("B…"); const rb = await streamChat(reqFor(compareVal,getCloud(),newHist),(t,run)=>upd("b",t,run),ctrl.signal); upd("b",rb.text,rb.run);
        setHistory(h => [...h, { role:"assistant", content: ra.text }]);
        setStatus("bandingkan: A "+(ra.run&&ra.run.ok?"✓":"–")+" vs B "+(rb.run&&rb.run.ok?"✓":"–"));
      } catch(e){ if(e.name!=="AbortError") setStatus("error: "+e.message); else setStatus("dibatalkan"); }
    } else {
      setMessages(m => [...m, { role:"user", text: display||content }, { role:"model", text:"", run:null }]);
      if (canvasAuto) setCanvas({ doc: CANVAS_BUILDING, run: null });   // Web Dev → split opens immediately
      let lastCanvasT = 0;
      try {
        const res = await streamChat(reqFor(modelVal,getCloud(),newHist),(t,run)=>{
          setMessages(m=>{ const c=m.slice(); c[c.length-1]={role:"model",text:t,run}; return c; });
          if (canvasAuto) { const now = Date.now(); if (now - lastCanvasT > 450) { const p = buildPreview(t); if (p.has) { lastCanvasT = now; setCanvas({ doc: p.doc, run: null }); } } }
        }, ctrl.signal);
        setMessages(m=>{ const c=m.slice(); c[c.length-1]={role:"model",text:res.text,run:res.run}; return c; });
        setHistory(h => [...h, { role:"assistant", content: res.text }]);
        setStatus(res.run ? (res.run.ok ? "✓ verified" : "⚠ not passing") : "ready");
        const proj = buildPreview(res.text);              // finalize the live Canvas
        if (proj.has) { lastProject.current = { doc: proj.doc, run: res.run }; setCanvas({ doc: proj.doc, run: res.run }); }
        else if (canvasAuto) setCanvas(null);             // no web produced → close the empty split
      } catch(e){ if(e.name!=="AbortError"){ setMessages(m=>{ const c=m.slice(); c[c.length-1]={role:"model",text:"[error: "+e.message+"]"}; return c; }); setStatus("error"); } else setStatus("dibatalkan"); }
    }
    ctrlRef.current=null; setBusy(false);
  };
  const aiEditCode = (code, lang, instruction) => {
    const prompt = "Ubah kode berikut sesuai instruksi. Kembalikan HANYA satu blok kode (bertag bahasa "+lang+").\nInstruksi: "+instruction+"\n\n```"+lang+"\n"+code+"\n```";
    doSend(prompt, "✦ Ubah ("+lang+"): "+instruction);
  };
  const cancel = () => { if(ctrlRef.current) ctrlRef.current.abort(); };
  const reset = () => { setMessages([]); setHistory([]); setBusy(false); setStatus("ready"); };

  return (
    <div className="app">
      {panelOpen && <SettingsPanel onClose={()=>setPanelOpen(false)} onSaved={loadModels} onVisualPicker={()=>{ setPanelOpen(false); startPicker(); }} onOpenHub={()=>{ setPanelOpen(false); setView("hub"); }} />}
      <div className="page-container">
        <div className={"page chat-page " + (view==="chat" ? "active" : "exit")}>
          <TopBar models={models} modelVal={modelVal} setModelVal={setModelVal}
            compare={compare} setCompare={setCompare} compareVal={compareVal} setCompareVal={setCompareVal}
            panelOpen={panelOpen} setPanelOpen={setPanelOpen} onReset={reset} status={status} theme={theme} setTheme={setTheme} />
          <div className="chat-split">
            <div className="chat-col" style={{ flex: canvas ? ("1 1 " + (100 - canvasPct) + "%") : "1 1 100%" }}>
              <div className="chat-scroll" ref={scrollRef}>
                {messages.length === 0 ? (
                  <div className="empty">
                    <span className="glyph"><Icon.spark style={{ color:"#fff" }} /></span>
                    <h2>Start building something great with Quantum</h2>
                    <p>Minta kode — contoh, refactor, atau penjelasan. Kode dijalankan & diverifikasi di CPU Anda.</p>
                    <div className="empty-chips">{SUGGESTIONS.map(s=><button className="chip" key={s} onClick={()=>doSend(s)}>{s}</button>)}</div>
                  </div>
                ) : (
                  <div className="chat-inner">{messages.map((m,i)=><Message key={i} msg={m} onAiEdit={aiEditCode} busy={busy} onOpenCanvas={openCanvas} />)}</div>
                )}
              </div>
              <Composer onSend={(t)=>doSend(t)} onCancel={cancel} busy={busy} canvasAuto={canvasAuto} onToggleCanvas={toggleCanvas} />
            </div>
            {canvas && <div className="split-divider" onMouseDown={onDividerDown} />}
            {canvas && <div className="canvas-col" style={{ flex: "0 0 " + canvasPct + "%" }}>
              <CanvasPanel project={canvas} onClose={()=>{ setCanvas(null); setCanvasAuto(false); }} />
            </div>}
          </div>
        </div>
        <div className={"page hub-page " + (view==="hub" ? "active" : "enter")}>
          {view === "hub" && <ModelHubView onBack={()=>setView("chat")} theme={theme} setTheme={setTheme} onChanged={loadModels}
            onUse={(port)=>{ if(port) setModelVal(String(port)); loadModels(); setView("chat"); }} />}
        </div>
      </div>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
