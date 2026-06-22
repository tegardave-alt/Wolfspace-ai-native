const { useState, useRef, useEffect, useCallback, useMemo } = React;

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
const PREFIXES = [["github_pat_","github","GitHub Models"],["ghp_","github","GitHub Models"],["sk-ant-","anthropic","Claude"],["sk-or-","openrouter","OpenRouter"],["gsk_","groq","Groq"],["AIza","gemini","Gemini"],["nvapi-","nvidia","NVIDIA"],["sk-UUa","opencode","OpenCode"],["sk-","openai","OpenAI"]];
const CLOUD_DEFAULT = { anthropic:"claude", openai:"gpt-4o", openrouter:"anthropic/claude-opus-4-8", groq:"llama", qwen:"qwen", deepseek:"chat", github:"gpt-4o", gemini:"gemini-2.0-flash", nvidia:"nvidia/nemotron-3-super-120b-a12b", opencode:"deepseek-v4-flash-free", puter:"claude-sonnet-4", custom:"gpt-4o" };
const PROVIDER_LABELS = { openai:"OpenAI", qwen:"Qwen", groq:"Groq", openrouter:"OpenRouter", anthropic:"Claude", deepseek:"DeepSeek", github:"GitHub Models", gemini:"Gemini", nvidia:"NVIDIA", opencode:"OpenCode", puter:"Puter", custom:"Custom" };
const PROVIDER_OPTS = ["auto","openai","qwen","deepseek","github","groq","openrouter","anthropic","gemini","nvidia","opencode","puter","custom"];
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
function reqFor(modelVal, cloud, history, webdev){ const b = (modelVal==="cloud" && cloud) ? { history, cloud } : { history, port: modelVal }; if(webdev) b.webdev = true; return b; }
// Verify HTTP server is running (only for browser users, not Electron)
async function checkServerHealth() {
  if (IPC) return true;  // Electron: uses IPC, no HTTP needed
  try {
    const r = await fetch("/", { method: "HEAD", timeout: 2000 });
    return r.ok;
  } catch {
    return false;
  }
}
// Parse an SSE stream from a fetch Response, calling onEvent(parsedJSON) per line.
async function pumpSSE(r, signal, onEvent){
  const reader=r.body.getReader(); const dec=new TextDecoder(); let buf="";
  while(true){ const {done,value}=await reader.read(); if(done) break;
    buf+=dec.decode(value,{stream:true}); const lines=buf.split("\n"); buf=lines.pop();
    for(const line of lines){ const mm=line.match(/^data:\s*(.*)$/); if(!mm) continue; let j; try{ j=JSON.parse(mm[1]); }catch(e){ continue; } onEvent(j); } }
}
const IPC = (typeof window!=="undefined" && window.quantum && window.quantum.ipc) ? window.quantum : null;

async function streamChat(reqBody, onText, signal){
  let acc="", run=null;
  const handle = (j) => {
    if(j.t==="tok"){ acc+=j.c; onText(acc,run); }
    else if(j.t==="retry"){ acc=""; run=null; onText(acc,run); }   // new fix attempt → drop the previous failed one
    else if(j.t==="run"){ run=j.run; onText(acc,run); }
    else if(j.t==="done"){ run=j.run||run; onText(acc,run); }
    else if(j.t==="err"){ acc+="\n["+j.m+"]"; onText(acc,run); }
  };
  if(IPC){   // Electron IPC — no HTTP
    await new Promise((resolve)=>{ const cancel=IPC.stream("chat",reqBody,handle,resolve);
      if(signal) signal.addEventListener("abort",()=>{ cancel(); resolve(); }); });
    return { text: acc, run };
  }
  const r = await fetch("/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(reqBody),signal});
  await pumpSSE(r, signal, handle);
  return { text: acc, run };
}
// Self-edit agent: stream the READ/GREP/EDIT/… loop (IPC, or /self-agent over HTTP).
async function streamSelfAgent(reqBody, onEvent, signal){
  if(IPC){
    await new Promise((resolve)=>{ const cancel=IPC.stream("self-agent",reqBody,onEvent,resolve);
      if(signal) signal.addEventListener("abort",()=>{ cancel(); resolve(); }); });
    return;
  }
  try {
    const r = await fetch("/self-agent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(reqBody),signal});
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
    await pumpSSE(r, signal, onEvent);
  } catch(e) {
    if (e instanceof TypeError && e.message.includes('Failed to fetch')) {
      throw new Error('Tidak bisa terhubung ke server self-agent.\n\nJika running di browser:\n1. Buka terminal di folder quantum\n2. Jalankan: npm start\n3. Tunggu sampai "http://127.0.0.1:8090" muncul\n4. Refresh browser dan coba lagi\n\nAtau gunakan Electron: npm run app');
    }
    throw e;
  }
}


/* ----------------------------- Model Interface (collapsible dropdown) ----------------------------- */
function ModelInterface({ models, modelVal, setModelVal }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);
  const current = models.find(m => m.value === modelVal);
  const label = current ? current.label : modelVal;
  return (
    <div className="model-interface" ref={ref}>
      <button className="mi-trigger" onClick={() => setOpen(!open)} title={label}>
        <span className="mi-label">{label}</span>
        <Icon.chev className={"mi-chev" + (open ? " open" : "")} style={{ width: 14, height: 14 }} />
      </button>
      {open && (
        <div className="mi-panel">
          {models.map((m) => (
            <div key={m.value}
              className={"mi-opt" + (m.value === modelVal ? " active" : "") + (m.disabled ? " disabled" : "")}
              onClick={() => { if (!m.disabled) { setModelVal(m.value); setOpen(false); } }}>
              {m.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Top bar ----------------------------- */
function TopBar({ models, modelVal, setModelVal, panelOpen, setPanelOpen, onReset, status, theme, setTheme }) {
  return (
    <header className="topbar">
      <ModelInterface models={models} modelVal={modelVal} setModelVal={setModelVal} />

      <div className="tb-spacer" />

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

/* ----------------------------- Settings (full page) ----------------------------- */
function SettingsView({ onBack, onSaved, onCloudChanged }) {
  const stored = getCloud();
  const [key, setKey] = useState("");
  const [provider, setProvider] = useState(stored ? (stored.baseUrl ? "custom" : stored.provider) : "auto");
  const [model, setModelName] = useState(stored ? (keyish(stored.model) ? "" : stored.model) : "");
  const [baseUrl, setBaseUrl] = useState(stored ? (stored.baseUrl || "") : "");
  const [hint, setHint] = useState(stored ? ("provider " + stored.provider + " ·" + (stored.key?stored.key.slice(-4):"server") + " · aktif") : "Tempel API key, lalu Deteksi atau pilih provider.");

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
    // mirror to the server so the backend agent loop can use it autonomously
    fetch("/cloud-save",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ key:k, provider:prov, model:mdl, baseUrl:bu }) })
      .then(r=>r.json()).then(()=>setHint("Tersimpan (browser + server): " + prov + " ·" + k.slice(-4) + " → " + mdl))
      .catch(()=>setHint("Tersimpan di browser: " + prov + " ·" + k.slice(-4) + " → " + mdl));
    onSaved();
    onCloudChanged(); // Trigger model list reload
  };
  const clear = () => { setCloudLS(null); setKey(""); setModelName(""); setBaseUrl(""); setProvider("auto"); setHint("Dihapus."); onSaved(); onCloudChanged(); };

  return (
    <div className="hub">
      <header className="hub-header">
        <span className="tb-divider" />
        <div className="hub-title-group">
          <span className="hub-hf-mark" style={{background:"rgba(94,234,212,.14)",color:"#5eead4"}}>{SB.key({width:16,height:16})}</span>
          <span className="hub-title">API Key</span>
          <span className="hub-subtitle">Cloud BYOK · bawa key sendiri</span>
        </div>
        <div className="tb-spacer" />

      </header>
      <div className="hub-body"><div className="hub-inner settings-inner">
        <div className="settings-card">
          <div className="field"><label className="field-label">Cloud API Key</label>
            <input className="input" type="password" autoComplete="new-password" value={key} onChange={(e)=>setKey(e.target.value)}
              placeholder={stored ? ("Key tersimpan (…" + (stored.key?stored.key.slice(-4):"server") + ") — kosongkan untuk tetap") : "Tempel API key apa saja…"} />
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
      </div></div>
    </div>
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
  const [edReady, setEdReady] = useState(false);   // Monaco mounted? else show <pre> fallback
  const hostRef = useRef(null);
  const edRef = useRef(null);
  const focusedRef = useRef(false);
  const getCode = () => edRef.current ? edRef.current.getValue() : code;

  useEffect(() => {
    let disposed = false;
    if (!window.monacoReady) return;
    window.monacoReady.then((monaco) => {
      if (disposed || !hostRef.current) return;
      // One-time fix: kill Monaco's blue outline (always-on via .monaco-editor rule in editor.main.css)
      if (!document.getElementById('monaco-outline-fix')) {
        const s = document.createElement('style');
        s.id = 'monaco-outline-fix';
        s.textContent = '.monaco-editor { outline: none !important; outline-offset: 0 !important; }';
        document.head.appendChild(s);
      }
      const ed = monaco.editor.create(hostRef.current, { value: code, language: mLang(language), theme: "vs-dark",
        automaticLayout: true, minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 13, lineNumbers: "on",
        renderLineHighlight: "none", tabSize: 4, scrollbar: { alwaysConsumeMouseWheel: false }, padding: { top: 8, bottom: 8 }, wordWrap: "off",
        domReadOnly: false, readOnly: false, autoDetectHighContrast: false });
      edRef.current = ed; setEdReady(true);
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
      <div className="monaco-host" ref={hostRef} style={{ display: edReady ? "block" : "none" }} />
      {!edReady && <pre className="code-fallback" style={{ margin:0, padding:"10px 14px", overflow:"auto", color:"#cbd5e1", background:"#0d1117", font:"13px/1.6 ui-monospace,Consolas,monospace", whiteSpace:"pre" }}>{code}</pre>}
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

function parseMermaidFlowchart(code) {
  const lines = String(code || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !/^%%/.test(line) && !/^(flowchart|graph)\b/i.test(line));

  const nodes = new Map();
  const edges = [];

  const getNode = (id) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label: id, shape: "rect", order: nodes.size });
    }
    return nodes.get(id);
  };

  const parseNode = (token) => {
    const raw = String(token || "").trim();
    if (!raw) return null;
    const m = raw.match(/^([A-Za-z0-9_:-]+)\s*(?:\[\[([\s\S]+)\]\]|\[([\s\S]+)\]|\(\(([\s\S]+)\)\)|\(([^()]+)\)|\{([\s\S]+)\})?$/);
    const id = m ? m[1] : raw.replace(/[^A-Za-z0-9_:-]/g, "_");
    const node = getNode(id);
    if (m) {
      const label = m[2] || m[3] || m[4] || m[5] || m[6];
      if (label) node.label = label.trim();
      if (m[2]) node.shape = "subroutine";
      else if (m[4]) node.shape = "circle";
      else if (m[5]) node.shape = "round";
      else if (m[6]) node.shape = "diamond";
      else if (m[3]) node.shape = "rect";
    }
    return node;
  };

  for (const line of lines) {
    const edgeMatch = line.match(/^(.*?)\s*(?:--\s*([^>-]+?)\s*-->|-+>|\.->)\s*(.*)$/);
    if (!edgeMatch) {
      const nodeOnly = parseNode(line);
      if (nodeOnly) getNode(nodeOnly.id);
      continue;
    }
    const from = parseNode(edgeMatch[1]);
    const label = (edgeMatch[2] || "").trim();
    const to = parseNode(edgeMatch[3]);
    if (from && to) edges.push({ from: from.id, to: to.id, label });
  }

  if (!nodes.size) return null;

  const incoming = new Map();
  const outgoing = new Map();
  for (const n of nodes.keys()) { incoming.set(n, 0); outgoing.set(n, []); }
  for (const e of edges) {
    incoming.set(e.to, (incoming.get(e.to) || 0) + 1);
    outgoing.get(e.from).push(e.to);
  }

  const level = new Map();
  const queue = [];
  for (const [id, deg] of incoming.entries()) {
    if (deg === 0) { level.set(id, 0); queue.push(id); }
  }
  if (!queue.length) {
    const first = nodes.keys().next().value;
    level.set(first, 0);
    queue.push(first);
  }

  const processed = new Set();
  while (queue.length) {
    const cur = queue.shift();
    if (processed.has(cur)) continue;
    processed.add(cur);
    const curLevel = level.get(cur) || 0;
    const nextLevel = curLevel + 1;
    for (const nxt of outgoing.get(cur) || []) {
      const oldLevel = level.get(nxt);
      if (oldLevel === undefined || oldLevel < nextLevel) {
        level.set(nxt, nextLevel);
      }
      if (!processed.has(nxt)) {
        queue.push(nxt);
      }
    }
  }

  for (const id of nodes.keys()) {
    if (!level.has(id)) level.set(id, 0);
  }

  const layers = [];
  for (const [id, lv] of level.entries()) {
    if (!layers[lv]) layers[lv] = [];
    layers[lv].push(id);
  }
  layers.forEach(layer => layer.sort((a, b) => nodes.get(a).order - nodes.get(b).order));

  const fontSize = 14;
  const padX = 18;
  const padY = 12;
  const gapX = 42;
  const gapY = 54;
  const layerGap = 86;
  const measure = (label) => Math.max(96, Math.min(260, label.length * 8.5 + padX * 2));

  const positioned = new Map();
  let maxWidth = 0;
  let maxHeight = 0;
  for (let ly = 0; ly < layers.length; ly++) {
    const layer = layers[ly] || [];
    let rowWidth = 0;
    const sizes = layer.map(id => ({ id, w: measure(nodes.get(id).label), h: 54 }));
    rowWidth = sizes.reduce((sum, item) => sum + item.w, 0) + Math.max(0, sizes.length - 1) * gapX;
    let x = Math.max(24, (Math.max(0, rowWidth) ? 0 : 0));
    const topY = 28 + ly * layerGap;
    const startX = 24;
    let cursorX = startX;
    for (const item of sizes) {
      positioned.set(item.id, { x: cursorX, y: topY, w: item.w, h: item.h, layer: ly });
      cursorX += item.w + gapX;
      maxWidth = Math.max(maxWidth, cursorX);
      maxHeight = Math.max(maxHeight, topY + item.h);
    }
  }

  return { nodes, edges, positioned, width: Math.max(360, maxWidth + 24), height: Math.max(120, maxHeight + 28), fontSize, padX, padY };
}

function MermaidBlock({ code }) {
  const diagram = useMemo(() => parseMermaidFlowchart(code), [code]);
  if (!diagram) {
    return <pre className="code-fallback" style={{ margin:0, padding:"10px 14px", overflow:"auto", color:"#cbd5e1", background:"#0d1117", font:"13px/1.6 ui-monospace,Consolas,monospace", whiteSpace:"pre" }}>{code}</pre>;
  }

  const { nodes, edges, positioned, width, height, fontSize, padX, padY } = diagram;

  const edgePath = (from, to) => {
    const a = positioned.get(from);
    const b = positioned.get(to);
    if (!a || !b) return "";
    const x1 = a.x + a.w / 2;
    const y1 = a.y + a.h;
    const x2 = b.x + b.w / 2;
    const y2 = b.y;
    const midY = y1 + Math.max(20, (y2 - y1) * 0.42);
    return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  };

  return (
    <div className="mermaid-block">
      <div className="code-head">
        <span className="code-dots"><span style={{background:"#ff5f57"}}/><span style={{background:"#febc2e"}}/><span style={{background:"#28c840"}}/></span>
        <span className="code-lang">mermaid</span><span className="lang-spacer" />
      </div>
      <div className="mermaid-canvas" style={{ overflowX: "auto", padding: "10px 12px 14px" }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Mermaid flowchart">
          <defs>
            <marker id="mermaid-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#8fb3ff" />
            </marker>
          </defs>
          <rect x="0" y="0" width={width} height={height} rx="14" fill="#0d1117" />
          {edges.map((e, idx) => {
            const a = positioned.get(e.from);
            const b = positioned.get(e.to);
            if (!a || !b) return null;
            const path = edgePath(e.from, e.to);
            const midX = (a.x + a.w / 2 + b.x + b.w / 2) / 2;
            const midY = (a.y + a.h + b.y) / 2 - 8;
            return (
              <g key={idx}>
                <path d={path} fill="none" stroke="#8fb3ff" strokeWidth="1.8" markerEnd="url(#mermaid-arrow)" opacity="0.95" />
                {e.label ? <text x={midX} y={midY} textAnchor="middle" fontSize="11" fill="#9fb7d9" style={{ paintOrder: "stroke", stroke: "#0d1117", strokeWidth: 3 }}>{e.label}</text> : null}
              </g>
            );
          })}
          {Array.from(nodes.values()).map((node) => {
            const p = positioned.get(node.id);
            if (!p) return null;
            const cx = p.x + p.w / 2;
            const cy = p.y + p.h / 2;
            const label = node.label || node.id;
            const commonStroke = node.shape === "diamond" ? "#93c5fd" : "#5eead4";
            return (
              <g key={node.id}>
                {node.shape === "diamond" ? (
                  <polygon points={`${cx},${p.y} ${p.x + p.w},${cy} ${cx},${p.y + p.h} ${p.x},${cy}`} fill="#111827" stroke={commonStroke} strokeWidth="2" />
                ) : node.shape === "circle" ? (
                  <ellipse cx={cx} cy={cy} rx={Math.max(48, p.w / 2)} ry={p.h / 2} fill="#111827" stroke={commonStroke} strokeWidth="2" />
                ) : node.shape === "subroutine" ? (
                  <>
                    <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="14" fill="#111827" stroke={commonStroke} strokeWidth="2" />
                    <line x1={p.x + 10} y1={p.y} x2={p.x + 10} y2={p.y + p.h} stroke={commonStroke} strokeWidth="1.4" />
                    <line x1={p.x + p.w - 10} y1={p.y} x2={p.x + p.w - 10} y2={p.y + p.h} stroke={commonStroke} strokeWidth="1.4" />
                  </>
                ) : (
                  <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="14" fill="#111827" stroke={commonStroke} strokeWidth="2" />
                )}
                <text x={cx} y={cy + 5} textAnchor="middle" fontSize={fontSize} fill="#e5e7eb" fontWeight="600">
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* ----------------------------- Message ----------------------------- */
function Blocks({ text, onAiEdit, busy }) {
  const blocks = parseBlocks(text);
  if (!blocks.length) return <div className="typing"><span/><span/><span/></div>;
  return blocks.map((b,i) => b.type==="code"
    ? (b.lang && /^(mermaid|mmd)$/i.test(b.lang)
      ? <MermaidBlock key={i} code={b.code} />
      : <CodeBlock key={i} lang={b.lang} code={b.code} onAiEdit={onAiEdit} busy={busy} />)
    : <p key={i} dangerouslySetInnerHTML={{ __html: b.html }} />);
}
function Verdict({ run }) {
  if (!run) return null;
  const q = run.quality;
  const tier = !q ? "" : q.score >= 85 ? "q-hi" : q.score >= 60 ? "q-mid" : "q-lo";
  return (
    <div className="verdict-wrap">

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
  if (msg.role === "agent") return (<div className="msg model"><span className="msg-role">agent</span><AgentSteps run={msg.agent||{}} onAiEdit={onAiEdit} busy={busy} /></div>);
  const web = msg.text ? buildPreview(msg.text) : { has:false };
  const [expanded, setExpanded] = useState(false);
  const THRESH = 1000; // characters threshold to collapse
  const isLong = (msg.text || "").length > THRESH;
  return (
    <div className="msg model"><span className="msg-role">model</span>
      <div className="bubble-model" style={{ maxHeight: (!expanded && isLong) ? 220 : 'none', overflow: (!expanded && isLong) ? 'hidden' : 'visible' }}>
        {msg.text ? <Blocks text={msg.text} onAiEdit={onAiEdit} busy={busy} /> : <div className="typing"><span/><span/><span/></div>}
      </div>
      {isLong && (
        <div style={{ marginTop: 6 }}>
          <button className="open-canvas-btn" onClick={() => setExpanded(e => !e)} style={{ padding: '4px 8px', fontSize: 12 }}>
            {expanded ? 'Tampilkan lebih sedikit' : 'Tampilkan selengkapnya'}
          </button>
        </div>
      )}
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
  
  console.log('[Composer] render, busy:', busy, 'val:', val);
  
  const submit = () => { const v=val.trim(); console.log('[Composer submit] busy:', busy, 'v:', v); if(!v||busy) return; console.log('[Composer submit] calling onSend with:', v); onSend(v); console.log('[Composer submit] setting val to empty string'); setVal(""); console.log('[Composer submit] val after setVal:', val); requestAnimationFrame(()=>{ if(ref.current) ref.current.style.height="auto"; }); };
  
  // Debug val changes
  useEffect(() => {
    console.log('[Composer] val changed to:', val);
  }, [val]);
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
              <button className="cm-item" onClick={()=>{setMenu(false); document.getElementById('folder-upload-input')?.click();}}><i>{MI.upload}</i><span className="cm-lbl"><b>Upload attachment</b><small>file, image, video, audio</small></span></button>
              <input id="folder-upload-input" type="file" webkitdirectory="" directory="" multiple style={{display:'none'}} onChange={(e)=>{ const files=Array.from(e.target.files||[]); if(files.length){ onSend('[Uploaded '+files.length+' file(s)]'); } e.target.value=''; }} />
              <div className="cm-sep" />
              <button className={"cm-item"+(canvasAuto?" active":"")} onClick={webDev}><i>{MI.webdev}</i> Web Dev{canvasAuto?<span className="cm-on">aktif</span>:null}</button>
            </div>
          )}
        </div>
        <textarea ref={ref} rows={1} value={val} placeholder="How can I help you today?"
          onChange={(e)=>{ console.log('[Textarea] value changed:', e.target.value); setVal(e.target.value); grow(); }}
          onKeyDown={(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); console.log('[Textarea] Enter pressed, calling submit'); submit(); } }}
          onFocus={()=>console.log('[Textarea] focused')}
          onBlur={()=>console.log('[Textarea] blurred')} />
        <button className={"send-btn"+(busy?" cancel":"")} onClick={busy?onCancel:submit} disabled={!busy && !val.trim()} onClickCapture={(e)=>{console.log('[Send button] clicked, busy:', busy, 'disabled:', !busy && !val.trim());}}>
          {busy ? "Cancel" : <>Send <Icon.send /></>}
        </button>
      </div>
      <div className="composer-hint">
        {soon ? <b style={{color:"var(--brand)"}}>{soon}</b>
              : (canvasAuto ? <b style={{color:"var(--brand)"}}>Web Dev (Canvas) aktif</b> : null)}
      </div>
    </div>
  );
}

/* ----------------------------- Visual Picker ----------------------------- */
// Module-level guard: only ONE picker can ever be active, so re-clicking the
// sidebar item toggles it off instead of stacking capture-listeners that would
// keep swallowing clicks (the "chat jadi tak bisa diklik" bug).
let VP_STOP = null;
function useVisualPicker(){
  return useCallback(()=>{
    if(VP_STOP){ VP_STOP(); return; }          // already active → toggle off
    let hover=null;
    const cleanHovers=()=>document.querySelectorAll(".vp-hover").forEach(el=>el.classList.remove("vp-hover"));
    const move=(e)=>{ const el=e.target; if(hover&&hover!==el) hover.classList.remove("vp-hover"); hover=el; el.classList.add("vp-hover"); };
    // real classes only (drop the picker's own vp-* runtime classes)
    const realCls=(el)=> (typeof el.className==="string" ? el.className.trim().split(/\s+/).filter(c=>c && !/^vp-/.test(c)) : []);
    const seg=(el)=>{
      if(el.id) return "#"+el.id;
      let s=el.tagName.toLowerCase();
      const cls=realCls(el);
      if(cls.length) s+="."+cls.join(".");
      const p=el.parentElement;                       // disambiguate same-tag siblings
      if(p){ const same=Array.from(p.children).filter(c=>c.tagName===el.tagName);
        if(same.length>1) s+=":nth-of-type("+(same.indexOf(el)+1)+")"; }
      return s;
    };
    // Build a selector that actually identifies the element: if it has no id/class,
    // walk up to the nearest classed/ided ancestor so "p" becomes ".composer-hint > p".
    const sel=(el)=>{
      const parts=[]; let cur=el, depth=0;
      while(cur && cur.nodeType===1 && depth<6){
        parts.unshift(seg(cur));
        if(cur.id || realCls(cur).length) break;      // anchored → enough to be unique
        cur=cur.parentElement; depth++;
      }
      return parts.join(" > ");
    };
    const click=(e)=>{
      e.preventDefault(); e.stopPropagation();
      const el=e.target, selector=sel(el);
      // Capture the ESSENCE so the agent knows what was picked without searching blind:
      // the element's visible text (or label/placeholder), not just an abstract selector.
      const text=(el.textContent||"").replace(/\s+/g," ").trim().slice(0,120);
      const label=el.getAttribute?(el.getAttribute("aria-label")||el.getAttribute("placeholder")||el.getAttribute("title")||""):"";
      let d=selector;
      if(text) d+=' — teks: "'+text+'"';
      else if(label) d+=' — label: "'+label.trim().slice(0,80)+'"';
      try{ navigator.clipboard&&navigator.clipboard.writeText(d); }catch(_){}
      stop(); setTimeout(()=>alert("Tersalin: "+d),0);
    };
    const key=(e)=>{ if(e.key==="Escape"){ e.preventDefault(); stop(); } };
    function stop(){
      VP_STOP=null;
      document.body.classList.remove("vp-on"); cleanHovers();
      document.removeEventListener("mouseover",move,true);
      document.removeEventListener("click",click,true);
      document.removeEventListener("keydown",key,true);
    }
    VP_STOP=stop;
    document.body.classList.add("vp-on");
    document.addEventListener("mouseover",move,true);
    document.addEventListener("click",click,true);
    document.addEventListener("keydown",key,true);
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
// Map an Ollama model name → its maker brand (real logo + brand color + monogram).
// Real SVGs live in /vendor/llm/<brand>.svg; if absent, the colored monogram shows.
const LLM_BRANDS = {
  meta:    { c:"#0866FF", s:"∞",  re:/^(llama|codellama|llama-guard|tinyllama|meta)/ },
  qwen:    { c:"#6E56CF", s:"Q",  re:/^(qwen|qwq)/ },
  deepseek:{ c:"#4D6BFE", s:"D",  re:/^deepseek/ },
  google:  { c:"#4285F4", s:"G",  re:/^(gemma|codegemma|paligemma)/ },
  mistral: { c:"#FF7000", s:"M",  re:/^(mistral|mixtral|codestral|mathstral|ministral|magistral|devstral)/ },
  microsoft:{c:"#00A4EF", s:"φ",  re:/^phi/ },
  openai:  { c:"#10A37F", s:"O",  re:/^gpt-oss/ },
  ibm:     { c:"#0F62FE", s:"ɢ",  re:/^granite/ },
  cohere:  { c:"#39594D", s:"C",  re:/^command/ },
  huggingface:{c:"#FFB000",s:"🤗", re:/^(smollm|smol)/ },
  falcon:  { c:"#1973E8", s:"F",  re:/^falcon/ },
  vision:  { c:"#14B8A6", s:"◉",  re:/^(llava|bakllava|moondream|minicpm|llama3.2-vision|llama-vision)/ },
  embed:   { c:"#64748B", s:"≈",  re:/^(nomic|mxbai|snowflake|all-minilm|bge|paraphrase)/ },
  code:    { c:"#22C55E", s:"</>", re:/^(starcoder|stable-code|codegeex|sqlcoder|wizardcoder)/ },
};
function ollamaBrand(name){
  const n = (name||"").toLowerCase();
  for (const [k,v] of Object.entries(LLM_BRANDS)) if (v.re.test(n)) return { key:k, ...v };
  return { key:"generic", c:"#7c8aa0", s:(n[0]||"?").toUpperCase() };
}
function LLMLogo({ name }){
  const b = ollamaBrand(name);
  return (<>
    <img className="m-card-logo" src={"/vendor/llm/"+b.key+".svg"} alt={b.key} loading="lazy"
      onError={(e)=>{ e.target.style.display="none"; e.target.nextSibling.style.display="grid"; }} />
    <span className="m-card-icon" style={{display:"none",background:b.c,color:"#fff",fontWeight:700}}>{b.s}</span>
  </>);
}
// Capability badge color
function capClass(c){ c=(c||"").toLowerCase(); if(/vision/.test(c)) return "cap-vision"; if(/tool/.test(c)) return "cap-tool"; if(/think|reason/.test(c)) return "cap-think"; if(/embed/.test(c)) return "cap-embed"; return "cap-def"; }

function ModelHubView({ onBack, theme, setTheme, onUse, onChanged }) {
  const [source, setSource] = useState("hf");   // "hf" | "ollama"
  const [oll, setOll] = useState([]);            // ollama results
  const [ollLoading, setOllLoading] = useState(false);
  const [oSize, setOSize] = useState({});        // chosen size tag per ollama model
  const [oBytes, setOBytes] = useState({});      // resolved download size: "name:tag" -> bytes (0=err, undefined=loading)
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
  // Ollama: realtime library (scraped server-side). Refetch on source/query change.
  const fetchOllama = useCallback(async (query) => {
    setOllLoading(true);
    try { const r = await (await fetch("/ollama/search?q=" + encodeURIComponent(query||""))).json();
      setOll(Array.isArray(r) ? r : []); } catch(e){ setOll([]); }
    setOllLoading(false);
  }, []);
  useEffect(() => { if(source==="ollama") fetchOllama(q.trim()); }, [source]);
  const submitO = () => fetchOllama(q.trim());
  // Resolve real download size (bytes) for a model:tag, cached. Marks loading as null.
  const oReq = useRef(0);
  const resolveSize = useCallback((name, tag) => {
    const id = name + ":" + tag;
    setOBytes(b => (id in b) ? b : (() => { fetch("/ollama/size?name="+encodeURIComponent(name)+"&tag="+encodeURIComponent(tag))
      .then(r=>r.json()).then(d=>setOBytes(b2=>({...b2,[id]: d.bytes||0}))).catch(()=>setOBytes(b2=>({...b2,[id]:0})));
      return { ...b, [id]: null }; })());
  }, []);
  // When Ollama results arrive, resolve the smallest (default) tag's size per model.
  useEffect(() => {
    if(source!=="ollama" || !oll.length) return;
    const token = ++oReq.current;
    let i = 0;  // throttle: one manifest fetch at a time-ish
    const tick = () => { if(token!==oReq.current || i>=oll.length) return;
      const m = oll[i++]; resolveSize(m.name, smallestTag(m.sizes)); setTimeout(tick, 120); };
    tick();
  }, [oll, source]);
  // pick the smallest parameter size as the default tag (safest local download)
  const smallestTag = (sizes) => {
    if(!sizes || !sizes.length) return "latest";
    const parse = s => { const m=(s||"").match(/([\d.]+)\s*([bm])/i); if(!m) return 1e9; return parseFloat(m[1])*(m[2].toLowerCase()==="b"?1:0.001); };
    return sizes.slice().sort((a,b)=>parse(a)-parse(b))[0];
  };
  // Download an Ollama model's GGUF blob → launch llama-server (SSE progress, keyed by name:tag)
  const downloadOllama = async (name, tag) => {
    const id = name + ":" + tag;
    if (dl[id] && dl[id].state==="downloading") return;
    setDl(d=>({ ...d, [id]:{ state:"downloading", progress:0 } }));
    const ctrl = new AbortController(); ctrls.current[id] = ctrl;
    try {
      const res = await fetch("/ollama/download",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ name, tag }), signal: ctrl.signal });
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
        <div className="hub-title-group"><span className="hub-hf-mark"><HubIcon.hf /></span><span className="hub-title">Model Hub</span><span className="hub-subtitle">{source==="ollama"?"Ollama · realtime":"Hugging Face · GGUF"}</span></div>
        <div className="tb-spacer" />
        <div className="hub-source">
          <button className={source==="hf"?"active":""} onClick={()=>setSource("hf")}>Hugging Face</button>
          <button className={source==="ollama"?"active":""} onClick={()=>setSource("ollama")}>Ollama</button>
        </div>
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
          <div className="hub-search"><HubIcon.search /><input
            placeholder={source==="ollama"?"Cari model Ollama… (llama, qwen, deepseek, phi)":"Cari model GGUF… (llama, coder, qwen, phi)"}
            value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"){ source==="ollama"?submitO():submit(); } }} /></div>
        </div>
        {source==="hf" && <div className="hub-filters">{HUB_CATS.map(c=><button key={c.key} className={"hub-filter"+(cat===c.key?" active":"")} onClick={()=>{ setQ(""); setCat(c.key); }}>{c.label}</button>)}</div>}

        {source==="ollama" ? (
          ollLoading ? <div className="hub-empty"><HubIcon.loader className="spin" /><div>Memuat dari Ollama…</div></div>
          : oll.length ? (
            <div className="hub-grid">{oll.map(m=>(
              <div className="m-card" key={m.name}>
                <div className="m-card-head">
                  <LLMLogo name={m.name} />
                  <div className="m-card-info"><div className="m-card-name">{m.name}</div><div className="m-card-id">{ollamaBrand(m.name).key!=="generic"?ollamaBrand(m.name).key:"ollama"}</div></div>
                </div>
                <p className="m-card-desc">{m.description}</p>
                {m.capabilities.length>0 && (
                  <div className="m-card-tags">
                    {m.capabilities.map(c=><span key={c} className={"m-cap "+capClass(c)}>{c}</span>)}
                  </div>
                )}
                {m.sizes.length>0 && (() => {
                  const cur = (oSize[m.name] || smallestTag(m.sizes));
                  return (
                  <div className="m-card-tags m-size-row">
                    {m.sizes.map(s=><button key={s} className={"m-size"+(cur===s?" sel":"")} onClick={()=>{ setOSize(o=>({...o,[m.name]:s})); resolveSize(m.name, s); }}>{s}</button>)}
                  </div>
                  );
                })()}
                {(() => {
                  const tag = oSize[m.name] || smallestTag(m.sizes);
                  const b = oBytes[m.name + ":" + tag];
                  return (
                  <div className="m-card-meta">
                    <span className="m-dlsize">{b===undefined ? <span style={{opacity:.5}}>⬇ —</span>
                      : b===null ? <span style={{opacity:.5}}>⬇ menghitung…</span>
                      : b>0 ? <code>⬇ {fmtSize(b)} · {tag}</code> : <span style={{opacity:.5}}>⬇ ?</span>}</span>
                    <span><HubIcon.dl style={{width:12,height:12}} /> {m.pulls}</span>
                    <span>🏷 {m.tags}</span>
                    {m.updated && <span>↻ {m.updated}</span>}
                  </div>
                  );
                })()}
                {(() => {
                  const tag = oSize[m.name] || smallestTag(m.sizes);
                  const id = m.name + ":" + tag; const d = dl[id] || {}; const st = d.state || "idle";
                  return (<>
                    {st==="downloading" && <div className="m-progress"><div className="m-progress-bar"><div className="m-progress-fill" style={{width:(d.progress||0)+"%"}} /></div><div className="m-progress-info"><span>Mengunduh {tag}…</span><span>{Math.round(d.progress||0)}%</span></div></div>}
                    <div className="m-card-foot">
                      {st==="done" ? (<><span className="m-done-badge"><HubIcon.check /> Terunduh</span><button className="m-use-btn active" onClick={()=>onUse(d.port)}>Gunakan</button><button className="hub-del" onClick={()=>delModel(d.port)}>Hapus</button></>)
                       : st==="downloading" ? (<><button className="m-dl-btn" disabled><HubIcon.loader className="spin" /> Mengunduh…</button><button className="hub-del" onClick={()=>stop(id)}>Stop</button></>)
                       : (<><button className="m-dl-btn" onClick={()=>downloadOllama(m.name, tag)}><HubIcon.download /> Download {m.name}:{tag}</button><a className="hub-del" href={"https://ollama.com/library/"+m.name} target="_blank" rel="noreferrer" style={{textDecoration:"none"}}>↗</a></>)}
                    </div>
                  </>);
                })()}
              </div>
            ))}</div>
          ) : <div className="hub-empty"><HubIcon.empty /><div>{q?"Tidak ada model cocok.":"Memuat…"}</div></div>
        ) : loading ? (
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
// Build self-contained HTML runner for compiled Flutter/Dart JS
function flutterRunnerDoc(compiledJs) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#fff; overflow:hidden; }
  flt-glass-pane { display:block; width:100vw; height:100vh; }
</style>
</head>
<body>
<script>
// Flutter web compiled output (dart2js)
${compiledJs}
</script>
</body>
</html>`;
}

// Visual-edit overlay for the Flutter preview. Flutter (CanvasKit) paints to one
// <canvas>, so per-widget DOM doesn't exist — instead we force-enable Flutter's
// accessibility SEMANTICS layer (flt-semantics nodes carry each widget's screen
// rect + label) and hit-test against those. Interaction mirrors the web Visual
// Picker: click selects a widget, drag moves its outline, parent shows the panel.
// Returns RAW JS (no <script> wrapper): the compiled app is now loaded via
// src= (same origin), so the parent injects this into contentDocument on load.
function flutterDragScript() {
  return `(function(){
  var active=false;
  var sel=null, totalDx=0, totalDy=0;
  var hoverBox=null, selBox=null;
  var dragging=false, sx=0, sy=0, baseLeft=0, baseTop=0;

  function mkBox(style){
    var d=document.createElement('div');
    d.style.cssText='position:fixed;pointer-events:none;z-index:999999;border-radius:4px;display:none;box-sizing:border-box;'+style;
    document.body.appendChild(d); return d;
  }
  function place(b,r){ b.style.left=r.left+'px'; b.style.top=r.top+'px'; b.style.width=r.width+'px'; b.style.height=r.height+'px'; b.style.display='block'; }

  // Flutter only builds the semantics DOM after its hidden a11y placeholder is
  // activated — click it programmatically (retry until the tree appears).
  function enableSemantics(){
    var ph=document.querySelector('flt-semantics-placeholder');
    if(ph){ try{ ph.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})); }catch(e){} }
  }
  var tries=0;
  var timer=setInterval(function(){
    enableSemantics();
    if(document.querySelector('flt-semantics')||++tries>30) clearInterval(timer);
  },400);

  function nodesAt(x,y){
    var out=[], all=document.querySelectorAll('flt-semantics');
    for(var i=0;i<all.length;i++){
      var r=all[i].getBoundingClientRect();
      if(r.width>3&&r.height>3&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)
        out.push({el:all[i],r:r,area:r.width*r.height});
    }
    out.sort(function(a,b){return a.area-b.area;});  // smallest rect = deepest widget
    return out;
  }
  function labelOf(el){
    var l=(el.getAttribute('aria-label')||el.textContent||'').trim();
    return (l||el.getAttribute('role')||'widget').slice(0,80);
  }
  function roleOf(el){ return el.getAttribute('role')||'widget'; }

  document.addEventListener('mousemove',function(e){
    if(!active) return;
    if(dragging){
      e.preventDefault(); e.stopPropagation();
      var dx=e.clientX-sx, dy=e.clientY-sy;
      selBox.style.left=(baseLeft+dx)+'px'; selBox.style.top=(baseTop+dy)+'px';
      return;
    }
    var ns=nodesAt(e.clientX,e.clientY);
    if(!hoverBox) hoverBox=mkBox('border:2px dashed #5eead4;background:rgba(94,234,212,.05);');
    if(ns.length){ place(hoverBox,ns[0].r); document.body.style.cursor='pointer'; }
    else { hoverBox.style.display='none'; document.body.style.cursor=''; }
  },true);

  document.addEventListener('mousedown',function(e){
    if(!active||e.button!==0) return;
    e.preventDefault(); e.stopPropagation();
    var ns=nodesAt(e.clientX,e.clientY);
    if(!ns.length) return;
    var el=ns[0].el, r=ns[0].r;
    if(sel!==el){
      sel=el; totalDx=0; totalDy=0;
      if(!selBox) selBox=mkBox('border:2px solid #5eead4;background:rgba(94,234,212,.1);');
      place(selBox,r);
      window.parent.postMessage({__qdrag__:true,type:'select',elementText:labelOf(el),elementTag:roleOf(el)},'*');
    }
    dragging=true; sx=e.clientX; sy=e.clientY;
    var br=selBox.getBoundingClientRect(); baseLeft=br.left; baseTop=br.top;
    document.body.style.cursor='move';
  },true);

  document.addEventListener('mouseup',function(e){
    if(!active||!dragging) return;
    e.preventDefault(); e.stopPropagation();
    dragging=false;
    totalDx+=e.clientX-sx; totalDy+=e.clientY-sy;
    document.body.style.cursor='pointer';
    if(sel) window.parent.postMessage({__qdrag__:true,type:'moved',elementText:labelOf(sel),elementTag:roleOf(sel),dx:Math.round(totalDx),dy:Math.round(totalDy)},'*');
  },true);

  // Swallow clicks while editing so buttons in the app don't fire
  document.addEventListener('click',function(e){ if(active){ e.preventDefault(); e.stopPropagation(); } },true);

  window.addEventListener('message',function(ev){
    if(!ev.data||!ev.data.__qdragcmd__) return;
    if(ev.data.cmd==='setActive'){
      active=ev.data.val;
      if(!active){ if(hoverBox)hoverBox.style.display='none'; if(selBox)selBox.style.display='none'; sel=null; document.body.style.cursor=''; }
      else enableSemantics();
    }
    if(ev.data.cmd==='clearSel'){ if(selBox)selBox.style.display='none'; sel=null; totalDx=0; totalDy=0; }
  });
})();`;
}

// Placeholder while the model is still writing the A2UI JSON spec (no render yet)
const A2UI_STREAMING = '<!DOCTYPE html><html><head><meta charset="UTF-8">'+
  '<style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#0d1117;font-family:system-ui;color:#54c5f8;flex-direction:column;gap:12px}'+
  '.dots span{animation:b 1.2s infinite;display:inline-block}.dots span:nth-child(2){animation-delay:.2s}.dots span:nth-child(3){animation-delay:.4s}'+
  '@keyframes b{0%,80%,100%{opacity:.25}40%{opacity:1}}p{font-size:13px;opacity:.75}</style></head>'+
  '<body><div class="dots" style="font-size:26px"><span>●</span> <span>●</span> <span>●</span></div><p>menerima spesifikasi A2UI dari model…</p></body></html>';
// Fallback: if a model wrongly returns ```dart instead of A2UI JSON
const FLUTTER_STREAMING = '<!DOCTYPE html><html><head><meta charset="UTF-8">'+
  '<style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#0d1117;font-family:system-ui;color:#54c5f8;flex-direction:column;gap:12px}'+
  '.dots span{animation:b 1.2s infinite;display:inline-block}.dots span:nth-child(2){animation-delay:.2s}.dots span:nth-child(3){animation-delay:.4s}'+
  '@keyframes b{0%,80%,100%{opacity:.25}40%{opacity:1}}p{font-size:13px;opacity:.75}</style></head>'+
  '<body><div class="dots" style="font-size:26px"><span>●</span> <span>●</span> <span>●</span></div><p>menerima kode Flutter dari model…</p></body></html>';

// Loading placeholder shown while DartPad API compiles
const FLUTTER_COMPILING = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#0d1117;font-family:system-ui;color:#5eead4;flex-direction:column;gap:14px;}
.spin{width:36px;height:36px;border:3px solid rgba(94,234,212,.2);border-top-color:#5eead4;border-radius:50%;animation:spin .8s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}
p{font-size:13px;opacity:.7;}</style></head>
<body><div class="spin"></div><p>Mengkompilasi Flutter…</p></body></html>`;

// Web Dev is A2UI-only. If a model wrongly returns Dart instead of an A2UI JSON spec,
// we show this instead of compiling the old way.
const DART_NOTICE = '<!doctype html><html><head><meta charset="utf-8"></head>'+
  '<body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0d11;color:#cbd5e1;font-family:system-ui;text-align:center;padding:24px">'+
  '<div><div style="font-size:30px;margin-bottom:10px">⚠️</div>'+
  '<div style="color:#fbbf24;font-weight:600;margin-bottom:8px">Model mengembalikan kode Dart, bukan A2UI JSON</div>'+
  '<div style="font-size:13px;opacity:.7;max-width:340px;line-height:1.6">Web Dev sekarang memakai A2UI (JSON → render instan). '+
  'Gunakan model <b>bridge (Claude)</b> yang konsisten menghasilkan A2UI JSON, atau minta ulang. Kode Dart tidak lagi dikompilasi.</div></div></body></html>';

// Detect web/app output in a reply and assemble ONE previewable HTML document.
function buildPreview(text){
  const t = text || "";
  // Tolerant fence scan: capture closed blocks AND a still-streaming trailing one.
  const blocks = [];
  const re = /```([\w+#.-]*)[^\n]*\n([\s\S]*?)```/g; let m;
  while((m = re.exec(t))) blocks.push({ lang:(m[1]||"").toLowerCase(), code:m[2] });
  const tail = t.slice(re.lastIndex);
  const om = tail.match(/```([\w+#.-]*)[^\n]*\n([\s\S]*)$/);
  if(om && om[2]) blocks.push({ lang:(om[1]||"").toLowerCase(), code:om[2], open:true });  // fence belum ditutup = masih streaming
  const find = (re2) => blocks.find(b => re2.test(b.lang||""));

  // DEBUG: log found blocks
  console.log('[buildPreview] blocks found:', blocks.map(b => ({ lang: b.lang, len: b.code?.length || 0, starts: b.code?.trim().slice(0, 20) })));

  // Backend blocks (shown in the Code explorer under backend/, never previewed)
  const pyB  = find(/^(py|python)$/);
  const sqlB = find(/^sql$/);
  const backendFiles = [];
  if(pyB)  backendFiles.push({ path:"backend/main.py",    lang:"python", code:pyB.code });
  if(sqlB) backendFiles.push({ path:"backend/schema.sql", lang:"sql",    code:sqlB.code });

  // Quantum Canvas is Flutter-only: a previewable result is ONE ```dart block,
  // compiled locally by the Flutter SDK. HTML/CSS/JS/React are no longer rendered.
  // streaming:true while the fence is still open — compiling a half-written
  // program just wastes a build on a guaranteed syntax error.
  // A2UI: a ```json block that is a UI spec → render instantly in the studio (no compile).
  const jsonB = find(/^(json|a2ui)$/);
  console.log('[buildPreview] jsonB:', jsonB ? { lang: jsonB.lang, len: jsonB.code?.length, starts: jsonB.code?.trim().slice(0, 50) } : null);
  if(jsonB && jsonB.code){
    const s = jsonB.code.trim();
    const hasType = /"type"\s*:|"root"\s*:/.test(s);
    console.log('[buildPreview] JSON check: startsWith={', s.startsWith('{'), '}, hasType:', hasType);
    if(s.startsWith("{") && hasType)
      return { has:true, flutter:true, a2ui:true, source: s, streaming: !!jsonB.open,
               files:[{ path:"ui.json", lang:"json", code:s }, ...backendFiles] };
  }

  // Web Dev is A2UI-only now: a model that (wrongly) returns ```dart is NOT compiled
  // anymore — show it in the file list but never run the old Flutter-compile path.
  const dart = find(/^dart$/);
  if(dart && dart.code && dart.code.length > 20)
    return { has:true, dartOnly:true, doc:DART_NOTICE, files:[{ path:"lib/main.dart", lang:"dart", code:dart.code }, ...backendFiles] };

  return { has:false };
}

// Terminal-style page for console programs (Kotlin/Java/Go/...), so the Canvas
// still shows the run result even when there is nothing visual to render.
function consoleDoc(run){
  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  return '<!doctype html><html><head><meta charset="utf-8"><style>'+
    'body{margin:0;background:#0b0d11;color:#cbd5e1;font:13px/1.65 ui-monospace,Consolas,monospace;padding:18px}'+
    '.hd{color:#5eead4;margin-bottom:12px;font-weight:600}'+
    '.ok{color:#34d399}.bad{color:#f87171}'+
    'pre{white-space:pre-wrap;word-break:break-word;margin:0}'+
    '.err{color:#fca5a5;margin-top:12px;border-top:1px dashed #2a3340;padding-top:12px}'+
    '</style></head><body>'+
    '<div class="hd">$ run '+esc(run.language||'')+' <span class="'+(run.ok?'ok':'bad')+'">'+(run.ok?'· exit 0':'· gagal')+'</span></div>'+
    '<pre>'+(esc(run.output)||'(tidak ada output)')+'</pre>'+
    (run.error?'<pre class="err">'+esc(run.error)+'</pre>':'')+
    '<div style="margin-top:22px;padding-top:12px;border-top:1px solid #1f2733;color:#5b6776;font-size:11px">'+
    'Ini verifikasi logika (konsol). Ingin antarmuka visual yang bisa diklik? '+
    'Aktifkan <b style="color:#5eead4">+ &rarr; Web Dev</b> lalu minta ulang.</div>'+
    '</body></html>';
}

// Code tab: file tree grouped by folder (lib/ backend/) + editor pane
function CodeExplorer({ files, onEdit }){
  const [cur, setCur] = useState(0);
  useEffect(()=>{ if(cur >= files.length) setCur(0); }, [files.length]);
  const groups = {};
  files.forEach((f,i)=>{
    const folder = f.path.includes("/") ? f.path.split("/")[0] : "app";
    (groups[folder] = groups[folder] || []).push({ ...f, i });
  });
  const fileIcon = (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M4 1.5h5L13 5.5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z"/><path d="M9 1.5V5.5h4"/>
    </svg>
  );
  return (
    <div className="code-explorer">
      <div className="ce-tree">
        {Object.entries(groups).map(([folder, fs]) => (
          <div key={folder} className="ce-folder">
            <div className="ce-folder-name">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M1.5 4a1 1 0 0 1 1-1h3l1.5 2h6.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/>
              </svg>
              {folder}
            </div>
            {fs.map(f => (
              <button key={f.i} className={"ce-file"+(f.i===cur?" active":"")} onClick={()=>setCur(f.i)}>
                {fileIcon}{f.path.split("/").pop()}
              </button>
            ))}
          </div>
        ))}
      </div>
      <textarea className="canvas-code" value={(files[cur]&&files[cur].code)||""} spellCheck={false}
        onChange={e=>onEdit(cur, e.target.value)} />
    </div>
  );
}

/* ---------- Flutter SDK Info Panel ---------- */
function FlutterSDKInfo({ isFlutter }){
  const [info, setInfo] = useState(null);
  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [showDoctor, setShowDoctor] = useState(false);
  const fetchInfo = useCallback(()=>{
    setLoading(true); setErr(null);
    fetch('/flutter/sdk-info').then(r=>r.json()).then(d=>{ setInfo(d); setLoading(false); }).catch(e=>{ setErr(e.message); setLoading(false); });
  }, []);
  const fetchDoctor = useCallback(()=>{
    setLoading(true); setErr(null);
    fetch('/flutter/doctor').then(r=>r.json()).then(d=>{ setDoctor(d); setShowDoctor(true); setLoading(false); }).catch(e=>{ setErr(e.message); setLoading(false); });
  }, []);
  useEffect(()=>{ fetchInfo(); }, [fetchInfo]);
  return (
    <div className="flutter-sdk-panel">
      <div className="fsdk-head">
        <span className="fsdk-title"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 10l-2 2 2 2"/><path d="M15 10l2 2-2 2"/></svg> Flutter SDK</span>
        <button className="fsdk-refresh" title="Refresh" onClick={fetchInfo}>↻</button>
      </div>
      {loading && !info && <div className="fsdk-loading">Memuat…</div>}
      {err && <div className="fsdk-err">{err}</div>}
      {info && <>
        <div className="fsdk-row">
          <span className="fsdk-label">Status</span>
          <span className={"fsdk-val "+(info.found?"fsdk-ok":"fsdk-miss")}>{info.found ? "SDK ditemukan" : "SDK tidak ditemukan"}</span>
        </div>
        {info.path && <div className="fsdk-row"><span className="fsdk-label">Path</span><span className="fsdk-val fsdk-path" title={info.path}>{info.path}</span></div>}
        {info.version && <div className="fsdk-row"><span className="fsdk-label">Versi</span><span className="fsdk-val">{info.version}</span></div>}
        <div className="fsdk-actions">
          {isFlutter && <button className="fsdk-btn" onClick={()=>fetch('/flutter/compile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:''})}).catch(()=>{})}>Compile ulang</button>}
          <button className="fsdk-btn" onClick={fetchDoctor} disabled={loading}>Flutter Doctor</button>
          <a className="fsdk-link" href="https://flutter.dev/docs" target="_blank" rel="noreferrer">Dokumentasi ↗</a>
        </div>
        {showDoctor && doctor && (
          <div className="fsdk-doctor">
            <div className="fsdk-doctor-head">
              <span>flutter doctor</span>
              <button className="fsdk-doctor-close" onClick={()=>setShowDoctor(false)}>✕</button>
            </div>
            <pre className="fsdk-doctor-out">{(doctor.output||'') || (doctor.error||'Tidak ada output')}</pre>
          </div>
        )}
      </>}
    </div>
  );
}

function CanvasPanel({ project, onClose, modelVal }){
  const [tab, setTab]           = useState("preview");
  const [doc, setDoc]           = useState(project.doc || FLUTTER_COMPILING);
  const [nonce, setNonce]       = useState(0);
  const [flutterErr, setFlutterErr]   = useState(null);
  const [compiling, setCompiling]     = useState(false);
  const [building, setBuilding]       = useState(false);
  const [buildOutput, setBuildOutput] = useState(null);
  const [dragMode, setDragMode]       = useState(false);
  const [dragStatus, setDragStatus]   = useState(null);
  const [fSel, setFSel]               = useState(null);   // selected flutter widget {elementText, elementTag}
  const [fDelta, setFDelta]           = useState(null);   // accumulated move {dx, dy}
  const [fInstr, setFInstr]           = useState("");     // free-form edit instruction
  const [sizeOps, setSizeOps]         = useState({});     // net size/spacing deltas for the selected widget
  const [dartSource, setDartSource]   = useState(project.flutter || null);
  const [flutterUrl, setFlutterUrl]   = useState(null);   // /flutter-app/index.html once compiled
  const lastGoodRef = useRef(null);                        // last source that compiled OK (for revert)
  const fixCountRef = useRef(0);                            // auto-fix attempts spent on the current source
  const [files, setFiles]             = useState(project.files || null);  // explorer files (Code tab)
  const [showSDKInfo, setShowSDKInfo] = useState(false);  // Flutter SDK info panel
  const iframeRef = useRef(null);
  const isFlutter = !!project.flutter;

  // Keep dartSource and explorer files in sync with project
  useEffect(()=>{ if(project.flutter) setDartSource(project.flutter); }, [project.flutter]);
  useEffect(()=>{ setFiles(project.files || null); }, [project.files]);

  // Edit a file in the Code explorer → update Dart source (takes effect on ↻ compile)
  function onFileEdit(i, code){
    setFiles(prev=>{
      const nf = prev.slice(); nf[i] = { ...nf[i], code };
      const main = nf.find(f=>f.path==="lib/main.dart");
      if(main) setDartSource(main.code);
      return nf;
    });
  }

  // Helper: compile given Dart source and update preview
  function compileDart(src) {
    setFlutterErr(null);
    setFlutterUrl(null);
    setDoc(FLUTTER_COMPILING);
    setNonce(n=>n+1);
    setCompiling(true);
    return fetch('/flutter/compile', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ source: src })
    })
    .then(r=>r.json())
    .then(d=>{
      setCompiling(false);
      if(d.error){
        // Surgical auto-fix: patch the compile error (max 2x), recompile once each.
        if(fixCountRef.current < 2){
          fixCountRef.current++;
          setDragStatus('Auto-fix ('+fixCountRef.current+'/2)…');
          fetch('/flutter/fix', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ source: src, error: d.error,
              ...(modelVal==="cloud" ? { cloud: getCloud() } : { port: modelVal }) }) })
            .then(r=>r.json()).then(f=>{
              setDragStatus(null);
              if(f.error || !f.source){ setFlutterErr(d.error); return; }
              setDartSource(f.source); compileDart(f.source);
            }).catch(()=>{ setDragStatus(null); setFlutterErr(d.error); });
        } else {
          setFlutterErr(d.error);   // budget spent → show error + revert option
        }
      }
      else if(d.url){ fixCountRef.current = 0; lastGoodRef.current = src; setFlutterUrl(d.url+'?v='+Date.now()); setNonce(n=>n+1); }  // success: reset budget, record last-good
      else { setDoc(d.html || flutterRunnerDoc(d.result||'')); setNonce(n=>n+1); }
      return d;
    })
    .catch(e=>{ setCompiling(false); setFlutterErr(e.message); });
  }

  function buildApk(src, target = 'apk') {
    setFlutterErr(null);
    setBuildOutput(null);
    setBuilding(true);
    return fetch('/flutter/build', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ source: src, target })
    })
    .then(r=>r.json())
    .then(d=>{
      setBuilding(false);
      if(d.error){
        setFlutterErr(d.error);
      } else if(d.output){
        setBuildOutput(d.output);
      }
      return d;
    })
    .catch(e=>{ setBuilding(false); setFlutterErr(e.message); });
  }

  // The compiled app iframe is same-origin (/flutter-app/...) — inject the
  // visual-edit runtime into it after each load, and restore drag mode.
  function setupFlutterFrame(){
    const f = iframeRef.current; if(!f) return;
    try{
      const fdoc = f.contentDocument;
      if(fdoc && !fdoc.getElementById('__qdrag__')){
        const s = fdoc.createElement('script');
        s.id = '__qdrag__';
        s.textContent = flutterDragScript();
        fdoc.body.appendChild(s);
      }
      if(dragMode) f.contentWindow.postMessage({__qdragcmd__:true,cmd:'setActive',val:true},'*');
    }catch(_){}
  }

  // Auto-compile when Flutter source changes
  useEffect(()=>{
    if(!project.flutter){ setDoc(project.doc); setNonce(n=>n+1); setFlutterErr(null); return; }
    fixCountRef.current = 0;                 // fresh generation → fresh auto-fix budget
    compileDart(project.flutter);
  }, [project.flutter, project.doc]);

  // Messages from the Flutter preview iframe: widget select / move
  useEffect(()=>{
    function onMsg(ev){
      if(!ev.data || !ev.data.__qdrag__) return;
      const d = ev.data;
      if(d.type==='select'){ setFSel({ elementText:d.elementText, elementTag:d.elementTag }); setFDelta(null); setFInstr(""); setSizeOps({}); }
      if(d.type==='moved'){ setFSel({ elementText:d.elementText, elementTag:d.elementTag }); setFDelta({ dx:d.dx, dy:d.dy }); }
    }
    window.addEventListener('message', onMsg);
    return ()=>window.removeEventListener('message', onMsg);
  }, []);

  function clearFSel(){
    setFSel(null); setFDelta(null); setFInstr(""); setSizeOps({});
    try{ iframeRef.current&&iframeRef.current.contentWindow.postMessage({__qdragcmd__:true,cmd:'clearSel'},'*'); }catch(_){}
  }

  // Size/spacing stepper: accumulate net deltas per dimension
  function bumpSize(key, step){ setSizeOps(o=>{ const v=(o[key]||0)+step; const n={...o}; if(v===0) delete n[key]; else n[key]=v; return n; }); }
  // Compose a plain-language instruction from the accumulated size deltas
  function sizeInstruction(){
    const L={ width:'lebar', height:'tinggi', padding:'padding', font:'ukuran font', radius:'sudut border (borderRadius)' };
    return Object.entries(sizeOps).map(([k,v])=>`${v>0?'tambah':'kurangi'} ${L[k]} sekitar ${Math.abs(v)}px`).join(', ');
  }
  const hasSizeOps = Object.keys(sizeOps).length>0;

  // Apply the visual edit (move + size + free instruction): AI patches Dart, recompile
  function applyVisualEdit(){
    if(!fSel||!dartSource) return;
    const moved = fDelta && (Math.abs(fDelta.dx)>=4 || Math.abs(fDelta.dy)>=4);
    const instr = [sizeInstruction(), fInstr.trim()].filter(Boolean).join('. ');
    if(!moved && !instr) return;
    setDragStatus('AI memperbarui kode…');
    fetch('/flutter/move', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ source: dartSource, elementText: fSel.elementText, elementTag: fSel.elementTag,
                             dx: fDelta?fDelta.dx:0, dy: fDelta?fDelta.dy:0, instruction: instr,
                             ...(modelVal==="cloud" ? { cloud: getCloud() } : { port: modelVal }) })  // same model as chat
    })
    .then(r=>r.json())
    .then(d=>{
      if(d.error){ setDragStatus(null); setFlutterErr('Edit error: '+d.error); return; }
      setDartSource(d.source);
      clearFSel();
      setDragStatus('Mengkompilasi…');
      compileDart(d.source).then(()=>setDragStatus(null));
    })
    .catch(e=>{ setDragStatus(null); setFlutterErr(e.message); });
  }

  const run = project.run, q = run && run.quality;
  const openTab = () => {
    if(isFlutter && flutterUrl){ window.open(flutterUrl); return; }
    const w = window.open(); if(w){ w.document.open(); w.document.write(doc); w.document.close(); }
  };

  // srcdoc is used for placeholders (flutter compiling/streaming) and the console
  // terminal view; the compiled flutter app loads via src= (runtime injected onLoad).
  const iframeDoc = doc;

  return (
    <div className="canvas">
      <div className="canvas-head">
        <span className="canvas-title"><Icon.spark style={{width:14,height:14}} /> Canvas</span>
        {isFlutter && <span className={"flutter-badge"+(compiling?" flutter-badge-busy":"")}>{compiling?"⏳ mengkompilasi…":"Flutter"}</span>}
        <div className="canvas-tabs">
          <button className={tab==="preview"?"active":""} onClick={()=>setTab("preview")}>Preview</button>
          <button className={tab==="code"?"active":""} onClick={()=>{ setTab("code"); setDragMode(false); }}>Code</button>
        </div>
        <span className="tb-spacer" />

        {/* Flutter toolbar */}
        {isFlutter && <>
          <button className="canvas-icon" title="Compile ulang" disabled={compiling} onClick={()=>compileDart(dartSource||project.flutter)}>↻</button>
          <button className="canvas-icon" title={building?"Membangun…":"Build APK"} disabled={compiling||building} onClick={()=>buildApk(dartSource||project.flutter,'apk')}>
            {building?'⏳':'📦'}
          </button>
          <button
            className={"canvas-icon flutter-drag-btn"+(dragMode?" flutter-drag-active":"")}
            title={dragMode?"Nonaktifkan Edit Visual":"Edit Visual — pilih & seret widget"}
            disabled={compiling}
            onClick={()=>{
              const next=!dragMode; setDragMode(next);
              setFSel(null); setFDelta(null); setFInstr("");
              try{ iframeRef.current&&iframeRef.current.contentWindow.postMessage({__qdragcmd__:true,cmd:'setActive',val:next},'*'); }catch(_){}
            }}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l4 1-1 4 2-2 4 4-1.5 1.5-4-4-2 2 1-4z"/>
              <path d="M10 2l4 4"/>
            </svg>
          </button>
          <button className={"canvas-icon"+(showSDKInfo?" flutter-drag-active":"")} title="SDK Info" onClick={()=>setShowSDKInfo(v=>!v)}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M7 7h2M7 9h2"/><circle cx="8" cy="6" r=".5" fill="currentColor"/>
            </svg>
          </button>
        </>}

        {/* Non-flutter (console/terminal) — just reload */}
        {!isFlutter && <button className="canvas-icon" title="Muat ulang" onClick={()=>setNonce(n=>n+1)}>↻</button>}

        <button className="canvas-icon" title="Buka di tab baru" onClick={openTab}>⇱</button>
        <button className="canvas-icon canvas-close" title="Tutup" onClick={onClose}>✕</button>
      </div>

      {/* Flutter compile error */}
      {isFlutter && flutterErr && (
        <div className="flutter-err-panel">
          <span className="flutter-err-icon">⚠</span>
          <div style={{flex:1,minWidth:0}}>
            <pre className="flutter-err-pre">{flutterErr}</pre>
            {flutterErr.includes('tidak ditemukan') && (
              <a className="flutter-install-link" href="https://flutter.dev/docs/get-started/install/windows" target="_blank" rel="noreferrer">→ Install Flutter SDK</a>
            )}
            {lastGoodRef.current && lastGoodRef.current !== dartSource && (
              <button className="flutter-revert-btn" onClick={()=>{
                const good = lastGoodRef.current;
                setDartSource(good); setFlutterErr(null); clearFSel();
                compileDart(good);   // server caches the last good build → instant
              }}>↩ Kembalikan versi yang berfungsi</button>
            )}
          </div>
        </div>
      )}

      {/* Flutter build output */}
      {isFlutter && buildOutput && (
        <div className="flutter-err-panel" style={{borderColor:'#22c55e'}}>
          <span className="flutter-err-icon" style={{color:'#22c55e'}}>✓</span>
          <div style={{flex:1,minWidth:0}}>
            <pre className="flutter-err-pre" style={{color:'#22c55e'}}>{buildOutput}</pre>
            {buildOutput.endsWith('.apk') && (
              <span style={{fontSize:11,color:'#60a5fa',cursor:'pointer'}} onClick={()=>navigator.clipboard.writeText(buildOutput)}>
                📋 salin path
              </span>
            )}
          </div>
        </div>
      )}

      {/* Flutter visual-edit bar */}
      {isFlutter && dragMode && !compiling && (
        <div className={"flutter-drag-bar"+(fSel?" has-pending":"")}>
          {fSel ? <>
            <div className="fdrag-info">
              <span className="fdrag-tag">{(fSel.elementText||fSel.elementTag).slice(0,30)}</span>
              {fDelta && (Math.abs(fDelta.dx)>=4||Math.abs(fDelta.dy)>=4)
                ? <span className="fdrag-delta">digeser {fDelta.dx>0?'+':''}{fDelta.dx}px, {fDelta.dy>0?'+':''}{fDelta.dy}px</span>
                : <span className="fdrag-delta">seret untuk pindah, atau atur ukuran ↓</span>}
            </div>
            <input className="fdrag-instr" value={fInstr} onChange={e=>setFInstr(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter') applyVisualEdit(); }}
              placeholder="instruksi bebas: ubah warna jadi merah…" />
            <button className="fdrag-cancel" onClick={clearFSel}>Batal</button>
            <button className="fdrag-apply"
              disabled={!!dragStatus || (!fInstr.trim() && !hasSizeOps && !(fDelta && (Math.abs(fDelta.dx)>=4||Math.abs(fDelta.dy)>=4)))}
              onClick={applyVisualEdit}>
              {dragStatus ? <><span className="drag-spin"/> {dragStatus}</> : "Terapkan"}
            </button>
          </> : <>
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" style={{flexShrink:0}}>
              <path d="M3 3l4 1-1 4 2-2 4 4-1.5 1.5-4-4-2 2 1-4z"/><path d="M10 2l4 4"/>
            </svg>
            Klik widget di preview untuk memilih — lalu atur ukuran atau seret
          </>}
        </div>
      )}

      {/* Flutter size/spacing panel — fills the gap where HTML would use CSS resize */}
      {isFlutter && dragMode && !compiling && fSel && (
        <div className="fsize-panel">
          {[
            { key:'width',  label:'Lebar',   step:20 },
            { key:'height', label:'Tinggi',  step:20 },
            { key:'padding',label:'Padding', step:8  },
            { key:'font',   label:'Font',    step:2  },
            { key:'radius', label:'Sudut',   step:4  },
          ].map(d=>(
            <div key={d.key} className="fsize-row">
              <span className="fsize-label">{d.label}</span>
              <button className="fsize-btn" onClick={()=>bumpSize(d.key,-d.step)}>−</button>
              <span className={"fsize-val"+(sizeOps[d.key]?" on":"")}>{sizeOps[d.key]?(sizeOps[d.key]>0?'+':'')+sizeOps[d.key]:'·'}</span>
              <button className="fsize-btn" onClick={()=>bumpSize(d.key, d.step)}>+</button>
            </div>
          ))}
        </div>
      )}

      <div className="canvas-body">
        {tab==="preview"
          ? (isFlutter && flutterUrl
              ? <iframe key={nonce} ref={iframeRef} className="canvas-frame" src={flutterUrl}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
                  title="preview" onLoad={setupFlutterFrame} />
              : <iframe key={nonce} ref={iframeRef} className="canvas-frame"
                  sandbox={isFlutter
                    ? "allow-scripts allow-same-origin allow-popups allow-downloads"
                    : "allow-scripts allow-modals allow-forms allow-popups"}
                  srcDoc={iframeDoc} title="preview" />)
          : (files && files.length
              ? <CodeExplorer files={files} onEdit={onFileEdit} />
              : <textarea className="canvas-code" value={doc} spellCheck={false} onChange={e=>setDoc(e.target.value)} />)}
      </div>
      {showSDKInfo && <FlutterSDKInfo isFlutter={isFlutter} />}
      <div className="canvas-foot">
        {isFlutter
          ? <span className="verdict-mini" style={{color:'#54c5f8'}}>Flutter · SDK lokal</span>
          : run ? <span className={"verdict-mini "+(run.ok?"ok":"bad")}>{run.ok?"✓ logika terverifikasi":"⚠ belum lolos"}</span>
                : <span className="verdict-mini">● live preview</span>}
        {!isFlutter && q ? <span className={"q-mini "+(q.score>=85?"q-hi":q.score>=60?"q-mid":"q-lo")}>kualitas {q.score}</span> : null}
        <span className="tb-spacer" />
        <span className="canvas-hint">{isFlutter?"edit lib/main.dart di tab Code → ↻ compile ulang":"output eksekusi"}</span>
      </div>
    </div>
  );
}

// Embedded Flutter Studio: the Web Dev workspace is the /studio Flutter app.
// We just host its iframe and push the generated Dart source in via postMessage.
function StudioFrame({ source, onClose }){
  const ref = useRef(null);
  const srcRef = useRef(source);
  const bust = useRef("/studio/?v=" + Date.now());   // cache-bust so Electron never serves a stale studio build
  const beacon = (m,n)=>{ try{ fetch("/dbg?src=react&m="+encodeURIComponent(m)+(n!=null?"&n="+n:"")); }catch(_){} };
  const send = useCallback(()=>{
    try{ if(srcRef.current){ ref.current.contentWindow.postMessage({ quantumSource: srcRef.current, quantumUi: srcRef.current }, '*'); beacon("sent source", srcRef.current.length); } }catch(_){}
  }, []);
  // keep latest source and push it. The studio iframe needs ~1-2s to boot before
  // its message listener exists, so retry for a few seconds (studio dedupes).
  useEffect(()=>{
    srcRef.current = source;
    if(!source) return;
    send();
    let n = 0; const iv = setInterval(()=>{ send(); if(++n >= 8) clearInterval(iv); }, 400);
    return ()=>clearInterval(iv);
  }, [source, send]);
  // studio announces readiness AFTER its Flutter app boots — (re)send then
  useEffect(()=>{
    const onMsg = (e)=>{ if(e.data && e.data.quantumStudioReady){ beacon("got studio ready"); send(); } };
    window.addEventListener("message", onMsg);
    return ()=>window.removeEventListener("message", onMsg);
  }, [send]);
  return (
    <div className="canvas">
      <iframe ref={ref} src={bust.current} title="Quantum Studio" className="canvas-frame studio-frame"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
        onLoad={send} />
      <button className="studio-close" title="Tutup Web Dev" onClick={onClose}>✕</button>
    </div>
  );
}

/* ----------------------------- Sidebar (Claude-style) ----------------------------- */
const SB = {
  panel: (p)=>(<svg viewBox="0 0 24 24" fill="none" {...p}><rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7"/><line x1="9" y1="4" x2="9" y2="20" stroke="currentColor" strokeWidth="1.7"/></svg>),
  plus:  (p)=>(<svg viewBox="0 0 24 24" fill="none" {...p}><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>),
  chat:  (p)=>(<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M4 5h16v11H8l-4 4V5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>),
  hub:   (p)=>(<svg viewBox="0 0 24 24" fill="none" {...p}><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/><rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/><rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/><rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/></svg>),
  key:   (p)=>(<svg viewBox="0 0 24 24" fill="none" {...p}><circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.7"/><path d="M11 11l8 8M16 16l2-2M18 18l2-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  code:  (p)=>(<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  target:(p)=>(<svg viewBox="0 0 24 24" fill="none" {...p}><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>),
  palette:(p)=>(<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 3a9 9 0 100 18c1.7 0 2-1.3 1.2-2.2-.8-.9-.3-2.3 1-2.3H17a4 4 0 004-4 9 9 0 00-9-9.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><circle cx="7.5" cy="11" r="1" fill="currentColor"/><circle cx="11" cy="7.5" r="1" fill="currentColor"/><circle cx="15" cy="8.5" r="1" fill="currentColor"/></svg>),
};
function Sidebar({ collapsed, setCollapsed, view, setView, onNewChat, onVisualPicker, canvasAuto, onToggleCanvas, theme, setTheme, terminalOpen, setTerminalOpen, terminal, savedChats, showHistory, setShowHistory, restoreChat, deleteChat, loadSavedChats }) {
  const Item = ({ icon, label, active, onClick, badge }) => (
    <button className={"sb-item"+(active?" active":"")} onClick={onClick} title={collapsed?label:undefined}>
      <i className="sb-ico">{icon}</i>
      <span className="sb-label">{label}</span>
      {badge && <span className="sb-badge">{badge}</span>}
    </button>
  );
  return (
    <aside className={"sidebar"+(collapsed?" collapsed":"")}>
      <div className="sb-head">
        <span className="sb-brand"><BrandMark /><b>Quantum</b></span>
        <button className="sb-toggle" title={collapsed?"Buka panel":"Tutup panel"} onClick={()=>setCollapsed(!collapsed)}>{SB.panel({width:19,height:19})}</button>
      </div>
      <div className="sb-group">
        <Item icon={SB.plus({width:19,height:19})} label="Chat baru" onClick={onNewChat} />
        <Item icon={SB.chat({width:19,height:19})} label="Chat" active={view==="chat"} onClick={()=>setView("chat")} />
        <Item icon={SB.hub({width:19,height:19})}  label="Model Hub" active={view==="hub"} onClick={()=>setView("hub")} />
        <Item icon={SB.key({width:19,height:19})}  label="API Key" active={view==="settings"} onClick={()=>setView("settings")} />
      </div>
      <div className="sb-sec">Alat</div>
      <div className="sb-group">
        <Item icon={SB.code({width:19,height:19})} label="Web Dev" active={canvasAuto} onClick={onToggleCanvas} badge={canvasAuto?"on":null} />
        <Item icon={SB.target({width:19,height:19})} label="Visual Picker" onClick={onVisualPicker} />
      </div>
      <div className="sb-sec" style={{cursor:"pointer"}} onClick={()=>{ setShowHistory(!showHistory); loadSavedChats(); }}>
        Riwayat Chat <span style={{float:"right",opacity:0.6}}>{showHistory ? "▾" : "▸"} {savedChats.length}</span>
      </div>
      {showHistory && (
        <div className="sb-history-list">
          {savedChats.length === 0 ? (
            <div className="sb-history-empty">Belum ada chat tersimpan</div>
          ) : (
            savedChats.slice().reverse().map(chat => (
              <div key={chat.id} className="sb-history-item" onClick={()=>restoreChat(chat)}>
                <div className="sb-history-info">
                  <span className="sb-history-title">{chat.title || "Chat"}</span>
                  <span className="sb-history-date">{new Date(chat.savedAt).toLocaleDateString("id",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
                </div>
                <button className="sb-history-del" title="Hapus" onClick={(e)=>{ e.stopPropagation(); deleteChat(chat.id); }}>✕</button>
              </div>
            ))
          )}
        </div>
      )}
      {terminalOpen && (
        <div className="sb-terminal">
          <div className="sb-row">
            <input
              className="sb-input"
              placeholder="Perintah"
              value={terminal.input}
              onChange={e => terminal.setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && terminal.run()}
              disabled={terminal.loading}
            />
            <button className="sb-button" onClick={terminal.run} disabled={terminal.loading}>
              {terminal.loading ? "Menjalankan..." : "Jalankan"}
            </button>
          </div>
          <div className="sb-output" style={{whiteSpace: "pre-wrap", wordBreak: "break-word", height: "120px", overflowY: "auto", borderTop: "1px solid #444", marginTop: "8px", paddingTop: "8px"}}>
            {terminal.output}
          </div>
        </div>
      )}
    </aside>
  );
}

// Live agent process — animated bubbles showing each file/folder being worked on.
const AG_ICON = {
  list: "📁", glob: "📂", read: "📄", grep: "🔍", edit: "✎", write: "✚", run: "▶", bash: "▶",
};
// Strip the DONE protocol marker so the agent's answer reads clean.
function cleanAgentText(s){
  return (s||"")
    .replace(/^\s*```+\s*done\b[^\n]*\n?/i, "")   // leading ```DONE fence (old protocol)
    .replace(/^\s*done\b[:\s]*/i,"")              // leading "DONE" / "DONE:"
    .replace(/\n*\s*\bdone\b\s*$/i,"")            // trailing standalone DONE
    .trim();
}
function ToolOutput({ text, ok, kind, arg }) {
  const [edReady, setEdReady] = useState(false);
  const hostRef = useRef(null);
  const edRef = useRef(null);
  // detect language from tool kind + file extension + content
  const language = useMemo(() => {
    if (kind === 'read' && arg) {
      const ext = (arg||'').split('.').pop().toLowerCase();
      const langMap = {
        js:'javascript',jsx:'javascript',ts:'typescript',tsx:'typescript',
        py:'python',rb:'ruby',go:'go',rs:'rust',java:'java',c:'c',cpp:'cpp',
        dart:'dart',php:'php',yml:'yaml',yaml:'yaml',json:'json',xml:'xml',
        html:'html',css:'css',md:'markdown',sql:'sql',sh:'shell',bash:'shell',
        ps1:'powershell',cjs:'javascript',mjs:'javascript',kt:'kotlin',swift:'swift',
      };
      return langMap[ext] || 'plaintext';
    }
    if (text) {
      if (/^(?:import|export|const|let|var|function|class|async|await|require)\b/m.test(text)) return 'javascript';
      if (/^(?:def |class |import |from |print\b)/m.test(text)) return 'python';
      if (/^(?:fn |pub |let |mut |impl |enum |struct )/m.test(text)) return 'rust';
      if (/^(?:func |package |import |fmt\.)/m.test(text)) return 'go';
      if (/^</m.test(text) && /<\/?[a-z]/i.test(text)) return 'html';
      if (/^\{/m.test(text) || /"[^"]*"\s*:/m.test(text)) return 'json';
      if (/^(?:#!|\$ |npm |git |cd |ls |echo |cat )/m.test(text)) return 'shell';
    }
    return 'plaintext';
  }, [kind, arg, text]);
  // create Monaco editor
  useEffect(() => {
    let disposed = false;
    let retries = 0;
    if (!window.monacoReady) return;
    window.monacoReady.then((monaco) => {
      if (disposed || !hostRef.current) return;
      const tryCreate = () => {
        if (disposed || !hostRef.current) return;
        try {
          const ed = monaco.editor.create(hostRef.current, {
            value: text || "", language, theme: "vs-dark",
            automaticLayout: true, minimap: { enabled: false },
            scrollBeyondLastLine: false, fontSize: 12, lineNumbers: "on",
            renderLineHighlight: "none", tabSize: 2,
            scrollbar: { alwaysConsumeMouseWheel: false },
            padding: { top: 6, bottom: 6 }, wordWrap: "on",
            readOnly: true, domReadOnly: true,
            contextmenu: false, folding: true,
            glyphMargin: false, lineDecorationsWidth: 0, lineNumbersMinChars: 1,
          });
          edRef.current = ed; setEdReady(true);
          const fit = () => {
            if (!hostRef.current) return;
            hostRef.current.style.height = Math.min(Math.max(ed.getContentHeight(), 28), 400) + "px";
            ed.layout();
          };
          ed.onDidContentSizeChange(fit); fit();
        } catch(e) {
          if (retries < 10) {
            retries++;
            if (hostRef.current) hostRef.current.style.display = "block";
            setTimeout(tryCreate, 0);
          } else {
            setEdReady(false);
          }
        }
      };
      tryCreate();
    });
    return () => { disposed = true; if (edRef.current) { edRef.current.dispose(); edRef.current = null; } };
  }, [language]);
  // follow text changes
  useEffect(() => {
    const ed = edRef.current;
    if (ed && ed.getValue() !== text) ed.setValue(text || "");
  }, [text]);
  return (
    <div className={"ar-out"+(ok?"":" err")}>
      <div className="ar-out-mona-host" ref={hostRef} style={{ display: edReady ? "block" : "none" }} />
      {!edReady && <pre style={{ margin:0, font:"inherit", color:"inherit", background:"transparent", whiteSpace:"pre-wrap", wordBreak:"break-word", maxHeight:200, overflowY:"auto" }}>{text}</pre>}
    </div>
  );
}

function AgentSteps({ run, onAiEdit, busy }){
  // run = { events:[...], thinking, busy, summary, done, error, backup, editCount, run }
  const [expanded, setExpanded] = useState({});
  const acts = (run.events || []).filter(e => e.type === "act" || e.type === "err");
  const summary = cleanAgentText(run.summary);
  // Plain answer (no tools used) → render like a normal chat reply (code blocks +
  // terminal/verdict when the reply contained runnable code), not a timeline.
  if (run.done && acts.length === 0 && !run.error) {
    return (<><div className="bubble-model"><Blocks text={summary} onAiEdit={onAiEdit} busy={busy} /></div><Verdict run={run.run} /></>);
  }
  if (!run.busy && acts.length === 0 && run.error) {
    return <div className="bubble-model" style={{color:"#fca5a5"}}>{summary || (run.events&&run.events[0]&&run.events[0].m) || "error"}</div>;
  }
  return (
    <div className={"agent-flow"+(run.busy?" busy":"")}>
      <div className={"agent-flow-head"+(run.busy?" busy":"")}>
        {run.busy ? <span className="agent-spin" /> : <span className={"agent-dot"+(run.error?" err":" done")} />}
        <span className="agent-flow-title">
          {run.busy ? <>Memproses<span className="agent-ell"><span>.</span><span>.</span><span>.</span></span> langkah {run.step||1}</> : run.error ? "Berhenti" : "Selesai"}
        </span>
        {run.backup ? <span className="agent-backup" title="cadangan source sebelum diedit">⤺ {run.backup}</span> : null}
      </div>
      <div className="agent-steps">
        {acts.map((e,i)=> e.type==="err" ? (
          <div key={i} className="agent-row fail"><div className="ar-line"><span className="ar-header"><span className="ar-verb">error</span><span className="ar-arg">{e.m}</span></span></div></div>
        ) : (
          <div key={i} className={"agent-row "+(e.ok?"ok":"fail")}>
            <div className={"ar-line"+(expanded[i]?" expanded":"")} onClick={()=>setExpanded(prev=>({...prev,[i]:!prev[i]}))}>
              <span className="ar-header">
                <span className="ar-chev">{expanded[i]?"▼":"▶"}</span>
                <span className="ar-verb">{({list:"List",glob:"Glob",read:"Read",grep:"Grep",edit:"Edit",write:"Write",run:"Run",bash:"Bash"})[e.kind]||e.kind}</span>
                {e.arg ? <span className="ar-arg">{e.arg}</span> : null}
              </span>
              {e.output && expanded[i] ? <ToolOutput text={e.output} ok={e.ok} kind={e.kind} arg={e.arg} /> : null}
            </div>
          </div>
        ))}
        {run.busy ? (
          <div className="agent-row busy">
            <span className="ar-line"><span className="ar-verb dim">{run.thinking ? "Berpikir" : "Menjalankan"}</span></span>
            {run.thinking ? <div className="agent-think">{run.thinking.slice(-260)}<span className="agent-caret" /></div> : null}
          </div>
        ) : null}
      </div>
      {run.done && (summary || run.run) ? (
        <div className="agent-summary">
          {run.editCount ? <div className="agent-edits"><b>✓ {run.editCount} perubahan</b><div className="agent-apply-hint">Tinjau lalu jalankan <code>sync-app.ps1</code> untuk menerapkan.</div></div> : null}
          {summary ? <div className="bubble-model"><Blocks text={summary} onAiEdit={onAiEdit} busy={busy} /></div> : null}
          <Verdict run={run.run} />
        </div>
      ) : null}
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
  const [cloudVersion, setCloudVersion] = useState(0); // Trigger reload when cloud config changes

  const [panelOpen, setPanelOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("memuat model…");
  const [view, setView] = useState("chat");
  const [sbCollapsed, setSbCollapsed] = useState(() => { try { return localStorage.getItem("quantum_sb")==="1"; } catch(e){ return false; } });
  useEffect(()=>{ try{ localStorage.setItem("quantum_sb", sbCollapsed?"1":"0"); }catch(e){} }, [sbCollapsed]);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("quantum_theme") || "dark"; } catch(e){ return "dark"; } });
  const [canvas, setCanvas] = useState(null);          // {doc, run} when the split Canvas is open
    const canvasRef = useRef(null);                            // mirror of canvas for stale-closure-safe reads in async
    const _setCanvas = (v) => { canvasRef.current = v; setCanvas(v); };
  const [canvasAuto, setCanvasAuto] = useState(false); // toggled from the composer
  const canvasAutoRef = useRef(false);                  // mirror for stale-closure-safe reads
  const _setCanvasAuto = (v) => { setCanvasAuto(prev => { const next = typeof v === 'function' ? v(prev) : v; canvasAutoRef.current = next; return next; }); };
  const [canvasPct, setCanvasPct] = useState(46);      // canvas width % (draggable divider)
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalLoading, setTerminalLoading] = useState(false);
  const [savedChats, setSavedChats] = useState(() => { try { return JSON.parse(localStorage.getItem("quantum_chats") || "[]"); } catch(e){ return []; } });
  const [showHistory, setShowHistory] = useState(false);
  const loadSavedChats = () => { try { setSavedChats(JSON.parse(localStorage.getItem("quantum_chats") || "[]")); } catch(e){} };
  const restoreChat = (chat) => { setMessages(chat.messages); setHistory(chat.history || []); setShowHistory(false); setView("chat"); };
  const deleteChat = (id) => {
    try {
      const list = JSON.parse(localStorage.getItem("quantum_chats") || "[]");
      const updated = list.filter(c => c.id !== id);
      localStorage.setItem("quantum_chats", JSON.stringify(updated));
      setSavedChats(updated);
    } catch(e) {}
  };
  const runTerminalCommand = async () => {
    if (!terminalInput.trim()) return;
    setTerminalLoading(true);
    try {
      const res = await fetch("/api/bash", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({command: terminalInput})
      });
      const data = await res.json();
      setTerminalOutput(data.output || "");
    } catch (err) {
      setTerminalOutput("Error: " + err);
    } finally {
      setTerminalLoading(false);
      setTerminalInput("");
    }
  };
  const terminal = {
    input: terminalInput,
    setInput: setTerminalInput,
    output: terminalOutput,
    setOutput: setTerminalOutput,
    loading: terminalLoading,
    setLoading: setTerminalLoading,
    run: runTerminalCommand
  };
  const lastProject = useRef(null);
  const scrollRef = useRef(null);
  const ctrlRef = useRef(null);
  const toggleCanvas = () => _setCanvasAuto(v => {
    const nv = !v;
    if (nv) {
      if (lastProject.current) _setCanvas(lastProject.current);   // turning on reopens last web output
      else _setCanvas({ doc: CANVAS_BUILDING, run: null });       // show split immediately even without prior content
    }
    if (!nv) { _setCanvas(null); lastProject.current = null; }    // turning off closes the split AND clears cached result
    return nv;
  });
  const openCanvas = (text, run) => {                                // manual open from a message
    const p = buildPreview(text); if(!p.has) return;
    const state = p.flutter
      ? { flutter: p.source, doc: p.a2ui ? A2UI_STREAMING : FLUTTER_COMPILING, files: p.files }
      : { doc: p.doc || FLUTTER_COMPILING, run };
    lastProject.current = state;
    _setCanvas(state);
    _setCanvasAuto(true);
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
    let cloud = getCloud();
    // Hydrate from server-configured providers (key stays server-side) when there is
    // no stored cloud OR the stored provider is no longer configured (e.g. stale key).
    try {
      const provs = await (await fetch("/cloud-providers")).json();
      if (Array.isArray(provs) && provs.length) {
        const pick = provs.find(p=>p.provider==="opencode") || provs.find(p=>p.provider==="nvidia") || provs.find(p=>p.provider==="gemini") || provs.find(p=>p.provider==="puter") || provs[0];
        // Only override if the user hasn't explicitly set a local key or custom baseUrl.
        // If they have, we respect their choice.
        const hasUserConfig = cloud && (cloud.key || cloud.baseUrl);
        if (!hasUserConfig) {
          if (!cloud || cloud.provider !== pick.provider || cloud.model !== pick.model) {
            cloud = { provider: pick.provider, name: pick.name, model: pick.model };
            setCloudLS(cloud);
          }
        }
      }
    } catch(e) {}
    const hasCloud = cloud && (cloud.key || cloud.provider);
    if (hasCloud) opts.push({ value:"cloud", label:"☁ "+(cloud.name||cloud.provider)+" ("+(cloud.model||"")+")"+(cloud.key?" ·"+cloud.key.slice(-4):"") });
    if (!opts.length) opts.push({ value:"", label:"tidak ada model", disabled:true });
    setModels(opts);
    const def = hasCloud ? "cloud" : (opts.find(o=>o.default)||opts[0]).value;
    setModelVal(v => v && opts.some(o=>o.value===v) ? v : def);
    setStatus(hasCloud ? "cloud: "+(cloud.name||cloud.provider) : (opts.length?"siap":"jalankan start-models"));
  }, [cloudVersion]);
  useEffect(() => { loadModels(); }, [cloudVersion]);
  // Warn if server isn't running (for browser users, not Electron)
  useEffect(() => {
    if (!IPC) {
      checkServerHealth().then(ok => {
        if (!ok) setStatus("⚠ Jalankan 'npm start' di terminal");
      });
    }
  }, []);
  useEffect(() => { const el=scrollRef.current; if(el) el.scrollTop=el.scrollHeight; }, [messages]);

  const labelOf = (v) => (models.find(m=>m.value===v)||{}).label || v;

  const doSend = async (content, display) => {
    if (!content || busy) return;
    const newHist = [...history, { role:"user", content }];
    setHistory(newHist);
    setBusy(true); setStatus("typing…");
    console.log('[doSend] Setting busy=true, content:', content);
    const ctrl = new AbortController(); ctrlRef.current = ctrl;
    // ONE smart chat: with a tool-capable cloud, the model itself decides (tool_choice
    // auto) whether to just answer (normal chat) or use tools (a command/edit) — like
    // chatting with Claude. Local/bridge endpoints can't do tools → plain chat.
    const _cl = getCloud();
    const _localCloud = _cl && _cl.baseUrl && /(127\.0\.0\.1|localhost)/.test(_cl.baseUrl);
    const useAgent = modelVal==="cloud" && !_localCloud;
    if (!canvasAuto && !useAgent) {
      // Bridge / local model: plain conversational chat (text streaming, no function-calling).
      setMessages(m => [...m, { role:"user", text: display||content }, { role:"model", text:"", run:null }]);
      try {
        const res = await streamChat(reqFor(modelVal,getCloud(),newHist),(t,run)=>{
          setMessages(m=>{ const c=m.slice(); c[c.length-1]={role:"model",text:t,run}; return c; });
        }, ctrl.signal);
        setHistory(h=>[...h,{role:"assistant",content:res.text}]);
        setStatus("siap");
        // Auto-buka Studio jika response berisi A2UI spec (hanya jika Web Dev sudah aktif)
        if (res.text && canvasAutoRef.current) {
          const proj = buildPreview(res.text);
          if (proj.has && proj.flutter) {
            const fstate = { flutter: proj.source, doc: proj.a2ui ? A2UI_STREAMING : FLUTTER_COMPILING, files: proj.files };
            lastProject.current = fstate; _setCanvas(fstate);
          }
        }
        console.log('[doSend] Setting busy=false (normal chat complete)');
        setBusy(false); // Reset busy state after stream completes
      } catch(e){ if(e.name!=="AbortError") setStatus("error: "+e.message); else setStatus("dibatalkan"); console.log('[doSend] Setting busy=false (normal chat error)'); setBusy(false); }
    } else if (!canvasAuto) {
      // Agentic chat (like Claude Code): the model answers OR uses tools to edit
      // Quantum's own source. The live process renders as a clean timeline.
      setMessages(m => [...m, { role:"user", text: display||content }, { role:"agent", agent:{ events:[], busy:true } }]);
      const upd = (patch)=> setMessages(m=>{ const c=m.slice(); const last={...c[c.length-1]}; last.agent={...last.agent,...patch}; c[c.length-1]=last; return c; });
      const evlist = []; let think = ""; let adoneSent = false; let hadError = false;
      try {
        await streamSelfAgent({ history:newHist, cloud:getCloud(), port:modelVal }, (j)=>{
          if(j.t==="backup") upd({ backup:j.dir });
          else if(j.t==="step"){ think=""; upd({ step:j.n, thinking:"" }); }
          else if(j.t==="tok"){ think+=j.c; upd({ thinking:think }); }
          else if(j.t==="act"){ think=""; evlist.push({type:"act",kind:j.kind,arg:j.arg,ok:j.ok,output:j.output}); upd({ events:[...evlist], thinking:"" }); }
          else if(j.t==="adone"){ adoneSent = true; upd({ busy:false, done:true, summary:j.summary, editCount:j.edits, backup:j.backup, run:j.run }); setHistory(h=>[...h,{role:"assistant",content:j.summary||""}]); }
          else if(j.t==="err"){ hadError = true; evlist.push({type:"err",m:j.m}); upd({ events:[...evlist], busy:false, error:true }); }
        }, ctrl.signal);
      } catch(e){ if(e.name!=="AbortError") upd({ busy:false, error:true, events:[...evlist,{type:"err",m:e.message}] }); }
      console.log('[doSend] Setting busy=false (agent stream complete)');
      // If no "adone" event was sent, provide a default summary based on events
      if (!adoneSent) {
        if (!hadError) {
          const summary = evlist.length > 0 
            ? `Selesai. ${evlist.length} operasi dieksekusi.` 
            : "Selesai. Tidak ada operasi yang dilakukan.";
          upd({ busy:false, done:true, summary });
          setHistory(h=>[...h,{role:"assistant",content:summary}]);
        } else {
          upd({ busy:false });
        }
      }
      setBusy(false); // Always reset global busy state after agent stream completes, regardless of events
      setStatus("siap");
    } else {
      setMessages(m => [...m, { role:"user", text: display||content }, { role:"model", text:"", run:null }]);
      if (canvasAuto && !canvasRef.current) _setCanvas({ doc: CANVAS_BUILDING, run: null });   // Web Dev → split opens immediately (only first time)
      let lastCanvasT = 0;
      try {
        const res = await streamChat(reqFor(modelVal,getCloud(),newHist,canvasAuto),(t,run)=>{
          setMessages(m=>{ const c=m.slice(); c[c.length-1]={role:"model",text:t,run}; return c; });
          { const now = Date.now(); if (now - lastCanvasT > 450) {
            const p = canvasAuto ? buildPreview(t) : { has:false };          // web/flutter preview only in Web Dev mode
            if (p.has) { lastCanvasT = now; _setCanvas(p.flutter
              ? { flutter: p.streaming ? null : p.source, doc: p.a2ui ? A2UI_STREAMING : FLUTTER_STREAMING, run: null, files: p.files }  // A2UI: only send complete JSON to studio; incomplete JSON crashes Flutter jsonDecode
              : { doc: p.doc, run: null, files: p.files }); }                 // web: live preview is cheap, keep it
            else if (run) { lastCanvasT = now; _setCanvas({ doc: consoleDoc(run), run }); }   // any executed code → live terminal view
          } }
        }, ctrl.signal);
        setMessages(m=>{ const c=m.slice(); c[c.length-1]={role:"model",text:res.text,run:res.run}; return c; });
        setHistory(h => [...h, { role:"assistant", content: res.text }]);
        setStatus(res.run ? (res.run.ok ? "✓ verified" : "⚠ not passing") : "ready");
        const proj = buildPreview(res.text);              // finalize the live Canvas
        console.log('[doSend] final buildPreview:', proj.has ? (proj.flutter ? 'flutter/a2ui' : 'web') : 'none', '| canvasRef.flutter:', !!canvasRef.current?.flutter);
        if (proj.has) {
          if (proj.flutter) {
            const fstate = { flutter: proj.source, doc: proj.a2ui ? A2UI_STREAMING : FLUTTER_COMPILING, files: proj.files };
            lastProject.current = fstate; _setCanvas(fstate);
          } else {
            const wstate = { doc: proj.doc, run: res.run, files: proj.files };
            lastProject.current = wstate; _setCanvas(wstate);
          }
        } else if (res.run) {
          // No web/flutter content but code WAS executed — show the terminal in Canvas
          _setCanvas({ doc: consoleDoc(res.run), run: res.run });
        } else if (canvasAuto && !canvasRef.current?.flutter) { /* no A2UI — keep previous canvas state (close only if never had one) */ if (!canvasRef.current) _setCanvas(null); }
      } catch(e){ if(e.name!=="AbortError"){ setMessages(m=>{ const c=m.slice(); c[c.length-1]={role:"model",text:"[error: "+e.message+"]"}; return c; }); setStatus("error"); console.log('[doSend] Setting busy=false (canvas auto error)'); setBusy(false); } else setStatus("dibatalkan"); console.log('[doSend] Setting busy=false (canvas auto abort)'); setBusy(false); }
    }
    ctrlRef.current=null; setBusy(false);
  };
  const aiEditCode = (code, lang, instruction) => {
    const prompt = "Ubah kode berikut sesuai instruksi. Kembalikan HANYA satu blok kode (bertag bahasa "+lang+").\nInstruksi: "+instruction+"\n\n```"+lang+"\n"+code+"\n```";
    doSend(prompt, "✦ Ubah ("+lang+"): "+instruction);
  };
  const cancel = () => { console.log('[cancel] Aborting and setting busy=false'); if(ctrlRef.current) ctrlRef.current.abort(); setBusy(false); setStatus("dibatalkan"); };
  const reset = () => { setMessages([]); setHistory([]); setBusy(false); setStatus("ready"); };
  const saveChat = () => {
    if (messages.length === 0) return;
    try {
      const saved = JSON.parse(localStorage.getItem("quantum_chats") || "[]");
      saved.push({
        id: Date.now(),
        title: messages[0]?.text?.slice(0, 60) || "Chat",
        messages: messages,
        history: history,
        savedAt: new Date().toISOString()
      });
      localStorage.setItem("quantum_chats", JSON.stringify(saved));
      loadSavedChats();
    } catch(e) { /* ignore storage errors */ }
  };

  return (
    <div className={"app has-sidebar"+(sbCollapsed?" sb-collapsed":"")}>
      <Sidebar collapsed={sbCollapsed} setCollapsed={setSbCollapsed}
        view={view} setView={setView}
        onNewChat={()=>{ saveChat(); reset(); setView("chat"); loadSavedChats(); }}
        onVisualPicker={()=>{ startPicker(); }}
        canvasAuto={canvasAuto} onToggleCanvas={toggleCanvas}
        theme={theme} setTheme={setTheme}
        terminalOpen={terminalOpen} setTerminalOpen={setTerminalOpen}
        terminal={terminal}
        savedChats={savedChats} showHistory={showHistory} setShowHistory={setShowHistory}
        restoreChat={restoreChat} deleteChat={deleteChat} loadSavedChats={loadSavedChats} />
      <div className="page-container">
        <div className={"page chat-page " + (view==="chat" ? "active" : "exit")}>
          <TopBar models={models} modelVal={modelVal} setModelVal={setModelVal}
            panelOpen={panelOpen} setPanelOpen={setPanelOpen} onReset={reset} status={status} theme={theme} setTheme={setTheme} />
          <div className="chat-split">
            <div className="chat-col" style={{ flex: canvas ? ("1 1 " + (100 - canvasPct) + "%") : "1 1 100%" }}>
              <div className="chat-scroll" ref={scrollRef}>
                {messages.length === 0 ? (
                  <div className="empty">
                    <span className="glyph"><Icon.spark style={{ color:"#fff" }} /></span>
                    <h2>Enjoy development</h2>
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
              {canvas.flutter
                ? <StudioFrame source={canvas.flutter} onClose={()=>{ _setCanvas(null); _setCanvasAuto(false); lastProject.current = null; }} />
                : <CanvasPanel project={canvas} modelVal={modelVal} onClose={()=>{ _setCanvas(null); _setCanvasAuto(false); lastProject.current = null; }} />}
            </div>}
          </div>
        </div>
        <div className={"page hub-page " + (view==="hub" ? "active" : "enter")}>
          {view === "hub" && <ModelHubView onBack={()=>setView("chat")} theme={theme} setTheme={setTheme} onChanged={loadModels}
            onUse={(port)=>{ if(port) setModelVal(String(port)); loadModels(); setView("chat"); }} />}
        </div>
        <div className={"page hub-page " + (view==="settings" ? "active" : "enter")}>
          {view === "settings" && <SettingsView onBack={()=>setView("chat")} onSaved={loadModels} onCloudChanged={()=>setCloudVersion(v=>v+1)} />}
        </div>
      </div>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
