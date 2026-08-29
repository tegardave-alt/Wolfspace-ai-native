const { useState, useRef, useEffect, useCallback, useMemo } = React;

// ── The agent's thread_id survives a page reload ──
//
// WHY THIS EXISTS. thread_id lived in React state alone. As soon as the page
// reloaded mid-run — and public/index.html does call window.location.reload()
// for frontend changes that are not .css/.jsx/.js — thread_id vanished. The
// next request went without it, self_agent.ts minted a NEW thread, MemorySaver
// had no checkpoint for it, and the agent started over from nothing.
//
// A guard in electron/main.js already defers hot-reload while the agent works,
// so the most common reload source is already closed. This is the second layer:
// a reload from anywhere (F5, index.html's Babel rollback, a renderer crash) no
// longer makes the agent forget.
//
// It expires after 30 minutes and is DELETED once a run genuinely finishes.
// Without that, a stale thread would quietly attach the next, entirely
// unrelated message to an old conversation — a failure more confusing than
// simply repeating the work.
const THREAD_KEY = "wolfspace:thread-terputus";
const THREAD_TTL_MS = 30 * 60 * 1000;
function simpanThreadTerputus(id: any) {
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

/* Icons moved to public/app/Icons.tsx (APP_MODULES). */

/* ----------------------------- Backend glue ----------------------------- */
const PREFIXES: [string, string, string][] = [
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
const CLOUD_DEFAULT: Record<string, string> = {
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
const PROVIDER_LABELS: Record<string, string> = {
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
function detectPrefix(key: any): { provider: string; name: string } | null {
  key = (key || "").trim();
  for (const [p, prov, name] of PREFIXES)
    if (key.startsWith(p)) return { provider: prov, name };
  return key ? { provider: "openai", name: "OpenAI" } : null;
}
function keyish(s: any) {
  return /^(sk-|gsk_|AIza|github_pat_|ghp_)/.test((s || "").trim());
}
function getCloud() {
  try {
    return JSON.parse(localStorage.getItem("wolfspace_cloud") || "null");
  } catch (e) {
    return null;
  }
}
function setCloudLS(c: any) {
  if (c) localStorage.setItem("wolfspace_cloud", JSON.stringify(c));
  else localStorage.removeItem("wolfspace_cloud");
}
function escHtml(s: any) {
  return s.replace(
    /[&<>]/g,
    (c: any) =>
      (({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }) as Record<string, string>)[
        c
      ]!,
  );
}
function mdInline(s: any) {
  let h = escHtml(s);
  h = h.replace(/`([^`\n]+)`/g, '<span class="inline-code">$1</span>');
  h = h.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  return h;
}
function mdToHtml(s: any) {
  const lines = s.split(/\r?\n/);
  const outBlocks: any[] = [];
  let normalLines: any[] = [];

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
      const parseRow = (r: any) => {
        let trimmed = r.trim();
        if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
        if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
        return trimmed.split("|").map((c: any) => c.trim());
      };
      const headers = parseRow(line);
      i += 2;
      const rows: any[] = [];
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
      headers.forEach((h: any) => {
        html += `<th>${mdInline(h)}</th>`;
      });
      html += "</tr></thead><tbody>";
      rows.forEach((row: any) => {
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
function parseBlocks(text: any) {
  // Pre-processing: when the model supplies only a closing tag and forgets the
  // opening one.
  if (
    (text.includes("</think>") || text.includes("</thought>")) &&
    !text.includes("<think>") &&
    !text.includes("<thought>")
  ) {
    text = "<think>\n" + text;
  }

  const out: any[] = [];
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
function reqFor(_modelVal: any, cloud: any, history: any) {
  return { history, cloud, effort: readEffort(cloud) };
}
// Verify HTTP server is running (only for browser users, not Electron)
async function checkServerHealth() {
  if (IPC) return true; // Electron: uses IPC, no HTTP needed
  try {
    const r = await fetch("/", { method: "HEAD", timeout: 2000 } as any);
    return r.ok;
  } catch {
    return false;
  }
}
// Parse an SSE stream from a fetch Response, calling onEvent(parsedJSON) per line.
async function pumpSSE(r: any, signal: any, onEvent: any) {
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop()!;
    for (const line of lines) {
      const mm = line.match(/^data:\s*(.*)$/);
      if (!mm) continue;
      let j: any;
      try {
        j = JSON.parse(mm[1]!);
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

// Fetch /ww/list over IPC (Electron: no HTTP server) OR fetch (browser).
// Without this, in the Electron app's app:// origin, fetch("/ww/list") 404s and
// ghosts are never cleared.
async function wwApi(
  path: string,
  { method = "GET", body = null }: { method?: string; body?: any } = {},
) {
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
// Electron has NO HTTP server (zero open ports). Route every path-relative
// fetch ("/…") to the in-process backend through IPC.invoke("api"), so ALL
// non-streaming endpoints (models, cloud-providers, detect-key, cloud-save, hf,
// ollama, agents, terminal, run, and so on) work under Electron WITHOUT
// changing a single call site. In a browser (IPC null) the shim is NOT
// installed and real fetch is used. Chat and self-agent use IPC.stream rather
// than fetch, so they are unaffected.
if (
  typeof window !== "undefined" &&
  IPC &&
  IPC.invoke &&
  window.fetch &&
  !window.__wwFetchShimmed
) {
  window.__wwFetchShimmed = true;
  const _realFetch = window.fetch.bind(window);
  window.fetch = (async (input: any, init: any) => {
    init = init || {};
    const url = typeof input === "string" ? input : (input && input.url) || "";
    // Same-origin path-relative APIs only. Absolute, external or blob URLs go
    // to the real fetch.
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
    // FormData and streams are unsupported by the shim, so they are handed to
    // the real fetch (rare on a relative path).
    if (body != null && typeof body !== "string")
      return _realFetch(input, init);
    let payload: any = null;
    if (body != null) {
      try {
        payload = JSON.parse(body);
      } catch (_) {
        payload = body;
      }
    }
    let r: any;
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
      headers: { get: (k: any) => hdr[String(k).toLowerCase()] ?? null },
      json: async () => JSON.parse(text || "null"),
      text: async () => text,
      clone() {
        return this;
      },
    };
  }) as any;
}

// ── Electron EventSource-shim ──
// EventSource (SSE) is NOT fetch, so the fetch shim never catches it — under
// Electron `new EventSource("/api/agents/stream")` goes to app:// (404), killing
// the live output of Agent Runner and the opencode CLI. Under Electron,
// path-relative EventSource is routed to IPC.stream("api", …) (apiStream) and
// the SSE is parsed into onmessage events.
if (
  typeof window !== "undefined" &&
  IPC &&
  IPC.stream &&
  !window.__wwEventSourceShimmed
) {
  window.__wwEventSourceShimmed = true;
  const _RealES = window.EventSource;
  window.EventSource = function (url: any) {
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
    let cancel: any = null;
    try {
      cancel = IPC.stream(
        "api",
        { method: "GET", path: url },
        (chunk: any) => {
          if (typeof chunk !== "string") return;
          buf += chunk;
          let i: any;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const raw = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const dataLines = raw
              .split("\n")
              .filter((l: any) => l.slice(0, 5) === "data:")
              .map((l: any) => l.slice(5).replace(/^ /, ""));
            if (dataLines.length && typeof es.onmessage === "function")
              (es.onmessage as any)({ data: dataLines.join("\n") });
          }
        },
        () => {
          es.readyState = 2;
          if (typeof es.onerror === "function")
            (es.onerror as any)({ type: "done" });
        },
      );
    } catch (e) {
      if (typeof es.onerror === "function")
        setTimeout(() => (es.onerror as any)(e), 0);
    }
    es.close = () => {
      es.readyState = 2;
      try {
        cancel && cancel();
      } catch (_) {}
    };
    return es;
  } as any;
}

// ── Auto-migrasi localStorage (Electron, sekali jalan) ──
// If a bridge file from the browser exists (~/.wolfspace/ls-migrate.json via
// /ww/ls-load) and this Electron has never migrated, APPLY IT AUTOMATICALLY on
// load — with nothing to paste into the DevTools console, which self-XSS
// protection blocks anyway.
if (
  typeof window !== "undefined" &&
  IPC &&
  IPC.invoke &&
  !localStorage.getItem("wolfspace_migrated")
) {
  IPC.invoke("api", { method: "GET", path: "/ww/ls-load" })
    .then((r: any) => {
      if (!r || r.status !== 200) return;
      let data = {};
      try {
        data = JSON.parse(r.body).data || {};
      } catch (_) {
        return;
      }
      const keys = Object.keys(data).filter(
        (k: any) => k !== "wolfspace_migrated",
      );
      if (!keys.length) return; // no browser dump yet -> check again next time
      for (const k of keys) localStorage.setItem(k, (data as any)[k]);
      localStorage.setItem("wolfspace_migrated", "1");
      console.log(
        "[ww] localStorage auto-migration: " +
          keys.length +
          " keys imported — reloading…",
      );
      location.reload();
    })
    .catch(() => {});
}

async function streamChat(reqBody: any, onText: any, signal: any) {
  // No more `run`: the "run"/"retry" branches used to carry auto-run results,
  // and agent/chat.cjs no longer emits either — it sends only tok, err and done.
  // Keeping them would mean maintaining state that is always null.
  let acc = "";
  const handle = (j: any) => {
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
    await new Promise((resolve: any) => {
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
async function streamSelfAgent(reqBody: any, onEvent: any, signal: any) {
  if (IPC) {
    await new Promise((resolve: any) => {
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
    if (
      e instanceof TypeError &&
      (e as any).message.includes("Failed to fetch")
    ) {
      throw new Error(
        'Cannot reach the self-agent server.\n\nIf you are running in a browser:\n1. Open a terminal in the WOLFSPACE folder\n2. Run: npm start\n3. Wait until "http://127.0.0.1:8090" appears\n4. Refresh the browser and try again\n\nOr use Electron: npm run app',
      );
    }
    throw e;
  }
}

/* Components moved to public/app/Components.tsx (APP_MODULES). */

/* Sidebar moved to public/app/Sidebar.tsx (APP_MODULES). */

/* ----------------------------- App ----------------------------- */
const SUGGESTIONS: any[] = [];

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
/* Screens moved to public/app/Screens.tsx (APP_MODULES). */

/* ── Logic: sidebar file (tab Changes/Files) — desain mengikuti prototipe/screenshot.
   Wired to the REAL workspace file list through GET /ww/tree, but only ACTIVE
   in a web-dev context (`active`) — when the agent is building or changing a
   site, for instance.
   Props: root=path workspace, active=boolean (sinyal web-dev). ── */
// The Logic sidebar root is the FOLDER of the site being built, not the whole
// workspace. previewUrl looks like "/preview-file?path=<abs .html>" (set when
// the agent writes HTML), so the file's directory is taken from it. When
// previewUrl is an http URL (a dev server) there is no local folder, so the
// fallback (the active workspace) is used.
function webProjectRoot(previewUrl: any, fallback: any) {
  if (!previewUrl) return fallback;
  const m = String(previewUrl).match(/[?&]path=([^&]+)/);
  if (m) {
    try {
      const abs = decodeURIComponent(m[1]!);
      const dir = abs.replace(/[\\/][^\\/]*$/, ""); // buang nama file → dirname
      if (dir && dir !== abs) return dir;
    } catch (_) {}
  }
  return fallback;
}
// Per-language file icons. The table lives in public/app/IkonBahasa.jsx,
// generated by scripts/ikon-bahasa/build.cjs from material-icon-theme (MIT) —
// the same icon theme VS Code uses, so these are the icons people recognise.
//
// Vendored as a single module rather than taken as a runtime dependency: the
// original package is 1250 SVGs (1.6 MB) while only dozens ever appear in this
// tree.
function ekstensiDari(name: any) {
  const m = String(name || "")
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function tsjFileType(name: any, dir: any) {
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
  // The language is checked AFTER the special cases above: README.md keeps the
  // info icon rather than an "MD" monogram — its name tells you more than its
  // extension does.
  const ext = ekstensiDari(n);
  if (ext && IKON_BAHASA[ext]) return "lang:" + ext;
  return "file";
}
// Build the tree ONLY from files being ACTIVELY DEVELOPED (written or edited by
// the agent), not from the whole folder. `paths` is the list of touched file
// paths; `root` is the web project folder, used to trim the prefix so paths show
// relative and short. The result is [{ name, depth, type }] — intermediate
// folders are included so the structure is visible, but only along branches
// leading to a developed file.
function buildDevTree(paths: any, root: any, folders: any) {
  const rootN = String(root || "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
  const rootNode: any = { children: {} as Record<string, any> };
  for (const raw of paths || []) {
    let s = String(raw || "").replace(/\\/g, "/");
    const sl = s.toLowerCase();
    if (rootN && sl.startsWith(rootN + "/")) s = s.slice(rootN.length + 1);
    s = s.replace(/^\/+/, "").replace(/^[a-zA-Z]:\//, ""); // drop the drive if not stripped
    const parts = s.split("/").filter(Boolean);
    if (!parts.length) continue;
    let cur = rootNode;
    parts.forEach((part: any, i: number) => {
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
  const out: any[] = [];
  const walk = (node: any, depth: any, pre: any) => {
    const kids = Object.values(node.children);
    const cmp = (a: any, b: any) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    kids
      .filter((k: any) => !k.isFile)
      .sort(cmp)
      .forEach((d: any) => {
        out.push({ name: d.name, depth, type: "folder", rel: pre + d.name });
        walk(d, depth + 1, pre + d.name + "/");
      });
    kids
      .filter((k: any) => k.isFile)
      .sort(cmp)
      .forEach((f: any) =>
        out.push({
          name: f.name,
          depth,
          type: tsjFileType(f.name, false),
          // A path RELATIVE to root, assembled while building the tree. Without
          // it a node has only a name, and a name alone is not enough to open
          // the file — two "index.html" in different folders are
          // indistinguishable.
          rel: pre + f.name,
        }),
      );
  };
  walk(rootNode, 0, "");
  return out;
}
/* ── Panel kode di sisi kanan view Logic ──
   Tata letaknya mengikuti VS Code: pohon berkas di kiri, isi berkas di kanan.

   Contents come through /preview-file?raw=1 — not the ordinary preview path,
   which injects a <base> into HTML files so their relative links resolve. That
   injection is right for a preview and wrong for an editor: what shows is no
   longer the file's contents, and the user reads a line that is not on disk.

   The editor is created ONCE and its model swapped on each file change.
   Recreating the editor on every click stacks Monaco observers, and that is
   precisely the path that has blown up in this repo before (see
   tests/monaco-dekat-layar.test.js). */
// ── One Monaco model per FILE, shared by every editor pane ──
//
// Panes can show the same file at the same time, and a model per pane would
// mean two independent buffers over one path: type in one, save from the
// other, and the first pane's work is overwritten with nothing said. VS Code
// shares the text model between editor groups for exactly this reason.
//
// Sharing also gets the rest for free — an edit shows in both panes at once,
// and the dirty mark is a property of the FILE, not of the pane you happen to
// be looking at.
const _modelBerkas = new Map(); // rel -> monaco model
const _kotorBerkas = new Map(); // rel -> unsaved?
// Every live editor. Needed because a shared model may be attached to a pane
// OTHER than the one releasing it: disposing a model an editor still holds
// throws "Model is disposed!" from inside Monaco on its next layout, and that
// takes the whole renderer down through the error boundary.
const _editorHidup = new Set();

function LogicCodePane({
  root,
  rel,
  onRun,
  onDaftarDebug,
  titikHenti,
  setTitikHenti,
  barisAktif,
  tabs,
  // Every file open across ALL groups. Only used to decide which shared Monaco
  // models may be released; this pane never displays it.
  tabsSemua,
  onPilihTab,
  onTutupTab,
  onGeserTab,
  onKotorBerubah,
  // ── Editor-group props ──
  // fokus: this is the group a click in the file tree opens into.
  fokus,
  onFokus,
  onPecah,
  bisaPecah,
  banyakGrup,
  gaya,
}: any) {
  const hostRef = React.useRef<any>(null);
  const edRef = React.useRef<any>(null);
  const [galat, setGalat] = React.useState("");
  const [muat, setMuat] = React.useState(false);
  // ── This panel is EDITABLE, and that demands three things ──
  //
  // The editor used to be readOnly, so there was no state to protect. Once it
  // could be typed into, three things became necessary: marking that unsaved
  // changes exist, remembering WHICH file is being edited, and stopping a file
  // switch from swallowing unsaved typing.
  const [kotor, setKotor] = React.useState(false);
  // A ref copy of `kotor`. Run is wrapped in useCallback, and a callback that
  // reads state directly holds the value from the render that created it —
  // meaning a Run pressed after typing would still see "clean" and
  // melewatkan simpan tanpa satu pun tanda.
  const kotorRef = React.useRef(false);
  // Dirty state per file now lives in _kotorBerkas at module scope, beside the
  // shared models: a file is dirty or not, and which pane you are looking
  // through does not change the answer.
  const [saveState, setSaveState] = React.useState("");
  // relRef holds the file whose contents are CURRENTLY in the editor. The `rel`
  // prop has already changed to the new file before its contents arrive, so
  // saving by `rel` would write the OLD file's contents under the NEW file's name.
  const relRef = React.useRef(rel);

  // ── Titik henti ──
  //
  // Held ABOVE (in app.tsx) rather than here: it has to survive the user moving
  // to another file and back, and it has to be readable by the debug panel,
  // which is not a child of this component.
  //
  // ubahTitikRef is used because Monaco's click handler is installed ONCE when
  // the editor is created. If it closed over the function from that render, it
  // would see an empty breakpoint list forever — the first click works, the
  // second "removes" a point it believes never existed.
  const ubahTitikRef = React.useRef<(baris?: any) => void>(() => {});
  React.useEffect(() => {
    ubahTitikRef.current = (baris: any) => {
      if (!setTitikHenti) return;
      const berkas = relRef.current;
      if (!berkas) return;
      setTitikHenti((sblm: any) => {
        const ada = (sblm && sblm[berkas]) || [];
        const baru = ada.includes(baris)
          ? ada.filter((l: any) => l !== baris)
          : ada.concat(baris).sort((a: any, b: any) => a - b);
        return { ...(sblm || {}), [berkas]: baru };
      });
    };
  }, [setTitikHenti]);

  // Dekorasi digambar ulang tiap titik henti / baris aktif berubah. Koleksinya
  // held in a ref so the old set is genuinely replaced rather than stacked —
  // stacking leaves removed breakpoints still visible.
  const hiasRef = React.useRef<any>(null);
  React.useEffect(() => {
    const ed = edRef.current;
    if (!ed || !window.monaco) return;
    const garis = (titikHenti && titikHenti[rel]) || [];
    const R = window.monaco.Range;
    const daftar = garis.map((l: any) => ({
      range: new R(l, 1, l, 1),
      options: {
        glyphMarginClassName: "dbg-titik-henti",
        glyphMarginHoverMessage: { value: "Breakpoint on line " + l },
        stickiness: 1, // moves along when lines above are inserted or deleted
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

  // The line the debugger stopped on is SCROLLED to the middle of the view.
  // Without this, stepping into a part of the file that is off screen looks like
  // nothing happened.
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
    window.monacoReady.then((monaco: any) => {
      if (dibuang || !hostRef.current || edRef.current) return;
      pasangSaranPustaka(monaco);
      edRef.current = monaco.editor.create(hostRef.current, {
        value: "",
        language: "plaintext",
        theme: "wolfspace-gelap",
        automaticLayout: true,
        // Editable. It used to be readOnly, and that is what made this panel
        // read-only — loosening it here is half the fix; the other half is the
        // POST /ww/tulis-berkas route.
        readOnly: false,
        domReadOnly: false,
        // false, the same as this app's two other Monaco editors (AgentSteps,
        // CodeBlocks). Differing from them here produced a real bug: the minimap
        // has a SLIDER (the viewport indicator), and on a short file in a narrow
        // panel that slider fills almost the whole minimap height — looking
        // exactly like one solid blue line spanning the full height, and not
        // like a minimap at all.
        minimap: { enabled: false },
        fontSize: 12,
        scrollBeyondLastLine: false,
        wordWrap: "off",
        // The line STILL visible after the minimap was turned off was no
        // minimap remnant at all — it is the top/bottom border of the "active
        // line" highlight box, Monaco's default when renderLineHighlight is
        // unset (default "all"). On the first line its TOP border coincides
        // with the editor edge, so all you see is one full-width line right
        // under the panel header — a completely different cause from the
        // minimap, but looking the same: one solid line the width of the panel.
        //
        // The two other Monaco editors (AgentSteps, CodeBlocks) are already
        // "none", and this panel followed once it became editable: turning it
        // back on reproduces that false line exactly, and Monaco's own cursor
        // marker already shows which line is being typed on.
        renderLineHighlight: "none",
        // THE THIRD CAUSE, found through a Playwright screenshot of an ISOLATED
        // editor (outside the app) so it could not be fooled by caching or a
        // deferred reload. The two fixes above cleared the top and bottom lines;
        // the line on the RIGHT EDGE survived both — traced to the
        // `.decorationsOverviewRuler` element, the 14px canvas Monaco paints
        // itself on the editor's right side (to show error marks and search
        // hits, even with the minimap off). Its border is DRAWN to the canvas
        // rather than set through CSS — so `outline: none` does not touch it;
        // it has to be disabled through this option.
        overviewRulerLanes: 0,
        // The gutter lane breakpoints are drawn in. Without it, a
        // glyphMarginClassName decoration has nowhere to go and is never seen —
        // the click works, the point does not appear, and that is
        // indistinguishable from a breakpoint that failed to set.
        glyphMargin: true,
      });
      // A gutter click sets or clears a breakpoint, as in VS Code. What is
      // checked is the target's TYPE, not its coordinates: the line number and
      // the glyph lane sit side by side, and guessing from x makes a click on
      // ikut memasang titik henti.
      _editorHidup.add(edRef.current);
      edRef.current.onMouseDown((e: any) => {
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
        // The model is NOT disposed here any more, and that is the whole
        // point. It belongs to _modelBerkas and may still be on screen in the
        // other pane — this cleanup used to destroy it and leave a dead entry
        // in the shared map, which is exactly the "Model is disposed!" crash.
        // Detach, drop the editor, leave the buffer alone.
        try {
          edRef.current.setModel(null);
        } catch (_) {}
        _editorHidup.delete(edRef.current);
        edRef.current.dispose();
        edRef.current = null;
      }
    };
  }, []);

  // The root the suggestion provider uses. Set here rather than once when the
  // editor is created: the user can switch projects without the editor being
  // rebuilt, and suggestions left on the old root offer the wrong project's
  // libraries.
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
  // No unmount disposal any more. The models are SHARED (see _modelBerkas
  // above), so a pane that closes must not destroy buffers the surviving pane
  // is still showing. Release is driven by tabsSemua below instead: a model
  // dies when no pane has the file open.

  // Models for files whose tab was closed are released here. Doing it inside
  // the close handler would be wrong: the handler lives in the parent and has
  // no access to this editor's models.
  React.useEffect(() => {
    // tabsSemua, not tabs: the union across every pane. Keyed on this pane's
    // own tabs it would dispose a model the OTHER pane is still displaying,
    // and that pane would go blank mid-edit.
    if (!Array.isArray(tabsSemua)) return;
    const hidup = new Set(tabsSemua);
    for (const [k, m] of _modelBerkas) {
      if (hidup.has(k)) continue;
      // Detach from every live editor FIRST. Whichever pane's effect runs
      // first would otherwise dispose a model the other pane is still
      // displaying, and Monaco throws on that pane's next layout.
      for (const ed of _editorHidup) {
        try {
          if (ed.getModel() === m) ed.setModel(null);
        } catch (_) {}
      }
      try {
        m.dispose();
      } catch (_) {}
      _modelBerkas.delete(k);
      _kotorBerkas.delete(k);
    }
  }, [tabsSemua]);

  React.useEffect(() => {
    if (!rel) {
      // Closing the last tab leaves this pane with no file. Returning early
      // here left the editor holding the model that the release effect above
      // had just disposed — the crash was not the close itself but the next
      // layout after it.
      const ed = edRef.current;
      if (ed) {
        try {
          ed.setModel(null);
        } catch (_) {}
      }
      relRef.current = "";
      return;
    }
    let dibatalkan = false;
    setGalat("");

    const pasang = (model: any) => {
      const ed = edRef.current;
      if (!ed) return;
      ed.setModel(model);
      // Recorded AFTER the model is attached: from this point the editor's
      // contents really do belong to this file. Setting it earlier makes a save
      // mid-load write the old file's contents to the new file's name.
      relRef.current = rel;
      const kotorSekarang = !!(_kotorBerkas.get(rel) || false);
      setKotor(kotorSekarang);
      kotorRef.current = kotorSekarang;
      setSaveState("");
      try {
        ed.focus();
      } catch (_) {}
    };

    let sudahAda = _modelBerkas.get(rel);
    // The store now outlives any single pane, so a stale entry can survive a
    // disposal that happened elsewhere. Handing that straight to setModel is
    // the same crash by another route; drop it and fetch again instead.
    if (sudahAda && sudahAda.isDisposed && sudahAda.isDisposed()) {
      _modelBerkas.delete(rel);
      sudahAda = undefined;
    }
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
      .then((r: any) =>
        r.ok ? r.text() : Promise.reject(new Error("HTTP " + r.status)),
      )
      .then((teks: any) => {
        if (dibatalkan) return;
        setMuat(false);
        if (!edRef.current || !window.monaco) return;
        const model = window.monaco.editor.createModel(teks, bahasaMonaco(rel));
        model.onDidChangeContent(() => {
          _kotorBerkas.set(rel, true);
          if (relRef.current === rel) {
            setKotor(true);
            kotorRef.current = true;
            setSaveState("");
          }
          if (onKotorBerubah) onKotorBerubah(rel, true);
        });
        _modelBerkas.set(rel, model);
        pasang(model);
      })
      .catch((e: any) => {
        if (dibatalkan) return;
        setMuat(false);
        setGalat(String((e as any).message || e));
      });
    return () => {
      dibatalkan = true;
    };
  }, [root, rel, onKotorBerubah]);

  // An ordinary path-relative fetch — the SAME path as loading file contents
  // above. On desktop, the shim at the top of this file already redirects every
  // fetch("/…") to IPC.invoke("api"), so writing an IPC path by hand here would
  // not merely be redundant: it would be a second copy of the same transport,
  // needing its own fix every time the IPC reply shape changes.
  // It returns true/false rather than void: Run uses it to decide whether to
  // continue. Running after a FAILED save means running the old file contents
  // while the error message goes unread.
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
      _kotorBerkas.set(target, false);
      if (onKotorBerubah) onKotorBerubah(target, false);
      setSaveState("saved");
      return true;
    } catch (e) {
      // The dirty marker is DELIBERATELY not cleared on failure: the user must
      // keep seeing that their changes are not safely on disk.
      setSaveState("failed: " + String((e as any).message || e));
      return false;
    }
  }, [root, onKotorBerubah]);

  // ── Run: SAVE FIRST, then run ──
  //
  // Without that, pressing Run after typing runs the OLD file contents — the
  // output does not match what is visible in the editor, and there is not a
  // single clue why. The save is awaited rather than fired alongside: otherwise
  // the command would outrun the write to disk.
  const abs = React.useCallback(
    (r: any) => String(root || "").replace(/[\/]+$/, "") + "/" + r,
    [root],
  );
  const bisaJalan = !!rel && !!perintahJalankan(rel);
  // The extension alone is NOT enough. Without this check, opening a .rb on a
  // machine without rdbg lights the button up, the command fails in the
  // terminal, and the UI still says "Session live · rdbg" — the app reporting a
  // state that does not match reality.
  const [debugAda, setDebugAda] = React.useState<any>(null); // null = not known yet
  React.useEffect(() => {
    let mati = false;
    ambilDebugTersedia().then((d: any) => {
      if (!mati) setDebugAda(d);
    });
    return () => {
      mati = true;
    };
  }, []);
  const jenisDbg = rel ? jenisDebugger(rel) : null;
  // "Not known yet" is treated as ALLOWED: disabling a button because one
  // request failed is more confusing than a command that fails with
  // pesan jelas di terminal.
  const bisaDebug =
    !!rel &&
    !!perintahDebug(rel) &&
    (debugAda === null || debugAda[jenisDbg!] !== false);
  // `mode` is passed straight through to the caller: one path for both Run and
  // Debug, so the "save first" requirement cannot apply to only one of them.
  const kirimKe = React.useCallback(
    async (mode: any) => {
      const target = relRef.current;
      if (!target || !onRun) return;
      if (kotorRef.current) {
        const ok = await simpan();
        if (!ok) return; // could not save -> do not run something stale
      }
      onRun(abs(target), mode, String(root || ""));
    },
    [onRun, simpan, abs],
  );
  const jalankan = React.useCallback(() => kirimKe("jalan"), [kirimKe]);
  const debug = React.useCallback(() => kirimKe("debug"), [kirimKe]);

  // The debug trigger is registered UPWARDS rather than copied into the terminal
  // panel. If the terminal panel called its own debug command it would bypass
  // the "save first" rule that lives here — and running old file contents under
  // a debugger is the most expensive form of confusion there is: the line the
  // debugger highlights does not match the line visible in the editor.
  React.useEffect(() => {
    if (!onDaftarDebug) return;
    if (!rel) {
      onDaftarDebug(null);
      return () => onDaftarDebug(null);
    }
    // The reason is sent along, not just "cannot". A dead button with no
    // explanation is indistinguishable from a broken app — and the two causes
    // call for completely different actions: one means changing file, the other
    // satu pasang debuggernya.
    let alasan = "";
    if (!perintahDebug(rel)) alasan = "No known debugger for this file type.";
    else if (debugAda && debugAda[jenisDbg!] === false)
      alasan =
        "The debugger for this file (" +
        String(_PERINTAH_DEBUG[ekstensiDari(rel)!] || "").split(" ")[0] +
        ") is not installed on this machine.";
    onDaftarDebug({
      berkas: rel,
      mulai: bisaDebug ? debug : null,
      alasan,
    });
    return () => onDaftarDebug(null);
  }, [onDaftarDebug, bisaDebug, debug, rel, debugAda, jenisDbg]);

  // Ctrl+S / Cmd+S inside the editor. Without this the shortcut is taken over by
  // the browser (Save Page) and the user thinks the app is not responding.
  React.useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const tekan = (e: any) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        simpan();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        jalankan();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
        // Ctrl+\ splits, the same key VS Code uses. Bound on the editor host
        // rather than the window: a shortcut this generic must not fire while
        // the user is typing in the chat box on another page.
        e.preventDefault();
        if (bisaPecah && onPecah) onPecah();
      }
    };
    el.addEventListener("keydown", tekan);
    return () => el.removeEventListener("keydown", tekan);
  }, [simpan, jalankan, bisaPecah, onPecah]);

  return (
    <div
      // Capture, not bubble: the press must claim focus for this group BEFORE
      // the thing it landed on acts, or a click straight onto a tab in the
      // unfocused pane would open the file into the OTHER pane.
      onMouseDownCapture={() => onFokus && onFokus()}
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        ...(gaya || {}),
        // The SAME colour as the file panel to its left. The Monaco editor
        // itself has a transparent background (the wolfspace-dark theme), so
        // this is the colour actually seen — the two read as one surface rather
        // than two panels that happen to be adjacent.
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
          // With one group there is nothing to distinguish, so the accent only
          // appears once the area is actually split — a permanent highlight on
          // a single pane says nothing and just adds noise.
          borderBottom:
            banyakGrup && fokus ? "1px solid #3b82f6" : "1px solid #212a36",
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
          {(tabs && tabs.length ? tabs : rel ? [rel] : []).map((t: any) => (
            <div
              key={t}
              role="tab"
              aria-selected={t === rel}
              className={"tab" + (t === rel ? " aktif" : "")}
              title={t}
              draggable
              onDragStart={(e: any) => {
                e.dataTransfer.setData("text/plain", t);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e: any) => {
                // Without preventDefault the browser refuses the drop and the
                // whole gesture silently does nothing.
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e: any) => {
                e.preventDefault();
                const dari = e.dataTransfer.getData("text/plain");
                if (dari && dari !== t && onGeserTab) onGeserTab(dari, t);
              }}
              onClick={() => onPilihTab && onPilihTab(t)}
              onAuxClick={(e: any) => {
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
                  (_kotorBerkas.get(t) || (t === rel && kotor) ? " kotor" : "")
                }
                aria-label={"Close " + t}
                title={"Close " + t}
                onClick={(e: any) => {
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
        {/* Split. Hidden rather than disabled once the area is already split:
            a permanently greyed-out control teaches nothing and occupies the
            row for as long as the split lasts. */}
        {bisaPecah && (
          <button
            type="button"
            className="tab-pecah"
            title="Split editor (Ctrl+\)"
            aria-label="Split editor"
            onClick={() => onPecah && onPecah()}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
          </button>
        )}
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
            {/* A filled triangle — the same "run" symbol as in any editor. */}
            <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor">
              <path d="M1 0.5v9l8-4.5z" />
            </svg>
            Run
          </button>
        )}
        {/* The Debug button MOVED to the terminal tab group. Debug is
            a SESSION that lives in the terminal — it belongs beside the
            output it produces, not next to the Save button. All that stays
            here is its trigger, registered upwards through onDaftarDebug so
            the "save first" requirement is not lost in the move. */}
        {rel && (
          <button
            type="button"
            className="aksi-btn aksi-simpan"
            onClick={simpan}
            disabled={!kotor}
            title="Save (Ctrl+S)"
          >
            {/* A floppy disk. The same icon every editor uses for "save",
                so it reads without its label having to be read first. */}
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

// ── Extension -> the command that runs it in the terminal ──
//
// Split out as a pure function so it can be tested without a DOM, a terminal or
// a PTY: what is easy to get wrong here is not the button but the path quoting.
// Windows absolute paths are full of spaces ("C:\Users\...\My Project\a.js"),
// and without quotes the shell splits them into several arguments — the command
// then fails with a message pointing at a file that never existed.
//
// It returns null for things that are not run through a terminal at all (.html
// belongs in the preview panel, .json/.md are not programs) so the button can be
// disabled with a clear reason rather than running something wrong.
const _PERINTAH_JALAN: Record<string, string> = {
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
function perintahJalankan(pathAbsolut: any) {
  const nama = String(pathAbsolut || "");
  const ext = ekstensiDari(nama);
  const bin = _PERINTAH_JALAN[ext!];
  if (!bin) return null;
  // DOUBLE quotes, not single: PowerShell is the default shell here, and single
  // quotes inside it expand nothing — but cmd.exe treats a single quote as an
  // ordinary character, which breaks the path.
  return bin + ' "' + nama.replace(/"/g, '\\"') + '"';
}

// ── Library suggestions while typing import/require ──
//
// Monaco already ships JS/TS language services, so object members and language
// built-ins suggest themselves. What it does NOT know is which libraries THIS
// project uses — and those are what gets typed most often.
//
// The list comes from the manifest via /ww/pustaka, and is only offered inside
// an import/require STRING. Without that restriction, package names show up
// mid-sentence in ordinary prose and bury the correct suggestions.
const _POLA_IMPOR = /(?:require\(|import\s*\(|from\s+|import\s+)['"]([^'"]*)$/;
const _POLA_IMPOR_PY = /^\s*(?:from|import)\s+([\w.]*)$/;
let _pustakaCache = { akar: null, data: null, janji: null };
function ambilPustaka(akar: any) {
  if (!akar) return Promise.resolve(null);
  if (_pustakaCache.akar === akar && _pustakaCache.data)
    return Promise.resolve(_pustakaCache.data);
  // One request per root rather than one per keystroke: the suggestion provider
  // is called again on every character, and without this each letter would be a
  // request.
  if (_pustakaCache.akar === akar && _pustakaCache.janji)
    return _pustakaCache.janji;
  const janji = fetch("/ww/pustaka?path=" + encodeURIComponent(akar))
    .then((r: any) => r.json())
    .then((d: any) => {
      _pustakaCache = { akar, data: d, janji: null };
      return d;
    })
    .catch(() => null);
  _pustakaCache = { akar, data: null as any, janji } as any;
  return janji;
}
// The currently open root. The suggestion provider is registered ONCE,
// globally (registering per-editor stacks providers and duplicates the
// suggestions each time the file changes), so the root is parked here.
let _akarPustaka = "";
let _saranTerpasang = false;
function pasangSaranPustaka(monaco: any) {
  if (_saranTerpasang) return;
  _saranTerpasang = true;
  const buat = (nama: any, jenis: any, rentang: any) => ({
    label: nama,
    kind: monaco.languages.CompletionItemKind.Module,
    detail: jenis,
    insertText: nama,
    range: rentang,
  });
  const sediakan = (bahasaPy: any) => ({
    triggerCharacters: bahasaPy ? [" ", "."] : ['"', "'", "/"],
    provideCompletionItems: async (model: any, position: any) => {
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
        ? (data.py || []).map((n: any) => buat(n, "requirements.txt", rentang))
        : (data.js || [])
            .map((n: any) => buat(n, "package.json", rentang))
            .concat(
              (data.builtin || []).map((n: any) =>
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

// ── Debug: running a file UNDER a debugger, in the same terminal ──
//
// What is chosen here is a COMMAND-LINE debugger, not the DAP protocol VS Code
// uses. The reason is not laziness: DAP demands a per-language adapter, an
// intermediary process, and its own variable and stack panels — while `node
// inspect` and `python -m pdb` already give the same things (breakpoints,
// stepping, inspecting values) INSIDE the PTY we already have.
//
// `node inspect`, NOT `node --inspect-brk`. The two are often confused:
// --inspect-brk only opens a port, prints a ws:// address and waits for an
// external client — in a terminal it looks like it hung for no reason. `node
// inspect` starts its REPL client as well, and that is the one people can use.
//
// null means "no debugger we know of for this file" — the button is disabled
// with a clear reason rather than running something wrong.
// Extensions that have a DAP adapter. The keys deliberately match ADAPTER in
// core/dap-sesi.cjs — if the two drift, the UI either sends a file down the DAP
// path where the server then refuses it, or lets it go through the PTY when a
// better path was available.
const _ADAPTER_DAP: Record<string, any> = {
  py: 1,
  js: 1,
  mjs: 1,
  cjs: 1,
  ts: 1,
  tsx: 1,
  jsx: 1,
};

const _PERINTAH_DEBUG: Record<string, string> = {
  js: "node inspect",
  mjs: "node inspect",
  cjs: "node inspect",
  py: "python -m pdb",
  rb: "rdbg",
  go: "dlv debug",
};
function perintahDebug(pathAbsolut: any) {
  const bin = _PERINTAH_DEBUG[ekstensiDari(String(pathAbsolut || ""))!];
  if (!bin) return null;
  return bin + ' "' + String(pathAbsolut).replace(/"/g, '\\"') + '"';
}

// The command behind each debug-bar button, PER DEBUGGER. Deliberately not
// unified: node uses whole words (next/step/out/cont), pdb uses single-letter
// abbreviations (n/s/r/c), and sending the wrong word to pdb does not produce
// an error — it quietly means something else. "s" is unknown to node inspect,
// while "next" in pdb reads as the correct "n" command only because
// kebetulan berawalan sama.
const _AKSI_DEBUG: Record<string, any> = {
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
// Which debuggers are actually installed. Fetched ONCE per session — the list
// does not change while the app runs, and without caching every file render
// satu permintaan.
let _debugTersedia: any = null;
let _debugTersediaJanji: any = null;
function ambilDebugTersedia() {
  if (_debugTersedia) return Promise.resolve(_debugTersedia);
  if (_debugTersediaJanji) return _debugTersediaJanji;
  _debugTersediaJanji = fetch("/debug/tersedia")
    .then((r: any) => r.json())
    .then((d: any) => {
      _debugTersedia = d || {};
      _debugTersediaJanji = null;
      return _debugTersedia;
    })
    .catch(() => {
      _debugTersediaJanji = null;
      // Failing to ask does NOT mean absent. Returning an empty object would
      // silently disable the Debug button for every language just because one
      // request failed — so null, and the caller treats it as "not known yet"
      // rather than "not there".
      return null;
    });
  return _debugTersediaJanji;
}

function jenisDebugger(pathAbsolut: any) {
  const bin = _PERINTAH_DEBUG[ekstensiDari(String(pathAbsolut || ""))!];
  if (!bin) return null;
  if (bin.startsWith("node")) return "node";
  if (bin.indexOf("pdb") >= 0) return "pdb";
  if (bin.startsWith("rdbg")) return "rdbg";
  if (bin.startsWith("dlv")) return "dlv";
  return null;
}

// Extension -> Monaco language. Kept separate from IKON_BAHASA because the two
// answer different questions: one is "which icon", this one is "which
// highlighter".
function bahasaMonaco(nama: any) {
  const e = ekstensiDari(nama);
  const peta: Record<string, string> = {
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
  return peta[e!] || "plaintext";
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
}: any) {
  // The "Changes" tab was REMOVED. It always read "No changes." — it was never
  // wired to real data in the first place — so it was not a disabled feature
  // but a piece of UI that never had any content.
  const tree = buildDevTree(files, root, folders);
  // Resizable width, THE SAME PATTERN as the sidebar resizer (Sidebar.tsx):
  // separate localStorage, upper and lower bounds, a "resizing" class while
  // dragging. Matched deliberately — two panels resized in different ways would
  // feel like two different applications.
  // ── Batas lebar pohon berkas ──
  //
  // ONE place. The numbers were once written three times — on load, while
  // dragging, and on release — and three copies of a bound that have to agree
  // are three places for it to drift unnoticed.
  //
  // The floor is 96px, not 160px. What decides that is not taste but the header
  // contents: the "Files" label plus spacing plus the 24px new-file button plus
  // 12+8 padding is about 90px. Below that the button starts being pushed out,
  // and what you get is not a narrow panel but a broken one.
  const LF_MIN = 96;
  const LF_MAKS = 500;
  const lfBatas = (w: any) => Math.max(LF_MIN, Math.min(LF_MAKS, w));

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
  const handleLfResizerMouseDown = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    setLfResizing(true);
    const startX = e.clientX;
    const startWidth = lfWidth;
    const onMove = (moveEvent: any) => {
      const deltaX = moveEvent.clientX - startX;
      setLfWidth(lfBatas(startWidth + deltaX));
    };
    const onUp = (upEvent: any) => {
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
  // draf === null means not creating; a string (including "") means the input
  // row is open. Distinguished that way rather than through a separate boolean,
  // so an "open but with no value" state cannot exist.
  // ── Right-click menu ──
  //
  // Held as coordinates + target, not as a boolean: the menu has to appear
  // where the pointer is, and it has to know which file it was opened on.
  const [menuKonteks, setMenuKonteks] = React.useState<any>(null); // {x,y,rel}
  React.useEffect(() => {
    if (!menuKonteks) return;
    const tutup = () => setMenuKonteks(null);
    const esc = (e: any) => e.key === "Escape" && setMenuKonteks(null);
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
  const hapusBerkas = async (rel: any, folder: any) => {
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
      setHapusGalat(String((e && (e as any).message) || e));
    } finally {
      setHapusSibuk(false);
    }
  };

  // How much a folder holds, asked of the DISK. The tree only lists files the
  // agent has touched, so counting from it would understate the damage — and
  // the number the user approves has to be the real one.
  const [jumlahIsi, setJumlahIsi] = React.useState<any>(null);
  const hitungIsi = async (rel: any) => {
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

  const [draf, setDraf] = React.useState<any>(null);
  const [galatBuat, setGalatBuat] = React.useState("");
  const [sibuk, setSibuk] = React.useState(false);
  const akarAda = !!String(root || "").trim();
  // Which kind is being created. Held next to the draft rather than in the
  // submit handler: the placeholder, the icon and the error text all have to
  // agree with it, and deciding at submit time means the row lies until then.
  const [jenisBaru, setJenisBaru] = React.useState("berkas");
  const mulaiBuat = (jenis: any) => {
    setGalatBuat("");
    setJenisBaru(jenis === "folder" ? "folder" : "berkas");
    setDraf("");
  };
  const batalBuat = () => {
    setDraf(null);
    setGalatBuat("");
  };
  const buatBerkas = async () => {
    // Normalised as VS Code does: separators unified, edge whitespace trimmed,
    // garis miring berlebih diringkas.
    const nama = String(draf || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/")
      .replace(/^\/+|\/+$/g, "");
    if (!nama) return batalBuat();
    // Refused here BEFORE hitting the server, purely so the message is fast and
    // clear — the server checks again anyway, because a check in the renderer
    // can simply be bypassed.
    if (nama.split("/").some((s: any) => s === "." || s === ".."))
      return setGalatBuat("invalid name");
    const abs = String(root).replace(/[\\/]+$/, "") + "/" + nama;
    setSibuk(true);
    setGalatBuat("");
    try {
      // A path-relative fetch: on desktop the shim at the top of this file
      // redirects it to IPC.invoke("api") itself, so one path serves both.
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
      // The input row is deliberately NOT closed: the wrong name is still there
      // to be corrected, rather than lost along with its error message.
      setGalatBuat(String((e && (e as any).message) || e));
    } finally {
      setSibuk(false);
    }
  };

  const icon = (t: any) => {
    // A language monogram: a small box in that language's signature colour.
    // Rendered as SVG (rather than a CSS-styled <span>) so it lines up with the
    // other icons, which are already SVG, and so its size does not shift when
    // the page font changes.
    if (typeof t === "string" && t.startsWith("lang:")) {
      const svg = IKON_BAHASA[t.slice(5)];
      if (svg)
        // The SVG is injected as is: it comes from a fixed, vendored file rather
        // than from any input, so no user text can reach here.
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
        // The width is user-set (lfWidth); the code panel to its right absorbs
        // the remaining width, the same as VS Code.
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
          {/* Two buttons that used to be here — "Search" and "Collapse all" —
              had no onClick at all: they were decoration from the start. Only
              one is left, and this one genuinely works. */}
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
            onMouseEnter={(e: any) => {
              if (!akarAda) return;
              e.currentTarget.style.background = "#1b2431";
              e.currentTarget.style.color = "#cdd9e5";
            }}
            onMouseLeave={(e: any) => {
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
            onMouseEnter={(e: any) => {
              if (!akarAda) return;
              e.currentTarget.style.background = "#1b2431";
              e.currentTarget.style.color = "#cdd9e5";
            }}
            onMouseLeave={(e: any) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "inherit";
            }}
          >
            {/* A document sheet with a + in the corner — the "new file" icon
                the same shape as VS Code's, drawn with the same stroke
                (viewBox 24, strokeWidth 2) as the other icons here. */}
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
      {/* The filename input row, as in VS Code: it appears INSIDE the tree,
          rather than as a dialog. Placed outside the empty/non-empty branch
          below so it still appears when the tree is empty — which is exactly
          where a first file gets created. */}
      {menuKonteks && (
        <div
          className="pohon-menu"
          style={{ left: menuKonteks.x + "px", top: menuKonteks.y + "px" }}
          onMouseDown={(e: any) => e.stopPropagation()}
          onContextMenu={(e: any) => e.preventDefault()}
        >
          <div className="pohon-menu-berkas">{menuKonteks.rel}</div>
          {!menuKonteks.konfirmasi ? (
            <button
              type="button"
              className="pohon-menu-opsi bahaya"
              onClick={() => {
                if (menuKonteks.folder) hitungIsi(menuKonteks.rel);
                setMenuKonteks((m: any) => m && { ...m, konfirmasi: true });
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
              onChange={(e: any) => {
                setDraf(e.target.value);
                setGalatBuat("");
              }}
              onKeyDown={(e: any) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  buatBerkas();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  batalBuat();
                }
              }}
              // VS Code cancels as soon as focus is lost. But if an error
              // message has not been read yet, cancelling swallows it — so this
              // row survives until Escape.
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
      {/* This used to be just `!active`, which tied the tree's contents to
          a preview. A file created by hand through the + button does not need a
          preview to exist, so it would be created and then invisible. What
          decides now is the tree's own contents. */}
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
          {tree.map((n: any, i: number) => (
            <div
              key={i}
              title={n.rel || n.name}
              onClick={(e: any) =>
                n.type !== "folder" &&
                onPilih &&
                // Alt is "open to the side", as in VS Code. The flag is passed
                // up rather than handled here: the tree has no idea groups
                // exist, and it should not learn.
                onPilih(n.rel || n.name, e.altKey)
              }
              onContextMenu={(e: any) => {
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
                // The open file is marked PERSISTENTLY, not only on hover —
                // without that, once the mouse moves nothing tells you which
                // file the editor on the right belongs to.
                background:
                  n.rel && n.rel === terpilih ? "#1b2431" : "transparent",
              }}
              onMouseEnter={(e: any) => {
                if (n.rel !== terpilih)
                  e.currentTarget.style.background = "#141c26";
              }}
              onMouseLeave={(e: any) => {
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
  // Report to index.html that App rendered without a Runtime Error.
  useEffect(() => {
    if (window.reportAppSuccess) window.reportAppSuccess();
  }, []);
  const [pickerDone, setPickerDone] = useState(false);
  const [panelMenuOpen, setPanelMenuOpen] = useState(false);
  // The Logic panel (a React Flow canvas) — an overlay covering the chat UI
  // when open.
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
  const [hitlRequest, setHitlRequest] = React.useState<any>(null);

  React.useEffect(() => {
    const checkSelectedProject = () => {
      try {
        const deleted = JSON.parse(
          localStorage.getItem("wolfspace_deleted_workspaces") || "[]",
        );
        // Path-exact only (see isPathDeleted) — no longer matches name/suffix.
        const isDel = (pStr: any) => isPathDeleted(deleted, pStr);
        if (isDel(selectedProject)) {
          const stored = JSON.parse(
            localStorage.getItem("wolfspace_projects_list") || "[]",
          );
          const valid = stored.filter((p: any) => !isDel(p.path));
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
  const handleHitlResolve = (val: any) => {
    console.log("HITL resolved with:", val);
    const req = hitlRequest;
    setHitlRequest(null);
    if (!req) return;
    if (req.kind === "continue") {
      // A step-ceiling pause (a checkpoint), not an HITL approval. "Continue"
      // resumes the run from the checkpoint with an extended step ceiling.
      if (val === "continue") {
        doSend("", null, { thread_id: req.thread_id, continue_response: true });
      } else {
        setBusy(false); // the user chose to stop; existing edits are kept
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
  const [messages, setMessages] = useState<any[]>([]);
  // Files being ACTIVELY DEVELOPED (written or edited by the agent) — the
  // source for the Logic sidebar. Different from "everything in the folder":
  // only files the agent genuinely touched this session. Reset on workspace
  // change.
  const [devFiles, setDevFiles] = useState<any[]>([]);
  // Folders created by hand. Kept apart from devFiles because that list is
  // FILES: a folder with nothing in it would leave no trace there and would
  // vanish from the tree the moment it was created.
  const [devFolders, setDevFolders] = useState<any[]>([]);
  useEffect(() => {
    setDevFiles([]);
    setDevFolders([]);
  }, [selectedProject]);
  useEffect(() => {
    const onAct = (e: any) => {
      const d = (e && e.detail) || {};
      if (!/write|edit|create|apply|save/i.test(String(d.kind || ""))) return;
      if (d.ok === false) return; // tulisan gagal — jangan catat
      let p = String(d.path || "");
      if (!p) {
        const m = String(d.arg || "").match(
          /([^\s"'`]+\.[a-zA-Z0-9]{1,8})(?=[\s"'`]|$)/,
        );
        if (m) p = m[1]!;
      }
      if (!p) return;
      p = p.replace(/\\/g, "/");
      setDevFiles((prev: any) =>
        prev.indexOf(p) >= 0 ? prev : prev.concat(p),
      );
    };
    window.addEventListener("wolfspace_agent_act", onAct);
    return () => window.removeEventListener("wolfspace_agent_act", onAct);
  }, []);
  // Web Dev Live Browser: state, auto-preview when the agent writes .html, and
  // ref iframe kini satu hook di public/app/usePreviewPanel.tsx.
  // Declared HERE rather than with the other view state further down:
  // usePreviewPanel needs it, and a const cannot be read above its own
  // declaration.
  const [view, setView] = useState("chat");
  const preview = usePreviewPanel({
    selectedProject,
    onAutoOpen: () => setPanelOpen(true),
    // The Live Browser floats above the window and does not fade out with
    // the chat page, so it has to be told when that page stops showing.
    halamanTampil: view === "chat",
  });
  const getPreviewDoc = preview.getDoc;

  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  // The todowrite checklist, at APPLICATION level — not inside one message's
  // state.
  //
  // It used to live as run.todos on each agent bubble, so it scrolled away with
  // its message as the conversation continued: a list whose whole purpose is to
  // be seen WHILE working was the first thing to leave the screen. Here it is
  // one list for the whole session, rendered directly above the input box so it
  // is always in the same place.
  const [todos, setTodos] = useState<any[]>([]);
  // The file open in the Logic view's code panel (a path RELATIVE to the project
  // root). Held here rather than inside LogicFileTree because two panels use it:
  // the tree to mark the active row, the editor to load it.
  // ── Editor groups ──
  //
  // VS Code's shape: the code area can be split, each half keeps its OWN tab
  // strip and its own active file, and both read from one file tree. Exactly
  // one group has focus, and that is the one a click in the tree opens into.
  //
  // Held as an ARRAY so "split" is a push and "close the last tab" is a filter,
  // and neither operation has to know how many groups exist. Capped at two:
  // that is what was asked for, and an untested third path is worse than a
  // missing one.
  const MAKS_GRUP = 2;
  const [logicGrup, setLogicGrup] = useState<any[]>([{ tabs: [], aktif: "" }]);
  const [grupFokus, setGrupFokus] = useState(0);
  const [logicKotor, setLogicKotor] = useState<any>({}); // rel -> unsaved?

  // The focused group's file. Derived rather than stored: the file tree marks
  // it and the debug panel reads it, and neither of those knows what a group
  // is. Two sources of truth for "the current file" is how the old single-pane
  // code would have rotted here.
  const logicBerkas =
    (logicGrup[grupFokus] && logicGrup[grupFokus].aktif) || "";

  // Every file open in ANY group. The editor needs this to decide which shared
  // Monaco models may be released — see _modelBerkas. Keyed on one group's tabs
  // it would dispose a buffer the other group is still showing.
  const logicTabsSemua = useMemo(() => {
    const set = new Set<string>();
    logicGrup.forEach((g: any) =>
      (g.tabs || []).forEach((t: string) => set.add(t)),
    );
    return Array.from(set);
  }, [logicGrup]);

  // ── The divider between the two groups ──
  //
  // A percentage, not pixels: the code area changes width whenever the file
  // tree is dragged or the window is resized, and a pixel split would drift or
  // push a pane off the edge.
  const [pecahPct, setPecahPct] = useState(50);
  const [pecahGeser, setPecahGeser] = useState(false);
  const mulaiGeserPecah = useCallback((e: any) => {
    e.preventDefault();
    e.stopPropagation();
    const baris = e.currentTarget.parentElement;
    if (!baris) return;
    const kotak = baris.getBoundingClientRect();
    if (!kotak.width) return;
    setPecahGeser(true);
    const gerak = (ev: any) => {
      const p = ((ev.clientX - kotak.left) / kotak.width) * 100;
      // Clamped so neither pane can be dragged away to nothing — a pane at 0%
      // is unreachable, and the only way back would be to close the split.
      setPecahPct(Math.max(15, Math.min(85, p)));
    };
    const lepas = () => {
      setPecahGeser(false);
      window.removeEventListener("mousemove", gerak);
      window.removeEventListener("mouseup", lepas);
    };
    window.addEventListener("mousemove", gerak);
    window.addEventListener("mouseup", lepas);
  }, []);

  // Open a file. `grup` defaults to the focused one, which is what a plain
  // click in the tree does.
  const bukaTab = useCallback(
    (rel: any, grup: number = grupFokus) => {
      if (!rel) return;
      setLogicGrup((gs: any[]) => {
        const i = gs[grup] ? grup : 0;
        return gs.map((g: any, k: number) =>
          k === i
            ? {
                tabs: g.tabs.includes(rel) ? g.tabs : g.tabs.concat(rel),
                aktif: rel,
              }
            : g,
        );
      });
      setGrupFokus((f: number) => (logicGrup[grup] ? grup : f));
    },
    [grupFokus, logicGrup],
  );

  // "Open to the side" — Alt+click in the tree, and what the Split button does
  // once there is somewhere to split into.
  const bukaDiSamping = useCallback(
    (rel: any) => {
      if (!rel) return;
      setLogicGrup((gs: any[]) => {
        if (gs.length < MAKS_GRUP) {
          setGrupFokus(gs.length);
          return gs.concat({ tabs: [rel], aktif: rel });
        }
        const lain = grupFokus === 0 ? 1 : 0;
        setGrupFokus(lain);
        return gs.map((g: any, k: number) =>
          k === lain
            ? {
                tabs: g.tabs.includes(rel) ? g.tabs : g.tabs.concat(rel),
                aktif: rel,
              }
            : g,
        );
      });
    },
    [grupFokus],
  );

  // Split the focused group. VS Code copies the active editor into the new
  // group rather than opening it empty, so the split lands on something.
  const pecahGrup = useCallback(() => {
    setLogicGrup((gs: any[]) => {
      if (gs.length >= MAKS_GRUP) return gs;
      const asal = gs[grupFokus] || gs[0];
      const rel = (asal && asal.aktif) || "";
      setGrupFokus(gs.length);
      return gs.concat({ tabs: rel ? [rel] : [], aktif: rel });
    });
  }, [grupFokus]);

  // Close a tab. `grup` undefined means EVERY group — that is the deletion
  // case: a file gone from disk must not survive as a tab anywhere, in either
  // half, or it stays as a row that loads a 404.
  const tutupTab = useCallback((rel: any, grup?: number) => {
    setLogicGrup((gs: any[]) => {
      const hasil = gs.map((g: any, k: number) => {
        if (typeof grup === "number" && k !== grup) return g;
        const i = g.tabs.indexOf(rel);
        if (i < 0) return g;
        const sisa = g.tabs.filter((x: any) => x !== rel);
        return {
          tabs: sisa,
          // Closing the ACTIVE tab hands focus to a neighbour — the one on the
          // right, falling back to the left, as every editor does. Leaving the
          // pane blank instead makes closing feel like losing your place.
          aktif: g.aktif !== rel ? g.aktif : sisa[i] || sisa[i - 1] || "",
        };
      });
      // A group with no tabs left closes and the survivor takes the width,
      // again as VS Code does. The last group always stays: dropping it would
      // leave the editor area gone with no way to bring it back.
      const bersih =
        hasil.length > 1 ? hasil.filter((g: any) => g.tabs.length > 0) : hasil;
      const akhir = bersih.length ? bersih : [hasil[0]];
      if (akhir.length !== gs.length) {
        setGrupFokus((f: number) => Math.min(f, akhir.length - 1));
      }
      return akhir;
    });
    setLogicKotor((k: any) => {
      if (!(rel in k)) return k;
      const n = { ...k };
      delete n[rel];
      return n;
    });
  }, []);

  const geserTab = useCallback((dari: any, ke: any, grup: number = 0) => {
    setLogicGrup((gs: any[]) =>
      gs.map((g: any, k: number) => {
        if (k !== grup) return g;
        const a = g.tabs.indexOf(dari);
        const b = g.tabs.indexOf(ke);
        if (a < 0 || b < 0 || a === b) return g;
        const n = g.tabs.slice();
        n.splice(b, 0, n.splice(a, 1)[0]);
        return { ...g, tabs: n };
      }),
    );
  }, []);

  const tandaiKotor = useCallback((rel: any, kotor: any) => {
    setLogicKotor((k: any) => (k[rel] === kotor ? k : { ...k, [rel]: kotor }));
  }, []);

  const [status, setStatus] = useState("Loading models…");
  // ── The sidebar has THREE states, not two ──
  //
  //   "penuh"    232px, label terlihat
  //   "ringkas"   60px, ikon saja
  //   "sembunyi"   0px, leaving only its open button
  //
  // Stored as a WORD, not a number or a boolean. Old localStorage values are
  // still booleans ("1"/"0") from the two-state version, so they are translated
  // once — without that, anyone already using this app would get a sidebar that
  // reverted to the default for no apparent reason.
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
  // The cycle order is penuh -> ringkas -> sembunyi -> penuh. One button, and
  // always the same direction so it can be learned.
  const _URUT_SB: string[] = ["penuh", "ringkas", "sembunyi"];
  const putarSidebar = useCallback(() => {
    setSbMode(
      (m: any) => _URUT_SB[(_URUT_SB.indexOf(m) + 1) % _URUT_SB.length]!,
    );
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
  // Code (the Logic view) is the THIRD panel, equal to terminal and preview. It
  // used to be a `position:absolute; inset:0` layer covering the whole area —
  // which is why it could only ever be full screen and never share space.
  const [logicPct, setLogicPct] = useState(45);
  // ── Jembatan panel Code -> terminal ──
  //
  // The terminal holds its own PTY session inside VSCodeTerminal, and the Code
  // panel is its sibling, not its parent. Commands are parked in state here and
  // passed down as a prop. A nonce goes with them so running the SAME file twice
  // still reads as two requests; without it the value would not change and the
  // terminal's effect would not fire again.
  const [perintahTerminal, setPerintahTerminal] = useState<any>(null);
  // The debugger CURRENTLY alive, or null. This decides whether the debug bar
  // appears, and which command word each of its buttons sends.
  const [debugAktif, setDebugAktif] = useState<any>(null);
  // { mulai, berkas } from the code panel, or null when the open file has no
  // debugger. Handed to the DEBUG tab so its start button can live there WITHOUT
  // bypassing the "save first" path the code panel owns.
  const [pemicuDebug, setPemicuDebug] = useState<any>(null);
  // (The "terminal closed -> debug session dies" effect is BELOW, after
  // terminalOpen is declared. Here it would throw a ReferenceError: a dependency
  // array is evaluated at render time, not when the effect runs.)
  // ── Sesi DAP ──
  //
  // Python uses this path; other languages still go through the PTY. The two
  // deliberately coexist rather than waiting for every language to have an
  // adapter: what can already offer click breakpoints and a variables panel need
  // not wait for what cannot.
  const [titikHenti, setTitikHenti] = useState<any>({}); // { rel: [line] }
  // Its ref copy. jalankanDiTerminal is wrapped in useCallback, and a callback
  // that reads state directly holds the value from the render that created it —
  // breakpoints set after that would never be sent.
  const titikHentiRef = useRef<any>({});
  useEffect(() => {
    titikHentiRef.current = titikHenti;
  }, [titikHenti]);
  const [dapId, setDapId] = useState<any>(null);
  const [dapKeadaan, setDapKeadaan] = useState<any>(null);
  const dapKeluaranRef = useRef<any[]>([]);
  useEffect(() => {
    if (!dapId) return;
    let mati = false;
    let jam: any = null;
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
        // Output is APPENDED, not replaced: the server deliberately sends only
        // what the renderer does not already hold, so the payload does not grow
        // through the session — replacing would discard everything so far.
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
  // The session closes when the Code panel closes — otherwise its Python process
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

  const mulaiDap = useCallback(
    async (akar: any, pathAbsolut: any, baris: any) => {
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
        setDapKeadaan({
          selesai: true,
          galat: String((e && (e as any).message) || e),
        });
        return false;
      }
    },
    [],
  );
  const aksiDap = useCallback(
    async (aksi: any) => {
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

  const jalankanDiTerminal = useCallback(
    (pathAbsolut: any, mode: any, akar: any) => {
      const debugMode = mode === "debug";
      // Python over DAP: that is the only path giving click breakpoints, a
      // variables panel and a definite end of session. Other languages stay on the
      // PTY until their adapters follow.
      if (debugMode && _ADAPTER_DAP[ekstensiDari(pathAbsolut)!]) {
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
      // The terminal is opened if closed — otherwise the command is sent to a
      // component that is not rendered and vanishes without a trace.
      setTerminalOpen(true);
      setDebugAktif(debugMode ? jenisDebugger(pathAbsolut) : null);
      setPerintahTerminal({ cmd, n: Date.now() });
    },
    [],
  );
  // One place to turn a debug-bar button into a command word.
  const aksiDebug = useCallback(
    (aksi: any) => {
      const peta = _AKSI_DEBUG[debugAktif!];
      if (!peta || !peta[aksi]) return;
      setPerintahTerminal({ cmd: peta[aksi], n: Date.now() });
      if (aksi === "berhenti") setDebugAktif(null);
    },
    [debugAktif],
  );

  // ── Panels can be moved, like "Move Panel" in VS Code ──
  //
  // Chat, terminal and preview used to be THREE PARALLEL COLUMNS in one flex
  // row — including the terminal, which is why it sat on the right rather than
  // below. For a terminal that is a poor choice: command output comes as long
  // lines, and a narrow column forces it to wrap constantly.
  //
  // The default now follows what people already know: preview on the RIGHT (it
  // is a page, so it needs width), terminal at the BOTTOM (it is lines of text,
  // so it needs length). Both can still be swapped.
  const [posisi, setPosisi] = useState(() => {
    const bawaan = {
      preview: "kanan",
      terminal: "bawah",
      logic: "kanan",
      chat: "kiri",
    };
    try {
      const t = JSON.parse(localStorage.getItem("wolfspace_posisi") || "null");
      // The value is validated rather than trusted: localStorage can carry
      // content from an older version or a hand edit, and an unknown position
      // would leave the panel rendered nowhere — a panel gone without a trace.
      // "kiri" arrived after the other two; old values without it stay valid,
      // and unknown values fall back to the default.
      const sah = (v: any, d: any) =>
        v === "kanan" || v === "bawah" || v === "kiri" ? v : d;
      return t
        ? {
            preview: sah(t.preview, bawaan.preview),
            terminal: sah(t.terminal, bawaan.terminal),
            // Stored by a version from before Code was a panel — the value
            // genuinely is not there, so the default applies.
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

  // ── Chat can be hidden, and that needs guarding ──
  //
  // The point: giving the preview panel the whole screen without closing chat
  // and losing its place. But hiding chat when no other panel is open leaves an
  // EMPTY screen — and the user has no hint at all that what they need is in the
  // ⋮ menu. That is a trap of our own making.
  //
  // Two layers of guarding, and both are needed:
  //   - the menu REFUSES to hide when no other panel is open (see TopBar)
  //   - the effect below RESTORES chat if the last panel is closed while chat is
  //     hidden — a path that does not go through the menu at all
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
  // Closing the terminal kills its debug session too. This is the DEFINITE path,
  // with no guessing from output: the PTY itself is killed when the panel is
  // unmounted, so nothing is left that could receive a debug command.
  //
  // Its position MUST be after the terminalOpen declaration. Placed above it —
  // next to the other debug state, where it "reads more tidily" — it throws a
  // ReferenceError that brings the whole app down: a dependency array is
  // evaluated AT RENDER TIME, not when the effect runs, so it touches a binding
  // still in the temporal dead zone.
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
  const [globalPreviewItem, setGlobalPreviewItem] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);

  const [currentChatId, setCurrentChatId] = useState<any>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      const saved = JSON.parse(localStorage.getItem("wolfspace_chats") || "[]");
      const cid = currentChatId || Date.now();
      if (!currentChatId) setCurrentChatId(cid);

      const existingIndex = saved.findIndex((c: any) => c.id === cid);
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
  const restoreChat = (chat: any) => {
    setCurrentChatId(chat.id);
    setMessages(chat.messages);
    setHistory(chat.history || []);
    setShowHistory(false);
    setView("chat");
  };
  const deleteChat = (id: any) => {
    try {
      const list = JSON.parse(localStorage.getItem("wolfspace_chats") || "[]");
      const updated = list.filter((c: any) => c.id !== id);
      localStorage.setItem("wolfspace_chats", JSON.stringify(updated));
      setSavedChats(updated);
    } catch (e) {}
  };
  const renameChat = (id: any, newTitle: any) => {
    try {
      if (!newTitle || !newTitle.trim()) return;
      const list = JSON.parse(localStorage.getItem("wolfspace_chats") || "[]");
      const updated = list.map((c: any) =>
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

  const handleSlashCommand = async (content: any) => {
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
        setTerminalOpen((v: any) => !v);
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
  const scrollRef = useRef<any>(null);
  const ctrlRef = useRef<any>(null);
  // ONE handler for both axes. There used to be two copies, identical but for
  // their setter, and both hardcoded clientX — so once a panel could move to the
  // bottom, dragging the horizontal splitter would resize using a coordinate
  // from the wrong axis. The axis now follows the panel's POSITION.
  const geserPembagi = (sumbu: any, set: any) => (e: any) => {
    e.preventDefault();
    const move = (ev: any) => {
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
    const opts: any[] = [];
    let cloud = getCloud();
    // Hydrate from server-configured providers (key stays server-side) when there is
    // no stored cloud OR the stored provider is no longer configured (e.g. stale key).
    try {
      const provs = await (await fetch("/cloud-providers")).json();
      if (Array.isArray(provs) && provs.length) {
        const pick =
          provs.find((p: any) => p.provider === "opencode") ||
          provs.find((p: any) => p.provider === "nvidia") ||
          provs.find((p: any) => p.provider === "gemini") ||
          provs.find((p: any) => p.provider === "puter") ||
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
            // MARKED AS AUTOMATIC, and that mark is the whole point.
            //
            // Written without it, this entry is byte-for-byte what an explicit
            // choice looks like: a provider and a model, no key. A fresh
            // install then reads back as already configured, and there is no
            // way — for the user or for the code — to tell the difference.
            //
            // Not writing at all was the first idea and it is wrong: the server
            // cannot resolve a provider on its own. agent/cloud.ts derives it
            // from cloud.provider or from a key, and with neither it gives up
            // (`cloud.provider || (cloud.key ? detectProvider(cloud.key) : null)`).
            // So this value is load-bearing for anyone whose keys live
            // server-side; dropping it would break their chat entirely.
            //
            // An explicit save overwrites this object WITHOUT `otomatis`, so
            // choosing a provider by hand clears the mark by construction.
            cloud = {
              provider: pick.provider,
              name: pick.name,
              model: pick.model,
              otomatis: true,
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
      : (opts.find((o: any) => o.default) || opts[0]).value;
    setModelVal((v: any) =>
      v && opts.some((o: any) => o.value === v) ? v : def,
    );
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
      checkServerHealth().then((ok: any) => {
        if (!ok) setStatus("Run 'npm start' in a terminal.");
      });
    }
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const labelOf = (v: any) =>
    (models.find((m: any) => m.value === v) || {}).label || v;

  // Separates WHAT IS SENT to the model from WHAT THE USER SEES.
  //
  // Attachments used to land in the chat bubble as raw text lines
  // ("- [Attached] a.pdf … — id: att_57a5…"). That handle does have to reach the
  // model — it is the only way the agent can read an attachment — but there is
  // no point in a human reading it, and once the handle bridge was in place it
  // only got longer and less readable.
  //
  // The `display` parameter has existed for this purpose for a long time, it was
  // simply never used by Composer. It may now be an object {text, attachments}:
  // `text` shows in the bubble, `attachments` render as cards. The old string
  // form is still supported — several other callers use it.
  const _pesanUser = (content: any, display: any) => {
    if (display && typeof display === "object")
      return {
        text: display.text || "",
        attachments: display.attachments || [],
      };
    return { text: display || content };
  };

  const doSend = async (content: any, display?: any, hitlData: any = null) => {
    if (!content && !hitlData) return;
    const trimmedContent = content.trim();
    // /ask: an EXPLICIT question mode — guaranteed TOOL-FREE (it will never edit
    // or execute a file), even on a cloud model. This is a safety escape hatch,
    // the opposite of the default where the model itself decides whether to use
    // tools.
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

    // Default: a tool-capable cloud model always goes through the agent, and the
    // MODEL itself decides (tool_choice auto) whether answering is enough or a
    // tool is needed. There is no longer a guessing regex gate that could
    // mis-route (a typo like "jalaankan" used to fall silently into tool-free
    // chat, and the model then invented output). The exceptions:
    //   - /ask                 -> force the tool-free path (guaranteed to touch
    //                             no files)
    //   - HITL/continue resume -> always the agent
    //   - local/bridge models   -> genuinely cannot use tools, so plain chat
    const useAgent =
      !!hitlData || (modelVal === "cloud" && !_localCloud && !askMode);
    if (!useAgent) {
      // Bridge / local model: plain conversational chat (text streaming, no function-calling).
      setMessages((m: any) => [
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
          (t: any) => {
            setMessages((m: any) => {
              const c = m.slice();
              c[c.length - 1] = { role: "model", text: t };
              return c;
            });
          },
          ctrl.signal,
        );
        setHistory((h: any) => [
          ...h,
          { role: "assistant", content: res.text },
        ]);
        setStatus("ready");
        console.log("[doSend] Setting busy=false (normal chat complete)");
        setBusy(false); // Reset busy state after stream completes
      } catch (e) {
        if ((e as any).name !== "AbortError")
          setStatus("error: " + (e as any).message);
        else setStatus("cancelled");
        console.log("[doSend] Setting busy=false (normal chat error)");
        setBusy(false);
      }
    } else {
      // Agentic chat (like Claude Code): the model answers OR uses tools to edit
      // WOLFSPACE's own source. The live process renders as a clean timeline.
      if (!hitlData) {
        setMessages((m: any) => [
          ...m,
          {
            role: "user",
            ..._pesanUser(content, display),
          },
          { role: "agent", agent: { events: [], busy: true } },
        ]);
      } else {
        setMessages((m: any) => {
          const c = m.slice();
          const last = { ...c[c.length - 1] };
          last.agent = { ...last.agent, busy: true };
          c[c.length - 1] = last;
          return c;
        });
      }
      const upd = (patch: any) =>
        setMessages((m: any) => {
          const c = m.slice();
          const last = { ...c[c.length - 1] };
          last.agent = { ...last.agent, ...patch };
          c[c.length - 1] = last;
          return c;
        });
      const evlist: any[] = [];
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
            // A run interrupted by a reload is resumed, not restarted. hitlData
            // still wins because it is spread AFTER this.
            thread_id: ambilThreadTerputus() || undefined,
            ...hitlData,
          },
          (j: any) => {
            if (j.thread_id) simpanThreadTerputus(j.thread_id);
            if (j.t === "backup") upd({ backup: j.dir });
            // model_wait: satu-satunya tanda hidup selama menunggu.
            // The backend used to emit this with NO handler here and no
            // catch-all branch — so it vanished silently. Every wait then
            // looked like a frozen screen: a 64-second model call, an MCP
            // startup of up to 60 seconds. Those are exactly the moments a user
            // most needs to know the agent is still alive.
            else if (j.t === "model_wait") upd({ status: j.m, busy: true });
            // force_retry: an agent retry, from SIX emit points in the backend.
            // Pushed as a timeline row of type "act" so it reuses the existing
            // renderer — no new renderer needed, and its reason shows with it.
            // Without this, every retry loop looked like a frozen screen and
            // read as though the run had stopped by itself.
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
            // todos: checklist state. Held as STATE rather than a timeline row
            // — its contents already appear through todowrite's tool output, so
            // pushing it to the timeline would only duplicate.
            //
            // It now goes into APPLICATION-level state rather than message
            // state. As run.todos it scrolled away with its bubble, so a list
            // whose whole purpose is to be seen WHILE working was the first
            // thing to leave the screen. Its panel now sits fixed above
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
              // Emitted from the MAIN chat too, not only the workflow chat: used
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
                options: (j.choices || []).map((c: any) => ({
                  value: c,
                  text: c,
                })),
              });
              upd({ thinking: "Waiting for your reply...", busy: true });
            } else if (j.t === "adone") {
              if (j.hitlPending && j.thread_id) {
                // Agent paused for HITL — keep busy=true, just ensure thread_id is updated
                adoneSent = true;
                waitingForInput = true;
                setHitlRequest((prev: any) =>
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
                // The agent paused on the step ceiling (a checkpoint) — not
                // finished, not failed. Close the timeline tidily and then offer
                // "Continue".
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
                // `run`, `phase` and `phaseNodes` were REMOVED: self_agent never
                // emitted any of the three. `run` used to hold {ok:true,
                // info:"auto-run disabled"} from a runReply that ran nothing, and
                // phaseNodes accumulated into state that was never rendered
                // komponen mana pun.
              });
              setHistory((h: any) => [
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
        if ((e as any).name !== "AbortError")
          upd({
            busy: false,
            error: true,
            events: [...evlist, { type: "err", m: (e as any).message }],
          });
      }
      console.log("[doSend] Setting busy=false (agent stream complete)");
      // The run finished (not merely waiting for an answer), so the thread must
      // not linger — otherwise the next, unrelated message would attach to it.
      if (!waitingForInput) simpanThreadTerputus(null);
      // If no "adone" event was sent, provide a default summary based on events
      if (!adoneSent) {
        if (!hadError) {
          const summary =
            evlist.length > 0
              ? `Selesai. ${evlist.length} operasi dieksekusi.`
              : "Done. No operations were performed.";
          upd({ busy: false, done: true, summary });
          setHistory((h: any) => [
            ...h,
            { role: "assistant", content: summary },
          ]);
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
  (doSendRef as any).current = doSend;
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
    // Superseded by the auto-save useEffect, to avoid duplicating it.
  };

  // ── Ukuran baris atas, dihitung sekali ──
  //
  // Panel di KANAN memakan lebar; panel di BAWAH memakan tinggi. Keduanya
  // computed separately precisely so they do not cut into each other: using one
  // number for both axes makes chat shrink twice when only one panel is open.
  // Panels are listed rather than counted one by one. The old shape named every
  // panel in four separate formulas (_xKanan, _xBawah, the bottom total, the top
  // width); once Code became the third panel, that pattern meant editing all
  // four and hoping none was missed.
  const _panelTerbuka = [
    terminalOpen && { sisi: posisi.terminal, pct: terminalPct },
    panelOpen && { sisi: posisi.preview, pct: panelPct },
    logicOpen && { sisi: posisi.logic, pct: logicPct },
  ].filter(Boolean);
  const _adaPanel = _panelTerbuka.length > 0;
  // The last safety net: if the final panel is closed while chat is hidden, the
  // screen goes completely empty with no visible way back. The menu already
  // refuses that case, but closing a panel does NOT go through the menu.
  useEffect(() => {
    if (!chatVisible && !_adaPanel) setChatVisible(true);
  }, [chatVisible, _adaPanel]);

  // ── Sides are grouped by AXIS, not by name ──
  //
  // "kiri" and "kanan" both consume WIDTH and both sit in the first row; only
  // their visual order differs. Counting them separately means a left panel does
  // not reduce the chat width — chat is then asked to be as wide as space
  // already taken by someone else, and the last panel is pushed onto the next
  // row.
  const _grup = (sisi: any) => (sisi === "bawah" ? "bawah" : "mendatar");
  const _jumlahGrup = (g: any) =>
    _panelTerbuka.reduce(
      (n: any, p: any) => n + (_grup(p.sisi) === g ? p.pct : 0),
      0,
    );
  const _adaMendatar = _panelTerbuka.some(
    (p: any) => _grup(p.sisi) === "mendatar",
  );
  // ── The per-side budget, and why it became MANDATORY at the third panel ──
  //
  // Each splitter is bounded to 12–75% INDEPENDENTLY. With two panels that could
  // still be considered safe; with three, three panels on the same side sum to
  // 225% without any one of them breaking its own bound. In a wrapping
  // container, the slightest excess pushes the last panel onto the next row —
  // the very bug the geometry harness once caught, just from a different source.
  //
  // So each side's total is scaled down proportionally to fit. Chat reserves 20%
  // for itself; with no chat, panels may take all of it.
  const _JATAH = chatVisible ? 80 : 100;
  const _skalaSisi = (sisi: any) => {
    const g = _grup(sisi);
    const jml = _jumlahGrup(g);
    if (jml <= 0) return 1;
    if (jml > _JATAH) return _JATAH / jml;
    // Raised ONLY when a bottom panel is the screen's sole occupant. If chat is
    // still there, the remaining space is genuinely its own — not a hole to fill.
    if (g === "bawah" && !chatVisible && !_adaMendatar) return 100 / jml;
    return 1;
  };
  const _jumlahBawah = _jumlahGrup("bawah") * _skalaSisi("bawah");
  const lebarAtas = Math.max(
    20,
    100 - _jumlahGrup("mendatar") * _skalaSisi("kanan"),
  );
  // ── With chat hidden, the rest must FILL, not leave a hole ──
  //
  // Panel percentages have always been computed as "a share of the screen chat
  // is not using". Once chat is gone that number means nothing: a 30% terminal
  // plus a 35% preview at the bottom leaves 35% of empty space occupied by
  // nobody, and the user sees an unexplained black band.
  //
  // So when chat is hidden:
  //   - a panel still on the right -> the top row keeps the remaining height;
  //     the widened right panel fills its width (see gayaPanel)
  //   - every panel at the bottom  -> there is no top row at all (0), and each
  //     panel's height is normalised so they sum to exactly 100%
  const _isiPenuh = !chatVisible;
  const tinggiAtas = _isiPenuh
    ? _adaMendatar
      ? Math.max(20, 100 - _jumlahBawah)
      : 0
    : Math.max(20, 100 - _jumlahBawah);
  // Gaya sebuah panel + pembaginya, mengikuti sisi tempat ia duduk. Satu tempat
  // so terminal and preview never drift apart in how they are treated.
  //
  // EACH PANEL CARRIES ITS OWN 6px SPLITTER. Without that the total exceeds
  // 100% — chat 65% + preview 35% + splitter 6px = 1006px on a 1000px screen —
  // and in a wrapping container the slightest excess pushes a panel that belongs
  // on the RIGHT down onto the next row. Measured in the geometry harness:
  // preview was asked for on the right and landed at x=0 y=420.
  // ── Visual order: one table, not numbers scattered about ──
  //
  // The first row is arranged with `order`, and what decides it is not only the
  // panel's side — CHAT's position shifts it too. With chat on the right, a
  // right panel's splitter has to move to the side facing chat; otherwise the
  // dividing line ends up on the outer edge and the panel butts against chat
  // pemisah sama sekali.
  //
  //   chat "kiri"  :  [chat] [div] [kanan…]        kiri…] [div] [chat]
  //   chat "kanan" :  [kiri…] [div] [kanan…] [div] [chat]
  //
  // The bottom number is deliberately far away (20): it is always last, and the
  // gap lets first-row values be inserted without colliding.
  const _chatKanan = posisi.chat === "kanan";
  const _ORDER_CHAT = _chatKanan ? 10 : 0;
  const _orderPanel = (sisi: any) =>
    sisi === "bawah" ? 20 : sisi === "kiri" ? -2 : 1;
  // The splitter always sits on the panel side FACING chat.
  const _orderPembagi = (sisi: any) =>
    sisi === "bawah" ? 20 : sisi === "kiri" ? -1 : _chatKanan ? 2 : 0;

  const gayaPanel = (sisi: any, pct: any) =>
    sisi === "bawah"
      ? {
          flex: "0 0 auto",
          width: "100%",
          height: "calc(" + pct * _skalaSisi("bawah") + "% - 6px)",
          order: _orderPanel(sisi),
        }
      : {
          // Tanpa chat, panel kanan MELEBAR mengisi baris. Grow-nya sebanding
          // with pct, not a flat "1 1 0%": with one panel the two are the same,
          // but with two or three right-hand panels a flat grow makes them all
          // exactly equal width — the result of dragging a splitter disappears
          // for no visible reason.
          flex: _isiPenuh
            ? pct + " 1 0%"
            : "0 0 calc(" + pct * _skalaSisi("kanan") + "% - 6px)",
          height: tinggiAtas + "%",
          order: _orderPanel(sisi),
        };
  const gayaPembagi = (sisi: any) =>
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
            onStart={(msg: any, project: any, tampil: any) => {
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
            {/* Panels are moved by FLEX WRAPPING rather than by re-ordering
                markup. .chat-split wraps (flex-wrap), so a panel that is 100%
                wide drops to the next row automatically — that is what
                "bottom" means. One that is only partly wide stays in the first
                row — that is "right". Their order is set with `order` so a
                bottom panel is always last.

                Why this way rather than wrapping chat plus the bottom panel in
                one column: the preview block is ~590 lines, and moving it would
                mean cutting and pasting that much JSX purely to change a
                POSITION. This achieves the same result without moving a single
                line. */}
            <div className="chat-split" style={{ position: "relative" }}>
              {chatVisible && (
                <div
                  className="chat-col"
                  style={{
                    // Its width is the REMAINDER, not a percentage. Giving chat a
                    // 65% basis makes the first row measure as 65% + 35% +
                    // splitter — over 100%, so the right panel is pushed down.
                    // With basis 0 and grow 1, chat takes whatever is left AFTER
                    // the right panel has its share, so there is never an excess.
                    // lebarAtas is still used as a MINIMUM width so chat cannot
                    // be squeezed away entirely.
                    flex: "1 1 0%",
                    minWidth: lebarAtas + "%",
                    height: tinggiAtas + "%",
                    order: _ORDER_CHAT,
                  }}
                >
                  <div
                    className="chat-scroll"
                    ref={scrollRef}
                    onClick={(e: any) => {
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
                        {messages.map((m: any, i: number) => (
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
                    onSend={(t: any, tampil: any) => doSend(t, tampil)}
                    onCancel={cancel}
                    busy={busy}
                    todos={todos}
                    onClearTodos={() => setTodos([])}
                    onToggleTodo={(i: any) =>
                      setTodos((d: any) =>
                        d.map((t: any, j: any) =>
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
                    {/* 38px, matching the editor's tab strip (see the header at
                        the top of the editor column). The two columns sit side
                        by side, so their headers being different heights left
                        the content starting on two different lines — this bar
                        was 46px against the tab strip's 38px.

                        The left padding stays 36px: the panel-menu button below
                        is absolutely positioned at left 10px and is 18px wide,
                        so 36px is the clearance it needs, unrelated to height.
                        Its own 28px height still centres inside 38px. */}
                    <div
                      style={{
                        height: "38px",
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
                        onClick={(e: any) => {
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
                          onClick={(e: any) => e.stopPropagation()}
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
                          {/* Visual Picker & Visual Draw moved here from the sidebar
                            — reachable directly from this panel's menu button,
                            no longer from the sidebar. */}
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
                            onMouseEnter={(e: any) =>
                              (e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.08)")
                            }
                            onMouseLeave={(e: any) =>
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
                            onMouseEnter={(e: any) =>
                              (e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.08)")
                            }
                            onMouseLeave={(e: any) =>
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
                            onMouseEnter={(e: any) =>
                              (e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.08)")
                            }
                            onMouseLeave={(e: any) =>
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
                          onChange={(e: any) =>
                            preview.setInputUrl(e.target.value)
                          }
                          onKeyDown={(e: any) => {
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
                          onMouseEnter={(e: any) =>
                            (e.currentTarget.style.background =
                              "rgba(255,255,255,0.08)")
                          }
                          onMouseLeave={(e: any) =>
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
                              // Electron: there is no HTTP server on 8090 (app://
                              // is protocol-only), so no external browser can
                              // reach /preview-file. Open the REAL file from disk
                              // over file:// — setWindowOpenHandler forwards it to
                              // shell.openExternal, which launches the OS default
                              // browser straight at that file.
                              let p = String(preview.inputUrl).replace(
                                /\\/g,
                                "/",
                              );
                              if (!p.startsWith("/")) p = "/" + p;
                              window.open("file://" + encodeURI(p), "_blank");
                            } else {
                              // Ordinary server/browser mode: /preview-file really
                              // is served from the same origin, so a new tab on
                              // that origin is enough.
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
                          onMouseEnter={(e: any) =>
                            (e.currentTarget.style.background =
                              "rgba(255,255,255,0.08)")
                          }
                          onMouseLeave={(e: any) =>
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
                          onMouseEnter={(e: any) => {
                            e.currentTarget.style.background =
                              "rgba(248,81,73,0.15)";
                            e.currentTarget.style.color = "#f85149";
                          }}
                          onMouseLeave={(e: any) => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = "#8b98a9";
                          }}
                        >
                          {/* An SVG X icon (not the text glyph '×') so its box and
                            match the Reload and Open-external buttons beside it. */}
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
                      {/* An external site that refuses to display in a frame does
                          fire onerror — the iframe simply stays white. This
                          overlay replaces that silent white screen with a reason
                          and one way out that actually works. */}
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
                            Page failed to load
                          </h3>
                          {/* The reason comes from the did-fail-load event
                              webview rather than invented. An earlier version
                              guessed "the site refuses to be framed" — and when
                              tested against wikipedia.org that guess turned out
                              to blame a site that was perfectly fine. */}
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
                            Open in system browser
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
                        /* An EMPTY container — a position marker, not content.
                           An external site is drawn by a WebContentsView in the
                           main process, FLOATING above the window. What is sent
                           to it is this container's rectangle.

                           Why not an <iframe>: this renderer cannot load an
                           external origin under app:// — the request is sent and
                           then net::ERR_ABORTED before a single header comes
                           back, including for sites PROVEN to allow framing such
                           as wikipedia.org.
                           Why not a <webview>: Electron CRASHES with
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
                  {/* The third panel, treated EXACTLY like terminal and
                      preview: a draggable splitter plus styling from gayaPanel.
                      It used to be a layer covering the entire area, and that is
                      the only reason it could only ever be full screen. */}
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
                    {/* The "Logic" title bar was REMOVED. This panel already has
                      headers below it — "Files" in the file tree and the
                      filename in the editor — so it was a third row carrying no
                      new information, only consuming height.

                      Its close button went with it; the replacement is in the
                      tab group beside TERMINAL and DEBUG
                      — the same layout as VS Code. */}
                    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
                      <LogicFileTree
                        files={devFiles}
                        folders={devFolders}
                        root={webProjectRoot(preview.url, selectedProject)}
                        active={!!preview.url}
                        terpilih={logicBerkas}
                        onPilih={(rel: any, keSamping: any) =>
                          keSamping ? bukaDiSamping(rel) : bukaTab(rel)
                        }
                        onHapus={(rel: any) => {
                          // The file is gone from disk, so both the list and its
                          // tab have to go with it. Leaving either behind means a
                          // row that opens nothing and a tab that loads a 404.
                          setDevFiles((prev: any) =>
                            prev.filter((x: any) => x !== rel),
                          );
                          tutupTab(rel);
                        }}
                        onHapusFolder={(rel: any) => {
                          // Everything under the folder is gone from disk, so it
                          // has to go from both lists and from any open tab.
                          // Leaving a child behind means a row that opens
                          // nothing and a tab that loads a 404.
                          const di = (x: any) =>
                            x === rel || x.startsWith(rel + "/");
                          setDevFiles((prev: any) => {
                            prev.filter(di).forEach((x: any) => tutupTab(x));
                            return prev.filter((x: any) => !di(x));
                          });
                          setDevFolders((prev: any) =>
                            prev.filter((x: any) => !di(x)),
                          );
                        }}
                        onBuatFolder={(rel: any) =>
                          setDevFolders((prev: any) =>
                            prev.includes(rel) ? prev : prev.concat(rel),
                          )
                        }
                        onBuat={(rel: any) => {
                          // devFiles is the list of files being worked on. A file
                          // the user just created belongs in it, exactly like one
                          // the agent wrote.
                          setDevFiles((prev: any) =>
                            prev.indexOf(rel) >= 0 ? prev : prev.concat(rel),
                          );
                          bukaTab(rel);
                        }}
                      />
                      {/* ── The editor groups ──
                          One row holding every group and the dividers between
                          them. Measured separately from the file tree so the
                          split percentage means "of the code area", not "of
                          the window". */}
                      <div
                        className="editor-grup-baris"
                        style={{ flex: 1, display: "flex", minWidth: 0 }}
                      >
                        {logicGrup.map((g: any, i: number) => (
                          <React.Fragment key={i}>
                            {i > 0 && (
                              <div
                                className={
                                  "editor-split-resizer" +
                                  (pecahGeser ? " resizing" : "")
                                }
                                onMouseDown={mulaiGeserPecah}
                                title="Drag to resize"
                              />
                            )}
                            <LogicCodePane
                              root={webProjectRoot(
                                preview.url,
                                selectedProject,
                              )}
                              rel={g.aktif}
                              tabs={g.tabs}
                              tabsSemua={logicTabsSemua}
                              fokus={i === grupFokus}
                              banyakGrup={logicGrup.length > 1}
                              bisaPecah={logicGrup.length < MAKS_GRUP}
                              onFokus={() => setGrupFokus(i)}
                              onPecah={pecahGrup}
                              gaya={
                                logicGrup.length > 1 && i === 0
                                  ? { flex: "0 0 " + pecahPct + "%" }
                                  : undefined
                              }
                              onPilihTab={(rel: any) => bukaTab(rel, i)}
                              onTutupTab={(rel: any) => tutupTab(rel, i)}
                              onGeserTab={(dari: any, ke: any) =>
                                geserTab(dari, ke, i)
                              }
                              onKotorBerubah={tandaiKotor}
                              onRun={jalankanDiTerminal}
                              onDaftarDebug={setPemicuDebug}
                              titikHenti={titikHenti}
                              setTitikHenti={setTitikHenti}
                              barisAktif={
                                dapKeadaan &&
                                dapKeadaan.berhenti &&
                                i === grupFokus
                                  ? {
                                      berkas: g.aktif,
                                      baris: dapKeadaan.berhenti.baris,
                                    }
                                  : null
                              }
                            />
                          </React.Fragment>
                        ))}
                      </div>
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
                onCloudChanged={() => setCloudVersion((v: any) => v + 1)}
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
                onSelect={(chat: any) => {
                  restoreChat(chat);
                  setView("chat");
                }}
                onDelete={(id: any) => deleteChat(id)}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* AgentRunner moved to public/app/AgentRunner.jsx (APP_MODULES). */

/* --- Badge --- */
function Badge({
  variant = "default",
  className = "",
  children,
  ...props
}: any) {
  const variants: Record<string, string> = {
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
function Card({ className = "", children, ...props }: any) {
  return (
    <div
      className={`rounded-lg border border-border bg-card text-card-foreground shadow-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
function CardHeader({ className = "", children, ...props }: any) {
  return (
    <div className={`flex flex-col space-y-1.5 p-4 ${className}`} {...props}>
      {children}
    </div>
  );
}
function CardTitle({ className = "", children, ...props }: any) {
  return (
    <h3
      className={`text-base font-semibold leading-none tracking-tight ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
}
function CardDescription({ className = "", children, ...props }: any) {
  return (
    <p className={`text-sm text-muted-foreground ${className}`} {...props}>
      {children}
    </p>
  );
}
function CardContent({ className = "", children, ...props }: any) {
  return (
    <div className={`p-4 pt-0 ${className}`} {...props}>
      {children}
    </div>
  );
}
function CardFooter({ className = "", children, ...props }: any) {
  return (
    <div className={`flex items-center p-4 pt-0 ${className}`} {...props}>
      {children}
    </div>
  );
}

/* --- Tabs --- */
function Tabs({ tabs, active, onChange, className = "" }: any) {
  return (
    <div
      className={`inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground ${className}`}
    >
      {tabs.map((t: any) => (
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
function Dropdown({ trigger, items, align = "left", className = "" }: any) {
  const [open, setOpen] = useState(false);
  const ref = useRef<any>(null);
  useEffect(() => {
    const handler = (e: any) => {
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
          {items.map((item: any, i: number) =>
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
}: any) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: any) => {
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
function Tooltip({ content, children, side = "top", className = "" }: any) {
  const [show, setShow] = useState(false);
  const sides: Record<string, string> = {
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
}: any) {
  const variants: Record<string, string> = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    destructive:
      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    outline:
      "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    link: "text-primary underline-offset-4 hover:underline",
  };
  const sizes: Record<string, string> = {
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
function Input({ className = "", ...props }: any) {
  return (
    <input
      className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

/* --- Separator --- */
function Separator({ orientation = "horizontal", className = "" }: any) {
  return (
    <div
      className={`${orientation === "horizontal" ? "h-px w-full" : "w-px h-full"} bg-border ${className}`}
    />
  );
}

/* --- ScrollArea --- */
function ScrollArea({ className = "", children, ...props }: any) {
  return (
    <div className={`overflow-auto ${className}`} {...props}>
      {children}
    </div>
  );
}

/* --- Avatar --- */
function Avatar({ src, fallback, className = "", size = "default" }: any) {
  const [err, setErr] = useState(false);
  const sizes: Record<string, string> = {
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
class ErrorBoundary extends (React as any).Component {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught a Runtime Error:", error, errorInfo);
    this.setState({ error, errorInfo });
    // Rekam error + picu Auto-Rollback lewat guard terpusat di index.html
    // (triggerAppRollback has an anti-loop: it does not reload repeatedly if even
    // the safe version errors.)
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
  window._reactRoot = ReactDOM.createRoot(document.getElementById("root")!);
}
window._reactRoot.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
