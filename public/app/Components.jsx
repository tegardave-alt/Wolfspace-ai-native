// Components — diekstrak dari app.jsx (lihat public/app.jsx untuk App orkestrator).
// Dimuat via APP_MODULES di index.html: di-CONCAT SEBELUM app.jsx (prepend) lalu
// Babel sekali -> satu scope global. Body fungsi (hooks/React/SB) jalan saat render.

/* ----------------------------- Model Interface (collapsible dropdown) ----------------------------- */
function ModelInterface({ models, modelVal, setModelVal }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const handle = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);
  const current = models.find((m) => m.value === modelVal);
  const label = current ? current.label : modelVal;
  return (
    <div className="model-interface" ref={ref}>
      <button
        className="mi-trigger"
        onClick={() => setOpen(!open)}
        title={label}
      >
        <span className="mi-label">{label}</span>
        <Icon.chev
          className={"mi-chev" + (open ? " open" : "")}
          style={{ width: 14, height: 14 }}
        />
      </button>
      {open && (
        <div className="mi-panel">
          {models.map((m) => (
            <div
              key={m.value}
              className={
                "mi-opt" +
                (m.value === modelVal ? " active" : "") +
                (m.disabled ? " disabled" : "")
              }
              onClick={() => {
                if (!m.disabled) {
                  setModelVal(m.value);
                  setOpen(false);
                }
              }}
            >
              {m.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Top bar ----------------------------- */
function TopBar({
  models,
  modelVal,
  setModelVal,
  panelOpen,
  setPanelOpen,
  onReset,
  status,
  theme,
  setTheme,
  terminalOpen,
  setTerminalOpen,
}) {
  return (
    <header className="topbar">
      <div className="tb-spacer" />
      <button 
        className={`panel-toggle-btn ${panelOpen ? 'active' : ''}`}
        onClick={() => setPanelOpen(!panelOpen)}
        title="Toggle Right Panel"
        style={{ 
          opacity: panelOpen ? 1 : 0.7, 
          background: 'transparent', 
          border: 'none', 
          cursor: 'pointer', 
          color: 'inherit',
          padding: '6px',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
          <line x1="15" x2="15" y1="3" y2="21"/>
        </svg>
      </button>
    </header>
  );
}

/* ----------------------------- HuggingFace models ----------------------------- */
function fmtSize(b) {
  if (!b) return "";
  const gb = b / 1073741824;
  return gb >= 1 ? gb.toFixed(2) + " GB" : (b / 1048576).toFixed(0) + " MB";
}
function HFModels({ onSaved }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [sel, setSel] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null);
  const [msg, setMsg] = useState("");
  const search = async () => {
    const t = q.trim();
    if (!t) return;
    setMsg("Mencari model...");
    setResults([]);
    setSel("");
    setFiles([]);
    try {
      const r = await (
        await fetch("/hf/search?q=" + encodeURIComponent(t))
      ).json();
      if (r.error) throw new Error(r.error);
      setResults(r);
      setMsg(r.length ? "" : "Belum ada hasil yang cocok.");
    } catch (e) {
      setMsg("Pencarian gagal: " + e.message);
    }
  };
  const pick = async (id) => {
    setSel(id);
    setFiles([]);
    setMsg("Memuat daftar file...");
    try {
      const r = await (
        await fetch("/hf/files?id=" + encodeURIComponent(id))
      ).json();
      if (r.error) throw new Error(r.error);
      setFiles(r);
      setMsg(r.length ? "" : "Tidak ada file .gguf di repositori ini.");
    } catch (e) {
      setMsg("Gagal memuat file: " + e.message);
    }
  };
  const download = async (file) => {
    if (busy) return;
    setBusy(true);
    setProg(0);
    setMsg("Mengunduh " + file.split("/").pop() + "...");
    try {
      const res = await fetch("/hf/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sel, file }),
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          const m = line.match(/^data:\s*(.*)$/);
          if (!m) continue;
          let j;
          try {
            j = JSON.parse(m[1]);
          } catch (e) {
            continue;
          }
          if (j.t === "progress") setProg(j.pct);
          else if (j.t === "done") {
            setMsg(
              "Selesai: " +
                j.model.name +
                " sudah diunduh dan dijalankan di port " +
                j.model.port +
                ". Tunggu sekitar 30 detik, lalu pilih dari menu Model.",
            );
            onSaved && onSaved();
          } else if (j.t === "err") setMsg("Unduhan gagal: " + j.m);
        }
      }
    } catch (e) {
      setMsg("Unduhan gagal: " + e.message);
    }
    setBusy(false);
    setProg(null);
  };
  return (
    <div className="hf">
      <label className="field-label">Model HuggingFace</label>
      <div className="hf-search">
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari GGUF, misalnya qwen coder"
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
        />
        <button className="btn btn-primary" onClick={search}>
          Cari
        </button>
      </div>
      {results.length > 0 && (
        <div className="hf-res">
          {results.map((m) => (
            <button
              key={m.id}
              className={"hf-item" + (sel === m.id ? " sel" : "")}
              onClick={() => pick(m.id)}
            >
              {m.id}
              <br />
              <span className="meta">
                Unduhan {m.downloads.toLocaleString()} � Suka {m.likes}
              </span>
            </button>
          ))}
        </div>
      )}
      {sel &&
        files.map((f) => {
          const heavy = f.size > 4 * 1073741824;
          return (
            <div className="hf-file" key={f.path}>
              <span className="nm">{f.path.split("/").pop()}</span>
              <span className={"sz" + (heavy ? " heavy" : "")}>
                {fmtSize(f.size)}
                {heavy ? " ?" : ""}
              </span>
              <button
                className="hf-dl"
                disabled={busy}
                onClick={() => download(f.path)}
              >
                Unduh
              </button>
            </div>
          );
        })}
      {prog !== null && (
        <div className="hf-bar">
          <div style={{ width: prog + "%" }} />
        </div>
      )}
      {msg && <div className="hf-msg">{msg}</div>}
    </div>
  );
}

/* ----------------------------- History (full page) ----------------------------- */
function HistoryView({ savedChats = [], onSelect, onDelete }) {
  const [searchQuery, setSearchQuery] = useState("");

  const formatTimeAgo = (ts) => {
    if (!ts) return "now";
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return "now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
    return `${Math.floor(diff / 2592000)}mo`;
  };

  const filteredChats = savedChats
    .slice()
    .reverse()
    .filter((c) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const title = (c.title || "").toLowerCase();
      const proj = (c.project || "").toLowerCase();
      return title.includes(q) || proj.includes(q);
    });

  return (
    <div style={{ padding: "40px 60px", maxWidth: "920px", margin: "0 auto", width: "100%", color: "#e2e8f0" }}>
      <h1 style={{ fontSize: "20px", fontWeight: 600, color: "#f3f4f6", marginBottom: "24px" }}>
        Conversation History
      </h1>

      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "32px" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            background: "#181b20",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "10px",
            padding: "10px 16px",
            gap: "10px",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#e2e8f0",
              fontSize: "14px",
              width: "100%",
              fontFamily: "inherit",
            }}
          />
        </div>
      </div>

      <div
        style={{
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.8px",
          color: "#6b7280",
          textTransform: "uppercase",
          marginBottom: "12px",
        }}
      >
        ALL CONVERSATIONS
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {filteredChats.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#6b7280", fontSize: "14px" }}>
            Belum ada riwayat percakapan yang tersimpan.
          </div>
        ) : (
          filteredChats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => onSelect(chat)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 12px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                cursor: "pointer",
                borderRadius: "8px",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ fontSize: "15px", fontWeight: 500, color: "#e2e8f0" }}>
                  {chat.title || "Chat"}
                </div>
                <div style={{ fontSize: "13px", color: "#6b7280" }}>
                  {chat.project || "WOLFSPACE"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <span style={{ fontSize: "13px", color: "#6b7280" }}>
                  {formatTimeAgo(chat.savedAt)}
                </span>
                <button
                  title="Hapus"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(chat.id);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#6b7280",
                    cursor: "pointer",
                    fontSize: "16px",
                    padding: "4px 8px",
                    borderRadius: "4px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#ef4444";
                    e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#6b7280";
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Settings (full page) ----------------------------- */
function SettingsView({ onBack, onSaved, onCloudChanged }) {
  const stored = getCloud();
  const [key, setKey] = useState("");
  const [provider, setProvider] = useState(
    stored ? (stored.baseUrl ? "custom" : stored.provider) : "auto",
  );
  const [model, setModelName] = useState(
    stored ? (keyish(stored.model) ? "" : stored.model) : "",
  );
  const [baseUrl, setBaseUrl] = useState(stored ? stored.baseUrl || "" : "");
  const [hint, setHint] = useState(
    stored
      ? "Provider " +
          stored.provider +
          " � " +
          (stored.key ? stored.key.slice(-4) : "server") +
          " � aktif"
      : "Tempel API key, lalu deteksi otomatis atau pilih provider.",
  );

  const detect = async () => {
    const k = key.trim() || (stored && stored.key);
    if (!k) {
      setHint("Tempel API key terlebih dahulu.");
      return;
    }
    setHint("Sedang mendeteksi provider...");
    try {
      const d = await (
        await fetch("/detect-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: k }),
        })
      ).json();
      if (PROVIDER_LABELS[d.provider]) setProvider(d.provider);
      setHint(
        d.verified
          ? "Terverifikasi: " + d.name
          : "Tebakan: " + d.name + " (belum terverifikasi)",
      );
    } catch (e) {
      setHint("Deteksi belum berhasil: " + e.message);
    }
  };
  const save = () => {
    const k = key.trim() || (stored && stored.key);
    if (!k) {
      setHint("Tempel API key terlebih dahulu.");
      return;
    }
    let prov, name, bu;
    if (provider === "auto") {
      const d = detectPrefix(k);
      prov = d.provider;
      name = d.name;
    } else if (provider === "custom" || provider === "cloudflare") {
      prov = provider;
      name = PROVIDER_LABELS[provider];
      bu = baseUrl.trim();
      if (!bu) {
        setHint("Isi Base URL untuk " + (provider === "cloudflare" ? "Cloudflare Worker" : "provider custom") + ".");
        return;
      }
    } else {
      prov = provider;
      name = PROVIDER_LABELS[provider];
    }
    let mdl = model.trim();
    if (stored && stored.provider !== prov) mdl = "";
    if (!mdl || keyish(mdl)) mdl = CLOUD_DEFAULT[prov] || "gpt-4o";
    setCloudLS({ key: k, provider: prov, name, model: mdl, baseUrl: bu });
    // mirror to the server so the backend agent loop can use it autonomously
    fetch("/cloud-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: k, provider: prov, model: mdl, baseUrl: bu }),
    })
      .then((r) => r.json())
      .then(() =>
        setHint(
          "Tersimpan di browser dan server: " +
            prov +
            " � " +
            k.slice(-4) +
            " ? " +
            mdl,
        ),
      )
      .catch(() =>
        setHint(
          "Tersimpan di browser: " + prov + " � " + k.slice(-4) + " ? " + mdl,
        ),
      );
    onSaved();
    onCloudChanged(); // Trigger model list reload
  };
  const clear = () => {
    setCloudLS(null);
    setKey("");
    setModelName("");
    setBaseUrl("");
    setProvider("auto");
    setHint("Konfigurasi API key sudah dihapus.");
    onSaved();
    onCloudChanged();
  };

  return (
    <div className="hub">
      <header className="hub-header">
        <span className="tb-divider" />
        <div className="hub-title-group">
          <span
            className="hub-hf-mark"
            style={{ background: "rgba(94,234,212,.14)", color: "#5eead4" }}
          >
            {SB.key({ width: 16, height: 16 })}
          </span>
          <span className="hub-title">Pengaturan API</span>
        </div>
        <div className="tb-spacer" />
      </header>
      <div className="hub-body">
        <div className="hub-inner settings-inner">
          <div className="settings-card">
            <div className="field">
              <label className="field-label">API Key Cloud</label>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={
                  stored
                    ? "Key tersimpan (... " +
                      (stored.key ? stored.key.slice(-4) : "server") +
                      ") - kosongkan untuk tetap memakai key lama"
                    : "Tempel API key di sini"
                }
              />
            </div>
            <button className="btn btn-ghost" onClick={detect}>
              Deteksi provider dari key
            </button>
            <div className="field">
              <label className="field-label">Provider</label>
              <div className="select-wrap">
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="auto">Deteksi otomatis</option>
                  {PROVIDER_OPTS.filter((p) => p !== "auto").map((p) => (
                    <option key={p} value={p}>
                      {p === "custom"
                        ? "OpenAI-compatible (URL custom)"
                        : PROVIDER_LABELS[p]}
                    </option>
                  ))}
                </select>
                <Icon.chev className="chev" style={{ width: 15, height: 15 }} />
              </div>
            </div>
          {(provider === "custom" || provider === "cloudflare") && (
            <div className="field">
              <label className="field-label">Base URL</label>
              <input
                className="input"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={provider === "cloudflare" ? "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1" : "https://host/v1"}
              />
            </div>
          )}
            <div className="field">
              <label className="field-label">Model</label>
              <input
                className="input"
                value={model}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="Opsional, misalnya qwen, coder, gpt-4o"
              />
            </div>
            <div className="provider-status">
              <span className="status-dot" />
              {hint}
            </div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={save}>
                <Icon.check style={{ width: 14, height: 14 }} /> Simpan
              </button>
              <button className="btn btn-danger" onClick={clear}>
                Hapus konfigurasi
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Syntax highlight ----------------------------- */
const KW = {
  python:
    "def class return if elif else for while in and or not import from as with try except finally lambda None True False print pass break continue is global nonlocal yield assert raise del self".split(
      " ",
    ),
  javascript:
    "function return if else for while const let var class new typeof instanceof import from export default await async try catch finally throw switch case break continue this null undefined true false of in delete void yield".split(
      " ",
    ),
};
KW.typescript = KW.javascript;
KW.go =
  "func return if else for range var const type struct interface package import map chan go defer nil true false switch case break continue".split(
    " ",
  );
function highlight(code, lang) {
  const kws = KW[lang] || KW.javascript;
  const re =
    /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+\.?\d*\b)|([A-Za-z_$][\w$]*)(\s*\()?/g;
  let out = "",
    last = 0,
    m;
  while ((m = re.exec(code))) {
    out += escHtml(code.slice(last, m.index));
    if (m[1]) out += '<span class="t-com">' + escHtml(m[1]) + "</span>";
    else if (m[2]) out += '<span class="t-str">' + escHtml(m[2]) + "</span>";
    else if (m[3]) out += '<span class="t-num">' + escHtml(m[3]) + "</span>";
    else if (m[4] !== undefined) {
      const w = m[4],
        paren = m[5] || "";
      if (kws.indexOf(w) >= 0)
        out += '<span class="t-kw">' + escHtml(w) + "</span>";
      else if (paren) out += '<span class="t-fn">' + escHtml(w) + "</span>";
      else out += escHtml(w);
      out += escHtml(paren);
    }
    last = re.lastIndex;
  }
  out += escHtml(code.slice(last));
  return out;
}

/* ----------------------------- Code block ----------------------------- */
const LANGS = [
  "python",
  "javascript",
  "typescript",
  "bash",
  "go",
  "c",
  "cpp",
  "java",
  "php",
  "rust",
  "kotlin",
  "html",
  "css",
  "json",
];
const MLANG = {
  js: "javascript",
  javascript: "javascript",
  node: "javascript",
  ts: "typescript",
  typescript: "typescript",
  py: "python",
  python: "python",
  go: "go",
  golang: "go",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  java: "java",
  php: "php",
  rust: "rust",
  kotlin: "kotlin",
  html: "html",
  css: "css",
  json: "json",
  bash: "shell",
  sh: "shell",
  shell: "shell",
  sql: "sql",
  yaml: "yaml",
  markdown: "markdown",
};
function mLang(l) {
  return MLANG[(l || "").toLowerCase()] || "plaintext";
}

// Per-language monogram badge (color + short symbol) � clean, no heavy logo assets.
const LANG_META = {
  python: { l: "Python", s: "Py", c: "#3776AB" },
  javascript: { l: "JavaScript", s: "JS", c: "#F7DF1E", d: 1 },
  typescript: { l: "TypeScript", s: "TS", c: "#3178C6" },
  bash: { l: "Bash", s: ">_", c: "#4EAA25" },
  go: { l: "Go", s: "Go", c: "#00ADD8" },
  c: { l: "C", s: "C", c: "#5C6BC0" },
  cpp: { l: "C++", s: "C+", c: "#00599C" },
  java: { l: "Java", s: "Jv", c: "#E76F00" },
  php: { l: "PHP", s: "php", c: "#777BB4" },
  rust: { l: "Rust", s: "Rs", c: "#D9844B" },
  kotlin: { l: "Kotlin", s: "Kt", c: "#7F52FF" },
  html: { l: "HTML", s: "<>", c: "#E34F26" },
  css: { l: "CSS", s: "#", c: "#1572B6" },
  json: { l: "JSON", s: "{}", c: "#A0A6B0" },
};
const LANG_LOGOS = new Set([
  "python",
  "javascript",
  "typescript",
  "bash",
  "go",
  "c",
  "cpp",
  "java",
  "php",
  "rust",
  "kotlin",
  "html",
  "css",
  "json",
]);
function LangIcon({ lang }) {
  const m = LANG_META[lang] || {
    l: lang,
    s: (lang || "?").slice(0, 2),
    c: "#7c8aa0",
  };
  if (LANG_LOGOS.has(lang))
    return (
      <img
        className="lang-logo"
        src={"/vendor/lang/" + lang + ".svg"}
        alt={m.l}
        loading="lazy"
        onError={(e) => {
          const sp = document.createElement("span");
          sp.className = "lang-badge";
          sp.style.background = m.c;
          sp.style.color = m.d ? "#111" : "#fff";
          sp.textContent = m.s;
          e.target.replaceWith(sp);
        }}
      />
    );
  return (
    <span
      className="lang-badge"
      style={{ background: m.c, color: m.d ? "#111" : "#fff" }}
    >
      {m.s}
    </span>
  );
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  const [language, setLanguage] = useState((lang || "python").toLowerCase());
  const [runState, setRunState] = useState("idle");
  const [out, setOut] = useState(null);
  const [edReady, setEdReady] = useState(false); // Monaco mounted? else show <pre> fallback
  const hostRef = useRef(null);
  const edRef = useRef(null);
  const focusedRef = useRef(false);
  const getCode = () => (edRef.current ? edRef.current.getValue() : code);

  useEffect(() => {
    let disposed = false;
    if (!window.monacoReady) return;
    window.monacoReady.then((monaco) => {
      if (disposed || !hostRef.current) return;
      // One-time fix: kill Monaco's blue outline (always-on via .monaco-editor rule in editor.main.css)
      if (!document.getElementById("monaco-outline-fix")) {
        const s = document.createElement("style");
        s.id = "monaco-outline-fix";
        s.textContent =
          ".monaco-editor { outline: none !important; outline-offset: 0 !important; }";
        document.head.appendChild(s);
      }
      const ed = monaco.editor.create(hostRef.current, {
        value: code,
        language: mLang(language),
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineNumbers: "on",
        renderLineHighlight: "none",
        tabSize: 4,
        scrollbar: { alwaysConsumeMouseWheel: false },
        padding: { top: 8, bottom: 8 },
        wordWrap: "off",
        domReadOnly: false,
        readOnly: false,
        autoDetectHighContrast: false,
      });
      edRef.current = ed;
      setEdReady(true);
      const fit = () => {
        if (!hostRef.current) return;
        hostRef.current.style.height =
          Math.min(Math.max(ed.getContentHeight(), 38), 540) + "px";
        ed.layout();
      };
      ed.onDidContentSizeChange(fit);
      fit();
      ed.onDidFocusEditorText(() => {
        focusedRef.current = true;
      });
      ed.onDidBlurEditorText(() => {
        focusedRef.current = false;
      });
    });
    return () => {
      disposed = true;
      if (edRef.current) {
        edRef.current.dispose();
        edRef.current = null;
      }
    };
  }, []);
  // follow streaming text until the user starts editing
  useEffect(() => {
    const ed = edRef.current;
    if (ed && !focusedRef.current && ed.getValue() !== code) ed.setValue(code);
  }, [code]);
  useEffect(() => {
    const ed = edRef.current;
    if (ed && window.monaco)
      window.monaco.editor.setModelLanguage(ed.getModel(), mLang(language));
  }, [language]);

  const copyCode = () => {
    navigator.clipboard?.writeText(getCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const run = async () => {
    setRunState("running");
    setOut(null);
    try {
      const r = await fetch("/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: language, code: getCode() }),
      });
      setOut(await r.json());
    } catch (e) {
      setOut({ ok: false, error: "Server belum bisa dijangkau: " + e.message });
    }
    setRunState("done");
  };

  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-dots">
          <span style={{ background: "#ff5f57" }} />
          <span style={{ background: "#febc2e" }} />
          <span style={{ background: "#28c840" }} />
        </span>
        <span className="code-lang">{language}</span>
        <span className="lang-spacer" />
      </div>
      <div
        className="monaco-host"
        ref={hostRef}
        style={{ display: edReady ? "block" : "none" }}
      />
      {!edReady && (
        <pre
          className="code-fallback"
          style={{
            margin: 0,
            padding: "10px 14px",
            overflow: "auto",
            color: "#cbd5e1",
            background: "#0d1117",
            font: "13px/1.6 ui-monospace,Consolas,monospace",
            whiteSpace: "pre",
          }}
        >
          {code}
        </pre>
      )}
      <div className="code-toolbar">
        <button

          className={"ctb-btn" + (copied ? " copied" : "")}
          onClick={copyCode}
        >
          {copied ? <Icon.check /> : <Icon.copy />} {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {runState === "done" && out && (
        <div className={"code-output " + (out.ok ? "ok" : "err")}>
          <div className="output-head">
            <span className="ok-mark">
              {out.ok ? (
                <>
                  <Icon.check /> ran (exit 0)
                </>
              ) : (
                <>? error</>
              )}{" "}
              � {language}
            </span>
          </div>
          <div className="output-body">
            {(out.output || "") + (out.error ? "\n" + out.error : "") ||
              "(no output)"}
          </div>
        </div>
      )}
    </div>
  );
}

function parseMermaidFlowchart(code) {
  const lines = String(code || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line && !/^%%/.test(line) && !/^(flowchart|graph)\b/i.test(line),
    );

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
    const m = raw.match(
      /^([A-Za-z0-9_:-]+)\s*(?:\[\[([\s\S]+)\]\]|\[([\s\S]+)\]|\(\(([\s\S]+)\)\)|\(([^()]+)\)|\{([\s\S]+)\})?$/,
    );
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
    const edgeMatch = line.match(
      /^(.*?)\s*(?:--\s*([^>-]+?)\s*-->|-+>|\.->)\s*(.*)$/,
    );
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
  for (const n of nodes.keys()) {
    incoming.set(n, 0);
    outgoing.set(n, []);
  }
  for (const e of edges) {
    incoming.set(e.to, (incoming.get(e.to) || 0) + 1);
    outgoing.get(e.from).push(e.to);
  }

  const level = new Map();
  const queue = [];
  for (const [id, deg] of incoming.entries()) {
    if (deg === 0) {
      level.set(id, 0);
      queue.push(id);
    }
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
  layers.forEach((layer) =>
    layer.sort((a, b) => nodes.get(a).order - nodes.get(b).order),
  );

  const fontSize = 14;
  const padX = 18;
  const padY = 12;
  const gapX = 42;
  const gapY = 54;
  const layerGap = 86;
  const measure = (label) =>
    Math.max(96, Math.min(260, label.length * 8.5 + padX * 2));

  const positioned = new Map();
  let maxWidth = 0;
  let maxHeight = 0;
  for (let ly = 0; ly < layers.length; ly++) {
    const layer = layers[ly] || [];
    let rowWidth = 0;
    const sizes = layer.map((id) => ({
      id,
      w: measure(nodes.get(id).label),
      h: 54,
    }));
    rowWidth =
      sizes.reduce((sum, item) => sum + item.w, 0) +
      Math.max(0, sizes.length - 1) * gapX;
    let x = Math.max(24, Math.max(0, rowWidth) ? 0 : 0);
    const topY = 28 + ly * layerGap;
    const startX = 24;
    let cursorX = startX;
    for (const item of sizes) {
      positioned.set(item.id, {
        x: cursorX,
        y: topY,
        w: item.w,
        h: item.h,
        layer: ly,
      });
      cursorX += item.w + gapX;
      maxWidth = Math.max(maxWidth, cursorX);
      maxHeight = Math.max(maxHeight, topY + item.h);
    }
  }

  return {
    nodes,
    edges,
    positioned,
    width: Math.max(360, maxWidth + 24),
    height: Math.max(120, maxHeight + 28),
    fontSize,
    padX,
    padY,
  };
}

// ── Jembatan mermaid -> Cytoscape ──
// mermaid dipakai sebagai BAHASA MASUKAN (mudah bagi model menulisnya); kita ubah jadi
// elements Cytoscape supaya diagram jadi INTERAKTIF (drag/zoom/ganti-layout), bukan
// gambar mati. Mendaur ulang parseMermaidFlowchart yang sudah mengekstrak node+edge.
function mermaidToCytoElements(code) {
  const raw = String(code || "");
  // Subgraph -> compound node. parseMermaidFlowchart tak paham `subgraph`/`end` dan
  // malah membuat node sampah, jadi kita pisahkan baris itu dulu sambil merekam node
  // mana milik grup mana. Node bergrup dapat data.parent; grup jadi compound node.
  const subs = {};        // subId -> title
  const parentOf = {};    // nodeId -> subId (grup terdalam yang pertama merujuknya)
  const stack = [];
  const clean = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^subgraph\b/i.test(line)) {
      const rest = line.replace(/^subgraph\s+/i, "");
      const mB = rest.match(/^([A-Za-z0-9_:-]+)\s*\[([^\]]*)\]/) || rest.match(/^([A-Za-z0-9_:-]+)\s*"([^"]*)"/);
      let id, title;
      if (mB) { id = mB[1]; title = mB[2]; }
      else if (/^[A-Za-z0-9_:-]+$/.test(rest.trim())) { id = rest.trim(); title = id; }
      else { id = "sg" + Object.keys(subs).length; title = rest.replace(/["']/g, "").trim(); }
      subs[id] = String(title).replace(/^["']|["']$/g, "");
      stack.push(id);
      continue;
    }
    if (/^end$/i.test(line)) { stack.pop(); continue; }
    if (stack.length) {
      const cur = stack[stack.length - 1];
      for (const t of (line.match(/[A-Za-z0-9_:-]+/g) || [])) if (!parentOf[t]) parentOf[t] = cur;
    }
    clean.push(rawLine);
  }
  const parsed = parseMermaidFlowchart(clean.join("\n"));
  if (!parsed || !parsed.nodes || !parsed.nodes.size) return null;

  const cleanLabel = (l) => String(l || "").replace(/<br\s*\/?>/gi, "\n").replace(/^\s*["']|["']\s*$/g, "");
  const usedSubs = new Set();
  for (const id of parsed.nodes.keys()) if (parentOf[id] && subs[parentOf[id]]) usedSubs.add(parentOf[id]);
  const parents = [...usedSubs].map((id) => ({ data: { id, label: subs[id], isParent: 1 } }));

  const nodes = [...parsed.nodes.values()].map((n) => ({
    data: {
      id: n.id, label: cleanLabel(n.label || n.id), shape: n.shape || "rect", deg: 0,
      parent: (parentOf[n.id] && usedSubs.has(parentOf[n.id])) ? parentOf[n.id] : undefined,
    },
  }));
  const byId = new Map(nodes.map((n) => [n.data.id, n]));
  const edges = (parsed.edges || []).map((e, i) => {
    if (byId.get(e.from)) byId.get(e.from).data.deg++;
    if (byId.get(e.to)) byId.get(e.to).data.deg++;
    return { data: { id: "ce" + i, source: e.from, target: e.to, label: e.label || "" } };
  });
  return [...parents, ...nodes, ...edges];
}

function cyLayoutOpts(name) {
  const o = { name, padding: 22, animate: true, animationDuration: 350 };
  if (name === "breadthfirst") { o.directed = true; o.spacingFactor = 1.1; }
  else if (name === "cose") { o.idealEdgeLength = 80; o.nodeRepulsion = 8000; o.gravity = 0.3; }
  else if (name === "concentric") { o.concentric = (n) => n.degree(); o.levelWidth = () => 3; }
  return o;
}

const CY_STYLE = [
  { selector: "node", style: { "background-color": "#141d2b", "border-color": "#8fb3ff", "border-width": 1.5, "label": "data(label)", "color": "#dce4f0", "font-family": "ui-monospace, monospace", "font-size": 11, "text-valign": "center", "text-halign": "center", "text-wrap": "wrap", "text-max-width": 150, "shape": "round-rectangle", "width": "label", "height": "label", "padding": "9px" } },
  { selector: 'node[shape="diamond"]', style: { "shape": "diamond", "width": 76, "height": 54 } },
  { selector: 'node[shape="circle"]', style: { "shape": "ellipse" } },
  { selector: 'node[shape="round"]', style: { "shape": "round-rectangle" } },
  { selector: 'node[shape="subroutine"]', style: { "shape": "cut-rectangle" } },
  // compound node = grup subgraph: kotak transparan berlabel di atas, anak-anak di dalam
  { selector: "node[?isParent]", style: { "background-color": "#8fb3ff", "background-opacity": 0.05, "border-color": "#3a4a63", "border-width": 1, "shape": "round-rectangle", "label": "data(label)", "text-valign": "top", "text-halign": "center", "font-size": 10, "color": "#8fb3ff", "padding": "16px", "text-margin-y": 3, "width": "label", "height": "label" } },
  { selector: "node[deg >= 4]", style: { "border-width": 2.5, "border-color": "#a9c6ff", "background-color": "#182741" } },
  { selector: "edge", style: { "width": 1.4, "line-color": "#3f5578", "target-arrow-color": "#5f7bb0", "target-arrow-shape": "triangle", "curve-style": "bezier", "arrow-scale": 0.9, "opacity": 0.9, "label": "data(label)", "font-family": "ui-monospace, monospace", "font-size": 9, "color": "#9fb7d9", "text-background-color": "#0d1117", "text-background-opacity": 0.85, "text-background-padding": 2 } },
  { selector: "node.hl", style: { "border-color": "#ffd479", "border-width": 2.5 } },
  { selector: "edge.hl", style: { "line-color": "#8fb3ff", "target-arrow-color": "#8fb3ff", "opacity": 1, "width": 2 } },
];

// Renderer INTERAKTIF: mermaid (teks) -> Cytoscape (kanvas). Dipakai lewat DiagramBlock
// hanya saat user menekan "interaktif" (default tetap mermaid.js fidelitas-penuh).
function CytoscapeBlock({ code, onStatic }) {
  const ref = useRef(null);
  const cyRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [layout, setLayout] = useState("breadthfirst");
  const elements = useMemo(() => { try { return mermaidToCytoElements(code); } catch (e) { return null; } }, [code]);

  useEffect(() => {
    if (!elements || typeof window === "undefined" || typeof window.cytoscape !== "function" || !ref.current) { setFailed(true); return; }
    let cy;
    try {
      cy = window.cytoscape({ container: ref.current, elements, style: CY_STYLE, layout: cyLayoutOpts("breadthfirst"), wheelSensitivity: 0.2, minZoom: 0.2, maxZoom: 3 });
    } catch (e) { setFailed(true); return; }
    cyRef.current = cy;
    cy.on("mouseover", "node", (e) => { const n = e.target; n.addClass("hl"); n.connectedEdges().addClass("hl").connectedNodes().addClass("hl"); });
    cy.on("mouseout", "node", () => cy.elements().removeClass("hl"));
    return () => { try { cy.destroy(); } catch (_) {} cyRef.current = null; };
  }, [elements]);

  useEffect(() => { if (cyRef.current) cyRef.current.layout(cyLayoutOpts(layout)).run(); }, [layout]);

  if (failed || !elements) return <MermaidBlock code={code} />;
  const btn = (l) => ({ fontFamily: "ui-monospace,monospace", fontSize: 11, color: layout === l ? "#dce4f0" : "#8b98ac", background: layout === l ? "rgba(143,179,255,0.16)" : "transparent", border: "1px solid " + (layout === l ? "#8fb3ff" : "#2a3542"), borderRadius: 6, padding: "3px 9px", cursor: "pointer" });
  return (
    <div className="mermaid-block">
      <div className="code-head">
        <span className="code-dots">
          <span style={{ background: "#ff5f57" }} />
          <span style={{ background: "#febc2e" }} />
          <span style={{ background: "#28c840" }} />
        </span>
        <span className="code-lang">graph · interaktif</span>
        <span className="lang-spacer" />
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          {["breadthfirst", "cose", "concentric"].map((l) => (
            <button key={l} style={btn(l)} onClick={() => setLayout(l)}>{l}</button>
          ))}
          <button style={btn("_fit")} onClick={() => cyRef.current && cyRef.current.animate({ fit: { padding: 22 } }, { duration: 250 })}>fit</button>
          {onStatic ? <button style={btn("_st")} onClick={onStatic} title="Kembali ke diagram statis (fidelitas penuh)">← statis</button> : null}
        </div>
      </div>
      <div ref={ref} style={{ height: 360, width: "100%", background: "radial-gradient(circle at 50% 40%, #0f1620, #0d1117)", borderRadius: "0 0 8px 8px" }} />
    </div>
  );
}

// Wrapper yang dipakai chat untuk setiap blok ```mermaid. DEFAULT = mermaid.js asli
// (fidelitas penuh: semua jenis diagram, bentuk, subgraph, warna). Kalau diagram itu
// flowchart yang bisa dikonversi ke graph, tampilkan tombol "interaktif" -> Cytoscape.
// Jadi kekayaan mermaid tak pernah dikorbankan; interaktivitas bersifat opt-in.
function DiagramBlock({ code }) {
  const [interactive, setInteractive] = useState(false);
  const canInteractive = useMemo(() => {
    if (typeof window === "undefined" || typeof window.cytoscape !== "function") return false;
    try { const els = mermaidToCytoElements(code); return !!(els && els.some((e) => !e.data.source && !e.data.isParent)); }
    catch (e) { return false; }
  }, [code]);
  if (interactive && canInteractive) return <CytoscapeBlock code={code} onStatic={() => setInteractive(false)} />;
  return <MermaidBlock code={code} onInteractive={canInteractive ? () => setInteractive(true) : null} />;
}

// Renderer utama: mermaid.js ASLI (window.mermaid, di-vendor di index.html). Paham
// <br/>, subgraph, bentuk node, dan layout dagre yang rapih. Kalau mermaid gagal /
// belum termuat, jatuh ke MermaidBlockFallback (parser SVG custom) supaya tak pernah
// menampilkan kode mentah.
function MermaidBlock({ code, onInteractive }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const m = typeof window !== "undefined" ? window.mermaid : null;
    if (!m || !m.render) { setFailed(true); return; }
    let cancelled = false;
    try {
      if (!window.__mermaidInit) {
        m.initialize({
          startOnLoad: false, securityLevel: "loose", theme: "base",
          themeVariables: {
            background: "#0d1117", primaryColor: "#1c2634", primaryBorderColor: "#c8d3e0",
            primaryTextColor: "#eaf0f7", lineColor: "#8fb3ff", secondaryColor: "#161b22",
            tertiaryColor: "#0d1117", clusterBkg: "#12161d", clusterBorder: "#2b3546",
            edgeLabelBackground: "#0d1117", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", fontSize: "15px",
          },
          flowchart: { curve: "basis", htmlLabels: true, nodeSpacing: 46, rankSpacing: 54, padding: 10, useMaxWidth: true },
        });
        window.__mermaidInit = true;
      }
      const id = "mmd-" + Math.random().toString(36).slice(2, 9);
      Promise.resolve(m.render(id, code)).then(({ svg }) => {
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      }).catch(() => { if (!cancelled) setFailed(true); });
    } catch (e) { setFailed(true); }
    return () => { cancelled = true; };
  }, [code]);

  if (failed) return <MermaidBlockFallback code={code} />;
  return (
    <div className="mermaid-block">
      <div className="code-head">
        <span className="code-dots">
          <span style={{ background: "#ff5f57" }} />
          <span style={{ background: "#febc2e" }} />
          <span style={{ background: "#28c840" }} />
        </span>
        <span className="code-lang">mermaid</span>
        <span className="lang-spacer" />
        {onInteractive ? (
          <button
            onClick={onInteractive}
            title="Buka sebagai graph interaktif (drag / zoom / layout)"
            style={{ marginLeft: "auto", fontFamily: "ui-monospace,monospace", fontSize: 11, color: "#8fb3ff", background: "rgba(143,179,255,0.12)", border: "1px solid #8fb3ff", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}
          >
            ⇱ interaktif
          </button>
        ) : null}
      </div>
      <div className="mermaid-canvas" ref={ref} style={{ overflowX: "auto", padding: "12px 14px 16px", display: "flex", justifyContent: "center" }} />
    </div>
  );
}

function MermaidBlockFallback({ code }) {
  const diagram = useMemo(() => parseMermaidFlowchart(code), [code]);
  if (!diagram) {
    return (
      <pre
        className="code-fallback"
        style={{
          margin: 0,
          padding: "10px 14px",
          overflow: "auto",
          color: "#cbd5e1",
          background: "#0d1117",
          font: "13px/1.6 ui-monospace,Consolas,monospace",
          whiteSpace: "pre",
        }}
      >
        {code}
      </pre>
    );
  }

  const { nodes, edges, positioned, width, height, fontSize, padX, padY } =
    diagram;

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
        <span className="code-dots">
          <span style={{ background: "#ff5f57" }} />
          <span style={{ background: "#febc2e" }} />
          <span style={{ background: "#28c840" }} />
        </span>
        <span className="code-lang">mermaid</span>
        <span className="lang-spacer" />
      </div>
      <div
        className="mermaid-canvas"
        style={{ overflowX: "auto", padding: "10px 12px 14px" }}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Mermaid flowchart"
        >
          <defs>
            <marker
              id="mermaid-arrow"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#8fb3ff" />
            </marker>
          </defs>
          <rect
            x="0"
            y="0"
            width={width}
            height={height}
            rx="14"
            fill="#0d1117"
          />
          {edges.map((e, idx) => {
            const a = positioned.get(e.from);
            const b = positioned.get(e.to);
            if (!a || !b) return null;
            const path = edgePath(e.from, e.to);
            const midX = (a.x + a.w / 2 + b.x + b.w / 2) / 2;
            const midY = (a.y + a.h + b.y) / 2 - 8;
            return (
              <g key={idx}>
                <path
                  d={path}
                  fill="none"
                  stroke="#8fb3ff"
                  strokeWidth="1.8"
                  markerEnd="url(#mermaid-arrow)"
                  opacity="0.95"
                />
                {e.label ? (
                  <text
                    x={midX}
                    y={midY}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#9fb7d9"
                    style={{
                      paintOrder: "stroke",
                      stroke: "#0d1117",
                      strokeWidth: 3,
                    }}
                  >
                    {e.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {Array.from(nodes.values()).map((node) => {
            const p = positioned.get(node.id);
            if (!p) return null;
            const cx = p.x + p.w / 2;
            const cy = p.y + p.h / 2;
            const label = node.label || node.id;
            const commonStroke =
              node.shape === "diamond" ? "#93c5fd" : "#5eead4";
            return (
              <g key={node.id}>
                {node.shape === "diamond" ? (
                  <polygon
                    points={`${cx},${p.y} ${p.x + p.w},${cy} ${cx},${p.y + p.h} ${p.x},${cy}`}
                    fill="#111827"
                    stroke={commonStroke}
                    strokeWidth="2"
                  />
                ) : node.shape === "circle" ? (
                  <ellipse
                    cx={cx}
                    cy={cy}
                    rx={Math.max(48, p.w / 2)}
                    ry={p.h / 2}
                    fill="#111827"
                    stroke={commonStroke}
                    strokeWidth="2"
                  />
                ) : node.shape === "subroutine" ? (
                  <>
                    <rect
                      x={p.x}
                      y={p.y}
                      width={p.w}
                      height={p.h}
                      rx="14"
                      fill="#111827"
                      stroke={commonStroke}
                      strokeWidth="2"
                    />
                    <line
                      x1={p.x + 10}
                      y1={p.y}
                      x2={p.x + 10}
                      y2={p.y + p.h}
                      stroke={commonStroke}
                      strokeWidth="1.4"
                    />
                    <line
                      x1={p.x + p.w - 10}
                      y1={p.y}
                      x2={p.x + p.w - 10}
                      y2={p.y + p.h}
                      stroke={commonStroke}
                      strokeWidth="1.4"
                    />
                  </>
                ) : (
                  <rect
                    x={p.x}
                    y={p.y}
                    width={p.w}
                    height={p.h}
                    rx="14"
                    fill="#111827"
                    stroke={commonStroke}
                    strokeWidth="2"
                  />
                )}
                <text
                  x={cx}
                  y={cy + 5}
                  textAnchor="middle"
                  fontSize={fontSize}
                  fill="#e5e7eb"
                  fontWeight="600"
                >
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
function Blocks({ text }) {
  const blocks = parseBlocks(text);
  if (!blocks.length)
    return (
      <div className="typing">
        <span />
        <span />
        <span />
      </div>
    );
  return blocks.map((b, i) =>
    b.type === "code" ? (
      b.lang && /^(mermaid|mmd)$/i.test(b.lang) ? (
        <MermaidBlock key={i} code={b.code} />
      ) : (
        <CodeBlock
          key={i}
          lang={b.lang}
          code={b.code}
        />
      )
    ) : b.type === "think" ? null : (
      <p key={i} dangerouslySetInnerHTML={{ __html: b.html }} />
    ),
  );
}
function Verdict({ run }) {
  if (!run) return null;
  const q = run.quality;
  const tier = !q
    ? ""
    : q.score >= 85
      ? "q-hi"
      : q.score >= 60
        ? "q-mid"
        : "q-lo";
  return (
    <div className="verdict-wrap">
      {q && (
        <div className={"quality " + tier}>
          <span className="q-score">kualitas {q.score}/100</span>
          {q.hasTest ? <span className="q-tag"> ada self-test</span> : null}
          {q.notes && q.notes.length > 0 && (
            <ul className="q-notes">
              {q.notes.map((n, i) => (
                <li key={i} className={"q-" + n.sev}>
                  {n.msg}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
function Message({ msg }) {
  if (msg.role === "user")
    return (
      <div className="msg user">
        <span className="msg-role">You</span>
        <div className="bubble-user">{msg.text}</div>
      </div>
    );
  if (msg.role === "agent")
    return (
      <div className="msg model">
        <span className="msg-role">Agent</span>
        <AgentSteps run={msg.agent || {}} />
      </div>
    );
  return (
    <div className="msg model">
      <span className="msg-role">WOLFSPACE</span>
      <div className="bubble-model">
        {msg.text ? (
          <Blocks text={msg.text} />
        ) : (
          <div className="typing">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
      <Verdict run={msg.run} />
    </div>
  );
}

/* ----------------------------- Composer ----------------------------- */
// Line icons for the composer "+" menu (match the reference design).
const svg = (p) => (
  <svg
    viewBox="0 0 24 24"
    width="19"
    height="19"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {p}
  </svg>
);
const MI = {
  plus: svg(
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>,
  ),
  upload: svg(
    <>
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
    </>,
  ),
  research: svg(
    <>
      <path d="M22 10L12 5 2 10l10 5 10-5z" />
      <path d="M6 12v4c0 1.1 2.7 3 6 3s6-1.9 6-3v-4" />
    </>,
  ),
  image: svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 16l-5-5L5 20" />
    </>,
  ),
  video: svg(
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M10 9l5 3-5 3V9z" />
    </>,
  ),
  slides: svg(
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M12 16v4" />
      <path d="M8 20h8" />
    </>,
  ),
  more: svg(
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>,
  ),
};

// Deteksi file 3D (GLB/GLTF/STL) dari nama/path.
const is3DFile = (nameOrPath) => /\.(glb|gltf|stl)$/i.test(nameOrPath || "");

/* Model3DViewer dipindah ke public/app/Model3DViewer.jsx (dimuat via APP_MODULES di index.html). */

function LightboxModal({ item, onClose }) {
  if (!item) return null;
  const is3D = is3DFile(item.name || item.path || "");
  const isImg = !is3D && (/\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i.test(item.name || item.path || "") || (item.type && item.type.startsWith("image/")) || (item.url && /\.(png|jpe?g|webp|gif|svg|bmp|ico)(?:\?.*)?$/i.test(item.url)) || (!item.snippet && !/\.(mp4|webm|mov|mkv)$/i.test(item.name || item.path || "")));
  const isVid = /\.(mp4|webm|mov|mkv)$/i.test(item.name || item.path || "") || (item.type && item.type.startsWith("video/"));
  const displayUrl = item.previewUrl || item.url;

  return (
    <div
      className="attachment-modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.85)",
        zIndex: 999999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        backdropFilter: "blur(6px)",
        animation: "fadeIn 0.2s ease"
      }}
    >
      <div
        className="attachment-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          maxWidth: "92vw",
          maxHeight: "92vh",
          background: "var(--surface-2, #161b22)",
          border: "1px solid var(--line-strong, #30363d)",
          borderRadius: "12px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid var(--line-strong, #30363d)",
            background: "var(--surface-3, #21262d)"
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--text, #e5e5e5)", fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>
            {is3D ? "🧊" : "📄"} {item.name || item.path || "Preview"}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted, #858585)",
              fontSize: "22px",
              cursor: "pointer",
              padding: "0 6px",
              lineHeight: 1
            }}
            title="Tutup"
          >
            ×
          </button>
        </div>
        <div style={{ padding: "16px", overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", maxHeight: "calc(92vh - 55px)", minWidth: "300px", minHeight: "200px" }}>
          {is3D && displayUrl ? (
            <Model3DViewer url={displayUrl} name={item.name || item.path} />
          ) : isImg && displayUrl ? (
            <img
              src={displayUrl}
              alt={item.name || item.path}
              style={{ maxWidth: "100%", maxHeight: "calc(85vh - 80px)", objectFit: "contain", borderRadius: "6px" }}
            />
          ) : isVid && displayUrl ? (
            <video
              src={displayUrl}
              controls
              autoPlay
              style={{ maxWidth: "100%", maxHeight: "calc(85vh - 80px)", borderRadius: "6px" }}
            />
          ) : item.snippet ? (
            <pre style={{ margin: 0, fontFamily: '"JetBrains Mono", Consolas, Courier New, monospace', fontSize: "13px", color: "#4ec9b0", whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#0d1117", padding: "16px", borderRadius: "8px", width: "100%", maxHeight: "calc(82vh - 80px)", overflow: "auto" }}>
              {item.snippet}
            </pre>
          ) : (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted, #858585)" }}>
              <div style={{ fontSize: "56px", marginBottom: "16px" }}>📄</div>
              <div style={{ fontSize: "15px", color: "var(--text, #e5e5e5)" }}>{item.name || item.path}</div>
              {item.size && <div style={{ fontSize: "12px", marginTop: "8px" }}>({Math.round(item.size / 1024)} KB)</div>}
              {displayUrl && (
                <div style={{ marginTop: "16px" }}>
                  <a href={displayUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand, #61afef)", textDecoration: "underline" }}>
                    Buka / Unduh File
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Composer({ onSend, onCancel, busy, onAgentCli, models = [], modelVal, setModelVal }) {
  const [val, setVal] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [menu, setMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showMcpMenu, setShowMcpMenu] = useState(false);
  const [mcpServers, setMcpServers] = useState([
    { id: 'github', name: 'GitHub & Git Tools', desc: 'Access repositories, issues, pull requests, and code diffs', active: true }
  ]);
  const [showMcpInput, setShowMcpInput] = useState(false);
  const [mcpInputUrl, setMcpInputUrl] = useState('');
  const [mcpInputToken, setMcpInputToken] = useState('');
  const [mcpInputName, setMcpInputName] = useState('');
  const [mcpInputError, setMcpInputError] = useState('');
  const [mcpInputSuccess, setMcpInputSuccess] = useState('');

  const handleMcpCodeConnect = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const url = mcpInputUrl.trim();
    const token = mcpInputToken.trim();
    const name = mcpInputName.trim();
    if (!url) { setMcpInputError('URL server MCP wajib diisi.'); return; }
    let urlParsed;
    try { urlParsed = new URL(url); } catch { setMcpInputError('URL tidak valid.'); return; }
    setMcpInputError('');
    setMcpInputSuccess('');
    const serverName = name || urlParsed.hostname;
    const entry = {
      id: serverName.replace(/[^a-z0-9]/gi, '_') + '_' + Date.now(),
      name: serverName,
      desc: url,
      url,
      token: token || undefined,
      active: true,
    };
    setMcpServers(prev => [...prev, entry]);
    setMcpInputSuccess('✓ Server MCP berhasil ditambahkan!');
    setMcpInputUrl('');
    setMcpInputToken('');
    setMcpInputName('');
    setTimeout(() => { setMcpInputSuccess(''); setShowMcpInput(false); }, 2000);
  };
  const [effort, setEffort] = useState(() => {
    try {
      const cl = getCloud();
      if (cl && typeof cl.effort !== "undefined") return Number(cl.effort);
      return parseInt(localStorage.getItem("quantum_effort") || "1", 10) || 0;
    } catch { return 1; }
  });
  useEffect(() => {
    try {
      localStorage.setItem("quantum_effort", String(effort));
      const cl = getCloud();
      if (cl) {
        cl.effort = effort;
        setCloudLS(cl);
      }
    } catch (_) {}
  }, [effort]);
  const [switchFlagged, setSwitchFlagged] = useState(false);
  const [soon, setSoon] = useState("");
  const ref = useRef(null);
  const wrapRef = useRef(null);
  
  useEffect(() => {
    if (!menu) {
      setShowModelMenu(false);
      setShowMcpMenu(false);
    }
  }, [menu]);
  
  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  };

  console.log("[Composer] render, busy:", busy, "val:", val);

  const handleAttachmentSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const target = e.target;
    for (const file of files) {
      const relPath = file.webkitRelativePath || file.name;
      const attId = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      const isImg = /\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i.test(file.name) || (file.type && file.type.startsWith("image/"));
      const isVid = /\.(mp4|webm|mov|mkv)$/i.test(file.name) || (file.type && file.type.startsWith("video/"));
      const is3D = is3DFile(file.name);
      // File 3D butuh blob URL agar Model3DViewer bisa memuatnya (three.js loader
      // menerima URL, bukan File). Sama seperti img/vid — object URL lokal.
      let previewUrl = (isImg || isVid || is3D) ? URL.createObjectURL(file) : null;
      let snippet = null;
      if (!isImg && !isVid && file.size < 100 * 1024 && /\.(js|py|jsx|ts|tsx|html|css|json|md|txt|sql|java|c|cpp|h|rust|go|sh|yml|yaml)$/i.test(file.name)) {
        try {
          snippet = await file.slice(0, 300).text();
        } catch (_) {}
      }
      setAttachments((prev) => [
        ...prev,
        { id: attId, name: file.name, path: relPath, size: file.size, type: file.type, previewUrl, snippet, status: "uploading" },
      ]);
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 = reader.result.split(',')[1] || reader.result;
            const payload = { name: relPath, data: base64 };
            let uploadedUrl = "";
            if (IPC && IPC.invoke) {
              const res = await IPC.invoke("api", { method: "POST", path: "/upload", body: payload });
              let parsed;
              try { parsed = typeof res.body === 'string' ? JSON.parse(res.body) : res; } catch (_) { parsed = res; }
              if (res.status >= 400 || parsed.error) throw new Error(parsed.error || "Upload failed");
              uploadedUrl = parsed.url || ("/uploads/" + parsed.name);
            } else {
              const r = await fetch("/upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              const res = await r.json();
              if (res.error) throw new Error(res.error);
              uploadedUrl = res.url || ("/uploads/" + res.name);
            }
            setAttachments((prev) =>
              prev.map((a) => (a.id === attId ? { ...a, status: "ready", url: uploadedUrl, previewUrl: a.previewUrl || (isImg ? uploadedUrl : null) } : a))
            );
          } catch (err) {
            console.error("[Attachment upload error]", err);
            setAttachments((prev) =>
              prev.map((a) => (a.id === attId ? { ...a, status: "error", error: err.message } : a))
            );
          }
        };
        reader.onerror = () => {
          setAttachments((prev) =>
            prev.map((a) => (a.id === attId ? { ...a, status: "error", error: "Failed reading file" } : a))
          );
        };
        reader.readAsDataURL(file);
      } catch (err) {
        setAttachments((prev) =>
          prev.map((a) => (a.id === attId ? { ...a, status: "error", error: err.message } : a))
        );
      }
    }
    target.value = "";
  };

  const submit = () => {
    const v = val.trim();
    console.log("[Composer submit] busy:", busy, "v:", v, "attachments:", attachments.length);
    if ((!v && attachments.length === 0) || busy) return;
    let fullText = v;
    if (attachments.length > 0) {
      const attSummary = attachments
        .map((a) => `- [Attached]: ${a.path} (${Math.round(a.size / 1024)} KB${a.url ? `, url: ${a.url}` : ""})`)
        .join("\n");
      fullText = v ? `${v}\n\nAttachments:\n${attSummary}` : `Attachments:\n${attSummary}`;
    }
    console.log("[Composer submit] calling onSend with:", fullText);
    onSend(fullText);
    console.log("[Composer submit] setting val to empty string and resetting attachments");
    setVal("");
    setAttachments([]);
    requestAnimationFrame(() => {
      if (ref.current) ref.current.style.height = "auto";
    });
  };

  // Debug val changes
  useEffect(() => {
    console.log("[Composer] val changed to:", val);
  }, [val]);
  useEffect(() => {
    const h = (e) => {
      const next = String(e.detail || "");
      setVal(next);
      requestAnimationFrame(() => {
        grow();
        ref.current?.focus();
      });
    };
    window.addEventListener("WOLFSPACE:set-composer", h);
    return () => window.removeEventListener("WOLFSPACE:set-composer", h);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const h = (e) => {
      // Keep menu open when clicking sidebar controls (e.g. Visual Picker button)
      // or when the visual picker overlay is active, so the user can select
      // elements inside the + menu with the picker.
      const inSidebar = e.target.closest && e.target.closest('.sidebar');
      if (inSidebar) return;
      if (document.body.classList.contains('vp-on')) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target))
        setMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menu]);
  const notYet = (name) => {
    setMenu(false);
    setSoon(name + " segera hadir.");
    setTimeout(() => setSoon(""), 2600);
  };
  return (
    <div className="composer-wrap">
      <div className="composer">
        <input
          type="file"
          id="file-upload-input"
          multiple
          style={{ display: "none" }}
          onChange={handleAttachmentSelect}
        />
        <input
          type="file"
          id="folder-upload-input"
          webkitdirectory="true"
          directory="true"
          multiple
          style={{ display: "none" }}
          onChange={handleAttachmentSelect}
        />
        <div className="composer-input-col">
          {attachments.length > 0 && (
            <div className="composer-attachments">
              {attachments.map((att) => {
                const isImg = /\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i.test(att.name || att.path) || (att.type && att.type.startsWith("image/"));
                const isVid = /\.(mp4|webm|mov|mkv)$/i.test(att.name || att.path) || (att.type && att.type.startsWith("video/"));
                const isCode = att.snippet || /\.(js|py|jsx|ts|tsx|html|css|json|md|txt|sql|java|c|cpp|h|rust|go|sh|yml|yaml)$/i.test(att.name || att.path);
                const displayUrl = att.previewUrl || att.url;

                return (
                  <div
                    key={att.id}
                    className="composer-attachment-item"
                    title={att.path + " (Klik untuk melihat)"}
                    onClick={() => {
                      if (att.previewUrl || att.url || att.snippet) {
                        setPreviewAttachment(att);
                      }
                    }}
                    style={{
                      width: "60px",
                      height: "60px",
                      padding: (isImg && displayUrl) ? "0" : "6px",
                      overflow: "hidden",
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      background: "var(--surface-2, #161b22)",
                      border: "1px solid var(--line-strong, #30363d)",
                      borderRadius: "8px",
                      cursor: (att.previewUrl || att.url || att.snippet) ? "pointer" : "default"
                    }}
                  >
                    {isImg && displayUrl ? (
                      <img
                        src={displayUrl}
                        alt={att.name || att.path}
                        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }}
                      />
                    ) : isVid && displayUrl ? (
                      <video
                        src={displayUrl}
                        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }}
                        muted
                      />
                    ) : att.snippet ? (
                      <div style={{ width: "100%", height: "100%", padding: "4px", fontSize: "6.5px", fontFamily: "monospace", color: "#4ec9b0", overflow: "hidden", lineHeight: "1.25", wordBreak: "break-all", background: "#0d1117", borderRadius: "6px", textAlign: "left" }}>
                        {att.snippet}
                      </div>
                    ) : (
                      <>
                        <div className="composer-attachment-icon">
                          {att.status === "uploading" ? "⏳" : att.status === "error" ? "⚠️" : is3DFile(att.name || att.path) ? "🧊" : isCode ? "💻" : "📄"}
                        </div>
                        <div className="composer-attachment-name" style={{ fontSize: "9px", width: "100%", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {att.name || att.path}
                        </div>
                      </>
                    )}

                    {att.status === "uploading" && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "8px", fontSize: "14px" }}>
                        ⏳
                      </div>
                    )}
                    {att.status === "error" && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(248,113,113,0.3)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "8px", fontSize: "14px" }} title={att.error}>
                        ⚠️
                      </div>
                    )}

                    <button
                      type="button"
                      className="composer-attachment-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAttachments((p) => p.filter((x) => x.id !== att.id));
                      }}
                      title={att.status === "error" ? att.error : "Remove"}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <textarea
            ref={ref}
            rows={1}
            value={val}
            placeholder={
              busy
                ? "Lanjutkan percakapan..."
                : val.includes("/")
                  ? "Terus ketik perintah..."
                  : "Apa yang ingin kamu buat hari ini?"
            }
            onChange={(e) => {
              console.log("[Textarea] value changed:", e.target.value);
              setVal(e.target.value);
              grow();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                console.log("[Textarea] Enter pressed, calling submit");
                submit();
              }
              if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                setVal("");
                requestAnimationFrame(() => {
                  if (ref.current) ref.current.style.height = "auto";
                });
              }
              if (e.key === "/" && val === "") {
                console.log("[Textarea] / pressed, trigger command mode");
              }
            }}
            onFocus={() => console.log("[Textarea] focused")}
            onBlur={() => console.log("[Textarea] blurred")}
          />
        </div>
        <div className="picker-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="composer-add-wrap" ref={wrapRef}>
            <div className="composer-action-btns">
              <button
                className={"composer-add" + (menu ? " open" : "")}
                title="Tambah"
                onClick={() => { setMenu((m) => !m); setShowModelMenu(false); setShowMcpMenu(false); }}
              >
                {MI.plus}
              </button>
            </div>
            {menu && (
              <div className="am-menu" onMouseDown={(e) => e.stopPropagation()}>
                
                <div className="am-section-label">Context</div>
                <button className="am-item" onClick={() => { setMenu(false); document.getElementById("file-upload-input")?.click(); }}>
                  <span>Attach file...</span>
                </button>

                <div className="am-section-label" style={{ marginTop: '8px' }}>Model</div>
                <div style={{ position: 'relative' }}>
                  <button 
                    className={"am-item" + (showModelMenu ? " active" : "")} 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMcpMenu(false);
                      setShowModelMenu(!showModelMenu);
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Switch model...
                    </span>
                    <span className="am-item-right">{models.find(m => m.value === modelVal)?.label || "Sonnet"}</span>
                  </button>
                  {showModelMenu && (
                    <div className="am-submenu">
                      <div className="am-section-label" style={{ marginBottom: '4px' }}>Select a model</div>
                      {models.map(m => (
                        <button 
                          key={m.value}
                          className="am-item" 
                          style={{ padding: '8px 12px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (setModelVal) setModelVal(m.value);
                            setShowModelMenu(false);
                            // Keep main + menu open so user can continue configuring other options
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                            <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                              {m.label} 
                              {m.value === modelVal && <span>✓</span>}
                            </span>
                            <span className="am-item-desc">Efficient for routine tasks</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button className="am-item" onClick={(e) => { e.stopPropagation(); setEffort((effort + 1) % 3); }}>
                  <span>Effort ({effort === 0 ? "Low" : effort === 1 ? "Medium" : "High"})</span>
                  <span className="am-item-right">
                    <div className="am-slider">
                      <div className={"am-slider-dot" + (effort >= 0 ? " active" : "")}></div>
                      <div className={"am-slider-dot" + (effort >= 1 ? " active" : "")}></div>
                      <div className={"am-slider-dot" + (effort >= 2 ? " active" : "")}></div>
                    </div>
                  </span>
                </button>

                <div className="am-section-label" style={{ marginTop: '8px' }}>Connection</div>
                <div style={{ position: 'relative' }}>
                  <button 
                    className={"am-item" + (showMcpMenu ? " active" : "")} 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowModelMenu(false);
                      setShowMcpMenu(!showMcpMenu);
                    }}
                  >
                    <span>MCP</span>
                    <span className="am-item-right">
                      <span>Manage servers</span>
                      <span style={{ fontSize: '10px' }}>▶</span>
                    </span>
                  </button>
                  {showMcpMenu && (
                    <div className="am-submenu">
                      <div className="am-section-label" style={{ marginBottom: '4px' }}>Select an MCP connection</div>
                      {mcpServers.map(srv => (
                        <div key={srv.id} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <button 
                            className="am-item" 
                            style={{ padding: '8px 12px', flex: 1 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMcpServers(prev => prev.map(item => item.id === srv.id ? { ...item, active: !item.active } : item));
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 500, color: '#fff' }}>{srv.name}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {srv.active ? (
                                    <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 6px', borderRadius: '10px', color: '#4ec9b0', background: 'rgba(78, 201, 176, 0.12)' }}>✓ Connected</span>
                                  ) : (
                                    <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 6px', borderRadius: '10px', color: '#858585', background: 'rgba(133, 133, 133, 0.12)' }}>○ Disabled</span>
                                  )}
                                  <span
                                    title="Hapus server MCP"
                                    style={{ cursor: 'pointer', padding: '2px 4px', borderRadius: '4px', color: '#858585', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMcpServers(prev => prev.filter(item => item.id !== srv.id));
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = '#f85149'; e.currentTarget.style.background = 'rgba(248,81,73,0.15)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = '#858585'; e.currentTarget.style.background = 'transparent'; }}
                                  >×</span>
                                </span>
                              </span>
                              <span className="am-item-desc">{srv.desc}</span>
                            </div>
                          </button>
                        </div>
                      ))}
                      <div style={{ borderTop: '1px solid #3e3e42', marginTop: '4px' }}>
                        {!showMcpInput ? (
                          <div
                            style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            onClick={(e) => { e.stopPropagation(); setShowMcpInput(true); setMcpInputError(''); setMcpInputSuccess(''); }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b594f5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="5" x2="12" y2="19"></line>
                              <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            <span style={{ fontSize: '11px', color: '#b594f5', fontWeight: 500 }}>Hubungkan MCP server...</span>
                          </div>
                        ) : (
                          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '7px' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ fontSize: '11px', color: '#8b98a9', fontWeight: 600, marginBottom: '2px' }}>Sambungkan ke MCP Server</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              <input
                                autoFocus
                                type="text"
                                value={mcpInputUrl}
                                onChange={(e) => { setMcpInputUrl(e.target.value); setMcpInputError(''); setMcpInputSuccess(''); }}
                                onKeyDown={(e) => { if (e.key === 'Escape') { setShowMcpInput(false); setMcpInputUrl(''); setMcpInputToken(''); setMcpInputName(''); setMcpInputError(''); } }}
                                placeholder="URL server MCP (contoh: https://mcp.example.com/sse)"
                                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: mcpInputError && !mcpInputUrl.trim() ? '1px solid rgba(248,81,73,0.5)' : '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#e2e8f0', fontSize: '11px', fontFamily: 'inherit', padding: '6px 9px', outline: 'none', boxSizing: 'border-box' }}
                              />
                              <input
                                type="password"
                                value={mcpInputToken}
                                onChange={(e) => { setMcpInputToken(e.target.value); setMcpInputError(''); setMcpInputSuccess(''); }}
                                onKeyDown={(e) => { if (e.key === 'Escape') { setShowMcpInput(false); setMcpInputUrl(''); setMcpInputToken(''); setMcpInputName(''); setMcpInputError(''); } }}
                                placeholder="Token / API Key (opsional)"
                                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#e2e8f0', fontSize: '11px', fontFamily: 'inherit', padding: '6px 9px', outline: 'none', boxSizing: 'border-box' }}
                              />
                              <input
                                type="text"
                                value={mcpInputName}
                                onChange={(e) => { setMcpInputName(e.target.value); setMcpInputError(''); setMcpInputSuccess(''); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleMcpCodeConnect(e); } if (e.key === 'Escape') { setShowMcpInput(false); setMcpInputUrl(''); setMcpInputToken(''); setMcpInputName(''); setMcpInputError(''); } }}
                                placeholder="Nama server (opsional)"
                                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#e2e8f0', fontSize: '11px', fontFamily: 'inherit', padding: '6px 9px', outline: 'none', boxSizing: 'border-box' }}
                              />
                            </div>
                            {mcpInputError && (
                              <div style={{ fontSize: '10.5px', color: '#f85149', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                {mcpInputError}
                              </div>
                            )}
                            {mcpInputSuccess && (
                              <div style={{ fontSize: '10.5px', color: '#4ec9b0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                {mcpInputSuccess}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowMcpInput(false); setMcpInputUrl(''); setMcpInputToken(''); setMcpInputName(''); setMcpInputError(''); setMcpInputSuccess(''); }}
                                style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#8b98a9', cursor: 'pointer', fontFamily: 'inherit' }}
                              >Batal</button>
                              <button
                                onClick={handleMcpCodeConnect}
                                style={{ padding: '4px 12px', fontSize: '11px', borderRadius: '5px', border: 'none', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                              >Hubungkan</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
          <button
            className={"send-btn" + (busy ? " cancel" : "")}
            onClick={busy ? onCancel : submit}
            disabled={!busy && !val.trim() && attachments.length === 0}
            onClickCapture={(e) => {
              console.log(
                "[Send button] clicked, busy:",
                busy,
                "disabled:",
                !busy && !val.trim() && attachments.length === 0,
              );
            }}
          >
            {busy ? (
              <Icon.square />
            ) : (
              <Icon.send />
            )}
          </button>
        </div>
      </div>
      <div className="composer-hint">
        {soon ? (
          <b style={{ color: "var(--brand)" }}>{soon}</b>
        ) : (
          <>
            <span>Tekan <kbd>Shift+Enter</kbd> untuk baris baru</span>
            <span>•</span>
            <span>Tekan <kbd>Ctrl+K</kbd> untuk bersihkan</span>
            <span>•</span>
            <span>Ketik <kbd>/</kbd> untuk perintah</span>
          </>
        )}
      </div>
      <LightboxModal item={previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </div>
  );
}

/* Visual Picker & Visual Draw dipindah ke public/app/VisualTools.jsx (APP_MODULES). */

/* Model Hub view dipindah ke public/app/ModelHub.jsx (APP_MODULES). */
