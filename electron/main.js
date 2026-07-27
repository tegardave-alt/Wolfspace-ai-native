// WOLFSPACE desktop app (Electron): launches the backend + local models, then
// opens a native window. Spawns the server as a SEPARATE process so the
// executor's process.execPath stays a real JS runtime (bun/node), not electron.
const { app, BrowserWindow, shell, ipcMain, protocol } = require("electron");
const { spawn, execSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = 8090;
const procs = [];

// Kunci nama app SEBELUM apa pun lain — menentukan folder userData (localStorage,
// dsb). Tanpa ini, Electron menebak nama dari package.json terdekat DI ATAS entry
// script; karena electron/main.js ada di subfolder tanpa package.json sendiri,
// caranya menemukan root project TAK KONSISTEN antar cara peluncuran (electron
// binary langsung vs lewat launcher npm run app) — kadang berhasil (userData
// "quantum", nama lama sebelum rebrand), kadang gagal dan jatuh ke folder DEFAULT
// generik "Electron" (profil kosong/berbeda). Akibatnya localStorage (project,
// riwayat chat, hasil migrasi) tampak "hilang" karena sebenarnya tersimpan di
// profil yang beda tiap kali app dimulai dengan cara berbeda. Nama TETAP di sini
// menjamin SATU folder userData (%APPDATA%\WOLFSPACE) apa pun cara peluncurannya.
app.setName("WOLFSPACE");

// Custom app:// scheme serves the UI + studio from disk (no HTTP needed to LOAD
// the app). Must be declared privileged BEFORE app is ready. See docs/A2UI-DESIGN.md.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    },
  },
]);

// SINGLE SOURCE: run everything from one folder. ROOT already resolves to the
// live project directory in dev (relative to this file, not a hardcoded user
// path) and to the packaged app.asar.unpacked location once built.
function unpackedRoot() {
  return app.isPackaged ? ROOT.replace("app.asar", "app.asar.unpacked") : ROOT;
}

const _MIME = {
  ".html": "text/html",
  ".htm": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".jsx": "text/javascript",
  ".ts": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
  // 3D / game assets
  ".gltf": "model/gltf+json",
  ".glb": "model/gltf-binary",
  ".bin": "application/octet-stream",
  ".obj": "text/plain",
  ".mtl": "text/plain",
  ".fbx": "application/octet-stream",
  ".dae": "model/vnd.collada+xml",
  ".hdr": "image/vnd.radiance",
  ".exr": "image/x-exr",
  // audio / video
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  // misc
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
};

// Web Dev Live Browser: layani file dari disk untuk iframe preview (paritas
// endpoint /preview-file di server.cjs). iframe adalah document load — TIDAK
// lewat fetch-shim IPC — jadi protocol app:// harus melayaninya sendiri.
// Untuk HTML, <base> di-inject agar aset relatif (css/js/img) ikut terlayani
// via /preview-file-assets/<path-absolut>.
async function servePreviewFile(reqPath, injectBase) {
  try {
    if (!reqPath) return new Response("Missing ?path=", { status: 400 });
    const resolved = path.resolve(reqPath);
    const st = await fs.promises.stat(resolved).catch(() => null);
    if (!st || st.isDirectory())
      return new Response(
        '<html><body style="background:#0c1219;color:#8fb3ff;font-family:system-ui;padding:40px;text-align:center;display:flex;flex-direction:column;justify-content:center;height:100vh;margin:0;box-sizing:border-box;">' +
          '<div style="font-size:48px;margin-bottom:16px;">⏳</div>' +
          '<h3 style="margin:0 0 8px 0;color:#dce4f0;">File Belum Tersedia</h3>' +
          '<p style="margin:0;color:#8b949e;font-size:14px;line-height:1.5;">' +
          "File ini mungkin sedang dibuat oleh agent atau path-nya tidak ditemukan.<br/><br/>" +
          '<span style="font-family:monospace;font-size:11px;background:#131922;padding:4px 8px;border-radius:4px;border:1px solid #212a36;word-break:break-all;">' +
          resolved +
          "</span></p>" +
          "</body></html>",
        {
          status: 404,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      );
    const ext = path.extname(resolved).toLowerCase();
    const ct = _MIME[ext] || "application/octet-stream";
    let data = await fs.promises.readFile(resolved);
    if (injectBase && (ext === ".html" || ext === ".htm")) {
      // Gunakan URL absolut app://WOLFSPACE/preview-file-assets/<path> agar
      // fetch() dari three.js / library lain tidak jatuh ke origin yang salah.
      // Path Windows: C:\Users\... → C:/Users/.../ (forward slash, trailing slash)
      const dir = resolved.replace(/\\/g, "/").replace(/\/[^\/]*$/, "/");
      // encodeURI mempertahankan ':' (penting untuk drive letter Windows C:)
      // tapi mengkode spasi dan karakter khusus lain dalam nama folder.
      const baseHref = "app://WOLFSPACE/preview-file-assets/" + encodeURI(dir);
      const baseTag = '<base href="' + baseHref + '">';
      let html = data.toString("utf8");
      html = /<head[^>]*>/i.test(html)
        ? html.replace(/<head[^>]*>/i, (m) => m + baseTag)
        : baseTag + html;
      data = Buffer.from(html, "utf8");
    }
    return new Response(data, {
      status: 200,
      headers: {
        "content-type": ct + (ct.startsWith("text/") ? "; charset=utf-8" : ""),
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return new Response("preview error: " + (e && e.message), { status: 500 });
  }
}

function registerAppProtocol() {
  const pubDir = path.join(unpackedRoot(), "public");
  const studioDir = path.join(unpackedRoot(), "studio", "build", "web");
  protocol.handle("app", async (request) => {
    try {
      const url = new URL(request.url); // app://WOLFSPACE/<path>
      if (
        url.pathname.startsWith("/preview-file") &&
        !url.pathname.startsWith("/preview-file-assets")
      ) {
        // /preview-file?path=... — path dari query param sudah URL-decoded oleh url.searchParams
        return servePreviewFile(url.searchParams.get("path") || "", true);
      }
      if (url.pathname.startsWith("/preview-file-assets/")) {
        // Gunakan url.pathname langsung (bukan p yang sudah di-decodeURIComponent di atas)
        // agar kita lakukan SATU decode yang benar, konsisten dengan encodeURI di base href.
        // encodeURI mempertahankan ':' jadi 'C:' tetap 'C:' di url.pathname,
        // namun spasi menjadi '%20' dan perlu di-decode di sini.
        let assetPath;
        try {
          assetPath = decodeURIComponent(
            url.pathname.slice("/preview-file-assets/".length),
          );
        } catch (_) {
          assetPath = url.pathname.slice("/preview-file-assets/".length);
        }
        // Hapus leading slash ganda (//C:/...) yang muncul dari trailing slash di base href
        assetPath = assetPath.replace(/^\/+/, "");
        return servePreviewFile(assetPath, false);
      }
      // Routing untuk file statis UI (public/ dan studio/)
      let p = decodeURIComponent(url.pathname || "/");
      let base = pubDir,
        rel = p;
      if (p === "/" || p === "") rel = "/index.html";
      else if (p === "/studio" || p === "/studio/") {
        base = studioDir;
        rel = "/index.html";
      } else if (p.startsWith("/studio/")) {
        base = studioDir;
        rel = p.slice("/studio".length);
      }
      const fp = path.normalize(path.join(base, rel));
      if (!fp.startsWith(base))
        return new Response("forbidden", { status: 403 });
      const data = await fs.promises.readFile(fp);
      const ext = path.extname(fp).toLowerCase();
      const immutable =
        /\/(vendor|canvaskit|assets)\//.test(p) ||
        [".woff2", ".ttf", ".otf", ".wasm"].includes(ext);
      return new Response(data, {
        status: 200,
        headers: {
          "content-type": _MIME[ext] || "application/octet-stream",
          "cache-control": immutable
            ? "public, max-age=31536000, immutable"
            : "no-store",
        },
      });
    } catch (e) {
      return new Response("not found: " + (e && e.message), { status: 404 });
    }
  });
}

function findRuntime() {
  for (const c of ["bun", "node"]) {
    try {
      const p = execSync(
        (process.platform === "win32" ? "where " : "which ") + c,
        { encoding: "utf8" },
      )
        .split(/\r?\n/)[0]
        .trim();
      if (p && fs.existsSync(p)) return p;
    } catch (e) {}
  }
  const bundled = path.join(
    process.env.LOCALAPPDATA || "",
    "Programs",
    "Qwen",
    "resources",
    "bun",
    "bun.exe",
  );
  if (fs.existsSync(bundled)) return bundled;
  return "node";
}

function toolchainPath() {
  const maybe = [
    path.join(
      process.env.APPDATA || "",
      "uv",
      "python",
      "cpython-3.12.10-windows-x86_64-none",
    ),
    "C:/langs/mingw64/bin",
    "C:/langs/go/bin",
    "C:/langs/jdk-21.0.11+10/bin",
    "C:/langs/php",
    "C:/langs/kotlinc/bin",
    path.join(process.env.USERPROFILE || "", ".cargo", "bin"),
  ].filter((d) => {
    try {
      return fs.existsSync(d);
    } catch (e) {
      return false;
    }
  });
  return maybe.join(path.delimiter);
}

function startBackend() {
  let cfg = {};
  try {
    cfg = JSON.parse(
      fs.readFileSync(path.join(unpackedRoot(), "config.json"), "utf8"),
    );
  } catch (e) {}
  const env = {
    ...process.env,
    PATH: toolchainPath() + path.delimiter + (process.env.PATH || ""),
  };

  // Local model servers (llama.cpp) â€” only if present
  const dir = cfg.modelDir;
  const exe = dir ? path.join(dir, "llama-server.exe") : null;
  if (exe && fs.existsSync(exe)) {
    for (const m of cfg.models || []) {
      const mp = path.join(dir, m.file || "");
      if (m.file && fs.existsSync(mp)) {
        procs.push(
          spawn(
            exe,
            [
              "-m",
              mp,
              "--host",
              "127.0.0.1",
              "--port",
              String(m.port),
              "--ctx-size",
              String((cfg.llama && cfg.llama.ctxSize) || 2048),
              "--threads",
              String((cfg.llama && cfg.llama.threads) || 2),
              "--mlock",
            ],
            { cwd: dir, stdio: "ignore", env },
          ),
        );
      }
    }
  }
  // NO web server anymore: the backend logic runs IN-PROCESS via core.js, reached
  // by the renderer through Electron IPC (see registerIpc). Zero open ports.
}

// OBSOLETE: In Electron mode, server runs in-process via core.js IPC, no HTTP port.
// This function was used for web-server startup detection and is no longer needed.
function waitReady(cb, tries = 60) {
  // No-op: IPC-based backend is ready immediately after core() initialization.
  cb();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: "#0b0d11",
    title: "WOLFSPACE",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "public", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Matikan sandbox agar preload.js bisa pakai require('path') dll.
      // Aman karena contextIsolation: true tetap aktif — renderer TIDAK
      // punya akses Node. Hanya jembatan preload yang ter-expose ke window.
      sandbox: false,
      // Default Electron/Chromium MENAHAN render/timer (rAF, dst) saat window
      // kehilangan fokus/dianggap "background" — persis yang terjadi saat dialog
      // folder native dibuka (window utama sementara tak fokus). Dugaan kuat untuk
      // gejala "state sudah benar di localStorage, tapi UI baru terlihat setelah
      // reload memaksa repaint baru". Matikan throttling itu di window utama.
      backgroundThrottling: false,
    },
  });
  win.webContents.setBackgroundThrottling(false); // lapis kedua, beberapa versi Electron butuh ini juga
  win.loadURL("app://WOLFSPACE/index.html"); // served from disk via the app:// protocol
  // open real external links in the system browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  // Teruskan console.log/warn/error dari RENDERER ke stdout proses main — tanpa ini
  // console.log di app.jsx (browser DevTools) tak pernah terlihat lewat terminal/log
  // dev, hanya lewat DevTools yang tak selalu dibuka. Beda dari dlog/[WOLFSPACE:xxx]
  // yang berasal dari proses BACKEND (Node), bukan renderer.
  const LEVELS = ["log", "warning", "error"];
  win.webContents.on("console-message", (_e, level, message) => {
    console.log("[renderer:" + (LEVELS[level] || level) + "]", message);
  });
}

// â”€â”€ IPC: renderer â†” Node core, no HTTP (see docs/A2UI-DESIGN.md step 2) â”€â”€
let _core = null;
function core() {
  if (_core) return _core;
  _core = require(path.join(unpackedRoot(), "core.js")); // single source; requiring does NOT open a port
  return _core;
}
const _streams = new Map(); // id -> { cancelled, req }

// Run a non-streaming HTTP endpoint IN-PROCESS via mock req/res against core's
// request handler â€” reuses every existing JSON handler without extracting them,
// so the renderer can drop fetch() in favour of IPC. (Streaming endpoints use
// WOLFSPACE:stream instead.)
const { PassThrough, Writable } = require("stream");
function apiCall({
  method = "GET",
  path = "/",
  body = null,
  headers = {},
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const req = new PassThrough();
    req.method = method;
    req.url = path;
    req.headers = Object.assign(
      { "content-type": "application/json" },
      headers,
    );
    const res = new Writable();
    res.statusCode = 200;
    res._h = {};
    res._chunks = [];
    res.writableEnded = false;
    res.writableFinished = false;
    res.setHeader = (k, v) => {
      res._h[String(k).toLowerCase()] = v;
    };
    res.getHeader = (k) => res._h[String(k).toLowerCase()];
    res.removeHeader = (k) => {
      delete res._h[String(k).toLowerCase()];
    };
    res.writeHead = (code, h) => {
      res.statusCode = code;
      if (h) for (const k in h) res._h[String(k).toLowerCase()] = h[k];
      return res;
    };
    res._write = (chunk, _enc, cb) => {
      res._chunks.push(Buffer.from(chunk));
      cb();
    };
    res.end = (chunk) => {
      if (chunk) res._chunks.push(Buffer.from(chunk));
      res.writableEnded = true;
      res.writableFinished = true;
      done({
        status: res.statusCode,
        headers: res._h,
        body: Buffer.concat(res._chunks).toString("utf8"),
      });
    };
    try {
      core().server.emit("request", req, res);
    } catch (e) {
      return done({
        status: 500,
        headers: {},
        body: JSON.stringify({ error: e.message }),
      });
    }
    if (body != null)
      req.end(typeof body === "string" ? body : JSON.stringify(body));
    else req.end();
  });
}

// Streaming variant of apiCall: each res.write becomes an IPC chunk (for SSE
// endpoints like model downloads). Cancel destroys res â†’ handler's res.on('close').
function apiStream(
  { method = "GET", path = "/", body = null, headers = {} } = {},
  emit,
  ctl = {},
) {
  return new Promise((resolve) => {
    const req = new PassThrough();
    req.method = method;
    req.url = path;
    req.headers = { "content-type": "application/json", ...headers };
    const res = new Writable();
    res.statusCode = 200;
    res._h = {};
    res.writableEnded = false;
    res.writableFinished = false;
    res.setHeader = (k, v) => {
      res._h[String(k).toLowerCase()] = v;
    };
    res.getHeader = (k) => res._h[String(k).toLowerCase()];
    res.writeHead = (code, h) => {
      res.statusCode = code;
      if (h) for (const k in h) res._h[String(k).toLowerCase()] = h[k];
      return res;
    };
    res._write = (chunk, _enc, cb) => {
      emit(chunk.toString("utf8"));
      cb();
    };
    res.end = (chunk) => {
      if (chunk) emit(chunk.toString("utf8"));
      res.writableEnded = true;
      res.writableFinished = true;
      resolve();
    };
    if (ctl.setCurReq) ctl.setCurReq(res); // cancel â†’ res.destroy() â†’ 'close' â†’ handler aborts
    try {
      core().server.emit("request", req, res);
    } catch (e) {
      emit("data: " + JSON.stringify({ t: "err", m: e.message }) + "\n\n");
      return resolve();
    }
    if (body != null)
      req.end(typeof body === "string" ? body : JSON.stringify(body));
    else req.end();
  });
}

function registerIpc() {
  ipcMain.handle("WOLFSPACE:invoke", async (_e, { channel, payload }) => {
    if (channel === "ping") return { ok: true, pong: Date.now() };
    // Native folder picker → path absolut ASLI (di C:, D:, Desktop, mana pun).
    // Renderer memanggilnya lewat window.WOLFSPACE.invoke('selectFolder').
    if (channel === "selectFolder") {
      const { dialog } = require("electron");
      const win =
        BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      const r = await dialog.showOpenDialog(win, {
        properties: ["openDirectory"],
        title: "Pilih folder workspace",
      });
      if (r.canceled || !r.filePaths || !r.filePaths.length)
        return { canceled: true };
      return { path: r.filePaths[0] };
    }
    // Hot-reload the backend WITHOUT restarting the app: drop every cached module
    // under the source root and re-require core. Lets edits to server.cjs/core.js
    // take effect live (front-end edits just need a renderer reload).
    if (channel === "reloadCore") {
      try {
        const root = unpackedRoot();
        for (const k of Object.keys(require.cache)) {
          if (k.startsWith(root)) delete require.cache[k];
        }
        _core = null;
        core();
        return { ok: true, at: Date.now() };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
    if (channel === "api") return apiCall(payload); // generic in-process HTTP-handler proxy
    const c = core();
    if (channel === "cloudKeys") return Object.keys(c.getCloudKeys()); // names only, no secrets
    // Terminal PTY operations
    if (channel === "terminal") {
      const { action } = payload || {};
      if (action === "open") {
        const r = c.openTerminalSession(payload.cwd, payload.shell);
        return { ok: true, id: r.id, shell: r.shell, cwd: r.cwd };
      }
      if (action === "write") {
        c.writeToTerminal(payload.id, payload.data);
        return { ok: true };
      }
      if (action === "read") {
        const session = c.terminalSessions.get(payload.id);
        if (!session) return { ok: false, error: "session not found" };
        const out = session.outputBuffer || "";
        if (payload.clear) session.outputBuffer = "";
        return { ok: true, output: out };
      }
      if (action === "resize") {
        c.resizeTerminal(payload.id, payload.cols, payload.rows);
        return { ok: true };
      }
      if (action === "close") {
        c.closeTerminalSession(payload.id);
        return { ok: true };
      }
      if (action === "list") {
        const out = Array.from(c.terminalSessions.entries()).map(([id, s]) => ({
          id,
          shell: s.shell,
          cwd: s.cwd,
          createdAt: s.createdAt,
        }));
        return out;
      }
      throw new Error("unknown terminal action: " + action);
    }
    throw new Error("unknown invoke channel: " + channel);
  });
  ipcMain.on("WOLFSPACE:stream", (e, { id, channel, payload }) => {
    const st = { cancelled: false, req: null };
    _streams.set(id, st);
    const emit = (msg) => {
      if (!st.cancelled) {
        try {
          e.sender.send("WOLFSPACE:chunk", { id, data: msg });
        } catch (_) {}
      }
    };
    const finish = () => {
      _streams.delete(id);
      try {
        e.sender.send("WOLFSPACE:chunk", { id, done: true });
      } catch (_) {}
    };
    const ctl = {
      isCancelled: () => st.cancelled,
      setCurReq: (r) => {
        st.req = r;
      },
    };
    let fn = null;
    try {
      const c = core();
      fn =
        channel === "chat"
          ? c.chatStream
          : channel === "self-agent"
            ? c.selfAgentStream
            : channel === "api"
              ? apiStream
              : null;
    } catch (err) {
      emit({ t: "err", m: "core: " + err.message });
      return finish();
    }
    if (!fn) {
      emit({ t: "err", m: "unknown stream channel: " + channel });
      return finish();
    }
    Promise.resolve(fn(payload, emit, ctl)).then(finish, (err) => {
      emit({ t: "err", m: (err && err.message) || String(err) });
      finish();
    });
  });
  ipcMain.on("WOLFSPACE:cancel", (_e, { id }) => {
    const st = _streams.get(id);
    if (st) {
      st.cancelled = true;
      if (st.req) {
        try {
          st.req.destroy();
        } catch (_) {}
      }
    }
  });
}

// Migrasi userData SEKALI: sebelum stabil di "WOLFSPACE" (fix di atas), sesi
// sebelumnya sempat tersebar ke "quantum" (nama lama) dan/atau default generik
// "Electron" (fallback saat Electron gagal deteksi nama). Salin "Local Storage"
// dari profil lama itu ke profil stabil BARU (kalau baru belum punya data),
// supaya project/riwayat/hasil migrasi browser tak hilang akibat pergantian
// profil ini. Aman: hanya menyalin kalau tujuan belum ada isinya sama sekali.
function migrateOldUserDataOnce() {
  try {
    const newDir = app.getPath("userData");
    const newLS = path.join(newDir, "Local Storage");
    if (fs.existsSync(newLS)) return; // profil baru sudah punya data — jangan timpa
    const roaming = path.dirname(newDir); // %APPDATA%
    const candidates = ["quantum", "Electron"]
      .map((n) => path.join(roaming, n))
      .filter(
        (p) => p !== newDir && fs.existsSync(path.join(p, "Local Storage")),
      );
    if (!candidates.length) return;
    // Pilih yang paling BARU diubah (LOG file) sebagai sumber paling relevan.
    const withMtime = candidates.map((p) => {
      let m = 0;
      try {
        m = fs.statSync(path.join(p, "Local Storage", "LOG")).mtimeMs;
      } catch (_) {}
      return { p, m };
    });
    withMtime.sort((a, b) => b.m - a.m);
    const src = path.join(withMtime[0].p, "Local Storage");
    fs.mkdirSync(newDir, { recursive: true });
    fs.cpSync(src, newLS, { recursive: true });
    console.log(
      "[userData] migrasi localStorage dari",
      withMtime[0].p,
      "→",
      newDir,
    );
  } catch (e) {
    console.log("[userData] migrasi gagal (non-fatal):", e.message);
  }
}

// Tangkap dan catat semua error global agar tampil di console
process.on("uncaughtException", (error) => {
  console.error("[Electron Error] Uncaught Exception:", error);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error(
    "[Electron Error] Unhandled Rejection at:",
    promise,
    "reason:",
    reason,
  );
});

app.whenReady().then(() => {
  migrateOldUserDataOnce();
  registerAppProtocol();
  registerIpc();
  startBackend();
  createWindow();
  // Hot reload: seluruh system WOLFSPACE tanpa reset manual
  try {
    const root = unpackedRoot();
    const backendDirs = ["agent", "electron", "scripts"];
    const backendFiles = [
      "server.cjs",
      "terminal.cjs",
      "core.js",
      "config.json",
      "bridge.js",
    ];
    const frontendDirs = ["public"];
    let debounceTimer, backendTimer;
    const isBackend = (fp) => {
      const rel = path.relative(root, fp).replace(/\\/g, "/");
      if (
        rel.startsWith("public/") ||
        rel.startsWith(".git/") ||
        rel.startsWith("node_modules/") ||
        rel.startsWith("studio/") ||
        rel.startsWith(".asar-pack/")
      )
        return false;
      for (const d of backendDirs) if (rel.startsWith(d + "/")) return true;
      for (const f of backendFiles) if (rel === f) return true;
      return false;
    };
    const isFrontend = (fp) => {
      const rel = path.relative(root, fp).replace(/\\/g, "/");
      return rel.startsWith("public/");
    };
    // Baseline hash tiap file backend DAN frontend → event fs.watch PALSU (Windows
    // sering melapor "berubah" untuk file yang isinya SAMA SEKALI TIDAK berubah —
    // terbukti: file vendor lama seperti babel.min.js/monaco/fonts memicu reload
    // walau mtime-nya jauh lebih tua dari waktu proses ini start). Tanpa penjaga
    // ini, reload/restart bisa terpicu acak, terasa seperti "electron reload
    // sendiri" tanpa sebab jelas.
    const crypto = require("crypto");
    const _bkHash = new Map(); // dipakai backend & frontend — nama historis, cakupan digeneralisasi
    const _hashFile = (fp) => {
      try {
        return crypto
          .createHash("md5")
          .update(fs.readFileSync(fp))
          .digest("hex");
      } catch (_) {
        return null;
      }
    };
    // ASINKRON: baca+hash file lewat fs.promises supaya SETIAP file mengembalikan
    // kontrol ke event loop. Versi sinkron lama (fs.readFileSync) menge-hash SEMUA
    // ~29MB isi public/ dalam satu tarikan napas di MAIN process, tepat setelah
    // createWindow(); karena UI dilayani via protocol app:// (juga di main process),
    // main thread yang terblokir itu menahan pengiriman index.html + seluruh aset →
    // jendela muncul tapi "Not Responding" sampai hashing selesai. readFile async +
    // yield antar file membuat main tetap melayani aset selama seeding berjalan.
    const _hashFileAsync = (fp) => {
      return new Promise((resolve) => {
        try {
          const hash = crypto.createHash("md5");
          const stream = fs.createReadStream(fp, { highWaterMark: 64 * 1024 });
          stream.on("data", (chunk) => hash.update(chunk));
          stream.on("end", () => resolve(hash.digest("hex")));
          stream.on("error", () => resolve(null));
        } catch (_) {
          resolve(null);
        }
      });
    };
    const _seedHashes = async (dir, depth, maxDepth, extFilter) => {
      if (depth > maxDepth) return;
      let ents;
      try {
        ents = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch (_) {
        return;
      }
      for (const e of ents) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const fp = path.join(dir, e.name);
        if (e.isDirectory())
          await _seedHashes(fp, depth + 1, maxDepth, extFilter);
        else if (!extFilter || extFilter.test(e.name)) {
          _bkHash.set(fp, await _hashFileAsync(fp));
          // Jeda event loop untuk memastikan IPC / UI renderer tidak hang
          await new Promise((r) => setImmediate(r));
        }
      }
    };
    // Seeding baseline hash dijalankan TERPISAH & tak menahan whenReady. Watcher
    // sudah punya grace 4 detik (_watchStart) sebelum bereaksi, jadi aman kalau
    // seeding belum tuntas saat watch mulai — event dini diabaikan.
    const _seedAll = async () => {
      for (const d of backendDirs) {
        const p = path.join(root, d);
        if (fs.existsSync(p)) await _seedHashes(p, 0, 4, /\.(c?js|json)$/);
      }
      for (const f of backendFiles) {
        const p = path.join(root, f);
        if (fs.existsSync(p)) _bkHash.set(p, await _hashFileAsync(p));
      }
      // public/ butuh kedalaman jauh lebih besar (mis. monaco bersarang ~10 level)
      // dan TANPA filter ekstensi — semua tipe file (js, css, html, font, dst) bisa
      // memicu event palsu yang sama, jadi semua perlu baseline hash.
      const pubDir = path.join(root, "public");
      if (fs.existsSync(pubDir)) await _seedHashes(pubDir, 0, 20, null);
    };
    _seedAll();
    const _watchStart = Date.now();
    // Mengaktifkan kembali Hot Reload
    if (fs.existsSync(root) && !process.env.ELECTRON_RUN_AS_NODE) {
      const handleWatch = (baseDir, eventType, filename) => {
        if (
          !filename ||
          path.basename(filename).startsWith(".") ||
          filename.includes("node_modules") ||
          filename.includes(".git") ||
          filename.endsWith("~") ||
          filename.endsWith(".swp")
        )
          return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const fullPath = path.join(baseDir, filename);
          try {
            if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory())
              return;
          } catch (_) {
            return;
          }
          // PENTING: baseline hash (_bkHash) kini diseed ASINKRON (lihat _seedAll —
          // fix startup-freeze) sehingga bisa BELUM ada saat event fs.watch tiba,
          // bahkan setelah grace 4 detik (public/ 29MB diseed paling akhir). Tanpa
          // baseline, kita TAK BISA tahu file benar-benar berubah; event PALSU Windows
          // (isi identik) lalu keliru dianggap "berubah" → reload/restart HANTU.
          // Aturan benar: kalau baseline belum ada (undefined) ATAU sama → seed & DIAM;
          // bereaksi HANYA bila baseline dikenal DAN isinya beda.
          if (isFrontend(fullPath)) {
            if (Date.now() - _watchStart < 4000) return;
            const prev = _bkHash.get(fullPath);
            const hf = _hashFile(fullPath);
            if (!hf) return;
            _bkHash.set(fullPath, hf);
            if (prev === undefined || prev === hf) return;
            try {
              const wins = BrowserWindow.getAllWindows();
              for (const w of wins) w.webContents.reload();
              console.log("[hot-reload] frontend reloaded due to:", filename);
            } catch (_) {}
          } else if (isBackend(fullPath)) {
            if (Date.now() - _watchStart < 4000) return;
            const prev = _bkHash.get(fullPath);
            const h = _hashFile(fullPath);
            if (!h) return;
            _bkHash.set(fullPath, h);
            if (prev === undefined || prev === h) return;
            clearTimeout(backendTimer);
            backendTimer = setTimeout(() => {
              console.log(
                "[hot-reload] backend changed, reloading core in-memory:",
                filename,
              );
              try {
                const rootDir = unpackedRoot();
                for (const k of Object.keys(require.cache)) {
                  if (k.startsWith(rootDir)) delete require.cache[k];
                }
                _core = null;
                core();
                console.log("[hot-reload] backend reloaded successfully!");
              } catch (err) {
                console.error(
                  "[hot-reload] error reloading core:",
                  err.message,
                );
              }
            }, 500);
          }
        }, 300);
      };

      const WATCH_DIRS = ["public", "electron", "agent", "scripts"];
      for (const d of WATCH_DIRS) {
        const dp = path.join(root, d);
        if (fs.existsSync(dp)) {
          fs.watch(dp, { recursive: true }, (eventType, filename) =>
            handleWatch(dp, eventType, filename),
          );
        }
      }
      for (const f of backendFiles) {
        const fp = path.join(root, f);
        if (fs.existsSync(fp)) {
          fs.watch(fp, (eventType, filename) =>
            handleWatch(root, eventType, filename || f),
          );
        }
      }
    }
  } catch (_) {}
});
app.on("window-all-closed", () => {
  for (const p of procs) {
    try {
      p.kill();
    } catch (e) {}
  }
  app.quit();
});
