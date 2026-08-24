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
const procs: any[] = [];
const probe = require("./probe");
(global as any).__probe = probe;

// App name + userData PER PROJECT FOLDER.
//
// BEFORE: app.setName("WOLFSPACE") alone -> EVERY clone/copy of the code on the
// same PC used %APPDATA%\WOLFSPACE (localStorage, chat UI, and so on). A GitHub
// clone that "should be blank" looked already configured because it borrowed the
// original installation's profile — the same root cause as a global API key in
// ~/.wolfspace.
//
// NOW: the name stays "WOLFSPACE" (for the taskbar/OS), but userData is isolated
// per absolute ROOT path (a short hash). A clone in another folder = an empty
// profile. Override: WOLFSPACE_USER_DATA=<path> or WOLFSPACE_SHARE_USER_DATA=1
// (the old shared drawer).
const crypto = require("crypto");
app.setName("WOLFSPACE");
(function _isolasiUserData() {
  try {
    if (process.env.WOLFSPACE_USER_DATA) {
      app.setPath("userData", path.resolve(process.env.WOLFSPACE_USER_DATA));
      return;
    }
    if (
      process.env.WOLFSPACE_SHARE_USER_DATA === "1" ||
      process.env.WOLFSPACE_SHARE_USER_DATA === "true"
    ) {
      return; // leave Electron’s own setName default -> %APPDATA%\WOLFSPACE
    }
    const rootAbs = path.resolve(ROOT).toLowerCase();
    const tag = crypto
      .createHash("sha256")
      .update(rootAbs)
      .digest("hex")
      .slice(0, 12);
    const isolated = path.join(app.getPath("appData"), "WOLFSPACE-" + tag);
    app.setPath("userData", isolated);
  } catch (e: any) {
    console.warn("[userData] isolasi gagal, pakai default:", e.message);
  }
})();

// Custom app:// scheme serves the UI + studio from disk (no HTTP needed to LOAD
// the app). Must be declared privileged BEFORE app is ready.
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

// Web Dev Live Browser: serve files from disk for the iframe preview (parity with
// the /preview-file endpoint in server.cjs). An iframe is a document load — it does
// NOT go through the IPC fetch shim — so the app:// protocol has to serve it here.
// For HTML a <base> is injected so relative assets (css/js/img) are served too, via
// /preview-file-assets/<absolute-path>.
async function servePreviewFile(reqPath: any, injectBase: any) {
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
    const ct = _MIME[ext as keyof typeof _MIME] || "application/octet-stream";
    let data = await fs.promises.readFile(resolved);
    if (injectBase && (ext === ".html" || ext === ".htm")) {
      // Use the absolute URL app://WOLFSPACE/preview-file-assets/<path> so that
      // fetch() from three.js or another library does not land on the wrong origin.
      // Windows paths: C:\Users\... -> C:/Users/.../ (forward slash, trailing slash)
      const dir = resolved.replace(/\\/g, "/").replace(/\/[^\/]*$/, "/");
      // encodeURI keeps ':' (which matters for the Windows drive letter C:) while
      // still encoding spaces and other special characters in folder names.
      const baseHref = "app://WOLFSPACE/preview-file-assets/" + encodeURI(dir);
      const baseTag = '<base href="' + baseHref + '">';
      let html = data.toString("utf8");
      html = /<head[^>]*>/i.test(html)
        ? html.replace(/<head[^>]*>/i, (m: any) => m + baseTag)
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
  } catch (e: any) {
    return new Response("preview error: " + (e && e.message), { status: 500 });
  }
}

function registerAppProtocol() {
  const pubDir = path.join(unpackedRoot(), "public");
  const studioDir = path.join(unpackedRoot(), "studio", "build", "web");
  protocol.handle("app", async (request: any) => {
    try {
      const url = new URL(request.url); // app://WOLFSPACE/<path>
      if (
        url.pathname.startsWith("/preview-file") &&
        !url.pathname.startsWith("/preview-file-assets")
      ) {
        // /preview-file?path=... — the query-param path is already URL-decoded by
        // url.searchParams.
        return servePreviewFile(url.searchParams.get("path") || "", true);
      }
      if (url.pathname.startsWith("/preview-file-assets/")) {
        // Use url.pathname directly (not the p already decodeURIComponent'd above)
        // so exactly ONE correct decode happens, consistent with the encodeURI in the
        // base href. encodeURI keeps ':', so 'C:' stays 'C:' in url.pathname, but a
        // space becomes '%20' and has to be decoded here.
        let assetPath;
        try {
          assetPath = decodeURIComponent(
            url.pathname.slice("/preview-file-assets/".length),
          );
        } catch (_: any) {
          assetPath = url.pathname.slice("/preview-file-assets/".length);
        }
        // Strip the doubled leading slash (//C:/...) the trailing slash in the base
        // href produces.
        assetPath = assetPath.replace(/^\/+/, "");
        return servePreviewFile(assetPath, false);
      }
      // Routing for the static UI files (public/ and studio/)
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
          "content-type":
            _MIME[ext as keyof typeof _MIME] || "application/octet-stream",
          "cache-control": immutable
            ? "public, max-age=31536000, immutable"
            : "no-store",
        },
      });
    } catch (e: any) {
      return new Response("not found: " + (e && e.message), { status: 404 });
    }
  });
}

// findRuntime() REMOVED — zero callers. Looking for a bun/node runtime mattered
// while the backend was spawned as a separate process; since the backend runs
// in-process through core.js it has never been used again.

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
    } catch (e: any) {
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
  } catch (e: any) {}
  const env = {
    ...process.env,
    PATH: toolchainPath() + path.delimiter + (process.env.PATH || ""),
  };

  // NO web server anymore: the backend logic runs IN-PROCESS via core.js, reached
  // by the renderer through Electron IPC (see registerIpc). Zero open ports.
}

// waitReady() REMOVED — its own comment already marked it OBSOLETE, and its body
// really was just cb() without waiting for anything. Zero callers.

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: "#0b0d11",
    title: "WOLFSPACE",
    autoHideMenuBar: true,
    // The native title bar is MERGED into the app's own top bar: the window is
    // drawn without one, and Windows paints only minimize/maximize/close as an
    // overlay inside .topbar's row. One bar where there used to be two stacked.
    //
    // height MUST track .topbar in public/styles.css (46px). The overlay is
    // positioned by the OS, not by CSS, so if the two drift apart the buttons
    // stop lining up with the row they are supposed to sit in.
    //
    // color has to be OPAQUE. .topbar is rgba(11,13,17,.72) over a
    // backdrop-filter, but the overlay strip is painted by Windows and cannot be
    // translucent, so it reuses the window's own backgroundColor.
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0b0d11",
      symbolColor: "#e6edf3",
      height: 46,
    },
    icon: path.join(__dirname, "..", "public", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Sandbox off so preload.js can use require('path') and friends. Safe because
      // contextIsolation: true stays on — the renderer has NO access to Node. Only
      // the preload bridge is exposed to window.
      sandbox: false,
      // Electron/Chromium THROTTLES render/timers (rAF and so on) by default when a
      // window loses focus or is treated as "background" — exactly what happens while
      // the native folder dialog is open (the main window is briefly unfocused). That
      // is the strong suspect behind "the state is already correct in localStorage but
      // the UI only shows it after a reload forces a repaint". Turn that throttling
      // off for the main window.
      backgroundThrottling: false,
    },
  });
  win.webContents.setBackgroundThrottling(false); // second layer, some Electron versions need this too
  // WOLFSPACE_BACKEND points the window at a backend running somewhere else — used
  // to run the backend inside WSL, the only place zone network confinement
  // (unshare -n) actually applies. Empty = the old behaviour: the UI is served from
  // disk over the app:// protocol.
  //
  // The preload reads the same env var and turns the `ipc` flag off, so the frontend
  // uses the HTTP path to this origin instead of the in-process core.
  const BACKEND = process.env.WOLFSPACE_BACKEND;
  if (BACKEND) {
    console.log("[WOLFSPACE] backend eksternal: " + BACKEND);
    win.loadURL(BACKEND);
  } else {
    win.loadURL("app://WOLFSPACE/index.html"); // served from disk via the app:// protocol
  }
  // open real external links in the system browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }: any) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  // Forward console.log/warn/error from the RENDERER to the main process stdout —
  // without this, a console.log in app.tsx (browser DevTools) is never visible in the
  // dev terminal or log, only in DevTools, which is not always open. Different from
  // dlog/[WOLFSPACE:xxx], which come from the BACKEND (Node) process, not the
  // renderer.
  // Electron >= 33 sends ONE event object ({level, message, lineNumber, sourceId,
  // frame}) rather than (event, level, message, line, sourceId). Under the old
  // signature `message` receives the wrong positional argument and what gets printed
  // is the whole global `console` object, once PER LINE of renderer log. Observed in
  // the real app: a single "[Composer] render" line dragged a 25-property console
  // dump along with it. Both shapes are supported here so this is not tied to one
  // Electron version.
  const LEVELS = ["log", "warning", "error"];
  win.webContents.on("console-message", (...a: any[]) => {
    const ev =
      a[0] && typeof a[0] === "object" && "message" in a[0] ? a[0] : null;
    const level = ev ? ev.level : a[1];
    const message = ev ? ev.message : a[2];
    console.log("[renderer:" + (LEVELS[level] || level) + "]", message);
  });
}

// â”€â”€ IPC: renderer â†” Node core, no HTTP â”€â”€
let _core: any = null;
function core() {
  if (_core) return _core;
  _core = require(path.join(unpackedRoot(), "core.js")); // single source; requiring does NOT open a port
  return _core;
}
const _streams = new Map(); // id -> { cancelled, req, channel }

// ── Hot-reload is DEFERRED while the agent is working ──
//
// WHY IT EXISTS. The WOLFSPACE agent edits its own source, and the watched
// directories (public, electron, agent, scripts) are exactly the ones it edits. So
// the agent triggered its OWN reload, mid-run, with no guard at all. The
// consequences chained:
//   - an edit under public/** that is not js -> the UI runs window.location.reload()
//     (public/index.html), and the thread_id living in React state goes with it;
//   - the next request is sent WITHOUT a thread_id, so self_agent.ts mints a new
//     thread, MemorySaver has no checkpoint for it, and the agent starts from
//     scratch — precisely the "the agent repeats its work" symptom;
//   - an edit under agent/** drops require.cache and rebuilds core in the middle of
//     the run that is using it.
//
// The reload is not CANCELLED, only deferred until the last run finishes — so its
// original purpose (the agent seeing its own source change) is still served.
let _reloadTertunda: any = null;
// An agent run older than this is treated as NO LONGER holding the reload back.
//
// WHY THERE IS A LIMIT AT ALL. This guard depends on finish() always being called.
// Miss it once — and it has been missed: a SYNCHRONOUS throw from fn() slipped past
// Promise.resolve and escaped the handler — and the stream entry is left behind
// forever, _agentSibuk() stays true, and the application stops updating itself with
// NO message at all. The only symptom is "the change does not show up", which does
// not point here in the slightest.
//
// So the dependency is time-boxed. A reload firing in minute 15 of a run is far
// less costly than a hot-reload that dies silently and is only noticed after a long
// while spent wondering why the code will not change.
const AGENT_SIBUK_MAKS_MS = 15 * 60 * 1000;
function _agentSibuk() {
  const kini = Date.now();
  for (const s of _streams.values()) {
    if (s.channel !== "self-agent") continue;
    if (kini - (s.mulai || 0) < AGENT_SIBUK_MAKS_MS) return true;
  }
  return false;
}
function _tundaSelagiSibuk(label: any, fn: any) {
  if (_agentSibuk()) {
    // Only the LAST one is kept: stacking reloads achieves nothing, all that is
    // needed is a single reload once everything has settled.
    _reloadTertunda = { label, fn };
    console.log("[hot-reload] ditunda, agent sedang berjalan:", label);
    return;
  }
  fn();
}
function _lepasReloadTertunda() {
  if (!_reloadTertunda || _agentSibuk()) return;
  const { label, fn } = _reloadTertunda;
  _reloadTertunda = null;
  console.log("[hot-reload] agent selesai, menjalankan yang ditunda:", label);
  try {
    fn();
  } catch (err: any) {
    console.error("[hot-reload] gagal menjalankan yang ditunda:", err.message);
  }
}

// Run a non-streaming HTTP endpoint IN-PROCESS via mock req/res against core's
// request handler â€” reuses every existing JSON handler without extracting them,
// so the renderer can drop fetch() in favour of IPC. (Streaming endpoints use
// WOLFSPACE:stream instead.)
const { PassThrough, Writable } = require("stream");
// Marks "the response is already closed" on the FAKE res object, in a way the
// handlers actually read.
//
// WHY `res.writableEnded = true` IS NOT ENOUGH. `writableEnded` and
// `writableFinished` are READ-ONLY ACCESSORS on the Writable prototype — they have
// no setter. Assigning to them from non-strict code does NOT throw and does NOT
// change anything; it is silently ignored. Verified directly:
//
//   const res = new Writable();
//   res.writableEnded = true;
//   res.writableEnded            // -> false
//   hasOwnProperty('writableEnded') -> false
//
// The consequence was that all 17 guards in server.cjs were DEAD on the desktop
// path, because res here is not a real ServerResponse but a bare Writable whose
// end() is overridden — so the real stream machinery never runs and the default
// value stays `false` forever. What died with it:
//
//   if (!res.writableEnded) res.write(...)   -> writes AFTER the response closed
//   if (!res.writableEnded) res.end()        -> closes twice
//   if (cancelled || res.writableEnded) ...  -> the cancel check is never true
//
// That last one is the one that shows: it is the only brake that stops the work
// after the user cancels.
function _pasangTandaSelesai(res: any) {
  res._selesai = false;
  const baca = () => res._selesai;
  Object.defineProperty(res, "writableEnded", {
    get: baca,
    configurable: true,
  });
  Object.defineProperty(res, "writableFinished", {
    get: baca,
    configurable: true,
  });
}

// ── A real browser inside the "Web Dev Live Browser" panel ──
//
// WHY NOT <iframe>. This renderer CANNOT load an external site through a subframe
// at all. Measured to the end: the subFrame request goes out and then
// net::ERR_ABORTED before a single response header comes back. Ruled out one by one
// as the cause — the iframe sandbox attribute, the production CSP <meta>, the
// site's X-Frame-Options, the Electron User-Agent, and the network (net.fetch from
// the main process returns 200, 473 KB from Bing). What settled it was a user test:
// wikipedia.org was blank too, and Wikipedia is demonstrably framable.
//
// WHY NOT <webview>. Tried, and Electron CRASHES:
//   FATAL:check.cc(361) Check failed: false. NOTREACHED
// That tag is a path Electron discourages and maintains only loosely.
//
// WebContentsView is the supported way: it is a full WebContents — exactly like a
// browser tab — mounted as a layer on top of the window. No frame restriction
// applies to it.
//
// THE PRICE PAID, named here so it does not surprise anyone: it FLOATS above the
// DOM rather than flowing inside it. So its position has to be fed in from the
// renderer (the panel bounds), and it MUST be hidden when the panel closes or a
// dialog covers it — otherwise it sits on top of the UI. That is why the renderer
// calls `sembunyi` explicitly instead of relying on CSS.
let _br: any = null; // { tampil: WebContentsView, win }
function _brWin() {
  return BrowserWindow.getAllWindows()[0] || null;
}
function _brBuat() {
  if (_br) return _br;
  const win = _brWin();
  if (!win) return null;
  const { WebContentsView } = require("electron");
  // ── sandbox: false, and this is a decision that has to be explained ──
  //
  // On this machine Chromium CANNOT spawn a sandboxed renderer process. That is not
  // a guess; it was measured layer by layer:
  //
  //   net.fetch from the main process -> 200 (the network is healthy)
  //   resolveProxy                    -> DIRECT (no proxy)
  //   navigation request              -> SENT, and even follows the redirect
  //                                      wikipedia.org -> www.wikipedia.org
  //   webRequest.onErrorOccurred      -> NEVER fires
  //   loadURL                         -> ERR_FAILED (-2)
  //
  // The network succeeds; what fails is PROCESS CREATION to hold the page.
  // Cross-site navigation demands a new renderer, and the new renderer is never
  // born. Symptoms from the same family have appeared twice on this machine: the
  // GPU process died with STATUS_DLL_NOT_FOUND until --disable-gpu-sandbox was
  // added, and <webview> crashed Electron with NOTREACHED.
  //
  // Three options were tested; only the NARROWEST one is used:
  //   --no-sandbox (the whole app)      -> works, but goes far beyond what is needed
  //   site isolation disabled           -> STILL FAILS
  //   sandbox: false on this view alone -> works, 2022 characters rendered
  //
  // What is NOT relaxed, and this is what holds the risk down: nodeIntegration stays
  // off and contextIsolation stays on, so a foreign page has no path to Node or to
  // the preload context. All that is lost is the OS confinement — and on this
  // machine that confinement was never usable anyway; the choice is not "sandboxed
  // vs not", it is "runs vs does not run at all".
  //
  // Restorable with WOLFSPACE_BROWSER_SANDBOX=1 on a healthy machine.
  const tampil = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: process.env.WOLFSPACE_BROWSER_SANDBOX === "1",
      webSecurity: true,
    },
  });
  const wc = tampil.webContents;
  // Every state change is sent back to the renderer, so the address bar and the
  // error message in the panel really do reflect what happened.
  const kirim = (t: any, d: any) => {
    try {
      win.webContents.send("WOLFSPACE:browser", { t, ...d });
    } catch (_: any) {}
  };
  wc.on("did-start-loading", () => kirim("muat", {}));
  wc.on("did-stop-loading", () =>
    kirim("selesai", { url: wc.getURL(), judul: wc.getTitle() }),
  );
  wc.on(
    "did-fail-load",
    (_e: any, kode: any, desc: any, url: any, utama: any) => {
      if (!utama) return;
      kirim("gagal", { kode, desc, url });
    },
  );
  wc.on("did-navigate", (_e: any, url: any) => kirim("pindah", { url }));
  wc.on("did-navigate-in-page", (_e: any, url: any) =>
    kirim("pindah", { url }),
  );
  // A link that opens a new window opens IN THIS PANEL rather than in the OS
  // browser — that is what anyone expects from a browser inside an application.
  wc.setWindowOpenHandler(({ url }: any) => {
    wc.loadURL(url);
    return { action: "deny" };
  });
  _br = { tampil, win };
  return _br;
}
// Electron is TWO engines: the renderer (web) and main (node). When the panel is
// blank the first question is always "which one failed" — and with no record from
// the main side, all that is visible is white, which could mean anything: the view
// was never created, was created but not mounted, was mounted but with zero bounds,
// was mounted correctly but the page did not load, or loaded but is covered by
// another layer.
//
// The first version of this function SWALLOWED the answer: addChildView and
// removeChildView were wrapped in `try { } catch (_) {}`. If mounting the layer was
// itself what failed, the error vanished without a trace and the symptom stayed
// "blank".
//
// console.log in the main process is forwarded to WOLFSPACE-debug.log, so this
// record can be read after the fact — no guessing from the screen.
function _brLog(pesan: any, data?: any) {
  try {
    console.log(
      "[browser] " + pesan + (data ? " " + JSON.stringify(data) : ""),
    );
  } catch (_: any) {}
}
function _brKeadaan() {
  if (!_br) return { ada: false };
  const wc = _br.tampil.webContents;
  let anak = -1;
  try {
    anak = _br.win.contentView.children.length;
  } catch (_: any) {}
  let b = null;
  try {
    b = _br.tampil.getBounds();
  } catch (_: any) {}
  return {
    ada: true,
    url: wc.getURL(),
    judul: wc.getTitle(),
    memuat: wc.isLoading(),
    rusak: wc.isCrashed(),
    bounds: b,
    anakDiJendela: anak,
  };
}
function browserAksi(p: any) {
  const aksi = (p && p.aksi) || "";
  if (aksi === "diagnosa") {
    const k = _brKeadaan();
    _brLog("diagnosa", k);
    return { ok: true, ...k };
  }
  if (aksi === "sembunyi") {
    if (_br) {
      try {
        _br.win.contentView.removeChildView(_br.tampil);
      } catch (e: any) {
        _brLog("removeChildView GAGAL", { pesan: e.message });
      }
    }
    return { ok: true };
  }
  if (aksi === "buang") {
    if (_br) {
      try {
        _br.win.contentView.removeChildView(_br.tampil);
        _br.tampil.webContents.close();
      } catch (e: any) {
        _brLog("buang GAGAL", { pesan: e.message });
      }
      _br = null;
    }
    return { ok: true };
  }
  let b;
  try {
    b = _brBuat();
  } catch (e: any) {
    _brLog("_brBuat MELEMPAR", { pesan: e.message });
    return { ok: false, error: "buat view: " + e.message };
  }
  if (!b) {
    _brLog("_brBuat mengembalikan null — tak ada jendela");
    return { ok: false, error: "tak ada jendela" };
  }

  // ZERO bounds is one of the easiest causes of "blank" to miss: the view exists,
  // is mounted, and its page loaded — it is just 0x0. That is why the values that
  // arrive are logged rather than merely used.
  if (p && p.bounds) {
    const r = p.bounds;
    const kotak = {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.max(0, Math.round(r.width)),
      height: Math.max(0, Math.round(r.height)),
    };
    if (!kotak.width || !kotak.height)
      _brLog("bounds NOL dari renderer", kotak);
    try {
      b.tampil.setBounds(kotak);
    } catch (e: any) {
      _brLog("setBounds GAGAL", { kotak, pesan: e.message });
      return { ok: false, error: "setBounds: " + e.message };
    }
  }

  if (aksi === "tampil" || aksi === "buka") {
    try {
      // Mounted only if it is NOT already mounted. Calling this on every heartbeat
      // moves the view to the top of the order over and over — wasted work that can
      // also disturb how the other layers are stacked.
      const anak = b.win.contentView.children || [];
      if (!anak.includes(b.tampil)) {
        b.win.contentView.addChildView(b.tampil);
        _brLog("view dipasang", {
          anakSekarang: b.win.contentView.children.length,
        });
      }
    } catch (e: any) {
      // This used to be swallowed by `catch (_) {}` — if mounting the layer was the
      // thing that failed, the symptom was "blank" with not one trace behind it.
      _brLog("addChildView GAGAL", { pesan: e.message });
      return { ok: false, error: "addChildView: " + e.message };
    }
  }

  try {
    if (aksi === "buka" && p.url) {
      _brLog("loadURL", { url: String(p.url).slice(0, 80) });
      b.tampil.webContents.loadURL(p.url).catch((e: any) => {
        _brLog("loadURL DITOLAK", { pesan: e.message });
      });
    }
    if (aksi === "muat-ulang") b.tampil.webContents.reload();
    if (aksi === "mundur" && b.tampil.webContents.navigationHistory.canGoBack())
      b.tampil.webContents.navigationHistory.goBack();
  } catch (e: any) {
    _brLog("navigasi GAGAL", { aksi, pesan: e.message });
    return { ok: false, error: "navigasi: " + e.message };
  }

  if (aksi === "buka") _brLog("sesudah buka", _brKeadaan());
  return { ok: true, ..._brKeadaan() };
}

function apiCall({
  method = "GET",
  path = "/",
  body = null,
  headers = {},
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: any) => {
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
    _pasangTandaSelesai(res);
    res.setHeader = (k: any, v: any) => {
      res._h[String(k).toLowerCase()] = v;
    };
    res.getHeader = (k: any) => res._h[String(k).toLowerCase()];
    res.removeHeader = (k: any) => {
      delete res._h[String(k).toLowerCase()];
    };
    res.writeHead = (code: any, h: any) => {
      res.statusCode = code;
      if (h) for (const k in h) res._h[String(k).toLowerCase()] = h[k];
      return res;
    };
    res._write = (chunk: any, _enc: any, cb: any) => {
      res._chunks.push(Buffer.from(chunk));
      cb();
    };
    res.end = (chunk: any) => {
      if (res._selesai) return; // a handler calling end() twice must not answer twice
      if (chunk) res._chunks.push(Buffer.from(chunk));
      res._selesai = true;
      done({
        status: res.statusCode,
        headers: res._h,
        body: Buffer.concat(res._chunks).toString("utf8"),
      });
    };
    try {
      probe.timeSync(req.method + " " + req.url, () =>
        core().server.emit("request", req, res),
      );
    } catch (e: any) {
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
  emit: any,
  ctl: any = {},
) {
  return new Promise<void>((resolve) => {
    const req = new PassThrough();
    req.method = method;
    req.url = path;
    req.headers = { "content-type": "application/json", ...headers };
    const res = new Writable();
    res.statusCode = 200;
    res._h = {};
    _pasangTandaSelesai(res);
    res.setHeader = (k: any, v: any) => {
      res._h[String(k).toLowerCase()] = v;
    };
    res.getHeader = (k: any) => res._h[String(k).toLowerCase()];
    res.writeHead = (code: any, h: any) => {
      res.statusCode = code;
      if (h) for (const k in h) res._h[String(k).toLowerCase()] = h[k];
      return res;
    };
    res._write = (chunk: any, _enc: any, cb: any) => {
      emit(chunk.toString("utf8"));
      cb();
    };
    res.end = (chunk: any) => {
      if (res._selesai) return;
      if (chunk) emit(chunk.toString("utf8"));
      res._selesai = true;
      resolve();
    };
    if (ctl.setCurReq) ctl.setCurReq(res); // cancel â†’ res.destroy() â†’ 'close' â†’ handler aborts
    try {
      probe.timeSync("STREAM " + req.method + " " + req.url, () =>
        core().server.emit("request", req, res),
      );
    } catch (e: any) {
      emit("data: " + JSON.stringify({ t: "err", m: e.message }) + "\n\n");
      return resolve();
    }
    if (body != null)
      req.end(typeof body === "string" ? body : JSON.stringify(body));
    else req.end();
  });
}

function registerIpc() {
  ipcMain.on("WOLFSPACE:probe", (_e: any, d: any) => {
    if (d && d.t === "renderer-stop")
      probe.say("RENDERER-STOP ~" + Math.round(d.overshoot) + "ms");
  });
  ipcMain.handle(
    "WOLFSPACE:invoke",
    async (_e: any, { channel, payload }: any) => {
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
        const t0 = performance.now();
        try {
          const root = unpackedRoot();
          for (const k of Object.keys(require.cache)) {
            if (k.startsWith(root)) delete require.cache[k];
          }
          _core = null;
          core();
          const ms = performance.now() - t0;
          if (ms >= 100) probe.say("reloadCore " + ms.toFixed(0) + "ms");
          return { ok: true, at: Date.now() };
        } catch (e: any) {
          return { ok: false, error: e.message };
        }
      }
      if (channel === "browser") return browserAksi(payload);
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
          const out = Array.from(
            c.terminalSessions.entries() as Iterable<[any, any]>,
          ).map(([id, s]) => ({
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
    },
  );
  ipcMain.on("WOLFSPACE:stream", (e: any, { id, channel, payload }: any) => {
    // The channel is kept so the hot-reload guard knows an agent run is alive.
    const st = { cancelled: false, req: null, channel, mulai: Date.now() };
    _streams.set(id, st);
    const emit = (msg: any) => {
      if (st.cancelled) return;
      const t0 = performance.now();
      try {
        e.sender.send("WOLFSPACE:chunk", { id, data: msg });
      } catch (_: any) {}
      const ms = performance.now() - t0;
      if (ms >= 10)
        probe.say(
          "SEND chunk " +
            ms.toFixed(1) +
            "ms len=" +
            String(msg && (msg.length || 0)),
        );
    };
    const finish = () => {
      _streams.delete(id);
      try {
        e.sender.send("WOLFSPACE:chunk", { id, done: true });
      } catch (_: any) {}
      // Removed from _streams FIRST, then released — so _agentSibuk() sees the state
      // after this run has ended, not the one before.
      _lepasReloadTertunda();
    };
    const ctl = {
      isCancelled: () => st.cancelled,
      setCurReq: (r: any) => {
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
    } catch (err: any) {
      emit({ t: "err", m: "core: " + err.message });
      return finish();
    }
    if (!fn) {
      emit({ t: "err", m: "unknown stream channel: " + channel });
      return finish();
    }
    // fn IS CALLED INSIDE the try: `Promise.resolve(fn(...))` alone is not enough,
    // because a SYNCHRONOUS throw happens before Promise.resolve gets to wrap it —
    // the throw escapes this handler and finish() never runs. The stream is then
    // left in _streams forever, and since the hot-reload guard exists the
    // consequence compounds: _agentSibuk() stays true, so EVERY reload is deferred
    // indefinitely and the application stops updating itself without a single error
    // message.
    try {
      const t0 = performance.now();
      Promise.resolve(fn(payload, emit, ctl)).then(finish, (err) => {
        emit({ t: "err", m: (err && err.message) || String(err) });
        finish();
      });
      const ms = performance.now() - t0;
      if (ms >= 100)
        probe.say("STREAM " + channel + " init " + ms.toFixed(0) + "ms");
    } catch (err: any) {
      emit({ t: "err", m: (err && err.message) || String(err) });
      finish();
    }
  });
  ipcMain.on("WOLFSPACE:cancel", (_e: any, { id }: any) => {
    const st = _streams.get(id);
    if (st) {
      st.cancelled = true;
      if (st.req) {
        try {
          st.req.destroy();
        } catch (_: any) {}
      }
    }
  });
}

// A ONE-TIME userData migration: before it settled on "WOLFSPACE" (the fix above),
// earlier sessions scattered into "quantum" (the old name) and/or the generic
// "Electron" default (the fallback when Electron fails to detect a name). Copy
// "Local Storage" from those old profiles into the NEW stable profile (if the new
// one has no data yet), so projects/history/browser migration results are not lost
// to this profile change. Safe: it only copies when the destination is entirely
// empty.
function migrateOldUserDataOnce() {
  try {
    const newDir = app.getPath("userData");
    const newLS = path.join(newDir, "Local Storage");
    if (fs.existsSync(newLS)) return; // the new profile already has data — do not overwrite
    const roaming = path.dirname(newDir); // %APPDATA%
    // "WOLFSPACE" (the old shared drawer) is imported ONLY when the project carries
    // an explicit marker — so a GitHub clone does not swallow the original
    // installation's UI history.
    const claimLegacyUi = path.join(
      unpackedRoot(),
      ".wolfspace",
      "claim-legacy-ui",
    );
    const names = ["quantum", "Electron"];
    if (fs.existsSync(claimLegacyUi)) names.unshift("WOLFSPACE");
    const candidates = names
      .map((n) => path.join(roaming, n))
      .filter(
        (p) => p !== newDir && fs.existsSync(path.join(p, "Local Storage")),
      );
    if (!candidates.length) return;
    // Pick the most RECENTLY modified (the LOG file) as the most relevant source.
    const withMtime = candidates.map((p) => {
      let m = 0;
      try {
        m = fs.statSync(path.join(p, "Local Storage", "LOG")).mtimeMs;
      } catch (_: any) {}
      return { p, m };
    });
    withMtime.sort((a, b) => b.m - a.m);
    const src = path.join(withMtime[0]!.p, "Local Storage");
    fs.mkdirSync(newDir, { recursive: true });
    fs.cpSync(src, newLS, { recursive: true });
    console.log(
      "[userData] migrasi localStorage dari",
      withMtime[0]!.p,
      "→",
      newDir,
    );
  } catch (e: any) {
    console.log("[userData] migrasi gagal (non-fatal):", e.message);
  }
}

// Catch and log every global error so it shows up in the console
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

// === MEMORY OPTIMIZATIONS ===
// Cap the Chromium renderer's RAM so it does not balloon past 5 GB.
// These flags MUST be set BEFORE app.whenReady().
// - js-flags: cap the Node.js V8 heap in the main process (backend/agent)
// - max-old-space-size: the main process V8 heap limit (MB)
// - disable-gpu-memory-buffer-compositor-resources: free the GPU buffer
// - memory-pressure-thresholds: push Chromium to GC more aggressively
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=512");
app.commandLine.appendSwitch("disable-http-cache");
app.commandLine.appendSwitch("enable-precise-memory-info");
// ── ONE disable-features list, and that is MANDATORY ──
//
// appendSwitch("disable-features", ...) OVERWRITES the previous value, it does not
// merge with it. Calling it twice silently discards the first, and the only symptom
// is "the feature that was turned off is back on" with no error at all. So anything
// that needs turning off has to go in this list.
//
//   CalculateNativeWinOcclusion — forces Chromium to GC under memory pressure.
//
//   AudioServiceSandbox — WITHOUT THIS THERE IS NO SOUND in the browser panel.
//     The symptom: YouTube would only play while muted. What was measured:
//       AudioContext.state    -> "running"   (so the autoplay policy is NOT the
//                                             cause; tested with executeJavaScript
//                                             userGesture=true)
//       isCurrentlyAudible()  -> false       (no audio reaching the output)
//       audioMuted            -> false       (not muted either)
//     After AudioServiceSandbox was disabled: isCurrentlyAudible() -> true.
//
//     The cause is the same one that has now appeared twice on this machine: a
//     sandboxed Chromium UTILITY process cannot be born. The GPU process died with
//     STATUS_DLL_NOT_FOUND (see --disable-gpu-sandbox below), the cross-site
//     renderer failed with ERR_FAILED (see the browser view sandbox in _brBuat).
//     The audio service is the third sandboxed utility process.
//
//     The NARROWEST option was chosen: AudioServiceOutOfProcess also cures it, but
//     it moves audio INTO the browser process — one audio crash would then take the
//     application down with it. Disabling only its sandbox keeps the process
//     separation.
app.commandLine.appendSwitch(
  "disable-features",
  ["CalculateNativeWinOcclusion", "AudioServiceSandbox"].join(","),
);
// Turn off the compositing tile memory cap to reduce VRAM pressure
app.commandLine.appendSwitch("disable-gpu-memory-buffer-compositor-resources");

// === GPU SANDBOX ===
// Without this the application DOES NOT RUN AT ALL on some Windows machines.
//
// The symptom: the child GPU process dies repeatedly with exit_code=-1073741515
// (STATUS_DLL_NOT_FOUND), Chromium retries eight or nine times, then gives up with
// a FATAL "GPU process isn't usable. Goodbye." and KILLS the whole application. The
// window never appears, and the only trace is a run of gpu_process_host ERROR lines
// that look like ordinary warnings.
//
// The cause is not a broken Electron: all its DLLs are present and its main process
// is healthy. STATUS_DLL_NOT_FOUND in a SANDBOXED child process has a known cause —
// the sandbox refuses to load a DLL injected by a third party (antivirus, an
// overlay, a driver utility) into that process.
//
// Measured, all four, on an affected machine:
//   as-is                  FATAL within 1 second, 9 GPU crashes
//   --disable-gpu          also FATAL, 6 crashes  <- does NOT help
//   --in-process-gpu       alive, but the whole GPU is pulled into the main process
//   --disable-gpu-sandbox  alive, 0 crashes, acceleration & render isolation INTACT
//
// What is traded: the sandbox layer on the GPU process alone. The render process
// stays fully sandboxed, and that is the layer actually facing web content.
// WOLFSPACE_GPU_SANDBOX=1 restores it for anyone whose machine is unaffected.
if (
  process.env.WOLFSPACE_GPU_SANDBOX !== "1" &&
  process.env.WOLFSPACE_GPU_SANDBOX !== "true"
) {
  app.commandLine.appendSwitch("disable-gpu-sandbox");
}

// Force Node.js (main process V8) to GC periodically
const _gcInterval = setInterval(() => {
  if (global.gc) {
    global.gc();
  }
}, 60000); // every 1 minute
_gcInterval.unref(); // do not hold the process open just for this interval

app.whenReady().then(() => {
  probe.startStopProbe();
  probe.startLoopProbe();
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
    let debounceTimer: any, backendTimer: any;
    const isBackend = (fp: any) => {
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
    const isFrontend = (fp: any) => {
      const rel = path.relative(root, fp).replace(/\\/g, "/");
      return rel.startsWith("public/");
    };
    // A baseline hash of every backend AND frontend file -> FALSE fs.watch events
    // (Windows often reports "changed" for a file whose contents did NOT change at
    // all — demonstrated: old vendor files like babel.min.js/monaco/fonts triggered a
    // reload even though their mtime was far older than this process's start). Without
    // this guard, a reload/restart can fire at random and feels like "electron
    // reloading itself" for no clear reason.
    const crypto = require("crypto");
    const _bkHash = new Map(); // used by backend & frontend — historic name, scope generalised
    const _hashFile = (fp: any) => {
      try {
        return crypto
          .createHash("md5")
          .update(fs.readFileSync(fp))
          .digest("hex");
      } catch (_: any) {
        return null;
      }
    };
    // ASYNCHRONOUS: read and hash files through fs.promises so EVERY file returns
    // control to the event loop. The old synchronous version (fs.readFileSync) hashed
    // ALL ~29 MB of public/ in one breath on the MAIN process, right after
    // createWindow(); because the UI is served over the app:// protocol (also on the
    // main process), that blocked main thread held back delivery of index.html and
    // every asset -> the window appeared but was "Not Responding" until hashing
    // finished. Async readFile plus a yield between files keeps main serving assets
    // while the seeding runs.
    const _hashFileAsync = (fp: any) => {
      return new Promise((resolve) => {
        try {
          const hash = crypto.createHash("md5");
          const stream = fs.createReadStream(fp, { highWaterMark: 64 * 1024 });
          stream.on("data", (chunk: any) => hash.update(chunk));
          stream.on("end", () => resolve(hash.digest("hex")));
          stream.on("error", () => resolve(null));
        } catch (_: any) {
          resolve(null);
        }
      });
    };
    const _seedHashes = async (
      dir: any,
      depth: any,
      maxDepth: any,
      extFilter: any,
    ) => {
      if (depth > maxDepth) return;
      let ents;
      try {
        ents = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch (_: any) {
        return;
      }
      for (const e of ents) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const fp = path.join(dir, e.name);
        if (e.isDirectory())
          await _seedHashes(fp, depth + 1, maxDepth, extFilter);
        else if (!extFilter || extFilter.test(e.name)) {
          _bkHash.set(fp, await _hashFileAsync(fp));
          // Yield the event loop so IPC / the renderer UI does not hang
          await new Promise((r) => setImmediate(r));
        }
      }
    };
    // Baseline-hash seeding runs SEPARATELY and does not hold up whenReady. The
    // watcher already has a 4-second grace period (_watchStart) before it reacts, so
    // it is safe if seeding has not finished when watching starts — early events are
    // ignored.
    const _seedAll = async () => {
      for (const d of backendDirs) {
        const p = path.join(root, d);
        if (fs.existsSync(p)) await _seedHashes(p, 0, 4, /\.(c?js|json)$/);
      }
      for (const f of backendFiles) {
        const p = path.join(root, f);
        if (fs.existsSync(p)) _bkHash.set(p, await _hashFileAsync(p));
      }
      // public/ needs far greater depth (monaco nests ~10 levels, for instance) and
      // NO extension filter — every file type (js, css, html, font, and so on) can
      // trigger the same false event, so all of them need a baseline hash.
      const pubDir = path.join(root, "public");
      if (fs.existsSync(pubDir)) await _seedHashes(pubDir, 0, 20, null);
    };
    _seedAll();
    const _watchStart = Date.now();
    // Mengaktifkan kembali Hot Reload
    if (fs.existsSync(root) && !process.env.ELECTRON_RUN_AS_NODE) {
      const handleWatch = (baseDir: any, eventType: any, filename: any) => {
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
          } catch (_: any) {
            return;
          }
          // IMPORTANT: the baseline hash (_bkHash) is now seeded ASYNCHRONOUSLY (see
          // _seedAll — the startup-freeze fix), so it may NOT exist yet when an
          // fs.watch event arrives, even after the 4-second grace (public/ 29 MB is
          // seeded last). Without a baseline we CANNOT tell whether the file really
          // changed; a FALSE Windows event (identical contents) would then be
          // mistaken for "changed" -> a PHANTOM reload/restart. The correct rule: if
          // the baseline is missing (undefined) OR equal -> seed and STAY QUIET;
          // react ONLY when the baseline is known AND the contents differ.
          if (isFrontend(fullPath)) {
            if (Date.now() - _watchStart < 4000) return;
            const prev = _bkHash.get(fullPath);
            const hf = _hashFile(fullPath);
            if (!hf) return;
            _bkHash.set(fullPath, hf);
            if (prev === undefined || prev === hf) return;
            _tundaSelagiSibuk("hmr " + filename, () => {
              try {
                const wins = BrowserWindow.getAllWindows();
                for (const w of wins)
                  w.webContents.send("WOLFSPACE:hmr", filename);
                console.log("[hmr] frontend update sent to UI for:", filename);
              } catch (_: any) {}
            });
          } else if (isBackend(fullPath)) {
            if (Date.now() - _watchStart < 4000) return;
            const prev = _bkHash.get(fullPath);
            const h = _hashFile(fullPath);
            if (!h) return;
            _bkHash.set(fullPath, h);
            if (prev === undefined || prev === h) return;
            clearTimeout(backendTimer);
            backendTimer = setTimeout(() => {
              _tundaSelagiSibuk("backend " + filename, () => {
                console.log(
                  "[hot-reload] backend changed, reloading core in-memory:",
                  filename,
                );
                const t0 = performance.now();
                try {
                  const rootDir = unpackedRoot();
                  for (const k of Object.keys(require.cache)) {
                    if (k.startsWith(rootDir)) delete require.cache[k];
                  }
                  _core = null;
                  core();
                  const ms = performance.now() - t0;
                  if (ms >= 100)
                    probe.say("hot-reload core " + ms.toFixed(0) + "ms");
                  console.log("[hot-reload] backend reloaded successfully!");
                } catch (err: any) {
                  console.error(
                    "[hot-reload] error reloading core:",
                    err.message,
                  );
                }
              });
            }, 500);
          }
        }, 300);
      };

      const WATCH_DIRS = ["public", "electron", "agent", "scripts"];
      for (const d of WATCH_DIRS) {
        const dp = path.join(root, d);
        if (fs.existsSync(dp)) {
          fs.watch(dp, { recursive: true }, (eventType: any, filename: any) =>
            handleWatch(dp, eventType, filename),
          );
        }
      }
      for (const f of backendFiles) {
        const fp = path.join(root, f);
        if (fs.existsSync(fp)) {
          fs.watch(fp, (eventType: any, filename: any) =>
            handleWatch(root, eventType, filename || f),
          );
        }
      }
    }
  } catch (_: any) {}
});
app.on("window-all-closed", () => {
  for (const p of procs) {
    try {
      p.kill();
    } catch (e: any) {}
  }
  app.quit();
});

// Marks this file as a MODULE rather than a global script. Without it every
// top-level const lands in the global scope and collides with the DOM lib —
// `crypto` here would shadow the browser `crypto`, and node:crypto's createHash
// would vanish. Placed at the end, and left as `export {}` rather than converting
// the requires to imports, because imports HOIST: the startup order in this file
// was deliberately tuned (1071 ms -> 314 ms) and lazy requires must stay lazy.
export {};
