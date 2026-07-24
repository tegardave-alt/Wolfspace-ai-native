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

/* Icons dipindah ke public/app/Icons.jsx (APP_MODULES). */

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
    return JSON.parse(localStorage.getItem("wolfspace_cloud") || "null");
  } catch (e) {
    return null;
  }
}
function setCloudLS(c) {
  if (c) localStorage.setItem("wolfspace_cloud", JSON.stringify(c));
  else localStorage.removeItem("wolfspace_cloud");
}
function escHtml(s) {
  return s.replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
  );
}
function mdInline(s) {
  let h = escHtml(s);
  h = h.replace(/`([^`\n]+)`/g, '<span class="inline-code">$1</span>');
  h = h.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  return h;
}
function mdToHtml(s) {
  const lines = s.split(/\r?\n/);
  const outBlocks = [];
  let normalLines = [];

  const flushNormal = () => {
    if (normalLines.length > 0) {
      outBlocks.push(mdInline(normalLines.join("\n")).replace(/\n/g, "<br/>"));
      normalLines = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const nextLine = lines[i + 1];
    if (
      i + 1 < lines.length &&
      line.includes("|") &&
      /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(nextLine)
    ) {
      flushNormal();
      const parseRow = (r) => {
        let trimmed = r.trim();
        if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
        if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
        return trimmed.split("|").map((c) => c.trim());
      };
      const headers = parseRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().includes("|") && lines[i].trim() !== "") {
        rows.push(parseRow(lines[i]));
        i++;
      }
      let html = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
      headers.forEach((h) => {
        html += `<th>${mdInline(h)}</th>`;
      });
      html += '</tr></thead><tbody>';
      rows.forEach((row) => {
        html += '<tr>';
        for (let c = 0; c < headers.length; c++) {
          const cell = row[c] || "";
          html += `<td>${mdInline(cell)}</td>`;
        }
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      outBlocks.push(html);
    } else {
      normalLines.push(line);
      i++;
    }
  }
  flushNormal();
  return outBlocks.join("");
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
  const openThink = tail.search(/<(?:think|thought)>/i);
  if (openThink >= 0 && (openCode < 0 || openThink < openCode)) {
    const pre = tail.slice(0, openThink);
    if (pre.trim()) out.push({ type: "text", html: mdToHtml(pre.trim()) });
    out.push({
      type: "think",
      html: mdToHtml(tail.slice(openThink).replace(/^<(?:think|thought)>\n?/i, "").trim())
    });
  } else if (openCode >= 0) {
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
function reqFor(modelVal, cloud, history) {
  const effortVal = cloud && typeof cloud.effort !== 'undefined' ? Number(cloud.effort) : (parseInt(localStorage.getItem("wolfspace_effort") || "1", 10) || 1);
  return modelVal === "cloud" && cloud
    ? { history, cloud, effort: effortVal }
    : { history, port: modelVal, effort: effortVal };
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

// Ambil /ww/list lewat IPC (Electron: tanpa server HTTP) ATAU fetch (browser).
// Tanpa ini, di app Electron origin app:// fetch("/ww/list") jadi 404 → hantu tak terbuang.
async function wwApi(path, { method = "GET", body = null } = {}) {
  try {
    if (IPC && IPC.invoke) {
      const r = await IPC.invoke("api", { method, path, body });
      return JSON.parse((r && r.body) || "null");
    }
    const opts =
      body != null
        ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : { method };
    return await (await fetch(path, opts)).json();
  } catch (_) {
    return null;
  }
}
const wwListFetch = () => wwApi("/ww/list");

// ── Electron fetch-shim ──
// Electron TAK punya server HTTP (zero open ports). Rutekan setiap fetch path-relatif
// ("/…") ke backend in-process lewat IPC.invoke("api"), supaya SEMUA endpoint non-stream
// (models, cloud-providers, detect-key, cloud-save, hf, ollama, agents, terminal, run, dst)
// hidup di Electron TANPA mengubah call-site. Di browser (IPC null) shim TIDAK dipasang —
// fetch asli tetap dipakai. Chat/self-agent pakai IPC.stream (bukan fetch), tak terpengaruh.
if (
  typeof window !== "undefined" &&
  IPC &&
  IPC.invoke &&
  window.fetch &&
  !window.__wwFetchShimmed
) {
  window.__wwFetchShimmed = true;
  const _realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    init = init || {};
    const url = typeof input === "string" ? input : (input && input.url) || "";
    // Hanya API path-relatif same-origin. URL absolut/eksternal/blob → fetch asli.
    if (typeof url !== "string" || !url.startsWith("/")) return _realFetch(input, init);
    const method = String(
      init.method || (typeof input === "object" && input.method) || "GET",
    ).toUpperCase();
    let body = init.body != null ? init.body : typeof input === "object" ? input.body : null;
    // FormData/stream tak didukung shim → serahkan ke fetch asli (jarang di path relatif).
    if (body != null && typeof body !== "string") return _realFetch(input, init);
    let payload = null;
    if (body != null) {
      try {
        payload = JSON.parse(body);
      } catch (_) {
        payload = body;
      }
    }
    let r;
    try {
      r = await IPC.invoke("api", { method, path: url, body: payload });
    } catch (_) {
      return _realFetch(input, init); // IPC gagal → coba fetch asli (mis. aset statis app://)
    }
    const status = (r && r.status) || 200;
    const text = r && typeof r.body === "string" ? r.body : "";
    const hdr = (r && r.headers) || {};
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: "",
      headers: { get: (k) => hdr[String(k).toLowerCase()] ?? null },
      json: async () => JSON.parse(text || "null"),
      text: async () => text,
      clone() {
        return this;
      },
    };
  };
}

// ── Electron EventSource-shim ──
// EventSource (SSE) BUKAN fetch, jadi fetch-shim tak menangkapnya → di Electron
// `new EventSource("/api/agents/stream")` nyasar ke app:// (404), mematikan output
// live Agent Runner / opencode CLI. Di Electron, rutekan EventSource path-relatif
// ke IPC.stream("api", …) (apiStream) dan parse SSE jadi event onmessage.
if (
  typeof window !== "undefined" &&
  IPC &&
  IPC.stream &&
  !window.__wwEventSourceShimmed
) {
  window.__wwEventSourceShimmed = true;
  const _RealES = window.EventSource;
  window.EventSource = function (url) {
    if (typeof url !== "string" || !url.startsWith("/")) {
      return _RealES ? new _RealES(url) : { close() {}, onmessage: null, onerror: null };
    }
    const es = { onmessage: null, onerror: null, onopen: null, readyState: 1, close() {} };
    let buf = "";
    let cancel = null;
    try {
      cancel = IPC.stream(
        "api",
        { method: "GET", path: url },
        (chunk) => {
          if (typeof chunk !== "string") return;
          buf += chunk;
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const raw = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const dataLines = raw
              .split("\n")
              .filter((l) => l.slice(0, 5) === "data:")
              .map((l) => l.slice(5).replace(/^ /, ""));
            if (dataLines.length && typeof es.onmessage === "function")
              es.onmessage({ data: dataLines.join("\n") });
          }
        },
        () => {
          es.readyState = 2;
          if (typeof es.onerror === "function") es.onerror({ type: "done" });
        },
      );
    } catch (e) {
      if (typeof es.onerror === "function") setTimeout(() => es.onerror(e), 0);
    }
    es.close = () => {
      es.readyState = 2;
      try {
        cancel && cancel();
      } catch (_) {}
    };
    return es;
  };
}

// ── Auto-migrasi localStorage (Electron, sekali jalan) ──
// Kalau ada file jembatan dari browser (~/.wolfspace/ls-migrate.json via /ww/ls-load)
// dan Electron ini belum pernah migrasi, TERAPKAN OTOMATIS saat load — tanpa perlu
// menempel apa pun di DevTools console (yang diblokir proteksi self-XSS).
if (
  typeof window !== "undefined" &&
  IPC &&
  IPC.invoke &&
  !localStorage.getItem("wolfspace_migrated")
) {
  IPC.invoke("api", { method: "GET", path: "/ww/ls-load" })
    .then((r) => {
      if (!r || r.status !== 200) return;
      let data = {};
      try {
        data = JSON.parse(r.body).data || {};
      } catch (_) {
        return;
      }
      const keys = Object.keys(data).filter((k) => k !== "wolfspace_migrated");
      if (!keys.length) return; // belum ada dump dari browser → cek lagi lain kali
      for (const k of keys) localStorage.setItem(k, data[k]);
      localStorage.setItem("wolfspace_migrated", "1");
      console.log("[ww] auto-migrasi localStorage: " + keys.length + " kunci diimpor — reload…");
      location.reload();
    })
    .catch(() => {});
}

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

/* Components dipindah ke public/app/Components.jsx (APP_MODULES). */

/* Sidebar dipindah ke public/app/Sidebar.jsx (APP_MODULES). */

/* ----------------------------- App ----------------------------- */
const SUGGESTIONS = [];

/* ═══════════════════════════════════════════════════════════
   PROJECT PICKER SCREEN
   Shown once on startup. Disappears after first message sent.
═══════════════════════════════════════════════════════════ */
const PICKER_WORKSPACES = [
  { name: "resilient-bose", active: true },
  { name: "excited-turing" },
  { name: "peaceful-maxwell" },
  { name: "eager-hertz" },
];
/* Screens dipindah ke public/app/Screens.jsx (APP_MODULES). */

function App() {
  // Melaporkan ke index.html bahwa App berhasil dirender tanpa Runtime Error
  useEffect(() => {
    if (window.reportAppSuccess) window.reportAppSuccess();
  }, []);
  const [pickerDone, setPickerDone] = useState(false);
  const [panelMenuOpen, setPanelMenuOpen] = useState(false);
  // Panel Logic (kanvas React Flow) — overlay yang menutupi UI chat saat dibuka.
  const [logicOpen, setLogicOpen] = useState(false);
  useEffect(() => {
    const closePanelMenu = () => setPanelMenuOpen(false);
    window.addEventListener("click", closePanelMenu);
    return () => window.removeEventListener("click", closePanelMenu);
  }, []);

  // Command Palette state (VS Code fork). Lives here (App level, not
  // AgentRunnerView) because the trigger button that opens it is in App's own
  // panel menu — a sibling/child component's local state isn't reachable from
  // there, which previously threw "setCommandPaletteOpen is not defined".
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState("");
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const filteredCommands = useMemo(() => {
    if (!commandSearch.trim()) return COMMANDS;
    return COMMANDS.filter(cmd =>
      cmd.label.toLowerCase().includes(commandSearch.toLowerCase())
    );
  }, [commandSearch]);
  const runSelectedCommand = () => {
    const cmd = filteredCommands[selectedCommandIndex];
    if (cmd) {
      cmd.action();
      setCommandPaletteOpen(false);
      setCommandSearch("");
    }
  };
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        setCommandPaletteOpen(true);
        setCommandSearch("");
        setSelectedCommandIndex(0);
      }
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
  const [selectedProject, setSelectedProject] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("wolfspace_projects_list") || "[]");
      if (stored && stored.length > 0 && stored[0].path) return stored[0].path;
    } catch (_) {}
    return "c:\\Users\\dave\\quantum";
  });
  const [hitlRequest, setHitlRequest] = React.useState(null);

  React.useEffect(() => {
    const checkSelectedProject = () => {
      try {
        const deleted = JSON.parse(localStorage.getItem("wolfspace_deleted_workspaces") || "[]");
        // Path-exact saja (lihat isPathDeleted) — tak lagi cocok nama/suffix.
        const isDel = (pStr) => isPathDeleted(deleted, pStr);
        if (isDel(selectedProject)) {
          const stored = JSON.parse(localStorage.getItem("wolfspace_projects_list") || "[]");
          const valid = stored.filter(p => !isDel(p.path));
          if (valid.length > 0 && valid[0].path) setSelectedProject(valid[0].path);
          else if (!isDel("c:\\Users\\dave\\quantum")) setSelectedProject("c:\\Users\\dave\\quantum");
          else setSelectedProject("");
        }
      } catch (_) {}
    };
    window.addEventListener("wolfspace_workspaces_changed", checkSelectedProject);
    return () => window.removeEventListener("wolfspace_workspaces_changed", checkSelectedProject);
  }, [selectedProject]);
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
    if (req.kind === 'continue') {
      // Jeda batas-langkah (checkpoint) — bukan HITL persetujuan. "Lanjutkan"
      // meneruskan run dari checkpoint dengan plafon langkah diperpanjang.
      if (val === "continue") {
        doSend("", null, { thread_id: req.thread_id, continue_response: true });
      } else {
        setBusy(false); // user memilih berhenti; edit yang sudah ada dipertahankan
      }
      return;
    }
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
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewInputUrl, setPreviewInputUrl] = useState("");
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  // Ref ke iframe Web Dev Live Browser, agar Visual Picker bisa menjangkau
  // dokumen DI DALAM render-nya (bukan cuma elemen <iframe> itu sendiri).
  const previewIframeRef = useRef(null);
  const getPreviewDoc = useCallback(() => {
    const f = previewIframeRef.current;
    return (f && f.contentDocument) || null;
  }, []);

  const handlePreviewNavigate = useCallback((urlOrPath) => {
    if (!urlOrPath || !urlOrPath.trim()) return;
    const val = urlOrPath.trim();
    const isHttp = val.startsWith("http://") || val.startsWith("https://") || val.startsWith("app://");
    const targetUrl = isHttp ? val : `/preview-file?path=${encodeURIComponent(val)}`;
    setPreviewUrl(targetUrl);
    setPreviewInputUrl(val);
  }, []);

  // Web Dev Live Browser — auto-lempar: saat agent MENULIS/MENGUBAH file .html
  // (event act dari stream agent), langsung render di panel preview; bila file
  // yang sama ditulis ulang, cukup refresh iframe. Sumber kebenaran path adalah
  // d.path (path FINAL hasil resolve tool — akurat walau kurungan workspace
  // me-remap tulisan ke folder lain); fallback: parse d.arg, path relatif
  // diresolve ke folder kerja aktif (workspace_root) atau root WOLFSPACE.
  // (Deteksi regex lama atas teks jawaban DIHAPUS — sering menebak path yang
  // disebut model padahal file nyatanya di-remap ke tempat lain → 404.)
  useEffect(() => {
    const onActPreview = (e) => {
      const d = (e && e.detail) || {};
      if (!/write|edit|create|apply|save/i.test(String(d.kind || ""))) return;
      if (d.ok === false) return; // tulisan gagal — jangan preview
      let p = "";
      if (/\.html?$/i.test(String(d.path || ""))) {
        p = String(d.path);
      } else {
        const m = String(d.arg || "").match(/([^\s"'`]+\.html?)(?=[\s"'`]|$)/i);
        if (!m) return;
        p = m[1];
        if (!/^[a-zA-Z]:[\\\/]|^\\\\|^\//.test(p)) {
          const root = resolveWorkspaceRoot(selectedProject) || WOLFSPACE_ROOT;
          p = String(root).replace(/[\\\/]+$/, "") + "/" + p.replace(/^[.\/\\]+/, "");
        }
      }
      const target = "/preview-file?path=" + encodeURIComponent(p);
      setPreviewUrl((cur) => {
        if (cur === target) { setPreviewRefreshKey((k) => k + 1); return cur; }
        setPreviewInputUrl(p);
        return target;
      });
      setPanelOpen(true);
    };
    window.addEventListener("wolfspace_agent_act", onActPreview);
    return () => window.removeEventListener("wolfspace_agent_act", onActPreview);
  }, [selectedProject]);

  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  // Sesi chat TERPISAH untuk panel Workflow (kokpit agent) — thread & konteksnya
  // sendiri, tak tercampur/terduplikasi dengan chat utama.
  const [wfMessages, setWfMessages] = useState([]);
  const [wfHistory, setWfHistory] = useState([]);
  const [wfBusy, setWfBusy] = useState(false);
  const [wfAgentWidth, setWfAgentWidth] = useState(() => {
    try {
      const w = parseInt(localStorage.getItem("wolfspace_wf_agent_width") || "400", 10);
      return isNaN(w) ? 400 : Math.max(260, Math.min(800, w));
    } catch (_) {
      return 400;
    }
  });
  const [wfAgentCollapsed, setWfAgentCollapsed] = useState(false);
  const [isWfResizing, setIsWfResizing] = useState(false);

  const handleWfResizerMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsWfResizing(true);
    const startX = e.clientX;
    const startWidth = wfAgentWidth;

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(260, Math.min(800, startWidth - deltaX));
      setWfAgentWidth(newWidth);
    };

    const handleMouseUp = (upEvent) => {
      const deltaX = upEvent.clientX - startX;
      const finalWidth = Math.max(260, Math.min(800, startWidth - deltaX));
      setIsWfResizing(false);
      try {
        localStorage.setItem("wolfspace_wf_agent_width", String(finalWidth));
      } catch (_) {}
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };
  const wfCtrlRef = useRef(null);
  const [status, setStatus] = useState("Memuat model...");
  const [view, setView] = useState("chat");
  const [sbCollapsed, setSbCollapsed] = useState(() => {
    try {
      return localStorage.getItem("wolfspace_sb") === "1";
    } catch (e) {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("wolfspace_sb", sbCollapsed ? "1" : "0");
    } catch (e) {}
  }, [sbCollapsed]);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("wolfspace_theme") || "dark";
    } catch (e) {
      return "dark";
    }
  });

  const [terminalPct, setTerminalPct] = useState(30);
  const [panelPct, setPanelPct] = useState(35);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalLoading, setTerminalLoading] = useState(false);
  const [savedChats, setSavedChats] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("wolfspace_chats") || "[]");
    } catch (e) {
      return [];
    }
  });
  const [globalPreviewItem, setGlobalPreviewItem] = useState(null);
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
      setSavedChats(JSON.parse(localStorage.getItem("wolfspace_chats") || "[]"));
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
      const list = JSON.parse(localStorage.getItem("wolfspace_chats") || "[]");
      const updated = list.filter((c) => c.id !== id);
      localStorage.setItem("wolfspace_chats", JSON.stringify(updated));
      setSavedChats(updated);
    } catch (e) {}
  };
  const renameChat = (id, newTitle) => {
    try {
      if (!newTitle || !newTitle.trim()) return;
      const list = JSON.parse(localStorage.getItem("wolfspace_chats") || "[]");
      const updated = list.map((c) => (c.id === id ? { ...c, title: newTitle.trim() } : c));
      localStorage.setItem("wolfspace_chats", JSON.stringify(updated));
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
  const scrollRef = useRef(null);
  const wfChatScrollRef = useRef(null); // panel chat di view Workflow (split)
  const ctrlRef = useRef(null);
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
  const onPanelDividerDown = (e) => {
    e.preventDefault();
    const move = (ev) => {
      const w = window.innerWidth;
      const pct = Math.min(60, Math.max(15, ((w - ev.clientX) / w) * 100));
      setPanelPct(pct);
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
  const startPicker = useVisualPicker(getPreviewDoc);
  const startVisualDraw = useVisualDraw(getPreviewDoc);
  const doSendRef = useRef(void 0);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("wolfspace_theme", theme);
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
  useEffect(() => {
    const wf = wfChatScrollRef.current;
    if (wf) wf.scrollTop = wf.scrollHeight;
  }, [wfMessages]);

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
    // /ask: mode tanya EKSPLISIT — dijamin TANPA tool (tidak akan pernah edit atau
    // eksekusi file), bahkan pada model cloud. Ini escape-hatch keamanan, kebalikan
    // dari perilaku default di mana model sendiri yang memutuskan pakai tool atau tidak.
    let askMode = false;
    {
      const t = (content || "").trim();
      if (/^\/ask(\s|$)/i.test(t)) {
        askMode = true;
        content = t.replace(/^\/ask\b\s*/i, "");
        if (!content) { setStatus("Ketik pertanyaan setelah /ask, mis. /ask apa fungsi X"); return; }
      }
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
    
    // Default: model cloud tool-capable selalu lewat agent, dan MODEL sendiri yang
    // memutuskan (tool_choice auto) apakah cukup menjawab atau memakai tool. Tak ada
    // lagi gerbang regex tebak-menebak yang bisa salah-rute (dulu typo "jalaankan"
    // diam-diam jatuh ke chat tanpa-tool → model mengarang output). Pengecualian:
    //   - /ask  -> paksa jalur tanpa-tool (jaminan tak menyentuh file)
    //   - HITL/continue resume -> selalu agent
    //   - model lokal/bridge  -> memang tak bisa tool, plain chat
    const useAgent = !!hitlData || (modelVal === "cloud" && !_localCloud && !askMode);
    if (!useAgent) {
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
        console.log("[doSend] Setting busy=false (normal chat complete)");
        setBusy(false); // Reset busy state after stream completes
      } catch (e) {
        if (e.name !== "AbortError") setStatus("error: " + e.message);
        else setStatus("dibatalkan");
        console.log("[doSend] Setting busy=false (normal chat error)");
        setBusy(false);
      }
    } else {
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
        const curEffort = (getCloud() && typeof getCloud().effort !== 'undefined') ? Number(getCloud().effort) : (parseInt(localStorage.getItem("wolfspace_effort") || "1", 10) || 1);
        await streamSelfAgent(
          { history: newHist, cloud: getCloud(), port: modelVal, effort: curEffort, workspace_root: resolveWorkspaceRoot(selectedProject) || undefined, ...hitlData },
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
              // Pancarkan juga dari chat UTAMA (bukan cuma chat workflow): dipakai
              // live-mirror & auto-preview Web Dev Live Browser. j.path = path final
              // hasil resolve tool (akurat walau kurungan workspace me-remap path).
              try { window.dispatchEvent(new CustomEvent("wolfspace_agent_act", { detail: { kind: j.kind, arg: j.arg, ok: j.ok, output: j.output, path: j.path } })); } catch (_) {}
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
              if (j.continuable && j.thread_id) {
                // Agent dijeda karena plafon langkah (checkpoint) — belum selesai,
                // bukan gagal. Tutup timeline dengan rapi lalu tawarkan "Lanjutkan".
                adoneSent = true;
                waitingForInput = true;
                upd({ busy: false, done: true, summary: j.summary, editCount: j.edits, backup: j.backup });
                setHitlRequest({
                  kind: 'continue',
                  title: "Agent dijeda (batas langkah)",
                  code: j.summary || "",
                  thread_id: j.thread_id,
                  options: [
                    { value: "continue", text: "Lanjutkan" },
                    { value: "deny", text: "Selesai (berhenti di sini)" }
                  ]
                });
                return;
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
  // Kirim untuk panel chat Workflow — sesi agent INDEPENDEN (wfMessages/wfHistory),
  // memakai streamSelfAgent yang sama tapi menulis ke state-nya sendiri. Hanya sesi
  // inilah yang menggerakkan live agent graph (dispatch event dari sini, bukan chat
  // utama), sehingga data kedua sisi tak tercampur.
  const wfSend = async (content) => {
    if (!content || !content.trim() || wfBusy) return;
    const newHist = [...wfHistory, { role: "user", content }];
    setWfHistory(newHist);
    setWfMessages((m) => [...m, { role: "user", text: content }, { role: "agent", agent: { events: [], busy: true } }]);
    setWfBusy(true);
    const upd = (patch) => setWfMessages((m) => {
      const c = m.slice();
      const last = { ...c[c.length - 1] };
      last.agent = { ...last.agent, ...patch };
      c[c.length - 1] = last;
      return c;
    });
    const evlist = [];
    let think = "", adoneSent = false, hadError = false;
    try { window.dispatchEvent(new CustomEvent("wolfspace_agent_run", { detail: { phase: "start" } })); } catch (_) {}
    const ctrl = new AbortController();
    wfCtrlRef.current = ctrl;
    try {
      const curEffort = (getCloud() && typeof getCloud().effort !== "undefined") ? Number(getCloud().effort) : (parseInt(localStorage.getItem("wolfspace_effort") || "1", 10) || 1);
      // Kirim pesan terakhir DENGAN hint pembuat-workflow (tampilan chat tetap bersih,
      // pakai `content` biasa). Riwayat tersimpan tetap versi bersih (newHist).
      const sendHist = [...wfHistory, { role: "user", content: content + "\n\n" + WF_GEN_HINT }];
      await streamSelfAgent(
        { history: sendHist, cloud: getCloud(), port: modelVal, effort: curEffort, workspace_root: resolveWorkspaceRoot(selectedProject) || undefined },
        (j) => {
          if (j.t === "step") { think = ""; upd({ thinking: "" }); }
          else if (j.t === "tok") { think += j.c; upd({ thinking: think }); }
          else if (j.t === "thought") { think = ""; evlist.push({ type: "thought", kind: j.tool, arg: j.c, ok: j.ok, output: j.c }); upd({ events: [...evlist], thinking: "" }); }
          else if (j.t === "act") {
            think = "";
            evlist.push({ type: "act", kind: j.kind, arg: j.arg, ok: j.ok, output: j.output });
            upd({ events: [...evlist], thinking: "" });
            try { window.dispatchEvent(new CustomEvent("wolfspace_agent_act", { detail: { kind: j.kind, arg: j.arg, ok: j.ok, output: j.output, path: j.path } })); } catch (_) {}
          } else if (j.t === "adone") {
            try { window.dispatchEvent(new CustomEvent("wolfspace_agent_run", { detail: { phase: "done" } })); } catch (_) {}
            adoneSent = true;
            // CHAT WORKFLOW (decoupled): desain DILEMPAR ke kanvas, TAK ditampilkan
            // di chat. Terima spec JSON atau (fallback) mermaid; lalu BUANG semua blok
            // desain (mermaid/JSON) dari teks — walau tak ter-parse, agar diagram
            // rusak pun tak pernah muncul di chat.
            const spec = extractWorkflowSpec(j.summary) || mermaidToSpec(j.summary);
            let disp = stripDesignBlocks(j.summary);
            if (spec) {
              try { window.dispatchEvent(new CustomEvent("wolfspace_workflow_spec", { detail: spec })); } catch (_) {}
              disp = (disp ? disp + "\n\n" : "") + "› Workflow dikirim ke kanvas ←";
            }
            upd({ busy: false, done: true, summary: disp, editCount: j.edits, backup: j.backup });
            setWfHistory((h) => [...h, { role: "assistant", content: j.summary || "" }]);
            // RAG ingest: simpan memori run (permintaan → hasil) agar bisa diingat
            // di sesi mendatang lewat tool `retrieve`. Fire-and-forget, store global.
            if (j.summary && j.summary.trim().length > 8) {
              const mem = ("Permintaan: " + content + "\nHasil: " + j.summary).slice(0, 1200);
              wwApi("/rag/ingest", { method: "POST", body: { project: "global", text: mem, kind: "memory", meta: { source: "wf-run" } } }).catch(() => {});
            }
          } else if (j.t === "err") {
            hadError = true;
            evlist.push({ type: "err", m: j.m });
            upd({ events: [...evlist], busy: false, error: true });
          }
        },
        ctrl.signal,
      );
    } catch (e) {
      if (e.name !== "AbortError") upd({ busy: false, error: true, events: [...evlist, { type: "err", m: e.message }] });
    }
    if (!adoneSent && !hadError) {
      const summary = evlist.length > 0 ? `Selesai. ${evlist.length} operasi dieksekusi.` : "Selesai. Tidak ada operasi.";
      upd({ busy: false, done: true, summary });
      setWfHistory((h) => [...h, { role: "assistant", content: summary }]);
    }
    setWfBusy(false);
    wfCtrlRef.current = null;
  };
  const wfCancel = () => { if (wfCtrlRef.current) wfCtrlRef.current.abort(); setWfBusy(false); };
  // Fase 2: jalankan SATU tahap graph Workflow (satu giliran agent), log ke panel
  // chat Workflow, kembalikan { ok, summary }. Sengaja TIDAK memancarkan event live-
  // graph (biar kanvas Builder yang menyala per-node, bukan pindah ke mode Live).
  const runWorkflowStage = React.useCallback((prompt, meta = {}) => {
    return new Promise((resolve) => {
      setWfMessages((m) => [...m, { role: "user", text: "▶ " + (meta.label || meta.kind || "tahap") }, { role: "agent", agent: { events: [], busy: true } }]);
      const upd = (patch) => setWfMessages((m) => {
        const c = m.slice(); const last = { ...c[c.length - 1] }; last.agent = { ...last.agent, ...patch }; c[c.length - 1] = last; return c;
      });
      let think = "", evlist = [], summary = "", done = false;
      const finish = (ok, s) => { if (done) return; done = true; resolve({ ok, summary: s }); };
      const ctrl = new AbortController();
      const curEffort = (getCloud() && typeof getCloud().effort !== "undefined") ? Number(getCloud().effort) : (parseInt(localStorage.getItem("wolfspace_effort") || "1", 10) || 1);
      streamSelfAgent(
        { history: [{ role: "user", content: prompt }], cloud: getCloud(), port: modelVal, effort: curEffort, workspace_root: meta.workspaceRoot || resolveWorkspaceRoot(selectedProject) || undefined },
        (j) => {
          if (j.t === "tok") { think += j.c; upd({ thinking: think }); }
          else if (j.t === "thought") { think = ""; evlist.push({ type: "thought", kind: j.tool, arg: j.c, ok: j.ok, output: j.c }); upd({ events: [...evlist], thinking: "" }); }
          else if (j.t === "act") { think = ""; evlist.push({ type: "act", kind: j.kind, arg: j.arg, ok: j.ok, output: j.output }); upd({ events: [...evlist], thinking: "" }); }
          else if (j.t === "adone") { summary = j.summary || summary; upd({ busy: false, done: true, summary }); finish(true, summary); }
          else if (j.t === "err") { upd({ busy: false, error: true, events: [...evlist, { type: "err", m: j.m }] }); finish(false, j.m || "error"); }
        },
        ctrl.signal,
      ).then(() => { upd({ busy: false, done: true, summary }); finish(true, summary); })
       .catch((e) => { if (e.name !== "AbortError") upd({ busy: false, error: true }); finish(false, e.message); });
    });
  }, [modelVal, selectedProject]);
  const reset = () => {
    setMessages([]);
    setHistory([]);
    setBusy(false);
    setStatus("Siap.");
  };
  const saveChat = () => {
    if (messages.length === 0) return;
    try {
      const saved = JSON.parse(localStorage.getItem("wolfspace_chats") || "[]");
      saved.push({
        id: Date.now(),
        title: messages[0]?.text?.slice(0, 60) || "Chat",
        messages: messages,
        history: history,
        savedAt: new Date().toISOString(),
        project: selectedProject,
      });
      localStorage.setItem("wolfspace_chats", JSON.stringify(saved));
      loadSavedChats();
    } catch (e) {
      /* ignore storage errors */
    }
  };

  return (
    <>
      <div className={"app has-sidebar" + (sbCollapsed ? " sb-collapsed" : "")}>
      {!pickerDone && (
        <ProjectPickerScreen
          models={models}
          modelVal={modelVal}
          setModelVal={setModelVal}
          onStart={(msg, project) => {
            setSelectedProject(project);
            setPickerDone(true);
            setTimeout(() => doSend(msg), 0);
          }}
        />
      )}
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
        renameChat={renameChat}
        loadSavedChats={loadSavedChats}
        onAgentRunner={() => {
          setAgentRunnerOpen(true);
          loadAgents();
        }}
        selectedProject={selectedProject}
        onOpenPicker={() => {
          setPickerDone(false);
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
          <div className="chat-split" style={{ position: "relative" }}>
            <div
              className="chat-col"
              style={{
                flex: "1 1 " + Math.max(20, 100 - (terminalOpen ? terminalPct : 0) - (panelOpen ? panelPct : 0)) + "%",
              }}
            >
              <div
                className="chat-scroll"
                ref={scrollRef}
                onClick={(e) => {
                  if (e.target.tagName === "IMG" && (e.target.src || e.target.getAttribute("src"))) {
                    setGlobalPreviewItem({ url: e.target.src || e.target.getAttribute("src"), name: e.target.alt || "Preview Gambar / Screenshot" });
                  }
                }}
              >
                {messages.length === 0 ? (
                  <div className="chat-inner">
                  </div>
                ) : (
                  <div className="chat-inner">
                    {messages.map((m, i) => (
                      <Message
                        key={i}
                        msg={m}
                      />
                    ))}
                  </div>
                )}
              </div>
            <HitlModal request={hitlRequest} onResolve={handleHitlResolve} />
            <LightboxModal item={globalPreviewItem} onClose={() => setGlobalPreviewItem(null)} />
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
                <div className="terminal-col" style={{ flex: "0 0 " + terminalPct + "%", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                  <VSCodeTerminal selectedProject={selectedProject} onClose={() => setTerminalOpen(false)} agentOutput={agentOutput} terminalOutput={terminalOutput} messages={messages} />
                </div>
              </>
            )}
            {panelOpen && (
              <>
                <div className="split-divider" onMouseDown={onPanelDividerDown} />
                <div
                  className="canvas-col"
                  style={{ flex: "0 0 " + panelPct + "%", background: "var(--surface-1)", display: "flex", flexDirection: "column" }}
                >
                  <div style={{ height: "46px", borderBottom: "1px solid var(--line)", padding: "0 14px 0 36px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexShrink: 0, position: "relative" }}>
                    <div
                      style={{
                        position: "absolute",
                        left: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: "18px",
                        height: "28px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: "#ffffff",
                        zIndex: 10,
                      }}
                      title="Menu panel"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPanelMenuOpen(!panelMenuOpen);
                      }}
                    >
                      <svg width="10" height="20" viewBox="0 0 10 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="5" cy="4" r="1.6" fill="#ffffff"></circle>
                        <circle cx="5" cy="10" r="1.6" fill="#ffffff"></circle>
                        <circle cx="5" cy="16" r="1.6" fill="#ffffff"></circle>
                      </svg>
                    </div>
                    {panelMenuOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: "absolute",
                          top: "38px",
                          left: "8px",
                          background: "#181c20",
                          border: "1px solid #282e36",
                          borderRadius: "6px",
                          boxShadow: "0 12px 36px rgba(0,0,0,0.65)",
                          padding: "6px 0",
                          zIndex: 2000,
                          minWidth: "235px",
                        }}
                      >
                        {/* Visual Picker & Visual Draw dipindah kemari dari sidebar (bagian "Alat")
                            — akses langsung dari tombol menu panel ini, bukan lagi di sidebar. */}
                        <button
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            width: "100%",
                            padding: "8px 16px",
                            color: "#e2e8f0",
                            fontSize: "13px",
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            textAlign: "left",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          onClick={() => {
                            // Buka overlay kanvas Logic (React Flow) di atas UI chat.
                            setPanelMenuOpen(false);
                            setLogicOpen(true);
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="6" height="5" rx="1"></rect><rect x="15" y="9" width="6" height="5" rx="1"></rect><rect x="9" y="15" width="6" height="5" rx="1"></rect><path d="M9 6.5h3a2 2 0 0 1 2 2v.5M9 17.5H6a2 2 0 0 1-2-2V9"></path></svg>
                          <span>Logic</span>
                        </button>
                        <button
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            width: "100%",
                            padding: "8px 16px",
                            color: "#e2e8f0",
                            fontSize: "13px",
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            textAlign: "left",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          onClick={() => {
                            setPanelMenuOpen(false);
                            startPicker();
                          }}
                        >
                          {SB.target({ width: 16, height: 16 })}
                          <span>Visual Picker</span>
                        </button>
                        <button
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            width: "100%",
                            padding: "8px 16px",
                            color: "#e2e8f0",
                            fontSize: "13px",
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            textAlign: "left",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          onClick={() => {
                            setPanelMenuOpen(false);
                            startVisualDraw();
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"></path><path d="M13.5 6.5l4 4"></path></svg>
                          <span>Visual Draw</span>
                        </button>
                      </div>
                    )}
                    <div style={{ flex: 1, display: "flex", alignItems: "center", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", padding: "3px 10px", gap: "6px", minWidth: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8b98a9" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" y1="8" x2="12" y2="8"/><line x1="3.95" y1="6.06" x2="8.54" y2="14"/><line x1="10.88" y1="21.94" x2="15.46" y2="14"/></svg>
                      <input
                        type="text"
                        value={previewInputUrl}
                        onChange={(e) => setPreviewInputUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handlePreviewNavigate(previewInputUrl);
                        }}
                        placeholder="Path HTML / URL (misal: C:\...\index.html atau http://localhost:3000)"
                        style={{ flex: 1, background: "transparent", border: "none", color: "#e2e8f0", fontSize: "12px", outline: "none", fontFamily: "inherit", minWidth: 0 }}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "2px", flexShrink: 0 }}>
                      <button
                        title="Reload / Refresh preview"
                        onClick={() => setPreviewRefreshKey((k) => k + 1)}
                        style={{ background: "transparent", border: "none", color: "#8b98a9", cursor: "pointer", padding: "4px 6px", borderRadius: "4px", display: "flex", alignItems: "center" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                      </button>
                      <button
                        title="Buka di tab/browser eksternal"
                        onClick={() => {
                          if (!previewUrl && !previewInputUrl) return;
                          const isHttp = previewInputUrl.startsWith("http://") || previewInputUrl.startsWith("https://");
                          if (isHttp) {
                            window.open(previewInputUrl, "_blank");
                          } else if (window.WOLFSPACE && window.WOLFSPACE.ipc) {
                            // Electron: tak ada server HTTP di 8090 (app:// protocol-only),
                            // jadi browser eksternal manapun tak bisa menjangkau
                            // /preview-file. Buka file ASLI dari disk via file:// —
                            // setWindowOpenHandler meneruskannya ke shell.openExternal,
                            // yang meluncurkan browser default OS langsung ke file itu.
                            let p = String(previewInputUrl).replace(/\\/g, "/");
                            if (!p.startsWith("/")) p = "/" + p;
                            window.open("file://" + encodeURI(p), "_blank");
                          } else {
                            // Mode server/browser biasa: /preview-file memang dilayani
                            // di origin yang sama — tab baru pada origin itu cukup.
                            window.open(previewUrl || previewInputUrl, "_blank");
                          }
                        }}
                        style={{ background: "transparent", border: "none", color: "#8b98a9", cursor: "pointer", padding: "4px 6px", borderRadius: "4px", display: "flex", alignItems: "center" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </button>
                      <button
                        title="Tutup panel"
                        onClick={() => setPanelOpen(false)}
                        style={{ background: "transparent", border: "none", color: "#8b98a9", cursor: "pointer", padding: "4px 6px", borderRadius: "4px", display: "flex", alignItems: "center" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(248,81,73,0.15)"; e.currentTarget.style.color = "#f85149"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#8b98a9"; }}
                      >
                        {/* Ikon-X SVG (bukan glyph teks '×') agar boks & alignment-nya
                            identik dengan tombol Reload/Buka-eksternal di sebelahnya. */}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", background: "#ffffff" }}>
                    {previewUrl ? (
                      <iframe
                        ref={previewIframeRef}
                        key={previewRefreshKey}
                        src={previewUrl}
                        style={{ flex: 1, width: "100%", height: "100%", border: "none" }}
                        title="Live Web Dev Preview"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                      />
                    ) : (
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px", textAlign: "center", color: "#8b98a9", background: "#0f1318" }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#b594f5" strokeWidth="1.5" style={{ marginBottom: "16px", opacity: 0.8 }}>
                          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                          <line x1="8" y1="21" x2="16" y2="21"></line>
                          <line x1="12" y1="17" x2="12" y2="21"></line>
                        </svg>
                        <div style={{ fontSize: "15px", fontWeight: 600, color: "#e2e8f0", marginBottom: "8px" }}>Web Dev Live Browser</div>
                        <div style={{ fontSize: "12px", maxWidth: "320px", lineHeight: "1.6" }}>
                          LiveBrowser
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            {logicOpen && (
              <div style={{ position: "absolute", inset: 0, zIndex: 60, background: "var(--surface-1, #0f1318)", display: "flex", flexDirection: "column", animation: "fadeIn 0.15s ease" }}>
                {/* Header panel Logic */}
                <div style={{ height: "46px", flexShrink: 0, borderBottom: "1px solid var(--line, #282e36)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#e2e8f0", fontSize: "13px", fontWeight: 600 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="6" height="5" rx="1"></rect><rect x="15" y="9" width="6" height="5" rx="1"></rect><rect x="9" y="15" width="6" height="5" rx="1"></rect><path d="M9 6.5h3a2 2 0 0 1 2 2v.5M9 17.5H6a2 2 0 0 1-2-2V9"></path></svg>
                    <span>Logic</span>
                    <span style={{ fontSize: "11px", fontWeight: 400, color: "#6b7280" }}>· kanvas React Flow untuk mengendalikan website</span>
                  </div>
                  <button
                    title="Tutup Logic"
                    onClick={() => setLogicOpen(false)}
                    style={{ background: "transparent", border: "none", color: "#8b98a9", cursor: "pointer", padding: "4px 6px", borderRadius: "4px", display: "flex", alignItems: "center" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(248,81,73,0.15)"; e.currentTarget.style.color = "#f85149"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#8b98a9"; }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                {/* Kanvas kosong (React Flow menyusul) — latar grid titik seperti kanvas node-editor */}
                <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#0d1117", backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#5b6673", fontSize: "13px", textAlign: "center", pointerEvents: "none", gap: "10px" }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, color: "#3a444f" }}><rect x="3" y="4" width="6" height="5" rx="1"></rect><rect x="15" y="9" width="6" height="5" rx="1"></rect><rect x="9" y="15" width="6" height="5" rx="1"></rect><path d="M9 6.5h3a2 2 0 0 1 2 2v.5M9 17.5H6a2 2 0 0 1-2-2V9"></path></svg>
                    <div style={{ fontWeight: 600, color: "#8b98a9" }}>Kanvas Logic</div>
                    <div style={{ maxWidth: "340px", lineHeight: 1.6 }}>Di sini nanti React Flow difungsikan — node & edge untuk mengendalikan website. Untuk sekarang, tampilan kosong.</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div
          className={"page hub-page " + (view === "dev" ? "active" : "enter")}
        >
          {view === "dev" && (
            <DevView
              onBack={() => setView("chat")}
              models={models}
              modelVal={modelVal}
              setModelVal={setModelVal}
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
              panelOpen={panelOpen}
              setPanelOpen={setPanelOpen}
            />
          )}
        </div>
        <div
          className={
            "page hub-page " + (view === "history" ? "active" : "enter")
          }
        >
          {view === "history" && (
            <HistoryView
              savedChats={savedChats}
              onSelect={(chat) => {
                restoreChat(chat);
                setView("chat");
              }}
              onDelete={(id) => deleteChat(id)}
            />
          )}
        </div>
        <div
          className={
            "page hub-page " + (view === "workflow" ? "active" : "enter")
          }
        >
          {view === "workflow" && (
            <div style={{ display: "flex", height: "100%", width: "100%", minHeight: 0 }}>
              {/* KIRI: React Flow (Workflow / live agent graph) */}
              <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                <WorkflowBuilder onBack={() => setView("chat")} runStage={runWorkflowStage} />
              </div>
              {/* KANAN: chat agent — pakai UI chat yang sama (Message + Composer) */}
              {wfAgentCollapsed ? (
                <div
                  onClick={() => setWfAgentCollapsed(false)}
                  title="Klik untuk membuka kembali panel Agent"
                  style={{
                    width: "36px",
                    flexShrink: 0,
                    borderLeft: "1px solid #212a36",
                    background: "#0d1117",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    paddingTop: "14px",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: wfBusy ? "#3fb950" : "#6f7d92", marginBottom: "14px", boxShadow: wfBusy ? "0 0 6px #3fb950" : "none" }} />
                  <div style={{ writingMode: "vertical-rl", textOrientation: "mixed", fontFamily: "ui-monospace, monospace", fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "#8b949e", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>◀ Agent Panel</span>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    width: `${wfAgentWidth}px`,
                    flexShrink: 0,
                    borderLeft: "1px solid #212a36",
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 0,
                    minHeight: 0,
                    background: "#0d1117",
                    position: "relative",
                    transition: isWfResizing ? "none" : "width 0.15s ease",
                  }}
                >
                  {/* Resizer Handle */}
                  <div
                    onMouseDown={handleWfResizerMouseDown}
                    title="Geser untuk mengubah ukuran panel Agent"
                    style={{
                      position: "absolute",
                      left: "-3px",
                      top: 0,
                      bottom: 0,
                      width: "7px",
                      cursor: "col-resize",
                      zIndex: 99,
                      background: isWfResizing ? "rgba(96, 165, 250, 0.5)" : "transparent",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(96, 165, 250, 0.4)"; }}
                    onMouseLeave={(e) => { if (!isWfResizing) e.currentTarget.style.background = "transparent"; }}
                  />
                  {/* Header dengan kontrol ukuran & collapse */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #212a36", flexShrink: 0, userSelect: "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: wfBusy ? "#3fb950" : "#6f7d92", boxShadow: wfBusy ? "0 0 6px #3fb950" : "none" }} />
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "#8b949e", fontWeight: 600 }}>Agent</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      {/* Tombol sembunyikan / collapse */}
                      <button
                        onClick={() => setWfAgentCollapsed(true)}
                        title="Sembunyikan panel Agent (luaskan kanvas)"
                        style={{ background: "transparent", border: "1px solid #2f363d", color: "#8b949e", borderRadius: "5px", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "12px" }}
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                  <div
                    className="chat-scroll"
                    ref={wfChatScrollRef}
                    style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
                    onClick={(e) => {
                      if (e.target.tagName === "IMG" && (e.target.src || e.target.getAttribute("src"))) {
                        setGlobalPreviewItem({ url: e.target.src || e.target.getAttribute("src"), name: e.target.alt || "Preview Gambar / Screenshot" });
                      }
                    }}
                  >
                    <div className="chat-inner">
                      {wfMessages.length === 0 && (
                        <div style={{ padding: "18px 16px", color: "#6f7d92", fontFamily: "ui-monospace, monospace", fontSize: "12px", lineHeight: 1.6 }}>
                          Sesi agent terpisah. Kirim perintah di sini — langkahnya muncul sebagai graph di kiri.
                        </div>
                      )}
                      {wfMessages.map((m, i) => (
                        <Message key={i} msg={m} />
                      ))}
                    </div>
                  </div>
                  <Composer
                    models={models}
                    modelVal={modelVal}
                    setModelVal={setModelVal}
                    onSend={(t) => wfSend(t)}
                    onCancel={wfCancel}
                    busy={wfBusy}
                    onAgentCli={() => setAgentRunnerOpen(true)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

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
    </>
  );
}
/* ============================================================
   Workflow Builder (React Flow) — kanvas node/edge ala workflow: seret node dari
   palette, sambung antar-titik, export JSON. Memakai React Flow yang di-vendor
   (window.RFLib.XY) — tanpa bundler runtime, sama pola Monaco/mermaid/cytoscape.
   ============================================================ */
const WF_PALETTE = [
  { type: "prompt", label: "Prompt", accent: "#3fb950", desc: "input / instruksi awal" },
  { type: "agent", label: "Agent", accent: "#2f81f7", desc: "loop LLM + pemanggilan tool" },
  { type: "tool", label: "Tool", accent: "#d29922", desc: "bash / edit / grep / dst" },
  { type: "condition", label: "Condition", accent: "#bc8cff", desc: "cabang if / else" },
  { type: "output", label: "Output", accent: "#f85149", desc: "hasil akhir" },
];

// Warna node live per-`kind` langkah agent (dari event t:"act" self_agent.cjs).
const WF_KIND_ACCENT = {
  workspace: "#8b949e", planner: "#bc8cff", bash: "#d29922", task: "#2f81f7",
  read: "#3fb950", edit: "#f0883e", write: "#f0883e", grep: "#56d4dd",
  glob: "#56d4dd", list: "#8fb3ff", hitl_approved: "#3fb950", thought: "#6f7d92",
};
const wfKindAccent = (k) => WF_KIND_ACCENT[k] || "#8fb3ff";

// ── Fase 2: kompilasi graph tergambar → urutan eksekusi (topological) ──────────
// Kahn's algorithm. Kembalikan { ok, order:[node...] } atau { ok:false, error }.
function compileWorkflow(nodes, edges) {
  if (!nodes || nodes.length === 0) return { ok: false, error: "Kanvas kosong — tambah node dulu." };
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges || []) {
    if (adj.has(e.source) && indeg.has(e.target)) {
      adj.get(e.source).push(e.target);
      indeg.set(e.target, indeg.get(e.target) + 1);
    }
  }
  const ind = new Map(indeg);
  const q = nodes.filter((n) => ind.get(n.id) === 0).map((n) => n.id);
  const order = [];
  while (q.length) {
    const id = q.shift();
    order.push(id);
    for (const t of adj.get(id) || []) {
      ind.set(t, ind.get(t) - 1);
      if (ind.get(t) === 0) q.push(t);
    }
  }
  if (order.length !== nodes.length) return { ok: false, error: "Ada siklus di graph — alur harus searah." };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return { ok: true, order: order.map((id) => byId.get(id)) };
}
// Bingkai prompt per-tahap sesuai jenis node + konteks dari node hulu.
function buildStagePrompt(kind, label, ctx) {
  const c = ctx ? "\n\nKonteks dari tahap sebelumnya:\n" + ctx : "";
  const L = label || kind;
  if (kind === "agent") return `Kerjakan langkah ini sebagai agent: ${L}.${c}`;
  if (kind === "tool") return `Gunakan tool yang sesuai untuk: ${L}. Laporkan hasil nyatanya.${c}`;
  if (kind === "condition") return `Evaluasi kondisi/cabang: ${L}. Jelaskan keputusan berdasarkan konteks.${c}`;
  if (kind === "output") return `Susun hasil akhir/ringkasan untuk: ${L}, berdasarkan seluruh konteks.${c}`;
  return `${L}.${c}`;
}

// Instruksi (digabung ke pesan yang DIKIRIM, bukan yang ditampilkan): bila user
// minta MEMBUAT workflow, agent mengeluarkan satu blok spec yang bisa dirender.
const WF_GEN_HINT =
  "(Jika permintaan ini tentang MEMBUAT/merancang sebuah workflow/alur/pipeline: " +
  "keluarkan HANYA satu blok berpagar ```wolfspace-workflow berisi JSON valid: " +
  '{"nodes":[{"id":"n1","kind":"prompt","label":"..."}],"edges":[{"from":"n1","to":"n2","label":"opsional"}]} ' +
  "— kind salah satu dari prompt|agent|tool|condition|output, id unik & pendek, label RINGKAS tanpa \\n. " +
  "Untuk node kind:condition, beri >1 edge keluar dan isi \"label\" tiap edge dengan nama cabang (mis. ya/tidak). " +
  "DILARANG memakai mermaid atau format diagram lain. Boleh 1 kalimat penjelasan singkat di luar blok. " +
  "Jika BUKAN permintaan workflow, abaikan instruksi ini.)";

// Ambil spec workflow dari teks jawaban agent (blok ```wolfspace-workflow / ```json).
function extractWorkflowSpec(text) {
  const m = /```(?:wolfspace-workflow|json)\s*([\s\S]*?)```/i.exec(text || "");
  if (!m) return null;
  try {
    const j = JSON.parse(m[1].trim());
    if (j && Array.isArray(j.nodes) && j.nodes.length) return j;
  } catch (_) {}
  return null;
}
// Ubah spec {nodes,edges} → node/edge React Flow (type wf) + tata-letak snake.
function specToFlow(spec) {
  const nodes = (spec.nodes || []).map((n, i) => ({
    id: String(n.id || "n" + (i + 1)),
    type: "wf",
    position: { x: 0, y: 0 },
    data: { label: n.label || n.kind || "node", kind: n.kind || "agent", accent: wfKindAccent(n.kind) },
  }));
  const edges = (spec.edges || []).map((e, i) => ({
    id: "e" + i,
    source: String(e.from != null ? e.from : e.source),
    target: String(e.to != null ? e.to : e.target),
    type: "wf",
    data: e.label ? { label: String(e.label) } : undefined, // cabang kondisi ("ya"/"tidak")
  })).filter((e) => nodes.some((n) => n.id === e.source) && nodes.some((n) => n.id === e.target));
  // Tata-letak: pakai dagre (arah aliran kiri→kanan, per-rank) supaya hasil generate
  // langsung terstruktur & rapih — sama seperti tombol "⇄ Rapikan". Fallback ke grid
  // serpentine berbasis urutan topological bila dagre tak tersedia.
  const dagre = window.RFLib && window.RFLib.dagre;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (dagre && nodes.length) {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "LR", nodesep: 42, ranksep: 96 });
    g.setDefaultEdgeLabel(() => ({}));
    const W = 168, H = 62;
    nodes.forEach((n) => g.setNode(n.id, { width: W, height: H }));
    edges.forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);
    nodes.forEach((n) => { const p = g.node(n.id); if (p) n.position = { x: p.x - W / 2, y: p.y - H / 2 }; });
  } else {
    const comp = compileWorkflow(nodes, edges);
    const order = comp.ok ? comp.order : nodes;
    const COLS = 4, DX = 210, DY = 120;
    order.forEach((n, i) => {
      const col = i % COLS, row = Math.floor(i / COLS);
      const nn = byId.get(n.id);
      if (nn) nn.position = { x: (row % 2 === 0 ? col : COLS - 1 - col) * DX, y: row * DY };
    });
  }
  return { nodes, edges };
}

// Fallback: bila agent memberi mermaid flowchart (bukan JSON), parse best-effort
// jadi spec {nodes,edges}. Bentuk node → kind: {} kondisi, ([]) prompt, () tool.
function mermaidToSpec(text) {
  const body = (/```mermaid\s*([\s\S]*?)```/i.exec(text || "") || [])[1];
  if (!body) return null;
  const nodes = new Map(); // id -> {label, kind}
  const shapeKind = (open) => (open === "{" ? "condition" : open === "([" ? "prompt" : open === "(" ? "tool" : "agent");
  const clean = (s) => String(s || "").replace(/["'`]/g, "").replace(/\\n|<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
  const reNode = /([A-Za-z0-9_]+)\s*(\(\[|\{|\[|\()([^\]}\)]*)(?:\]\)|\}|\]|\))/g;
  const addNode = (id, open, label) => {
    if (!id) return;
    const k = shapeKind(open);
    const l = clean(label) || id;
    if (!nodes.has(id) || (open && nodes.get(id).kind === "agent")) nodes.set(id, { label: l, kind: k });
  };
  let m;
  while ((m = reNode.exec(body))) addNode(m[1], m[2], m[3]);
  const edges = [];
  const reEdge = /([A-Za-z0-9_]+)[^\n>]*?(?:--+>|-\.->|==+>)(?:\s*\|([^|]*)\|)?\s*([A-Za-z0-9_]+)/g;
  while ((m = reEdge.exec(body))) {
    const src = m[1], lbl = m[2], dst = m[3];
    if (!nodes.has(src)) nodes.set(src, { label: src, kind: "agent" });
    if (!nodes.has(dst)) nodes.set(dst, { label: dst, kind: "agent" });
    edges.push({ from: src, to: dst, label: lbl ? lbl.trim() : undefined });
  }
  if (!nodes.size) return null;
  return { nodes: [...nodes.entries()].map(([id, v]) => ({ id, label: v.label, kind: v.kind })), edges };
}
// Buang SEMUA blok desain (mermaid/JSON) dari teks agar tak dirender di chat workflow.
function stripDesignBlocks(text) {
  return String(text || "")
    .replace(/```(?:mermaid|wolfspace-workflow|json)\s*[\s\S]*?```/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Context: memberi node akses untuk MENGUBAH dirinya (label/kind) di state kanvas.
// editable=false di mode Live (cermin agent tak boleh diedit).
const WFNodeCtx = React.createContext(null);
const WF_KINDS = ["prompt", "agent", "tool", "condition", "output"];

/* Workflow dipindah ke public/app/Workflow.jsx (APP_MODULES). */

/* AgentRunner dipindah ke public/app/AgentRunner.jsx (APP_MODULES). */

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
    console.error("ErrorBoundary caught a Runtime Error:", error, errorInfo);
    this.setState({ error, errorInfo });
    // Rekam error + picu Auto-Rollback lewat guard terpusat di index.html
    // (triggerAppRollback punya anti-loop: tidak reload berulang jika versi aman pun error)
    const errText = (error ? error.toString() : 'Unknown Error') + "\n" + (errorInfo && errorInfo.componentStack ? errorInfo.componentStack : '');
    if (window.triggerAppRollback) {
      window.triggerAppRollback('[ErrorBoundary] ' + errText);
    } else {
      sessionStorage.setItem('wolfspace_rollback_error', errText);
      if (window.location.search.indexOf('rollback=true') === -1) {
        window.location.replace('/?rollback=true');
      }
    }
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
