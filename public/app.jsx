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

/* Icons dipindah ke public/app/Icons.tsx (APP_MODULES). */

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
// Cloud-only since the local llama.cpp/GGUF path was removed with the Model Hub:
// there is no second kind of model left to choose between, so there is no `port`
// branch either. A missing cloud key surfaces as a clear backend error rather
// than as a request pointing at a port that no longer means anything.
function reqFor(_modelVal, cloud, history) {
  return { history, cloud, effort: readEffort(cloud) };
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
  // Tak ada lagi `run`: cabang "run"/"retry" dulu membawa hasil auto-run, dan
  // agent/chat.cjs sudah tak memancarkan keduanya — ia hanya mengirim tok, err,
  // done. Menyimpannya berarti merawat keadaan yang selalu null.
  let acc = "";
  const handle = (j) => {
    if (j.t === "tok") {
      acc += j.c;
      onText(acc);
    } else if (j.t === "done") {
      onText(acc);
    } else if (j.t === "err") {
      acc += "\n[" + j.m + "]";
      onText(acc);
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
    return { text: acc };
  }
  const r = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqBody),
    signal,
  });
  await pumpSSE(r, signal, handle);
  return { text: acc };
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

/* Components dipindah ke public/app/Components.tsx (APP_MODULES). */

/* Sidebar dipindah ke public/app/Sidebar.tsx (APP_MODULES). */

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
// Ikon berkas per bahasa. Tabelnya ada di public/app/IkonBahasa.jsx, dihasilkan
// scripts/ikon-bahasa/build.cjs dari material-icon-theme (MIT) — tema ikon yang
// sama dengan yang dipakai VS Code, jadi ikonnya memang yang dikenali orang.
//
// Di-vendor sebagai satu modul, bukan dijadikan dependensi runtime: paket
// aslinya 1250 SVG (1,6 MB) sementara yang muncul di pohon ini cuma puluhan.
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
  if (IKON_BAHASA[ext]) return "lang:" + ext;
  return "file";
}
// Bangun pohon HANYA dari file yang SEDANG DIKEMBANGKAN (ditulis/diedit agent),
// bukan seluruh isi folder. `paths` = daftar path file yang disentuh; `root` =
// folder proyek web (untuk memangkas prefix agar path tampil relatif & ringkas).
// Hasilnya [{ name, depth, type }] — folder perantara ikut ditampilkan supaya
// struktur terlihat, tapi hanya cabang menuju file yang dikembangkan.
function buildDevTree(paths, root, folders) {
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
  // Folders created by hand are inserted explicitly. They cannot come from the
  // path list: that list holds FILES, and a folder with nothing in it leaves no
  // trace there — it would be created on disk and then never appear.
  for (const raw of folders || []) {
    let s = String(raw || "")
      .split(String.fromCharCode(92))
      .join("/")
      .replace(/^[/]+/, "")
      .replace(/[/]+$/, "");
    if (!s) continue;
    let cur = rootNode;
    for (const part of s.split("/").filter(Boolean)) {
      cur.children[part] = cur.children[part] || {
        name: part,
        isFile: false,
        children: {},
      };
      cur.children[part].isFile = false;
      cur = cur.children[part];
    }
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
function LogicCodePane({
  root,
  rel,
  onRun,
  onDaftarDebug,
  titikHenti,
  setTitikHenti,
  barisAktif,
  tabs,
  onPilihTab,
  onTutupTab,
  onGeserTab,
  onKotorBerubah,
}) {
  const hostRef = React.useRef(null);
  const edRef = React.useRef(null);
  const [galat, setGalat] = React.useState("");
  const [muat, setMuat] = React.useState(false);
  // ── Panel ini bisa DISUNTING, dan itu menuntut tiga hal ──
  //
  // Dulu editornya readOnly, jadi tak ada keadaan yang perlu dijaga. Begitu ia
  // bisa diketik, tiga hal jadi wajib: menandai bahwa ada perubahan yang belum
  // saved, mengingat berkas MANA yang sedang disunting, dan mencegah
  // pergantian berkas menelan ketikan yang belum disimpan.
  const [kotor, setKotor] = React.useState(false);
  // Salinan ref dari `kotor`. Run dibungkus useCallback, dan callback yang
  // membaca state langsung akan memegang nilai dari render saat ia dibuat —
  // artinya Run yang ditekan sesudah mengetik masih melihat "bersih" dan
  // melewatkan simpan tanpa satu pun tanda.
  const kotorRef = React.useRef(false);
  // Dirty state PER FILE. A single flag only describes the active file, and the
  // tab strip has to mark every file that has unsaved work.
  const kotorPerBerkas = React.useRef(new Map());
  const [saveState, setSaveState] = React.useState("");
  // relRef menyimpan berkas yang isinya SEDANG ada di editor. Prop `rel` sudah
  // berubah ke berkas baru sebelum isinya tiba, jadi menyimpan memakai `rel`
  // akan menulis isi berkas LAMA ke nama berkas BARU.
  const relRef = React.useRef(rel);

  // ── Titik henti ──
  //
  // Disimpan DI ATAS (app.jsx), bukan di sini: ia harus bertahan saat pemakai
  // berpindah berkas lalu kembali, dan harus terbaca oleh panel debug yang
  // bukan anak komponen ini.
  //
  // ubahTitikRef dipakai karena penangan klik Monaco dipasang SEKALI saat
  // editor dibuat. Kalau ia menutupi fungsi dari render saat itu, ia akan
  // selamanya melihat daftar titik henti yang kosong — klik pertama bekerja,
  // klik kedua "menghapus" titik yang menurutnya tak pernah ada.
  const ubahTitikRef = React.useRef(() => {});
  React.useEffect(() => {
    ubahTitikRef.current = (baris) => {
      if (!setTitikHenti) return;
      const berkas = relRef.current;
      if (!berkas) return;
      setTitikHenti((sblm) => {
        const ada = (sblm && sblm[berkas]) || [];
        const baru = ada.includes(baris)
          ? ada.filter((l) => l !== baris)
          : ada.concat(baris).sort((a, b) => a - b);
        return { ...(sblm || {}), [berkas]: baru };
      });
    };
  }, [setTitikHenti]);

  // Dekorasi digambar ulang tiap titik henti / baris aktif berubah. Koleksinya
  // dipegang di ref supaya yang lama benar-benar diganti, bukan ditumpuk —
  // menumpuk membuat titik henti yang dilepas tetap terlihat.
  const hiasRef = React.useRef(null);
  React.useEffect(() => {
    const ed = edRef.current;
    if (!ed || !window.monaco) return;
    const garis = (titikHenti && titikHenti[rel]) || [];
    const R = window.monaco.Range;
    const daftar = garis.map((l) => ({
      range: new R(l, 1, l, 1),
      options: {
        glyphMarginClassName: "dbg-titik-henti",
        glyphMarginHoverMessage: { value: "Breakpoint on line " + l },
        stickiness: 1, // ikut bergeser saat baris di atasnya disisipkan/dihapus
      },
    }));
    if (barisAktif && barisAktif.berkas === rel && barisAktif.baris)
      daftar.push({
        range: new R(barisAktif.baris, 1, barisAktif.baris, 1),
        options: {
          isWholeLine: true,
          className: "dbg-baris-aktif",
          glyphMarginClassName: "dbg-panah-aktif",
        },
      });
    hiasRef.current = ed.deltaDecorations(hiasRef.current || [], daftar);
  }, [titikHenti, rel, barisAktif, muat]);

  // Baris tempat debugger berhenti DIGULIRKAN ke tengah pandangan. Tanpa ini,
  // melangkah ke bagian berkas yang sedang tak terlihat tampak seperti tak ada
  // yang terjadi.
  React.useEffect(() => {
    const ed = edRef.current;
    if (!ed || !barisAktif || barisAktif.berkas !== rel || !barisAktif.baris)
      return;
    try {
      ed.revealLineInCenterIfOutsideViewport(barisAktif.baris);
    } catch (_) {}
  }, [barisAktif, rel]);

  React.useEffect(() => {
    let dibuang = false;
    if (!window.monacoReady || !hostRef.current) return;
    window.monacoReady.then((monaco) => {
      if (dibuang || !hostRef.current || edRef.current) return;
      pasangSaranPustaka(monaco);
      edRef.current = monaco.editor.create(hostRef.current, {
        value: "",
        language: "plaintext",
        theme: "wolfspace-gelap",
        automaticLayout: true,
        // Bisa disunting. Sebelumnya readOnly, dan itulah yang membuat panel
        // ini hanya bisa dibaca — melonggarkannya di sini adalah separuh
        // perbaikan; separuh lainnya adalah rute POST /ww/tulis-berkas.
        readOnly: false,
        domReadOnly: false,
        // false, sama seperti dua editor Monaco lain di aplikasi ini
        // (AgentSteps, CodeBlocks). Beda dari keduanya di sini menghasilkan
        // bug yang nyata: minimap punya SLIDER (kotak penunjuk viewport), dan
        // pada berkas pendek di panel sempit, slider itu memenuhi hampir
        // seluruh tinggi minimap — terlihat persis seperti satu garis biru
        // solid membentang penuh, bukan seperti minimap sama sekali.
        minimap: { enabled: false },
        fontSize: 12,
        scrollBeyondLastLine: false,
        wordWrap: "off",
        // Garis yang MASIH terlihat sesudah minimap dimatikan bukan sisa
        // minimap sama sekali — itu batas atas/bawah kotak highlight "baris
        // aktif", bawaan Monaco kalau renderLineHighlight tak disetel (default
        // "all"). Pada baris pertama, batas ATASNYA berimpit dengan tepi
        // editor, jadi yang terlihat cuma satu garis membentang penuh persis
        // di bawah header panel — gejala yang sama sekali beda dari minimap,
        // tapi kelihatan serupa: satu garis solid selebar panel.
        //
        // Dua editor Monaco lain (AgentSteps, CodeBlocks) sudah "none", dan
        // panel ini tetap ikut sesudah bisa disunting: menyalakannya kembali
        // mengembalikan garis palsu itu persis, dan penanda kursor Monaco
        // sendiri sudah cukup menunjukkan baris mana yang sedang diketik.
        renderLineHighlight: "none",
        // PENYEBAB KETIGA, ditemukan lewat screenshot Playwright dari editor
        // TERISOLASI (di luar aplikasi) supaya tak ikut tertipu oleh cache
        // atau reload yang tertunda. Dua perbaikan di atas membersihkan garis
        // atas dan bawah; garis di TEPI KANAN bertahan sesudah keduanya —
        // terbukti berasal dari elemen `.decorationsOverviewRuler`, kanvas
        // 14px yang Monaco gambar sendiri di sisi kanan editor (untuk
        // menampilkan tanda kesalahan/hasil pencarian, meski minimap mati).
        // Batasnya DIGAMBAR ke kanvas, bukan diatur lewat CSS — jadi
        // `outline: none` tak menyentuhnya; harus dimatikan lewat opsi ini.
        overviewRulerLanes: 0,
        // Jalur gutter tempat titik henti digambar. Tanpa ini, dekorasi
        // glyphMarginClassName tak punya tempat dan tak pernah terlihat —
        // kliknya bekerja, titiknya tidak muncul, dan itu tak bisa dibedakan
        // dari titik henti yang gagal dipasang.
        glyphMargin: true,
      });
      // Klik di gutter = pasang/lepas titik henti, seperti VS Code. Yang
      // diperiksa JENIS sasarannya, bukan koordinat: nomor baris dan jalur
      // glyph bersebelahan, dan menebak dari x membuat klik pada nomor baris
      // ikut memasang titik henti.
      edRef.current.onMouseDown((e) => {
        const T = monaco.editor.MouseTargetType;
        if (
          e.target.type !== T.GUTTER_GLYPH_MARGIN &&
          e.target.type !== T.GUTTER_LINE_NUMBERS
        )
          return;
        const baris = e.target.position && e.target.position.lineNumber;
        if (baris) ubahTitikRef.current(baris);
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

  // Akar yang dipakai penyedia saran. Disetel di sini, bukan sekali saat
  // editor dibuat: pemakai bisa berpindah proyek tanpa editor dibuat ulang, dan
  // saran yang tertinggal di akar lama menawarkan pustaka proyek yang salah.
  React.useEffect(() => {
    _akarPustaka = String(root || "");
  }, [root]);

  // ── One model per file, kept alive ──
  //
  // The old code disposed the previous model on every switch. With a single
  // file that only cost undo history; with tabs it silently DESTROYS UNSAVED
  // EDITS, because switching tabs is now the most common action there is.
  //
  // So models are cached by path and only disposed when their tab is closed.
  // That is also what makes undo history, cursor position and scroll offset
  // survive a switch — the thing that makes tabs feel like tabs.
  const modelRef = React.useRef(new Map()); // rel -> monaco model
  React.useEffect(() => {
    const peta = modelRef.current;
    return () => {
      for (const m of peta.values()) {
        try {
          m.dispose();
        } catch (_) {}
      }
      peta.clear();
    };
  }, []);

  // Models for files whose tab was closed are released here. Doing it inside
  // the close handler would be wrong: the handler lives in the parent and has
  // no access to this editor's models.
  React.useEffect(() => {
    if (!Array.isArray(tabs)) return;
    const hidup = new Set(tabs);
    for (const [k, m] of modelRef.current) {
      if (hidup.has(k)) continue;
      try {
        m.dispose();
      } catch (_) {}
      modelRef.current.delete(k);
    }
  }, [tabs]);

  React.useEffect(() => {
    if (!rel) return;
    let dibatalkan = false;
    setGalat("");

    const pasang = (model) => {
      const ed = edRef.current;
      if (!ed) return;
      ed.setModel(model);
      // Recorded AFTER the model is attached: from this point the editor's
      // contents really do belong to this file. Setting it earlier makes a save
      // mid-load write the old file's contents to the new file's name.
      relRef.current = rel;
      const kotorSekarang = !!(kotorPerBerkas.current.get(rel) || false);
      setKotor(kotorSekarang);
      kotorRef.current = kotorSekarang;
      setSaveState("");
      try {
        ed.focus();
      } catch (_) {}
    };

    const sudahAda = modelRef.current.get(rel);
    if (sudahAda) {
      setMuat(false);
      pasang(sudahAda);
      return () => {
        dibatalkan = true;
      };
    }

    setMuat(true);
    const abs = String(root || "").replace(/[\/]+$/, "") + "/" + rel;
    fetch("/preview-file?raw=1&path=" + encodeURIComponent(abs))
      .then((r) =>
        r.ok ? r.text() : Promise.reject(new Error("HTTP " + r.status)),
      )
      .then((teks) => {
        if (dibatalkan) return;
        setMuat(false);
        if (!edRef.current || !window.monaco) return;
        const model = window.monaco.editor.createModel(teks, bahasaMonaco(rel));
        model.onDidChangeContent(() => {
          kotorPerBerkas.current.set(rel, true);
          if (relRef.current === rel) {
            setKotor(true);
            kotorRef.current = true;
            setSaveState("");
          }
          if (onKotorBerubah) onKotorBerubah(rel, true);
        });
        modelRef.current.set(rel, model);
        pasang(model);
      })
      .catch((e) => {
        if (dibatalkan) return;
        setMuat(false);
        setGalat(String(e.message || e));
      });
    return () => {
      dibatalkan = true;
    };
  }, [root, rel, onKotorBerubah]);

  // fetch path-relatif biasa — jalur yang SAMA dengan pemuatan isi berkas di
  // atas. Di desktop, shim di bagian atas berkas ini sudah membelokkan setiap
  // fetch("/…") ke IPC.invoke("api"), jadi menulis jalur IPC sendiri di sini
  // bukan cuma mubazir: ia jadi salinan kedua dari transport yang sama, yang
  // harus ikut diperbaiki tiap kali bentuk balasan IPC berubah.
  // Mengembalikan true/false, bukan void: Run memakainya untuk memutuskan
  // apakah boleh lanjut. Menjalankan sesudah simpan GAGAL berarti menjalankan
  // isi berkas yang lama sementara pesan galatnya lewat tanpa dibaca.
  const simpan = React.useCallback(async () => {
    const ed = edRef.current;
    const target = relRef.current;
    if (!ed || !target) return false;
    const abs = String(root || "").replace(/[\/]+$/, "") + "/" + target;
    const muatan = {
      root: String(root || ""),
      path: abs,
      content: ed.getValue(),
    };
    setSaveState("saving…");
    try {
      const hasil = await (
        await fetch("/ww/tulis-berkas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(muatan),
        })
      ).json();
      if (!hasil || !hasil.ok)
        throw new Error((hasil && hasil.error) || "could not save");
      setKotor(false);
      kotorRef.current = false;
      kotorPerBerkas.current.set(target, false);
      if (onKotorBerubah) onKotorBerubah(target, false);
      setSaveState("saved");
      return true;
    } catch (e) {
      // Penanda kotor SENGAJA tidak dibersihkan saat failed: pemakai harus tetap
      // melihat bahwa perubahannya belum aman di disk.
      setSaveState("failed: " + String(e.message || e));
      return false;
    }
  }, [root, onKotorBerubah]);

  // ── Jalankan: SIMPAN DULU, baru jalankan ──
  //
  // Tanpa itu, menekan Run sesudah mengetik menjalankan isi berkas yang LAMA —
  // keluarannya tak cocok dengan yang terlihat di editor, dan tak ada satu pun
  // petunjuk kenapa. Ditunggu sampai simpan selesai (await), bukan dipanggil
  // berbarengan: perintahnya akan mendahului tulisan ke disk.
  const abs = React.useCallback(
    (r) => String(root || "").replace(/[\/]+$/, "") + "/" + r,
    [root],
  );
  const bisaJalan = !!rel && !!perintahJalankan(rel);
  // Ekstensi saja TIDAK cukup. Tanpa pemeriksaan ini, membuka .rb di mesin
  // tanpa rdbg membuat tombolnya menyala, perintahnya gagal di terminal, dan
  // UI tetap menyatakan "Sesi hidup · rdbg" — aplikasi melaporkan keadaan yang
  // tak sama dengan yang sebenarnya.
  const [debugAda, setDebugAda] = React.useState(null); // null = belum tahu
  React.useEffect(() => {
    let mati = false;
    ambilDebugTersedia().then((d) => {
      if (!mati) setDebugAda(d);
    });
    return () => {
      mati = true;
    };
  }, []);
  const jenisDbg = rel ? jenisDebugger(rel) : null;
  // "Belum tahu" diperlakukan sebagai BOLEH: mematikan tombol karena satu
  // permintaan gagal lebih membingungkan daripada perintah yang gagal dengan
  // pesan jelas di terminal.
  const bisaDebug =
    !!rel &&
    !!perintahDebug(rel) &&
    (debugAda === null || debugAda[jenisDbg] !== false);
  // `mode` diteruskan apa adanya ke pemanggil: satu jalur untuk Run dan Debug,
  // supaya syarat "simpan dulu" tak mungkin berlaku di salah satunya saja.
  const kirimKe = React.useCallback(
    async (mode) => {
      const target = relRef.current;
      if (!target || !onRun) return;
      if (kotorRef.current) {
        const ok = await simpan();
        if (!ok) return; // could not save -> jangan jalankan yang basi
      }
      onRun(abs(target), mode, String(root || ""));
    },
    [onRun, simpan, abs],
  );
  const jalankan = React.useCallback(() => kirimKe("jalan"), [kirimKe]);
  const debug = React.useCallback(() => kirimKe("debug"), [kirimKe]);

  // Pemicu debug didaftarkan KE ATAS, bukan disalin ke panel terminal. Kalau
  // panel terminal memanggil perintah debug-nya sendiri, ia melewati
  // "simpan dulu" yang ada di sini — dan menjalankan isi berkas yang lama di
  // bawah debugger justru bentuk kebingungan yang paling mahal: baris yang
  // disorot debugger tak cocok dengan baris yang terlihat di editor.
  React.useEffect(() => {
    if (!onDaftarDebug) return;
    if (!rel) {
      onDaftarDebug(null);
      return () => onDaftarDebug(null);
    }
    // Alasan ikut dikirim, bukan cuma "tidak bisa". Tombol yang mati tanpa
    // keterangan tak bisa dibedakan dari aplikasi yang rusak — dan dua sebabnya
    // menuntut tindakan yang sama sekali berbeda: yang satu ganti berkas, yang
    // satu pasang debuggernya.
    let alasan = "";
    if (!perintahDebug(rel)) alasan = "No known debugger for this file type.";
    else if (debugAda && debugAda[jenisDbg] === false)
      alasan =
        "The debugger for this file (" +
        String(_PERINTAH_DEBUG[ekstensiDari(rel)] || "").split(" ")[0] +
        ") is not installed on this machine.";
    onDaftarDebug({
      berkas: rel,
      mulai: bisaDebug ? debug : null,
      alasan,
    });
    return () => onDaftarDebug(null);
  }, [onDaftarDebug, bisaDebug, debug, rel, debugAda, jenisDbg]);

  // Ctrl+S / Cmd+S di dalam editor. Tanpa ini, pintasan itu diambil alih
  // browser (Save Page) dan pemakai mengira aplikasinya tak merespons.
  React.useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const tekan = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        simpan();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        jalankan();
      }
    };
    el.addEventListener("keydown", tekan);
    return () => el.removeEventListener("keydown", tekan);
  }, [simpan, jalankan]);

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        // Warna yang SAMA dengan panel berkas di kirinya. Editor Monaco-nya
        // sendiri berlatar transparan (tema wolfspace-gelap), jadi warna ini
        // yang benar-benar terlihat — keduanya terbaca sebagai satu permukaan,
        // bukan dua panel yang kebetulan bersebelahan.
        background: "#0c1219",
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
        }}
      >
        {/* ── Tab strip ──
            The open files, the way any editor shows them. It replaces the
            single filename that used to sit here: with several files open, one
            name only ever tells you where you are — never where else you could
            go. */}
        <div className="tab-strip" role="tablist">
          {(tabs && tabs.length ? tabs : rel ? [rel] : []).map((t) => (
            <div
              key={t}
              role="tab"
              aria-selected={t === rel}
              className={"tab" + (t === rel ? " aktif" : "")}
              title={t}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", t);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                // Without preventDefault the browser refuses the drop and the
                // whole gesture silently does nothing.
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const dari = e.dataTransfer.getData("text/plain");
                if (dari && dari !== t && onGeserTab) onGeserTab(dari, t);
              }}
              onClick={() => onPilihTab && onPilihTab(t)}
              onAuxClick={(e) => {
                // Middle-click closes, as in every editor with tabs.
                if (e.button === 1 && onTutupTab) {
                  e.preventDefault();
                  onTutupTab(t);
                }
              }}
            >
              <span className="tab-nama">{t.split("/").pop()}</span>
              {/* One slot for both marks: an unsaved file shows a dot, and it
                  turns into the close button on hover — so the button never
                  changes the tab's width and the row never shifts under the
                  pointer. */}
              <button
                type="button"
                className={
                  "tab-tutup" +
                  (kotorPerBerkas.current.get(t) || (t === rel && kotor)
                    ? " kotor"
                    : "")
                }
                aria-label={"Close " + t}
                title={"Close " + t}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onTutupTab) onTutupTab(t);
                }}
              >
                <span className="tab-titik" aria-hidden="true">
                  ●
                </span>
                <svg
                  className="tab-silang"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
          ))}
          {!(tabs && tabs.length) && !rel && (
            <span style={{ opacity: 0.7, padding: "0 4px" }}>
              Select a file on the left
            </span>
          )}
        </div>
        {muat && <span style={{ opacity: 0.6 }}>loading…</span>}
        {galat && <span style={{ color: "#f85149" }}>{galat}</span>}
        {saveState && (
          <span
            style={{
              opacity: 0.8,
              color: saveState.startsWith("failed") ? "#f85149" : "#3fb950",
            }}
          >
            {saveState}
          </span>
        )}
        {rel && onRun && (
          <button
            type="button"
            className="aksi-btn aksi-run"
            onClick={jalankan}
            disabled={!bisaJalan}
            title={
              bisaJalan
                ? "Run in terminal (Ctrl+Enter) — saves first"
                : "This file is not run through the terminal"
            }
          >
            {/* Segitiga isi — tanda "jalankan" yang sama di editor mana pun. */}
            <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor">
              <path d="M1 0.5v9l8-4.5z" />
            </svg>
            Run
          </button>
        )}
        {/* Tombol Debug PINDAH ke kelompok tab terminal. Debug adalah
            SESI yang hidup di terminal — tempatnya bersama keluaran yang
            ia hasilkan, bukan di sebelah tombol Save. Yang tetap di
            sini cuma pemicunya, didaftarkan ke atas lewat onDaftarDebug
            supaya syarat "simpan dulu" tak hilang saat dipindah. */}
        {rel && (
          <button
            type="button"
            className="aksi-btn aksi-simpan"
            onClick={simpan}
            disabled={!kotor}
            title="Save (Ctrl+S)"
          >
            {/* Disket. Ikon yang sama dipakai editor mana pun untuk "simpan",
                jadi ia terbaca tanpa perlu tulisannya dibaca dulu. */}
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            >
              <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
              <path d="M8 4v5h7M8 21v-6h8v6" />
            </svg>
            Save
          </button>
        )}
      </div>
      <div
        className="logic-code-host"
        ref={hostRef}
        style={{ flex: 1, minHeight: 0 }}
      />
    </div>
  );
}

// ── Ekstensi -> perintah untuk menjalankannya di terminal ──
//
// Dipisah jadi fungsi murni supaya bisa diuji tanpa DOM, terminal, atau PTY:
// yang mudah salah di sini bukan tombolnya, melainkan pengutipan path. Path
// absolut Windows penuh spasi ("C:\Users\...\My Project\a.js"), dan tanpa tanda
// kutip shell memecahnya jadi beberapa argumen — perintahnya gagal dengan pesan
// yang menunjuk ke berkas yang tak pernah ada.
//
// Mengembalikan null untuk yang memang tak dijalankan lewat terminal (.html
// tempatnya di panel preview, .json/.md bukan program) supaya tombolnya bisa
// dimatikan dengan alasan yang jelas, bukan menjalankan sesuatu yang keliru.
const _PERINTAH_JALAN = {
  js: "node",
  mjs: "node",
  cjs: "node",
  ts: "npx tsx",
  tsx: "npx tsx",
  py: "python",
  rb: "ruby",
  php: "php",
  go: "go run",
  java: "java",
  sh: "bash",
  ps1: "powershell -NoProfile -File",
};
function perintahJalankan(pathAbsolut) {
  const nama = String(pathAbsolut || "");
  const ext = ekstensiDari(nama);
  const bin = _PERINTAH_JALAN[ext];
  if (!bin) return null;
  // Tanda kutip GANDA, bukan tunggal: PowerShell adalah shell bawaan di sini,
  // dan kutip tunggal di dalamnya tidak melebarkan apa pun — tapi cmd.exe
  // memperlakukan kutip tunggal sebagai karakter biasa, jadi path-nya rusak.
  return bin + ' "' + nama.replace(/"/g, '\\"') + '"';
}

// ── Saran pustaka saat mengetik import/require ──
//
// Monaco sudah membawa layanan bahasa JS/TS, jadi anggota objek dan bawaan
// bahasa sudah tersaran sendiri. Yang TIDAK ia ketahui adalah pustaka apa yang
// dipakai proyek INI — dan justru itu yang paling sering diketik.
//
// Daftarnya diambil dari manifes lewat /ww/pustaka, dan hanya ditawarkan di
// dalam TANDA KUTIP milik import/require. Tanpa batasan itu, nama paket ikut
// muncul di tengah kalimat biasa dan menutupi saran yang benar.
const _POLA_IMPOR = /(?:require\(|import\s*\(|from\s+|import\s+)['"]([^'"]*)$/;
const _POLA_IMPOR_PY = /^\s*(?:from|import)\s+([\w.]*)$/;
let _pustakaCache = { akar: null, data: null, janji: null };
function ambilPustaka(akar) {
  if (!akar) return Promise.resolve(null);
  if (_pustakaCache.akar === akar && _pustakaCache.data)
    return Promise.resolve(_pustakaCache.data);
  // Satu permintaan per akar, bukan satu per ketukan tombol: penyedia saran
  // dipanggil ulang tiap karakter, dan tanpa ini tiap huruf jadi satu request.
  if (_pustakaCache.akar === akar && _pustakaCache.janji)
    return _pustakaCache.janji;
  const janji = fetch("/ww/pustaka?path=" + encodeURIComponent(akar))
    .then((r) => r.json())
    .then((d) => {
      _pustakaCache = { akar, data: d, janji: null };
      return d;
    })
    .catch(() => null);
  _pustakaCache = { akar, data: null, janji };
  return janji;
}
// Akar yang sedang dibuka. Penyedia saran didaftarkan SEKALI secara global
// (mendaftarkannya per-editor menumpuk penyedia dan menggandakan saran tiap
// kali berkas diganti), jadi akarnya dititipkan di sini.
let _akarPustaka = "";
let _saranTerpasang = false;
function pasangSaranPustaka(monaco) {
  if (_saranTerpasang) return;
  _saranTerpasang = true;
  const buat = (nama, jenis, rentang) => ({
    label: nama,
    kind: monaco.languages.CompletionItemKind.Module,
    detail: jenis,
    insertText: nama,
    range: rentang,
  });
  const sediakan = (bahasaPy) => ({
    triggerCharacters: bahasaPy ? [" ", "."] : ['"', "'", "/"],
    provideCompletionItems: async (model, position) => {
      const sampai = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const m = bahasaPy
        ? sampai.match(_POLA_IMPOR_PY)
        : sampai.match(_POLA_IMPOR);
      if (!m) return { suggestions: [] };
      const data = await ambilPustaka(_akarPustaka);
      if (!data) return { suggestions: [] };
      const ketikan = m[1] || "";
      const rentang = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: position.column - ketikan.length,
        endColumn: position.column,
      };
      const daftar = bahasaPy
        ? (data.py || []).map((n) => buat(n, "requirements.txt", rentang))
        : (data.js || [])
            .map((n) => buat(n, "package.json", rentang))
            .concat(
              (data.builtin || []).map((n) =>
                buat(n, "modul bawaan Node", rentang),
              ),
            );
      return { suggestions: daftar };
    },
  });
  for (const b of ["javascript", "typescript"])
    monaco.languages.registerCompletionItemProvider(b, sediakan(false));
  monaco.languages.registerCompletionItemProvider("python", sediakan(true));
}

// ── Debug: menjalankan berkas DI BAWAH debugger, di terminal yang sama ──
//
// Yang dipilih di sini debugger BER-BARIS-PERINTAH, bukan protokol DAP seperti
// yang dipakai VS Code. Alasannya bukan kemalasan: DAP menuntut adapter per
// bahasa, proses perantara, dan panel variabel/tumpukan sendiri — sementara
// `node inspect` dan `python -m pdb` sudah memberi hal yang sama (titik henti,
// melangkah, memeriksa nilai) DI DALAM PTY yang sudah kita punya.
//
// `node inspect`, BUKAN `node --inspect-brk`. Keduanya sering tertukar:
// --inspect-brk hanya membuka port lalu mencetak alamat ws:// dan menunggu
// klien dari luar — di terminal ia terlihat seperti menggantung tanpa sebab.
// `node inspect` menjalankan klien REPL-nya sekalian, dan itulah yang bisa
// dipakai orang.
//
// null berarti "tak ada debugger yang kita tahu untuk berkas ini" — tombolnya
// dimatikan dengan alasan yang jelas, bukan menjalankan sesuatu yang salah.
// Ekstensi yang punya adapter DAP. Kuncinya sengaja sama dengan ADAPTER di
// core/dap-sesi.cjs — kalau keduanya menyimpang, UI mengirim berkas ke jalur
// DAP yang lalu ditolak server, atau sebaliknya membiarkannya lewat PTY
// padahal jalur yang lebih baik tersedia.
const _ADAPTER_DAP = {
  py: 1,
  js: 1,
  mjs: 1,
  cjs: 1,
  ts: 1,
  tsx: 1,
  jsx: 1,
};

const _PERINTAH_DEBUG = {
  js: "node inspect",
  mjs: "node inspect",
  cjs: "node inspect",
  py: "python -m pdb",
  rb: "rdbg",
  go: "dlv debug",
};
function perintahDebug(pathAbsolut) {
  const bin = _PERINTAH_DEBUG[ekstensiDari(String(pathAbsolut || ""))];
  if (!bin) return null;
  return bin + ' "' + String(pathAbsolut).replace(/"/g, '\\"') + '"';
}

// Perintah tiap tombol pada bilah debug, PER DEBUGGER. Sengaja tidak disamakan:
// node memakai kata penuh (next/step/out/cont), pdb memakai singkatan satu
// huruf (n/s/r/c), dan mengirim kata yang salah ke pdb bukan menghasilkan galat
// melainkan diam-diam berarti hal lain — "s" di node inspect tak dikenal,
// sedangkan "next" di pdb dibaca sebagai perintah "n" yang benar hanya karena
// kebetulan berawalan sama.
const _AKSI_DEBUG = {
  node: {
    lanjut: "cont",
    lewati: "next",
    masuk: "step",
    keluar: "out",
    berhenti: ".exit",
  },
  pdb: { lanjut: "c", lewati: "n", masuk: "s", keluar: "r", berhenti: "q" },
  rdbg: { lanjut: "c", lewati: "n", masuk: "s", keluar: "fin", berhenti: "q" },
  dlv: {
    lanjut: "continue",
    lewati: "next",
    masuk: "step",
    keluar: "stepout",
    berhenti: "exit",
  },
};
// Debugger mana yang benar-benar terpasang. Diambil SEKALI per sesi — daftarnya
// tak berubah selagi aplikasi jalan, dan tanpa cache tiap render berkas memicu
// satu permintaan.
let _debugTersedia = null;
let _debugTersediaJanji = null;
function ambilDebugTersedia() {
  if (_debugTersedia) return Promise.resolve(_debugTersedia);
  if (_debugTersediaJanji) return _debugTersediaJanji;
  _debugTersediaJanji = fetch("/debug/tersedia")
    .then((r) => r.json())
    .then((d) => {
      _debugTersedia = d || {};
      _debugTersediaJanji = null;
      return _debugTersedia;
    })
    .catch(() => {
      _debugTersediaJanji = null;
      // Gagal bertanya BUKAN berarti tak ada. Mengembalikan objek kosong akan
      // mematikan tombol Debug diam-diam untuk semua bahasa hanya karena satu
      // permintaan gagal — jadi null, dan pemanggil memperlakukannya sebagai
      // "belum tahu" alih-alih "tidak ada".
      return null;
    });
  return _debugTersediaJanji;
}

function jenisDebugger(pathAbsolut) {
  const bin = _PERINTAH_DEBUG[ekstensiDari(String(pathAbsolut || ""))];
  if (!bin) return null;
  if (bin.startsWith("node")) return "node";
  if (bin.indexOf("pdb") >= 0) return "pdb";
  if (bin.startsWith("rdbg")) return "rdbg";
  if (bin.startsWith("dlv")) return "dlv";
  return null;
}

// Ekstensi -> bahasa Monaco. Dipisah dari IKON_BAHASA karena keduanya menjawab
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

function LogicFileTree({
  files,
  folders,
  root,
  active,
  terpilih,
  onPilih,
  onBuat,
  onBuatFolder,
  onHapus,
  onHapusFolder,
}) {
  // Tab "Changes" DIHAPUS. Ia selalu berbunyi "Tak ada perubahan." — tak
  // pernah tersambung ke data nyata sejak awal — jadi bukan fitur yang
  // dinonaktifkan, melainkan potongan UI yang tak pernah punya isi.
  const tree = buildDevTree(files, root, folders);
  // Lebar bisa diatur, POLA YANG SAMA dengan resizer sidebar (Sidebar.tsx):
  // localStorage terpisah, batas atas/bawah, kelas "resizing" selama diseret.
  // Disamakan sengaja — dua panel yang bisa diatur lebarnya dengan cara
  // berbeda akan terasa seperti dua aplikasi berbeda.
  // ── Batas lebar pohon berkas ──
  //
  // SATU tempat. Angkanya sempat ditulis tiga kali — saat memuat, saat
  // menyeret, dan saat melepas — dan tiga salinan batas yang harus sepakat
  // adalah tiga tempat ia bisa menyimpang tanpa ketahuan.
  //
  // Lantainya 96px, bukan 160px. Yang menentukan bukan selera melainkan isi
  // headernya: label "Files" + jarak + tombol berkas-baru 24px + padding
  // 12+8 = sekitar 90px. Di bawah itu tombolnya mulai terdorong keluar, dan
  // yang didapat bukan panel sempit melainkan panel rusak.
  const LF_MIN = 96;
  const LF_MAKS = 500;
  const lfBatas = (w) => Math.max(LF_MIN, Math.min(LF_MAKS, w));

  const [lfWidth, setLfWidth] = React.useState(() => {
    try {
      const w = parseInt(
        localStorage.getItem("wolfspace_logicfiles_width") || "244",
        10,
      );
      return isNaN(w) ? 244 : lfBatas(w);
    } catch (_) {
      return 244;
    }
  });
  const [lfResizing, setLfResizing] = React.useState(false);
  const handleLfResizerMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setLfResizing(true);
    const startX = e.clientX;
    const startWidth = lfWidth;
    const onMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setLfWidth(lfBatas(startWidth + deltaX));
    };
    const onUp = (upEvent) => {
      const deltaX = upEvent.clientX - startX;
      const finalWidth = lfBatas(startWidth + deltaX);
      setLfResizing(false);
      try {
        localStorage.setItem("wolfspace_logicfiles_width", String(finalWidth));
      } catch (_) {}
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ── New file, cara VS Code ──
  //
  // draf === null berarti tak sedang membuat; string (termasuk "") berarti
  // baris ketiknya terbuka. Dibedakan begitu, bukan lewat boolean terpisah,
  // supaya tak mungkin ada keadaan "terbuka tapi tanpa nilai".
  // ── Right-click menu ──
  //
  // Held as coordinates + target, not as a boolean: the menu has to appear
  // where the pointer is, and it has to know which file it was opened on.
  const [menuKonteks, setMenuKonteks] = React.useState(null); // {x,y,rel}
  React.useEffect(() => {
    if (!menuKonteks) return;
    const tutup = () => setMenuKonteks(null);
    const esc = (e) => e.key === "Escape" && setMenuKonteks(null);
    // Closed by a click anywhere and by Escape. Only one of the two makes a
    // menu that feels stuck.
    document.addEventListener("mousedown", tutup);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", tutup);
      document.removeEventListener("keydown", esc);
    };
  }, [menuKonteks]);

  // ── Deleting, confirmed INSIDE the menu ──
  //
  // Not window.confirm(). That call appears nowhere else in this app, so
  // nothing proves it works in the Electron build — and when a blocked dialog
  // returns false, this function simply returns and the click looks dead. A
  // confirmation drawn by the app itself cannot fail that way, and it can be
  // tested.
  const [hapusGalat, setHapusGalat] = React.useState("");
  const [hapusSibuk, setHapusSibuk] = React.useState(false);
  const hapusBerkas = async (rel, folder) => {
    if (!rel || !akarAda || hapusSibuk) return;
    setHapusSibuk(true);
    setHapusGalat("");
    const abs = String(root).replace(/[\/]+$/, "") + "/" + rel;
    try {
      const hasil = await (
        await fetch("/ww/hapus-berkas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            folder
              ? { root: String(root), path: abs, folder: true }
              : { root: String(root), path: abs },
          ),
        })
      ).json();
      if (!hasil || hasil.ok === false)
        throw new Error((hasil && hasil.error) || "could not delete");
      setMenuKonteks(null);
      if (folder) {
        if (onHapusFolder) onHapusFolder(rel);
      } else if (onHapus) {
        onHapus(rel);
      }
    } catch (e) {
      // The menu STAYS OPEN on failure, carrying the reason. Closing it would
      // leave the file still on disk and nothing on screen saying so.
      setHapusGalat(String((e && e.message) || e));
    } finally {
      setHapusSibuk(false);
    }
  };

  // How much a folder holds, asked of the DISK. The tree only lists files the
  // agent has touched, so counting from it would understate the damage — and
  // the number the user approves has to be the real one.
  const [jumlahIsi, setJumlahIsi] = React.useState(null);
  const hitungIsi = async (rel) => {
    setJumlahIsi(null);
    const abs = String(root).replace(/[\/]+$/, "") + "/" + rel;
    try {
      const r = await (
        await fetch("/ww/hapus-berkas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            root: String(root),
            path: abs,
            folder: true,
            hitung: true,
          }),
        })
      ).json();
      if (r && r.ok) setJumlahIsi(r.jumlah);
    } catch (_) {}
  };

  const [draf, setDraf] = React.useState(null);
  const [galatBuat, setGalatBuat] = React.useState("");
  const [sibuk, setSibuk] = React.useState(false);
  const akarAda = !!String(root || "").trim();
  // Which kind is being created. Held next to the draft rather than in the
  // submit handler: the placeholder, the icon and the error text all have to
  // agree with it, and deciding at submit time means the row lies until then.
  const [jenisBaru, setJenisBaru] = React.useState("berkas");
  const mulaiBuat = (jenis) => {
    setGalatBuat("");
    setJenisBaru(jenis === "folder" ? "folder" : "berkas");
    setDraf("");
  };
  const batalBuat = () => {
    setDraf(null);
    setGalatBuat("");
  };
  const buatBerkas = async () => {
    // Dinormalkan seperti VS Code: pemisah disamakan, spasi tepi dibuang,
    // garis miring berlebih diringkas.
    const nama = String(draf || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/")
      .replace(/^\/+|\/+$/g, "");
    if (!nama) return batalBuat();
    // Ditolak di sini SEBELUM menembak server, semata supaya pesannya cepat
    // dan jelas — server tetap memeriksa ulang, karena pemeriksaan di
    // renderer bisa dilewati begitu saja.
    if (nama.split("/").some((s) => s === "." || s === ".."))
      return setGalatBuat("invalid name");
    const abs = String(root).replace(/[\\/]+$/, "") + "/" + nama;
    setSibuk(true);
    setGalatBuat("");
    try {
      // fetch path-relatif: di desktop shim di atas berkas ini membelokkannya
      // ke IPC.invoke("api") sendiri, jadi satu jalur cukup untuk keduanya.
      const hasil = await (
        await fetch("/ww/buat-berkas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            jenisBaru === "folder"
              ? { root: String(root), path: abs, folder: true }
              : { root: String(root), path: abs },
          ),
        })
      ).json();
      if (!hasil || hasil.ok === false)
        throw new Error((hasil && hasil.error) || "could not create file");
      setDraf(null);
      // Recorded in the list AND opened straight away, as VS Code does. A
      // folder is only recorded — there is nothing to open.
      if (jenisBaru === "folder") {
        if (onBuatFolder) onBuatFolder(hasil.path || nama);
      } else if (onBuat) {
        onBuat(hasil.path || nama);
      }
    } catch (e) {
      // Baris ketiknya sengaja TIDAK ditutup: nama yang salah masih ada di
      // sana untuk diperbaiki, bukan hilang bersama pesan galatnya.
      setGalatBuat(String((e && e.message) || e));
    } finally {
      setSibuk(false);
    }
  };

  const icon = (t) => {
    // Monogram bahasa: kotak kecil berwarna khas bahasanya. Dirender sebagai
    // SVG (bukan <span> ber-CSS) supaya ia sejajar dengan ikon lain yang sudah
    // SVG, dan ukurannya tak ikut berubah saat font halaman berubah.
    if (typeof t === "string" && t.startsWith("lang:")) {
      const svg = IKON_BAHASA[t.slice(5)];
      if (svg)
        // SVG-nya disuntikkan apa adanya: ia berasal dari berkas tetap yang
        // ikut di-vendor, bukan dari masukan mana pun, jadi tak ada teks
        // pemakai yang bisa sampai ke sini.
        return (
          <span
            style={{
              width: "16px",
              height: "16px",
              display: "inline-flex",
              flexShrink: 0,
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
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
      className={"logic-filetree" + (lfResizing ? " resizing" : "")}
      style={{
        // Lebar diatur pemakai (lfWidth); panel kode di kanannya yang
        // menyerap sisa lebar, sama seperti VS Code.
        width: lfWidth + "px",
        flex: "0 0 auto",
        flexShrink: 0,
        minWidth: 0,
        background: "#0c1219",
        borderRight: "1px solid #212a36",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
        position: "relative",
      }}
    >
      <div
        className="logic-filetree-resizer"
        onMouseDown={handleLfResizerMouseDown}
        title="Drag to resize"
      />
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
          <span
            style={{
              fontSize: "13px",
              padding: "9px 0",
              color: "#e6edf3",
              borderBottom: "2px solid #4c8bf5",
            }}
          >
            Files
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2px",
            color: "#6f7d92",
          }}
        >
          {/* Dua tombol yang dulu ada di sini — "Search" dan "Collapse all" —
              tak satu pun punya onClick: mereka hiasan sejak awal. Yang
              tersisa cuma satu, dan yang ini benar-benar bekerja. */}
          {/* New folder, to the left of New file. Same shape and same size —
              two buttons that do the same kind of thing should not look like
              two different kinds of control. */}
          <button
            className="btn-reset"
            title={
              akarAda ? "New folder" : "No workspace yet — open a project first"
            }
            disabled={!akarAda}
            onClick={() => mulaiBuat("folder")}
            style={{
              color: "inherit",
              width: "24px",
              height: "24px",
              borderRadius: "5px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: akarAda ? "pointer" : "not-allowed",
              opacity: akarAda ? 1 : 0.4,
            }}
            onMouseEnter={(e) => {
              if (!akarAda) return;
              e.currentTarget.style.background = "#1b2431";
              e.currentTarget.style.color = "#cdd9e5";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "inherit";
            }}
          >
            {/* A folder with a + in the corner, drawn with the same strokes as
                the file icon beside it (viewBox 24, strokeWidth 2). */}
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
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h5a2 2 0 0 1 2 2v3" />
              <path d="M3 8v9a2 2 0 0 0 2 2h6" />
              <line x1="18" y1="14" x2="18" y2="21" />
              <line x1="14.5" y1="17.5" x2="21.5" y2="17.5" />
            </svg>
          </button>
          <button
            className="btn-reset"
            title={
              akarAda ? "New file" : "No workspace yet — open a project first"
            }
            disabled={!akarAda}
            onClick={() => mulaiBuat("berkas")}
            style={{
              color: "inherit",
              width: "24px",
              height: "24px",
              borderRadius: "5px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: akarAda ? "pointer" : "not-allowed",
              opacity: akarAda ? 1 : 0.4,
            }}
            onMouseEnter={(e) => {
              if (!akarAda) return;
              e.currentTarget.style.background = "#1b2431";
              e.currentTarget.style.color = "#cdd9e5";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "inherit";
            }}
          >
            {/* Lembar dokumen dengan tanda + di sudut — ikon "new file" yang
                sama bentuknya dengan VS Code, digambar dengan goresan yang
                sama (viewBox 24, strokeWidth 2) seperti ikon lain di sini. */}
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
              <path d="M13.5 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" />
              <polyline points="13.5 3 13.5 8 18.5 8" />
              <line x1="18" y1="14" x2="18" y2="21" />
              <line x1="14.5" y1="17.5" x2="21.5" y2="17.5" />
            </svg>
          </button>
        </div>
      </div>
      {/* Baris ketik nama berkas, seperti VS Code: muncul DI DALAM pohon,
          bukan sebagai dialog. Ditaruh di luar cabang kosong/berisi di bawah
          supaya ia tetap muncul walau pohonnya masih kosong — di situlah
          justru berkas pertama dibuat. */}
      {menuKonteks && (
        <div
          className="pohon-menu"
          style={{ left: menuKonteks.x + "px", top: menuKonteks.y + "px" }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="pohon-menu-berkas">{menuKonteks.rel}</div>
          {!menuKonteks.konfirmasi ? (
            <button
              type="button"
              className="pohon-menu-opsi bahaya"
              onClick={() => {
                if (menuKonteks.folder) hitungIsi(menuKonteks.rel);
                setMenuKonteks((m) => m && { ...m, konfirmasi: true });
              }}
            >
              {menuKonteks.folder ? "Delete folder" : "Delete file"}
            </button>
          ) : (
            <>
              <div className="pohon-menu-tanya">
                {menuKonteks.folder
                  ? jumlahIsi === null
                    ? "Delete this folder and everything inside it? This cannot be undone."
                    : jumlahIsi === 0
                      ? "Delete this empty folder? This cannot be undone."
                      : "Delete this folder and the " +
                        jumlahIsi +
                        " item" +
                        (jumlahIsi === 1 ? "" : "s") +
                        " inside it? This cannot be undone."
                  : "Delete permanently? This cannot be undone."}
              </div>
              {hapusGalat && (
                <div className="pohon-menu-galat">{hapusGalat}</div>
              )}
              <button
                type="button"
                className="pohon-menu-opsi bahaya"
                disabled={hapusSibuk}
                onClick={() => hapusBerkas(menuKonteks.rel, menuKonteks.folder)}
              >
                {hapusSibuk ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                type="button"
                className="pohon-menu-opsi"
                onClick={() => {
                  setHapusGalat("");
                  setMenuKonteks(null);
                }}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
      {draf !== null && (
        <div style={{ padding: "4px 8px 6px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#768390"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <input
              autoFocus
              value={draf}
              placeholder={
                jenisBaru === "folder" ? "folder-name" : "file-name.js"
              }
              disabled={sibuk}
              onChange={(e) => {
                setDraf(e.target.value);
                setGalatBuat("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  buatBerkas();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  batalBuat();
                }
              }}
              // VS Code membatalkan begitu fokus lepas. Tapi kalau ada pesan
              // galat yang belum sempat dibaca, membatalkan justru menelan
              // pesannya — jadi baris ini bertahan sampai Escape.
              onBlur={() => {
                if (!galatBuat && !sibuk) batalBuat();
              }}
              style={{
                flex: 1,
                minWidth: 0,
                background: "#0d1117",
                border: "1px solid " + (galatBuat ? "#f85149" : "#4c8bf5"),
                borderRadius: "3px",
                color: "#e6edf3",
                fontSize: "12px",
                fontFamily: "inherit",
                padding: "3px 6px",
                outline: "none",
              }}
            />
          </div>
          {galatBuat && (
            <div
              style={{
                color: "#f85149",
                fontSize: "11px",
                padding: "4px 0 0 20px",
              }}
            >
              {galatBuat}
            </div>
          )}
        </div>
      )}
      {/* Dulu cuma `!active`, yang mengikat isi pohon pada ADA-TIDAKNYA
          pratinjau. Berkas yang dibuat sendiri lewat tombol + tak butuh
          pratinjau untuk ada, jadi ia akan dibuat lalu tak terlihat. Yang
          menentukan sekarang isi pohonnya sendiri. */}
      {!active && tree.length === 0 ? (
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
              onContextMenu={(e) => {
                e.preventDefault();
                setHapusGalat("");
                setMenuKonteks({
                  x: e.clientX,
                  y: e.clientY,
                  rel: n.rel || n.name,
                  folder: n.type === "folder",
                });
              }}
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
  // Folders created by hand. Kept apart from devFiles because that list is
  // FILES: a folder with nothing in it would leave no trace there and would
  // vanish from the tree the moment it was created.
  const [devFolders, setDevFolders] = useState([]);
  useEffect(() => {
    setDevFiles([]);
    setDevFolders([]);
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
  // ref iframe kini satu hook di public/app/usePreviewPanel.tsx.
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
  // ── Open editor tabs ──
  //
  // Order matters and is the user's, so this is an array, not a Set.
  const [logicTabs, setLogicTabs] = useState([]);
  const [logicKotor, setLogicKotor] = useState({}); // rel -> unsaved?
  const bukaTab = useCallback((rel) => {
    if (!rel) return;
    setLogicTabs((t) => (t.includes(rel) ? t : t.concat(rel)));
    setLogicBerkas(rel);
  }, []);
  const tutupTab = useCallback((rel) => {
    setLogicTabs((t) => {
      const i = t.indexOf(rel);
      if (i < 0) return t;
      const sisa = t.filter((x) => x !== rel);
      // Closing the ACTIVE tab has to hand focus to a neighbour — the one on
      // the right, falling back to the left, as every editor does. Leaving the
      // pane blank instead makes closing feel like losing your place.
      setLogicBerkas((aktif) =>
        aktif !== rel ? aktif : sisa[i] || sisa[i - 1] || "",
      );
      return sisa;
    });
    setLogicKotor((k) => {
      if (!(rel in k)) return k;
      const n = { ...k };
      delete n[rel];
      return n;
    });
  }, []);
  const geserTab = useCallback((dari, ke) => {
    setLogicTabs((t) => {
      const a = t.indexOf(dari);
      const b = t.indexOf(ke);
      if (a < 0 || b < 0 || a === b) return t;
      const n = t.slice();
      n.splice(b, 0, n.splice(a, 1)[0]);
      return n;
    });
  }, []);
  const tandaiKotor = useCallback((rel, kotor) => {
    setLogicKotor((k) => (k[rel] === kotor ? k : { ...k, [rel]: kotor }));
  }, []);
  const [status, setStatus] = useState("Loading models…");
  const [view, setView] = useState("chat");
  // ── Sidebar punya TIGA keadaan, bukan dua ──
  //
  //   "penuh"    232px, label terlihat
  //   "ringkas"   60px, ikon saja
  //   "sembunyi"   0px, yang tersisa cuma tombol pembukanya
  //
  // Disimpan sebagai KATA, bukan angka atau boolean. Nilai lama di localStorage
  // masih boolean ("1"/"0") dari versi dua-keadaan, jadi ia diterjemahkan sekali
  // — tanpa itu, pemakai yang sudah memakai aplikasi ini mendapat sidebar yang
  // kembali ke bawaan tanpa sebab.
  const [sbMode, setSbMode] = useState(() => {
    try {
      const v = localStorage.getItem("wolfspace_sb");
      if (v === "penuh" || v === "ringkas" || v === "sembunyi") return v;
      return v === "1" ? "ringkas" : "penuh"; // nilai lama
    } catch (e) {
      return "penuh";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("wolfspace_sb", sbMode);
    } catch (e) {}
  }, [sbMode]);
  // Urutan siklusnya: penuh -> ringkas -> sembunyi -> penuh. Satu tombol, dan
  // arahnya selalu sama supaya bisa dihafal.
  const _URUT_SB = ["penuh", "ringkas", "sembunyi"];
  const putarSidebar = useCallback(() => {
    setSbMode((m) => _URUT_SB[(_URUT_SB.indexOf(m) + 1) % _URUT_SB.length]);
  }, []);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("wolfspace_theme") || "dark";
    } catch (e) {
      return "dark";
    }
  });

  const [terminalPct, setTerminalPct] = useState(30);
  const [panelPct, setPanelPct] = useState(35);
  // Code (view Logic) adalah panel KETIGA, setara terminal dan preview. Ia dulu
  // lapisan `position:absolute; inset:0` yang menutupi seluruh area — karena itu
  // ia cuma bisa penuh layar, tak pernah bisa berbagi tempat dengan yang lain.
  const [logicPct, setLogicPct] = useState(45);
  // ── Jembatan panel Code -> terminal ──
  //
  // Terminal memegang sesi PTY-nya sendiri di dalam VSCodeTerminal, dan panel
  // Code adalah saudaranya — bukan induknya. Perintah dititipkan lewat state di
  // sini, lalu diturunkan sebagai prop. Nonce ikut dikirim supaya menjalankan
  // berkas yang SAMA dua kali tetap terbaca sebagai dua permintaan; tanpa itu
  // nilainya tak berubah dan effect di terminal tak menyala lagi.
  const [perintahTerminal, setPerintahTerminal] = useState(null);
  // Debugger yang SEDANG hidup, atau null. Ini yang menentukan bilah debug
  // muncul atau tidak, dan kata perintah mana yang dikirim tiap tombolnya.
  const [debugAktif, setDebugAktif] = useState(null);
  // { mulai, berkas } dari panel kode, atau null saat berkas yang terbuka tak
  // punya debugger. Dititipkan ke tab DEBUG supaya tombol mulainya ada di sana
  // TANPA memotong jalur "simpan dulu" yang dimiliki panel kode.
  const [pemicuDebug, setPemicuDebug] = useState(null);
  // (Effect "terminal ditutup -> sesi debug mati" ada DI BAWAH, sesudah
  // terminalOpen dideklarasikan. Di sini ia melempar ReferenceError: senarai
  // dependensi dinilai saat render, bukan saat effect-nya berjalan.)
  // ── Sesi DAP ──
  //
  // Python memakai jalur ini; bahasa lain masih lewat PTY. Keduanya sengaja
  // hidup berdampingan alih-alih menunggu semua bahasa punya adapter: yang
  // sudah bisa memberi titik henti klik dan panel variabel tak perlu menunggu
  // yang belum.
  const [titikHenti, setTitikHenti] = useState({}); // { rel: [baris] }
  // Salinan ref-nya. jalankanDiTerminal dibungkus useCallback, dan callback
  // yang membaca state langsung memegang nilai dari render saat ia dibuat —
  // titik henti yang baru dipasang sesudah itu tak akan ikut terkirim.
  const titikHentiRef = useRef({});
  useEffect(() => {
    titikHentiRef.current = titikHenti;
  }, [titikHenti]);
  const [dapId, setDapId] = useState(null);
  const [dapKeadaan, setDapKeadaan] = useState(null);
  const dapKeluaranRef = useRef([]);
  useEffect(() => {
    if (!dapId) return;
    let mati = false;
    let jam = null;
    const tanya = async () => {
      try {
        const r = await fetch(
          "/dap/keadaan?id=" +
            encodeURIComponent(dapId) +
            "&sejak=" +
            dapKeluaranRef.current.length,
        );
        const d = await r.json();
        if (mati) return;
        if (!d || d.ok === false) {
          setDapId(null);
          return;
        }
        // Keluaran DITAMBAHKAN, bukan diganti: server sengaja hanya mengirim
        // yang belum dipegang renderer supaya muatannya tak tumbuh sepanjang
        // sesi, jadi menggantinya akan membuang semua yang sudah ada.
        if (d.keluaran && d.keluaran.length)
          dapKeluaranRef.current = dapKeluaranRef.current.concat(d.keluaran);
        setDapKeadaan({ ...d, semuaKeluaran: dapKeluaranRef.current });
      } catch (_) {}
      if (!mati) jam = setTimeout(tanya, 300);
    };
    tanya();
    return () => {
      mati = true;
      clearTimeout(jam);
    };
  }, [dapId]);
  // Sesi ditutup saat panel Code ditutup — kalau tidak, proses Python-nya
  // hidup terus tanpa satu pun cara menyentuhnya lagi.
  useEffect(() => {
    if (logicOpen || !dapId) return;
    fetch("/dap/tutup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: dapId }),
    }).catch(() => {});
    setDapId(null);
  }, [logicOpen, dapId]);

  const mulaiDap = useCallback(async (akar, pathAbsolut, baris) => {
    dapKeluaranRef.current = [];
    setDapKeadaan(null);
    try {
      const r = await fetch("/dap/mulai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root: akar,
          program: pathAbsolut,
          titikHenti: baris || [],
        }),
      });
      const d = await r.json();
      if (!d || !d.ok)
        throw new Error((d && d.error) || "could not start debugging");
      setDapId(d.id);
      return true;
    } catch (e) {
      setDapKeadaan({ selesai: true, galat: String((e && e.message) || e) });
      return false;
    }
  }, []);
  const aksiDap = useCallback(
    async (aksi) => {
      if (!dapId) return;
      await fetch("/dap/aksi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dapId, aksi }),
      }).catch(() => {});
      if (aksi === "berhenti") setDapId(null);
    },
    [dapId],
  );

  const jalankanDiTerminal = useCallback((pathAbsolut, mode, akar) => {
    const debugMode = mode === "debug";
    // Python lewat DAP: itu satu-satunya jalur yang memberi titik henti klik,
    // panel variabel, dan akhir sesi yang pasti. Bahasa lain masih lewat PTY
    // sampai adapternya menyusul.
    if (debugMode && _ADAPTER_DAP[ekstensiDari(pathAbsolut)]) {
      const rel = String(pathAbsolut)
        .slice(String(akar || "").length)
        .replace(/^[\/]+/, "");
      setTerminalOpen(true);
      setDebugAktif("dap");
      mulaiDap(akar, pathAbsolut, (titikHentiRef.current || {})[rel] || []);
      return;
    }
    const cmd = debugMode
      ? perintahDebug(pathAbsolut)
      : perintahJalankan(pathAbsolut);
    if (!cmd) return;
    // Terminalnya dibuka kalau tertutup — kalau tidak, perintahnya terkirim ke
    // komponen yang tak dirender dan hilang tanpa jejak.
    setTerminalOpen(true);
    setDebugAktif(debugMode ? jenisDebugger(pathAbsolut) : null);
    setPerintahTerminal({ cmd, n: Date.now() });
  }, []);
  // Satu tempat untuk menerjemahkan tombol bilah debug jadi kata perintah.
  const aksiDebug = useCallback(
    (aksi) => {
      const peta = _AKSI_DEBUG[debugAktif];
      if (!peta || !peta[aksi]) return;
      setPerintahTerminal({ cmd: peta[aksi], n: Date.now() });
      if (aksi === "berhenti") setDebugAktif(null);
    },
    [debugAktif],
  );

  // ── Posisi panel bisa dipindah, seperti "Move Panel" di VS Code ──
  //
  // Sebelumnya chat, terminal, dan preview adalah TIGA KOLOM SEJAJAR di satu
  // baris flex — termasuk terminal, yang karena itu duduk di kanan alih-alih di
  // bawah. Untuk terminal itu pilihan yang buruk: keluaran perintah berbentuk
  // baris panjang, dan kolom sempit memaksanya membungkus terus-menerus.
  //
  // Bawaannya kini mengikuti kebiasaan yang sudah dikenal orang: preview di
  // KANAN (ia halaman, jadi butuh lebar), terminal di BAWAH (ia baris teks,
  // jadi butuh panjang). Keduanya tetap bisa ditukar.
  const [posisi, setPosisi] = useState(() => {
    const bawaan = {
      preview: "kanan",
      terminal: "bawah",
      logic: "kanan",
      chat: "kiri",
    };
    try {
      const t = JSON.parse(localStorage.getItem("wolfspace_posisi") || "null");
      // Nilai divalidasi, bukan dipercaya: localStorage bisa membawa isi dari
      // versi lama atau suntingan tangan, dan posisi yang tak dikenal akan
      // membuat panelnya tak dirender di mana pun — panel hilang tanpa jejak.
      // "kiri" menyusul sesudah dua yang lain; nilai lama tanpa "kiri" tetap
      // sah, dan nilai tak dikenal jatuh ke bawaannya.
      const sah = (v, d) =>
        v === "kanan" || v === "bawah" || v === "kiri" ? v : d;
      return t
        ? {
            preview: sah(t.preview, bawaan.preview),
            terminal: sah(t.terminal, bawaan.terminal),
            // Tersimpan dari versi sebelum Code jadi panel — nilainya memang
            // tak ada di sana, jadi bawaannya yang dipakai.
            logic: sah(t.logic, bawaan.logic),
            chat: sah(t.chat, bawaan.chat),
          }
        : bawaan;
    } catch (e) {
      return bawaan;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("wolfspace_posisi", JSON.stringify(posisi));
    } catch (e) {}
  }, [posisi]);

  // ── Chat bisa disembunyikan, dan itu butuh penjagaan ──
  //
  // Gunanya: memberi panel preview seluruh layar tanpa harus menutup chat dan
  // kehilangan tempatnya. Tapi menyembunyikan chat saat tak ada panel lain yang
  // terbuka menghasilkan layar KOSONG — dan pemakai tak punya satu pun petunjuk
  // bahwa yang perlu ditekan ada di menu ⋮. Itu jebakan yang dibuat sendiri.
  //
  // Dua lapis penjagaan, dan keduanya perlu:
  //   - menunya MENOLAK menyembunyikan saat tak ada panel lain (lihat TopBar)
  //   - effect di bawah MENGEMBALIKAN chat kalau panel terakhir ditutup selagi
  //     chat tersembunyi — jalur yang tak lewat menu sama sekali
  const [chatVisible, setChatVisible] = useState(() => {
    try {
      return localStorage.getItem("wolfspace_chat_tampil") !== "0";
    } catch (e) {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("wolfspace_chat_tampil", chatVisible ? "1" : "0");
    } catch (e) {}
  }, [chatVisible]);

  const [terminalOpen, setTerminalOpen] = useState(false);
  // Terminal ditutup = sesi debugnya ikut mati. Ini jalur yang PASTI, tak perlu
  // menebak dari keluaran: PTY-nya sendiri dibunuh saat panelnya dilepas, jadi
  // tak ada lagi yang bisa menerima perintah debug.
  //
  // Letaknya WAJIB sesudah deklarasi terminalOpen. Ditaruh di atasnya — di
  // dekat state debug lain, tempat ia "terbaca lebih rapi" — ia melempar
  // ReferenceError yang menjatuhkan seluruh aplikasi: senarai dependensi
  // dinilai SAAT RENDER, bukan saat effect-nya berjalan, jadi ia menyentuh
  // binding yang masih di zona mati temporal.
  useEffect(() => {
    if (!terminalOpen) setDebugAktif(null);
  }, [terminalOpen]);
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
        setStatus("Terminal closed.");
        return true;
      }
      if (sub === "toggle") {
        setTerminalOpen((v) => !v);
        setStatus("Terminal status updated.");
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
  // SATU penangan untuk kedua sumbu. Dulu ada dua salinan yang identik kecuali
  // setter-nya, dan keduanya keras memakai clientX — begitu panel bisa pindah ke
  // bawah, menggeser pembagi horizontal akan mengubah ukuran memakai koordinat
  // yang salah sumbu. Sumbunya kini mengikuti POSISI panelnya.
  const geserPembagi = (sumbu, set) => (e) => {
    e.preventDefault();
    const move = (ev) => {
      const total = sumbu === "x" ? window.innerWidth : window.innerHeight;
      const dari = sumbu === "x" ? ev.clientX : ev.clientY;
      set(Math.min(75, Math.max(12, ((total - dari) / total) * 100)));
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
    // Cloud-only: the local llama.cpp/GGUF path was removed together with the
    // Model Hub, so the picker is built purely from configured cloud providers.
    const opts = [];
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
        { role: "model", text: "" },
      ]);
      try {
        const res = await streamChat(
          reqFor(modelVal, getCloud(), newHist),
          (t) => {
            setMessages((m) => {
              const c = m.slice();
              c[c.length - 1] = { role: "model", text: t };
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
        else setStatus("cancelled");
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
              upd({ thinking: "Waiting for your reply...", busy: true });
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
                upd({ thinking: "Waiting for your approval...", busy: true });
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
                // `run`, `phase`, dan `phaseNodes` DIHAPUS: self_agent tak
                // pernah memancarkan ketiganya. `run` dulu berisi {ok:true,
                // info:"auto-run disabled"} dari runReply yang tak menjalankan
                // apa pun, dan phaseNodes menumpuk ke keadaan yang tak dirender
                // komponen mana pun.
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
    setStatus("cancelled");
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

  // ── Ukuran baris atas, dihitung sekali ──
  //
  // Panel di KANAN memakan lebar; panel di BAWAH memakan tinggi. Keduanya
  // dihitung terpisah justru supaya tak saling potong: memakai satu angka untuk
  // dua sumbu membuat chat menyusut dua kali padahal cuma satu panel terbuka.
  // Panel didaftar, bukan dihitung satu per satu. Bentuk lamanya menyebut tiap
  // panel di empat rumus terpisah (_xKanan, _xBawah, jumlah bawah, lebar atas);
  // begitu Code jadi panel ketiga, pola itu berarti menyunting keempatnya dan
  // berharap tak ada yang terlewat.
  const _panelTerbuka = [
    terminalOpen && { sisi: posisi.terminal, pct: terminalPct },
    panelOpen && { sisi: posisi.preview, pct: panelPct },
    logicOpen && { sisi: posisi.logic, pct: logicPct },
  ].filter(Boolean);
  const _adaPanel = _panelTerbuka.length > 0;
  // Jaring pengaman terakhir: kalau panel terakhir ditutup selagi chat
  // tersembunyi, layar jadi kosong total dan tak ada jalan kembali yang
  // terlihat. Menu sudah menolak kasus itu, tapi menutup panel TIDAK lewat menu.
  useEffect(() => {
    if (!chatVisible && !_adaPanel) setChatVisible(true);
  }, [chatVisible, _adaPanel]);

  // ── Sisi dikelompokkan per SUMBU, bukan per nama ──
  //
  // "kiri" dan "kanan" sama-sama memakan LEBAR dan sama-sama duduk di baris
  // pertama; yang membedakan cuma urutan visualnya. Menghitungnya terpisah
  // berarti panel kiri tak ikut mengurangi lebar chat — chat lalu diminta
  // selebar sisa yang sudah dipakai orang lain, dan panel terakhir terdorong
  // turun ke baris berikutnya.
  const _grup = (sisi) => (sisi === "bawah" ? "bawah" : "mendatar");
  const _jumlahGrup = (g) =>
    _panelTerbuka.reduce((n, p) => n + (_grup(p.sisi) === g ? p.pct : 0), 0);
  const _adaMendatar = _panelTerbuka.some((p) => _grup(p.sisi) === "mendatar");
  // ── Jatah per sisi, dan kenapa ia WAJIB ada sejak panel ketiga ──
  //
  // Tiap pembagi dibatasi 12–75% SENDIRI-SENDIRI. Dengan dua panel itu masih
  // bisa dianggap aman; dengan tiga, tiga panel di sisi yang sama menjumlah
  // sampai 225% tanpa satu pun melanggar batasnya. Di wadah yang membungkus,
  // kelebihan sekecil apa pun mendorong panel terakhir turun ke baris
  // berikutnya — bug yang persis sama dengan yang dulu tertangkap harness
  // geometri, hanya sumbernya beda.
  //
  // Jadi jumlah per sisi diciutkan proporsional supaya muat. Chat menyisakan
  // 20% untuk dirinya; tanpa chat, panel boleh mengambil seluruhnya.
  const _JATAH = chatVisible ? 80 : 100;
  const _skalaSisi = (sisi) => {
    const g = _grup(sisi);
    const jml = _jumlahGrup(g);
    if (jml <= 0) return 1;
    if (jml > _JATAH) return _JATAH / jml;
    // Dinaikkan HANYA saat panel bawah satu-satunya penghuni layar. Kalau chat
    // masih ada, ruang sisa memang miliknya — bukan lubang yang perlu ditambal.
    if (g === "bawah" && !chatVisible && !_adaMendatar) return 100 / jml;
    return 1;
  };
  const _jumlahBawah = _jumlahGrup("bawah") * _skalaSisi("bawah");
  const lebarAtas = Math.max(
    20,
    100 - _jumlahGrup("mendatar") * _skalaSisi("kanan"),
  );
  // ── Saat chat disembunyikan, sisanya harus MENGISI, bukan meninggalkan lubang ──
  //
  // Persentase panel selama ini dihitung sebagai "bagian dari layar yang tidak
  // dipakai chat". Begitu chat hilang, angka itu tak lagi berarti apa-apa:
  // terminal 30% + preview 35% di bawah menyisakan 35% ruang kosong yang tak
  // ditempati siapa pun, dan pemakai melihat pita hitam tanpa penjelasan.
  //
  // Jadi saat chat disembunyikan:
  //   - masih ada panel di kanan -> baris atas tetap setinggi sisa; panel kanan
  //     yang melebar mengisi lebarnya (lihat gayaPanel)
  //   - semua panel di bawah      -> tak ada baris atas sama sekali (0), dan
  //     tinggi tiap panel dinormalkan supaya jumlahnya tepat 100%
  const _isiPenuh = !chatVisible;
  const tinggiAtas = _isiPenuh
    ? _adaMendatar
      ? Math.max(20, 100 - _jumlahBawah)
      : 0
    : Math.max(20, 100 - _jumlahBawah);
  // Gaya sebuah panel + pembaginya, mengikuti sisi tempat ia duduk. Satu tempat
  // supaya terminal dan preview tak pernah menyimpang perlakuannya.
  //
  // TIAP PANEL MENANGGUNG 6px PEMBAGINYA SENDIRI. Tanpa itu jumlahnya melewati
  // 100% — chat 65% + preview 35% + pembagi 6px = 1006px di layar 1000px — dan
  // di wadah yang membungkus, kelebihan sekecil apa pun membuat panel yang
  // seharusnya di KANAN terdorong turun ke baris berikutnya. Terukur di harness
  // geometri: preview diminta di kanan, hasilnya mendarat di x=0 y=420.
  // ── Urutan visual: satu tabel, bukan angka yang tersebar ──
  //
  // Baris pertama disusun dengan `order`, dan yang menentukan bukan cuma sisi
  // panelnya — posisi CHAT ikut menggesernya. Kalau chat di kanan, pembagi
  // milik panel kanan harus pindah ke sisi yang menghadap chat; kalau tidak,
  // garis pemisahnya nyasar ke tepi luar dan panelnya menempel ke chat tanpa
  // pemisah sama sekali.
  //
  //   chat "kiri"  :  [chat] [div] [kanan…]        kiri…] [div] [chat]
  //   chat "kanan" :  [kiri…] [div] [kanan…] [div] [chat]
  //
  // Angka bawah sengaja jauh (20): ia selalu paling akhir, dan memberi jarak
  // supaya nilai baris pertama bisa disisipkan tanpa bertabrakan.
  const _chatKanan = posisi.chat === "kanan";
  const _ORDER_CHAT = _chatKanan ? 10 : 0;
  const _orderPanel = (sisi) =>
    sisi === "bawah" ? 20 : sisi === "kiri" ? -2 : 1;
  // Pembagi selalu di sisi panel yang MENGHADAP chat.
  const _orderPembagi = (sisi) =>
    sisi === "bawah" ? 20 : sisi === "kiri" ? -1 : _chatKanan ? 2 : 0;

  const gayaPanel = (sisi, pct) =>
    sisi === "bawah"
      ? {
          flex: "0 0 auto",
          width: "100%",
          height: "calc(" + pct * _skalaSisi("bawah") + "% - 6px)",
          order: _orderPanel(sisi),
        }
      : {
          // Tanpa chat, panel kanan MELEBAR mengisi baris. Grow-nya sebanding
          // dengan pct, bukan "1 1 0%" rata: dengan satu panel keduanya sama
          // saja, tapi dengan dua atau tiga panel kanan, grow rata membuat
          // semuanya selebar sama persis — hasil seretan pembagi hilang tanpa
          // sebab yang terlihat.
          flex: _isiPenuh
            ? pct + " 1 0%"
            : "0 0 calc(" + pct * _skalaSisi("kanan") + "% - 6px)",
          height: tinggiAtas + "%",
          order: _orderPanel(sisi),
        };
  const gayaPembagi = (sisi) =>
    sisi === "bawah"
      ? {
          flex: "0 0 auto",
          width: "100%",
          height: "6px",
          order: _orderPembagi(sisi),
        }
      : { order: _orderPembagi(sisi), height: tinggiAtas + "%" };

  return (
    <>
      <div className={"app has-sidebar sb-" + sbMode}>
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
          mode={sbMode}
          putarMode={putarSidebar}
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
          posisi={posisi}
          setPosisi={setPosisi}
          chatVisible={chatVisible}
          setChatVisible={setChatVisible}
          panelOpen={panelOpen}
          logicOpen={logicOpen}
          setLogicOpen={setLogicOpen}
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
            {/* Panel dipindah lewat PEMBUNGKUSAN FLEKS, bukan penyusunan ulang
                markup. .chat-split membungkus (flex-wrap), jadi panel yang
                lebarnya 100% otomatis turun ke baris berikutnya — itulah
                "bawah". Yang lebarnya sebagian tetap di baris pertama — itulah
                "kanan". Urutannya diatur `order` supaya panel bawah selalu
                jatuh di bawah, apa pun urutannya di sumber.

                Kenapa begini, bukan membungkus chat + panel-bawah dalam satu
                kolom: blok preview panjangnya ~590 baris, dan memindahkannya
                berarti memotong-tempel JSX sebesar itu hanya untuk mengubah
                POSISI. Cara ini mencapai hasil yang sama tanpa memindahkan satu
                baris pun. */}
            <div className="chat-split" style={{ position: "relative" }}>
              {chatVisible && (
                <div
                  className="chat-col"
                  style={{
                    // Lebarnya SISA, bukan persentase. Memberi chat basis 65%
                    // membuat baris pertama diukur sebagai 65% + 35% + pembagi —
                    // melebihi 100%, sehingga panel kanan terdorong turun. Dengan
                    // basis 0 dan grow 1, chat mengambil apa pun yang tersisa
                    // SESUDAH panel kanan mendapat jatahnya, jadi tak pernah ada
                    // kelebihan. lebarAtas tetap dipakai sebagai lebar MINIMUM
                    // supaya chat tak bisa diperas habis.
                    flex: "1 1 0%",
                    minWidth: lebarAtas + "%",
                    height: tinggiAtas + "%",
                    order: _ORDER_CHAT,
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
              )}
              {terminalOpen && (
                <>
                  <div
                    className={
                      "split-divider" +
                      (posisi.terminal === "bawah" ? " split-divider-h" : "")
                    }
                    style={gayaPembagi(posisi.terminal)}
                    onMouseDown={geserPembagi(
                      posisi.terminal === "bawah" ? "y" : "x",
                      setTerminalPct,
                    )}
                  />
                  <div
                    className="terminal-col"
                    style={{
                      ...gayaPanel(posisi.terminal, terminalPct),
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
                      perintah={perintahTerminal}
                      debugAktif={debugAktif}
                      onAksiDebug={aksiDebug}
                      pemicuDebug={pemicuDebug}
                      onDebugSelesai={() => setDebugAktif(null)}
                      dapKeadaan={dapKeadaan}
                      onAksiDap={aksiDap}
                    />
                  </div>
                </>
              )}
              {panelOpen && (
                <>
                  <div
                    className={
                      "split-divider" +
                      (posisi.preview === "bawah" ? " split-divider-h" : "")
                    }
                    style={gayaPembagi(posisi.preview)}
                    onMouseDown={geserPembagi(
                      posisi.preview === "bawah" ? "y" : "x",
                      setPanelPct,
                    )}
                  />
                  <div
                    className="canvas-col"
                    style={{
                      ...gayaPanel(posisi.preview, panelPct),
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
                        title="Panel menu"
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
                          placeholder="Search the web, or type a URL / file path"
                          title={
                            "This bar works like a browser address bar:\n" +
                            "  • file path     C:\\...\\index.html\n" +
                            "  • URL / domain  github.com, http://localhost:3000\n" +
                            "  • anything else searches the web"
                          }
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
                      {/* Situs luar yang ditolak tampil di dalam frame TIDAK
                          memicu onerror — iframe-nya cuma tinggal putih. Overlay
                          ini menggantikan layar putih diam itu dengan sebab dan
                          satu jalan keluar yang memang bekerja. */}
                      {preview.gagalLuar && (
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            zIndex: 5,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "14px",
                            padding: "32px",
                            textAlign: "center",
                            background: "#0f1318",
                            color: "#8b98a9",
                          }}
                        >
                          <div style={{ fontSize: "34px" }}>🚫</div>
                          <h3 style={{ margin: 0, color: "#dce4f0" }}>
                            Halaman gagal dimuat
                          </h3>
                          {/* Sebabnya diambil dari peristiwa did-fail-load
                              webview, bukan dikarang. Versi sebelumnya menebak
                              "situsnya menolak di-frame" — dan saat diuji dengan
                              wikipedia.org tebakan itu terbukti keliru
                              menyalahkan situs yang baik-baik saja. */}
                          <p
                            style={{
                              margin: 0,
                              fontSize: "13px",
                              lineHeight: 1.6,
                              maxWidth: "420px",
                            }}
                          >
                            {preview.gagalLuar}
                          </p>
                          <button
                            className="btn-reset"
                            onClick={() => window.open(preview.url, "_blank")}
                            style={{
                              background: "#2f81f7",
                              color: "#fff",
                              border: "none",
                              borderRadius: "6px",
                              padding: "8px 16px",
                              fontSize: "13px",
                              fontFamily: "inherit",
                              cursor: "pointer",
                            }}
                          >
                            Buka di browser sistem
                          </button>
                          <code
                            style={{
                              fontSize: "11px",
                              background: "#131922",
                              border: "1px solid #212a36",
                              borderRadius: "4px",
                              padding: "4px 8px",
                              maxWidth: "420px",
                              wordBreak: "break-all",
                            }}
                          >
                            {preview.url}
                          </code>
                        </div>
                      )}
                      {preview.url && preview.luar ? (
                        /* Wadah KOSONG — penanda posisi, bukan isi.
                           Situs luar digambar oleh WebContentsView di proses
                           main, yang MENGAMBANG di atas jendela. Yang dikirim
                           ke sana adalah persegi panjang wadah ini.

                           Kenapa bukan <iframe>: renderer ini tak bisa memuat
                           situs luar lewat subframe sama sekali — permintaan
                           dikirim lalu net::ERR_ABORTED sebelum satu pun header
                           kembali, termasuk untuk situs yang TERBUKTI boleh
                           di-frame seperti wikipedia.org.
                           Kenapa bukan <webview>: Electron CRASH dengan
                           FATAL:check.cc NOTREACHED. */
                        <div
                          ref={preview.slotRef}
                          style={{ flex: 1, width: "100%", height: "100%" }}
                        />
                      ) : preview.url ? (
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
                <>
                  {/* Panel ketiga, diperlakukan PERSIS seperti terminal dan
                      preview: pembagi yang bisa diseret + gaya dari gayaPanel.
                      Bentuk lamanya `position:absolute; inset:0; zIndex:60` —
                      lapisan yang menutupi seluruh area, dan itulah satu-satunya
                      alasan ia cuma bisa penuh layar. */}
                  <div
                    className={
                      "split-divider" +
                      (posisi.logic === "bawah" ? " split-divider-h" : "")
                    }
                    style={gayaPembagi(posisi.logic)}
                    onMouseDown={geserPembagi(
                      posisi.logic === "bawah" ? "y" : "x",
                      setLogicPct,
                    )}
                  />
                  <div
                    style={{
                      ...gayaPanel(posisi.logic, logicPct),
                      background: "var(--surface-1, #0f1318)",
                      display: "flex",
                      flexDirection: "column",
                      minWidth: 0,
                      minHeight: 0,
                      overflow: "hidden",
                    }}
                  >
                    {/* Bilah judul "Logic" DIHAPUS. Panel ini sudah punya dua
                      header di bawahnya — "Files" di pohon berkas dan nama
                      berkas di editor — jadi ia baris ketiga yang tak membawa
                      keterangan baru, hanya memakan tinggi.

                      Tombol tutupnya ikut hilang bersamanya; penggantinya ada di
                      menu ☰ -> TAMPILAN -> Code -> Tutup. */}
                    {/* Isi Logic: pohon berkas di kiri, isi berkasnya di kanan
                      — tata letak yang sama dengan VS Code. */}
                    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
                      <LogicFileTree
                        files={devFiles}
                        folders={devFolders}
                        root={webProjectRoot(preview.url, selectedProject)}
                        active={!!preview.url}
                        terpilih={logicBerkas}
                        onPilih={bukaTab}
                        onHapus={(rel) => {
                          // The file is gone from disk, so both the list and its
                          // tab have to go with it. Leaving either behind means a
                          // row that opens nothing and a tab that loads a 404.
                          setDevFiles((prev) => prev.filter((x) => x !== rel));
                          tutupTab(rel);
                        }}
                        onHapusFolder={(rel) => {
                          // Everything under the folder is gone from disk, so it
                          // has to go from both lists and from any open tab.
                          // Leaving a child behind means a row that opens
                          // nothing and a tab that loads a 404.
                          const di = (x) =>
                            x === rel || x.startsWith(rel + "/");
                          setDevFiles((prev) => {
                            prev.filter(di).forEach((x) => tutupTab(x));
                            return prev.filter((x) => !di(x));
                          });
                          setDevFolders((prev) => prev.filter((x) => !di(x)));
                        }}
                        onBuatFolder={(rel) =>
                          setDevFolders((prev) =>
                            prev.includes(rel) ? prev : prev.concat(rel),
                          )
                        }
                        onBuat={(rel) => {
                          // devFiles adalah daftar berkas yang SEDANG dikerjakan.
                          // Berkas yang baru dibuat pemakai termasuk di dalamnya,
                          // persis seperti berkas yang ditulis agent.
                          setDevFiles((prev) =>
                            prev.indexOf(rel) >= 0 ? prev : prev.concat(rel),
                          );
                          bukaTab(rel);
                        }}
                      />
                      <LogicCodePane
                        root={webProjectRoot(preview.url, selectedProject)}
                        rel={logicBerkas}
                        tabs={logicTabs}
                        onPilihTab={setLogicBerkas}
                        onTutupTab={tutupTab}
                        onGeserTab={geserTab}
                        onKotorBerubah={tandaiKotor}
                        onRun={jalankanDiTerminal}
                        onDaftarDebug={setPemicuDebug}
                        titikHenti={titikHenti}
                        setTitikHenti={setTitikHenti}
                        barisAktif={
                          dapKeadaan && dapKeadaan.berhenti
                            ? {
                                berkas: logicBerkas,
                                baris: dapKeadaan.berhenti.baris,
                              }
                            : null
                        }
                      />
                    </div>
                  </div>
                </>
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
