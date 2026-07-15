const { useState, useRef, useEffect, useCallback, useMemo } = React;

// Command Palette (forked from VS Code) - daftar command yang tersedia
const COMMANDS = [
  { id: 'open.agents', label: 'Agent Runner: Buka Agent Runner', icon: 'runner', action: () => document.querySelector('[data-view="agents"]')?.click() },
  { id: 'open.settings', label: 'Settings: Buka Pengaturan', icon: 'settings', action: () => document.querySelector('[data-view="settings"]')?.click() },
  { id: 'terminal.new', label: 'Terminal: Buat Terminal Baru', icon: 'terminal', action: () => window.createNewTerminal?.() },
  { id: 'openclaw.chat', label: 'OpenClaw: Jalankan dari Chat', icon: 'runner', action: () => window.dispatchEvent(new CustomEvent('WOLFSPACE:set-composer', { detail: '/openclaw ' })) },
  { id: 'agent.run', label: 'Agent: Mulai agent baru', icon: 'play', action: () => window.startNewAgent?.() },
  { id: 'theme.toggle', label: 'Appearance: Toggle Tema Gelap/Terang', icon: 'theme', action: () => document.body.classList.toggle('light-theme') },
];

/* ----------------------------- Icons ----------------------------- */
const Icon = {
  spark: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M12 2.5l1.9 5.1 5.1 1.9-5.1 1.9L12 16.5l-1.9-5.1L5 9.5l5.1-1.9L12 2.5z"
        fill="currentColor"
      />
      <path
        d="M18.5 14.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  ),
  caret: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  chev: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  reset: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M3 12a9 9 0 109-9 9 9 0 00-7 3.3M3 4v3.3h3.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  copy: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect
        x="9"
        y="9"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5 15V5a2 2 0 012-2h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  check: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  send: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M4 12l16-8-5 16-3.5-6L4 12z" fill="currentColor" />
    </svg>
  ),
  target: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
    </svg>
  ),
  arrow: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  play: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M7 5l12 7-12 7V5z" fill="currentColor" />
    </svg>
  ),
  pencil: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M14.5 5.5l4 4M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  loader: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M12 3a9 9 0 109 9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  square: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect
        x="5"
        y="5"
        width="14"
        height="14"
        rx="2"
        fill="currentColor"
      />
    </svg>
  ),
  terminal: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M9 10l3 3-3 3M15 16h2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  sun: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  moon: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  ),
};
const HubIcon = {
  back: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  search: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle
        cx="10.5"
        cy="10.5"
        r="6.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M15.5 15.5L20 20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  download: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M12 3v12m0 0l-4-4m4 4l4-4M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  check: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  loader: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M12 3a9 9 0 109 9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  star: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M12 2l2.9 6.3L22 9.2l-5 4.6 1.3 6.9L12 17.5l-6.3 3.2L7 13.8 2 9.2l7.1-.9L12 2z"
        fill="currentColor"
      />
    </svg>
  ),
  dl: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M12 5v10m0 0l-3-3m3 3l3-3M6 17h12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  hf: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="8" cy="7" r="3" fill="currentColor" />
      <circle cx="16" cy="7" r="3" fill="currentColor" />
      <path
        d="M6 11c-1 0-1.5 2-1.5 4 0 3 2 6 7.5 6s7.5-3 7.5-6c0-2-.5-4-1.5-4M8 14v3M12 14v3M16 14v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  ),
  ollama: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3-8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-6 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-2.7 0-5.8 1.29-6 2v2h12v-2c-.2-.71-3.3-2-6-2z" />
    </svg>
  ),
  empty: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="3"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8 12h8M10 15h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
};
function BrandMark({ className }) {
  return (
    <span className={"brand-mark " + (className || "")}>
      <Icon.spark style={{ color: "#fff" }} />
    </span>
  );
}

/* ----------------------------- Backend glue ----------------------------- */
const PREFIXES = [
  ["github_pat_", "github", "GitHub Models"],
  ["ghp_", "github", "GitHub Models"],
  ["sk-ant-", "anthropic", "Claude"],
  ["sk-or-", "openrouter", "OpenRouter"],
  ["gsk_", "groq", "Groq"],
  ["AIza", "gemini", "Gemini"],
  ["nvapi-", "nvidia", "NVIDIA"],
  ["sk-UUa", "opencode", "OpenCode"],
  ["sk-", "openai", "OpenAI"],
];
const CLOUD_DEFAULT = {
  anthropic: "claude",
  openai: "gpt-4o",
  openrouter: "anthropic/claude-opus-4-8",
  groq: "llama",
  qwen: "qwen",
  deepseek: "chat",
  github: "gpt-4o",
  gemini: "gemini-2.0-flash",
  nvidia: "nvidia/nemotron-3-super-120b-a12b",
  opencode: "deepseek-v4-flash",
  puter: "claude-sonnet-4",
  cloudflare: "@cf/meta/llama-3.1-8b-instruct",
  custom: "gpt-4o",
};
const PROVIDER_LABELS = {
  openai: "OpenAI",
  qwen: "Qwen",
  groq: "Groq",
  openrouter: "OpenRouter",
  anthropic: "Claude",
  deepseek: "DeepSeek",
  github: "GitHub Models",
  gemini: "Gemini",
  nvidia: "NVIDIA",
  opencode: "OpenCode",
  puter: "Puter",
  cloudflare: "Cloudflare Worker",
  custom: "Custom",
};
const PROVIDER_OPTS = [
  "auto",
  "openai",
  "qwen",
  "deepseek",
  "github",
  "groq",
  "openrouter",
  "anthropic",
  "gemini",
  "nvidia",
  "opencode",
  "puter",
  "cloudflare",
  "custom",
];
function detectPrefix(key) {
  key = (key || "").trim();
  for (const [p, prov, name] of PREFIXES)
    if (key.startsWith(p)) return { provider: prov, name };
  return key ? { provider: "openai", name: "OpenAI" } : null;
}
function keyish(s) {
  return /^(sk-|gsk_|AIza|github_pat_|ghp_)/.test((s || "").trim());
}
function getCloud() {
  try {
    return JSON.parse(localStorage.getItem("quantum_cloud") || "null");
  } catch (e) {
    return null;
  }
}
function setCloudLS(c) {
  if (c) localStorage.setItem("quantum_cloud", JSON.stringify(c));
  else localStorage.removeItem("quantum_cloud");
}
function escHtml(s) {
  return s.replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
  );
}
function mdToHtml(s) {
  let h = escHtml(s);
  h = h.replace(/`([^`\n]+)`/g, '<span class="inline-code">$1</span>');
  h = h.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  return h.replace(/\n/g, "<br/>");
}
function parseBlocks(text) {
  // Pre-processing: Jika model hanya memberikan tag penutup tapi lupa tag pembuka
  if ((text.includes("</think>") || text.includes("</thought>")) && 
      !text.includes("<think>") && !text.includes("<thought>")) {
    text = "<think>\n" + text;
  }

  const out = [];
  const re = /(?:```(\w*)\n?([\s\S]*?)```)|(?:<(?:think|thought)>([\s\S]*?)(?:<\/(?:think|thought)>|$))/gi;
  let last = 0,
    m;
  while ((m = re.exec(text))) {
    const pre = text.slice(last, m.index);
    if (pre.trim()) out.push({ type: "text", html: mdToHtml(pre.trim()) });
    if (m[3] !== undefined) {
      out.push({
        type: "think",
        html: mdToHtml(m[3].trim())
      });
    } else {
      out.push({
        type: "code",
        lang: m[1] || "text",
        code: (m[2] || "").replace(/\n$/, ""),
      });
    }
    last = re.lastIndex;
  }
  const tail = text.slice(last);
  const openCode = tail.indexOf("```");
  if (openCode >= 0) {
    const pre = tail.slice(0, openCode);
    if (pre.trim()) out.push({ type: "text", html: mdToHtml(pre.trim()) });
    out.push({
      type: "code",
      lang: "",
      code: tail.slice(openCode).replace(/^```\w*\n?/, ""),
    });
  } else if (tail.trim()) out.push({ type: "text", html: mdToHtml(tail.trim()) });
  return out;
}
function reqFor(modelVal, cloud, history, webdev) {
  const effortVal = cloud && typeof cloud.effort !== 'undefined' ? Number(cloud.effort) : (parseInt(localStorage.getItem("quantum_effort") || "1", 10) || 1);
  const b =
    modelVal === "cloud" && cloud
      ? { history, cloud, effort: effortVal }
      : { history, port: modelVal, effort: effortVal };
  if (webdev) {
    b.webdev = true;
    if (b.history && b.history.length) {
      const i = b.history.length - 1,
        last = b.history[i];
      if (last && last.role === "user" && !last.content.includes("```json")) {
        const R =
          "\n\n?? CRITICAL: Your ENTIRE answer must be a SINGLE ```json block containing an A2UI spec. NEVER write ```dart. Dart code is NOT rendered. Output ONLY ```json.";
        b.history = [
          ...b.history.slice(0, i),
          { ...last, content: last.content + R },
        ];
      }
    }
  }
  return b;
}
// Verify HTTP server is running (only for browser users, not Electron)
async function checkServerHealth() {
  if (IPC) return true; // Electron: uses IPC, no HTTP needed
  try {
    const r = await fetch("/", { method: "HEAD", timeout: 2000 });
    return r.ok;
  } catch {
    return false;
  }
}
// Parse an SSE stream from a fetch Response, calling onEvent(parsedJSON) per line.
async function pumpSSE(r, signal, onEvent) {
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      const mm = line.match(/^data:\s*(.*)$/);
      if (!mm) continue;
      let j;
      try {
        j = JSON.parse(mm[1]);
      } catch (e) {
        continue;
      }
      onEvent(j);
    }
  }
}
const IPC =
  typeof window !== "undefined" && window.WOLFSPACE && window.WOLFSPACE.ipc
    ? window.WOLFSPACE
    : null;

async function streamChat(reqBody, onText, signal) {
  let acc = "",
    run = null;
  const handle = (j) => {
    if (j.t === "tok") {
      acc += j.c;
      onText(acc, run);
    } else if (j.t === "retry") {
      acc = "";
      run = null;
      onText(acc, run);
    } // new fix attempt ? drop the previous failed one
    else if (j.t === "run") {
      run = j.run;
      onText(acc, run);
    } else if (j.t === "done") {
      run = j.run || run;
      onText(acc, run);
    } else if (j.t === "err") {
      acc += "\n[" + j.m + "]";
      onText(acc, run);
    }
  };
  if (IPC) {
    // Electron IPC � no HTTP
    await new Promise((resolve) => {
      const cancel = IPC.stream("chat", reqBody, handle, resolve);
      if (signal)
        signal.addEventListener("abort", () => {
          cancel();
          resolve();
        });
    });
    return { text: acc, run };
  }
  const r = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqBody),
    signal,
  });
  await pumpSSE(r, signal, handle);
  return { text: acc, run };
}
// Self-edit agent: stream the READ/GREP/EDIT/� loop (IPC, or /self-agent over HTTP).
async function streamSelfAgent(reqBody, onEvent, signal) {
  if (IPC) {
    await new Promise((resolve) => {
      const cancel = IPC.stream("self-agent", reqBody, onEvent, resolve);
      if (signal)
        signal.addEventListener("abort", () => {
          cancel();
          resolve();
        });
    });
    return;
  }
  try {
    const r = await fetch("/self-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
      signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
    await pumpSSE(r, signal, onEvent);
  } catch (e) {
    if (e instanceof TypeError && e.message.includes("Failed to fetch")) {
      throw new Error(
        'Tidak bisa terhubung ke server self-agent.\n\nJika running di browser:\n1. Buka terminal di folder WOLFSPACE\n2. Jalankan: npm start\n3. Tunggu sampai "http://127.0.0.1:8090" muncul\n4. Refresh browser dan coba lagi\n\nAtau gunakan Electron: npm run app',
      );
    }
    throw e;
  }
}

async function runOpenClawChat(message, signal) {
  const r = await fetch("/api/openclaw/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal,
  });
  let data = {};
  try {
    data = await r.json();
  } catch (_) {}
  if (!r.ok || !data.ok) {
    throw new Error(data.error || `OpenClaw gagal: HTTP ${r.status}`);
  }
  return data;
}

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

function MermaidBlock({ code }) {
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
          {q.hasTest ? <span className="q-tag">� ada self-test</span> : null}
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
function Message({ msg, onOpenCanvas }) {
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
  const web = msg.text ? buildPreview(msg.text) : { has: false };
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
      {web.has && onOpenCanvas && (
        <button
          className="open-canvas-btn"
          onClick={() => onOpenCanvas(msg.text, msg.run)}
        >
          <Icon.spark style={{ width: 13, height: 13 }} /> Buka di Canvas
          (split)
        </button>
      )}
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
function Composer({ onSend, onCancel, busy, onAgentCli, models = [], modelVal, setModelVal }) {
  const [val, setVal] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [menu, setMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showMcpMenu, setShowMcpMenu] = useState(false);
  const [mcpServers, setMcpServers] = useState([
    { id: 'github', name: 'GitHub & Git Tools', desc: 'Access repositories, issues, pull requests, and code diffs', active: true },
    { id: 'filesystem', name: 'Local Filesystem & Ripgrep', desc: 'Direct workspace editing, directory analysis, and fast pattern search', active: true },
    { id: 'browser', name: 'Browser Subagent (Puppeteer)', desc: 'Web scraping, DOM inspection, screenshot capture, and UI testing', active: false },
    { id: 'database', name: 'SQL Database Inspector', desc: 'Query table schemas, execute read-only SQL, and analyze data structures', active: false }
  ]);
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

  const submit = () => {
    const v = val.trim();
    console.log("[Composer submit] busy:", busy, "v:", v);
    if (!v || busy) return;
    console.log("[Composer submit] calling onSend with:", v);
    onSend(v);
    console.log("[Composer submit] setting val to empty string");
    setVal("");
    console.log("[Composer submit] val after setVal:", val);
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
              <input type="text" className="am-search" placeholder="Filter actions..." autoFocus />
              
              <div className="am-section-label">Context</div>
              <button className="am-item" onClick={() => { setMenu(false); document.getElementById("folder-upload-input")?.click(); }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>MCP</span>
                    <span className="status-badge connected" style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', color: '#4ec9b0', background: 'rgba(78, 201, 176, 0.12)', fontWeight: 500 }}>
                      {mcpServers.filter(s => s.active).length} Active
                    </span>
                  </div>
                  <span className="am-item-right">
                    <span>Manage servers</span>
                    <span style={{ fontSize: '10px' }}>▶</span>
                  </span>
                </button>
                {showMcpMenu && (
                  <div className="am-submenu">
                    <div className="am-section-label" style={{ marginBottom: '4px' }}>Select an MCP connection</div>
                    {mcpServers.map(srv => (
                      <button 
                        key={srv.id}
                        className="am-item" 
                        style={{ padding: '8px 12px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMcpServers(prev => prev.map(item => item.id === srv.id ? { ...item, active: !item.active } : item));
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 500, color: '#fff' }}>{srv.name}</span>
                            {srv.active ? (
                              <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 6px', borderRadius: '10px', color: '#4ec9b0', background: 'rgba(78, 201, 176, 0.12)' }}>✓ Connected</span>
                            ) : (
                              <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 6px', borderRadius: '10px', color: '#858585', background: 'rgba(133, 133, 133, 0.12)' }}>○ Disabled</span>
                            )}
                          </span>
                          <span className="am-item-desc">{srv.desc}</span>
                        </div>
                      </button>
                    ))}
                    <div style={{ padding: '8px 12px', borderTop: '1px solid #3e3e42', marginTop: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#b594f5', cursor: 'pointer', fontWeight: 500 }} onClick={(e) => { e.stopPropagation(); notYet("Add custom MCP server"); }}>+ Add custom MCP server (JSON)...</span>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
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
        <button
          className={"send-btn" + (busy ? " cancel" : "")}
          onClick={busy ? onCancel : submit}
          disabled={!busy && !val.trim()}
          onClickCapture={(e) => {
            console.log(
              "[Send button] clicked, busy:",
              busy,
              "disabled:",
              !busy && !val.trim(),
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
    </div>
  );
}

/* ----------------------------- Visual Picker ----------------------------- */
// Module-level guard: only ONE picker can ever be active, so re-clicking the
// sidebar item toggles it off instead of stacking capture-listeners that would
// keep swallowing clicks (the "chat jadi tak bisa diklik" bug).
let VP_STOP = null;
function useVisualPicker() {
  return useCallback(() => {
    if (VP_STOP) {
      VP_STOP();
      return;
    } // already active ? toggle off
    let hover = null;
    const cleanHovers = () =>
      document
        .querySelectorAll(".vp-hover")
        .forEach((el) => el.classList.remove("vp-hover"));
    const move = (e) => {
      const el = e.target;
      if (hover && hover !== el) hover.classList.remove("vp-hover");
      hover = el;
      el.classList.add("vp-hover");
    };
    // real classes only (drop the picker's own vp-* runtime classes)
    const realCls = (el) =>
      typeof el.className === "string"
        ? el.className
            .trim()
            .split(/\s+/)
            .filter((c) => c && !/^vp-/.test(c))
        : [];
    const seg = (el) => {
      if (el.id) return "#" + el.id;
      let s = el.tagName.toLowerCase();
      const cls = realCls(el);
      if (cls.length) s += "." + cls.join(".");
      const p = el.parentElement; // disambiguate same-tag siblings
      if (p) {
        const same = Array.from(p.children).filter(
          (c) => c.tagName === el.tagName,
        );
        if (same.length > 1)
          s += ":nth-of-type(" + (same.indexOf(el) + 1) + ")";
      }
      return s;
    };
    // Build a selector that actually identifies the element: if it has no id/class,
    // walk up to the nearest classed/ided ancestor so "p" becomes ".composer-hint > p".
    const sel = (el) => {
      const parts = [];
      let cur = el,
        depth = 0;
      while (cur && cur.nodeType === 1 && depth < 6) {
        parts.unshift(seg(cur));
        if (cur.id || realCls(cur).length) break; // anchored ? enough to be unique
        cur = cur.parentElement;
        depth++;
      }
      return parts.join(" > ");
    };
    const click = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.target,
        selector = sel(el);
      
      let d = "";
      
      // Tambahkan struktur DOM agar agent lebih mudah mencari di source code
      let htmlSnippet = el.outerHTML || "";
      if (htmlSnippet) {
        // Potong htmlSnippet jika terlalu panjang, tapi tetap pertahankan strukturnya
        if (htmlSnippet.length > 300) {
          htmlSnippet = htmlSnippet.slice(0, 300) + "...";
        }
        d = "Struktur DOM:\n```html\n" + htmlSnippet + "\n```";
      }

      try {
        navigator.clipboard && navigator.clipboard.writeText(d);
      } catch (_) {}
      stop();
      // Gunakan alert yang rapi
      setTimeout(() => alert("Detail elemen berhasil disalin ke clipboard!\n\n" + selector), 0);
    };
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stop();
      }
    };
    function stop() {
      VP_STOP = null;
      document.body.classList.remove("vp-on");
      cleanHovers();
      document.removeEventListener("mouseover", move, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key, true);
    }
    VP_STOP = stop;
    document.body.classList.add("vp-on");
    document.addEventListener("mouseover", move, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key, true);
  }, []);
}

/* ----------------------------- Model Hub view (real HF) ----------------------------- */
const HUB_CATS = [
  { key: "all", label: "Semua", q: "gguf" },
  { key: "code", label: "Code", q: "coder gguf" },
  { key: "chat", label: "Chat", q: "instruct gguf" },
  { key: "small", label: "Kecil", q: "1b gguf" },
  { key: "qwen", label: "Qwen", q: "qwen gguf" },
  { key: "llama", label: "Llama", q: "llama gguf" },
];
function iconColorFor(s) {
  const c = ["blue", "purple", "green", "orange", "red"];
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return c[h % c.length];
}
function fmtN(n) {
  return n >= 1e6
    ? (n / 1e6).toFixed(1) + "M"
    : n >= 1e3
      ? (n / 1e3).toFixed(1) + "k"
      : "" + n;
}
function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "short",
    });
  } catch (e) {
    return "";
  }
}
// Map an Ollama model name ? its maker brand (real logo + brand color + monogram).
// Real SVGs live in /vendor/llm/<brand>.svg; if absent, the colored monogram shows.
const LLM_BRANDS = {
  meta: {
    c: "#0866FF",
    s: "8",
    re: /^(llama|codellama|llama-guard|tinyllama|meta)/,
  },
  qwen: { c: "#6E56CF", s: "Q", re: /^(qwen|qwq)/ },
  deepseek: { c: "#4D6BFE", s: "D", re: /^deepseek/ },
  google: { c: "#4285F4", s: "G", re: /^(gemma|codegemma|paligemma)/ },
  mistral: {
    c: "#FF7000",
    s: "M",
    re: /^(mistral|mixtral|codestral|mathstral|ministral|magistral|devstral)/,
  },
  microsoft: { c: "#00A4EF", s: "f", re: /^phi/ },
  openai: { c: "#10A37F", s: "O", re: /^gpt-oss/ },
  ibm: { c: "#0F62FE", s: "?", re: /^granite/ },
  cohere: { c: "#39594D", s: "C", re: /^command/ },
  huggingface: { c: "#FFB000", s: "??", re: /^(smollm|smol)/ },
  falcon: { c: "#1973E8", s: "F", re: /^falcon/ },
  vision: {
    c: "#14B8A6",
    s: "?",
    re: /^(llava|bakllava|moondream|minicpm|llama3.2-vision|llama-vision)/,
  },
  embed: {
    c: "#64748B",
    s: "�",
    re: /^(nomic|mxbai|snowflake|all-minilm|bge|paraphrase)/,
  },
  code: {
    c: "#22C55E",
    s: "</>",
    re: /^(starcoder|stable-code|codegeex|sqlcoder|wizardcoder)/,
  },
};
function ollamaBrand(name) {
  const n = (name || "").toLowerCase();
  for (const [k, v] of Object.entries(LLM_BRANDS))
    if (v.re.test(n)) return { key: k, ...v };
  return { key: "generic", c: "#7c8aa0", s: (n[0] || "?").toUpperCase() };
}
function LLMLogo({ name }) {
  const b = ollamaBrand(name);
  return (
    <>
      <img
        className="m-card-logo"
        src={"/vendor/llm/" + b.key + ".svg"}
        alt={b.key}
        loading="lazy"
        onError={(e) => {
          e.target.style.display = "none";
          e.target.nextSibling.style.display = "grid";
        }}
      />
      <span
        className="m-card-icon"
        style={{
          display: "none",
          background: b.c,
          color: "#fff",
          fontWeight: 700,
        }}
      >
        {b.s}
      </span>
    </>
  );
}
// Capability badge color
function capClass(c) {
  c = (c || "").toLowerCase();
  if (/vision/.test(c)) return "cap-vision";
  if (/tool/.test(c)) return "cap-tool";
  if (/think|reason/.test(c)) return "cap-think";
  if (/embed/.test(c)) return "cap-embed";
  return "cap-def";
}

function ModelHubView({ onBack, theme, setTheme, onUse, onChanged }) {
  const [source, setSource] = useState("hf"); // "hf" | "ollama"
  const [oll, setOll] = useState([]); // ollama results
  const [ollLoading, setOllLoading] = useState(false);
  const [oSize, setOSize] = useState({}); // chosen size tag per ollama model
  const [oBytes, setOBytes] = useState({}); // resolved download size: "name:tag" -> bytes (0=err, undefined=loading)
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [dl, setDl] = useState({});
  const [local, setLocal] = useState([]);
  const ctrls = useRef({});
  const loadLocal = useCallback(async () => {
    try {
      setLocal(await (await fetch("/models")).json());
    } catch (e) {}
  }, []);
  useEffect(() => {
    loadLocal();
  }, [loadLocal]);
  const stop = (id) => {
    const c = ctrls.current[id];
    if (c) {
      try {
        c.abort();
      } catch (e) {}
    }
    setDl((d) => ({ ...d, [id]: { state: "idle" } }));
  };
  const delModel = async (port) => {
    if (!window.confirm("Hapus model ini dari disk?")) return;
    try {
      await fetch("/model/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port }),
      });
    } catch (e) {}
    loadLocal();
    onChanged && onChanged();
  };
  const [sizes, setSizes] = useState({}); // id -> {bytes, quant}  (the q4 download size)
  const sizeReq = useRef(0);
  const resolveSizes = useCallback(async (list) => {
    const token = ++sizeReq.current;
    for (const m of list) {
      if (token !== sizeReq.current) return; // a newer search started � stop
      try {
        const files = await (
          await fetch("/hf/files?id=" + encodeURIComponent(m.id))
        ).json();
        if (Array.isArray(files) && files.length) {
          const pick =
            files.find((f) => /q4_k_m/i.test(f.path)) ||
            files.find((f) => /q4/i.test(f.path)) ||
            files.slice().sort((a, b) => a.size - b.size)[0];
          const quant = (
            (pick.path.match(/q\d[a-z0-9_]*|f16|bf16/i) || [])[0] || ""
          ).toLowerCase();
          setSizes((s) => ({ ...s, [m.id]: { bytes: pick.size, quant } }));
        } else setSizes((s) => ({ ...s, [m.id]: { bytes: 0 } }));
      } catch (e) {}
    }
  }, []);
  const doSearch = useCallback(
    async (query) => {
      setLoading(true);
      setMsg("");
      try {
        const r = await (
          await fetch("/hf/search?q=" + encodeURIComponent(query))
        ).json();
        if (r.error) throw new Error(r.error);
        setResults(r);
        setSizes({});
        resolveSizes(r);
        if (!r.length) setMsg("Belum ada model yang tersedia.");
      } catch (e) {
        setResults([]);
        setMsg("Gagal memuat model: " + e.message);
      }
      setLoading(false);
    },
    [resolveSizes],
  );
  useEffect(() => {
    const c = HUB_CATS.find((x) => x.key === cat) || HUB_CATS[0];
    doSearch(q.trim() || c.q);
  }, [cat]);
  const submit = () => {
    const c = HUB_CATS.find((x) => x.key === cat) || HUB_CATS[0];
    doSearch(q.trim() || c.q);
  };
  const download = async (id) => {
    if (
      dl[id] &&
      (dl[id].state === "downloading" || dl[id].state === "resolving")
    )
      return;
    setDl((d) => ({ ...d, [id]: { state: "resolving", progress: 0 } }));
    try {
      const files = await (
        await fetch("/hf/files?id=" + encodeURIComponent(id))
      ).json();
      if (files.error || !files.length) {
        setDl((d) => ({ ...d, [id]: { state: "idle" } }));
        setMsg(
          'Repo "' +
            id +
            '" tak punya file .gguf � coba repo berakhiran "-GGUF".',
        );
        return;
      }
      const pick =
        files.find((f) => /q4_k_m/i.test(f.path)) ||
        files.find((f) => /q4/i.test(f.path)) ||
        files.slice().sort((a, b) => a.size - b.size)[0];
      setDl((d) => ({ ...d, [id]: { state: "downloading", progress: 0 } }));
      const ctrl = new AbortController();
      ctrls.current[id] = ctrl;
      const res = await fetch("/hf/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, file: pick.path }),
        signal: ctrl.signal,
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
          if (j.t === "progress")
            setDl((d) => ({
              ...d,
              [id]: { state: "downloading", progress: j.pct },
            }));
          else if (j.t === "done") {
            setDl((d) => ({
              ...d,
              [id]: { state: "done", progress: 100, port: j.model.port },
            }));
            loadLocal();
            onChanged && onChanged();
          } else if (j.t === "err") {
            setDl((d) => ({ ...d, [id]: { state: "idle" } }));
            setMsg("Gagal unduh: " + j.m);
          }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setDl((d) => ({ ...d, [id]: { state: "idle" } }));
        setMsg("Gagal: " + e.message);
      }
    }
  };
  // Ollama: realtime library (scraped server-side). Refetch on source/query change.
  const fetchOllama = useCallback(async (query) => {
    setOllLoading(true);
    try {
      const r = await (
        await fetch("/ollama/search?q=" + encodeURIComponent(query || ""))
      ).json();
      setOll(Array.isArray(r) ? r : []);
    } catch (e) {
      setOll([]);
    }
    setOllLoading(false);
  }, []);
  useEffect(() => {
    if (source === "ollama") fetchOllama(q.trim());
  }, [source]);
  const submitO = () => fetchOllama(q.trim());
  // Resolve real download size (bytes) for a model:tag, cached. Marks loading as null.
  const oReq = useRef(0);
  const resolveSize = useCallback((name, tag) => {
    const id = name + ":" + tag;
    setOBytes((b) =>
      id in b
        ? b
        : (() => {
            fetch(
              "/ollama/size?name=" +
                encodeURIComponent(name) +
                "&tag=" +
                encodeURIComponent(tag),
            )
              .then((r) => r.json())
              .then((d) => setOBytes((b2) => ({ ...b2, [id]: d.bytes || 0 })))
              .catch(() => setOBytes((b2) => ({ ...b2, [id]: 0 })));
            return { ...b, [id]: null };
          })(),
    );
  }, []);
  // When Ollama results arrive, resolve the smallest (default) tag's size per model.
  useEffect(() => {
    if (source !== "ollama" || !oll.length) return;
    const token = ++oReq.current;
    let i = 0; // throttle: one manifest fetch at a time-ish
    const tick = () => {
      if (token !== oReq.current || i >= oll.length) return;
      const m = oll[i++];
      resolveSize(m.name, smallestTag(m.sizes));
      setTimeout(tick, 120);
    };
    tick();
  }, [oll, source]);
  // pick the smallest parameter size as the default tag (safest local download)
  const smallestTag = (sizes) => {
    if (!sizes || !sizes.length) return "latest";
    const parse = (s) => {
      const m = (s || "").match(/([\d.]+)\s*([bm])/i);
      if (!m) return 1e9;
      return parseFloat(m[1]) * (m[2].toLowerCase() === "b" ? 1 : 0.001);
    };
    return sizes.slice().sort((a, b) => parse(a) - parse(b))[0];
  };
  // Download an Ollama model's GGUF blob ? launch llama-server (SSE progress, keyed by name:tag)
  const downloadOllama = async (name, tag) => {
    const id = name + ":" + tag;
    if (dl[id] && dl[id].state === "downloading") return;
    setDl((d) => ({ ...d, [id]: { state: "downloading", progress: 0 } }));
    const ctrl = new AbortController();
    ctrls.current[id] = ctrl;
    try {
      const res = await fetch("/ollama/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, tag }),
        signal: ctrl.signal,
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
          if (j.t === "progress")
            setDl((d) => ({
              ...d,
              [id]: { state: "downloading", progress: j.pct },
            }));
          else if (j.t === "done") {
            setDl((d) => ({
              ...d,
              [id]: { state: "done", progress: 100, port: j.model.port },
            }));
            loadLocal();
            onChanged && onChanged();
          } else if (j.t === "err") {
            setDl((d) => ({ ...d, [id]: { state: "idle" } }));
            setMsg("Gagal unduh: " + j.m);
          }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setDl((d) => ({ ...d, [id]: { state: "idle" } }));
        setMsg("Gagal: " + e.message);
      }
    }
  };
  return (
    <div className="hub">
      <header className="hub-header">
        <div className="hub-title-group">
          <span className="hub-hf-mark">
            {source === "ollama" ? <HubIcon.ollama /> : <HubIcon.hf />}
          </span>
          <span className="hub-title">Model Hub</span>
        </div>
        <div className="tb-spacer" />
        <div className="hub-source">
          <button
            className={source === "hf" ? "active" : ""}
            onClick={() => setSource("hf")}
          >
            Hugging Face
          </button>
          <button
            className={source === "ollama" ? "active" : ""}
            onClick={() => setSource("ollama")}
          >
            Ollama
          </button>
        </div>
      </header>
      <div className="hub-body">
        <div className="hub-inner">
          {local.length > 0 && (
            <div className="hub-local">
              <div className="hub-local-title">
                ?? Model Terunduh ({local.length})
              </div>
              {local.map((m) => (
                <div className="hub-local-row" key={m.port}>
                  <div className="hub-local-info">
                    <b>{m.name}</b>
                    <span>
                      {m.size ? fmtSize(m.size) : ""} � port {m.port}
                    </span>
                  </div>
                  <button className="m-use-btn" onClick={() => onUse(m.port)}>
                    Gunakan
                  </button>
                  <button className="hub-del" onClick={() => delModel(m.port)}>
                    Hapus
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="hub-controls">
            <div className="hub-search">
              <HubIcon.search />
              <input
                placeholder={
                  source === "ollama"
                    ? "Cari model Ollama� (llama, qwen, deepseek, phi)"
                    : "Cari model GGUF� (llama, coder, qwen, phi)"
                }
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    source === "ollama" ? submitO() : submit();
                  }
                }}
              />
            </div>
          </div>
          {source === "hf" && (
            <div className="hub-filters">
              {HUB_CATS.map((c) => (
                <button
                  key={c.key}
                  className={"hub-filter" + (cat === c.key ? " active" : "")}
                  onClick={() => {
                    setQ("");
                    setCat(c.key);
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {source === "ollama" ? (
            ollLoading ? (
              <div className="hub-empty">
                <HubIcon.loader className="spin" />
                <div>Memuat dari Ollama�</div>
              </div>
            ) : oll.length ? (
              <div className="hub-grid">
                {oll.map((m) => (
                  <div className="m-card" key={m.name}>
                    <div className="m-card-head">
                      <LLMLogo name={m.name} />
                      <div className="m-card-info">
                        <div className="m-card-name">{m.name}</div>
                        <div className="m-card-id">
                          {ollamaBrand(m.name).key !== "generic"
                            ? ollamaBrand(m.name).key
                            : "ollama"}
                        </div>
                      </div>
                    </div>
                    <p className="m-card-desc">{m.description}</p>
                    {m.capabilities.length > 0 && (
                      <div className="m-card-tags">
                        {m.capabilities.map((c) => (
                          <span key={c} className={"m-cap " + capClass(c)}>
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                    {m.sizes.length > 0 &&
                      (() => {
                        const cur = oSize[m.name] || smallestTag(m.sizes);
                        return (
                          <div className="m-card-tags m-size-row">
                            {m.sizes.map((s) => (
                              <button
                                key={s}
                                className={"m-size" + (cur === s ? " sel" : "")}
                                onClick={() => {
                                  setOSize((o) => ({ ...o, [m.name]: s }));
                                  resolveSize(m.name, s);
                                }}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    {(() => {
                      const tag = oSize[m.name] || smallestTag(m.sizes);
                      const b = oBytes[m.name + ":" + tag];
                      return (
                        <div className="m-card-meta">
                          <span className="m-dlsize">
                            {b === undefined ? (
                              <span style={{ opacity: 0.5 }}>? �</span>
                            ) : b === null ? (
                              <span style={{ opacity: 0.5 }}>
                                ? menghitung�
                              </span>
                            ) : b > 0 ? (
                              <code>
                                ? {fmtSize(b)} � {tag}
                              </code>
                            ) : (
                              <span style={{ opacity: 0.5 }}>? ?</span>
                            )}
                          </span>
                          <span>
                            <HubIcon.dl style={{ width: 12, height: 12 }} />{" "}
                            {m.pulls}
                          </span>
                          <span>?? {m.tags}</span>
                          {m.updated && <span>? {m.updated}</span>}
                        </div>
                      );
                    })()}
                    {(() => {
                      const tag = oSize[m.name] || smallestTag(m.sizes);
                      const id = m.name + ":" + tag;
                      const d = dl[id] || {};
                      const st = d.state || "idle";
                      return (
                        <>
                          {st === "downloading" && (
                            <div className="m-progress">
                              <div className="m-progress-bar">
                                <div
                                  className="m-progress-fill"
                                  style={{ width: (d.progress || 0) + "%" }}
                                />
                              </div>
                              <div className="m-progress-info">
                                <span>Mengunduh {tag}�</span>
                                <span>{Math.round(d.progress || 0)}%</span>
                              </div>
                            </div>
                          )}
                          <div className="m-card-foot">
                            {st === "done" ? (
                              <>
                                <span className="m-done-badge">
                                  <HubIcon.check /> Terunduh
                                </span>
                                <button
                                  className="m-use-btn active"
                                  onClick={() => onUse(d.port)}
                                >
                                  Gunakan
                                </button>
                                <button
                                  className="hub-del"
                                  onClick={() => delModel(d.port)}
                                >
                                  Hapus
                                </button>
                              </>
                            ) : st === "downloading" ? (
                              <>
                                <button className="m-dl-btn" disabled>
                                  <HubIcon.loader className="spin" /> Mengunduh�
                                </button>
                                <button
                                  className="hub-del"
                                  onClick={() => stop(id)}
                                >
                                  Stop
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="m-dl-btn"
                                  onClick={() => downloadOllama(m.name, tag)}
                                >
                                  <HubIcon.download /> Download {m.name}:{tag}
                                </button>
                                <a
                                  className="hub-del"
                                  href={"https://ollama.com/library/" + m.name}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ textDecoration: "none" }}
                                >
                                  ?
                                </a>
                              </>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            ) : (
              <div className="hub-empty">
                <HubIcon.empty />
                <div>{q ? "Tidak ada model cocok." : "Memuat�"}</div>
              </div>
            )
          ) : loading ? (
            <div className="hub-empty">
              <HubIcon.loader className="spin" />
              <div>Memuat dari Hugging Face�</div>
            </div>
          ) : results.length ? (
            <div className="hub-grid">
              {results.map((m) => {
                const d = dl[m.id] || {};
                const st = d.state || "idle";
                const author = m.id.split("/")[0] || "?";
                const name = m.id.split("/").pop();
                return (
                  <div className="m-card" key={m.id}>
                    <div className="m-card-head">
                      {m.avatar ? (
                        <img
                          className="m-card-logo"
                          src={m.avatar}
                          alt={author}
                          loading="lazy"
                          onError={(e) => {
                            e.target.style.display = "none";
                            e.target.nextSibling.style.display = "grid";
                          }}
                        />
                      ) : null}
                      <div
                        className={"m-card-icon " + iconColorFor(author)}
                        style={{ display: m.avatar ? "none" : "grid" }}
                      >
                        {author[0].toUpperCase()}
                      </div>
                      <div className="m-card-info">
                        <div className="m-card-name">{name}</div>
                        <div className="m-card-id">{m.id}</div>
                      </div>
                    </div>
                    {(m.pipeline || (m.tags && m.tags.length) || m.library) && (
                      <div className="m-card-tags">
                        {m.pipeline && (
                          <span
                            className={
                              "m-tag " +
                              (/code/i.test(m.pipeline) ? "code" : "gen")
                            }
                          >
                            {m.pipeline}
                          </span>
                        )}
                        {m.library && (
                          <span className="m-tag-soft">{m.library}</span>
                        )}
                        {(m.tags || []).slice(0, 2).map((t) => (
                          <span className="m-tag-soft" key={t}>
                            {t}
                          </span>
                        ))}
                        {m.gated && (
                          <span className="m-tag-soft">?? gated</span>
                        )}
                      </div>
                    )}
                    <div className="m-card-meta">
                      <span>
                        <HubIcon.dl style={{ width: 12, height: 12 }} />{" "}
                        {fmtN(m.downloads)} unduhan
                      </span>
                      <span>
                        <HubIcon.star
                          style={{
                            width: 12,
                            height: 12,
                            color: "var(--brand)",
                          }}
                        />{" "}
                        {fmtN(m.likes)}
                      </span>
                      {m.updated && <span>? {fmtDate(m.updated)}</span>}
                      {sizes[m.id] ? (
                        <span>
                          <code>
                            {sizes[m.id].bytes
                              ? "? " +
                                fmtSize(sizes[m.id].bytes) +
                                (sizes[m.id].quant
                                  ? " � " + sizes[m.id].quant
                                  : "")
                              : "�"}
                          </code>
                        </span>
                      ) : (
                        <span style={{ opacity: 0.5 }}>? menghitung�</span>
                      )}
                    </div>
                    {st === "downloading" && (
                      <div className="m-progress">
                        <div className="m-progress-bar">
                          <div
                            className="m-progress-fill"
                            style={{ width: (d.progress || 0) + "%" }}
                          />
                        </div>
                        <div className="m-progress-info">
                          <span>Mengunduh�</span>
                          <span>{Math.round(d.progress || 0)}%</span>
                        </div>
                      </div>
                    )}
                    <div className="m-card-foot">
                      {st === "done" ? (
                        <>
                          <span className="m-done-badge">
                            <HubIcon.check /> Terunduh
                          </span>
                          <button
                            className="m-use-btn active"
                            onClick={() => onUse(d.port)}
                          >
                            Gunakan
                          </button>
                          <button
                            className="hub-del"
                            onClick={() => delModel(d.port)}
                          >
                            Hapus
                          </button>
                        </>
                      ) : st === "downloading" ? (
                        <>
                          <button className="m-dl-btn" disabled>
                            <HubIcon.loader className="spin" /> Mengunduh�
                          </button>
                          <button
                            className="hub-del"
                            onClick={() => stop(m.id)}
                          >
                            Stop
                          </button>
                        </>
                      ) : st === "resolving" ? (
                        <button className="m-dl-btn" disabled>
                          <HubIcon.loader className="spin" /> Menyiapkan�
                        </button>
                      ) : (
                        <button
                          className="m-dl-btn"
                          onClick={() => download(m.id)}
                        >
                          <HubIcon.download /> Download
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="hub-empty">
              <HubIcon.empty />
              <div>{msg || "Ketik untuk mencari model."}</div>
            </div>
          )}
          {msg && results.length > 0 && (
            <div className="hf-msg" style={{ marginTop: 14 }}>
              {msg}
            </div>
          )}
        </div>
      </div>
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
// <canvas>, so per-widget DOM doesn't exist � instead we force-enable Flutter's
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
  // activated � click it programmatically (retry until the tree appears).
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
const A2UI_STREAMING =
  '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
  "<style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#0d1117;font-family:system-ui;color:#54c5f8;flex-direction:column;gap:12px}" +
  ".dots span{animation:b 1.2s infinite;display:inline-block}.dots span:nth-child(2){animation-delay:.2s}.dots span:nth-child(3){animation-delay:.4s}" +
  "@keyframes b{0%,80%,100%{opacity:.25}40%{opacity:1}}p{font-size:13px;opacity:.75}</style></head>" +
  '<body><div class="dots" style="font-size:26px"><span>?</span> <span>?</span> <span>?</span></div><p>menerima spesifikasi A2UI dari model�</p></body></html>';
// Fallback: if a model wrongly returns ```dart instead of A2UI JSON
const FLUTTER_STREAMING =
  '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
  "<style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#0d1117;font-family:system-ui;color:#54c5f8;flex-direction:column;gap:12px}" +
  ".dots span{animation:b 1.2s infinite;display:inline-block}.dots span:nth-child(2){animation-delay:.2s}.dots span:nth-child(3){animation-delay:.4s}" +
  "@keyframes b{0%,80%,100%{opacity:.25}40%{opacity:1}}p{font-size:13px;opacity:.75}</style></head>" +
  '<body><div class="dots" style="font-size:26px"><span>?</span> <span>?</span> <span>?</span></div><p>menerima kode Flutter dari model�</p></body></html>';

// Loading placeholder shown while DartPad API compiles
const FLUTTER_COMPILING = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#0d1117;font-family:system-ui;color:#5eead4;flex-direction:column;gap:14px;}
.spin{width:36px;height:36px;border:3px solid rgba(94,234,212,.2);border-top-color:#5eead4;border-radius:50%;animation:spin .8s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}
p{font-size:13px;opacity:.7;}</style></head>
<body><div class="spin"></div><p>Mengkompilasi Flutter�</p></body></html>`;

// Web Dev is A2UI-only. If a model wrongly returns Dart instead of an A2UI JSON spec,
// we show this instead of compiling the old way.
const DART_NOTICE =
  '<!doctype html><html><head><meta charset="utf-8"></head>' +
  '<body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0d11;color:#cbd5e1;font-family:system-ui;text-align:center;padding:24px">' +
  '<div><div style="font-size:30px;margin-bottom:10px">??</div>' +
  '<div style="color:#fbbf24;font-weight:600;margin-bottom:8px">Model mengembalikan kode Dart, bukan A2UI JSON</div>' +
  '<div style="font-size:13px;opacity:.7;max-width:340px;line-height:1.6">' +
  "Gunakan model yang konsisten menghasilkan A2UI JSON, atau minta ulang. Kode Dart tidak lagi dikompilasi.</div></div></body></html>";

// Detect web/app output in a reply and assemble ONE previewable HTML document.
function buildPreview(text) {
  const t = text || "";
  // Tolerant fence scan: capture closed blocks AND a still-streaming trailing one.
  const blocks = [];
  const re = /```([\w+#.-]*)[^\n]*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(t)))
    blocks.push({ lang: (m[1] || "").toLowerCase(), code: m[2] });
  const tail = t.slice(re.lastIndex);
  const om = tail.match(/```([\w+#.-]*)[^\n]*\n([\s\S]*)$/);
  if (om && om[2])
    blocks.push({ lang: (om[1] || "").toLowerCase(), code: om[2], open: true }); // fence belum ditutup = masih streaming
  const find = (re2) => blocks.find((b) => re2.test(b.lang || ""));

  // DEBUG: log found blocks
  console.log(
    "[buildPreview] blocks found:",
    blocks.map((b) => ({
      lang: b.lang,
      len: b.code?.length || 0,
      starts: b.code?.trim().slice(0, 20),
    })),
  );

  // Backend blocks (shown in the Code explorer under backend/, never previewed)
  const pyB = find(/^(py|python)$/);
  const sqlB = find(/^sql$/);
  const backendFiles = [];
  if (pyB)
    backendFiles.push({
      path: "backend/main.py",
      lang: "python",
      code: pyB.code,
    });
  if (sqlB)
    backendFiles.push({
      path: "backend/schema.sql",
      lang: "sql",
      code: sqlB.code,
    });

  // WOLFSPACE Canvas is Flutter-only: a previewable result is ONE ```dart block,
  // compiled locally by the Flutter SDK. HTML/CSS/JS/React are no longer rendered.
  // streaming:true while the fence is still open � compiling a half-written
  // program just wastes a build on a guaranteed syntax error.
  // A2UI: a ```json block that is a UI spec ? render instantly in the studio (no compile).
  const jsonB = find(/^(json|a2ui)$/);
  console.log(
    "[buildPreview] jsonB:",
    jsonB
      ? {
          lang: jsonB.lang,
          len: jsonB.code?.length,
          starts: jsonB.code?.trim().slice(0, 50),
        }
      : null,
  );
  if (jsonB && jsonB.code) {
    const s = jsonB.code.trim();
    const hasType = /"type"\s*:|"root"\s*:/.test(s);
    console.log(
      "[buildPreview] JSON check: startsWith={",
      s.startsWith("{"),
      "}, hasType:",
      hasType,
    );
    if (s.startsWith("{") && hasType)
      return {
        has: true,
        flutter: true,
        a2ui: true,
        source: s,
        streaming: !!jsonB.open,
        files: [{ path: "ui.json", lang: "json", code: s }, ...backendFiles],
      };
  }

  // Web Dev is A2UI-only now: a model that (wrongly) returns ```dart is NOT compiled
  // anymore � show it in the file list but never run the old Flutter-compile path.
  const dart = find(/^dart$/);
  if (dart && dart.code && dart.code.length > 20)
    return {
      has: true,
      dartOnly: true,
      doc: DART_NOTICE,
      files: [
        { path: "lib/main.dart", lang: "dart", code: dart.code },
        ...backendFiles,
      ],
    };

  return { has: false };
}

// Terminal-style page for console programs (Kotlin/Java/Go/...), so the Canvas
// still shows the run result even when there is nothing visual to render.
function consoleDoc(run) {
  const esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;");
  return (
    '<!doctype html><html><head><meta charset="utf-8"><style>' +
    "body{margin:0;background:#0b0d11;color:#cbd5e1;font:13px/1.65 ui-monospace,Consolas,monospace;padding:18px}" +
    ".hd{color:#5eead4;margin-bottom:12px;font-weight:600}" +
    ".ok{color:#34d399}.bad{color:#f87171}" +
    "pre{white-space:pre-wrap;word-break:break-word;margin:0}" +
    ".err{color:#fca5a5;margin-top:12px;border-top:1px dashed #2a3340;padding-top:12px}" +
    "</style></head><body>" +
    '<div class="hd">$ run ' +
    esc(run.language || "") +
    ' <span class="' +
    (run.ok ? "ok" : "bad") +
    '">' +
    (run.ok ? "� exit 0" : "� gagal") +
    "</span></div>" +
    "<pre>" +
    (esc(run.output) || "(Belum ada output)") +
    "</pre>" +
    (run.error ? '<pre class="err">' + esc(run.error) + "</pre>" : "") +
    '<div style="margin-top:22px;padding-top:12px;border-top:1px solid #1f2733;color:#5b6776;font-size:11px">' +
    "Ini verifikasi logika (konsol). Untuk antarmuka visual, minta ulang dengan model yang mendukung A2UI.</div>" +
    "</body></html>"
  );
}

// Code tab: file tree grouped by folder (lib/ backend/) + editor pane
function CodeExplorer({ files, onEdit }) {
  const [cur, setCur] = useState(0);
  // Command Palette state (VS Code fork)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState("");
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  
  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!commandSearch.trim()) return COMMANDS;
    return COMMANDS.filter(cmd => 
      cmd.label.toLowerCase().includes(commandSearch.toLowerCase())
    );
  }, [commandSearch]);
  
  // Execute selected command
  const runSelectedCommand = () => {
    const cmd = filteredCommands[selectedCommandIndex];
    if (cmd) {
      cmd.action();
      setCommandPaletteOpen(false);
      setCommandSearch("");
    }
  };
  
  // Keyboard shortcut for Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        setCommandSearch("");
        setSelectedCommandIndex(0);
      }
      // Navigate in command palette
      if (commandPaletteOpen) {
        if (e.key === 'Escape') {
          setCommandPaletteOpen(false);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedCommandIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedCommandIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
          runSelectedCommand();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, selectedCommandIndex, filteredCommands]);

  useEffect(() => {
    if (cur >= files.length) setCur(0);
  }, [files.length]);
  const groups = {};
  files.forEach((f, i) => {
    const folder = f.path.includes("/") ? f.path.split("/")[0] : "app";
    (groups[folder] = groups[folder] || []).push({ ...f, i });
  });
  const fileIcon = (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <path d="M4 1.5h5L13 5.5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z" />
      <path d="M9 1.5V5.5h4" />
    </svg>
  );
  return (
    <div className="code-explorer">
      <div className="ce-tree">
        {Object.entries(groups).map(([folder, fs]) => (
          <div key={folder} className="ce-folder">
            <div className="ce-folder-name">
              <svg
                viewBox="0 0 16 16"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              >
                <path d="M1.5 4a1 1 0 0 1 1-1h3l1.5 2h6.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
              </svg>
              {folder}
            </div>
            {fs.map((f) => (
              <button
                key={f.i}
                className={"ce-file" + (f.i === cur ? " active" : "")}
                onClick={() => setCur(f.i)}
              >
                {fileIcon}
                {f.path.split("/").pop()}
              </button>
            ))}
          </div>
        ))}
      </div>
      <textarea
        className="canvas-code"
        value={(files[cur] && files[cur].code) || ""}
        spellCheck={false}
        onChange={(e) => onEdit(cur, e.target.value)}
      />
    </div>
  );
}

/* ---------- Flutter SDK Info Panel ---------- */
function FlutterSDKInfo({ isFlutter }) {
  const [info, setInfo] = useState(null);
  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [showDoctor, setShowDoctor] = useState(false);
  const fetchInfo = useCallback(() => {
    setLoading(true);
    setErr(null);
    fetch("/flutter/sdk-info")
      .then((r) => r.json())
      .then((d) => {
        setInfo(d);
        setLoading(false);
      })
      .catch((e) => {
        setErr(e.message);
        setLoading(false);
      });
  }, []);
  const fetchDoctor = useCallback(() => {
    setLoading(true);
    setErr(null);
    fetch("/flutter/doctor")
      .then((r) => r.json())
      .then((d) => {
        setDoctor(d);
        setShowDoctor(true);
        setLoading(false);
      })
      .catch((e) => {
        setErr(e.message);
        setLoading(false);
      });
  }, []);
  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);
  return (
    <div className="flutter-sdk-panel">
      <div className="fsdk-head">
        <span className="fsdk-title">
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 10l-2 2 2 2" />
            <path d="M15 10l2 2-2 2" />
          </svg>{" "}
          Flutter SDK
        </span>
        <button className="fsdk-refresh" title="Refresh" onClick={fetchInfo}>
          ?
        </button>
      </div>
      {loading && !info && <div className="fsdk-loading">Memuat�</div>}
      {err && <div className="fsdk-err">{err}</div>}
      {info && (
        <>
          <div className="fsdk-row">
            <span className="fsdk-label">Status</span>
            <span
              className={"fsdk-val " + (info.found ? "fsdk-ok" : "fsdk-miss")}
            >
              {info.found ? "SDK ditemukan" : "SDK tidak ditemukan"}
            </span>
          </div>
          {info.path && (
            <div className="fsdk-row">
              <span className="fsdk-label">Path</span>
              <span className="fsdk-val fsdk-path" title={info.path}>
                {info.path}
              </span>
            </div>
          )}
          {info.version && (
            <div className="fsdk-row">
              <span className="fsdk-label">Versi</span>
              <span className="fsdk-val">{info.version}</span>
            </div>
          )}
          <div className="fsdk-actions">
            {isFlutter && (
              <button
                className="fsdk-btn"
                onClick={() =>
                  fetch("/flutter/compile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ source: "" }),
                  }).catch(() => {})
                }
              >
                Compile ulang
              </button>
            )}
            <button
              className="fsdk-btn"
              onClick={fetchDoctor}
              disabled={loading}
            >
              Flutter Doctor
            </button>
            <a
              className="fsdk-link"
              href="https://flutter.dev/docs"
              target="_blank"
              rel="noreferrer"
            >
              Dokumentasi ?
            </a>
          </div>
          {showDoctor && doctor && (
            <div className="fsdk-doctor">
              <div className="fsdk-doctor-head">
                <span>flutter doctor</span>
                <button
                  className="fsdk-doctor-close"
                  onClick={() => setShowDoctor(false)}
                >
                  ?
                </button>
              </div>
              <pre className="fsdk-doctor-out">
                {doctor.output || "" || doctor.error || "Belum ada output"}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CanvasPanel({ project, onClose, modelVal }) {
  const [tab, setTab] = useState("preview");
  const [doc, setDoc] = useState(project.doc || FLUTTER_COMPILING);
  const [nonce, setNonce] = useState(0);
  const [flutterErr, setFlutterErr] = useState(null);
  const [compiling, setCompiling] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildOutput, setBuildOutput] = useState(null);
  const [dragMode, setDragMode] = useState(false);
  const [dragStatus, setDragStatus] = useState(null);
  const [fSel, setFSel] = useState(null); // selected flutter widget {elementText, elementTag}
  const [fDelta, setFDelta] = useState(null); // accumulated move {dx, dy}
  const [fInstr, setFInstr] = useState(""); // free-form edit instruction
  const [sizeOps, setSizeOps] = useState({}); // net size/spacing deltas for the selected widget
  const [dartSource, setDartSource] = useState(project.flutter || null);
  const [flutterUrl, setFlutterUrl] = useState(null); // /flutter-app/index.html once compiled
  const lastGoodRef = useRef(null); // last source that compiled OK (for revert)
  const fixCountRef = useRef(0); // auto-fix attempts spent on the current source
  const [files, setFiles] = useState(project.files || null); // explorer files (Code tab)
  const [showSDKInfo, setShowSDKInfo] = useState(false); // Flutter SDK info panel
  const iframeRef = useRef(null);
  const isFlutter = !!project.flutter;

  // Keep dartSource and explorer files in sync with project
  useEffect(() => {
    if (project.flutter) setDartSource(project.flutter);
  }, [project.flutter]);
  useEffect(() => {
    setFiles(project.files || null);
  }, [project.files]);

  // Edit a file in the Code explorer ? update Dart source (takes effect on ? compile)
  function onFileEdit(i, code) {
    setFiles((prev) => {
      const nf = prev.slice();
      nf[i] = { ...nf[i], code };
      const main = nf.find((f) => f.path === "lib/main.dart");
      if (main) setDartSource(main.code);
      return nf;
    });
  }

  // Helper: compile given Dart source and update preview
  function compileDart(src) {
    setFlutterErr(null);
    setFlutterUrl(null);
    setDoc(FLUTTER_COMPILING);
    setNonce((n) => n + 1);
    setCompiling(true);
    return fetch("/flutter/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: src }),
    })
      .then((r) => r.json())
      .then((d) => {
        setCompiling(false);
        if (d.error) {
          // Surgical auto-fix: patch the compile error (max 2x), recompile once each.
          if (fixCountRef.current < 2) {
            fixCountRef.current++;
            setDragStatus("Auto-fix (" + fixCountRef.current + "/2)�");
            fetch("/flutter/fix", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                source: src,
                error: d.error,
                ...(modelVal === "cloud"
                  ? { cloud: getCloud() }
                  : { port: modelVal }),
              }),
            })
              .then((r) => r.json())
              .then((f) => {
                setDragStatus(null);
                if (f.error || !f.source) {
                  setFlutterErr(d.error);
                  return;
                }
                setDartSource(f.source);
                compileDart(f.source);
              })
              .catch(() => {
                setDragStatus(null);
                setFlutterErr(d.error);
              });
          } else {
            setFlutterErr(d.error); // budget spent ? show error + revert option
          }
        } else if (d.url) {
          fixCountRef.current = 0;
          lastGoodRef.current = src;
          setFlutterUrl(d.url + "?v=" + Date.now());
          setNonce((n) => n + 1);
        } // success: reset budget, record last-good
        else {
          setDoc(d.html || flutterRunnerDoc(d.result || ""));
          setNonce((n) => n + 1);
        }
        return d;
      })
      .catch((e) => {
        setCompiling(false);
        setFlutterErr(e.message);
      });
  }

  function buildApk(src, target = "apk") {
    setFlutterErr(null);
    setBuildOutput(null);
    setBuilding(true);
    return fetch("/flutter/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: src, target }),
    })
      .then((r) => r.json())
      .then((d) => {
        setBuilding(false);
        if (d.error) {
          setFlutterErr(d.error);
        } else if (d.output) {
          setBuildOutput(d.output);
        }
        return d;
      })
      .catch((e) => {
        setBuilding(false);
        setFlutterErr(e.message);
      });
  }

  // The compiled app iframe is same-origin (/flutter-app/...) � inject the
  // visual-edit runtime into it after each load, and restore drag mode.
  function setupFlutterFrame() {
    const f = iframeRef.current;
    if (!f) return;
    try {
      const fdoc = f.contentDocument;
      if (fdoc && !fdoc.getElementById("__qdrag__")) {
        const s = fdoc.createElement("script");
        s.id = "__qdrag__";
        s.textContent = flutterDragScript();
        fdoc.body.appendChild(s);
      }
      if (dragMode)
        f.contentWindow.postMessage(
          { __qdragcmd__: true, cmd: "setActive", val: true },
          "*",
        );
    } catch (_) {}
  }

  // Auto-compile when Flutter source changes
  useEffect(() => {
    if (!project.flutter) {
      setDoc(project.doc);
      setNonce((n) => n + 1);
      setFlutterErr(null);
      return;
    }
    fixCountRef.current = 0; // fresh generation ? fresh auto-fix budget
    compileDart(project.flutter);
  }, [project.flutter, project.doc]);

  // Messages from the Flutter preview iframe: widget select / move
  useEffect(() => {
    function onMsg(ev) {
      if (!ev.data || !ev.data.__qdrag__) return;
      const d = ev.data;
      if (d.type === "select") {
        setFSel({ elementText: d.elementText, elementTag: d.elementTag });
        setFDelta(null);
        setFInstr("");
        setSizeOps({});
      }
      if (d.type === "moved") {
        setFSel({ elementText: d.elementText, elementTag: d.elementTag });
        setFDelta({ dx: d.dx, dy: d.dy });
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  function clearFSel() {
    setFSel(null);
    setFDelta(null);
    setFInstr("");
    setSizeOps({});
    try {
      iframeRef.current &&
        iframeRef.current.contentWindow.postMessage(
          { __qdragcmd__: true, cmd: "clearSel" },
          "*",
        );
    } catch (_) {}
  }

  // Size/spacing stepper: accumulate net deltas per dimension
  function bumpSize(key, step) {
    setSizeOps((o) => {
      const v = (o[key] || 0) + step;
      const n = { ...o };
      if (v === 0) delete n[key];
      else n[key] = v;
      return n;
    });
  }
  // Compose a plain-language instruction from the accumulated size deltas
  function sizeInstruction() {
    const L = {
      width: "lebar",
      height: "tinggi",
      padding: "padding",
      font: "ukuran font",
      radius: "sudut border (borderRadius)",
    };
    return Object.entries(sizeOps)
      .map(
        ([k, v]) =>
          `${v > 0 ? "tambah" : "kurangi"} ${L[k]} sekitar ${Math.abs(v)}px`,
      )
      .join(", ");
  }
  const hasSizeOps = Object.keys(sizeOps).length > 0;

  // Apply the visual edit (move + size + free instruction): AI patches Dart, recompile
  function applyVisualEdit() {
    if (!fSel || !dartSource) return;
    const moved =
      fDelta && (Math.abs(fDelta.dx) >= 4 || Math.abs(fDelta.dy) >= 4);
    const instr = [sizeInstruction(), fInstr.trim()].filter(Boolean).join(". ");
    if (!moved && !instr) return;
    setDragStatus("AI memperbarui kode�");
    fetch("/flutter/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: dartSource,
        elementText: fSel.elementText,
        elementTag: fSel.elementTag,
        dx: fDelta ? fDelta.dx : 0,
        dy: fDelta ? fDelta.dy : 0,
        instruction: instr,
        ...(modelVal === "cloud" ? { cloud: getCloud() } : { port: modelVal }),
      }), // same model as chat
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setDragStatus(null);
          setFlutterErr("Edit error: " + d.error);
          return;
        }
        setDartSource(d.source);
        clearFSel();
        setDragStatus("Mengkompilasi�");
        compileDart(d.source).then(() => setDragStatus(null));
      })
      .catch((e) => {
        setDragStatus(null);
        setFlutterErr(e.message);
      });
  }

  const run = project.run,
    q = run && run.quality;
  const openTab = () => {
    if (isFlutter && flutterUrl) {
      window.open(flutterUrl);
      return;
    }
    const w = window.open();
    if (w) {
      w.document.open();
      w.document.write(doc);
      w.document.close();
    }
  };

  // srcdoc is used for placeholders (flutter compiling/streaming) and the console
  // terminal view; the compiled flutter app loads via src= (runtime injected onLoad).
  const iframeDoc = doc;

  return (
    <div className="canvas">
      <div className="canvas-head">
        <span className="canvas-title">
          <Icon.spark style={{ width: 14, height: 14 }} /> Canvas
        </span>
        {isFlutter && (
          <span
            className={
              "flutter-badge" + (compiling ? " flutter-badge-busy" : "")
            }
          >
            {compiling ? "? mengkompilasi�" : "Flutter"}
          </span>
        )}
        <div className="canvas-tabs">
          <button
            className={tab === "preview" ? "active" : ""}
            onClick={() => setTab("preview")}
          >
            Preview
          </button>
          <button
            className={tab === "code" ? "active" : ""}
            onClick={() => {
              setTab("code");
              setDragMode(false);
            }}
          >
            Code
          </button>
        </div>
        <span className="tb-spacer" />

        {/* Flutter toolbar */}
        {isFlutter && (
          <>
            <button
              className="canvas-icon"
              title="Compile ulang"
              disabled={compiling}
              onClick={() => compileDart(dartSource || project.flutter)}
            >
              ?
            </button>
            <button
              className="canvas-icon"
              title={building ? "Membangun�" : "Build APK"}
              disabled={compiling || building}
              onClick={() => buildApk(dartSource || project.flutter, "apk")}
            >
              {building ? "?" : "??"}
            </button>
            <button
              className={
                "canvas-icon flutter-drag-btn" +
                (dragMode ? " flutter-drag-active" : "")
              }
              title={
                dragMode
                  ? "Nonaktifkan Edit Visual"
                  : "Edit Visual � pilih & seret widget"
              }
              disabled={compiling}
              onClick={() => {
                const next = !dragMode;
                setDragMode(next);
                setFSel(null);
                setFDelta(null);
                setFInstr("");
                try {
                  iframeRef.current &&
                    iframeRef.current.contentWindow.postMessage(
                      { __qdragcmd__: true, cmd: "setActive", val: next },
                      "*",
                    );
                } catch (_) {}
              }}
            >
              <svg
                viewBox="0 0 16 16"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M3 3l4 1-1 4 2-2 4 4-1.5 1.5-4-4-2 2 1-4z" />
                <path d="M10 2l4 4" />
              </svg>
            </button>
            <button
              className={
                "canvas-icon" + (showSDKInfo ? " flutter-drag-active" : "")
              }
              title="SDK Info"
              onClick={() => setShowSDKInfo((v) => !v)}
            >
              <svg
                viewBox="0 0 16 16"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="2" y="3" width="12" height="10" rx="1.5" />
                <path d="M7 7h2M7 9h2" />
                <circle cx="8" cy="6" r=".5" fill="currentColor" />
              </svg>
            </button>
          </>
        )}

        {/* Non-flutter (console/terminal) � just reload */}
        {!isFlutter && (
          <button
            className="canvas-icon"
            title="Muat ulang"
            onClick={() => setNonce((n) => n + 1)}
          >
            ?
          </button>
        )}

        <button
          className="canvas-icon"
          title="Buka di tab baru"
          onClick={openTab}
        >
          ?
        </button>
        <button
          className="canvas-icon canvas-close"
          title="Tutup"
          onClick={onClose}
        >
          ?
        </button>
      </div>

      {/* Flutter compile error */}
      {isFlutter && flutterErr && (
        <div className="flutter-err-panel">
          <span className="flutter-err-icon">?</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <pre className="flutter-err-pre">{flutterErr}</pre>
            {flutterErr.includes("tidak ditemukan") && (
              <a
                className="flutter-install-link"
                href="https://flutter.dev/docs/get-started/install/windows"
                target="_blank"
                rel="noreferrer"
              >
                ? Install Flutter SDK
              </a>
            )}
            {lastGoodRef.current && lastGoodRef.current !== dartSource && (
              <button
                className="flutter-revert-btn"
                onClick={() => {
                  const good = lastGoodRef.current;
                  setDartSource(good);
                  setFlutterErr(null);
                  clearFSel();
                  compileDart(good); // server caches the last good build ? instant
                }}
              >
                ? Kembalikan versi yang berfungsi
              </button>
            )}
          </div>
        </div>
      )}

      {/* Flutter build output */}
      {isFlutter && buildOutput && (
        <div className="flutter-err-panel" style={{ borderColor: "#22c55e" }}>
          <span className="flutter-err-icon" style={{ color: "#22c55e" }}>
            ?
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <pre className="flutter-err-pre" style={{ color: "#22c55e" }}>
              {buildOutput}
            </pre>
            {buildOutput.endsWith(".apk") && (
              <span
                style={{ fontSize: 11, color: "#60a5fa", cursor: "pointer" }}
                onClick={() => navigator.clipboard.writeText(buildOutput)}
              >
                ?? salin path
              </span>
            )}
          </div>
        </div>
      )}

      {/* Flutter visual-edit bar */}
      {isFlutter && dragMode && !compiling && (
        <div className={"flutter-drag-bar" + (fSel ? " has-pending" : "")}>
          {fSel ? (
            <>
              <div className="fdrag-info">
                <span className="fdrag-tag">
                  {(fSel.elementText || fSel.elementTag).slice(0, 30)}
                </span>
                {fDelta &&
                (Math.abs(fDelta.dx) >= 4 || Math.abs(fDelta.dy) >= 4) ? (
                  <span className="fdrag-delta">
                    digeser {fDelta.dx > 0 ? "+" : ""}
                    {fDelta.dx}px, {fDelta.dy > 0 ? "+" : ""}
                    {fDelta.dy}px
                  </span>
                ) : (
                  <span className="fdrag-delta">
                    seret untuk pindah, atau atur ukuran ?
                  </span>
                )}
              </div>
              <input
                className="fdrag-instr"
                value={fInstr}
                onChange={(e) => setFInstr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyVisualEdit();
                }}
                placeholder="Tulis instruksi, misalnya: ubah warna menjadi merah"
              />
              <button className="fdrag-cancel" onClick={clearFSel}>
                Batal
              </button>
              <button
                className="fdrag-apply"
                disabled={
                  !!dragStatus ||
                  (!fInstr.trim() &&
                    !hasSizeOps &&
                    !(
                      fDelta &&
                      (Math.abs(fDelta.dx) >= 4 || Math.abs(fDelta.dy) >= 4)
                    ))
                }
                onClick={applyVisualEdit}
              >
                {dragStatus ? (
                  <>
                    <span className="drag-spin" /> {dragStatus}
                  </>
                ) : (
                  "Terapkan"
                )}
              </button>
            </>
          ) : (
            <>
              <svg
                viewBox="0 0 16 16"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ flexShrink: 0 }}
              >
                <path d="M3 3l4 1-1 4 2-2 4 4-1.5 1.5-4-4-2 2 1-4z" />
                <path d="M10 2l4 4" />
              </svg>
              Klik widget di preview untuk memilih � lalu atur ukuran atau seret
            </>
          )}
        </div>
      )}

      {/* Flutter size/spacing panel � fills the gap where HTML would use CSS resize */}
      {isFlutter && dragMode && !compiling && fSel && (
        <div className="fsize-panel">
          {[
            { key: "width", label: "Lebar", step: 20 },
            { key: "height", label: "Tinggi", step: 20 },
            { key: "padding", label: "Padding", step: 8 },
            { key: "font", label: "Font", step: 2 },
            { key: "radius", label: "Sudut", step: 4 },
          ].map((d) => (
            <div key={d.key} className="fsize-row">
              <span className="fsize-label">{d.label}</span>
              <button
                className="fsize-btn"
                onClick={() => bumpSize(d.key, -d.step)}
              >
                -
              </button>
              <span className={"fsize-val" + (sizeOps[d.key] ? " on" : "")}>
                {sizeOps[d.key]
                  ? (sizeOps[d.key] > 0 ? "+" : "") + sizeOps[d.key]
                  : "�"}
              </span>
              <button
                className="fsize-btn"
                onClick={() => bumpSize(d.key, d.step)}
              >
                +
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="canvas-body">
        {tab === "preview" ? (
          isFlutter && flutterUrl ? (
            <iframe
              key={nonce}
              ref={iframeRef}
              className="canvas-frame"
              src={flutterUrl}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
              title="preview"
              onLoad={setupFlutterFrame}
            />
          ) : (
            <iframe
              key={nonce}
              ref={iframeRef}
              className="canvas-frame"
              sandbox={
                isFlutter
                  ? "allow-scripts allow-same-origin allow-popups allow-downloads"
                  : "allow-scripts allow-modals allow-forms allow-popups"
              }
              srcDoc={iframeDoc}
              title="preview"
            />
          )
        ) : files && files.length ? (
          <CodeExplorer files={files} onEdit={onFileEdit} />
        ) : (
          <textarea
            className="canvas-code"
            value={doc}
            spellCheck={false}
            onChange={(e) => setDoc(e.target.value)}
          />
        )}
      </div>
      {showSDKInfo && <FlutterSDKInfo isFlutter={isFlutter} />}
      <div className="canvas-foot">
        {isFlutter ? (
          <span className="verdict-mini" style={{ color: "#54c5f8" }}>
            Flutter � SDK lokal
          </span>
        ) : run ? (
          <span className={"verdict-mini " + (run.ok ? "ok" : "bad")}>
            {run.ok ? "? logika terverifikasi" : "? belum lolos"}
          </span>
        ) : (
          <span className="verdict-mini">? live preview</span>
        )}
        {!isFlutter && q ? (
          <span
            className={
              "q-mini " +
              (q.score >= 85 ? "q-hi" : q.score >= 60 ? "q-mid" : "q-lo")
            }
          >
            kualitas {q.score}
          </span>
        ) : null}
        <span className="tb-spacer" />
        <span className="canvas-hint">
          {isFlutter
            ? "edit lib/main.dart di tab Code ? ? compile ulang"
            : "output eksekusi"}
        </span>
      </div>
    </div>
  );
}

// Embedded Flutter Studio: the Web Dev workspace is the /studio Flutter app.
// We just host its iframe and push the generated Dart source in via postMessage.
function StudioFrame({ source, onClose }) {
  const ref = useRef(null);
  const srcRef = useRef(source);
  const bust = useRef("/studio/?v=" + Date.now()); // cache-bust so Electron never serves a stale studio build
  const beacon = (m, n) => {
    try {
      fetch(
        "/dbg?src=react&m=" +
          encodeURIComponent(m) +
          (n != null ? "&n=" + n : ""),
      );
    } catch (_) {}
  };
  const send = useCallback(() => {
    try {
      if (srcRef.current) {
        ref.current.contentWindow.postMessage(
          { quantumSource: srcRef.current, quantumUi: srcRef.current },
          "*",
        );
        beacon("sent source", srcRef.current.length);
      }
    } catch (_) {}
  }, []);
  // keep latest source and push it. The studio iframe needs ~1-2s to boot before
  // its message listener exists, so retry for a few seconds (studio dedupes).
  useEffect(() => {
    srcRef.current = source;
    if (!source) return;
    send();
    let n = 0;
    const iv = setInterval(() => {
      send();
      if (++n >= 8) clearInterval(iv);
    }, 400);
    return () => clearInterval(iv);
  }, [source, send]);
  // studio announces readiness AFTER its Flutter app boots � (re)send then
  useEffect(() => {
    const onMsg = (e) => {
      if (e.data && e.data.quantumStudioReady) {
        beacon("got studio ready");
        send();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [send]);
  return (
    <div className="canvas">
      <iframe
        ref={ref}
        src={bust.current}
        title="WOLFSPACE Studio"
        className="canvas-frame studio-frame"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
        onLoad={send}
      />
      <button className="studio-close" title="Tutup Studio" onClick={onClose}>
        ?
      </button>
    </div>
  );
}

/* ----------------------------- Sidebar (Claude-style) ----------------------------- */
const SB = {
  panel: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <line
        x1="9"
        y1="4"
        x2="9"
        y2="20"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  ),
  plus: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <line
        x1="12"
        y1="5"
        x2="12"
        y2="19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <line
        x1="5"
        y1="12"
        x2="19"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  ),
  chat: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M4 5h16v11H8l-4 4V5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  ),
  hub: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect
        x="4"
        y="4"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="13"
        y="4"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="4"
        y="13"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="13"
        y="13"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  ),
  key: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M11 11l8 8M16 16l2-2M18 18l2-2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  code: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M8 7l-5 5 5 5M16 7l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  target: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 2v4M12 18v4M2 12h4M18 12h4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  ),
  palette: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M12 3a9 9 0 100 18c1.7 0 2-1.3 1.2-2.2-.8-.9-.3-2.3 1-2.3H17a4 4 0 004-4 9 9 0 00-9-9.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="11" r="1" fill="currentColor" />
      <circle cx="11" cy="7.5" r="1" fill="currentColor" />
      <circle cx="15" cy="8.5" r="1" fill="currentColor" />
    </svg>
  ),
  runner: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M5 5h14v10H5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9 9l2 3-2 3M13 9l2 3-2 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 19h8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  ),
  // -- Agent-specific logos --
  quantumAgent: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.3" />
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <circle cx="12" cy="3" r="1.8" fill="currentColor" />
      <circle cx="12" cy="21" r="1.8" fill="currentColor" />
      <circle cx="3" cy="12" r="1.8" fill="currentColor" />
      <circle cx="21" cy="12" r="1.8" fill="currentColor" />
      <line
        x1="12"
        y1="9"
        x2="12"
        y2="3"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.6"
      />
      <line
        x1="12"
        y1="15"
        x2="12"
        y2="21"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.6"
      />
      <line
        x1="9"
        y1="12"
        x2="3"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.6"
      />
      <line
        x1="15"
        y1="12"
        x2="21"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.6"
      />
    </svg>
  ),
  opencode: (p) => (
    <svg viewBox="0 0 12 15" {...p}>
      <rect width="12" height="15" fill="#131010" />
      <path
        d="M0 0H12V15H0Z M3 3H9V12H3Z"
        fill="#FFFFFF"
        fillRule="evenodd"
      />
      <rect x="3" y="6" width="6" height="6" fill="#5A5858" />
    </svg>
  ),
  claude: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  ),
};
function Sidebar({
  collapsed,
  setCollapsed,
  view,
  setView,
  onNewChat,
  onVisualPicker,
  canvasAuto,
  onToggleCanvas,
  theme,
  setTheme,
  terminalOpen,
  setTerminalOpen,
  terminal,
  savedChats,
  showHistory,
  setShowHistory,
  restoreChat,
  deleteChat,
  loadSavedChats,
  onAgentRunner,
}) {
  const Item = ({ icon, label, active, onClick, badge }) => (
    <button
      className={"sb-item" + (active ? " active" : "")}
      onClick={onClick}
      title={collapsed ? label : undefined}
    >
      <i className="sb-ico">{icon}</i>
      <span className="sb-label">{label}</span>
      {badge && <span className="sb-badge">{badge}</span>}
    </button>
  );
  return (
    <aside className={"sidebar" + (collapsed ? " collapsed" : "")}> 
      <div className="sb-head">
        <span className="sb-brand">
          <BrandMark />
          <b>WOLFSPACE</b>
        </span>
        <button
          className="sb-toggle"
          title={collapsed ? "Buka panel" : "Tutup panel"}
          onClick={() => setCollapsed(!collapsed)}
        >
          {SB.panel({ width: 19, height: 19 })}
        </button>
      </div>
      <div className="sb-group">
        <Item
          icon={SB.plus({ width: 19, height: 19 })}
          label="Chat baru"
          onClick={onNewChat}
        />
        <Item
          icon={SB.chat({ width: 19, height: 19 })}
          label="Chat"
          active={view === "chat"}
          onClick={() => setView("chat")}
        />
        <Item
          icon={SB.hub({ width: 19, height: 19 })}
          label="Model Hub"
          active={view === "hub"}
          onClick={() => setView("hub")}
        />
        <Item
          icon={SB.key({ width: 19, height: 19 })}
          label="API Key"
          active={view === "settings"}
          onClick={() => setView("settings")}
        />
        <Item
          icon={SB.runner({ width: 19, height: 19 })}
          label="Agent Runner"
          active={view === "agents"}
          onClick={() => {
            setView("agents");
            onAgentRunner?.();
          }}
        />
      </div>
      <div className="sb-sec">Alat</div>
      <div className="sb-group">
        <Item
          icon={SB.target({ width: 19, height: 19 })}
          label="Visual Picker"
          onClick={onVisualPicker}
        />
      </div>
      <div
        className="sb-sec"
        style={{ cursor: "pointer" }}
        onClick={() => {
          setShowHistory(!showHistory);
          loadSavedChats();
        }}
      >
        Riwayat Chat{" "}
        <span style={{ float: "right", opacity: 0.6 }}>
          {showHistory ? "?" : "?"} {savedChats.length}
        </span>
      </div>
      {showHistory && (
        <div className="sb-history-list">
          {savedChats.length === 0 ? (
            <div className="sb-history-empty">Belum ada percakapan tersimpan</div>
          ) : (
            savedChats
              .slice()
              .reverse()
              .map((chat) => (
                <div
                  key={chat.id}
                  className="sb-history-item"
                  onClick={() => restoreChat(chat)}
                >
                  <div className="sb-history-info">
                    <span className="sb-history-title">
                      {chat.title || "Chat"}
                    </span>
                    <span className="sb-history-date">
                      {new Date(chat.savedAt).toLocaleDateString("id", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <button
                    className="sb-history-del"
                    title="Hapus"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(chat.id);
                    }}
                  >
                    ?
                  </button>
                </div>
              ))
          )}
        </div>
      )}
    </aside>
  );
}

// Live agent process � animated bubbles showing each file/folder being worked on.
// ─── Agent Step UI v2 ── SVG icons per tool ────────────────────────────────
const AG_SVG = {
  list:  (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><path d="M2 3h3v3H2zM2 7h3v3H2zM2 11h3v3H2z" fill="currentColor" opacity=".4"/><path d="M7 4h7M7 8h7M7 12h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  glob:  (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 2.5C6 5 6 11 8 13.5M8 2.5C10 5 10 11 8 13.5M2.5 8h11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>,
  read:  (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><rect x="3" y="1.5" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M5.5 5h5M5.5 7.5h5M5.5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  grep:  (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.4"/><path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><path d="M5 6.5h3M6.5 5v3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>,
  edit:  (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><path d="M10.5 2.5l3 3L5 14H2v-3L10.5 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M8.5 4.5l3 3" stroke="currentColor" strokeWidth="1.2"/></svg>,
  write: (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  run:   (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><path d="M4 2.5l10 5.5-10 5.5V2.5z" fill="currentColor" opacity=".9"/></svg>,
  bash:  (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M4 6l2.5 2.5L4 11M8.5 11h3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  err:   (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
};
const AG_META = {
  list:  { label:"List",  color:"var(--text-muted, #94a3b8)", bg:"transparent" },
  glob:  { label:"Glob",  color:"var(--text-muted, #94a3b8)", bg:"transparent" },
  read:  { label:"Read",  color:"var(--text-muted, #94a3b8)", bg:"transparent" },
  grep:  { label:"Grep",  color:"var(--text-muted, #94a3b8)", bg:"transparent" },
  edit:  { label:"Edit",  color:"var(--text-muted, #94a3b8)", bg:"transparent" },
  write: { label:"Write", color:"var(--text-muted, #94a3b8)", bg:"transparent" },
  run:   { label:"Run",   color:"var(--text-muted, #94a3b8)", bg:"transparent" },
  bash:  { label:"Bash",  color:"var(--text-muted, #94a3b8)", bg:"transparent" },
  err:   { label:"Error", color:"#f87171", bg:"rgba(248,113,113,0.12)" },
};
// Strip the DONE protocol marker so the agent's answer reads clean.
function cleanAgentText(s) {
  return (s || "")
    .replace(/^\s*```+\s*done\b[^\n]*\n?/i, "") // leading ```DONE fence (old protocol)
    .replace(/^\s*done\b[:\s]*/i, "") // leading "DONE" / "DONE:"
    .replace(/\n*\s*\bdone\b\s*$/i, "") // trailing standalone DONE
    .trim();
}
function ToolOutput({ text, ok, kind, arg }) {
  const [edReady, setEdReady] = useState(false);
  const hostRef = useRef(null);
  const edRef = useRef(null);
  // detect language from tool kind + file extension + content
  const language = useMemo(() => {
    if (kind === "read" && arg) {
      const ext = (arg || "").split(".").pop().toLowerCase();
      const langMap = {
        js: "javascript",
        jsx: "javascript",
        ts: "typescript",
        tsx: "typescript",
        py: "python",
        rb: "ruby",
        go: "go",
        rs: "rust",
        java: "java",
        c: "c",
        cpp: "cpp",
        dart: "dart",
        php: "php",
        yml: "yaml",
        yaml: "yaml",
        json: "json",
        xml: "xml",
        html: "html",
        css: "css",
        md: "markdown",
        sql: "sql",
        sh: "shell",
        bash: "shell",
        ps1: "powershell",
        cjs: "javascript",
        mjs: "javascript",
        kt: "kotlin",
        swift: "swift",
      };
      return langMap[ext] || "plaintext";
    }
    if (text) {
      if (
        /^(?:import|export|const|let|var|function|class|async|await|require)\b/m.test(
          text,
        )
      )
        return "javascript";
      if (/^(?:def |class |import |from |print\b)/m.test(text)) return "python";
      if (/^(?:fn |pub |let |mut |impl |enum |struct )/m.test(text))
        return "rust";
      if (/^(?:func |package |import |fmt\.)/m.test(text)) return "go";
      if (/^</m.test(text) && /<\/?[a-z]/i.test(text)) return "html";
      if (/^\{/m.test(text) || /"[^"]*"\s*:/m.test(text)) return "json";
      if (/^(?:#!|\$ |npm |git |cd |ls |echo |cat )/m.test(text))
        return "shell";
    }
    return "plaintext";
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
            value: text || "",
            language,
            theme: "vs-dark",
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            lineNumbers: "on",
            renderLineHighlight: "none",
            tabSize: 2,
            scrollbar: { alwaysConsumeMouseWheel: false },
            padding: { top: 6, bottom: 6 },
            wordWrap: "on",
            readOnly: true,
            domReadOnly: true,
            contextmenu: false,
            folding: true,
            glyphMargin: false,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 1,
          });
          edRef.current = ed;
          setEdReady(true);
          const fit = () => {
            if (!hostRef.current) return;
            hostRef.current.style.height =
              Math.min(Math.max(ed.getContentHeight(), 28), 400) + "px";
            ed.layout();
          };
          ed.onDidContentSizeChange(fit);
          fit();
        } catch (e) {
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
    return () => {
      disposed = true;
      if (edRef.current) {
        edRef.current.dispose();
        edRef.current = null;
      }
    };
  }, [language]);
  // follow text changes
  useEffect(() => {
    const ed = edRef.current;
    if (ed && ed.getValue() !== text) ed.setValue(text || "");
  }, [text]);
  return (
    <div className={"ar-out" + (ok ? "" : " err")}>
      <div
        className="ar-out-mona-host"
        ref={hostRef}
        style={{ display: edReady ? "block" : "none" }}
      />
      {!edReady && (
        <pre
          style={{
            margin: 0,
            font: "inherit",
            color: "inherit",
            background: "transparent",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {text}
        </pre>
      )}
    </div>
  );
}

/* ── Agent Action Log (IDE Style) ── */
function AgentActionLogRow({ e, i, expanded, setExpanded }) {
  const isOpen = !!expanded[i];
  
  if (e.type === "thought") {
    const text = e.output || e.arg || "Thinking...";
    const sections = [];
    const lines = text.split('\n');
    let current = null;
    for (const line of lines) {
      const headingMatch = line.match(/^##\s+(.+)$/);
      if (headingMatch) {
        if (current) sections.push(current);
        current = { heading: headingMatch[1].trim(), body: '' };
      } else if (current) {
        current.body += line + '\n';
      }
    }
    if (current) sections.push(current);
    const hasSections = sections.length > 0;
    const displaySections = hasSections ? sections : [{ heading: 'Thinking', body: text }];
    return (
      <React.Fragment>
        <div className="aal-row aal-thought-header" onClick={() => setExpanded(p => ({...p, [i]: !isOpen}))}>
          <span>Thought Process</span>
          <span className={"aal-chevron" + (isOpen ? " open" : "")}>
            <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
        </div>
        {isOpen && (
          <div className="aal-thought-content">
            {displaySections.map((s, idx) => (
              <div key={idx} className="aal-thought-section">
                <div className="aal-thought-heading">{s.heading}</div>
                <div className="aal-thought-body">{s.body.trim()}</div>
              </div>
            ))}
          </div>
        )}
      </React.Fragment>
    );
  }
  
  let verb = "Ran";
  let target = e.arg || "";
  let icon = AG_SVG.bash;
  let color = "var(--text-muted, #8c959f)";
  let fileLang = null;
  
  if (e.kind) {
    const k = e.kind.toLowerCase();
    if (k.includes("grep") || k.includes("search")) { verb = "Searched"; icon = AG_SVG.grep; }
    else if (k.includes("read") || k.includes("view")) { verb = "Analyzed"; icon = AG_SVG.read; color = "#61dafb"; }
    else if (k.includes("edit") || k.includes("replace") || k.includes("write")) { verb = "Edited"; icon = AG_SVG.edit; color = "#ef4444"; }
    else if (k.includes("list") || k.includes("glob")) { verb = "Explored"; icon = AG_SVG.glob; }
  }

  if (verb !== "Ran" && verb !== "Explored" && target.includes(".")) {
    const ext = target.split(".").pop().toLowerCase();
    const lMap = {
      js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
      py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
      c: "c", cpp: "cpp", dart: "dart", php: "php", yml: "yaml", yaml: "yaml",
      json: "json", xml: "xml", html: "html", css: "css", md: "markdown",
      sql: "sql", sh: "shell", bash: "shell", ps1: "powershell",
      cjs: "javascript", mjs: "javascript", kt: "kotlin", swift: "swift"
    };
    if (lMap[ext]) fileLang = lMap[ext];
  }

  let added = 0; let removed = 0;
  if (verb === "Edited" && e.output && e.output.includes("@@")) {
    const lines = e.output.split("\n");
    added = lines.filter(l => l.startsWith("+") && !l.startsWith("+++")).length;
    removed = lines.filter(l => l.startsWith("-") && !l.startsWith("---")).length;
  }
  
  const SvgIcon = icon;

  return (
    <React.Fragment>
      <div className={"aal-row" + (e.output ? "" : " no-hover")} onClick={e.output ? () => setExpanded(p => ({...p, [i]: !isOpen})) : undefined}>
        <span>{verb}</span>
        {fileLang ? (
          <span className="aal-icon" style={{marginTop: "1px"}}><LangIcon lang={fileLang} /></span>
        ) : (
          SvgIcon && <span className="aal-icon" style={{color: color}}><SvgIcon width={13} height={13}/></span>
        )}
        <span className="aal-code-highlight">{target.substring(0,60) + (target.length>60?"...":"")}</span>
        
        {verb === "Edited" && (added > 0 || removed > 0) ? (
          <React.Fragment>
            <span className="aal-diff-add">+{added}</span>
            <span className="aal-diff-sub">-{removed}</span>
          </React.Fragment>
        ) : null}
        
        {e.output && (
          <span className={"aal-chevron" + (isOpen ? " open" : "")} style={{marginLeft: "auto"}}>
            <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
        )}
      </div>
      
      {isOpen && e.output && (
        <div style={{margin: "4px 8px 12px 24px", border: "1px solid rgba(175,184,193,0.3)", borderRadius: "6px", overflow: "hidden"}}>
          <ToolOutput text={e.output} ok={e.ok} kind={e.kind} arg={e.arg} />
        </div>
      )}
    </React.Fragment>
  );
}

function GroupedActionRow({ group, expanded, setExpanded }) {
  const acts = group.acts;
  const isError = acts.some(a => !a.ok);
  const isOpen = expanded[group.id] !== false;
  return (
    <React.Fragment>
      <div className={"aal-row aal-group " + (isError ? "aal-error" : "")} onClick={() => setExpanded(p => ({...p, [group.id]: !isOpen}))}>
        <span className="aal-chevron" style={{marginRight: "6px"}}>{isOpen ? "▼" : "▶"}</span>
        <span>{acts.length} perintah dieksekusi</span>
        <span style={{marginLeft: "auto", fontSize: "11px", opacity: 0.6}}>
          {isError ? "Gagal" : "Sukses"}
        </span>
      </div>
      {isOpen && (
        <div style={{margin: "4px 8px 12px 24px", border: "1px solid rgba(175,184,193,0.3)", borderRadius: "6px", overflow: "hidden", display: "flex", flexDirection: "column"}}>
          {acts.map((a, j) => (
            <div key={j} style={j > 0 ? { borderTop: "1px solid rgba(175,184,193,0.3)" } : {}}>
              <div style={{ background: "#21262d", padding: "4px 12px", fontSize: "12px", color: "#8c959f", fontFamily: "monospace", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "#3fb950" }}>...\quantum &gt;</span> {a.arg || a.kind}
              </div>
              <ToolOutput text={a.output} ok={a.ok} kind={a.kind} arg={a.arg} />
            </div>
          ))}
        </div>
      )}
    </React.Fragment>
  );
}

function ConsolidatedThoughtCard({ thoughts, expanded, setExpanded }) {
  const isOpen = expanded['thought_card'] === true;
  const allSections = [];
  const bullets = [];
  thoughts.forEach((thought) => {
    const text = (thought.output || thought.arg || '').trim();
    if (!text) return;
    const hasHeadings = /^##\s+/m.test(text);
    if (hasHeadings) {
      const lines = text.split('\n');
      let current = null;
      for (const line of lines) {
        const headingMatch = line.match(/^##\s+(.+)$/);
        if (headingMatch) {
          if (current) allSections.push(current);
          current = { heading: headingMatch[1].trim(), body: '' };
        } else if (current) {
          current.body += line + '\n';
        }
      }
      if (current) allSections.push(current);
    } else {
      bullets.push(text);
    }
  });
  const totalSteps = allSections.length + bullets.length;
  if (totalSteps === 0) return null;
  return (
    <React.Fragment>
      <div className="aal-row aal-thought-header" onClick={() => setExpanded(p => ({...p, thought_card: !isOpen}))}>
        <span>Thought Process ({totalSteps} step{totalSteps > 1 ? 's' : ''})</span>
        <span className={"aal-chevron" + (isOpen ? " open" : "")}>
          <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
      </div>
      {isOpen && (
        <div className="aal-thought-content">
          {bullets.map((b, idx) => (
            <div key={'b'+idx} className="aal-thought-bullet">• {b}</div>
          ))}
          {allSections.map((s, idx) => (
            <div key={'s'+idx} className="aal-thought-section">
              <div className="aal-thought-heading">{s.heading}</div>
              <div className="aal-thought-body">{s.body.trim()}</div>
            </div>
          ))}
        </div>
      )}
    </React.Fragment>
  );
}

function AgentSteps({ run }) {
  const [expanded, setExpanded] = React.useState({});
  const allActs = (run.events || []).filter(e => e.type === "act" || e.type === "err" || e.type === "thought");
  const thoughts = allActs.filter(e => e.type === "thought");
  const acts = allActs.filter(e => e.type !== "thought");
  const summary = cleanAgentText(run.summary);

  if (run.done && allActs.length === 0 && !run.error)
    return (<React.Fragment><div className="bubble-model"><Blocks text={summary} /></div><Verdict run={run.run} /></React.Fragment>);
  if (!run.busy && allActs.length === 0 && run.error)
    return <div className="bubble-model" style={{color:"#fca5a5"}}>{summary || (run.events&&run.events[0]&&run.events[0].m) || "error"}</div>;

  const isTopOpen = expanded.top !== false;

  return (
    <div className="aal-container">
      <div className="aal-row" onClick={() => setExpanded(p => ({...p, top: !isTopOpen}))}>
        <span className="aal-code-highlight">Worked for {run.busy ? "..." : "1m"}</span>
        <span className={"aal-chevron" + (isTopOpen ? " open" : "")} style={{marginLeft: "auto"}}>
          <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
      </div>

      <div className={"aal-indent" + (isTopOpen ? "" : " aal-hidden")}>
        {thoughts.length > 0 && (
          <ConsolidatedThoughtCard thoughts={thoughts} expanded={expanded} setExpanded={setExpanded} />
        )}
        {(() => {
          const groupedActs = [];
          let currentGroup = null;
          acts.forEach((e, idx) => {
            if (e.type === "act") {
              if (!currentGroup) {
                currentGroup = [];
                groupedActs.push({ type: "group", acts: currentGroup, id: "g" + idx });
              }
              currentGroup.push({ ...e, originalIndex: idx });
            } else {
              currentGroup = null;
              groupedActs.push({ type: "single", event: e, originalIndex: idx });
            }
          });
          return groupedActs.map((item, idx) => {
            if (item.type === "group") return <GroupedActionRow key={"g"+idx} group={item} expanded={expanded} setExpanded={setExpanded} />;
            return <AgentActionLogRow key={"s"+idx} e={item.event} i={item.originalIndex} expanded={expanded} setExpanded={setExpanded} />;
          });
        })()}
        {run.busy && (
           <div className="aal-row aal-thought-header">
             <span>{run.thinking ? "Thinking..." : "Memproses..."}</span>
           </div>
        )}
      </div>
      
      {run.done && (summary || run.run) ? (
        <div style={{marginTop: "8px"}}>
          {summary ? <div className="bubble-model av2-result-bubble"><Blocks text={summary} /></div> : null}
          <Verdict run={run.run} />
        </div>
      ) : null}
    </div>
  );
}

function HitlModal({ request, onResolve }) {
  const [selected, setSelected] = React.useState(0);
  if (!request) return null;

  return (
    <div className="hitl-overlay">
      <div className="hitl-modal">
        <div className="hitl-title">{request.title || "Allow action?"}</div>
        {request.code && (
          <div className="hitl-code-box">
            {request.code}
          </div>
        )}
        <div className="hitl-options">
          {(request.options || [
            { value: "allow_once", text: "Yes, allow this time" },
            { value: "allow_project", text: "Yes, and always allow in this project" },
            { value: "allow_always", text: "Yes, and always allow" },
            { value: "deny", text: "No (tell the agent what to do instead)" }
          ]).map((opt, i) => (
            <div 
              key={i} 
              className={"hitl-option " + (selected === i ? "selected" : "")}
              onClick={() => setSelected(i)}
            >
              <div className="hitl-badge">{i + 1}</div>
              <div className="hitl-text">
                {opt.text.replace(" (tell the agent what to do instead)", "")}
                {opt.text.includes("instead") && (
                  <span className="hitl-text-muted"> (tell the agent what to do instead)</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="hitl-footer">
          <button className="hitl-btn-skip" onClick={() => onResolve(null)}>Skip</button>
          <button className="hitl-btn-submit" onClick={() => {
            const opts = request.options || [];
            const val = opts[selected] ? opts[selected].value : selected;
            onResolve(val);
          }}>
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- App ----------------------------- */
const SUGGESTIONS = [];
const CANVAS_BUILDING =
  '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0d11;color:#5eead4;font-family:system-ui">' +
  '<div style="text-align:center"><div style="font-size:13px;letter-spacing:2px;opacity:.7">WOLFSPACE</div><div style="margin-top:10px;font-size:15px">membangun antarmuka�</div></div></body></html>';
function App() {

  const [hitlRequest, setHitlRequest] = React.useState(null);
  window.testHitl = function() {
    setHitlRequest({
      kind: 'hitl',
      title: "Allow check if node-pty is installed?",
      code: "cmd /c npm ls node-pty",
      options: [
        { value: "allow_once", text: "Yes, allow this time" },
        { value: "allow_project", text: "Yes, and always allow in this project" },
        { value: "allow_always", text: "Yes, and always allow" },
        { value: "deny", text: "No (tell the agent what to do instead)" }
      ]
    });
  };
  const handleHitlResolve = (val) => {
    console.log("HITL resolved with:", val);
    const req = hitlRequest;
    setHitlRequest(null);
    if (!req) return;
    if (req.kind === 'ask') {
      // Question tool: send the selected answer as a normal user message so the agent can continue.
      if (val === "deny" || val === null || val === undefined) {
        setBusy(false);
        setTimeout(() => doSend("User memilih untuk tidak menjawab. Silakan lanjutkan dengan asumsi terbaik.", null), 50);
      } else {
        setTimeout(() => doSend(String(val), null), 50);
      }
      return;
    }
    // HITL approval flow
    if (val === "deny" || val === null || val === undefined) {
      // Cancel: reset busy and send denial message as new user message
      setBusy(false);
      setTimeout(() => doSend("Tindakan dibatalkan oleh user. Silakan evaluasi kembali dan gunakan cara lain.", null), 50);
    } else {
      // Allow: resume the agent with HITL approval (content empty is OK now that doSend checks hitlData)
      doSend("", null, { thread_id: req.thread_id, hitl_response: true });
    }
  };


  const [models, setModels] = useState([
    { value: "", label: "Memuat model...", disabled: true },
  ]);
  const [modelVal, setModelVal] = useState("");
  const [cloudVersion, setCloudVersion] = useState(0); // Trigger reload when cloud config changes

  const [panelOpen, setPanelOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Memuat model...");
  const [view, setView] = useState("chat");
  const [sbCollapsed, setSbCollapsed] = useState(() => {
    try {
      return localStorage.getItem("quantum_sb") === "1";
    } catch (e) {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("quantum_sb", sbCollapsed ? "1" : "0");
    } catch (e) {}
  }, [sbCollapsed]);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("quantum_theme") || "dark";
    } catch (e) {
      return "dark";
    }
  });

  const [canvas, setCanvas] = useState(null); // {doc, run} when the split Canvas is open
  const canvasRef = useRef(null); // mirror of canvas for stale-closure-safe reads in async
  const _setCanvas = (v) => {
    canvasRef.current = v;
    setCanvas(v);
  };
  const [canvasAuto, setCanvasAuto] = useState(false); // toggled from the composer
  const canvasAutoRef = useRef(false); // mirror for stale-closure-safe reads
  const _setCanvasAuto = (v) => {
    setCanvasAuto((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      canvasAutoRef.current = next;
      return next;
    });
  };
  const [canvasPct, setCanvasPct] = useState(46); // canvas width % (draggable divider)
  const [terminalPct, setTerminalPct] = useState(30);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalLoading, setTerminalLoading] = useState(false);
  const [savedChats, setSavedChats] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("quantum_chats") || "[]");
    } catch (e) {
      return [];
    }
  });
  const [showHistory, setShowHistory] = useState(false);
  // Agent Runner state
  const [agentRunnerOpen, setAgentRunnerOpen] = useState(false);
  const [availableAgents, setAvailableAgents] = useState([]);
  const [activeAgent, setActiveAgent] = useState("");
  const [agentOutput, setAgentOutput] = useState("");
  const [agentRunning, setAgentRunning] = useState(false);
  const agentEsRef = useRef(null);
  const loadAgents = async () => {
    try {
      const res = await fetch("/api/agents");
      const data = await res.json();
      setAvailableAgents(Array.isArray(data) ? data : data.agents || []);
    } catch (e) {
      console.error("loadAgents error:", e);
    }
  };
  const startAgent = async (id, model, cwd) => {
    if (!id) return;
    try {
      setAgentOutput("");
      setActiveAgent(id);
      const res = await fetch("/api/agents/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, model, cwd }),
      });
      if (res.ok) {
        setAgentRunning(true);
        subscribeAgentStream();
      } else {
        const data = await res.json().catch(() => ({}));
        setAgentOutput(data.error || "Gagal start agent");
        setActiveAgent("");
      }
    } catch (e) {
      console.error("startAgent error:", e);
    }
  };
  const sendToAgent = async (text) => {
    if (!text.trim() || !activeAgent) return;
    try {
      await fetch("/api/agents/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeAgent, text: text + "\n" }),
      });
    } catch (e) {
      console.error("sendToAgent error:", e);
    }
  };
  const stopAgent = async () => {
    try {
      await fetch("/api/agents/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeAgent }),
      });
      setAgentRunning(false);
      if (agentEsRef.current) {
        agentEsRef.current.close();
        agentEsRef.current = null;
      }
    } catch (e) {
      console.error("stopAgent error:", e);
    }
  };
  const subscribeAgentStream = () => {
    if (agentEsRef.current) {
      agentEsRef.current.close();
    }
    const es = new EventSource("/api/agents/stream");
    agentEsRef.current = es;
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type === "output" || d.type === "text") {
          setAgentOutput((prev) => prev + (d.text || d.content || "") + "\n");
        } else if (d.type === "done" || d.type === "end") {
          setAgentRunning(false);
          es.close();
          agentEsRef.current = null;
        } else if (d.type === "error") {
          setAgentOutput(
            (prev) => prev + "[error] " + (d.message || "") + "\n",
          );
          setAgentRunning(false);
          es.close();
          agentEsRef.current = null;
        }
      } catch (_) {
        setAgentOutput((prev) => prev + ev.data + "\n");
      }
    };
    es.onerror = () => {
      es.close();
      agentEsRef.current = null;
    };
  };
  const loadSavedChats = () => {
    try {
      setSavedChats(JSON.parse(localStorage.getItem("quantum_chats") || "[]"));
    } catch (e) {}
  };
  const restoreChat = (chat) => {
    setMessages(chat.messages);
    setHistory(chat.history || []);
    setShowHistory(false);
    setView("chat");
  };
  const deleteChat = (id) => {
    try {
      const list = JSON.parse(localStorage.getItem("quantum_chats") || "[]");
      const updated = list.filter((c) => c.id !== id);
      localStorage.setItem("quantum_chats", JSON.stringify(updated));
      setSavedChats(updated);
    } catch (e) {}
  };
  const runTerminalCommand = async (command = null) => {
    const cmd = (command === null ? terminalInput : command).trim();
    if (!cmd) return;
    setTerminalLoading(true);
    try {
      const res = await fetch("/api/bash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
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

  const handleSlashCommand = async (content) => {
    const trimmed = content.trim();
    if (!trimmed.startsWith("/")) return false;
    const parts = trimmed.slice(1).split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const args = parts.slice(1);
    if (cmd === "terminal" || cmd === "term" || cmd === "bash") {
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === "help") {
        setTerminalOpen(true);
        setStatus("Gunakan /terminal run <perintah>, /terminal open, /terminal close");
        return true;
      }
      if (sub === "open") {
        setTerminalOpen(true);
        setStatus("Terminal sudah terbuka.");
        return true;
      }
      if (sub === "close" || sub === "exit" || sub === "quit") {
        setTerminalOpen(false);
        setStatus("Terminal ditutup.");
        return true;
      }
      if (sub === "toggle") {
        setTerminalOpen((v) => !v);
        setStatus("Status terminal diperbarui.");
        return true;
      }
      if (sub === "run") {
        const command = args.slice(1).join(" ");
        if (!command) {
          setTerminalOpen(true);
          setStatus("Terminal siap. Ketik perintah untuk mulai.");
          return true;
        }
        setTerminalOpen(true);
        await runTerminalCommand(command);
        return true;
      }
      const command = args.join(" ");
      if (command) {
        setTerminalOpen(true);
        await runTerminalCommand(command);
      } else {
        setTerminalOpen(true);
        setStatus("Terminal sudah terbuka.");
      }
      return true;
    }
    return false;
  };
  const terminal = {
    input: terminalInput,
    setInput: setTerminalInput,
    output: terminalOutput,
    setOutput: setTerminalOutput,
    loading: terminalLoading,
    setLoading: setTerminalLoading,
    run: runTerminalCommand,
  };
  const lastProject = useRef(null);
  const scrollRef = useRef(null);
  const ctrlRef = useRef(null);
  const toggleCanvas = () =>
    _setCanvasAuto((v) => {
      const nv = !v;
      if (nv) {
        if (lastProject.current)
          _setCanvas(lastProject.current); // turning on reopens last web output
        else _setCanvas({ doc: CANVAS_BUILDING, run: null }); // show split immediately even without prior content
      }
      if (!nv) {
        _setCanvas(null);
        lastProject.current = null;
      } // turning off closes the split AND clears cached result
      return nv;
    });
  const openCanvas = (text, run) => {
    // manual open from a message
    const p = buildPreview(text);
    if (!p.has) return;
    const state = p.flutter
      ? {
          flutter: p.source,
          doc: p.a2ui ? A2UI_STREAMING : FLUTTER_COMPILING,
          files: p.files,
        }
      : { doc: p.doc || FLUTTER_COMPILING, run };
    lastProject.current = state;
    _setCanvas(state);
    _setCanvasAuto(true);
  };
  const onDividerDown = (e) => {
    e.preventDefault();
    const move = (ev) => {
      const w = window.innerWidth;
      const pct = Math.min(72, Math.max(28, ((w - ev.clientX) / w) * 100));
      setCanvasPct(pct);
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };
  const onTerminalDividerDown = (e) => {
    e.preventDefault();
    const move = (ev) => {
      const w = window.innerWidth;
      const pct = Math.min(60, Math.max(15, ((w - ev.clientX) / w) * 100));
      setTerminalPct(pct);
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };
  const startPicker = useVisualPicker();
  const doSendRef = useRef(void 0);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("quantum_theme", theme);
    } catch (e) {}
  }, [theme]);

  const loadModels = useCallback(async () => {
    let list = [];
    try {
      list = await (await fetch("/models")).json();
    } catch (e) {}
    const opts = list.map((m) => ({
      value: String(m.port),
      label: m.name + (m.size ? " � " + fmtSize(m.size) : ""),
      default: m.default,
    }));
    let cloud = getCloud();
    // Hydrate from server-configured providers (key stays server-side) when there is
    // no stored cloud OR the stored provider is no longer configured (e.g. stale key).
    try {
      const provs = await (await fetch("/cloud-providers")).json();
      if (Array.isArray(provs) && provs.length) {
        const pick =
          provs.find((p) => p.provider === "opencode") ||
          provs.find((p) => p.provider === "nvidia") ||
          provs.find((p) => p.provider === "gemini") ||
          provs.find((p) => p.provider === "puter") ||
          provs[0];
        // Only override if the user hasn't explicitly set a local key or custom baseUrl.
        // If they have, we respect their choice.
        const hasUserConfig = cloud && (cloud.key || cloud.baseUrl);
        if (!hasUserConfig) {
          if (
            !cloud ||
            cloud.provider !== pick.provider ||
            cloud.model !== pick.model
          ) {
            cloud = {
              provider: pick.provider,
              name: pick.name,
              model: pick.model,
            };
            setCloudLS(cloud);
          }
        }
      }
    } catch (e) {}
    const hasCloud = cloud && (cloud.key || cloud.provider);
    if (hasCloud)
      opts.push({
        value: "cloud",
        label:
          (cloud.model || cloud.name || cloud.provider || "").replace(/-/g, " ") +
          (cloud.key ? " •" + cloud.key.slice(-4) : ""),
      });
    if (!opts.length)
      opts.push({ value: "", label: "Belum ada model", disabled: true });
    setModels(opts);
    const def = hasCloud
      ? "cloud"
      : (opts.find((o) => o.default) || opts[0]).value;
    setModelVal((v) => (v && opts.some((o) => o.value === v) ? v : def));
    setStatus(
      hasCloud
        ? "cloud: " + (cloud.name || cloud.provider)
        : opts.length
          ? "siap"
          : "Jalankan start-models",
    );
  }, [cloudVersion]);
  useEffect(() => {
    loadModels();
  }, [cloudVersion]);
  // Warn if server isn't running (for browser users, not Electron)
  useEffect(() => {
    if (!IPC) {
      checkServerHealth().then((ok) => {
        if (!ok) setStatus("Jalankan 'npm start' di terminal.");
      });
    }
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const labelOf = (v) => (models.find((m) => m.value === v) || {}).label || v;

  const doSend = async (content, display, hitlData = null) => {
    if (!content && !hitlData) return;
    const trimmedContent = content.trim();
    if (trimmedContent.toLowerCase() === "/openclaw" || trimmedContent.toLowerCase().startsWith("/openclaw ")) {
      if (busy) return;
      const openclawMessage = trimmedContent.replace(/^\/openclaw\b/i, "").trim();
      if (!openclawMessage) {
        setMessages((m) => [
          ...m,
          { role: "user", text: display || content },
          { role: "model", text: "Pesan /openclaw tidak boleh kosong. Contoh: /openclaw ringkas project ini" },
        ]);
        setStatus("OpenClaw butuh pesan");
        return;
      }
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setBusy(true);
      setStatus("Running OpenClaw...");
      setMessages((m) => [
        ...m,
        { role: "user", text: display || content },
        { role: "model", text: "Running OpenClaw..." },
      ]);
      try {
        const res = await runOpenClawChat(openclawMessage, ctrl.signal);
        const reply = res.text || res.raw || "OpenClaw selesai tanpa output.";
        setMessages((m) => {
          const c = m.slice();
          c[c.length - 1] = { role: "model", text: reply };
          return c;
        });
        setHistory((h) => [
          ...h,
          { role: "user", content },
          { role: "assistant", content: reply },
        ]);
        setStatus("OpenClaw selesai");
      } catch (e) {
        if (e.name === "AbortError") {
          setStatus("dibatalkan");
        } else {
          const msg = "[OpenClaw error: " + e.message + "]";
          setMessages((m) => {
            const c = m.slice();
            c[c.length - 1] = { role: "model", text: msg };
            return c;
          });
          setStatus("OpenClaw error");
        }
      } finally {
        ctrlRef.current = null;
        setBusy(false);
      }
      return;
    }
    if (content.trim().startsWith("/") && (await handleSlashCommand(content))) return;
    if (busy && !hitlData) return;
    let newHist = history;
    if (!hitlData) {
      newHist = [...history, { role: "user", content }];
      setHistory(newHist);
    }
    setBusy(true);
    setStatus("typing");
    console.log("[doSend] Setting busy=true, content:", content);
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    // ONE smart chat: with a tool-capable cloud, the model itself decides (tool_choice
    // auto) whether to just answer (normal chat) or use tools (a command/edit)  like
    // chatting with Claude. Local/bridge endpoints can't do tools ? plain chat.
    const _cl = getCloud();
    const _localCloud =
      _cl && _cl.baseUrl && /(127\.0\.0\.1|localhost)/.test(_cl.baseUrl);
    
    // Deteksi apakah input adalah instruksi tugas atau chat biasa
    const TASK_KEYWORDS = /\b(code|coding|program|script|function|fungsi|kelas|class|algorithm|algoritma|buat(?:kan)?|tulis(?:kan)?|implement|debug|fix|perbaiki|refactor|optimi[sz]e|sort|parse|regex|api|loop|array|string|hitung|kalkulator|baca|file|folder|cari|search|hapus|edit|ubah|ganti|tambah(?:kan)?|jalankan|eksekusi|test|bantu)\b/i;
    const isTask = TASK_KEYWORDS.test(content);
    
    // Gunakan agent HANYA jika model cloud DAN (terdeteksi sebagai tugas ATAU ini adalah HITL resume)
    const useAgent = modelVal === "cloud" && !_localCloud && (isTask || !!hitlData);
    if (!canvasAuto && !useAgent) {
      // Bridge / local model: plain conversational chat (text streaming, no function-calling).
      setMessages((m) => [
        ...m,
        { role: "user", text: display || content },
        { role: "model", text: "", run: null },
      ]);
      try {
        const res = await streamChat(
          reqFor(modelVal, getCloud(), newHist),
          (t, run) => {
            setMessages((m) => {
              const c = m.slice();
              c[c.length - 1] = { role: "model", text: t, run };
              return c;
            });
          },
          ctrl.signal,
        );
        setHistory((h) => [...h, { role: "assistant", content: res.text }]);
        setStatus("siap");
        // Auto-buka Studio jika response berisi A2UI spec (hanya jika Web Dev sudah aktif)
        if (res.text && canvasAutoRef.current) {
          const proj = buildPreview(res.text);
          if (proj.has && proj.flutter) {
            const fstate = {
              flutter: proj.source,
              doc: proj.a2ui ? A2UI_STREAMING : FLUTTER_COMPILING,
              files: proj.files,
            };
            lastProject.current = fstate;
            _setCanvas(fstate);
          }
        }
        console.log("[doSend] Setting busy=false (normal chat complete)");
        setBusy(false); // Reset busy state after stream completes
      } catch (e) {
        if (e.name !== "AbortError") setStatus("error: " + e.message);
        else setStatus("dibatalkan");
        console.log("[doSend] Setting busy=false (normal chat error)");
        setBusy(false);
      }
    } else if (!canvasAuto) {
      // Agentic chat (like Claude Code): the model answers OR uses tools to edit
      // WOLFSPACE's own source. The live process renders as a clean timeline.
      if (!hitlData) {
        setMessages((m) => [
          ...m,
          { role: "user", text: display || content },
          { role: "agent", agent: { events: [], busy: true } },
        ]);
      } else {
        setMessages((m) => {
          const c = m.slice();
          const last = { ...c[c.length - 1] };
          last.agent = { ...last.agent, busy: true };
          c[c.length - 1] = last;
          return c;
        });
      }
      const upd = (patch) =>
        setMessages((m) => {
          const c = m.slice();
          const last = { ...c[c.length - 1] };
          last.agent = { ...last.agent, ...patch };
          c[c.length - 1] = last;
          return c;
        });
      const evlist = [];
      const phaseNodes = [];
      let think = "";
      let adoneSent = false;
      let waitingForInput = false;
      let hadError = false;
      try {
        const curEffort = (getCloud() && typeof getCloud().effort !== 'undefined') ? Number(getCloud().effort) : (parseInt(localStorage.getItem("quantum_effort") || "1", 10) || 1);
        await streamSelfAgent(
          { history: newHist, cloud: getCloud(), port: modelVal, effort: curEffort, ...hitlData },
          (j) => {
            if (j.t === "backup") upd({ backup: j.dir });
            else if (j.t === "step") {
              think = "";
              upd({ step: j.n, thinking: "" });
            } else if (j.t === "tok") {
              think += j.c;
              upd({ thinking: think });
            } else if (j.t === "thought") {
              think = "";
              evlist.push({ type: "thought", kind: j.tool, arg: j.c, ok: j.ok, output: j.c });
              upd({ events: [...evlist], thinking: "" });
            } else if (j.t === "act") {
              think = "";
              evlist.push({
                type: "act",
                kind: j.kind,
                arg: j.arg,
                ok: j.ok,
                output: j.output,
              });
              upd({ events: [...evlist], thinking: "" });
            } else if (j.t === "phase") {
              phaseNodes.push({
                phase: j.phase,
                tag: j.tag,
                status: j.status,
                time: j.time,
                attrs: j.attrs,
                chip: j.chip,
                evidence: j.evidence,
                children: j.children,
              });
              upd({ phaseNodes: [...phaseNodes] });
            } else if (j.t === "hitl") {
              adoneSent = true;
              waitingForInput = true;
              setHitlRequest({
                kind: 'hitl',
                title: j.request.title,
                code: j.request.code,
                thread_id: j.thread_id,
                options: [
                  { value: "allow_once", text: "Izinkan sekali ini" },
                  { value: "deny", text: "Tolak (Minta agen mencari cara lain)" }
                ]
              });
            } else if (j.t === "ask") {
              adoneSent = true;
              waitingForInput = true;
              setHitlRequest({
                kind: 'ask',
                title: "Pertanyaan dari Agent",
                code: j.question || "",
                thread_id: j.thread_id || null,
                options: (j.choices || []).map(c => ({ value: c, text: c }))
              });
              upd({ thinking: "Menunggu jawaban Anda...", busy: true });
            } else if (j.t === "adone") {
              if (j.hitlPending && j.thread_id) {
                // Agent paused for HITL — keep busy=true, just ensure thread_id is updated
                adoneSent = true;
                waitingForInput = true;
                setHitlRequest(prev => prev ? { ...prev, thread_id: j.thread_id } : {
                  kind: 'hitl',
                  title: "Menunggu Persetujuan",
                  code: "",
                  thread_id: j.thread_id,
                  options: [
                    { value: "allow_once", text: "Izinkan sekali ini" },
                    { value: "deny", text: "Tolak" }
                  ]
                });
                upd({ thinking: "Menunggu persetujuan Anda...", busy: true });
                return; // Don't set done/busy=false
              }
              adoneSent = true;
              upd({
                busy: false,
                done: true,
                summary: j.summary,
                editCount: j.edits,
                backup: j.backup,
                run: j.run,
                phase: j.phase,
                phaseNodes: [...phaseNodes],
              });
              setHistory((h) => [
                ...h,
                { role: "assistant", content: j.summary || "" },
              ]);
            } else if (j.t === "err") {
              hadError = true;
              evlist.push({ type: "err", m: j.m });
              upd({ events: [...evlist], busy: false, error: true });
            }
          },
          ctrl.signal,
        );
      } catch (e) {
        if (e.name !== "AbortError")
          upd({
            busy: false,
            error: true,
            events: [...evlist, { type: "err", m: e.message }],
          });
      }
      console.log("[doSend] Setting busy=false (agent stream complete)");
      // If no "adone" event was sent, provide a default summary based on events
      if (!adoneSent) {
        if (!hadError) {
          const summary =
            evlist.length > 0
              ? `Selesai. ${evlist.length} operasi dieksekusi.`
              : "Selesai. Tidak ada operasi yang dilakukan.";
          upd({ busy: false, done: true, summary });
          setHistory((h) => [...h, { role: "assistant", content: summary }]);
        } else {
          upd({ busy: false });
        }
      }
      if (!waitingForInput) {
        setBusy(false); // Reset global busy state only when not waiting for HITL/answer
      }
      setStatus("siap");
    } else {
      setMessages((m) => [
        ...m,
        { role: "user", text: display || content },
        { role: "model", text: "", run: null },
      ]);
      if (canvasAuto) _setCanvas({ doc: CANVAS_BUILDING, run: null }); // Web Dev ? split opens immediately
      let lastCanvasT = 0;
      try {
        const res = await streamChat(
          reqFor(modelVal, getCloud(), newHist, canvasAuto),
          (t, run) => {
            setMessages((m) => {
              const c = m.slice();
              c[c.length - 1] = { role: "model", text: t, run };
              return c;
            });
            {
              const now = Date.now();
              if (now - lastCanvasT > 450) {
                const p = canvasAuto ? buildPreview(t) : { has: false }; // web/flutter preview only in Web Dev mode
                if (p.has) {
                  lastCanvasT = now;
                  _setCanvas(
                    p.flutter
                      ? {
                          flutter: p.streaming ? null : p.source,
                          doc: p.a2ui ? A2UI_STREAMING : FLUTTER_STREAMING,
                          run: null,
                          files: p.files,
                        } // A2UI: only send complete JSON to studio; incomplete JSON crashes Flutter jsonDecode
                      : { doc: p.doc, run: null, files: p.files },
                  );
                } // web: live preview is cheap, keep it
                else if (run) {
                  lastCanvasT = now;
                  _setCanvas({ doc: consoleDoc(run), run });
                } // any executed code ? live terminal view
              }
            }
          },
          ctrl.signal,
        );
        setMessages((m) => {
          const c = m.slice();
          c[c.length - 1] = { role: "model", text: res.text, run: res.run };
          return c;
        });
        setHistory((h) => [...h, { role: "assistant", content: res.text }]);
        setStatus(
          res.run ? (res.run.ok ? "Terverifikasi" : "Belum lolos pemeriksaan") : "Siap",
        );
        const proj = buildPreview(res.text); // finalize the live Canvas
        console.log(
          "[doSend] final buildPreview:",
          proj.has ? (proj.flutter ? "flutter/a2ui" : "web") : "none",
          "| canvasRef.flutter:",
          !!canvasRef.current?.flutter,
        );
        if (proj.has) {
          if (proj.flutter) {
            const fstate = {
              flutter: proj.source,
              doc: proj.a2ui ? A2UI_STREAMING : FLUTTER_COMPILING,
              files: proj.files,
            };
            lastProject.current = fstate;
            _setCanvas(fstate);
          } else {
            const wstate = { doc: proj.doc, run: res.run, files: proj.files };
            lastProject.current = wstate;
            _setCanvas(wstate);
          }
        } else if (res.run) {
          // No web/flutter content but code WAS executed � show the terminal in Canvas
          _setCanvas({ doc: consoleDoc(res.run), run: res.run });
        } else if (canvasAuto && !canvasRef.current?.flutter) _setCanvas(null); // only close if no A2UI was detected during streaming
      } catch (e) {
        if (e.name !== "AbortError") {
          setMessages((m) => {
            const c = m.slice();
            c[c.length - 1] = {
              role: "model",
              text: "[error: " + e.message + "]",
            };
            return c;
          });
          setStatus("error");
          console.log("[doSend] Setting busy=false (canvas auto error)");
          setBusy(false);
        } else setStatus("dibatalkan");
        console.log("[doSend] Setting busy=false (canvas auto abort)");
        setBusy(false);
      }
    }
    ctrlRef.current = null;
    setBusy(false);
  };
  doSendRef.current = doSend;
    const cancel = () => {
    console.log("[cancel] Aborting and setting busy=false");
    if (ctrlRef.current) ctrlRef.current.abort();
    setBusy(false);
    setStatus("dibatalkan");
  };
  const reset = () => {
    setMessages([]);
    setHistory([]);
    setBusy(false);
    setStatus("Siap.");
  };
  const saveChat = () => {
    if (messages.length === 0) return;
    try {
      const saved = JSON.parse(localStorage.getItem("quantum_chats") || "[]");
      saved.push({
        id: Date.now(),
        title: messages[0]?.text?.slice(0, 60) || "Chat",
        messages: messages,
        history: history,
        savedAt: new Date().toISOString(),
      });
      localStorage.setItem("quantum_chats", JSON.stringify(saved));
      loadSavedChats();
    } catch (e) {
      /* ignore storage errors */
    }
  };

  return (
    <div className={"app has-sidebar" + (sbCollapsed ? " sb-collapsed" : "")}>
      <Sidebar
        collapsed={sbCollapsed}
        setCollapsed={setSbCollapsed}
        view={view}
        setView={setView}
        onNewChat={() => {
          saveChat();
          reset();
          setView("chat");
          loadSavedChats();
        }}
        onVisualPicker={() => {
          startPicker();
        }}
        canvasAuto={canvasAuto}
        onToggleCanvas={toggleCanvas}
        theme={theme}
        setTheme={setTheme}
        terminalOpen={terminalOpen}
        setTerminalOpen={setTerminalOpen}
        terminal={terminal}
        savedChats={savedChats}
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        restoreChat={restoreChat}
        deleteChat={deleteChat}
        loadSavedChats={loadSavedChats}
        onAgentRunner={() => {
          setAgentRunnerOpen(true);
          loadAgents();
        }}
      />
      <div className="page-container">
        <div
          className={"page chat-page " + (view === "chat" ? "active" : "exit")}
        >
          <TopBar
            models={models}
            modelVal={modelVal}
            setModelVal={setModelVal}
            panelOpen={panelOpen}
            setPanelOpen={setPanelOpen}
            onReset={reset}
            status={status}
            theme={theme}
            setTheme={setTheme}
            terminalOpen={terminalOpen}
            setTerminalOpen={setTerminalOpen}
          />
          <div className="chat-split">
            <div
              className="chat-col"
              style={{
                flex: terminalOpen && canvas
                  ? "1 1 " + (100 - terminalPct - canvasPct) + "%"
                  : terminalOpen
                    ? "1 1 " + (100 - terminalPct) + "%"
                    : canvas
                      ? "1 1 " + (100 - canvasPct) + "%"
                      : "1 1 100%",
              }}
            >
              <div className="chat-scroll" ref={scrollRef}>
                {messages.length === 0 ? (
                  <div className="chat-inner">
                  </div>
                ) : (
                  <div className="chat-inner">
                    {messages.map((m, i) => (
                      <Message
                        key={i}
                        msg={m}
                        onOpenCanvas={openCanvas}
                      />
                    ))}
                  </div>
                )}
              </div>
            <HitlModal request={hitlRequest} onResolve={handleHitlResolve} />
                            <Composer
                models={models}
                modelVal={modelVal}
                setModelVal={setModelVal}
                onSend={(t) => doSend(t)}
                onCancel={cancel}
                busy={busy || agentRunning}
                onAgentCli={() => setAgentRunnerOpen(true)}
              />
            </div>
            {terminalOpen && (
              <>
                <div className="split-divider" onMouseDown={onTerminalDividerDown} />
                <div className="terminal-col" style={{ flex: "0 0 " + terminalPct + "%" }}>
                  <div className="terminal-panel">
                    <div className="terminal-header">
                      <span>Terminal</span>
                      <button
                        className="terminal-close"
                        onClick={() => setTerminalOpen(false)}
                        title="Tutup terminal"
                      >
                        ?
                      </button>
                    </div>
                    <div className="terminal-output">
                      {terminal.output || ""}
                    </div>
                  </div>
                </div>
              </>
            )}
            {canvas && (
              <>
                <div className="split-divider" onMouseDown={onDividerDown} />
                <div
                  className="canvas-col"
                  style={{ flex: "0 0 " + canvasPct + "%" }}
                >
                  {canvas.flutter ? (
                    <StudioFrame
                      source={canvas.flutter}
                      onClose={() => {
                        _setCanvas(null);
                        _setCanvasAuto(false);
                        lastProject.current = null;
                      }}
                    />
                  ) : (
                    <CanvasPanel
                      project={canvas}
                      modelVal={modelVal}
                      onClose={() => {
                        _setCanvas(null);
                        _setCanvasAuto(false);
                        lastProject.current = null;
                      }}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <div
          className={"page hub-page " + (view === "hub" ? "active" : "enter")}
        >
          {view === "hub" && (
            <ModelHubView
              onBack={() => setView("chat")}
              theme={theme}
              setTheme={setTheme}
              onChanged={loadModels}
              onUse={(port) => {
                if (port) setModelVal(String(port));
                loadModels();
                setView("chat");
              }}
            />
          )}
        </div>
        <div
          className={
            "page hub-page " + (view === "settings" ? "active" : "enter")
          }
        >
          {view === "settings" && (
            <SettingsView
              onBack={() => setView("chat")}
              onSaved={loadModels}
              onCloudChanged={() => setCloudVersion((v) => v + 1)}
            />
          )}
        </div>
        <div
          className={
            "page hub-page " + (view === "agents" ? "active" : "enter")
          }
        >
          {view === "agents" && (
            <AgentRunnerView
              onBack={() => setView("chat")}
              agents={availableAgents}
              activeAgent={activeAgent}
              agentRunning={agentRunning}
              agentOutput={agentOutput}
              onLoadAgents={loadAgents}
              onStart={startAgent}
              onStop={stopAgent}
              onSend={sendToAgent}
              currentModel={modelVal}
            />
          )}
        </div>
      </div>
    </div>
  );
}
/* ============================================================
   Agent Runner View
   ============================================================ */
function AgentRunnerView({
  onBack,
  agents,
  activeAgent,
  agentRunning,
  agentOutput,
  onLoadAgents,
  onStart,
  onStop,
  onSend,
  currentModel,
}) {
  // Command Palette state (VS Code fork)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState("");
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  
  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!commandSearch.trim()) return COMMANDS;
    return COMMANDS.filter(cmd => 
      cmd.label.toLowerCase().includes(commandSearch.toLowerCase())
    );
  }, [commandSearch]);
  
  // Execute selected command
  const runSelectedCommand = () => {
    const cmd = filteredCommands[selectedCommandIndex];
    if (cmd) {
      cmd.action();
      setCommandPaletteOpen(false);
      setCommandSearch("");
    }
  };
  
  // Keyboard shortcut for Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        setCommandSearch("");
        setSelectedCommandIndex(0);
      }
      // Navigate in command palette
      if (commandPaletteOpen) {
        if (e.key === 'Escape') {
          setCommandPaletteOpen(false);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedCommandIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedCommandIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
          runSelectedCommand();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, selectedCommandIndex, filteredCommands]);

  const [selected, setSelected] = useState("");
  const [fullScreenAgent, setFullScreenAgent] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState("");
  const [localRunning, setLocalRunning] = useState(false);
  const xtermRef = useRef(null); // DOM container for xterm.js
  const termRef = useRef(null); // xterm.js Terminal instance
  const fitRef = useRef(null); // xterm.js FitAddon
  const esRef = useRef(null); // EventSource for SSE
  const localRunningRef = useRef(false); // mirror of localRunning for closures
  const ensureStartedRef = useRef(null); // ref to ensureStarted function
  const inputQueueRef = useRef([]); // queue of pending keystrokes
  const sendingRef = useRef(false); // lock for sequential send
  const startingRef = useRef(false); // prevent concurrent agent starts
  const runnerAgents = agents.filter((a) => (a.id || a.name) !== "WOLFSPACE");

  const getAgentStyle = (id) => {
    if (id === "WOLFSPACE") {
      return {
        background: "rgba(139,109,255,0.12)",
        color: "#8b6dff",
        padding: "6px",
        borderRadius: "8px",
        display: "inline-flex",
      };
    }
    if (id === "opencode") {
      return {
        background: "rgba(16,185,129,0.12)",
        color: "#10b981",
        padding: "6px",
        borderRadius: "8px",
        display: "inline-flex",
      };
    }
    if (id === "claude") {
      return {
        background: "rgba(217,119,87,0.12)",
        color: "#D97757",
        padding: "6px",
        borderRadius: "8px",
        display: "inline-flex",
      };
    }
    return {};
  };

  const getAgentIcon = (id) => {
    if (id === "WOLFSPACE") return SB.quantumAgent;
    if (id === "opencode") return SB.opencode;
    if (id === "claude") return SB.claude;
    return SB.runner;
  };

  useEffect(() => {
    onLoadAgents();
  }, []);

  // Sync localRunningRef
  useEffect(() => {
    localRunningRef.current = localRunning;
  }, [localRunning]);

  // Set ensureStartedRef
  useEffect(() => {
    ensureStartedRef.current = ensureStarted;
  });

  // -- xterm.js init when fullscreen opens --
  useEffect(() => {
    if (!fullScreenAgent || !xtermRef.current) return;
    // Cleanup any existing terminal
    if (termRef.current) {
      try {
        termRef.current.dispose();
      } catch (_) {}
      termRef.current = null;
    }
    const term = new window.Terminal({
      cols: 120,
      rows: 40,
      scrollback: 10000,
      altClickMovesCursor: true,
      fontFamily: 'Consolas, "Cascadia Code", monospace',
      fontSize: 13,
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
      },
      cursorBlink: true,
      allowProposedApi: true,
    });
    // xterm.js: FitAddon should be provided by xterm-addon-fit.
    // Some builds expose it as a named export (FitAddon) rather than window.FitAddon.
    const FitAddonCtor =
      window.FitAddon?.FitAddon ||
      window.FitAddon ||
      window.fitAddon?.FitAddon ||
      window.xterm?.FitAddon;
    if (!FitAddonCtor) throw new Error('FitAddon not found/loaded');
    const fit = new FitAddonCtor();
    term.loadAddon(fit);
    const agentId = fullScreenAgent
      ? fullScreenAgent.id || fullScreenAgent.name
      : "";
    term.open(xtermRef.current);
    // Send resize to backend PTY so CLI process (e.g. opencode) adjusts its layout
    term.onResize(({ cols, rows }) => {
      if (agentId) {
        fetch("/api/agents/resize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: agentId, cols, rows }),
        }).catch(() => {});
      }
    });
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    term.focus();

    // -- Scroll support: Hanya izinkan scroll di normal buffer, tidak di alternate buffer (TUI)
    // Alternate buffer (yang dipakai opencode CLI/TUI) harus dikontrol penuh oleh aplikasi agar tampilan tidak rusak
    let wheelCleanup = () => {};
    try {
      const el = xtermRef.current;
      if (el && term) {
        const onWheel = (e) => {
          try {
            const buf = term.buffer && term.buffer.active;
            // Hanya proses scroll manual jika BUKAN alternate buffer (TUI)
            // Di alternate buffer, biarkan TUI yang menangani semua input agar tampilan tidak pecah
            if (buf && buf.type === 'alternate') return;
          } catch (_) {}
        };
        el.addEventListener('wheel', onWheel, { capture: true, passive: true });
        wheelCleanup = () => {
          try { el.removeEventListener('wheel', onWheel, { capture: true }); } catch (_) {}
        };
      }
    } catch (_) {}

    // xterm input ? auto-start agent on first keystroke, then send to PTY

    // -- Queue-based sender -- ensures sequential, ordered delivery to PTY
    const flushQueue = async () => {
      if (sendingRef.current) return; // already flushing
      sendingRef.current = true;
      try {
        // Wait for agent start if it's in progress
        while (startingRef.current) {
          await new Promise((r) => setTimeout(r, 50));
        }
        // Auto-start if not running
        if (!localRunningRef.current && agentId) {
          startingRef.current = true;
          const ok = await ensureStartedRef.current(agentId);
          startingRef.current = false;
          if (!ok) {
            sendingRef.current = false;
            return;
          }
          // Let PTY settle
          await new Promise((r) => setTimeout(r, 300));
        }
        // Drain queue � send all buffered chars as one batch
        while (inputQueueRef.current.length > 0) {
          const batch = inputQueueRef.current.splice(0).join("");
          await fetch("/api/agents/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: agentId, text: batch }),
          });
          // Brief pause to let more chars accumulate if user is still typing fast
          await new Promise((r) => setTimeout(r, 10));
        }
      } catch (_) {}
      sendingRef.current = false;
      // If more chars arrived during the last send, flush again
      if (inputQueueRef.current.length > 0) flushQueue();
    };

    term.onData((data) => {
      if (!agentId) return;
      inputQueueRef.current.push(data);
      flushQueue();
    });

    // Debounced resize � prevents flooding PTY with rapid SIGWINCH
    let resizeDebounce = null;
    const doFit = () => {
      clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(() => {
        try {
          fit.fit();
        } catch (_) {}
      }, 150);
    };
    const ro = new ResizeObserver(() => doFit());
    ro.observe(xtermRef.current);
    window.addEventListener("resize", doFit);

    return () => {
      clearTimeout(resizeDebounce);
      ro.disconnect();
      window.removeEventListener("resize", doFit);
      wheelCleanup();
      if (termRef.current) {
        try {
          termRef.current.dispose();
        } catch (_) {}
        termRef.current = null;
      }
    };
  }, [fullScreenAgent]);

  // -- SSE stream: raw PTY output ? xterm.js --
  const subscribeStream = (agentId) => {
    if (esRef.current) {
      try {
        esRef.current.close();
      } catch (_) {}
    }
    const es = new EventSource("/api/agents/stream");
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type === "output" && d.id === agentId) {
          const raw = d.text || "";
          if (raw && termRef.current) termRef.current.write(raw);
        } else if (d.type === "done" && d.id === agentId) {
          setLocalRunning(false);
        } else if (d.type === "error" && d.id === agentId) {
          if (termRef.current)
            termRef.current.write("\n[ERROR] " + (d.message || "") + "\n");
          setLocalRunning(false);
        }
      } catch (_) {}
    };
    es.onerror = () => {
      esRef.current = null;
    };
  };

  // Open full-screen when card clicked
  const openFullScreen = (agent) => {
    const id = agent.id || agent.name;
    setFullScreenAgent(agent);
    setSelected(id);
    setInstallMsg("");
  };

  const closeFullScreen = () => {
    if (esRef.current) {
      try {
        esRef.current.close();
      } catch (_) {}
      esRef.current = null;
    }
    if (termRef.current) {
      try {
        termRef.current.dispose();
      } catch (_) {}
      termRef.current = null;
    }
    // Stop agent if running
    if (localRunning && selected) {
      fetch("/api/agents/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected }),
      }).catch(() => {});
    }
    setFullScreenAgent(null);
    setLocalRunning(false);
  };

  // Start agent � auto-start on first keystroke if not running
  const ensureStarted = async (agentId) => {
    const id = agentId || selected;
    if (localRunningRef.current || !id) return true;
    // Mark running immediately to prevent concurrent starts
    localRunningRef.current = true;
    try {
      const res = await fetch("/api/agents/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          model: currentModel || "",
          cwd: "",
          cols: termRef.current?.cols,
          rows: termRef.current?.rows,
        }),
      });
      if (res.ok) {
        setLocalRunning(true);
        subscribeStream(id);
        // Sync PTY size to actual xterm.js dimensions (PTY spawns at 120x40 but xterm may differ)
        if (termRef.current) {
          const { cols, rows } = termRef.current;
          fetch("/api/agents/resize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, cols, rows }),
          }).catch(() => {});
        }
        return true;
      } else {
        localRunningRef.current = false;
        const data = await res.json().catch(() => ({}));
        if (termRef.current)
          termRef.current.write(
            "\n? " + (data.error || "Gagal start agent") + "\n",
          );
        return false;
      }
    } catch (e) {
      localRunningRef.current = false;
      if (termRef.current)
        termRef.current.write("\n? " + e.message + "\n");
      return false;
    }
  };

  // Stop agent
  const handleStop = async () => {
    try {
      await fetch("/api/agents/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected }),
      });
    } catch (_) {}
    setLocalRunning(false);
    if (esRef.current) {
      try {
        esRef.current.close();
      } catch (_) {}
      esRef.current = null;
    }
  };

  // Install CLI
  const handleInstall = async () => {
    setInstalling(true);
    setInstallMsg("Installing...");
    try {
      const res = await fetch("/api/agents/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected }),
      });
      const data = await res.json();
      if (data.ok) {
        setInstallMsg("? Installed successfully!");
        setTimeout(() => onLoadAgents(), 500);
      } else {
        setInstallMsg("? " + (data.error || "Install failed"));
      }
    } catch (e) {
      setInstallMsg("? " + e.message);
    }
    setInstalling(false);
  };

  const fsAgent = fullScreenAgent;
  const fsId = fsAgent ? fsAgent.id || fsAgent.name : "";
  const FSIcon = getAgentIcon(fsId);
  const fsAvailable = fsAgent ? fsAgent.available : false;

  return (
    <div
      className="hub"
      style={{
        background:
          "radial-gradient(1200px 600px at 80% -10%, rgba(139,109,255,0.06), transparent 60%), radial-gradient(1000px 500px at 10% 110%, rgba(59,130,246,0.05), transparent 55%), var(--bg)",
      }}
    >
      {fsAgent ? (
        /* ----------- FULL-SCREEN AGENT VIEW ----------- */
        <div className="ar-fullscreen">
          {/* Header */}
          <header className="ar-fs-header">
            {typeof fsAgent.icon === "string" &&
            (fsAgent.icon.startsWith("data:") ||
              /\.(png|svg|jpg|jpeg|gif|webp|ico)$/i.test(fsAgent.icon)) ? (
              <img
                className="ar-fs-icon"
                src={fsAgent.icon}
                alt={fsAgent.name || ""}
              />
            ) : (
                            <span className="ar-fs-icon" style={getAgentStyle(fsId)}>
                {typeof FSIcon === "function" ? FSIcon({ width: 22, height: 22 }) : FSIcon}
              </span>
            )}
            <span className="ar-fs-name">{fsAgent.name || fsId}</span>
            <span
              className={
                "ar-fs-status " +
                (localRunning ? "running" : fsAvailable ? "ready" : "")
              }
            >
              <span className="ar-fs-dot" />
              {localRunning
                ? "Berjalan"
                : fsAvailable
                  ? "Siap"
                  : "Belum terpasang"}
            </span>
            <div className="tb-spacer" />
            {localRunning && (
              <button className="ar-fs-stop-btn" onClick={handleStop}>
                � Stop
              </button>
            )}
          </header>

          {/* Body: xterm.js terminal */}
          <div className="ar-fs-body">
            <div
              className="ar-fs-terminal"
              ref={xtermRef}
              style={{ flex: 1, padding: 0, overflow: "hidden" }}
            />
            {/* -- MINI SIDEBAR -- */}
            <div className="ar-fs-sidebar-mini">
              <div className="ar-fs-section">
                <div className="ar-fs-section-label">Status</div>
                <div className="ar-fs-status-row">
                  <span
                    className={"ar-fs-badge " + (fsAvailable ? "ok" : "warn")}
                  >
                    {fsAvailable ? "Terpasang" : "Belum terpasang"}
                  </span>
                  {!fsAvailable && (
                    <button
                      className="ar-fs-install-btn"
                      onClick={handleInstall}
                      disabled={installing}
                    >
                      {installing ? "Memasang..." : "Pasang CLI"}
                    </button>
                  )}
                </div>
                {installMsg && (
                  <div className="ar-fs-install-msg">{installMsg}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ----------- GRID VIEW ----------- */
        <>
          {/* Header */}
          <header className="hub-header">
            <div className="hub-title-group">
              <span
                className="hub-hf-mark"
                style={{
                  background: "linear-gradient(135deg,#8b6dff,#6d4aff)",
                }}
              >
                {SB.runner({ width: 16, height: 16 })}
              </span>
              <span className="hub-title">Agent Runner</span>
              <span className="hub-subtitle">Multi-agent host</span>
            </div>
            <div className="tb-spacer" />
          </header>

          {/* Body */}
          <div className="hub-body">
            <div className="hub-inner">
              <div
                className="agent-runner-view"
                style={{ padding: "0", height: "auto", overflow: "visible" }}
              >
                <div>
                  <div className="agent-runner-section-label">Pilih Agent</div>
                  {runnerAgents.length === 0 ? (
                    <div className="agent-runner-empty">
                      Belum ada agent yang tersedia. Pastikan backend /api/agents
                      sedang berjalan.
                    </div>
                  ) : (
                    <div className="agent-runner-grid">
                      {runnerAgents.map((a) => {
                        const id = a.id || a.name;
                        const Icon = getAgentIcon(id);
                        return (
                          <div
                            key={id}
                            className={"agent-runner-card"}
                            onClick={() => openFullScreen(a)}
                          >
                            <div className="agent-runner-card-head">
                              <span
                                className={
                                  "agent-runner-card-icon" +
                                  (id === "WOLFSPACE"
                                    ? " agent-WOLFSPACE"
                                    : id === "opencode"
                                      ? " agent-opencode"
                                      : id === "claude"
                                        ? " agent-claude"
                                        : "")
                                }
                              >
                                {typeof Icon === "function" ? Icon({ width: 18, height: 18 }) : Icon}
                              </span>
                              <span className="agent-runner-card-name">
                                {a.name || id}
                              </span>
                              {a.available ? (
                                <span className="ar-card-badge">tersedia</span>
                              ) : (
                                <span
                                  className="ar-card-badge"
                                  style={{ color: "var(--text-faint)" }}
                                >
                                  belum terpasang
                                </span>
                              )}
                            </div>
                            <div className="agent-runner-card-desc">
                              {a.description || a.desc || "�"}
                            </div>
                            {a.model && (
                              <div className="agent-runner-card-model">
                                Model: {a.model}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      
      {/* Command Palette UI (VS Code fork) */}
      {commandPaletteOpen && (
        <div className="command-palette-overlay" onClick={() => setCommandPaletteOpen(false)}>
          <div className="command-palette" onClick={e => e.stopPropagation()}>
            <input
              type="text"
              placeholder="Cari perintah... (Ctrl+Shift+P untuk membuka)"
              value={commandSearch}
              onChange={e => { setCommandSearch(e.target.value); setSelectedCommandIndex(0); }}
              autoFocus
              className="command-palette-input"
            />
            <div className="command-palette-list">
              {filteredCommands.map((cmd, idx) => (
                <div
                  key={cmd.id}
                  className={`command-palette-item ${idx === selectedCommandIndex ? 'selected' : ''}`}
                  onClick={() => { setSelectedCommandIndex(idx); runSelectedCommand(); }}
                >
                  <span className="command-icon">{cmd.icon}</span>
                  <span className="command-label">{cmd.label}</span>
                </div>
              ))}
              {filteredCommands.length === 0 && (
                <div className="command-palette-empty">Tidak ada perintah yang cocok</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   shadcn/ui-style Components (zero-dep, Tailwind classes)
   ============================================================ */

/* --- Badge --- */
function Badge({ variant = "default", className = "", children, ...props }) {
  const variants = {
    default: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    destructive: "bg-destructive text-destructive-foreground",
    outline: "border border-border text-foreground",
    success: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant] || variants.default} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

/* --- Card --- */
function Card({ className = "", children, ...props }) {
  return (
    <div
      className={`rounded-lg border border-border bg-card text-card-foreground shadow-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
function CardHeader({ className = "", children, ...props }) {
  return (
    <div className={`flex flex-col space-y-1.5 p-4 ${className}`} {...props}>
      {children}
    </div>
  );
}
function CardTitle({ className = "", children, ...props }) {
  return (
    <h3
      className={`text-base font-semibold leading-none tracking-tight ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
}
function CardDescription({ className = "", children, ...props }) {
  return (
    <p className={`text-sm text-muted-foreground ${className}`} {...props}>
      {children}
    </p>
  );
}
function CardContent({ className = "", children, ...props }) {
  return (
    <div className={`p-4 pt-0 ${className}`} {...props}>
      {children}
    </div>
  );
}
function CardFooter({ className = "", children, ...props }) {
  return (
    <div className={`flex items-center p-4 pt-0 ${className}`} {...props}>
      {children}
    </div>
  );
}

/* --- Tabs --- */
function Tabs({ tabs, active, onChange, className = "" }) {
  return (
    <div
      className={`inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground ${className}`}
    >
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${
            active === t.value
              ? "bg-background text-foreground shadow-sm"
              : "hover:text-foreground"
          }`}
        >
          {t.icon ? <span className="mr-1.5">{t.icon}</span> : null}
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* --- Dropdown --- */
function Dropdown({ trigger, items, align = "left", className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div className={`relative inline-block ${className}`} ref={ref}>
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <div
          className={`absolute z-50 mt-1 min-w-[12rem] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md ${align === "right" ? "right-0" : "left-0"}`}
        >
          {items.map((item, i) =>
            item.separator ? (
              <div key={i} className="my-1 h-px bg-border" />
            ) : (
              <button
                key={i}
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
                className={`relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground ${
                  item.disabled ? "opacity-50 pointer-events-none" : ""
                } ${item.active ? "bg-accent/50" : ""}`}
              >
                {item.icon ? (
                  <span className="text-base">{item.icon}</span>
                ) : null}
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge ? (
                  <Badge variant="muted" className="text-xs">
                    {item.badge}
                  </Badge>
                ) : null}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* --- Dialog --- */
function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className = "",
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`relative z-50 w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-lg ${className}`}
      >
        {title && (
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        )}
        {description && (
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        )}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* --- Tooltip --- */
function Tooltip({ content, children, side = "top", className = "" }) {
  const [show, setShow] = useState(false);
  const sides = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  };
  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && content && (
        <div
          className={`absolute z-50 whitespace-nowrap rounded-md bg-popover px-2.5 py-1.5 text-xs text-popover-foreground border border-border shadow-md pointer-events-none ${sides[side]} ${className}`}
        >
          {content}
        </div>
      )}
    </div>
  );
}

/* --- Button (shadcn variants) --- */
function Button({
  variant = "default",
  size = "default",
  className = "",
  children,
  ...props
}) {
  const variants = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    destructive:
      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    outline:
      "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    link: "text-primary underline-offset-4 hover:underline",
  };
  const sizes = {
    default: "h-9 px-4 py-2",
    sm: "h-8 rounded-md px-3 text-xs",
    lg: "h-10 rounded-md px-8",
    icon: "h-9 w-9",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/* --- Input --- */
function Input({ className = "", ...props }) {
  return (
    <input
      className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

/* --- Separator --- */
function Separator({ orientation = "horizontal", className = "" }) {
  return (
    <div
      className={`${orientation === "horizontal" ? "h-px w-full" : "w-px h-full"} bg-border ${className}`}
    />
  );
}

/* --- ScrollArea --- */
function ScrollArea({ className = "", children, ...props }) {
  return (
    <div className={`overflow-auto ${className}`} {...props}>
      {children}
    </div>
  );
}

/* --- Avatar --- */
function Avatar({ src, fallback, className = "", size = "default" }) {
  const [err, setErr] = useState(false);
  const sizes = {
    sm: "h-6 w-6 text-xs",
    default: "h-8 w-8 text-sm",
    lg: "h-10 w-10 text-base",
  };
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ${sizes[size]} ${className}`}
    >
      {src && !err ? (
        <img
          src={src}
          onError={() => setErr(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="font-medium text-muted-foreground">{fallback}</span>
      )}
    </div>
  );
}

/* ----------------------------- Error Boundary ----------------------------- */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }
  render() {
    if (this.state.hasError) {
      // User requested to only log to terminal/inspect and not show the giant crash UI.
      return null;
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
