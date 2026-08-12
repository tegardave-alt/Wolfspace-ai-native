const { useState, useRef, useEffect, useCallback, useMemo } = React;

// ── thread_id agent bertahan melewati reload halaman ──
//
// KENAPA ADA. thread_id hidup di state React saja. Begitu halaman dimuat ulang
// di tengah run — dan public/index.html memang memanggil window.location.reload()
// untuk perubahan frontend yang bukan .css/.jsx/.js — thread_id lenyap.
// Permintaan berikutnya dikirim tanpa itu, self_agent.cjs mencetak thread BARU,
// MemorySaver tak punya checkpoint untuknya, dan agent mengulang dari nol.
//
// Penjaga di electron/main.js sudah menunda hot-reload selama agent bekerja,
// jadi sumber reload yang paling sering sudah tertutup. Ini lapis kedua: reload
// dari mana pun (F5, rollback Babel di index.html, crash renderer) tak lagi
// membuat agent lupa.
//
// Kedaluwarsa 30 menit, dan DIHAPUS begitu run benar-benar tuntas. Tanpa itu,
// thread basi akan diam-diam menyambung pesan berikutnya yang sama sekali tak
// berhubungan ke percakapan lama — kesalahan yang lebih membingungkan daripada
// mengulang pekerjaan.
const THREAD_KEY = "wolfspace:thread-terputus";
const THREAD_TTL_MS = 30 * 60 * 1000;
function simpanThreadTerputus(id) {
  try {
    if (id)
      localStorage.setItem(THREAD_KEY, JSON.stringify({ id, ts: Date.now() }));
    else localStorage.removeItem(THREAD_KEY);
  } catch (_) {}
}
function ambilThreadTerputus() {
  try {
    const r = JSON.parse(localStorage.getItem(THREAD_KEY) || "null");
    if (!r || !r.id || Date.now() - r.ts > THREAD_TTL_MS) return null;
    return r.id;
  } catch (_) {
    return null;
  }
}

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
      while (
        i < lines.length &&
        lines[i].trim().includes("|") &&
        lines[i].trim() !== ""
      ) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      let html =
        '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
      headers.forEach((h) => {
        html += `<th>${mdInline(h)}</th>`;
      });
      html += "</tr></thead><tbody>";
      rows.forEach((row) => {
        html += "<tr>";
        for (let c = 0; c < headers.length; c++) {
          const cell = row[c] || "";
          html += `<td>${mdInline(cell)}</td>`;
        }
        html += "</tr>";
      });
      html += "</tbody></table></div>";
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
  if (
    (text.includes("</think>") || text.includes("</thought>")) &&
    !text.includes("<think>") &&
    !text.includes("<thought>")
  ) {
    text = "<think>\n" + text;
  }

  const out = [];
  const re =
    /(?:```(\w*)\n?([\s\S]*?)```)|(?:<(?:think|thought)>([\s\S]*?)(?:<\/(?:think|thought)>|$))/gi;
  let last = 0,
    m;
  while ((m = re.exec(text))) {
    const pre = text.slice(last, m.index);
    if (pre.trim()) out.push({ type: "text", html: mdToHtml(pre.trim()) });
    if (m[3] !== undefined) {
      out.push({
        type: "think",
        html: mdToHtml(m[3].trim()),
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
      html: mdToHtml(
        tail
          .slice(openThink)
          .replace(/^<(?:think|thought)>\n?/i, "")
          .trim(),
      ),
    });
  } else if (openCode >= 0) {
    const pre = tail.slice(0, openCode);
    if (pre.trim()) out.push({ type: "text", html: mdToHtml(pre.trim()) });
    out.push({
      type: "code",
      lang: "",
      code: tail.slice(openCode).replace(/^```\w*\n?/, ""),
    });
  } else if (tail.trim())
    out.push({ type: "text", html: mdToHtml(tail.trim()) });
  return out;
}
function reqFor(modelVal, cloud, history) {
  const effortVal = readEffort(cloud);
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
        ? {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
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
    if (typeof url !== "string" || !url.startsWith("/"))
      return _realFetch(input, init);
    const method = String(
      init.method || (typeof input === "object" && input.method) || "GET",
    ).toUpperCase();
    let body =
      init.body != null
        ? init.body
        : typeof input === "object"
          ? input.body
          : null;
    // FormData/stream tak didukung shim → serahkan ke fetch asli (jarang di path relatif).
    if (body != null && typeof body !== "string")
      return _realFetch(input, init);
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
      return _RealES
        ? new _RealES(url)
        : { close() {}, onmessage: null, onerror: null };
    }
    const es = {
      onmessage: null,
      onerror: null,
      onopen: null,
      readyState: 1,
      close() {},
    };
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
      console.log(
        "[ww] auto-migrasi localStorage: " +
          keys.length +
          " kunci diimpor — reload…",
      );
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
        'Cannot reach the self-agent server.\n\nIf you are running in a browser:\n1. Open a terminal in the WOLFSPACE folder\n2. Run: npm start\n3. Wait until "http://127.0.0.1:8090" appears\n4. Refresh the browser and try again\n\nOr use Electron: npm run app',
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

/* ── Logic: sidebar file (tab Changes/Files) — desain mengikuti prototipe/screenshot.
   Terhubung ke daftar file workspace NYATA lewat GET /ww/tree, tapi hanya AKTIF
   saat konteks web-dev (`active`) — mis. ketika agent sedang membuat/mengubah web.
   Props: root=path workspace, active=boolean (sinyal web-dev). ── */
// Root sidebar Logic = FOLDER dari web yang sedang dibuat, bukan seluruh workspace.
// previewUrl berbentuk "/preview-file?path=<abs .html>" (di-set saat agent menulis
// HTML) → ambil direktori file itu. Bila previewUrl berupa URL http (server dev),
// tak ada folder lokal → pakai fallback (workspace aktif).
function webProjectRoot(previewUrl, fallback) {
  if (!previewUrl) return fallback;
  const m = String(previewUrl).match(/[?&]path=([^&]+)/);
  if (m) {
    try {
      const abs = decodeURIComponent(m[1]);
      const dir = abs.replace(/[\\/][^\\/]*$/, ""); // buang nama file → dirname
      if (dir && dir !== abs) return dir;
    } catch (_) {}
  }
  return fallback;
}
// Ikon per BAHASA, ala VS Code — tanpa pustaka ikon.
//
// KENAPA TIDAK MEMAKAI PUSTAKA. Tema ikon seperti Seti atau Material berisi
// ratusan SVG, sementara aplikasi ini mem-vendor SEMUA asetnya sendiri (tak ada
// CDN, tak ada bundler saat jalan). Menariknya masuk berarti menambah ratusan
// berkas demi belasan ekstensi yang benar-benar muncul di pohon ini.
//
// Yang dipakai VS Code sendiri, dilihat dari jauh, adalah monogram berwarna:
// warna khas bahasanya + satu-dua huruf. Itu yang ditiru di sini — satu tabel
// kecil, nol dependensi, dan warnanya memakai warna resmi tiap bahasa supaya
// tetap terbaca sebagai bahasa yang sama.
const BAHASA_IKON = {
  js: { teks: "JS", warna: "#f1e05a" },
  mjs: { teks: "JS", warna: "#f1e05a" },
  cjs: { teks: "JS", warna: "#f1e05a" },
  jsx: { teks: "JSX", warna: "#61dafb" },
  ts: { teks: "TS", warna: "#3178c6" },
  tsx: { teks: "TSX", warna: "#3178c6" },
  py: { teks: "PY", warna: "#3572a5" },
  rb: { teks: "RB", warna: "#cc342d" },
  go: { teks: "GO", warna: "#00add8" },
  rs: { teks: "RS", warna: "#dea584" },
  java: { teks: "JV", warna: "#b07219" },
  kt: { teks: "KT", warna: "#a97bff" },
  swift: { teks: "SW", warna: "#f05138" },
  c: { teks: "C", warna: "#555555" },
  h: { teks: "H", warna: "#555555" },
  cpp: { teks: "C+", warna: "#f34b7d" },
  cs: { teks: "C#", warna: "#178600" },
  php: { teks: "PHP", warna: "#4f5d95" },
  dart: { teks: "DT", warna: "#00b4ab" },
  html: { teks: "<>", warna: "#e34c26" },
  htm: { teks: "<>", warna: "#e34c26" },
  css: { teks: "CSS", warna: "#563d7c" },
  scss: { teks: "SC", warna: "#c6538c" },
  json: { teks: "{}", warna: "#cbcb41" },
  yml: { teks: "YML", warna: "#cb171e" },
  yaml: { teks: "YML", warna: "#cb171e" },
  sh: { teks: "SH", warna: "#89e051" },
  ps1: { teks: "PS", warna: "#012456" },
  sql: { teks: "SQL", warna: "#e38c00" },
  xml: { teks: "XML", warna: "#0060ac" },
  vue: { teks: "VUE", warna: "#41b883" },
  svelte: { teks: "SV", warna: "#ff3e00" },
};

function ekstensiDari(name) {
  const m = String(name || "")
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function tsjFileType(name, dir) {
  if (dir) return "folder";
  const n = (name || "").toLowerCase();
  if (/\.pdf$/.test(n)) return "pdf";
  if (
    /\.(md|markdown|txt)$/.test(n) ||
    /^(readme|changelog|news|authors|history)/.test(n)
  )
    return "info";
  if (
    /^(copying|license|licence)/.test(n) ||
    /\.(pem|key|crt|cert|env)$/.test(n)
  )
    return "key";
  // Bahasa diperiksa SESUDAH kasus khusus di atas: README.md tetap ikon info,
  // bukan monogram "MD" — namanya lebih memberi tahu daripada ekstensinya.
  const ext = ekstensiDari(n);
  if (BAHASA_IKON[ext]) return "lang:" + ext;
  return "file";
}
// Bangun pohon HANYA dari file yang SEDANG DIKEMBANGKAN (ditulis/diedit agent),
// bukan seluruh isi folder. `paths` = daftar path file yang disentuh; `root` =
// folder proyek web (untuk memangkas prefix agar path tampil relatif & ringkas).
// Hasilnya [{ name, depth, type }] — folder perantara ikut ditampilkan supaya
// struktur terlihat, tapi hanya cabang menuju file yang dikembangkan.
function buildDevTree(paths, root) {
  const rootN = String(root || "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
  const rootNode = { children: {} };
  for (const raw of paths || []) {
    let s = String(raw || "").replace(/\\/g, "/");
    const sl = s.toLowerCase();
    if (rootN && sl.startsWith(rootN + "/")) s = s.slice(rootN.length + 1);
    s = s.replace(/^\/+/, "").replace(/^[a-zA-Z]:\//, ""); // buang drive bila tak ter-strip root
    const parts = s.split("/").filter(Boolean);
    if (!parts.length) continue;
    let cur = rootNode;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      cur.children[part] = cur.children[part] || {
        name: part,
        isFile,
        children: {},
      };
      if (!isFile) cur.children[part].isFile = false; // punya anak → pasti folder
      cur = cur.children[part];
    });
  }
  const out = [];
  const walk = (node, depth, pre) => {
    const kids = Object.values(node.children);
    const cmp = (a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    kids
      .filter((k) => !k.isFile)
      .sort(cmp)
      .forEach((d) => {
        out.push({ name: d.name, depth, type: "folder", rel: pre + d.name });
        walk(d, depth + 1, pre + d.name + "/");
      });
    kids
      .filter((k) => k.isFile)
      .sort(cmp)
      .forEach((f) =>
        out.push({
          name: f.name,
          depth,
          type: tsjFileType(f.name, false),
          // Path RELATIF terhadap root, dirakit saat menyusun pohon. Tanpa ini
          // node cuma punya nama, dan nama saja tak cukup untuk membuka
          // berkasnya — dua "index.html" di folder berbeda tak terbedakan.
          rel: pre + f.name,
        }),
      );
  };
  walk(rootNode, 0, "");
  return out;
}
/* ── Panel kode di sisi kanan view Logic ──
   Tata letaknya mengikuti VS Code: pohon berkas di kiri, isi berkas di kanan.

   Isinya diambil lewat /preview-file?raw=1 — bukan jalur preview biasa, yang
   menyuntikkan <base> ke berkas HTML supaya link relatifnya resolve. Suntikan
   itu benar untuk preview dan salah untuk editor: yang tampil bukan lagi isi
   berkasnya, dan pemakai membaca satu baris yang tidak ada di disk.

   Editor dibuat SEKALI lalu modelnya diganti tiap berpindah berkas. Membuat
   ulang editor tiap klik menumpuk observer Monaco, dan itu jalur yang persis
   sudah pernah meledak di repo ini (lihat tests/monaco-dekat-layar.test.js). */
function LogicCodePane({ root, rel }) {
  const hostRef = React.useRef(null);
  const edRef = React.useRef(null);
  const [galat, setGalat] = React.useState("");
  const [muat, setMuat] = React.useState(false);

  React.useEffect(() => {
    let dibuang = false;
    if (!window.monacoReady || !hostRef.current) return;
    window.monacoReady.then((monaco) => {
      if (dibuang || !hostRef.current || edRef.current) return;
      edRef.current = monaco.editor.create(hostRef.current, {
        value: "",
        language: "plaintext",
        theme: "vs-dark",
        automaticLayout: true,
        readOnly: true,
        domReadOnly: true,
        minimap: { enabled: true },
        fontSize: 12,
        scrollBeyondLastLine: false,
        wordWrap: "off",
      });
    });
    return () => {
      dibuang = true;
      if (edRef.current) {
        const m = edRef.current.getModel();
        if (m) m.dispose();
        edRef.current.dispose();
        edRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (!rel) return;
    let dibatalkan = false;
    setGalat("");
    setMuat(true);
    const abs = String(root || "").replace(/[\/]+$/, "") + "/" + rel;
    fetch("/preview-file?raw=1&path=" + encodeURIComponent(abs))
      .then((r) =>
        r.ok ? r.text() : Promise.reject(new Error("HTTP " + r.status)),
      )
      .then((teks) => {
        if (dibatalkan) return;
        setMuat(false);
        const ed = edRef.current;
        if (!ed || !window.monaco) return;
        const lama = ed.getModel();
        const bahasa = bahasaMonaco(rel);
        ed.setModel(window.monaco.editor.createModel(teks, bahasa));
        // Model lama dibuang SESUDAH yang baru dipasang: membuangnya lebih dulu
        // membuat editor sempat kehilangan model dan melempar.
        if (lama) lama.dispose();
      })
      .catch((e) => {
        if (dibatalkan) return;
        setMuat(false);
        setGalat(String(e.message || e));
      });
    return () => {
      dibatalkan = true;
    };
  }, [root, rel]);

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        background: "#0b1016",
      }}
    >
      <div
        style={{
          height: "38px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "0 12px",
          borderBottom: "1px solid #212a36",
          fontSize: "12px",
          color: "#768390",
          fontFamily: "ui-monospace, monospace",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {rel || "Pilih berkas di kiri"}
        {muat && <span style={{ opacity: 0.6 }}>memuat…</span>}
        {galat && <span style={{ color: "#f85149" }}>{galat}</span>}
      </div>
      <div ref={hostRef} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
}

// Ekstensi -> bahasa Monaco. Dipisah dari BAHASA_IKON karena keduanya menjawab
// pertanyaan berbeda: yang satu "ikon apa", yang ini "penyorot mana".
function bahasaMonaco(nama) {
  const e = ekstensiDari(nama);
  const peta = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    h: "c",
    cpp: "cpp",
    cs: "csharp",
    php: "php",
    dart: "dart",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    sh: "shell",
    ps1: "powershell",
    sql: "sql",
    xml: "xml",
    md: "markdown",
  };
  return peta[e] || "plaintext";
}

function LogicFileTree({ files, root, active, terpilih, onPilih }) {
  const [tab, setTab] = React.useState("files");
  const tree = buildDevTree(files, root);
  const icon = (t) => {
    // Monogram bahasa: kotak kecil berwarna khas bahasanya. Dirender sebagai
    // SVG (bukan <span> ber-CSS) supaya ia sejajar dengan ikon lain yang sudah
    // SVG, dan ukurannya tak ikut berubah saat font halaman berubah.
    if (typeof t === "string" && t.startsWith("lang:")) {
      const b = BAHASA_IKON[t.slice(5)];
      if (b)
        return (
          <svg width="16" height="16" viewBox="0 0 16 16">
            <rect
              x="0.5"
              y="0.5"
              width="15"
              height="15"
              rx="3"
              fill={b.warna}
              opacity="0.16"
              stroke={b.warna}
              strokeOpacity="0.5"
            />
            <text
              x="8"
              y="11.5"
              textAnchor="middle"
              fill={b.warna}
              fontSize={b.teks.length > 2 ? "6" : "7.5"}
              fontWeight="700"
              fontFamily="ui-monospace, monospace"
            >
              {b.teks}
            </text>
          </svg>
        );
    }
    if (t === "folder")
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#54aeff"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1H3z" />
          <path d="M3 10h18l-1.5 8a2 2 0 0 1-2 1.6H6.5a2 2 0 0 1-2-1.6z" />
        </svg>
      );
    if (t === "pdf")
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#f85149"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    if (t === "key")
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#e3b341"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="7.5" cy="15.5" r="4.5" />
          <path d="M10.7 12.3 20 3" />
          <path d="m17 6 3 3" />
          <path d="m15 8 2 2" />
        </svg>
      );
    if (t === "info")
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#54aeff"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <circle cx="12" cy="8" r="0.6" fill="#54aeff" />
        </svg>
      );
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#768390"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="16" y2="17" />
      </svg>
    );
  };
  return (
    <div
      style={{
        // Sidebar tetap 244px: panel kode di kanannya yang menyerap sisa lebar,
        // sama seperti VS Code.
        width: "244px",
        flex: "0 0 auto",
        flexShrink: 0,
        minWidth: 0,
        background: "#0c1219",
        borderRight: "1px solid #212a36",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: "38px",
          padding: "0 8px 0 12px",
          borderBottom: "1px solid #212a36",
          gap: "4px",
        }}
      >
        <div style={{ display: "flex", gap: "16px", flex: 1 }}>
          {["changes", "files"].map((t) => (
            <span
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontSize: "13px",
                cursor: "pointer",
                padding: "9px 0",
                color: tab === t ? "#e6edf3" : "#6f7d92",
                borderBottom:
                  tab === t ? "2px solid #4c8bf5" : "2px solid transparent",
                transition: "color .1s",
              }}
            >
              {t === "changes" ? "Changes" : "Files"}
            </span>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2px",
            color: "#6f7d92",
          }}
        >
          <button
            className="btn-reset"
            title="Search"
            style={{
              color: "inherit",
              width: "24px",
              height: "24px",
              borderRadius: "5px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <button
            className="btn-reset"
            title="Collapse all"
            style={{
              color: "inherit",
              width: "24px",
              height: "24px",
              borderRadius: "5px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      </div>
      {tab === "changes" ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#4b5563",
            fontSize: "12px",
            padding: "24px",
            textAlign: "center",
          }}
        >
          Tak ada perubahan.
        </div>
      ) : !active ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            color: "#5b6673",
            fontSize: "12px",
            padding: "24px",
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#3a444f"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <div>
            Files appear here when you ask the agent
            <br />
            to build a site (e.g. generate HTML).
          </div>
        </div>
      ) : tree.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#4b5563",
            fontSize: "12px",
            padding: "24px",
            textAlign: "center",
          }}
        >
          No files being developed yet.
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {tree.map((n, i) => (
            <div
              key={i}
              title={n.rel || n.name}
              onClick={() =>
                n.type !== "folder" && onPilih && onPilih(n.rel || n.name)
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                height: "24px",
                paddingRight: "10px",
                paddingLeft: 10 + n.depth * 14 + "px",
                cursor: n.type === "folder" ? "default" : "pointer",
                color: n.type === "folder" ? "#cdd9e5" : "#adbac7",
                fontSize: "13px",
                whiteSpace: "nowrap",
                // Berkas yang sedang dibuka ditandai TETAP, bukan cuma saat
                // hover — tanpa itu, begitu tetikus bergerak tak ada lagi yang
                // memberi tahu isi editor di kanan milik berkas yang mana.
                background:
                  n.rel && n.rel === terpilih ? "#1b2431" : "transparent",
              }}
              onMouseEnter={(e) => {
                if (n.rel !== terpilih)
                  e.currentTarget.style.background = "#141c26";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  n.rel && n.rel === terpilih ? "#1b2431" : "transparent";
              }}
            >
              {n.type === "folder" ? (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="#768390"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0, transform: "rotate(90deg)" }}
                >
                  <path d="M6 4l4 4-4 4" />
                </svg>
              ) : (
                <span style={{ width: "12px", flexShrink: 0 }} />
              )}
              <span style={{ flexShrink: 0, display: "inline-flex" }}>
                {icon(n.type)}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {n.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

  const [selectedProject, setSelectedProject] = useState(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("wolfspace_projects_list") || "[]",
      );
      if (stored && stored.length > 0 && stored[0].path) return stored[0].path;
    } catch (_) {}
    return WOLFSPACE_ROOT_WIN;
  });
  const [hitlRequest, setHitlRequest] = React.useState(null);

  React.useEffect(() => {
    const checkSelectedProject = () => {
      try {
        const deleted = JSON.parse(
          localStorage.getItem("wolfspace_deleted_workspaces") || "[]",
        );
        // Path-exact saja (lihat isPathDeleted) — tak lagi cocok nama/suffix.
        const isDel = (pStr) => isPathDeleted(deleted, pStr);
        if (isDel(selectedProject)) {
          const stored = JSON.parse(
            localStorage.getItem("wolfspace_projects_list") || "[]",
          );
          const valid = stored.filter((p) => !isDel(p.path));
          if (valid.length > 0 && valid[0].path)
            setSelectedProject(valid[0].path);
          else if (!isDel(WOLFSPACE_ROOT_WIN))
            setSelectedProject(WOLFSPACE_ROOT_WIN);
          else setSelectedProject("");
        }
      } catch (_) {}
    };
    window.addEventListener(
      "wolfspace_workspaces_changed",
      checkSelectedProject,
    );
    return () =>
      window.removeEventListener(
        "wolfspace_workspaces_changed",
        checkSelectedProject,
      );
  }, [selectedProject]);
  window.testHitl = function () {
    setHitlRequest({
      kind: "hitl",
      title: "Allow check if node-pty is installed?",
      code: "cmd /c npm ls node-pty",
      options: [
        { value: "allow_once", text: "Yes, allow this time" },
        {
          value: "allow_project",
          text: "Yes, and always allow in this project",
        },
        { value: "allow_always", text: "Yes, and always allow" },
        { value: "deny", text: "No (tell the agent what to do instead)" },
      ],
    });
  };
  const handleHitlResolve = (val) => {
    console.log("HITL resolved with:", val);
    const req = hitlRequest;
    setHitlRequest(null);
    if (!req) return;
    if (req.kind === "continue") {
      // Jeda batas-langkah (checkpoint) — bukan HITL persetujuan. "Lanjutkan"
      // meneruskan run dari checkpoint dengan plafon langkah diperpanjang.
      if (val === "continue") {
        doSend("", null, { thread_id: req.thread_id, continue_response: true });
      } else {
        setBusy(false); // user memilih berhenti; edit yang sudah ada dipertahankan
      }
      return;
    }
    if (req.kind === "ask") {
      // Question tool: send the selected answer as a normal user message so the agent can continue.
      if (val === "deny" || val === null || val === undefined) {
        setBusy(false);
        setTimeout(
          () =>
            doSend(
              "The user chose not to answer. Please continue with your best assumption.",
              null,
            ),
          50,
        );
      } else {
        setTimeout(() => doSend(String(val), null), 50);
      }
      return;
    }
    // HITL approval flow
    if (val === "deny" || val === null || val === undefined) {
      // Cancel: reset busy and send denial message as new user message
      setBusy(false);
      setTimeout(
        () =>
          doSend(
            "Action cancelled by the user. Please reassess and try a different approach.",
            null,
          ),
        50,
      );
    } else {
      // Allow: resume the agent with HITL approval (content empty is OK now that doSend checks hitlData)
      doSend("", null, { thread_id: req.thread_id, hitl_response: true });
    }
  };

  const [models, setModels] = useState([
    { value: "", label: "Loading models…", disabled: true },
  ]);
  const [modelVal, setModelVal] = useState("");
  const [cloudVersion, setCloudVersion] = useState(0); // Trigger reload when cloud config changes

  const [panelOpen, setPanelOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  // File yang SEDANG DIKEMBANGKAN (ditulis/diedit agent) — sumber untuk sidebar
  // Logic. Berbeda dari "semua isi folder": hanya file yang benar-benar disentuh
  // agent di sesi ini. Direset saat ganti workspace.
  const [devFiles, setDevFiles] = useState([]);
  useEffect(() => {
    setDevFiles([]);
  }, [selectedProject]);
  useEffect(() => {
    const onAct = (e) => {
      const d = (e && e.detail) || {};
      if (!/write|edit|create|apply|save/i.test(String(d.kind || ""))) return;
      if (d.ok === false) return; // tulisan gagal — jangan catat
      let p = String(d.path || "");
      if (!p) {
        const m = String(d.arg || "").match(
          /([^\s"'`]+\.[a-zA-Z0-9]{1,8})(?=[\s"'`]|$)/,
        );
        if (m) p = m[1];
      }
      if (!p) return;
      p = p.replace(/\\/g, "/");
      setDevFiles((prev) => (prev.indexOf(p) >= 0 ? prev : prev.concat(p)));
    };
    window.addEventListener("wolfspace_agent_act", onAct);
    return () => window.removeEventListener("wolfspace_agent_act", onAct);
  }, []);
  // Web Dev Live Browser: state, auto-preview saat agent menulis .html, dan
  // ref iframe kini satu hook di public/app/usePreviewPanel.jsx.
  const preview = usePreviewPanel({
    selectedProject,
    onAutoOpen: () => setPanelOpen(true),
  });
  const getPreviewDoc = preview.getDoc;

  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  // Checklist todowrite, DI TINGKAT APLIKASI — bukan di dalam state satu pesan.
  //
  // Dulu ia hidup sebagai run.todos milik tiap gelembung agent, jadi ia ikut
  // tergulung naik bersama pesannya begitu percakapan berlanjut: daftar yang
  // gunanya justru untuk dilihat SELAMA bekerja malah hilang dari layar paling
  // cepat. Di sini ia satu daftar untuk seluruh sesi, dirender tepat di atas
  // kotak ketik supaya selalu di tempat yang sama.
  const [todos, setTodos] = useState([]);
  // Berkas yang sedang dibuka di panel kode view Logic (path RELATIF terhadap
  // root proyek). Disimpan di sini, bukan di dalam LogicFileTree, karena dua
  // panel memakainya: pohon untuk menandai baris aktif, editor untuk memuat.
  const [logicBerkas, setLogicBerkas] = useState("");
  const [status, setStatus] = useState("Loading models…");
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

  const [currentChatId, setCurrentChatId] = useState(null);
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      const saved = JSON.parse(localStorage.getItem("wolfspace_chats") || "[]");
      const cid = currentChatId || Date.now();
      if (!currentChatId) setCurrentChatId(cid);

      const existingIndex = saved.findIndex((c) => c.id === cid);
      if (existingIndex >= 0) {
        saved[existingIndex] = {
          ...saved[existingIndex],
          title:
            saved[existingIndex].title && saved[existingIndex].title !== "Chat"
              ? saved[existingIndex].title
              : messages[0]?.text?.slice(0, 60) || "Chat",
          messages: messages,
          history: history,
          savedAt: new Date().toISOString(),
          project: selectedProject,
        };
      } else {
        saved.push({
          id: cid,
          title: messages[0]?.text?.slice(0, 60) || "Chat",
          messages: messages,
          history: history,
          savedAt: new Date().toISOString(),
          project: selectedProject,
        });
      }
      localStorage.setItem("wolfspace_chats", JSON.stringify(saved));
      setSavedChats(saved);
    } catch (e) {}
  }, [messages, history, selectedProject, currentChatId]);
  const loadSavedChats = () => {
    try {
      setSavedChats(
        JSON.parse(localStorage.getItem("wolfspace_chats") || "[]"),
      );
    } catch (e) {}
  };
  const restoreChat = (chat) => {
    setCurrentChatId(chat.id);
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
      const updated = list.map((c) =>
        c.id === id ? { ...c, title: newTitle.trim() } : c,
      );
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
        setStatus(
          "Gunakan /terminal run <perintah>, /terminal open, /terminal close",
        );
        return true;
      }
      if (sub === "open") {
        setTerminalOpen(true);
        setStatus("Terminal is already open.");
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
          setStatus("Terminal ready. Type a command to begin.");
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
        setStatus("Terminal is already open.");
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
          (cloud.model || cloud.name || cloud.provider || "").replace(
            /-/g,
            " ",
          ) + (cloud.key ? " •" + cloud.key.slice(-4) : ""),
      });
    if (!opts.length)
      opts.push({ value: "", label: "No models yet", disabled: true });
    setModels(opts);
    const def = hasCloud
      ? "cloud"
      : (opts.find((o) => o.default) || opts[0]).value;
    setModelVal((v) => (v && opts.some((o) => o.value === v) ? v : def));
    setStatus(
      hasCloud
        ? "cloud: " + (cloud.name || cloud.provider)
        : opts.length
          ? "ready"
          : "Run start-models",
    );
  }, [cloudVersion]);
  useEffect(() => {
    loadModels();
  }, [cloudVersion]);
  // Warn if server isn't running (for browser users, not Electron)
  useEffect(() => {
    if (!IPC) {
      checkServerHealth().then((ok) => {
        if (!ok) setStatus("Run 'npm start' in a terminal.");
      });
    }
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const labelOf = (v) => (models.find((m) => m.value === v) || {}).label || v;

  // Memisahkan APA YANG DIKIRIM ke model dari APA YANG DILIHAT user.
  //
  // Lampiran dulu ikut mendarat di gelembung chat sebagai baris teks mentah
  // ("- [Terlampir] a.pdf … — id: att_57a5…"). Handle itu memang harus sampai
  // ke model — ia satu-satunya cara agent membaca lampiran — tapi tak ada
  // gunanya dibaca manusia, dan sesudah jembatan handle dipasang ia jadi makin
  // panjang serta makin tak terbaca.
  //
  // Parameter `display` sudah lama ada untuk keperluan ini, hanya tak pernah
  // dipakai Composer. Sekarang ia boleh berupa objek {text, attachments}:
  // `text` yang tampil di gelembung, `attachments` dirender sebagai kartu.
  // Bentuk string lama tetap didukung — beberapa pemanggil lain memakainya.
  const _pesanUser = (content, display) => {
    if (display && typeof display === "object")
      return {
        text: display.text || "",
        attachments: display.attachments || [],
      };
    return { text: display || content };
  };

  const doSend = async (content, display, hitlData = null) => {
    if (!content && !hitlData) return;
    const trimmedContent = content.trim();
    if (
      trimmedContent.toLowerCase() === "/openclaw" ||
      trimmedContent.toLowerCase().startsWith("/openclaw ")
    ) {
      if (busy) return;
      const openclawMessage = trimmedContent
        .replace(/^\/openclaw\b/i, "")
        .trim();
      if (!openclawMessage) {
        setMessages((m) => [
          ...m,
          {
            role: "user",
            ..._pesanUser(content, display),
          },
          {
            role: "model",
            text: "The /openclaw message cannot be empty. Example: /openclaw summarise this project",
          },
        ]);
        setStatus("OpenClaw needs a message");
        return;
      }
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setBusy(true);
      setStatus("Running OpenClaw...");
      setMessages((m) => [
        ...m,
        {
          role: "user",
          ..._pesanUser(content, display),
        },
        { role: "model", text: "Running OpenClaw..." },
      ]);
      try {
        const res = await runOpenClawChat(openclawMessage, ctrl.signal);
        const reply =
          res.text || res.raw || "OpenClaw finished with no output.";
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
        setStatus("OpenClaw finished");
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
        if (!content) {
          setStatus("Type a question after /ask, e.g. /ask what does X do");
          return;
        }
      }
    }
    if (content.trim().startsWith("/") && (await handleSlashCommand(content)))
      return;
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
    const useAgent =
      !!hitlData || (modelVal === "cloud" && !_localCloud && !askMode);
    if (!useAgent) {
      // Bridge / local model: plain conversational chat (text streaming, no function-calling).
      setMessages((m) => [
        ...m,
        {
          role: "user",
          ..._pesanUser(content, display),
        },
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
        setStatus("ready");
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
          {
            role: "user",
            ..._pesanUser(content, display),
          },
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
        const curEffort = readEffort(getCloud());
        await streamSelfAgent(
          {
            history: newHist,
            cloud: getCloud(),
            port: modelVal,
            effort: curEffort,
            workspace_root: resolveWorkspaceRoot(selectedProject) || undefined,
            // Run yang terputus reload disambung, bukan diulang. hitlData tetap
            // menang karena di-spread SESUDAH ini.
            thread_id: ambilThreadTerputus() || undefined,
            ...hitlData,
          },
          (j) => {
            if (j.thread_id) simpanThreadTerputus(j.thread_id);
            if (j.t === "backup") upd({ backup: j.dir });
            // model_wait: satu-satunya tanda hidup selama menunggu.
            // Dulu di-emit backend tapi TAK ADA penanganannya di sini, dan tak
            // ada cabang penampung — jadi hilang senyap. Akibatnya seluruh masa
            // tunggu tampak sebagai layar diam: panggilan model yang 64 detik,
            // dan penyiapan MCP yang sampai 60 detik. Justru saat itulah user
            // paling butuh tahu agent masih hidup.
            else if (j.t === "model_wait") upd({ status: j.m, busy: true });
            // force_retry: pengulangan agent, dari ENAM titik emit di backend.
            // Didorong sebagai baris timeline ber-type "act" supaya memakai
            // penampil yang sudah ada — tak perlu penampil baru, dan sebabnya
            // ikut terlihat. Tanpa ini, setiap putaran ulang tampak sebagai
            // layar diam dan terbaca seolah run berhenti sendiri.
            else if (j.t === "force_retry") {
              evlist.push({
                type: "act",
                kind: "retry",
                arg: j.m,
                ok: true,
                output: j.m,
              });
              upd({ events: [...evlist], status: j.m, busy: true });
            }
            // todos: keadaan checklist. Disimpan sebagai STATE, bukan baris
            // timeline — isinya sudah muncul lewat keluaran tool todowrite,
            // jadi mendorongnya ke timeline hanya menggandakan.
            //
            // Sekarang masuk ke state TINGKAT APLIKASI, bukan ke state pesan.
            // Sebagai run.todos ia ikut tergulung naik bersama gelembungnya,
            // jadi daftar yang gunanya untuk dilihat SELAMA bekerja malah
            // paling cepat hilang dari layar. Panelnya kini duduk tetap di atas
            // kotak ketik.
            else if (j.t === "todos") setTodos(j.todos || []);
            else if (j.t === "step") {
              think = "";
              upd({ step: j.n, thinking: "", status: "" });
            } else if (j.t === "tok") {
              think += j.c;
              upd({ thinking: think });
            } else if (j.t === "thought") {
              think = "";
              evlist.push({
                type: "thought",
                kind: j.tool,
                arg: j.c,
                ok: j.ok,
                output: j.c,
              });
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
              try {
                window.dispatchEvent(
                  new CustomEvent("wolfspace_agent_act", {
                    detail: {
                      kind: j.kind,
                      arg: j.arg,
                      ok: j.ok,
                      output: j.output,
                      path: j.path,
                    },
                  }),
                );
              } catch (_) {}
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
                kind: "hitl",
                title: j.request.title,
                code: j.request.code,
                thread_id: j.thread_id,
                options: [
                  { value: "allow_once", text: "Allow once" },
                  {
                    value: "deny",
                    text: "Tolak (Minta agen mencari cara lain)",
                  },
                ],
              });
            } else if (j.t === "ask") {
              adoneSent = true;
              waitingForInput = true;
              setHitlRequest({
                kind: "ask",
                title: "Question from the Agent",
                code: j.question || "",
                thread_id: j.thread_id || null,
                options: (j.choices || []).map((c) => ({ value: c, text: c })),
              });
              upd({ thinking: "Menunggu jawaban Anda...", busy: true });
            } else if (j.t === "adone") {
              if (j.hitlPending && j.thread_id) {
                // Agent paused for HITL — keep busy=true, just ensure thread_id is updated
                adoneSent = true;
                waitingForInput = true;
                setHitlRequest((prev) =>
                  prev
                    ? { ...prev, thread_id: j.thread_id }
                    : {
                        kind: "hitl",
                        title: "Menunggu Persetujuan",
                        code: "",
                        thread_id: j.thread_id,
                        options: [
                          { value: "allow_once", text: "Allow once" },
                          { value: "deny", text: "Tolak" },
                        ],
                      },
                );
                upd({ thinking: "Menunggu persetujuan Anda...", busy: true });
                return; // Don't set done/busy=false
              }
              if (j.continuable && j.thread_id) {
                // Agent dijeda karena plafon langkah (checkpoint) — belum selesai,
                // bukan gagal. Tutup timeline dengan rapi lalu tawarkan "Lanjutkan".
                adoneSent = true;
                waitingForInput = true;
                upd({
                  busy: false,
                  done: true,
                  summary: j.summary,
                  editCount: j.edits,
                  backup: j.backup,
                });
                setHitlRequest({
                  kind: "continue",
                  title: "Agent paused (step limit)",
                  code: j.summary || "",
                  thread_id: j.thread_id,
                  options: [
                    { value: "continue", text: "Continue" },
                    { value: "deny", text: "Done (stop here)" },
                  ],
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
                // `run` DIHAPUS: self_agent tak lagi memancarkannya. Dulu isinya
                // {ok:true, info:"auto-run disabled"} dari runReply yang tak
                // menjalankan apa pun — ok:true tanpa eksekusi di baliknya.
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
      // Run tuntas (bukan sekadar menunggu jawaban) -> thread tak boleh tersisa,
      // supaya pesan berikutnya yang tak berhubungan tidak ikut tersambung.
      if (!waitingForInput) simpanThreadTerputus(null);
      // If no "adone" event was sent, provide a default summary based on events
      if (!adoneSent) {
        if (!hadError) {
          const summary =
            evlist.length > 0
              ? `Selesai. ${evlist.length} operasi dieksekusi.`
              : "Done. No operations were performed.";
          upd({ busy: false, done: true, summary });
          setHistory((h) => [...h, { role: "assistant", content: summary }]);
        } else {
          upd({ busy: false });
        }
      }
      if (!waitingForInput) {
        setBusy(false); // Reset global busy state only when not waiting for HITL/answer
      }
      setStatus("ready");
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
    setCurrentChatId(null);
    setMessages([]);
    setHistory([]);
    setBusy(false);
    setStatus("Ready.");
  };
  const saveChat = () => {
    // Digantikan oleh useEffect auto-save agar tidak duplikat
  };

  return (
    <>
      <div className={"app has-sidebar" + (sbCollapsed ? " sb-collapsed" : "")}>
        {!pickerDone && (
          <ProjectPickerScreen
            models={models}
            modelVal={modelVal}
            setModelVal={setModelVal}
            onStart={(msg, project, tampil) => {
              setSelectedProject(project);
              setPickerDone(true);
              setTimeout(() => doSend(msg, tampil), 0);
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
          selectedProject={selectedProject}
          onOpenPicker={() => {
            setPickerDone(false);
          }}
        />
        <div className="page-container">
          <div
            className={
              "page chat-page " + (view === "chat" ? "active" : "exit")
            }
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
                  flex:
                    "1 1 " +
                    Math.max(
                      20,
                      100 -
                        (terminalOpen ? terminalPct : 0) -
                        (panelOpen ? panelPct : 0),
                    ) +
                    "%",
                }}
              >
                <div
                  className="chat-scroll"
                  ref={scrollRef}
                  onClick={(e) => {
                    if (
                      e.target.tagName === "IMG" &&
                      (e.target.src || e.target.getAttribute("src"))
                    ) {
                      setGlobalPreviewItem({
                        url: e.target.src || e.target.getAttribute("src"),
                        name: e.target.alt || "Preview Gambar / Screenshot",
                      });
                    }
                  }}
                >
                  {messages.length === 0 ? (
                    <div className="chat-inner"></div>
                  ) : (
                    <div className="chat-inner">
                      {messages.map((m, i) => (
                        <Message key={i} msg={m} />
                      ))}
                    </div>
                  )}
                </div>
                <HitlModal
                  request={hitlRequest}
                  onResolve={handleHitlResolve}
                />
                <LightboxModal
                  item={globalPreviewItem}
                  onClose={() => setGlobalPreviewItem(null)}
                />
                <Composer
                  models={models}
                  modelVal={modelVal}
                  setModelVal={setModelVal}
                  onSend={(t, tampil) => doSend(t, tampil)}
                  onCancel={cancel}
                  busy={busy}
                  todos={todos}
                  onClearTodos={() => setTodos([])}
                  onToggleTodo={(i) =>
                    setTodos((d) =>
                      d.map((t, j) =>
                        j === i
                          ? {
                              ...t,
                              status:
                                (t.status || "") === "completed"
                                  ? "pending"
                                  : "completed",
                            }
                          : t,
                      ),
                    )
                  }
                />
              </div>
              {terminalOpen && (
                <>
                  <div
                    className="split-divider"
                    onMouseDown={onTerminalDividerDown}
                  />
                  <div
                    className="terminal-col"
                    style={{
                      flex: "0 0 " + terminalPct + "%",
                      display: "flex",
                      flexDirection: "column",
                      minWidth: 0,
                      minHeight: 0,
                      overflow: "hidden",
                    }}
                  >
                    <VSCodeTerminal
                      selectedProject={selectedProject}
                      onClose={() => setTerminalOpen(false)}
                      terminalOutput={terminalOutput}
                      messages={messages}
                    />
                  </div>
                </>
              )}
              {panelOpen && (
                <>
                  <div
                    className="split-divider"
                    onMouseDown={onPanelDividerDown}
                  />
                  <div
                    className="canvas-col"
                    style={{
                      flex: "0 0 " + panelPct + "%",
                      background: "var(--surface-1)",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div
                      style={{
                        height: "46px",
                        borderBottom: "1px solid var(--line)",
                        padding: "0 14px 0 36px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "10px",
                        flexShrink: 0,
                        position: "relative",
                      }}
                    >
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
                        <svg
                          width="10"
                          height="20"
                          viewBox="0 0 10 20"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <circle cx="5" cy="4" r="1.6" fill="#ffffff"></circle>
                          <circle
                            cx="5"
                            cy="10"
                            r="1.6"
                            fill="#ffffff"
                          ></circle>
                          <circle
                            cx="5"
                            cy="16"
                            r="1.6"
                            fill="#ffffff"
                          ></circle>
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
                            className="btn-reset"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              width: "100%",
                              padding: "8px 16px",
                              color: "#e2e8f0",
                              fontSize: "13px",
                              fontFamily: "inherit",
                              textAlign: "left",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.08)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                            onClick={() => {
                              // Buka overlay kanvas Logic (React Flow) di atas UI chat.
                              setPanelMenuOpen(false);
                              setLogicOpen(true);
                            }}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect
                                x="3"
                                y="4"
                                width="6"
                                height="5"
                                rx="1"
                              ></rect>
                              <rect
                                x="15"
                                y="9"
                                width="6"
                                height="5"
                                rx="1"
                              ></rect>
                              <rect
                                x="9"
                                y="15"
                                width="6"
                                height="5"
                                rx="1"
                              ></rect>
                              <path d="M9 6.5h3a2 2 0 0 1 2 2v.5M9 17.5H6a2 2 0 0 1-2-2V9"></path>
                            </svg>
                            <span>Logic</span>
                          </button>
                          <button
                            className="btn-reset"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              width: "100%",
                              padding: "8px 16px",
                              color: "#e2e8f0",
                              fontSize: "13px",
                              fontFamily: "inherit",
                              textAlign: "left",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.08)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                            onClick={() => {
                              setPanelMenuOpen(false);
                              startPicker();
                            }}
                          >
                            {SB.target({ width: 16, height: 16 })}
                            <span>Visual Picker</span>
                          </button>
                          <button
                            className="btn-reset"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              width: "100%",
                              padding: "8px 16px",
                              color: "#e2e8f0",
                              fontSize: "13px",
                              fontFamily: "inherit",
                              textAlign: "left",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.08)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                            onClick={() => {
                              setPanelMenuOpen(false);
                              startVisualDraw();
                            }}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"></path>
                              <path d="M13.5 6.5l4 4"></path>
                            </svg>
                            <span>Visual Draw</span>
                          </button>
                        </div>
                      )}
                      <div
                        style={{
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: "6px",
                          padding: "3px 10px",
                          gap: "6px",
                          minWidth: 0,
                        }}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#8b98a9"
                          strokeWidth="2"
                          style={{ flexShrink: 0 }}
                        >
                          <circle cx="12" cy="12" r="10" />
                          <circle cx="12" cy="12" r="4" />
                          <line x1="21.17" y1="8" x2="12" y2="8" />
                          <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
                          <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
                        </svg>
                        <input
                          type="text"
                          value={preview.inputUrl}
                          onChange={(e) => preview.setInputUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              preview.navigate(preview.inputUrl);
                          }}
                          placeholder="HTML path / URL (e.g. C:\...\index.html or http://localhost:3000)"
                          style={{
                            flex: 1,
                            background: "transparent",
                            border: "none",
                            color: "#e2e8f0",
                            fontSize: "12px",
                            outline: "none",
                            fontFamily: "inherit",
                            minWidth: 0,
                          }}
                        />
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "2px",
                          flexShrink: 0,
                        }}
                      >
                        <button
                          className="btn-reset"
                          title="Reload / Refresh preview"
                          onClick={() => preview.refresh()}
                          style={{
                            color: "#8b98a9",
                            padding: "4px 6px",
                            borderRadius: "4px",
                            display: "flex",
                            alignItems: "center",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "rgba(255,255,255,0.08)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "transparent")
                          }
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="23 4 23 10 17 10" />
                            <polyline points="1 20 1 14 7 14" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                          </svg>
                        </button>
                        <button
                          title="Open in an external tab/browser"
                          onClick={() => {
                            if (!preview.url && !preview.inputUrl) return;
                            const isHttp =
                              preview.inputUrl.startsWith("http://") ||
                              preview.inputUrl.startsWith("https://");
                            if (isHttp) {
                              window.open(preview.inputUrl, "_blank");
                            } else if (
                              window.WOLFSPACE &&
                              window.WOLFSPACE.ipc
                            ) {
                              // Electron: tak ada server HTTP di 8090 (app:// protocol-only),
                              // jadi browser eksternal manapun tak bisa menjangkau
                              // /preview-file. Buka file ASLI dari disk via file:// —
                              // setWindowOpenHandler meneruskannya ke shell.openExternal,
                              // yang meluncurkan browser default OS langsung ke file itu.
                              let p = String(preview.inputUrl).replace(
                                /\\/g,
                                "/",
                              );
                              if (!p.startsWith("/")) p = "/" + p;
                              window.open("file://" + encodeURI(p), "_blank");
                            } else {
                              // Mode server/browser biasa: /preview-file memang dilayani
                              // di origin yang sama — tab baru pada origin itu cukup.
                              window.open(
                                preview.url || preview.inputUrl,
                                "_blank",
                              );
                            }
                          }}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#8b98a9",
                            cursor: "pointer",
                            padding: "4px 6px",
                            borderRadius: "4px",
                            display: "flex",
                            alignItems: "center",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "rgba(255,255,255,0.08)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "transparent")
                          }
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </button>
                        <button
                          className="btn-reset"
                          title="Close panel"
                          onClick={() => setPanelOpen(false)}
                          style={{
                            color: "#8b98a9",
                            padding: "4px 6px",
                            borderRadius: "4px",
                            display: "flex",
                            alignItems: "center",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background =
                              "rgba(248,81,73,0.15)";
                            e.currentTarget.style.color = "#f85149";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = "#8b98a9";
                          }}
                        >
                          {/* Ikon-X SVG (bukan glyph teks '×') agar boks & alignment-nya
                            identik dengan tombol Reload/Buka-eksternal di sebelahnya. */}
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        position: "relative",
                        overflow: "hidden",
                        background: "#ffffff",
                      }}
                    >
                      {preview.url ? (
                        <iframe
                          ref={preview.iframeRef}
                          key={preview.refreshKey}
                          src={preview.url}
                          style={{
                            flex: 1,
                            width: "100%",
                            height: "100%",
                            border: "none",
                          }}
                          title="Live Web Dev Preview"
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                        />
                      ) : (
                        <div
                          style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "32px",
                            textAlign: "center",
                            color: "#8b98a9",
                            background: "#0f1318",
                          }}
                        >
                          <svg
                            width="48"
                            height="48"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#b594f5"
                            strokeWidth="1.5"
                            style={{ marginBottom: "16px", opacity: 0.8 }}
                          >
                            <rect
                              x="2"
                              y="3"
                              width="20"
                              height="14"
                              rx="2"
                              ry="2"
                            ></rect>
                            <line x1="8" y1="21" x2="16" y2="21"></line>
                            <line x1="12" y1="17" x2="12" y2="21"></line>
                          </svg>
                          <div
                            style={{
                              fontSize: "15px",
                              fontWeight: 600,
                              color: "#e2e8f0",
                              marginBottom: "8px",
                            }}
                          >
                            Web Dev Live Browser
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              maxWidth: "320px",
                              lineHeight: "1.6",
                            }}
                          >
                            LiveBrowser
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
              {logicOpen && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 60,
                    background: "var(--surface-1, #0f1318)",
                    display: "flex",
                    flexDirection: "column",
                    animation: "fadeIn 0.15s ease",
                  }}
                >
                  {/* Header panel Logic */}
                  <div
                    style={{
                      height: "46px",
                      flexShrink: 0,
                      borderBottom: "1px solid var(--line, #282e36)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0 14px",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        color: "#e2e8f0",
                        fontSize: "13px",
                        fontWeight: 600,
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="4" width="6" height="5" rx="1"></rect>
                        <rect x="15" y="9" width="6" height="5" rx="1"></rect>
                        <rect x="9" y="15" width="6" height="5" rx="1"></rect>
                        <path d="M9 6.5h3a2 2 0 0 1 2 2v.5M9 17.5H6a2 2 0 0 1-2-2V9"></path>
                      </svg>
                      <span>Logic</span>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 400,
                          color: "#6b7280",
                        }}
                      >
                        · React Flow canvas for driving a website
                      </span>
                    </div>
                    <button
                      className="btn-reset"
                      title="Close Logic"
                      onClick={() => setLogicOpen(false)}
                      style={{
                        color: "#8b98a9",
                        padding: "4px 6px",
                        borderRadius: "4px",
                        display: "flex",
                        alignItems: "center",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "rgba(248,81,73,0.15)";
                        e.currentTarget.style.color = "#f85149";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "#8b98a9";
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  {/* Isi Logic: pohon berkas di kiri, isi berkasnya di kanan
                      — tata letak yang sama dengan VS Code. */}
                  <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
                    <LogicFileTree
                      files={devFiles}
                      root={webProjectRoot(preview.url, selectedProject)}
                      active={!!preview.url}
                      terpilih={logicBerkas}
                      onPilih={setLogicBerkas}
                    />
                    <LogicCodePane
                      root={webProjectRoot(preview.url, selectedProject)}
                      rel={logicBerkas}
                    />
                  </div>
                </div>
              )}
            </div>
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
              "page hub-page " + (view === "plugins" ? "active" : "enter")
            }
          >
            {view === "plugins" && <PluginsView />}
          </div>
          <div
            className={
              "page hub-page " + (view === "agents" ? "active" : "enter")
            }
          >
            {/* Agent Runner dihapus */}
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
        </div>
      </div>
    </>
  );
}

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
    const errText =
      (error ? error.toString() : "Unknown Error") +
      "\n" +
      (errorInfo && errorInfo.componentStack ? errorInfo.componentStack : "");
    if (window.triggerAppRollback) {
      window.triggerAppRollback("[ErrorBoundary] " + errText);
    } else {
      sessionStorage.setItem("wolfspace_rollback_error", errText);
      if (window.location.search.indexOf("rollback=true") === -1) {
        window.location.replace("/?rollback=true");
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

if (!window._reactRoot) {
  window._reactRoot = ReactDOM.createRoot(document.getElementById("root"));
}
window._reactRoot.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
