// GENERATED FILE — DO NOT EDIT.
// Built from electron/main.ts by scripts/build-main.cjs.
// Run `npm run build:main` after changing the source.
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var main_exports = {};
module.exports = __toCommonJS(main_exports);
const { app, BrowserWindow, shell, ipcMain, protocol } = require("electron");
const { spawn, execSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const PORT = 8090;
const procs = [];
const probe = require("./probe");
global.__probe = probe;
const crypto = require("crypto");
app.setName("WOLFSPACE");
(function _isolasiUserData() {
  try {
    if (process.env.WOLFSPACE_USER_DATA) {
      app.setPath("userData", path.resolve(process.env.WOLFSPACE_USER_DATA));
      return;
    }
    if (process.env.WOLFSPACE_SHARE_USER_DATA === "1" || process.env.WOLFSPACE_SHARE_USER_DATA === "true") {
      return;
    }
    const rootAbs = path.resolve(ROOT).toLowerCase();
    const tag = crypto.createHash("sha256").update(rootAbs).digest("hex").slice(0, 12);
    const isolated = path.join(app.getPath("appData"), "WOLFSPACE-" + tag);
    app.setPath("userData", isolated);
  } catch (e) {
    console.warn("[userData] isolasi gagal, pakai default:", e.message);
  }
})();
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true
    }
  }
]);
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
  ".pdf": "application/pdf"
};
async function servePreviewFile(reqPath, injectBase) {
  try {
    if (!reqPath) return new Response("Missing ?path=", { status: 400 });
    const resolved = path.resolve(reqPath);
    const st = await fs.promises.stat(resolved).catch(() => null);
    if (!st || st.isDirectory())
      return new Response(
        '<html><body style="background:#0c1219;color:#8fb3ff;font-family:system-ui;padding:40px;text-align:center;display:flex;flex-direction:column;justify-content:center;height:100vh;margin:0;box-sizing:border-box;"><div style="font-size:48px;margin-bottom:16px;">\u23F3</div><h3 style="margin:0 0 8px 0;color:#dce4f0;">File Belum Tersedia</h3><p style="margin:0;color:#8b949e;font-size:14px;line-height:1.5;">File ini mungkin sedang dibuat oleh agent atau path-nya tidak ditemukan.<br/><br/><span style="font-family:monospace;font-size:11px;background:#131922;padding:4px 8px;border-radius:4px;border:1px solid #212a36;word-break:break-all;">' + resolved + "</span></p></body></html>",
        {
          status: 404,
          headers: { "content-type": "text/html; charset=utf-8" }
        }
      );
    const ext = path.extname(resolved).toLowerCase();
    const ct = _MIME[ext] || "application/octet-stream";
    let data = await fs.promises.readFile(resolved);
    if (injectBase && (ext === ".html" || ext === ".htm")) {
      const dir = resolved.replace(/\\/g, "/").replace(/\/[^\/]*$/, "/");
      const baseHref = "app://WOLFSPACE/preview-file-assets/" + encodeURI(dir);
      const baseTag = '<base href="' + baseHref + '">';
      let html = data.toString("utf8");
      html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + baseTag) : baseTag + html;
      data = Buffer.from(html, "utf8");
    }
    return new Response(data, {
      status: 200,
      headers: {
        "content-type": ct + (ct.startsWith("text/") ? "; charset=utf-8" : ""),
        "cache-control": "no-store"
      }
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
      const url = new URL(request.url);
      if (url.pathname.startsWith("/preview-file") && !url.pathname.startsWith("/preview-file-assets")) {
        return servePreviewFile(url.searchParams.get("path") || "", true);
      }
      if (url.pathname.startsWith("/preview-file-assets/")) {
        let assetPath;
        try {
          assetPath = decodeURIComponent(
            url.pathname.slice("/preview-file-assets/".length)
          );
        } catch (_) {
          assetPath = url.pathname.slice("/preview-file-assets/".length);
        }
        assetPath = assetPath.replace(/^\/+/, "");
        return servePreviewFile(assetPath, false);
      }
      let p = decodeURIComponent(url.pathname || "/");
      let base = pubDir, rel = p;
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
      const immutable = /\/(vendor|canvaskit|assets)\//.test(p) || [".woff2", ".ttf", ".otf", ".wasm"].includes(ext);
      return new Response(data, {
        status: 200,
        headers: {
          "content-type": _MIME[ext] || "application/octet-stream",
          "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-store"
        }
      });
    } catch (e) {
      return new Response("not found: " + (e && e.message), { status: 404 });
    }
  });
}
function toolchainPath() {
  const maybe = [
    path.join(
      process.env.APPDATA || "",
      "uv",
      "python",
      "cpython-3.12.10-windows-x86_64-none"
    ),
    "C:/langs/mingw64/bin",
    "C:/langs/go/bin",
    "C:/langs/jdk-21.0.11+10/bin",
    "C:/langs/php",
    "C:/langs/kotlinc/bin",
    path.join(process.env.USERPROFILE || "", ".cargo", "bin")
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
      fs.readFileSync(path.join(unpackedRoot(), "config.json"), "utf8")
    );
  } catch (e) {
  }
  const env = {
    ...process.env,
    PATH: toolchainPath() + path.delimiter + (process.env.PATH || "")
  };
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
      backgroundThrottling: false
    }
  });
  win.webContents.setBackgroundThrottling(false);
  const BACKEND = process.env.WOLFSPACE_BACKEND;
  if (BACKEND) {
    console.log("[WOLFSPACE] backend eksternal: " + BACKEND);
    win.loadURL(BACKEND);
  } else {
    win.loadURL("app://WOLFSPACE/index.html");
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  const LEVELS = ["log", "warning", "error"];
  win.webContents.on("console-message", (...a) => {
    const ev = a[0] && typeof a[0] === "object" && "message" in a[0] ? a[0] : null;
    const level = ev ? ev.level : a[1];
    const message = ev ? ev.message : a[2];
    console.log("[renderer:" + (LEVELS[level] || level) + "]", message);
  });
}
let _core = null;
function core() {
  if (_core) return _core;
  _core = require(path.join(unpackedRoot(), "core.js"));
  return _core;
}
const _streams = /* @__PURE__ */ new Map();
let _reloadTertunda = null;
const AGENT_SIBUK_MAKS_MS = 15 * 60 * 1e3;
function _agentSibuk() {
  const kini = Date.now();
  for (const s of _streams.values()) {
    if (s.channel !== "self-agent") continue;
    if (kini - (s.mulai || 0) < AGENT_SIBUK_MAKS_MS) return true;
  }
  return false;
}
function _tundaSelagiSibuk(label, fn) {
  if (_agentSibuk()) {
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
  } catch (err) {
    console.error("[hot-reload] gagal menjalankan yang ditunda:", err.message);
  }
}
const { PassThrough, Writable } = require("stream");
function _pasangTandaSelesai(res) {
  res._selesai = false;
  const baca = () => res._selesai;
  Object.defineProperty(res, "writableEnded", {
    get: baca,
    configurable: true
  });
  Object.defineProperty(res, "writableFinished", {
    get: baca,
    configurable: true
  });
}
let _br = null;
function _brWin() {
  return BrowserWindow.getAllWindows()[0] || null;
}
function _brBuat() {
  if (_br) return _br;
  const win = _brWin();
  if (!win) return null;
  const { WebContentsView } = require("electron");
  const tampil = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: process.env.WOLFSPACE_BROWSER_SANDBOX === "1",
      webSecurity: true
    }
  });
  const wc = tampil.webContents;
  const kirim = (t, d) => {
    try {
      win.webContents.send("WOLFSPACE:browser", { t, ...d });
    } catch (_) {
    }
  };
  wc.on("did-start-loading", () => kirim("muat", {}));
  wc.on(
    "did-stop-loading",
    () => kirim("selesai", { url: wc.getURL(), judul: wc.getTitle() })
  );
  wc.on(
    "did-fail-load",
    (_e, kode, desc, url, utama) => {
      if (!utama) return;
      kirim("gagal", { kode, desc, url });
    }
  );
  wc.on("did-navigate", (_e, url) => kirim("pindah", { url }));
  wc.on(
    "did-navigate-in-page",
    (_e, url) => kirim("pindah", { url })
  );
  wc.setWindowOpenHandler(({ url }) => {
    wc.loadURL(url);
    return { action: "deny" };
  });
  _br = { tampil, win };
  return _br;
}
function _brLog(pesan, data) {
  try {
    console.log(
      "[browser] " + pesan + (data ? " " + JSON.stringify(data) : "")
    );
  } catch (_) {
  }
}
function _brKeadaan() {
  if (!_br) return { ada: false };
  const wc = _br.tampil.webContents;
  let anak = -1;
  try {
    anak = _br.win.contentView.children.length;
  } catch (_) {
  }
  let b = null;
  try {
    b = _br.tampil.getBounds();
  } catch (_) {
  }
  return {
    ada: true,
    url: wc.getURL(),
    judul: wc.getTitle(),
    memuat: wc.isLoading(),
    rusak: wc.isCrashed(),
    bounds: b,
    anakDiJendela: anak
  };
}
function browserAksi(p) {
  const aksi = p && p.aksi || "";
  if (aksi === "diagnosa") {
    const k = _brKeadaan();
    _brLog("diagnosa", k);
    return { ok: true, ...k };
  }
  if (aksi === "sembunyi") {
    if (_br) {
      try {
        _br.win.contentView.removeChildView(_br.tampil);
      } catch (e) {
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
      } catch (e) {
        _brLog("buang GAGAL", { pesan: e.message });
      }
      _br = null;
    }
    return { ok: true };
  }
  let b;
  try {
    b = _brBuat();
  } catch (e) {
    _brLog("_brBuat MELEMPAR", { pesan: e.message });
    return { ok: false, error: "buat view: " + e.message };
  }
  if (!b) {
    _brLog("_brBuat mengembalikan null \u2014 tak ada jendela");
    return { ok: false, error: "tak ada jendela" };
  }
  if (p && p.bounds) {
    const r = p.bounds;
    const kotak = {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.max(0, Math.round(r.width)),
      height: Math.max(0, Math.round(r.height))
    };
    if (!kotak.width || !kotak.height)
      _brLog("bounds NOL dari renderer", kotak);
    try {
      b.tampil.setBounds(kotak);
    } catch (e) {
      _brLog("setBounds GAGAL", { kotak, pesan: e.message });
      return { ok: false, error: "setBounds: " + e.message };
    }
  }
  if (aksi === "tampil" || aksi === "buka") {
    try {
      const anak = b.win.contentView.children || [];
      if (!anak.includes(b.tampil)) {
        b.win.contentView.addChildView(b.tampil);
        _brLog("view dipasang", {
          anakSekarang: b.win.contentView.children.length
        });
      }
    } catch (e) {
      _brLog("addChildView GAGAL", { pesan: e.message });
      return { ok: false, error: "addChildView: " + e.message };
    }
  }
  try {
    if (aksi === "buka" && p.url) {
      _brLog("loadURL", { url: String(p.url).slice(0, 80) });
      b.tampil.webContents.loadURL(p.url).catch((e) => {
        _brLog("loadURL DITOLAK", { pesan: e.message });
      });
    }
    if (aksi === "muat-ulang") b.tampil.webContents.reload();
    if (aksi === "mundur" && b.tampil.webContents.navigationHistory.canGoBack())
      b.tampil.webContents.navigationHistory.goBack();
  } catch (e) {
    _brLog("navigasi GAGAL", { aksi, pesan: e.message });
    return { ok: false, error: "navigasi: " + e.message };
  }
  if (aksi === "buka") _brLog("sesudah buka", _brKeadaan());
  return { ok: true, ..._brKeadaan() };
}
function apiCall({
  method = "GET",
  path: path2 = "/",
  body = null,
  headers = {}
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
    req.url = path2;
    req.headers = Object.assign(
      { "content-type": "application/json" },
      headers
    );
    const res = new Writable();
    res.statusCode = 200;
    res._h = {};
    res._chunks = [];
    _pasangTandaSelesai(res);
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
      if (res._selesai) return;
      if (chunk) res._chunks.push(Buffer.from(chunk));
      res._selesai = true;
      done({
        status: res.statusCode,
        headers: res._h,
        body: Buffer.concat(res._chunks).toString("utf8")
      });
    };
    try {
      probe.timeSync(
        req.method + " " + req.url,
        () => core().server.emit("request", req, res)
      );
    } catch (e) {
      return done({
        status: 500,
        headers: {},
        body: JSON.stringify({ error: e.message })
      });
    }
    if (body != null)
      req.end(typeof body === "string" ? body : JSON.stringify(body));
    else req.end();
  });
}
function apiStream({ method = "GET", path: path2 = "/", body = null, headers = {} } = {}, emit, ctl = {}) {
  return new Promise((resolve) => {
    const req = new PassThrough();
    req.method = method;
    req.url = path2;
    req.headers = { "content-type": "application/json", ...headers };
    const res = new Writable();
    res.statusCode = 200;
    res._h = {};
    _pasangTandaSelesai(res);
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
      if (res._selesai) return;
      if (chunk) emit(chunk.toString("utf8"));
      res._selesai = true;
      resolve();
    };
    if (ctl.setCurReq) ctl.setCurReq(res);
    try {
      probe.timeSync(
        "STREAM " + req.method + " " + req.url,
        () => core().server.emit("request", req, res)
      );
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
  ipcMain.on("WOLFSPACE:probe", (_e, d) => {
    if (d && d.t === "renderer-stop")
      probe.say("RENDERER-STOP ~" + Math.round(d.overshoot) + "ms");
  });
  ipcMain.handle(
    "WOLFSPACE:invoke",
    async (_e, { channel, payload }) => {
      if (channel === "ping") return { ok: true, pong: Date.now() };
      if (channel === "selectFolder") {
        const { dialog } = require("electron");
        const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
        const r = await dialog.showOpenDialog(win, {
          properties: ["openDirectory"],
          title: "Pilih folder workspace"
        });
        if (r.canceled || !r.filePaths || !r.filePaths.length)
          return { canceled: true };
        return { path: r.filePaths[0] };
      }
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
        } catch (e) {
          return { ok: false, error: e.message };
        }
      }
      if (channel === "browser") return browserAksi(payload);
      if (channel === "api") return apiCall(payload);
      const c = core();
      if (channel === "cloudKeys") return Object.keys(c.getCloudKeys());
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
            c.terminalSessions.entries()
          ).map(([id, s]) => ({
            id,
            shell: s.shell,
            cwd: s.cwd,
            createdAt: s.createdAt
          }));
          return out;
        }
        throw new Error("unknown terminal action: " + action);
      }
      throw new Error("unknown invoke channel: " + channel);
    }
  );
  ipcMain.on("WOLFSPACE:stream", (e, { id, channel, payload }) => {
    const st = { cancelled: false, req: null, channel, mulai: Date.now() };
    _streams.set(id, st);
    const emit = (msg) => {
      if (st.cancelled) return;
      const t0 = performance.now();
      try {
        e.sender.send("WOLFSPACE:chunk", { id, data: msg });
      } catch (_) {
      }
      const ms = performance.now() - t0;
      if (ms >= 10)
        probe.say(
          "SEND chunk " + ms.toFixed(1) + "ms len=" + String(msg && (msg.length || 0))
        );
    };
    const finish = () => {
      _streams.delete(id);
      try {
        e.sender.send("WOLFSPACE:chunk", { id, done: true });
      } catch (_) {
      }
      _lepasReloadTertunda();
    };
    const ctl = {
      isCancelled: () => st.cancelled,
      setCurReq: (r) => {
        st.req = r;
      }
    };
    let fn = null;
    try {
      const c = core();
      fn = channel === "chat" ? c.chatStream : channel === "self-agent" ? c.selfAgentStream : channel === "api" ? apiStream : null;
    } catch (err) {
      emit({ t: "err", m: "core: " + err.message });
      return finish();
    }
    if (!fn) {
      emit({ t: "err", m: "unknown stream channel: " + channel });
      return finish();
    }
    try {
      const t0 = performance.now();
      Promise.resolve(fn(payload, emit, ctl)).then(finish, (err) => {
        emit({ t: "err", m: err && err.message || String(err) });
        finish();
      });
      const ms = performance.now() - t0;
      if (ms >= 100)
        probe.say("STREAM " + channel + " init " + ms.toFixed(0) + "ms");
    } catch (err) {
      emit({ t: "err", m: err && err.message || String(err) });
      finish();
    }
  });
  ipcMain.on("WOLFSPACE:cancel", (_e, { id }) => {
    const st = _streams.get(id);
    if (st) {
      st.cancelled = true;
      if (st.req) {
        try {
          st.req.destroy();
        } catch (_) {
        }
      }
    }
  });
}
function migrateOldUserDataOnce() {
  try {
    const newDir = app.getPath("userData");
    const newLS = path.join(newDir, "Local Storage");
    if (fs.existsSync(newLS)) return;
    const roaming = path.dirname(newDir);
    const claimLegacyUi = path.join(
      unpackedRoot(),
      ".wolfspace",
      "claim-legacy-ui"
    );
    const names = ["quantum", "Electron"];
    if (fs.existsSync(claimLegacyUi)) names.unshift("WOLFSPACE");
    const candidates = names.map((n) => path.join(roaming, n)).filter(
      (p) => p !== newDir && fs.existsSync(path.join(p, "Local Storage"))
    );
    if (!candidates.length) return;
    const withMtime = candidates.map((p) => {
      let m = 0;
      try {
        m = fs.statSync(path.join(p, "Local Storage", "LOG")).mtimeMs;
      } catch (_) {
      }
      return { p, m };
    });
    withMtime.sort((a, b) => b.m - a.m);
    const src = path.join(withMtime[0].p, "Local Storage");
    fs.mkdirSync(newDir, { recursive: true });
    fs.cpSync(src, newLS, { recursive: true });
    console.log(
      "[userData] migrasi localStorage dari",
      withMtime[0].p,
      "\u2192",
      newDir
    );
  } catch (e) {
    console.log("[userData] migrasi gagal (non-fatal):", e.message);
  }
}
process.on("uncaughtException", (error) => {
  console.error("[Electron Error] Uncaught Exception:", error);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error(
    "[Electron Error] Unhandled Rejection at:",
    promise,
    "reason:",
    reason
  );
});
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=512");
app.commandLine.appendSwitch("disable-http-cache");
app.commandLine.appendSwitch("enable-precise-memory-info");
app.commandLine.appendSwitch(
  "disable-features",
  ["CalculateNativeWinOcclusion", "AudioServiceSandbox"].join(",")
);
app.commandLine.appendSwitch("disable-gpu-memory-buffer-compositor-resources");
if (process.env.WOLFSPACE_GPU_SANDBOX !== "1" && process.env.WOLFSPACE_GPU_SANDBOX !== "true") {
  app.commandLine.appendSwitch("disable-gpu-sandbox");
}
const _gcInterval = setInterval(() => {
  if (global.gc) {
    global.gc();
  }
}, 6e4);
_gcInterval.unref();
app.whenReady().then(() => {
  probe.startStopProbe();
  probe.startLoopProbe();
  migrateOldUserDataOnce();
  registerAppProtocol();
  registerIpc();
  startBackend();
  createWindow();
  try {
    const root = unpackedRoot();
    const backendDirs = ["agent", "electron", "scripts"];
    const backendFiles = [
      "server.cjs",
      "terminal.cjs",
      "core.js",
      "config.json",
      "bridge.js"
    ];
    const frontendDirs = ["public"];
    let debounceTimer, backendTimer;
    const isBackend = (fp) => {
      const rel = path.relative(root, fp).replace(/\\/g, "/");
      if (rel.startsWith("public/") || rel.startsWith(".git/") || rel.startsWith("node_modules/") || rel.startsWith("studio/") || rel.startsWith(".asar-pack/"))
        return false;
      for (const d of backendDirs) if (rel.startsWith(d + "/")) return true;
      for (const f of backendFiles) if (rel === f) return true;
      return false;
    };
    const isFrontend = (fp) => {
      const rel = path.relative(root, fp).replace(/\\/g, "/");
      return rel.startsWith("public/");
    };
    const crypto2 = require("crypto");
    const _bkHash = /* @__PURE__ */ new Map();
    const _hashFile = (fp) => {
      try {
        return crypto2.createHash("md5").update(fs.readFileSync(fp)).digest("hex");
      } catch (_) {
        return null;
      }
    };
    const _hashFileAsync = (fp) => {
      return new Promise((resolve) => {
        try {
          const hash = crypto2.createHash("md5");
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
          await new Promise((r) => setImmediate(r));
        }
      }
    };
    const _seedAll = async () => {
      for (const d of backendDirs) {
        const p = path.join(root, d);
        if (fs.existsSync(p)) await _seedHashes(p, 0, 4, /\.(c?js|json)$/);
      }
      for (const f of backendFiles) {
        const p = path.join(root, f);
        if (fs.existsSync(p)) _bkHash.set(p, await _hashFileAsync(p));
      }
      const pubDir = path.join(root, "public");
      if (fs.existsSync(pubDir)) await _seedHashes(pubDir, 0, 20, null);
    };
    _seedAll();
    const _watchStart = Date.now();
    if (fs.existsSync(root) && !process.env.ELECTRON_RUN_AS_NODE) {
      const handleWatch = (baseDir, eventType, filename) => {
        if (!filename || path.basename(filename).startsWith(".") || filename.includes("node_modules") || filename.includes(".git") || filename.endsWith("~") || filename.endsWith(".swp"))
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
          if (isFrontend(fullPath)) {
            if (Date.now() - _watchStart < 4e3) return;
            const prev = _bkHash.get(fullPath);
            const hf = _hashFile(fullPath);
            if (!hf) return;
            _bkHash.set(fullPath, hf);
            if (prev === void 0 || prev === hf) return;
            _tundaSelagiSibuk("hmr " + filename, () => {
              try {
                const wins = BrowserWindow.getAllWindows();
                for (const w of wins)
                  w.webContents.send("WOLFSPACE:hmr", filename);
                console.log("[hmr] frontend update sent to UI for:", filename);
              } catch (_) {
              }
            });
          } else if (isBackend(fullPath)) {
            if (Date.now() - _watchStart < 4e3) return;
            const prev = _bkHash.get(fullPath);
            const h = _hashFile(fullPath);
            if (!h) return;
            _bkHash.set(fullPath, h);
            if (prev === void 0 || prev === h) return;
            clearTimeout(backendTimer);
            backendTimer = setTimeout(() => {
              _tundaSelagiSibuk("backend " + filename, () => {
                console.log(
                  "[hot-reload] backend changed, reloading core in-memory:",
                  filename
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
                } catch (err) {
                  console.error(
                    "[hot-reload] error reloading core:",
                    err.message
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
          fs.watch(
            dp,
            { recursive: true },
            (eventType, filename) => handleWatch(dp, eventType, filename)
          );
        }
      }
      for (const f of backendFiles) {
        const fp = path.join(root, f);
        if (fs.existsSync(fp)) {
          fs.watch(
            fp,
            (eventType, filename) => handleWatch(root, eventType, filename || f)
          );
        }
      }
    }
  } catch (_) {
  }
});
app.on("window-all-closed", () => {
  for (const p of procs) {
    try {
      p.kill();
    } catch (e) {
    }
  }
  app.quit();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gV09MRlNQQUNFIGRlc2t0b3AgYXBwIChFbGVjdHJvbik6IGxhdW5jaGVzIHRoZSBiYWNrZW5kICsgbG9jYWwgbW9kZWxzLCB0aGVuXG4vLyBvcGVucyBhIG5hdGl2ZSB3aW5kb3cuIFNwYXducyB0aGUgc2VydmVyIGFzIGEgU0VQQVJBVEUgcHJvY2VzcyBzbyB0aGVcbi8vIGV4ZWN1dG9yJ3MgcHJvY2Vzcy5leGVjUGF0aCBzdGF5cyBhIHJlYWwgSlMgcnVudGltZSAoYnVuL25vZGUpLCBub3QgZWxlY3Ryb24uXG5jb25zdCB7IGFwcCwgQnJvd3NlcldpbmRvdywgc2hlbGwsIGlwY01haW4sIHByb3RvY29sIH0gPSByZXF1aXJlKFwiZWxlY3Ryb25cIik7XG5jb25zdCB7IHNwYXduLCBleGVjU3luYyB9ID0gcmVxdWlyZShcImNoaWxkX3Byb2Nlc3NcIik7XG5jb25zdCBodHRwID0gcmVxdWlyZShcImh0dHBcIik7XG5jb25zdCBmcyA9IHJlcXVpcmUoXCJmc1wiKTtcbmNvbnN0IHBhdGggPSByZXF1aXJlKFwicGF0aFwiKTtcblxuY29uc3QgUk9PVCA9IHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi5cIik7XG5jb25zdCBQT1JUID0gODA5MDtcbmNvbnN0IHByb2NzOiBhbnlbXSA9IFtdO1xuY29uc3QgcHJvYmUgPSByZXF1aXJlKFwiLi9wcm9iZVwiKTtcbihnbG9iYWwgYXMgYW55KS5fX3Byb2JlID0gcHJvYmU7XG5cbi8vIEFwcCBuYW1lICsgdXNlckRhdGEgUEVSIFBST0pFQ1QgRk9MREVSLlxuLy9cbi8vIEJFRk9SRTogYXBwLnNldE5hbWUoXCJXT0xGU1BBQ0VcIikgYWxvbmUgLT4gRVZFUlkgY2xvbmUvY29weSBvZiB0aGUgY29kZSBvbiB0aGVcbi8vIHNhbWUgUEMgdXNlZCAlQVBQREFUQSVcXFdPTEZTUEFDRSAobG9jYWxTdG9yYWdlLCBjaGF0IFVJLCBhbmQgc28gb24pLiBBIEdpdEh1YlxuLy8gY2xvbmUgdGhhdCBcInNob3VsZCBiZSBibGFua1wiIGxvb2tlZCBhbHJlYWR5IGNvbmZpZ3VyZWQgYmVjYXVzZSBpdCBib3Jyb3dlZCB0aGVcbi8vIG9yaWdpbmFsIGluc3RhbGxhdGlvbidzIHByb2ZpbGUgXHUyMDE0IHRoZSBzYW1lIHJvb3QgY2F1c2UgYXMgYSBnbG9iYWwgQVBJIGtleSBpblxuLy8gfi8ud29sZnNwYWNlLlxuLy9cbi8vIE5PVzogdGhlIG5hbWUgc3RheXMgXCJXT0xGU1BBQ0VcIiAoZm9yIHRoZSB0YXNrYmFyL09TKSwgYnV0IHVzZXJEYXRhIGlzIGlzb2xhdGVkXG4vLyBwZXIgYWJzb2x1dGUgUk9PVCBwYXRoIChhIHNob3J0IGhhc2gpLiBBIGNsb25lIGluIGFub3RoZXIgZm9sZGVyID0gYW4gZW1wdHlcbi8vIHByb2ZpbGUuIE92ZXJyaWRlOiBXT0xGU1BBQ0VfVVNFUl9EQVRBPTxwYXRoPiBvciBXT0xGU1BBQ0VfU0hBUkVfVVNFUl9EQVRBPTFcbi8vICh0aGUgb2xkIHNoYXJlZCBkcmF3ZXIpLlxuY29uc3QgY3J5cHRvID0gcmVxdWlyZShcImNyeXB0b1wiKTtcbmFwcC5zZXROYW1lKFwiV09MRlNQQUNFXCIpO1xuKGZ1bmN0aW9uIF9pc29sYXNpVXNlckRhdGEoKSB7XG4gIHRyeSB7XG4gICAgaWYgKHByb2Nlc3MuZW52LldPTEZTUEFDRV9VU0VSX0RBVEEpIHtcbiAgICAgIGFwcC5zZXRQYXRoKFwidXNlckRhdGFcIiwgcGF0aC5yZXNvbHZlKHByb2Nlc3MuZW52LldPTEZTUEFDRV9VU0VSX0RBVEEpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKFxuICAgICAgcHJvY2Vzcy5lbnYuV09MRlNQQUNFX1NIQVJFX1VTRVJfREFUQSA9PT0gXCIxXCIgfHxcbiAgICAgIHByb2Nlc3MuZW52LldPTEZTUEFDRV9TSEFSRV9VU0VSX0RBVEEgPT09IFwidHJ1ZVwiXG4gICAgKSB7XG4gICAgICByZXR1cm47IC8vIGxlYXZlIEVsZWN0cm9uXHUyMDE5cyBvd24gc2V0TmFtZSBkZWZhdWx0IC0+ICVBUFBEQVRBJVxcV09MRlNQQUNFXG4gICAgfVxuICAgIGNvbnN0IHJvb3RBYnMgPSBwYXRoLnJlc29sdmUoUk9PVCkudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCB0YWcgPSBjcnlwdG9cbiAgICAgIC5jcmVhdGVIYXNoKFwic2hhMjU2XCIpXG4gICAgICAudXBkYXRlKHJvb3RBYnMpXG4gICAgICAuZGlnZXN0KFwiaGV4XCIpXG4gICAgICAuc2xpY2UoMCwgMTIpO1xuICAgIGNvbnN0IGlzb2xhdGVkID0gcGF0aC5qb2luKGFwcC5nZXRQYXRoKFwiYXBwRGF0YVwiKSwgXCJXT0xGU1BBQ0UtXCIgKyB0YWcpO1xuICAgIGFwcC5zZXRQYXRoKFwidXNlckRhdGFcIiwgaXNvbGF0ZWQpO1xuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBjb25zb2xlLndhcm4oXCJbdXNlckRhdGFdIGlzb2xhc2kgZ2FnYWwsIHBha2FpIGRlZmF1bHQ6XCIsIGUubWVzc2FnZSk7XG4gIH1cbn0pKCk7XG5cbi8vIEN1c3RvbSBhcHA6Ly8gc2NoZW1lIHNlcnZlcyB0aGUgVUkgKyBzdHVkaW8gZnJvbSBkaXNrIChubyBIVFRQIG5lZWRlZCB0byBMT0FEXG4vLyB0aGUgYXBwKS4gTXVzdCBiZSBkZWNsYXJlZCBwcml2aWxlZ2VkIEJFRk9SRSBhcHAgaXMgcmVhZHkuXG5wcm90b2NvbC5yZWdpc3RlclNjaGVtZXNBc1ByaXZpbGVnZWQoW1xuICB7XG4gICAgc2NoZW1lOiBcImFwcFwiLFxuICAgIHByaXZpbGVnZXM6IHtcbiAgICAgIHN0YW5kYXJkOiB0cnVlLFxuICAgICAgc2VjdXJlOiB0cnVlLFxuICAgICAgc3VwcG9ydEZldGNoQVBJOiB0cnVlLFxuICAgICAgc3RyZWFtOiB0cnVlLFxuICAgICAgY29kZUNhY2hlOiB0cnVlLFxuICAgIH0sXG4gIH0sXG5dKTtcblxuLy8gU0lOR0xFIFNPVVJDRTogcnVuIGV2ZXJ5dGhpbmcgZnJvbSBvbmUgZm9sZGVyLiBST09UIGFscmVhZHkgcmVzb2x2ZXMgdG8gdGhlXG4vLyBsaXZlIHByb2plY3QgZGlyZWN0b3J5IGluIGRldiAocmVsYXRpdmUgdG8gdGhpcyBmaWxlLCBub3QgYSBoYXJkY29kZWQgdXNlclxuLy8gcGF0aCkgYW5kIHRvIHRoZSBwYWNrYWdlZCBhcHAuYXNhci51bnBhY2tlZCBsb2NhdGlvbiBvbmNlIGJ1aWx0LlxuZnVuY3Rpb24gdW5wYWNrZWRSb290KCkge1xuICByZXR1cm4gYXBwLmlzUGFja2FnZWQgPyBST09ULnJlcGxhY2UoXCJhcHAuYXNhclwiLCBcImFwcC5hc2FyLnVucGFja2VkXCIpIDogUk9PVDtcbn1cblxuY29uc3QgX01JTUUgPSB7XG4gIFwiLmh0bWxcIjogXCJ0ZXh0L2h0bWxcIixcbiAgXCIuaHRtXCI6IFwidGV4dC9odG1sXCIsXG4gIFwiLmpzXCI6IFwidGV4dC9qYXZhc2NyaXB0XCIsXG4gIFwiLm1qc1wiOiBcInRleHQvamF2YXNjcmlwdFwiLFxuICBcIi5qc3hcIjogXCJ0ZXh0L2phdmFzY3JpcHRcIixcbiAgXCIudHNcIjogXCJ0ZXh0L2phdmFzY3JpcHRcIixcbiAgXCIuY3NzXCI6IFwidGV4dC9jc3NcIixcbiAgXCIuanNvblwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgXCIud2FzbVwiOiBcImFwcGxpY2F0aW9uL3dhc21cIixcbiAgXCIucG5nXCI6IFwiaW1hZ2UvcG5nXCIsXG4gIFwiLmpwZ1wiOiBcImltYWdlL2pwZWdcIixcbiAgXCIuanBlZ1wiOiBcImltYWdlL2pwZWdcIixcbiAgXCIuZ2lmXCI6IFwiaW1hZ2UvZ2lmXCIsXG4gIFwiLndlYnBcIjogXCJpbWFnZS93ZWJwXCIsXG4gIFwiLnN2Z1wiOiBcImltYWdlL3N2Zyt4bWxcIixcbiAgXCIuaWNvXCI6IFwiaW1hZ2UveC1pY29uXCIsXG4gIFwiLndvZmZcIjogXCJmb250L3dvZmZcIixcbiAgXCIud29mZjJcIjogXCJmb250L3dvZmYyXCIsXG4gIFwiLnR0ZlwiOiBcImZvbnQvdHRmXCIsXG4gIFwiLm90ZlwiOiBcImZvbnQvb3RmXCIsXG4gIFwiLm1hcFwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgLy8gM0QgLyBnYW1lIGFzc2V0c1xuICBcIi5nbHRmXCI6IFwibW9kZWwvZ2x0Zitqc29uXCIsXG4gIFwiLmdsYlwiOiBcIm1vZGVsL2dsdGYtYmluYXJ5XCIsXG4gIFwiLmJpblwiOiBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiLFxuICBcIi5vYmpcIjogXCJ0ZXh0L3BsYWluXCIsXG4gIFwiLm10bFwiOiBcInRleHQvcGxhaW5cIixcbiAgXCIuZmJ4XCI6IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCIsXG4gIFwiLmRhZVwiOiBcIm1vZGVsL3ZuZC5jb2xsYWRhK3htbFwiLFxuICBcIi5oZHJcIjogXCJpbWFnZS92bmQucmFkaWFuY2VcIixcbiAgXCIuZXhyXCI6IFwiaW1hZ2UveC1leHJcIixcbiAgLy8gYXVkaW8gLyB2aWRlb1xuICBcIi5tcDNcIjogXCJhdWRpby9tcGVnXCIsXG4gIFwiLm9nZ1wiOiBcImF1ZGlvL29nZ1wiLFxuICBcIi53YXZcIjogXCJhdWRpby93YXZcIixcbiAgXCIubXA0XCI6IFwidmlkZW8vbXA0XCIsXG4gIFwiLndlYm1cIjogXCJ2aWRlby93ZWJtXCIsXG4gIC8vIG1pc2NcbiAgXCIudHh0XCI6IFwidGV4dC9wbGFpblwiLFxuICBcIi54bWxcIjogXCJhcHBsaWNhdGlvbi94bWxcIixcbiAgXCIucGRmXCI6IFwiYXBwbGljYXRpb24vcGRmXCIsXG59O1xuXG4vLyBXZWIgRGV2IExpdmUgQnJvd3Nlcjogc2VydmUgZmlsZXMgZnJvbSBkaXNrIGZvciB0aGUgaWZyYW1lIHByZXZpZXcgKHBhcml0eSB3aXRoXG4vLyB0aGUgL3ByZXZpZXctZmlsZSBlbmRwb2ludCBpbiBzZXJ2ZXIuY2pzKS4gQW4gaWZyYW1lIGlzIGEgZG9jdW1lbnQgbG9hZCBcdTIwMTQgaXQgZG9lc1xuLy8gTk9UIGdvIHRocm91Z2ggdGhlIElQQyBmZXRjaCBzaGltIFx1MjAxNCBzbyB0aGUgYXBwOi8vIHByb3RvY29sIGhhcyB0byBzZXJ2ZSBpdCBoZXJlLlxuLy8gRm9yIEhUTUwgYSA8YmFzZT4gaXMgaW5qZWN0ZWQgc28gcmVsYXRpdmUgYXNzZXRzIChjc3MvanMvaW1nKSBhcmUgc2VydmVkIHRvbywgdmlhXG4vLyAvcHJldmlldy1maWxlLWFzc2V0cy88YWJzb2x1dGUtcGF0aD4uXG5hc3luYyBmdW5jdGlvbiBzZXJ2ZVByZXZpZXdGaWxlKHJlcVBhdGg6IGFueSwgaW5qZWN0QmFzZTogYW55KSB7XG4gIHRyeSB7XG4gICAgaWYgKCFyZXFQYXRoKSByZXR1cm4gbmV3IFJlc3BvbnNlKFwiTWlzc2luZyA/cGF0aD1cIiwgeyBzdGF0dXM6IDQwMCB9KTtcbiAgICBjb25zdCByZXNvbHZlZCA9IHBhdGgucmVzb2x2ZShyZXFQYXRoKTtcbiAgICBjb25zdCBzdCA9IGF3YWl0IGZzLnByb21pc2VzLnN0YXQocmVzb2x2ZWQpLmNhdGNoKCgpID0+IG51bGwpO1xuICAgIGlmICghc3QgfHwgc3QuaXNEaXJlY3RvcnkoKSlcbiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoXG4gICAgICAgICc8aHRtbD48Ym9keSBzdHlsZT1cImJhY2tncm91bmQ6IzBjMTIxOTtjb2xvcjojOGZiM2ZmO2ZvbnQtZmFtaWx5OnN5c3RlbS11aTtwYWRkaW5nOjQwcHg7dGV4dC1hbGlnbjpjZW50ZXI7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO2hlaWdodDoxMDB2aDttYXJnaW46MDtib3gtc2l6aW5nOmJvcmRlci1ib3g7XCI+JyArXG4gICAgICAgICAgJzxkaXYgc3R5bGU9XCJmb250LXNpemU6NDhweDttYXJnaW4tYm90dG9tOjE2cHg7XCI+XHUyM0YzPC9kaXY+JyArXG4gICAgICAgICAgJzxoMyBzdHlsZT1cIm1hcmdpbjowIDAgOHB4IDA7Y29sb3I6I2RjZTRmMDtcIj5GaWxlIEJlbHVtIFRlcnNlZGlhPC9oMz4nICtcbiAgICAgICAgICAnPHAgc3R5bGU9XCJtYXJnaW46MDtjb2xvcjojOGI5NDllO2ZvbnQtc2l6ZToxNHB4O2xpbmUtaGVpZ2h0OjEuNTtcIj4nICtcbiAgICAgICAgICBcIkZpbGUgaW5pIG11bmdraW4gc2VkYW5nIGRpYnVhdCBvbGVoIGFnZW50IGF0YXUgcGF0aC1ueWEgdGlkYWsgZGl0ZW11a2FuLjxici8+PGJyLz5cIiArXG4gICAgICAgICAgJzxzcGFuIHN0eWxlPVwiZm9udC1mYW1pbHk6bW9ub3NwYWNlO2ZvbnQtc2l6ZToxMXB4O2JhY2tncm91bmQ6IzEzMTkyMjtwYWRkaW5nOjRweCA4cHg7Ym9yZGVyLXJhZGl1czo0cHg7Ym9yZGVyOjFweCBzb2xpZCAjMjEyYTM2O3dvcmQtYnJlYWs6YnJlYWstYWxsO1wiPicgK1xuICAgICAgICAgIHJlc29sdmVkICtcbiAgICAgICAgICBcIjwvc3Bhbj48L3A+XCIgK1xuICAgICAgICAgIFwiPC9ib2R5PjwvaHRtbD5cIixcbiAgICAgICAge1xuICAgICAgICAgIHN0YXR1czogNDA0LFxuICAgICAgICAgIGhlYWRlcnM6IHsgXCJjb250ZW50LXR5cGVcIjogXCJ0ZXh0L2h0bWw7IGNoYXJzZXQ9dXRmLThcIiB9LFxuICAgICAgICB9LFxuICAgICAgKTtcbiAgICBjb25zdCBleHQgPSBwYXRoLmV4dG5hbWUocmVzb2x2ZWQpLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgY3QgPSBfTUlNRVtleHQgYXMga2V5b2YgdHlwZW9mIF9NSU1FXSB8fCBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiO1xuICAgIGxldCBkYXRhID0gYXdhaXQgZnMucHJvbWlzZXMucmVhZEZpbGUocmVzb2x2ZWQpO1xuICAgIGlmIChpbmplY3RCYXNlICYmIChleHQgPT09IFwiLmh0bWxcIiB8fCBleHQgPT09IFwiLmh0bVwiKSkge1xuICAgICAgLy8gVXNlIHRoZSBhYnNvbHV0ZSBVUkwgYXBwOi8vV09MRlNQQUNFL3ByZXZpZXctZmlsZS1hc3NldHMvPHBhdGg+IHNvIHRoYXRcbiAgICAgIC8vIGZldGNoKCkgZnJvbSB0aHJlZS5qcyBvciBhbm90aGVyIGxpYnJhcnkgZG9lcyBub3QgbGFuZCBvbiB0aGUgd3Jvbmcgb3JpZ2luLlxuICAgICAgLy8gV2luZG93cyBwYXRoczogQzpcXFVzZXJzXFwuLi4gLT4gQzovVXNlcnMvLi4uLyAoZm9yd2FyZCBzbGFzaCwgdHJhaWxpbmcgc2xhc2gpXG4gICAgICBjb25zdCBkaXIgPSByZXNvbHZlZC5yZXBsYWNlKC9cXFxcL2csIFwiL1wiKS5yZXBsYWNlKC9cXC9bXlxcL10qJC8sIFwiL1wiKTtcbiAgICAgIC8vIGVuY29kZVVSSSBrZWVwcyAnOicgKHdoaWNoIG1hdHRlcnMgZm9yIHRoZSBXaW5kb3dzIGRyaXZlIGxldHRlciBDOikgd2hpbGVcbiAgICAgIC8vIHN0aWxsIGVuY29kaW5nIHNwYWNlcyBhbmQgb3RoZXIgc3BlY2lhbCBjaGFyYWN0ZXJzIGluIGZvbGRlciBuYW1lcy5cbiAgICAgIGNvbnN0IGJhc2VIcmVmID0gXCJhcHA6Ly9XT0xGU1BBQ0UvcHJldmlldy1maWxlLWFzc2V0cy9cIiArIGVuY29kZVVSSShkaXIpO1xuICAgICAgY29uc3QgYmFzZVRhZyA9ICc8YmFzZSBocmVmPVwiJyArIGJhc2VIcmVmICsgJ1wiPic7XG4gICAgICBsZXQgaHRtbCA9IGRhdGEudG9TdHJpbmcoXCJ1dGY4XCIpO1xuICAgICAgaHRtbCA9IC88aGVhZFtePl0qPi9pLnRlc3QoaHRtbClcbiAgICAgICAgPyBodG1sLnJlcGxhY2UoLzxoZWFkW14+XSo+L2ksIChtOiBhbnkpID0+IG0gKyBiYXNlVGFnKVxuICAgICAgICA6IGJhc2VUYWcgKyBodG1sO1xuICAgICAgZGF0YSA9IEJ1ZmZlci5mcm9tKGh0bWwsIFwidXRmOFwiKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBSZXNwb25zZShkYXRhLCB7XG4gICAgICBzdGF0dXM6IDIwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgXCJjb250ZW50LXR5cGVcIjogY3QgKyAoY3Quc3RhcnRzV2l0aChcInRleHQvXCIpID8gXCI7IGNoYXJzZXQ9dXRmLThcIiA6IFwiXCIpLFxuICAgICAgICBcImNhY2hlLWNvbnRyb2xcIjogXCJuby1zdG9yZVwiLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgcmV0dXJuIG5ldyBSZXNwb25zZShcInByZXZpZXcgZXJyb3I6IFwiICsgKGUgJiYgZS5tZXNzYWdlKSwgeyBzdGF0dXM6IDUwMCB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiByZWdpc3RlckFwcFByb3RvY29sKCkge1xuICBjb25zdCBwdWJEaXIgPSBwYXRoLmpvaW4odW5wYWNrZWRSb290KCksIFwicHVibGljXCIpO1xuICBjb25zdCBzdHVkaW9EaXIgPSBwYXRoLmpvaW4odW5wYWNrZWRSb290KCksIFwic3R1ZGlvXCIsIFwiYnVpbGRcIiwgXCJ3ZWJcIik7XG4gIHByb3RvY29sLmhhbmRsZShcImFwcFwiLCBhc3luYyAocmVxdWVzdDogYW55KSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmVxdWVzdC51cmwpOyAvLyBhcHA6Ly9XT0xGU1BBQ0UvPHBhdGg+XG4gICAgICBpZiAoXG4gICAgICAgIHVybC5wYXRobmFtZS5zdGFydHNXaXRoKFwiL3ByZXZpZXctZmlsZVwiKSAmJlxuICAgICAgICAhdXJsLnBhdGhuYW1lLnN0YXJ0c1dpdGgoXCIvcHJldmlldy1maWxlLWFzc2V0c1wiKVxuICAgICAgKSB7XG4gICAgICAgIC8vIC9wcmV2aWV3LWZpbGU/cGF0aD0uLi4gXHUyMDE0IHRoZSBxdWVyeS1wYXJhbSBwYXRoIGlzIGFscmVhZHkgVVJMLWRlY29kZWQgYnlcbiAgICAgICAgLy8gdXJsLnNlYXJjaFBhcmFtcy5cbiAgICAgICAgcmV0dXJuIHNlcnZlUHJldmlld0ZpbGUodXJsLnNlYXJjaFBhcmFtcy5nZXQoXCJwYXRoXCIpIHx8IFwiXCIsIHRydWUpO1xuICAgICAgfVxuICAgICAgaWYgKHVybC5wYXRobmFtZS5zdGFydHNXaXRoKFwiL3ByZXZpZXctZmlsZS1hc3NldHMvXCIpKSB7XG4gICAgICAgIC8vIFVzZSB1cmwucGF0aG5hbWUgZGlyZWN0bHkgKG5vdCB0aGUgcCBhbHJlYWR5IGRlY29kZVVSSUNvbXBvbmVudCdkIGFib3ZlKVxuICAgICAgICAvLyBzbyBleGFjdGx5IE9ORSBjb3JyZWN0IGRlY29kZSBoYXBwZW5zLCBjb25zaXN0ZW50IHdpdGggdGhlIGVuY29kZVVSSSBpbiB0aGVcbiAgICAgICAgLy8gYmFzZSBocmVmLiBlbmNvZGVVUkkga2VlcHMgJzonLCBzbyAnQzonIHN0YXlzICdDOicgaW4gdXJsLnBhdGhuYW1lLCBidXQgYVxuICAgICAgICAvLyBzcGFjZSBiZWNvbWVzICclMjAnIGFuZCBoYXMgdG8gYmUgZGVjb2RlZCBoZXJlLlxuICAgICAgICBsZXQgYXNzZXRQYXRoO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGFzc2V0UGF0aCA9IGRlY29kZVVSSUNvbXBvbmVudChcbiAgICAgICAgICAgIHVybC5wYXRobmFtZS5zbGljZShcIi9wcmV2aWV3LWZpbGUtYXNzZXRzL1wiLmxlbmd0aCksXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoXzogYW55KSB7XG4gICAgICAgICAgYXNzZXRQYXRoID0gdXJsLnBhdGhuYW1lLnNsaWNlKFwiL3ByZXZpZXctZmlsZS1hc3NldHMvXCIubGVuZ3RoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBTdHJpcCB0aGUgZG91YmxlZCBsZWFkaW5nIHNsYXNoICgvL0M6Ly4uLikgdGhlIHRyYWlsaW5nIHNsYXNoIGluIHRoZSBiYXNlXG4gICAgICAgIC8vIGhyZWYgcHJvZHVjZXMuXG4gICAgICAgIGFzc2V0UGF0aCA9IGFzc2V0UGF0aC5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuICAgICAgICByZXR1cm4gc2VydmVQcmV2aWV3RmlsZShhc3NldFBhdGgsIGZhbHNlKTtcbiAgICAgIH1cbiAgICAgIC8vIFJvdXRpbmcgZm9yIHRoZSBzdGF0aWMgVUkgZmlsZXMgKHB1YmxpYy8gYW5kIHN0dWRpby8pXG4gICAgICBsZXQgcCA9IGRlY29kZVVSSUNvbXBvbmVudCh1cmwucGF0aG5hbWUgfHwgXCIvXCIpO1xuICAgICAgbGV0IGJhc2UgPSBwdWJEaXIsXG4gICAgICAgIHJlbCA9IHA7XG4gICAgICBpZiAocCA9PT0gXCIvXCIgfHwgcCA9PT0gXCJcIikgcmVsID0gXCIvaW5kZXguaHRtbFwiO1xuICAgICAgZWxzZSBpZiAocCA9PT0gXCIvc3R1ZGlvXCIgfHwgcCA9PT0gXCIvc3R1ZGlvL1wiKSB7XG4gICAgICAgIGJhc2UgPSBzdHVkaW9EaXI7XG4gICAgICAgIHJlbCA9IFwiL2luZGV4Lmh0bWxcIjtcbiAgICAgIH0gZWxzZSBpZiAocC5zdGFydHNXaXRoKFwiL3N0dWRpby9cIikpIHtcbiAgICAgICAgYmFzZSA9IHN0dWRpb0RpcjtcbiAgICAgICAgcmVsID0gcC5zbGljZShcIi9zdHVkaW9cIi5sZW5ndGgpO1xuICAgICAgfVxuICAgICAgY29uc3QgZnAgPSBwYXRoLm5vcm1hbGl6ZShwYXRoLmpvaW4oYmFzZSwgcmVsKSk7XG4gICAgICBpZiAoIWZwLnN0YXJ0c1dpdGgoYmFzZSkpXG4gICAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoXCJmb3JiaWRkZW5cIiwgeyBzdGF0dXM6IDQwMyB9KTtcbiAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBmcy5wcm9taXNlcy5yZWFkRmlsZShmcCk7XG4gICAgICBjb25zdCBleHQgPSBwYXRoLmV4dG5hbWUoZnApLnRvTG93ZXJDYXNlKCk7XG4gICAgICBjb25zdCBpbW11dGFibGUgPVxuICAgICAgICAvXFwvKHZlbmRvcnxjYW52YXNraXR8YXNzZXRzKVxcLy8udGVzdChwKSB8fFxuICAgICAgICBbXCIud29mZjJcIiwgXCIudHRmXCIsIFwiLm90ZlwiLCBcIi53YXNtXCJdLmluY2x1ZGVzKGV4dCk7XG4gICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKGRhdGEsIHtcbiAgICAgICAgc3RhdHVzOiAyMDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBcImNvbnRlbnQtdHlwZVwiOlxuICAgICAgICAgICAgX01JTUVbZXh0IGFzIGtleW9mIHR5cGVvZiBfTUlNRV0gfHwgXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIixcbiAgICAgICAgICBcImNhY2hlLWNvbnRyb2xcIjogaW1tdXRhYmxlXG4gICAgICAgICAgICA/IFwicHVibGljLCBtYXgtYWdlPTMxNTM2MDAwLCBpbW11dGFibGVcIlxuICAgICAgICAgICAgOiBcIm5vLXN0b3JlXCIsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoXCJub3QgZm91bmQ6IFwiICsgKGUgJiYgZS5tZXNzYWdlKSwgeyBzdGF0dXM6IDQwNCB9KTtcbiAgICB9XG4gIH0pO1xufVxuXG4vLyBmaW5kUnVudGltZSgpIFJFTU9WRUQgXHUyMDE0IHplcm8gY2FsbGVycy4gTG9va2luZyBmb3IgYSBidW4vbm9kZSBydW50aW1lIG1hdHRlcmVkXG4vLyB3aGlsZSB0aGUgYmFja2VuZCB3YXMgc3Bhd25lZCBhcyBhIHNlcGFyYXRlIHByb2Nlc3M7IHNpbmNlIHRoZSBiYWNrZW5kIHJ1bnNcbi8vIGluLXByb2Nlc3MgdGhyb3VnaCBjb3JlLmpzIGl0IGhhcyBuZXZlciBiZWVuIHVzZWQgYWdhaW4uXG5cbmZ1bmN0aW9uIHRvb2xjaGFpblBhdGgoKSB7XG4gIGNvbnN0IG1heWJlID0gW1xuICAgIHBhdGguam9pbihcbiAgICAgIHByb2Nlc3MuZW52LkFQUERBVEEgfHwgXCJcIixcbiAgICAgIFwidXZcIixcbiAgICAgIFwicHl0aG9uXCIsXG4gICAgICBcImNweXRob24tMy4xMi4xMC13aW5kb3dzLXg4Nl82NC1ub25lXCIsXG4gICAgKSxcbiAgICBcIkM6L2xhbmdzL21pbmd3NjQvYmluXCIsXG4gICAgXCJDOi9sYW5ncy9nby9iaW5cIixcbiAgICBcIkM6L2xhbmdzL2pkay0yMS4wLjExKzEwL2JpblwiLFxuICAgIFwiQzovbGFuZ3MvcGhwXCIsXG4gICAgXCJDOi9sYW5ncy9rb3RsaW5jL2JpblwiLFxuICAgIHBhdGguam9pbihwcm9jZXNzLmVudi5VU0VSUFJPRklMRSB8fCBcIlwiLCBcIi5jYXJnb1wiLCBcImJpblwiKSxcbiAgXS5maWx0ZXIoKGQpID0+IHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGZzLmV4aXN0c1N5bmMoZCk7XG4gICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIG1heWJlLmpvaW4ocGF0aC5kZWxpbWl0ZXIpO1xufVxuXG5mdW5jdGlvbiBzdGFydEJhY2tlbmQoKSB7XG4gIGxldCBjZmcgPSB7fTtcbiAgdHJ5IHtcbiAgICBjZmcgPSBKU09OLnBhcnNlKFxuICAgICAgZnMucmVhZEZpbGVTeW5jKHBhdGguam9pbih1bnBhY2tlZFJvb3QoKSwgXCJjb25maWcuanNvblwiKSwgXCJ1dGY4XCIpLFxuICAgICk7XG4gIH0gY2F0Y2ggKGU6IGFueSkge31cbiAgY29uc3QgZW52ID0ge1xuICAgIC4uLnByb2Nlc3MuZW52LFxuICAgIFBBVEg6IHRvb2xjaGFpblBhdGgoKSArIHBhdGguZGVsaW1pdGVyICsgKHByb2Nlc3MuZW52LlBBVEggfHwgXCJcIiksXG4gIH07XG5cbiAgLy8gTk8gd2ViIHNlcnZlciBhbnltb3JlOiB0aGUgYmFja2VuZCBsb2dpYyBydW5zIElOLVBST0NFU1MgdmlhIGNvcmUuanMsIHJlYWNoZWRcbiAgLy8gYnkgdGhlIHJlbmRlcmVyIHRocm91Z2ggRWxlY3Ryb24gSVBDIChzZWUgcmVnaXN0ZXJJcGMpLiBaZXJvIG9wZW4gcG9ydHMuXG59XG5cbi8vIHdhaXRSZWFkeSgpIFJFTU9WRUQgXHUyMDE0IGl0cyBvd24gY29tbWVudCBhbHJlYWR5IG1hcmtlZCBpdCBPQlNPTEVURSwgYW5kIGl0cyBib2R5XG4vLyByZWFsbHkgd2FzIGp1c3QgY2IoKSB3aXRob3V0IHdhaXRpbmcgZm9yIGFueXRoaW5nLiBaZXJvIGNhbGxlcnMuXG5cbmZ1bmN0aW9uIGNyZWF0ZVdpbmRvdygpIHtcbiAgY29uc3Qgd2luID0gbmV3IEJyb3dzZXJXaW5kb3coe1xuICAgIHdpZHRoOiAxMjAwLFxuICAgIGhlaWdodDogODIwLFxuICAgIG1pbldpZHRoOiA3MjAsXG4gICAgbWluSGVpZ2h0OiA1MjAsXG4gICAgYmFja2dyb3VuZENvbG9yOiBcIiMwYjBkMTFcIixcbiAgICB0aXRsZTogXCJXT0xGU1BBQ0VcIixcbiAgICBhdXRvSGlkZU1lbnVCYXI6IHRydWUsXG4gICAgaWNvbjogcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLlwiLCBcInB1YmxpY1wiLCBcImljb24uaWNvXCIpLFxuICAgIHdlYlByZWZlcmVuY2VzOiB7XG4gICAgICBwcmVsb2FkOiBwYXRoLmpvaW4oX19kaXJuYW1lLCBcInByZWxvYWQuanNcIiksXG4gICAgICBjb250ZXh0SXNvbGF0aW9uOiB0cnVlLFxuICAgICAgbm9kZUludGVncmF0aW9uOiBmYWxzZSxcbiAgICAgIC8vIFNhbmRib3ggb2ZmIHNvIHByZWxvYWQuanMgY2FuIHVzZSByZXF1aXJlKCdwYXRoJykgYW5kIGZyaWVuZHMuIFNhZmUgYmVjYXVzZVxuICAgICAgLy8gY29udGV4dElzb2xhdGlvbjogdHJ1ZSBzdGF5cyBvbiBcdTIwMTQgdGhlIHJlbmRlcmVyIGhhcyBOTyBhY2Nlc3MgdG8gTm9kZS4gT25seVxuICAgICAgLy8gdGhlIHByZWxvYWQgYnJpZGdlIGlzIGV4cG9zZWQgdG8gd2luZG93LlxuICAgICAgc2FuZGJveDogZmFsc2UsXG4gICAgICAvLyBFbGVjdHJvbi9DaHJvbWl1bSBUSFJPVFRMRVMgcmVuZGVyL3RpbWVycyAockFGIGFuZCBzbyBvbikgYnkgZGVmYXVsdCB3aGVuIGFcbiAgICAgIC8vIHdpbmRvdyBsb3NlcyBmb2N1cyBvciBpcyB0cmVhdGVkIGFzIFwiYmFja2dyb3VuZFwiIFx1MjAxNCBleGFjdGx5IHdoYXQgaGFwcGVucyB3aGlsZVxuICAgICAgLy8gdGhlIG5hdGl2ZSBmb2xkZXIgZGlhbG9nIGlzIG9wZW4gKHRoZSBtYWluIHdpbmRvdyBpcyBicmllZmx5IHVuZm9jdXNlZCkuIFRoYXRcbiAgICAgIC8vIGlzIHRoZSBzdHJvbmcgc3VzcGVjdCBiZWhpbmQgXCJ0aGUgc3RhdGUgaXMgYWxyZWFkeSBjb3JyZWN0IGluIGxvY2FsU3RvcmFnZSBidXRcbiAgICAgIC8vIHRoZSBVSSBvbmx5IHNob3dzIGl0IGFmdGVyIGEgcmVsb2FkIGZvcmNlcyBhIHJlcGFpbnRcIi4gVHVybiB0aGF0IHRocm90dGxpbmdcbiAgICAgIC8vIG9mZiBmb3IgdGhlIG1haW4gd2luZG93LlxuICAgICAgYmFja2dyb3VuZFRocm90dGxpbmc6IGZhbHNlLFxuICAgIH0sXG4gIH0pO1xuICB3aW4ud2ViQ29udGVudHMuc2V0QmFja2dyb3VuZFRocm90dGxpbmcoZmFsc2UpOyAvLyBzZWNvbmQgbGF5ZXIsIHNvbWUgRWxlY3Ryb24gdmVyc2lvbnMgbmVlZCB0aGlzIHRvb1xuICAvLyBXT0xGU1BBQ0VfQkFDS0VORCBwb2ludHMgdGhlIHdpbmRvdyBhdCBhIGJhY2tlbmQgcnVubmluZyBzb21ld2hlcmUgZWxzZSBcdTIwMTQgdXNlZFxuICAvLyB0byBydW4gdGhlIGJhY2tlbmQgaW5zaWRlIFdTTCwgdGhlIG9ubHkgcGxhY2Ugem9uZSBuZXR3b3JrIGNvbmZpbmVtZW50XG4gIC8vICh1bnNoYXJlIC1uKSBhY3R1YWxseSBhcHBsaWVzLiBFbXB0eSA9IHRoZSBvbGQgYmVoYXZpb3VyOiB0aGUgVUkgaXMgc2VydmVkIGZyb21cbiAgLy8gZGlzayBvdmVyIHRoZSBhcHA6Ly8gcHJvdG9jb2wuXG4gIC8vXG4gIC8vIFRoZSBwcmVsb2FkIHJlYWRzIHRoZSBzYW1lIGVudiB2YXIgYW5kIHR1cm5zIHRoZSBgaXBjYCBmbGFnIG9mZiwgc28gdGhlIGZyb250ZW5kXG4gIC8vIHVzZXMgdGhlIEhUVFAgcGF0aCB0byB0aGlzIG9yaWdpbiBpbnN0ZWFkIG9mIHRoZSBpbi1wcm9jZXNzIGNvcmUuXG4gIGNvbnN0IEJBQ0tFTkQgPSBwcm9jZXNzLmVudi5XT0xGU1BBQ0VfQkFDS0VORDtcbiAgaWYgKEJBQ0tFTkQpIHtcbiAgICBjb25zb2xlLmxvZyhcIltXT0xGU1BBQ0VdIGJhY2tlbmQgZWtzdGVybmFsOiBcIiArIEJBQ0tFTkQpO1xuICAgIHdpbi5sb2FkVVJMKEJBQ0tFTkQpO1xuICB9IGVsc2Uge1xuICAgIHdpbi5sb2FkVVJMKFwiYXBwOi8vV09MRlNQQUNFL2luZGV4Lmh0bWxcIik7IC8vIHNlcnZlZCBmcm9tIGRpc2sgdmlhIHRoZSBhcHA6Ly8gcHJvdG9jb2xcbiAgfVxuICAvLyBvcGVuIHJlYWwgZXh0ZXJuYWwgbGlua3MgaW4gdGhlIHN5c3RlbSBicm93c2VyLCBub3QgaW5zaWRlIHRoZSBhcHBcbiAgd2luLndlYkNvbnRlbnRzLnNldFdpbmRvd09wZW5IYW5kbGVyKCh7IHVybCB9OiBhbnkpID0+IHtcbiAgICBzaGVsbC5vcGVuRXh0ZXJuYWwodXJsKTtcbiAgICByZXR1cm4geyBhY3Rpb246IFwiZGVueVwiIH07XG4gIH0pO1xuICAvLyBGb3J3YXJkIGNvbnNvbGUubG9nL3dhcm4vZXJyb3IgZnJvbSB0aGUgUkVOREVSRVIgdG8gdGhlIG1haW4gcHJvY2VzcyBzdGRvdXQgXHUyMDE0XG4gIC8vIHdpdGhvdXQgdGhpcywgYSBjb25zb2xlLmxvZyBpbiBhcHAudHN4IChicm93c2VyIERldlRvb2xzKSBpcyBuZXZlciB2aXNpYmxlIGluIHRoZVxuICAvLyBkZXYgdGVybWluYWwgb3IgbG9nLCBvbmx5IGluIERldlRvb2xzLCB3aGljaCBpcyBub3QgYWx3YXlzIG9wZW4uIERpZmZlcmVudCBmcm9tXG4gIC8vIGRsb2cvW1dPTEZTUEFDRTp4eHhdLCB3aGljaCBjb21lIGZyb20gdGhlIEJBQ0tFTkQgKE5vZGUpIHByb2Nlc3MsIG5vdCB0aGVcbiAgLy8gcmVuZGVyZXIuXG4gIC8vIEVsZWN0cm9uID49IDMzIHNlbmRzIE9ORSBldmVudCBvYmplY3QgKHtsZXZlbCwgbWVzc2FnZSwgbGluZU51bWJlciwgc291cmNlSWQsXG4gIC8vIGZyYW1lfSkgcmF0aGVyIHRoYW4gKGV2ZW50LCBsZXZlbCwgbWVzc2FnZSwgbGluZSwgc291cmNlSWQpLiBVbmRlciB0aGUgb2xkXG4gIC8vIHNpZ25hdHVyZSBgbWVzc2FnZWAgcmVjZWl2ZXMgdGhlIHdyb25nIHBvc2l0aW9uYWwgYXJndW1lbnQgYW5kIHdoYXQgZ2V0cyBwcmludGVkXG4gIC8vIGlzIHRoZSB3aG9sZSBnbG9iYWwgYGNvbnNvbGVgIG9iamVjdCwgb25jZSBQRVIgTElORSBvZiByZW5kZXJlciBsb2cuIE9ic2VydmVkIGluXG4gIC8vIHRoZSByZWFsIGFwcDogYSBzaW5nbGUgXCJbQ29tcG9zZXJdIHJlbmRlclwiIGxpbmUgZHJhZ2dlZCBhIDI1LXByb3BlcnR5IGNvbnNvbGVcbiAgLy8gZHVtcCBhbG9uZyB3aXRoIGl0LiBCb3RoIHNoYXBlcyBhcmUgc3VwcG9ydGVkIGhlcmUgc28gdGhpcyBpcyBub3QgdGllZCB0byBvbmVcbiAgLy8gRWxlY3Ryb24gdmVyc2lvbi5cbiAgY29uc3QgTEVWRUxTID0gW1wibG9nXCIsIFwid2FybmluZ1wiLCBcImVycm9yXCJdO1xuICB3aW4ud2ViQ29udGVudHMub24oXCJjb25zb2xlLW1lc3NhZ2VcIiwgKC4uLmE6IGFueVtdKSA9PiB7XG4gICAgY29uc3QgZXYgPVxuICAgICAgYVswXSAmJiB0eXBlb2YgYVswXSA9PT0gXCJvYmplY3RcIiAmJiBcIm1lc3NhZ2VcIiBpbiBhWzBdID8gYVswXSA6IG51bGw7XG4gICAgY29uc3QgbGV2ZWwgPSBldiA/IGV2LmxldmVsIDogYVsxXTtcbiAgICBjb25zdCBtZXNzYWdlID0gZXYgPyBldi5tZXNzYWdlIDogYVsyXTtcbiAgICBjb25zb2xlLmxvZyhcIltyZW5kZXJlcjpcIiArIChMRVZFTFNbbGV2ZWxdIHx8IGxldmVsKSArIFwiXVwiLCBtZXNzYWdlKTtcbiAgfSk7XG59XG5cbi8vIFx1MDBFMlx1MjAxRFx1MjBBQ1x1MDBFMlx1MjAxRFx1MjBBQyBJUEM6IHJlbmRlcmVyIFx1MDBFMlx1MjAyMFx1MjAxRCBOb2RlIGNvcmUsIG5vIEhUVFAgXHUwMEUyXHUyMDFEXHUyMEFDXHUwMEUyXHUyMDFEXHUyMEFDXG5sZXQgX2NvcmU6IGFueSA9IG51bGw7XG5mdW5jdGlvbiBjb3JlKCkge1xuICBpZiAoX2NvcmUpIHJldHVybiBfY29yZTtcbiAgX2NvcmUgPSByZXF1aXJlKHBhdGguam9pbih1bnBhY2tlZFJvb3QoKSwgXCJjb3JlLmpzXCIpKTsgLy8gc2luZ2xlIHNvdXJjZTsgcmVxdWlyaW5nIGRvZXMgTk9UIG9wZW4gYSBwb3J0XG4gIHJldHVybiBfY29yZTtcbn1cbmNvbnN0IF9zdHJlYW1zID0gbmV3IE1hcCgpOyAvLyBpZCAtPiB7IGNhbmNlbGxlZCwgcmVxLCBjaGFubmVsIH1cblxuLy8gXHUyNTAwXHUyNTAwIEhvdC1yZWxvYWQgaXMgREVGRVJSRUQgd2hpbGUgdGhlIGFnZW50IGlzIHdvcmtpbmcgXHUyNTAwXHUyNTAwXG4vL1xuLy8gV0hZIElUIEVYSVNUUy4gVGhlIFdPTEZTUEFDRSBhZ2VudCBlZGl0cyBpdHMgb3duIHNvdXJjZSwgYW5kIHRoZSB3YXRjaGVkXG4vLyBkaXJlY3RvcmllcyAocHVibGljLCBlbGVjdHJvbiwgYWdlbnQsIHNjcmlwdHMpIGFyZSBleGFjdGx5IHRoZSBvbmVzIGl0IGVkaXRzLiBTb1xuLy8gdGhlIGFnZW50IHRyaWdnZXJlZCBpdHMgT1dOIHJlbG9hZCwgbWlkLXJ1biwgd2l0aCBubyBndWFyZCBhdCBhbGwuIFRoZVxuLy8gY29uc2VxdWVuY2VzIGNoYWluZWQ6XG4vLyAgIC0gYW4gZWRpdCB1bmRlciBwdWJsaWMvKiogdGhhdCBpcyBub3QganMgLT4gdGhlIFVJIHJ1bnMgd2luZG93LmxvY2F0aW9uLnJlbG9hZCgpXG4vLyAgICAgKHB1YmxpYy9pbmRleC5odG1sKSwgYW5kIHRoZSB0aHJlYWRfaWQgbGl2aW5nIGluIFJlYWN0IHN0YXRlIGdvZXMgd2l0aCBpdDtcbi8vICAgLSB0aGUgbmV4dCByZXF1ZXN0IGlzIHNlbnQgV0lUSE9VVCBhIHRocmVhZF9pZCwgc28gc2VsZl9hZ2VudC50cyBtaW50cyBhIG5ld1xuLy8gICAgIHRocmVhZCwgTWVtb3J5U2F2ZXIgaGFzIG5vIGNoZWNrcG9pbnQgZm9yIGl0LCBhbmQgdGhlIGFnZW50IHN0YXJ0cyBmcm9tXG4vLyAgICAgc2NyYXRjaCBcdTIwMTQgcHJlY2lzZWx5IHRoZSBcInRoZSBhZ2VudCByZXBlYXRzIGl0cyB3b3JrXCIgc3ltcHRvbTtcbi8vICAgLSBhbiBlZGl0IHVuZGVyIGFnZW50LyoqIGRyb3BzIHJlcXVpcmUuY2FjaGUgYW5kIHJlYnVpbGRzIGNvcmUgaW4gdGhlIG1pZGRsZSBvZlxuLy8gICAgIHRoZSBydW4gdGhhdCBpcyB1c2luZyBpdC5cbi8vXG4vLyBUaGUgcmVsb2FkIGlzIG5vdCBDQU5DRUxMRUQsIG9ubHkgZGVmZXJyZWQgdW50aWwgdGhlIGxhc3QgcnVuIGZpbmlzaGVzIFx1MjAxNCBzbyBpdHNcbi8vIG9yaWdpbmFsIHB1cnBvc2UgKHRoZSBhZ2VudCBzZWVpbmcgaXRzIG93biBzb3VyY2UgY2hhbmdlKSBpcyBzdGlsbCBzZXJ2ZWQuXG5sZXQgX3JlbG9hZFRlcnR1bmRhOiBhbnkgPSBudWxsO1xuLy8gQW4gYWdlbnQgcnVuIG9sZGVyIHRoYW4gdGhpcyBpcyB0cmVhdGVkIGFzIE5PIExPTkdFUiBob2xkaW5nIHRoZSByZWxvYWQgYmFjay5cbi8vXG4vLyBXSFkgVEhFUkUgSVMgQSBMSU1JVCBBVCBBTEwuIFRoaXMgZ3VhcmQgZGVwZW5kcyBvbiBmaW5pc2goKSBhbHdheXMgYmVpbmcgY2FsbGVkLlxuLy8gTWlzcyBpdCBvbmNlIFx1MjAxNCBhbmQgaXQgaGFzIGJlZW4gbWlzc2VkOiBhIFNZTkNIUk9OT1VTIHRocm93IGZyb20gZm4oKSBzbGlwcGVkIHBhc3Rcbi8vIFByb21pc2UucmVzb2x2ZSBhbmQgZXNjYXBlZCB0aGUgaGFuZGxlciBcdTIwMTQgYW5kIHRoZSBzdHJlYW0gZW50cnkgaXMgbGVmdCBiZWhpbmRcbi8vIGZvcmV2ZXIsIF9hZ2VudFNpYnVrKCkgc3RheXMgdHJ1ZSwgYW5kIHRoZSBhcHBsaWNhdGlvbiBzdG9wcyB1cGRhdGluZyBpdHNlbGYgd2l0aFxuLy8gTk8gbWVzc2FnZSBhdCBhbGwuIFRoZSBvbmx5IHN5bXB0b20gaXMgXCJ0aGUgY2hhbmdlIGRvZXMgbm90IHNob3cgdXBcIiwgd2hpY2ggZG9lc1xuLy8gbm90IHBvaW50IGhlcmUgaW4gdGhlIHNsaWdodGVzdC5cbi8vXG4vLyBTbyB0aGUgZGVwZW5kZW5jeSBpcyB0aW1lLWJveGVkLiBBIHJlbG9hZCBmaXJpbmcgaW4gbWludXRlIDE1IG9mIGEgcnVuIGlzIGZhclxuLy8gbGVzcyBjb3N0bHkgdGhhbiBhIGhvdC1yZWxvYWQgdGhhdCBkaWVzIHNpbGVudGx5IGFuZCBpcyBvbmx5IG5vdGljZWQgYWZ0ZXIgYSBsb25nXG4vLyB3aGlsZSBzcGVudCB3b25kZXJpbmcgd2h5IHRoZSBjb2RlIHdpbGwgbm90IGNoYW5nZS5cbmNvbnN0IEFHRU5UX1NJQlVLX01BS1NfTVMgPSAxNSAqIDYwICogMTAwMDtcbmZ1bmN0aW9uIF9hZ2VudFNpYnVrKCkge1xuICBjb25zdCBraW5pID0gRGF0ZS5ub3coKTtcbiAgZm9yIChjb25zdCBzIG9mIF9zdHJlYW1zLnZhbHVlcygpKSB7XG4gICAgaWYgKHMuY2hhbm5lbCAhPT0gXCJzZWxmLWFnZW50XCIpIGNvbnRpbnVlO1xuICAgIGlmIChraW5pIC0gKHMubXVsYWkgfHwgMCkgPCBBR0VOVF9TSUJVS19NQUtTX01TKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5mdW5jdGlvbiBfdHVuZGFTZWxhZ2lTaWJ1ayhsYWJlbDogYW55LCBmbjogYW55KSB7XG4gIGlmIChfYWdlbnRTaWJ1aygpKSB7XG4gICAgLy8gT25seSB0aGUgTEFTVCBvbmUgaXMga2VwdDogc3RhY2tpbmcgcmVsb2FkcyBhY2hpZXZlcyBub3RoaW5nLCBhbGwgdGhhdCBpc1xuICAgIC8vIG5lZWRlZCBpcyBhIHNpbmdsZSByZWxvYWQgb25jZSBldmVyeXRoaW5nIGhhcyBzZXR0bGVkLlxuICAgIF9yZWxvYWRUZXJ0dW5kYSA9IHsgbGFiZWwsIGZuIH07XG4gICAgY29uc29sZS5sb2coXCJbaG90LXJlbG9hZF0gZGl0dW5kYSwgYWdlbnQgc2VkYW5nIGJlcmphbGFuOlwiLCBsYWJlbCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGZuKCk7XG59XG5mdW5jdGlvbiBfbGVwYXNSZWxvYWRUZXJ0dW5kYSgpIHtcbiAgaWYgKCFfcmVsb2FkVGVydHVuZGEgfHwgX2FnZW50U2lidWsoKSkgcmV0dXJuO1xuICBjb25zdCB7IGxhYmVsLCBmbiB9ID0gX3JlbG9hZFRlcnR1bmRhO1xuICBfcmVsb2FkVGVydHVuZGEgPSBudWxsO1xuICBjb25zb2xlLmxvZyhcIltob3QtcmVsb2FkXSBhZ2VudCBzZWxlc2FpLCBtZW5qYWxhbmthbiB5YW5nIGRpdHVuZGE6XCIsIGxhYmVsKTtcbiAgdHJ5IHtcbiAgICBmbigpO1xuICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJbaG90LXJlbG9hZF0gZ2FnYWwgbWVuamFsYW5rYW4geWFuZyBkaXR1bmRhOlwiLCBlcnIubWVzc2FnZSk7XG4gIH1cbn1cblxuLy8gUnVuIGEgbm9uLXN0cmVhbWluZyBIVFRQIGVuZHBvaW50IElOLVBST0NFU1MgdmlhIG1vY2sgcmVxL3JlcyBhZ2FpbnN0IGNvcmUnc1xuLy8gcmVxdWVzdCBoYW5kbGVyIFx1MDBFMlx1MjBBQ1x1MjAxRCByZXVzZXMgZXZlcnkgZXhpc3RpbmcgSlNPTiBoYW5kbGVyIHdpdGhvdXQgZXh0cmFjdGluZyB0aGVtLFxuLy8gc28gdGhlIHJlbmRlcmVyIGNhbiBkcm9wIGZldGNoKCkgaW4gZmF2b3VyIG9mIElQQy4gKFN0cmVhbWluZyBlbmRwb2ludHMgdXNlXG4vLyBXT0xGU1BBQ0U6c3RyZWFtIGluc3RlYWQuKVxuY29uc3QgeyBQYXNzVGhyb3VnaCwgV3JpdGFibGUgfSA9IHJlcXVpcmUoXCJzdHJlYW1cIik7XG4vLyBNYXJrcyBcInRoZSByZXNwb25zZSBpcyBhbHJlYWR5IGNsb3NlZFwiIG9uIHRoZSBGQUtFIHJlcyBvYmplY3QsIGluIGEgd2F5IHRoZVxuLy8gaGFuZGxlcnMgYWN0dWFsbHkgcmVhZC5cbi8vXG4vLyBXSFkgYHJlcy53cml0YWJsZUVuZGVkID0gdHJ1ZWAgSVMgTk9UIEVOT1VHSC4gYHdyaXRhYmxlRW5kZWRgIGFuZFxuLy8gYHdyaXRhYmxlRmluaXNoZWRgIGFyZSBSRUFELU9OTFkgQUNDRVNTT1JTIG9uIHRoZSBXcml0YWJsZSBwcm90b3R5cGUgXHUyMDE0IHRoZXkgaGF2ZVxuLy8gbm8gc2V0dGVyLiBBc3NpZ25pbmcgdG8gdGhlbSBmcm9tIG5vbi1zdHJpY3QgY29kZSBkb2VzIE5PVCB0aHJvdyBhbmQgZG9lcyBOT1Rcbi8vIGNoYW5nZSBhbnl0aGluZzsgaXQgaXMgc2lsZW50bHkgaWdub3JlZC4gVmVyaWZpZWQgZGlyZWN0bHk6XG4vL1xuLy8gICBjb25zdCByZXMgPSBuZXcgV3JpdGFibGUoKTtcbi8vICAgcmVzLndyaXRhYmxlRW5kZWQgPSB0cnVlO1xuLy8gICByZXMud3JpdGFibGVFbmRlZCAgICAgICAgICAgIC8vIC0+IGZhbHNlXG4vLyAgIGhhc093blByb3BlcnR5KCd3cml0YWJsZUVuZGVkJykgLT4gZmFsc2Vcbi8vXG4vLyBUaGUgY29uc2VxdWVuY2Ugd2FzIHRoYXQgYWxsIDE3IGd1YXJkcyBpbiBzZXJ2ZXIuY2pzIHdlcmUgREVBRCBvbiB0aGUgZGVza3RvcFxuLy8gcGF0aCwgYmVjYXVzZSByZXMgaGVyZSBpcyBub3QgYSByZWFsIFNlcnZlclJlc3BvbnNlIGJ1dCBhIGJhcmUgV3JpdGFibGUgd2hvc2Vcbi8vIGVuZCgpIGlzIG92ZXJyaWRkZW4gXHUyMDE0IHNvIHRoZSByZWFsIHN0cmVhbSBtYWNoaW5lcnkgbmV2ZXIgcnVucyBhbmQgdGhlIGRlZmF1bHRcbi8vIHZhbHVlIHN0YXlzIGBmYWxzZWAgZm9yZXZlci4gV2hhdCBkaWVkIHdpdGggaXQ6XG4vL1xuLy8gICBpZiAoIXJlcy53cml0YWJsZUVuZGVkKSByZXMud3JpdGUoLi4uKSAgIC0+IHdyaXRlcyBBRlRFUiB0aGUgcmVzcG9uc2UgY2xvc2VkXG4vLyAgIGlmICghcmVzLndyaXRhYmxlRW5kZWQpIHJlcy5lbmQoKSAgICAgICAgLT4gY2xvc2VzIHR3aWNlXG4vLyAgIGlmIChjYW5jZWxsZWQgfHwgcmVzLndyaXRhYmxlRW5kZWQpIC4uLiAgLT4gdGhlIGNhbmNlbCBjaGVjayBpcyBuZXZlciB0cnVlXG4vL1xuLy8gVGhhdCBsYXN0IG9uZSBpcyB0aGUgb25lIHRoYXQgc2hvd3M6IGl0IGlzIHRoZSBvbmx5IGJyYWtlIHRoYXQgc3RvcHMgdGhlIHdvcmtcbi8vIGFmdGVyIHRoZSB1c2VyIGNhbmNlbHMuXG5mdW5jdGlvbiBfcGFzYW5nVGFuZGFTZWxlc2FpKHJlczogYW55KSB7XG4gIHJlcy5fc2VsZXNhaSA9IGZhbHNlO1xuICBjb25zdCBiYWNhID0gKCkgPT4gcmVzLl9zZWxlc2FpO1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkocmVzLCBcIndyaXRhYmxlRW5kZWRcIiwge1xuICAgIGdldDogYmFjYSxcbiAgICBjb25maWd1cmFibGU6IHRydWUsXG4gIH0pO1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkocmVzLCBcIndyaXRhYmxlRmluaXNoZWRcIiwge1xuICAgIGdldDogYmFjYSxcbiAgICBjb25maWd1cmFibGU6IHRydWUsXG4gIH0pO1xufVxuXG4vLyBcdTI1MDBcdTI1MDAgQSByZWFsIGJyb3dzZXIgaW5zaWRlIHRoZSBcIldlYiBEZXYgTGl2ZSBCcm93c2VyXCIgcGFuZWwgXHUyNTAwXHUyNTAwXG4vL1xuLy8gV0hZIE5PVCA8aWZyYW1lPi4gVGhpcyByZW5kZXJlciBDQU5OT1QgbG9hZCBhbiBleHRlcm5hbCBzaXRlIHRocm91Z2ggYSBzdWJmcmFtZVxuLy8gYXQgYWxsLiBNZWFzdXJlZCB0byB0aGUgZW5kOiB0aGUgc3ViRnJhbWUgcmVxdWVzdCBnb2VzIG91dCBhbmQgdGhlblxuLy8gbmV0OjpFUlJfQUJPUlRFRCBiZWZvcmUgYSBzaW5nbGUgcmVzcG9uc2UgaGVhZGVyIGNvbWVzIGJhY2suIFJ1bGVkIG91dCBvbmUgYnkgb25lXG4vLyBhcyB0aGUgY2F1c2UgXHUyMDE0IHRoZSBpZnJhbWUgc2FuZGJveCBhdHRyaWJ1dGUsIHRoZSBwcm9kdWN0aW9uIENTUCA8bWV0YT4sIHRoZVxuLy8gc2l0ZSdzIFgtRnJhbWUtT3B0aW9ucywgdGhlIEVsZWN0cm9uIFVzZXItQWdlbnQsIGFuZCB0aGUgbmV0d29yayAobmV0LmZldGNoIGZyb21cbi8vIHRoZSBtYWluIHByb2Nlc3MgcmV0dXJucyAyMDAsIDQ3MyBLQiBmcm9tIEJpbmcpLiBXaGF0IHNldHRsZWQgaXQgd2FzIGEgdXNlciB0ZXN0OlxuLy8gd2lraXBlZGlhLm9yZyB3YXMgYmxhbmsgdG9vLCBhbmQgV2lraXBlZGlhIGlzIGRlbW9uc3RyYWJseSBmcmFtYWJsZS5cbi8vXG4vLyBXSFkgTk9UIDx3ZWJ2aWV3Pi4gVHJpZWQsIGFuZCBFbGVjdHJvbiBDUkFTSEVTOlxuLy8gICBGQVRBTDpjaGVjay5jYygzNjEpIENoZWNrIGZhaWxlZDogZmFsc2UuIE5PVFJFQUNIRURcbi8vIFRoYXQgdGFnIGlzIGEgcGF0aCBFbGVjdHJvbiBkaXNjb3VyYWdlcyBhbmQgbWFpbnRhaW5zIG9ubHkgbG9vc2VseS5cbi8vXG4vLyBXZWJDb250ZW50c1ZpZXcgaXMgdGhlIHN1cHBvcnRlZCB3YXk6IGl0IGlzIGEgZnVsbCBXZWJDb250ZW50cyBcdTIwMTQgZXhhY3RseSBsaWtlIGFcbi8vIGJyb3dzZXIgdGFiIFx1MjAxNCBtb3VudGVkIGFzIGEgbGF5ZXIgb24gdG9wIG9mIHRoZSB3aW5kb3cuIE5vIGZyYW1lIHJlc3RyaWN0aW9uXG4vLyBhcHBsaWVzIHRvIGl0LlxuLy9cbi8vIFRIRSBQUklDRSBQQUlELCBuYW1lZCBoZXJlIHNvIGl0IGRvZXMgbm90IHN1cnByaXNlIGFueW9uZTogaXQgRkxPQVRTIGFib3ZlIHRoZVxuLy8gRE9NIHJhdGhlciB0aGFuIGZsb3dpbmcgaW5zaWRlIGl0LiBTbyBpdHMgcG9zaXRpb24gaGFzIHRvIGJlIGZlZCBpbiBmcm9tIHRoZVxuLy8gcmVuZGVyZXIgKHRoZSBwYW5lbCBib3VuZHMpLCBhbmQgaXQgTVVTVCBiZSBoaWRkZW4gd2hlbiB0aGUgcGFuZWwgY2xvc2VzIG9yIGFcbi8vIGRpYWxvZyBjb3ZlcnMgaXQgXHUyMDE0IG90aGVyd2lzZSBpdCBzaXRzIG9uIHRvcCBvZiB0aGUgVUkuIFRoYXQgaXMgd2h5IHRoZSByZW5kZXJlclxuLy8gY2FsbHMgYHNlbWJ1bnlpYCBleHBsaWNpdGx5IGluc3RlYWQgb2YgcmVseWluZyBvbiBDU1MuXG5sZXQgX2JyOiBhbnkgPSBudWxsOyAvLyB7IHRhbXBpbDogV2ViQ29udGVudHNWaWV3LCB3aW4gfVxuZnVuY3Rpb24gX2JyV2luKCkge1xuICByZXR1cm4gQnJvd3NlcldpbmRvdy5nZXRBbGxXaW5kb3dzKClbMF0gfHwgbnVsbDtcbn1cbmZ1bmN0aW9uIF9ickJ1YXQoKSB7XG4gIGlmIChfYnIpIHJldHVybiBfYnI7XG4gIGNvbnN0IHdpbiA9IF9icldpbigpO1xuICBpZiAoIXdpbikgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHsgV2ViQ29udGVudHNWaWV3IH0gPSByZXF1aXJlKFwiZWxlY3Ryb25cIik7XG4gIC8vIFx1MjUwMFx1MjUwMCBzYW5kYm94OiBmYWxzZSwgYW5kIHRoaXMgaXMgYSBkZWNpc2lvbiB0aGF0IGhhcyB0byBiZSBleHBsYWluZWQgXHUyNTAwXHUyNTAwXG4gIC8vXG4gIC8vIE9uIHRoaXMgbWFjaGluZSBDaHJvbWl1bSBDQU5OT1Qgc3Bhd24gYSBzYW5kYm94ZWQgcmVuZGVyZXIgcHJvY2Vzcy4gVGhhdCBpcyBub3RcbiAgLy8gYSBndWVzczsgaXQgd2FzIG1lYXN1cmVkIGxheWVyIGJ5IGxheWVyOlxuICAvL1xuICAvLyAgIG5ldC5mZXRjaCBmcm9tIHRoZSBtYWluIHByb2Nlc3MgLT4gMjAwICh0aGUgbmV0d29yayBpcyBoZWFsdGh5KVxuICAvLyAgIHJlc29sdmVQcm94eSAgICAgICAgICAgICAgICAgICAgLT4gRElSRUNUIChubyBwcm94eSlcbiAgLy8gICBuYXZpZ2F0aW9uIHJlcXVlc3QgICAgICAgICAgICAgIC0+IFNFTlQsIGFuZCBldmVuIGZvbGxvd3MgdGhlIHJlZGlyZWN0XG4gIC8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aWtpcGVkaWEub3JnIC0+IHd3dy53aWtpcGVkaWEub3JnXG4gIC8vICAgd2ViUmVxdWVzdC5vbkVycm9yT2NjdXJyZWQgICAgICAtPiBORVZFUiBmaXJlc1xuICAvLyAgIGxvYWRVUkwgICAgICAgICAgICAgICAgICAgICAgICAgLT4gRVJSX0ZBSUxFRCAoLTIpXG4gIC8vXG4gIC8vIFRoZSBuZXR3b3JrIHN1Y2NlZWRzOyB3aGF0IGZhaWxzIGlzIFBST0NFU1MgQ1JFQVRJT04gdG8gaG9sZCB0aGUgcGFnZS5cbiAgLy8gQ3Jvc3Mtc2l0ZSBuYXZpZ2F0aW9uIGRlbWFuZHMgYSBuZXcgcmVuZGVyZXIsIGFuZCB0aGUgbmV3IHJlbmRlcmVyIGlzIG5ldmVyXG4gIC8vIGJvcm4uIFN5bXB0b21zIGZyb20gdGhlIHNhbWUgZmFtaWx5IGhhdmUgYXBwZWFyZWQgdHdpY2Ugb24gdGhpcyBtYWNoaW5lOiB0aGVcbiAgLy8gR1BVIHByb2Nlc3MgZGllZCB3aXRoIFNUQVRVU19ETExfTk9UX0ZPVU5EIHVudGlsIC0tZGlzYWJsZS1ncHUtc2FuZGJveCB3YXNcbiAgLy8gYWRkZWQsIGFuZCA8d2Vidmlldz4gY3Jhc2hlZCBFbGVjdHJvbiB3aXRoIE5PVFJFQUNIRUQuXG4gIC8vXG4gIC8vIFRocmVlIG9wdGlvbnMgd2VyZSB0ZXN0ZWQ7IG9ubHkgdGhlIE5BUlJPV0VTVCBvbmUgaXMgdXNlZDpcbiAgLy8gICAtLW5vLXNhbmRib3ggKHRoZSB3aG9sZSBhcHApICAgICAgLT4gd29ya3MsIGJ1dCBnb2VzIGZhciBiZXlvbmQgd2hhdCBpcyBuZWVkZWRcbiAgLy8gICBzaXRlIGlzb2xhdGlvbiBkaXNhYmxlZCAgICAgICAgICAgLT4gU1RJTEwgRkFJTFNcbiAgLy8gICBzYW5kYm94OiBmYWxzZSBvbiB0aGlzIHZpZXcgYWxvbmUgLT4gd29ya3MsIDIwMjIgY2hhcmFjdGVycyByZW5kZXJlZFxuICAvL1xuICAvLyBXaGF0IGlzIE5PVCByZWxheGVkLCBhbmQgdGhpcyBpcyB3aGF0IGhvbGRzIHRoZSByaXNrIGRvd246IG5vZGVJbnRlZ3JhdGlvbiBzdGF5c1xuICAvLyBvZmYgYW5kIGNvbnRleHRJc29sYXRpb24gc3RheXMgb24sIHNvIGEgZm9yZWlnbiBwYWdlIGhhcyBubyBwYXRoIHRvIE5vZGUgb3IgdG9cbiAgLy8gdGhlIHByZWxvYWQgY29udGV4dC4gQWxsIHRoYXQgaXMgbG9zdCBpcyB0aGUgT1MgY29uZmluZW1lbnQgXHUyMDE0IGFuZCBvbiB0aGlzXG4gIC8vIG1hY2hpbmUgdGhhdCBjb25maW5lbWVudCB3YXMgbmV2ZXIgdXNhYmxlIGFueXdheTsgdGhlIGNob2ljZSBpcyBub3QgXCJzYW5kYm94ZWRcbiAgLy8gdnMgbm90XCIsIGl0IGlzIFwicnVucyB2cyBkb2VzIG5vdCBydW4gYXQgYWxsXCIuXG4gIC8vXG4gIC8vIFJlc3RvcmFibGUgd2l0aCBXT0xGU1BBQ0VfQlJPV1NFUl9TQU5EQk9YPTEgb24gYSBoZWFsdGh5IG1hY2hpbmUuXG4gIGNvbnN0IHRhbXBpbCA9IG5ldyBXZWJDb250ZW50c1ZpZXcoe1xuICAgIHdlYlByZWZlcmVuY2VzOiB7XG4gICAgICBjb250ZXh0SXNvbGF0aW9uOiB0cnVlLFxuICAgICAgbm9kZUludGVncmF0aW9uOiBmYWxzZSxcbiAgICAgIHNhbmRib3g6IHByb2Nlc3MuZW52LldPTEZTUEFDRV9CUk9XU0VSX1NBTkRCT1ggPT09IFwiMVwiLFxuICAgICAgd2ViU2VjdXJpdHk6IHRydWUsXG4gICAgfSxcbiAgfSk7XG4gIGNvbnN0IHdjID0gdGFtcGlsLndlYkNvbnRlbnRzO1xuICAvLyBFdmVyeSBzdGF0ZSBjaGFuZ2UgaXMgc2VudCBiYWNrIHRvIHRoZSByZW5kZXJlciwgc28gdGhlIGFkZHJlc3MgYmFyIGFuZCB0aGVcbiAgLy8gZXJyb3IgbWVzc2FnZSBpbiB0aGUgcGFuZWwgcmVhbGx5IGRvIHJlZmxlY3Qgd2hhdCBoYXBwZW5lZC5cbiAgY29uc3Qga2lyaW0gPSAodDogYW55LCBkOiBhbnkpID0+IHtcbiAgICB0cnkge1xuICAgICAgd2luLndlYkNvbnRlbnRzLnNlbmQoXCJXT0xGU1BBQ0U6YnJvd3NlclwiLCB7IHQsIC4uLmQgfSk7XG4gICAgfSBjYXRjaCAoXzogYW55KSB7fVxuICB9O1xuICB3Yy5vbihcImRpZC1zdGFydC1sb2FkaW5nXCIsICgpID0+IGtpcmltKFwibXVhdFwiLCB7fSkpO1xuICB3Yy5vbihcImRpZC1zdG9wLWxvYWRpbmdcIiwgKCkgPT5cbiAgICBraXJpbShcInNlbGVzYWlcIiwgeyB1cmw6IHdjLmdldFVSTCgpLCBqdWR1bDogd2MuZ2V0VGl0bGUoKSB9KSxcbiAgKTtcbiAgd2Mub24oXG4gICAgXCJkaWQtZmFpbC1sb2FkXCIsXG4gICAgKF9lOiBhbnksIGtvZGU6IGFueSwgZGVzYzogYW55LCB1cmw6IGFueSwgdXRhbWE6IGFueSkgPT4ge1xuICAgICAgaWYgKCF1dGFtYSkgcmV0dXJuO1xuICAgICAga2lyaW0oXCJnYWdhbFwiLCB7IGtvZGUsIGRlc2MsIHVybCB9KTtcbiAgICB9LFxuICApO1xuICB3Yy5vbihcImRpZC1uYXZpZ2F0ZVwiLCAoX2U6IGFueSwgdXJsOiBhbnkpID0+IGtpcmltKFwicGluZGFoXCIsIHsgdXJsIH0pKTtcbiAgd2Mub24oXCJkaWQtbmF2aWdhdGUtaW4tcGFnZVwiLCAoX2U6IGFueSwgdXJsOiBhbnkpID0+XG4gICAga2lyaW0oXCJwaW5kYWhcIiwgeyB1cmwgfSksXG4gICk7XG4gIC8vIEEgbGluayB0aGF0IG9wZW5zIGEgbmV3IHdpbmRvdyBvcGVucyBJTiBUSElTIFBBTkVMIHJhdGhlciB0aGFuIGluIHRoZSBPU1xuICAvLyBicm93c2VyIFx1MjAxNCB0aGF0IGlzIHdoYXQgYW55b25lIGV4cGVjdHMgZnJvbSBhIGJyb3dzZXIgaW5zaWRlIGFuIGFwcGxpY2F0aW9uLlxuICB3Yy5zZXRXaW5kb3dPcGVuSGFuZGxlcigoeyB1cmwgfTogYW55KSA9PiB7XG4gICAgd2MubG9hZFVSTCh1cmwpO1xuICAgIHJldHVybiB7IGFjdGlvbjogXCJkZW55XCIgfTtcbiAgfSk7XG4gIF9iciA9IHsgdGFtcGlsLCB3aW4gfTtcbiAgcmV0dXJuIF9icjtcbn1cbi8vIEVsZWN0cm9uIGlzIFRXTyBlbmdpbmVzOiB0aGUgcmVuZGVyZXIgKHdlYikgYW5kIG1haW4gKG5vZGUpLiBXaGVuIHRoZSBwYW5lbCBpc1xuLy8gYmxhbmsgdGhlIGZpcnN0IHF1ZXN0aW9uIGlzIGFsd2F5cyBcIndoaWNoIG9uZSBmYWlsZWRcIiBcdTIwMTQgYW5kIHdpdGggbm8gcmVjb3JkIGZyb21cbi8vIHRoZSBtYWluIHNpZGUsIGFsbCB0aGF0IGlzIHZpc2libGUgaXMgd2hpdGUsIHdoaWNoIGNvdWxkIG1lYW4gYW55dGhpbmc6IHRoZSB2aWV3XG4vLyB3YXMgbmV2ZXIgY3JlYXRlZCwgd2FzIGNyZWF0ZWQgYnV0IG5vdCBtb3VudGVkLCB3YXMgbW91bnRlZCBidXQgd2l0aCB6ZXJvIGJvdW5kcyxcbi8vIHdhcyBtb3VudGVkIGNvcnJlY3RseSBidXQgdGhlIHBhZ2UgZGlkIG5vdCBsb2FkLCBvciBsb2FkZWQgYnV0IGlzIGNvdmVyZWQgYnlcbi8vIGFub3RoZXIgbGF5ZXIuXG4vL1xuLy8gVGhlIGZpcnN0IHZlcnNpb24gb2YgdGhpcyBmdW5jdGlvbiBTV0FMTE9XRUQgdGhlIGFuc3dlcjogYWRkQ2hpbGRWaWV3IGFuZFxuLy8gcmVtb3ZlQ2hpbGRWaWV3IHdlcmUgd3JhcHBlZCBpbiBgdHJ5IHsgfSBjYXRjaCAoXykge31gLiBJZiBtb3VudGluZyB0aGUgbGF5ZXIgd2FzXG4vLyBpdHNlbGYgd2hhdCBmYWlsZWQsIHRoZSBlcnJvciB2YW5pc2hlZCB3aXRob3V0IGEgdHJhY2UgYW5kIHRoZSBzeW1wdG9tIHN0YXllZFxuLy8gXCJibGFua1wiLlxuLy9cbi8vIGNvbnNvbGUubG9nIGluIHRoZSBtYWluIHByb2Nlc3MgaXMgZm9yd2FyZGVkIHRvIFdPTEZTUEFDRS1kZWJ1Zy5sb2csIHNvIHRoaXNcbi8vIHJlY29yZCBjYW4gYmUgcmVhZCBhZnRlciB0aGUgZmFjdCBcdTIwMTQgbm8gZ3Vlc3NpbmcgZnJvbSB0aGUgc2NyZWVuLlxuZnVuY3Rpb24gX2JyTG9nKHBlc2FuOiBhbnksIGRhdGE/OiBhbnkpIHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIFwiW2Jyb3dzZXJdIFwiICsgcGVzYW4gKyAoZGF0YSA/IFwiIFwiICsgSlNPTi5zdHJpbmdpZnkoZGF0YSkgOiBcIlwiKSxcbiAgICApO1xuICB9IGNhdGNoIChfOiBhbnkpIHt9XG59XG5mdW5jdGlvbiBfYnJLZWFkYWFuKCkge1xuICBpZiAoIV9icikgcmV0dXJuIHsgYWRhOiBmYWxzZSB9O1xuICBjb25zdCB3YyA9IF9ici50YW1waWwud2ViQ29udGVudHM7XG4gIGxldCBhbmFrID0gLTE7XG4gIHRyeSB7XG4gICAgYW5hayA9IF9ici53aW4uY29udGVudFZpZXcuY2hpbGRyZW4ubGVuZ3RoO1xuICB9IGNhdGNoIChfOiBhbnkpIHt9XG4gIGxldCBiID0gbnVsbDtcbiAgdHJ5IHtcbiAgICBiID0gX2JyLnRhbXBpbC5nZXRCb3VuZHMoKTtcbiAgfSBjYXRjaCAoXzogYW55KSB7fVxuICByZXR1cm4ge1xuICAgIGFkYTogdHJ1ZSxcbiAgICB1cmw6IHdjLmdldFVSTCgpLFxuICAgIGp1ZHVsOiB3Yy5nZXRUaXRsZSgpLFxuICAgIG1lbXVhdDogd2MuaXNMb2FkaW5nKCksXG4gICAgcnVzYWs6IHdjLmlzQ3Jhc2hlZCgpLFxuICAgIGJvdW5kczogYixcbiAgICBhbmFrRGlKZW5kZWxhOiBhbmFrLFxuICB9O1xufVxuZnVuY3Rpb24gYnJvd3NlckFrc2kocDogYW55KSB7XG4gIGNvbnN0IGFrc2kgPSAocCAmJiBwLmFrc2kpIHx8IFwiXCI7XG4gIGlmIChha3NpID09PSBcImRpYWdub3NhXCIpIHtcbiAgICBjb25zdCBrID0gX2JyS2VhZGFhbigpO1xuICAgIF9ickxvZyhcImRpYWdub3NhXCIsIGspO1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCAuLi5rIH07XG4gIH1cbiAgaWYgKGFrc2kgPT09IFwic2VtYnVueWlcIikge1xuICAgIGlmIChfYnIpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIF9ici53aW4uY29udGVudFZpZXcucmVtb3ZlQ2hpbGRWaWV3KF9ici50YW1waWwpO1xuICAgICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICAgIF9ickxvZyhcInJlbW92ZUNoaWxkVmlldyBHQUdBTFwiLCB7IHBlc2FuOiBlLm1lc3NhZ2UgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gIH1cbiAgaWYgKGFrc2kgPT09IFwiYnVhbmdcIikge1xuICAgIGlmIChfYnIpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIF9ici53aW4uY29udGVudFZpZXcucmVtb3ZlQ2hpbGRWaWV3KF9ici50YW1waWwpO1xuICAgICAgICBfYnIudGFtcGlsLndlYkNvbnRlbnRzLmNsb3NlKCk7XG4gICAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgICAgX2JyTG9nKFwiYnVhbmcgR0FHQUxcIiwgeyBwZXNhbjogZS5tZXNzYWdlIH0pO1xuICAgICAgfVxuICAgICAgX2JyID0gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgfVxuICBsZXQgYjtcbiAgdHJ5IHtcbiAgICBiID0gX2JyQnVhdCgpO1xuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBfYnJMb2coXCJfYnJCdWF0IE1FTEVNUEFSXCIsIHsgcGVzYW46IGUubWVzc2FnZSB9KTtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcImJ1YXQgdmlldzogXCIgKyBlLm1lc3NhZ2UgfTtcbiAgfVxuICBpZiAoIWIpIHtcbiAgICBfYnJMb2coXCJfYnJCdWF0IG1lbmdlbWJhbGlrYW4gbnVsbCBcdTIwMTQgdGFrIGFkYSBqZW5kZWxhXCIpO1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwidGFrIGFkYSBqZW5kZWxhXCIgfTtcbiAgfVxuXG4gIC8vIFpFUk8gYm91bmRzIGlzIG9uZSBvZiB0aGUgZWFzaWVzdCBjYXVzZXMgb2YgXCJibGFua1wiIHRvIG1pc3M6IHRoZSB2aWV3IGV4aXN0cyxcbiAgLy8gaXMgbW91bnRlZCwgYW5kIGl0cyBwYWdlIGxvYWRlZCBcdTIwMTQgaXQgaXMganVzdCAweDAuIFRoYXQgaXMgd2h5IHRoZSB2YWx1ZXMgdGhhdFxuICAvLyBhcnJpdmUgYXJlIGxvZ2dlZCByYXRoZXIgdGhhbiBtZXJlbHkgdXNlZC5cbiAgaWYgKHAgJiYgcC5ib3VuZHMpIHtcbiAgICBjb25zdCByID0gcC5ib3VuZHM7XG4gICAgY29uc3Qga290YWsgPSB7XG4gICAgICB4OiBNYXRoLnJvdW5kKHIueCksXG4gICAgICB5OiBNYXRoLnJvdW5kKHIueSksXG4gICAgICB3aWR0aDogTWF0aC5tYXgoMCwgTWF0aC5yb3VuZChyLndpZHRoKSksXG4gICAgICBoZWlnaHQ6IE1hdGgubWF4KDAsIE1hdGgucm91bmQoci5oZWlnaHQpKSxcbiAgICB9O1xuICAgIGlmICgha290YWsud2lkdGggfHwgIWtvdGFrLmhlaWdodClcbiAgICAgIF9ickxvZyhcImJvdW5kcyBOT0wgZGFyaSByZW5kZXJlclwiLCBrb3Rhayk7XG4gICAgdHJ5IHtcbiAgICAgIGIudGFtcGlsLnNldEJvdW5kcyhrb3Rhayk7XG4gICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICBfYnJMb2coXCJzZXRCb3VuZHMgR0FHQUxcIiwgeyBrb3RhaywgcGVzYW46IGUubWVzc2FnZSB9KTtcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwic2V0Qm91bmRzOiBcIiArIGUubWVzc2FnZSB9O1xuICAgIH1cbiAgfVxuXG4gIGlmIChha3NpID09PSBcInRhbXBpbFwiIHx8IGFrc2kgPT09IFwiYnVrYVwiKSB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIE1vdW50ZWQgb25seSBpZiBpdCBpcyBOT1QgYWxyZWFkeSBtb3VudGVkLiBDYWxsaW5nIHRoaXMgb24gZXZlcnkgaGVhcnRiZWF0XG4gICAgICAvLyBtb3ZlcyB0aGUgdmlldyB0byB0aGUgdG9wIG9mIHRoZSBvcmRlciBvdmVyIGFuZCBvdmVyIFx1MjAxNCB3YXN0ZWQgd29yayB0aGF0IGNhblxuICAgICAgLy8gYWxzbyBkaXN0dXJiIGhvdyB0aGUgb3RoZXIgbGF5ZXJzIGFyZSBzdGFja2VkLlxuICAgICAgY29uc3QgYW5hayA9IGIud2luLmNvbnRlbnRWaWV3LmNoaWxkcmVuIHx8IFtdO1xuICAgICAgaWYgKCFhbmFrLmluY2x1ZGVzKGIudGFtcGlsKSkge1xuICAgICAgICBiLndpbi5jb250ZW50Vmlldy5hZGRDaGlsZFZpZXcoYi50YW1waWwpO1xuICAgICAgICBfYnJMb2coXCJ2aWV3IGRpcGFzYW5nXCIsIHtcbiAgICAgICAgICBhbmFrU2VrYXJhbmc6IGIud2luLmNvbnRlbnRWaWV3LmNoaWxkcmVuLmxlbmd0aCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICAvLyBUaGlzIHVzZWQgdG8gYmUgc3dhbGxvd2VkIGJ5IGBjYXRjaCAoXykge31gIFx1MjAxNCBpZiBtb3VudGluZyB0aGUgbGF5ZXIgd2FzIHRoZVxuICAgICAgLy8gdGhpbmcgdGhhdCBmYWlsZWQsIHRoZSBzeW1wdG9tIHdhcyBcImJsYW5rXCIgd2l0aCBub3Qgb25lIHRyYWNlIGJlaGluZCBpdC5cbiAgICAgIF9ickxvZyhcImFkZENoaWxkVmlldyBHQUdBTFwiLCB7IHBlc2FuOiBlLm1lc3NhZ2UgfSk7XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcImFkZENoaWxkVmlldzogXCIgKyBlLm1lc3NhZ2UgfTtcbiAgICB9XG4gIH1cblxuICB0cnkge1xuICAgIGlmIChha3NpID09PSBcImJ1a2FcIiAmJiBwLnVybCkge1xuICAgICAgX2JyTG9nKFwibG9hZFVSTFwiLCB7IHVybDogU3RyaW5nKHAudXJsKS5zbGljZSgwLCA4MCkgfSk7XG4gICAgICBiLnRhbXBpbC53ZWJDb250ZW50cy5sb2FkVVJMKHAudXJsKS5jYXRjaCgoZTogYW55KSA9PiB7XG4gICAgICAgIF9ickxvZyhcImxvYWRVUkwgRElUT0xBS1wiLCB7IHBlc2FuOiBlLm1lc3NhZ2UgfSk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgaWYgKGFrc2kgPT09IFwibXVhdC11bGFuZ1wiKSBiLnRhbXBpbC53ZWJDb250ZW50cy5yZWxvYWQoKTtcbiAgICBpZiAoYWtzaSA9PT0gXCJtdW5kdXJcIiAmJiBiLnRhbXBpbC53ZWJDb250ZW50cy5uYXZpZ2F0aW9uSGlzdG9yeS5jYW5Hb0JhY2soKSlcbiAgICAgIGIudGFtcGlsLndlYkNvbnRlbnRzLm5hdmlnYXRpb25IaXN0b3J5LmdvQmFjaygpO1xuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBfYnJMb2coXCJuYXZpZ2FzaSBHQUdBTFwiLCB7IGFrc2ksIHBlc2FuOiBlLm1lc3NhZ2UgfSk7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJuYXZpZ2FzaTogXCIgKyBlLm1lc3NhZ2UgfTtcbiAgfVxuXG4gIGlmIChha3NpID09PSBcImJ1a2FcIikgX2JyTG9nKFwic2VzdWRhaCBidWthXCIsIF9icktlYWRhYW4oKSk7XG4gIHJldHVybiB7IG9rOiB0cnVlLCAuLi5fYnJLZWFkYWFuKCkgfTtcbn1cblxuZnVuY3Rpb24gYXBpQ2FsbCh7XG4gIG1ldGhvZCA9IFwiR0VUXCIsXG4gIHBhdGggPSBcIi9cIixcbiAgYm9keSA9IG51bGwsXG4gIGhlYWRlcnMgPSB7fSxcbn0gPSB7fSkge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBsZXQgc2V0dGxlZCA9IGZhbHNlO1xuICAgIGNvbnN0IGRvbmUgPSAocjogYW55KSA9PiB7XG4gICAgICBpZiAoIXNldHRsZWQpIHtcbiAgICAgICAgc2V0dGxlZCA9IHRydWU7XG4gICAgICAgIHJlc29sdmUocik7XG4gICAgICB9XG4gICAgfTtcbiAgICBjb25zdCByZXEgPSBuZXcgUGFzc1Rocm91Z2goKTtcbiAgICByZXEubWV0aG9kID0gbWV0aG9kO1xuICAgIHJlcS51cmwgPSBwYXRoO1xuICAgIHJlcS5oZWFkZXJzID0gT2JqZWN0LmFzc2lnbihcbiAgICAgIHsgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcbiAgICAgIGhlYWRlcnMsXG4gICAgKTtcbiAgICBjb25zdCByZXMgPSBuZXcgV3JpdGFibGUoKTtcbiAgICByZXMuc3RhdHVzQ29kZSA9IDIwMDtcbiAgICByZXMuX2ggPSB7fTtcbiAgICByZXMuX2NodW5rcyA9IFtdO1xuICAgIF9wYXNhbmdUYW5kYVNlbGVzYWkocmVzKTtcbiAgICByZXMuc2V0SGVhZGVyID0gKGs6IGFueSwgdjogYW55KSA9PiB7XG4gICAgICByZXMuX2hbU3RyaW5nKGspLnRvTG93ZXJDYXNlKCldID0gdjtcbiAgICB9O1xuICAgIHJlcy5nZXRIZWFkZXIgPSAoazogYW55KSA9PiByZXMuX2hbU3RyaW5nKGspLnRvTG93ZXJDYXNlKCldO1xuICAgIHJlcy5yZW1vdmVIZWFkZXIgPSAoazogYW55KSA9PiB7XG4gICAgICBkZWxldGUgcmVzLl9oW1N0cmluZyhrKS50b0xvd2VyQ2FzZSgpXTtcbiAgICB9O1xuICAgIHJlcy53cml0ZUhlYWQgPSAoY29kZTogYW55LCBoOiBhbnkpID0+IHtcbiAgICAgIHJlcy5zdGF0dXNDb2RlID0gY29kZTtcbiAgICAgIGlmIChoKSBmb3IgKGNvbnN0IGsgaW4gaCkgcmVzLl9oW1N0cmluZyhrKS50b0xvd2VyQ2FzZSgpXSA9IGhba107XG4gICAgICByZXR1cm4gcmVzO1xuICAgIH07XG4gICAgcmVzLl93cml0ZSA9IChjaHVuazogYW55LCBfZW5jOiBhbnksIGNiOiBhbnkpID0+IHtcbiAgICAgIHJlcy5fY2h1bmtzLnB1c2goQnVmZmVyLmZyb20oY2h1bmspKTtcbiAgICAgIGNiKCk7XG4gICAgfTtcbiAgICByZXMuZW5kID0gKGNodW5rOiBhbnkpID0+IHtcbiAgICAgIGlmIChyZXMuX3NlbGVzYWkpIHJldHVybjsgLy8gYSBoYW5kbGVyIGNhbGxpbmcgZW5kKCkgdHdpY2UgbXVzdCBub3QgYW5zd2VyIHR3aWNlXG4gICAgICBpZiAoY2h1bmspIHJlcy5fY2h1bmtzLnB1c2goQnVmZmVyLmZyb20oY2h1bmspKTtcbiAgICAgIHJlcy5fc2VsZXNhaSA9IHRydWU7XG4gICAgICBkb25lKHtcbiAgICAgICAgc3RhdHVzOiByZXMuc3RhdHVzQ29kZSxcbiAgICAgICAgaGVhZGVyczogcmVzLl9oLFxuICAgICAgICBib2R5OiBCdWZmZXIuY29uY2F0KHJlcy5fY2h1bmtzKS50b1N0cmluZyhcInV0ZjhcIiksXG4gICAgICB9KTtcbiAgICB9O1xuICAgIHRyeSB7XG4gICAgICBwcm9iZS50aW1lU3luYyhyZXEubWV0aG9kICsgXCIgXCIgKyByZXEudXJsLCAoKSA9PlxuICAgICAgICBjb3JlKCkuc2VydmVyLmVtaXQoXCJyZXF1ZXN0XCIsIHJlcSwgcmVzKSxcbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICByZXR1cm4gZG9uZSh7XG4gICAgICAgIHN0YXR1czogNTAwLFxuICAgICAgICBoZWFkZXJzOiB7fSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogZS5tZXNzYWdlIH0pLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGlmIChib2R5ICE9IG51bGwpXG4gICAgICByZXEuZW5kKHR5cGVvZiBib2R5ID09PSBcInN0cmluZ1wiID8gYm9keSA6IEpTT04uc3RyaW5naWZ5KGJvZHkpKTtcbiAgICBlbHNlIHJlcS5lbmQoKTtcbiAgfSk7XG59XG5cbi8vIFN0cmVhbWluZyB2YXJpYW50IG9mIGFwaUNhbGw6IGVhY2ggcmVzLndyaXRlIGJlY29tZXMgYW4gSVBDIGNodW5rIChmb3IgU1NFXG4vLyBlbmRwb2ludHMgbGlrZSBtb2RlbCBkb3dubG9hZHMpLiBDYW5jZWwgZGVzdHJveXMgcmVzIFx1MDBFMlx1MjAyMFx1MjAxOSBoYW5kbGVyJ3MgcmVzLm9uKCdjbG9zZScpLlxuZnVuY3Rpb24gYXBpU3RyZWFtKFxuICB7IG1ldGhvZCA9IFwiR0VUXCIsIHBhdGggPSBcIi9cIiwgYm9keSA9IG51bGwsIGhlYWRlcnMgPSB7fSB9ID0ge30sXG4gIGVtaXQ6IGFueSxcbiAgY3RsOiBhbnkgPSB7fSxcbikge1xuICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcbiAgICBjb25zdCByZXEgPSBuZXcgUGFzc1Rocm91Z2goKTtcbiAgICByZXEubWV0aG9kID0gbWV0aG9kO1xuICAgIHJlcS51cmwgPSBwYXRoO1xuICAgIHJlcS5oZWFkZXJzID0geyBcImNvbnRlbnQtdHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIiwgLi4uaGVhZGVycyB9O1xuICAgIGNvbnN0IHJlcyA9IG5ldyBXcml0YWJsZSgpO1xuICAgIHJlcy5zdGF0dXNDb2RlID0gMjAwO1xuICAgIHJlcy5faCA9IHt9O1xuICAgIF9wYXNhbmdUYW5kYVNlbGVzYWkocmVzKTtcbiAgICByZXMuc2V0SGVhZGVyID0gKGs6IGFueSwgdjogYW55KSA9PiB7XG4gICAgICByZXMuX2hbU3RyaW5nKGspLnRvTG93ZXJDYXNlKCldID0gdjtcbiAgICB9O1xuICAgIHJlcy5nZXRIZWFkZXIgPSAoazogYW55KSA9PiByZXMuX2hbU3RyaW5nKGspLnRvTG93ZXJDYXNlKCldO1xuICAgIHJlcy53cml0ZUhlYWQgPSAoY29kZTogYW55LCBoOiBhbnkpID0+IHtcbiAgICAgIHJlcy5zdGF0dXNDb2RlID0gY29kZTtcbiAgICAgIGlmIChoKSBmb3IgKGNvbnN0IGsgaW4gaCkgcmVzLl9oW1N0cmluZyhrKS50b0xvd2VyQ2FzZSgpXSA9IGhba107XG4gICAgICByZXR1cm4gcmVzO1xuICAgIH07XG4gICAgcmVzLl93cml0ZSA9IChjaHVuazogYW55LCBfZW5jOiBhbnksIGNiOiBhbnkpID0+IHtcbiAgICAgIGVtaXQoY2h1bmsudG9TdHJpbmcoXCJ1dGY4XCIpKTtcbiAgICAgIGNiKCk7XG4gICAgfTtcbiAgICByZXMuZW5kID0gKGNodW5rOiBhbnkpID0+IHtcbiAgICAgIGlmIChyZXMuX3NlbGVzYWkpIHJldHVybjtcbiAgICAgIGlmIChjaHVuaykgZW1pdChjaHVuay50b1N0cmluZyhcInV0ZjhcIikpO1xuICAgICAgcmVzLl9zZWxlc2FpID0gdHJ1ZTtcbiAgICAgIHJlc29sdmUoKTtcbiAgICB9O1xuICAgIGlmIChjdGwuc2V0Q3VyUmVxKSBjdGwuc2V0Q3VyUmVxKHJlcyk7IC8vIGNhbmNlbCBcdTAwRTJcdTIwMjBcdTIwMTkgcmVzLmRlc3Ryb3koKSBcdTAwRTJcdTIwMjBcdTIwMTkgJ2Nsb3NlJyBcdTAwRTJcdTIwMjBcdTIwMTkgaGFuZGxlciBhYm9ydHNcbiAgICB0cnkge1xuICAgICAgcHJvYmUudGltZVN5bmMoXCJTVFJFQU0gXCIgKyByZXEubWV0aG9kICsgXCIgXCIgKyByZXEudXJsLCAoKSA9PlxuICAgICAgICBjb3JlKCkuc2VydmVyLmVtaXQoXCJyZXF1ZXN0XCIsIHJlcSwgcmVzKSxcbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICBlbWl0KFwiZGF0YTogXCIgKyBKU09OLnN0cmluZ2lmeSh7IHQ6IFwiZXJyXCIsIG06IGUubWVzc2FnZSB9KSArIFwiXFxuXFxuXCIpO1xuICAgICAgcmV0dXJuIHJlc29sdmUoKTtcbiAgICB9XG4gICAgaWYgKGJvZHkgIT0gbnVsbClcbiAgICAgIHJlcS5lbmQodHlwZW9mIGJvZHkgPT09IFwic3RyaW5nXCIgPyBib2R5IDogSlNPTi5zdHJpbmdpZnkoYm9keSkpO1xuICAgIGVsc2UgcmVxLmVuZCgpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gcmVnaXN0ZXJJcGMoKSB7XG4gIGlwY01haW4ub24oXCJXT0xGU1BBQ0U6cHJvYmVcIiwgKF9lOiBhbnksIGQ6IGFueSkgPT4ge1xuICAgIGlmIChkICYmIGQudCA9PT0gXCJyZW5kZXJlci1zdG9wXCIpXG4gICAgICBwcm9iZS5zYXkoXCJSRU5ERVJFUi1TVE9QIH5cIiArIE1hdGgucm91bmQoZC5vdmVyc2hvb3QpICsgXCJtc1wiKTtcbiAgfSk7XG4gIGlwY01haW4uaGFuZGxlKFxuICAgIFwiV09MRlNQQUNFOmludm9rZVwiLFxuICAgIGFzeW5jIChfZTogYW55LCB7IGNoYW5uZWwsIHBheWxvYWQgfTogYW55KSA9PiB7XG4gICAgICBpZiAoY2hhbm5lbCA9PT0gXCJwaW5nXCIpIHJldHVybiB7IG9rOiB0cnVlLCBwb25nOiBEYXRlLm5vdygpIH07XG4gICAgICAvLyBOYXRpdmUgZm9sZGVyIHBpY2tlciBcdTIxOTIgcGF0aCBhYnNvbHV0IEFTTEkgKGRpIEM6LCBEOiwgRGVza3RvcCwgbWFuYSBwdW4pLlxuICAgICAgLy8gUmVuZGVyZXIgbWVtYW5nZ2lsbnlhIGxld2F0IHdpbmRvdy5XT0xGU1BBQ0UuaW52b2tlKCdzZWxlY3RGb2xkZXInKS5cbiAgICAgIGlmIChjaGFubmVsID09PSBcInNlbGVjdEZvbGRlclwiKSB7XG4gICAgICAgIGNvbnN0IHsgZGlhbG9nIH0gPSByZXF1aXJlKFwiZWxlY3Ryb25cIik7XG4gICAgICAgIGNvbnN0IHdpbiA9XG4gICAgICAgICAgQnJvd3NlcldpbmRvdy5nZXRGb2N1c2VkV2luZG93KCkgfHwgQnJvd3NlcldpbmRvdy5nZXRBbGxXaW5kb3dzKClbMF07XG4gICAgICAgIGNvbnN0IHIgPSBhd2FpdCBkaWFsb2cuc2hvd09wZW5EaWFsb2cod2luLCB7XG4gICAgICAgICAgcHJvcGVydGllczogW1wib3BlbkRpcmVjdG9yeVwiXSxcbiAgICAgICAgICB0aXRsZTogXCJQaWxpaCBmb2xkZXIgd29ya3NwYWNlXCIsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoci5jYW5jZWxlZCB8fCAhci5maWxlUGF0aHMgfHwgIXIuZmlsZVBhdGhzLmxlbmd0aClcbiAgICAgICAgICByZXR1cm4geyBjYW5jZWxlZDogdHJ1ZSB9O1xuICAgICAgICByZXR1cm4geyBwYXRoOiByLmZpbGVQYXRoc1swXSB9O1xuICAgICAgfVxuICAgICAgLy8gSG90LXJlbG9hZCB0aGUgYmFja2VuZCBXSVRIT1VUIHJlc3RhcnRpbmcgdGhlIGFwcDogZHJvcCBldmVyeSBjYWNoZWQgbW9kdWxlXG4gICAgICAvLyB1bmRlciB0aGUgc291cmNlIHJvb3QgYW5kIHJlLXJlcXVpcmUgY29yZS4gTGV0cyBlZGl0cyB0byBzZXJ2ZXIuY2pzL2NvcmUuanNcbiAgICAgIC8vIHRha2UgZWZmZWN0IGxpdmUgKGZyb250LWVuZCBlZGl0cyBqdXN0IG5lZWQgYSByZW5kZXJlciByZWxvYWQpLlxuICAgICAgaWYgKGNoYW5uZWwgPT09IFwicmVsb2FkQ29yZVwiKSB7XG4gICAgICAgIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3Qgcm9vdCA9IHVucGFja2VkUm9vdCgpO1xuICAgICAgICAgIGZvciAoY29uc3QgayBvZiBPYmplY3Qua2V5cyhyZXF1aXJlLmNhY2hlKSkge1xuICAgICAgICAgICAgaWYgKGsuc3RhcnRzV2l0aChyb290KSkgZGVsZXRlIHJlcXVpcmUuY2FjaGVba107XG4gICAgICAgICAgfVxuICAgICAgICAgIF9jb3JlID0gbnVsbDtcbiAgICAgICAgICBjb3JlKCk7XG4gICAgICAgICAgY29uc3QgbXMgPSBwZXJmb3JtYW5jZS5ub3coKSAtIHQwO1xuICAgICAgICAgIGlmIChtcyA+PSAxMDApIHByb2JlLnNheShcInJlbG9hZENvcmUgXCIgKyBtcy50b0ZpeGVkKDApICsgXCJtc1wiKTtcbiAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgYXQ6IERhdGUubm93KCkgfTtcbiAgICAgICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogZS5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChjaGFubmVsID09PSBcImJyb3dzZXJcIikgcmV0dXJuIGJyb3dzZXJBa3NpKHBheWxvYWQpO1xuICAgICAgaWYgKGNoYW5uZWwgPT09IFwiYXBpXCIpIHJldHVybiBhcGlDYWxsKHBheWxvYWQpOyAvLyBnZW5lcmljIGluLXByb2Nlc3MgSFRUUC1oYW5kbGVyIHByb3h5XG4gICAgICBjb25zdCBjID0gY29yZSgpO1xuICAgICAgaWYgKGNoYW5uZWwgPT09IFwiY2xvdWRLZXlzXCIpIHJldHVybiBPYmplY3Qua2V5cyhjLmdldENsb3VkS2V5cygpKTsgLy8gbmFtZXMgb25seSwgbm8gc2VjcmV0c1xuICAgICAgLy8gVGVybWluYWwgUFRZIG9wZXJhdGlvbnNcbiAgICAgIGlmIChjaGFubmVsID09PSBcInRlcm1pbmFsXCIpIHtcbiAgICAgICAgY29uc3QgeyBhY3Rpb24gfSA9IHBheWxvYWQgfHwge307XG4gICAgICAgIGlmIChhY3Rpb24gPT09IFwib3BlblwiKSB7XG4gICAgICAgICAgY29uc3QgciA9IGMub3BlblRlcm1pbmFsU2Vzc2lvbihwYXlsb2FkLmN3ZCwgcGF5bG9hZC5zaGVsbCk7XG4gICAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGlkOiByLmlkLCBzaGVsbDogci5zaGVsbCwgY3dkOiByLmN3ZCB9O1xuICAgICAgICB9XG4gICAgICAgIGlmIChhY3Rpb24gPT09IFwid3JpdGVcIikge1xuICAgICAgICAgIGMud3JpdGVUb1Rlcm1pbmFsKHBheWxvYWQuaWQsIHBheWxvYWQuZGF0YSk7XG4gICAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYWN0aW9uID09PSBcInJlYWRcIikge1xuICAgICAgICAgIGNvbnN0IHNlc3Npb24gPSBjLnRlcm1pbmFsU2Vzc2lvbnMuZ2V0KHBheWxvYWQuaWQpO1xuICAgICAgICAgIGlmICghc2Vzc2lvbikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJzZXNzaW9uIG5vdCBmb3VuZFwiIH07XG4gICAgICAgICAgY29uc3Qgb3V0ID0gc2Vzc2lvbi5vdXRwdXRCdWZmZXIgfHwgXCJcIjtcbiAgICAgICAgICBpZiAocGF5bG9hZC5jbGVhcikgc2Vzc2lvbi5vdXRwdXRCdWZmZXIgPSBcIlwiO1xuICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBvdXRwdXQ6IG91dCB9O1xuICAgICAgICB9XG4gICAgICAgIGlmIChhY3Rpb24gPT09IFwicmVzaXplXCIpIHtcbiAgICAgICAgICBjLnJlc2l6ZVRlcm1pbmFsKHBheWxvYWQuaWQsIHBheWxvYWQuY29scywgcGF5bG9hZC5yb3dzKTtcbiAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgICB9XG4gICAgICAgIGlmIChhY3Rpb24gPT09IFwiY2xvc2VcIikge1xuICAgICAgICAgIGMuY2xvc2VUZXJtaW5hbFNlc3Npb24ocGF5bG9hZC5pZCk7XG4gICAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYWN0aW9uID09PSBcImxpc3RcIikge1xuICAgICAgICAgIGNvbnN0IG91dCA9IEFycmF5LmZyb20oXG4gICAgICAgICAgICBjLnRlcm1pbmFsU2Vzc2lvbnMuZW50cmllcygpIGFzIEl0ZXJhYmxlPFthbnksIGFueV0+LFxuICAgICAgICAgICkubWFwKChbaWQsIHNdKSA9PiAoe1xuICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICBzaGVsbDogcy5zaGVsbCxcbiAgICAgICAgICAgIGN3ZDogcy5jd2QsXG4gICAgICAgICAgICBjcmVhdGVkQXQ6IHMuY3JlYXRlZEF0LFxuICAgICAgICAgIH0pKTtcbiAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcInVua25vd24gdGVybWluYWwgYWN0aW9uOiBcIiArIGFjdGlvbik7XG4gICAgICB9XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJ1bmtub3duIGludm9rZSBjaGFubmVsOiBcIiArIGNoYW5uZWwpO1xuICAgIH0sXG4gICk7XG4gIGlwY01haW4ub24oXCJXT0xGU1BBQ0U6c3RyZWFtXCIsIChlOiBhbnksIHsgaWQsIGNoYW5uZWwsIHBheWxvYWQgfTogYW55KSA9PiB7XG4gICAgLy8gVGhlIGNoYW5uZWwgaXMga2VwdCBzbyB0aGUgaG90LXJlbG9hZCBndWFyZCBrbm93cyBhbiBhZ2VudCBydW4gaXMgYWxpdmUuXG4gICAgY29uc3Qgc3QgPSB7IGNhbmNlbGxlZDogZmFsc2UsIHJlcTogbnVsbCwgY2hhbm5lbCwgbXVsYWk6IERhdGUubm93KCkgfTtcbiAgICBfc3RyZWFtcy5zZXQoaWQsIHN0KTtcbiAgICBjb25zdCBlbWl0ID0gKG1zZzogYW55KSA9PiB7XG4gICAgICBpZiAoc3QuY2FuY2VsbGVkKSByZXR1cm47XG4gICAgICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICAgICAgdHJ5IHtcbiAgICAgICAgZS5zZW5kZXIuc2VuZChcIldPTEZTUEFDRTpjaHVua1wiLCB7IGlkLCBkYXRhOiBtc2cgfSk7XG4gICAgICB9IGNhdGNoIChfOiBhbnkpIHt9XG4gICAgICBjb25zdCBtcyA9IHBlcmZvcm1hbmNlLm5vdygpIC0gdDA7XG4gICAgICBpZiAobXMgPj0gMTApXG4gICAgICAgIHByb2JlLnNheShcbiAgICAgICAgICBcIlNFTkQgY2h1bmsgXCIgK1xuICAgICAgICAgICAgbXMudG9GaXhlZCgxKSArXG4gICAgICAgICAgICBcIm1zIGxlbj1cIiArXG4gICAgICAgICAgICBTdHJpbmcobXNnICYmIChtc2cubGVuZ3RoIHx8IDApKSxcbiAgICAgICAgKTtcbiAgICB9O1xuICAgIGNvbnN0IGZpbmlzaCA9ICgpID0+IHtcbiAgICAgIF9zdHJlYW1zLmRlbGV0ZShpZCk7XG4gICAgICB0cnkge1xuICAgICAgICBlLnNlbmRlci5zZW5kKFwiV09MRlNQQUNFOmNodW5rXCIsIHsgaWQsIGRvbmU6IHRydWUgfSk7XG4gICAgICB9IGNhdGNoIChfOiBhbnkpIHt9XG4gICAgICAvLyBSZW1vdmVkIGZyb20gX3N0cmVhbXMgRklSU1QsIHRoZW4gcmVsZWFzZWQgXHUyMDE0IHNvIF9hZ2VudFNpYnVrKCkgc2VlcyB0aGUgc3RhdGVcbiAgICAgIC8vIGFmdGVyIHRoaXMgcnVuIGhhcyBlbmRlZCwgbm90IHRoZSBvbmUgYmVmb3JlLlxuICAgICAgX2xlcGFzUmVsb2FkVGVydHVuZGEoKTtcbiAgICB9O1xuICAgIGNvbnN0IGN0bCA9IHtcbiAgICAgIGlzQ2FuY2VsbGVkOiAoKSA9PiBzdC5jYW5jZWxsZWQsXG4gICAgICBzZXRDdXJSZXE6IChyOiBhbnkpID0+IHtcbiAgICAgICAgc3QucmVxID0gcjtcbiAgICAgIH0sXG4gICAgfTtcbiAgICBsZXQgZm4gPSBudWxsO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBjID0gY29yZSgpO1xuICAgICAgZm4gPVxuICAgICAgICBjaGFubmVsID09PSBcImNoYXRcIlxuICAgICAgICAgID8gYy5jaGF0U3RyZWFtXG4gICAgICAgICAgOiBjaGFubmVsID09PSBcInNlbGYtYWdlbnRcIlxuICAgICAgICAgICAgPyBjLnNlbGZBZ2VudFN0cmVhbVxuICAgICAgICAgICAgOiBjaGFubmVsID09PSBcImFwaVwiXG4gICAgICAgICAgICAgID8gYXBpU3RyZWFtXG4gICAgICAgICAgICAgIDogbnVsbDtcbiAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgZW1pdCh7IHQ6IFwiZXJyXCIsIG06IFwiY29yZTogXCIgKyBlcnIubWVzc2FnZSB9KTtcbiAgICAgIHJldHVybiBmaW5pc2goKTtcbiAgICB9XG4gICAgaWYgKCFmbikge1xuICAgICAgZW1pdCh7IHQ6IFwiZXJyXCIsIG06IFwidW5rbm93biBzdHJlYW0gY2hhbm5lbDogXCIgKyBjaGFubmVsIH0pO1xuICAgICAgcmV0dXJuIGZpbmlzaCgpO1xuICAgIH1cbiAgICAvLyBmbiBJUyBDQUxMRUQgSU5TSURFIHRoZSB0cnk6IGBQcm9taXNlLnJlc29sdmUoZm4oLi4uKSlgIGFsb25lIGlzIG5vdCBlbm91Z2gsXG4gICAgLy8gYmVjYXVzZSBhIFNZTkNIUk9OT1VTIHRocm93IGhhcHBlbnMgYmVmb3JlIFByb21pc2UucmVzb2x2ZSBnZXRzIHRvIHdyYXAgaXQgXHUyMDE0XG4gICAgLy8gdGhlIHRocm93IGVzY2FwZXMgdGhpcyBoYW5kbGVyIGFuZCBmaW5pc2goKSBuZXZlciBydW5zLiBUaGUgc3RyZWFtIGlzIHRoZW5cbiAgICAvLyBsZWZ0IGluIF9zdHJlYW1zIGZvcmV2ZXIsIGFuZCBzaW5jZSB0aGUgaG90LXJlbG9hZCBndWFyZCBleGlzdHMgdGhlXG4gICAgLy8gY29uc2VxdWVuY2UgY29tcG91bmRzOiBfYWdlbnRTaWJ1aygpIHN0YXlzIHRydWUsIHNvIEVWRVJZIHJlbG9hZCBpcyBkZWZlcnJlZFxuICAgIC8vIGluZGVmaW5pdGVseSBhbmQgdGhlIGFwcGxpY2F0aW9uIHN0b3BzIHVwZGF0aW5nIGl0c2VsZiB3aXRob3V0IGEgc2luZ2xlIGVycm9yXG4gICAgLy8gbWVzc2FnZS5cbiAgICB0cnkge1xuICAgICAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICAgIFByb21pc2UucmVzb2x2ZShmbihwYXlsb2FkLCBlbWl0LCBjdGwpKS50aGVuKGZpbmlzaCwgKGVycikgPT4ge1xuICAgICAgICBlbWl0KHsgdDogXCJlcnJcIiwgbTogKGVyciAmJiBlcnIubWVzc2FnZSkgfHwgU3RyaW5nKGVycikgfSk7XG4gICAgICAgIGZpbmlzaCgpO1xuICAgICAgfSk7XG4gICAgICBjb25zdCBtcyA9IHBlcmZvcm1hbmNlLm5vdygpIC0gdDA7XG4gICAgICBpZiAobXMgPj0gMTAwKVxuICAgICAgICBwcm9iZS5zYXkoXCJTVFJFQU0gXCIgKyBjaGFubmVsICsgXCIgaW5pdCBcIiArIG1zLnRvRml4ZWQoMCkgKyBcIm1zXCIpO1xuICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICBlbWl0KHsgdDogXCJlcnJcIiwgbTogKGVyciAmJiBlcnIubWVzc2FnZSkgfHwgU3RyaW5nKGVycikgfSk7XG4gICAgICBmaW5pc2goKTtcbiAgICB9XG4gIH0pO1xuICBpcGNNYWluLm9uKFwiV09MRlNQQUNFOmNhbmNlbFwiLCAoX2U6IGFueSwgeyBpZCB9OiBhbnkpID0+IHtcbiAgICBjb25zdCBzdCA9IF9zdHJlYW1zLmdldChpZCk7XG4gICAgaWYgKHN0KSB7XG4gICAgICBzdC5jYW5jZWxsZWQgPSB0cnVlO1xuICAgICAgaWYgKHN0LnJlcSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHN0LnJlcS5kZXN0cm95KCk7XG4gICAgICAgIH0gY2F0Y2ggKF86IGFueSkge31cbiAgICAgIH1cbiAgICB9XG4gIH0pO1xufVxuXG4vLyBBIE9ORS1USU1FIHVzZXJEYXRhIG1pZ3JhdGlvbjogYmVmb3JlIGl0IHNldHRsZWQgb24gXCJXT0xGU1BBQ0VcIiAodGhlIGZpeCBhYm92ZSksXG4vLyBlYXJsaWVyIHNlc3Npb25zIHNjYXR0ZXJlZCBpbnRvIFwicXVhbnR1bVwiICh0aGUgb2xkIG5hbWUpIGFuZC9vciB0aGUgZ2VuZXJpY1xuLy8gXCJFbGVjdHJvblwiIGRlZmF1bHQgKHRoZSBmYWxsYmFjayB3aGVuIEVsZWN0cm9uIGZhaWxzIHRvIGRldGVjdCBhIG5hbWUpLiBDb3B5XG4vLyBcIkxvY2FsIFN0b3JhZ2VcIiBmcm9tIHRob3NlIG9sZCBwcm9maWxlcyBpbnRvIHRoZSBORVcgc3RhYmxlIHByb2ZpbGUgKGlmIHRoZSBuZXdcbi8vIG9uZSBoYXMgbm8gZGF0YSB5ZXQpLCBzbyBwcm9qZWN0cy9oaXN0b3J5L2Jyb3dzZXIgbWlncmF0aW9uIHJlc3VsdHMgYXJlIG5vdCBsb3N0XG4vLyB0byB0aGlzIHByb2ZpbGUgY2hhbmdlLiBTYWZlOiBpdCBvbmx5IGNvcGllcyB3aGVuIHRoZSBkZXN0aW5hdGlvbiBpcyBlbnRpcmVseVxuLy8gZW1wdHkuXG5mdW5jdGlvbiBtaWdyYXRlT2xkVXNlckRhdGFPbmNlKCkge1xuICB0cnkge1xuICAgIGNvbnN0IG5ld0RpciA9IGFwcC5nZXRQYXRoKFwidXNlckRhdGFcIik7XG4gICAgY29uc3QgbmV3TFMgPSBwYXRoLmpvaW4obmV3RGlyLCBcIkxvY2FsIFN0b3JhZ2VcIik7XG4gICAgaWYgKGZzLmV4aXN0c1N5bmMobmV3TFMpKSByZXR1cm47IC8vIHRoZSBuZXcgcHJvZmlsZSBhbHJlYWR5IGhhcyBkYXRhIFx1MjAxNCBkbyBub3Qgb3ZlcndyaXRlXG4gICAgY29uc3Qgcm9hbWluZyA9IHBhdGguZGlybmFtZShuZXdEaXIpOyAvLyAlQVBQREFUQSVcbiAgICAvLyBcIldPTEZTUEFDRVwiICh0aGUgb2xkIHNoYXJlZCBkcmF3ZXIpIGlzIGltcG9ydGVkIE9OTFkgd2hlbiB0aGUgcHJvamVjdCBjYXJyaWVzXG4gICAgLy8gYW4gZXhwbGljaXQgbWFya2VyIFx1MjAxNCBzbyBhIEdpdEh1YiBjbG9uZSBkb2VzIG5vdCBzd2FsbG93IHRoZSBvcmlnaW5hbFxuICAgIC8vIGluc3RhbGxhdGlvbidzIFVJIGhpc3RvcnkuXG4gICAgY29uc3QgY2xhaW1MZWdhY3lVaSA9IHBhdGguam9pbihcbiAgICAgIHVucGFja2VkUm9vdCgpLFxuICAgICAgXCIud29sZnNwYWNlXCIsXG4gICAgICBcImNsYWltLWxlZ2FjeS11aVwiLFxuICAgICk7XG4gICAgY29uc3QgbmFtZXMgPSBbXCJxdWFudHVtXCIsIFwiRWxlY3Ryb25cIl07XG4gICAgaWYgKGZzLmV4aXN0c1N5bmMoY2xhaW1MZWdhY3lVaSkpIG5hbWVzLnVuc2hpZnQoXCJXT0xGU1BBQ0VcIik7XG4gICAgY29uc3QgY2FuZGlkYXRlcyA9IG5hbWVzXG4gICAgICAubWFwKChuKSA9PiBwYXRoLmpvaW4ocm9hbWluZywgbikpXG4gICAgICAuZmlsdGVyKFxuICAgICAgICAocCkgPT4gcCAhPT0gbmV3RGlyICYmIGZzLmV4aXN0c1N5bmMocGF0aC5qb2luKHAsIFwiTG9jYWwgU3RvcmFnZVwiKSksXG4gICAgICApO1xuICAgIGlmICghY2FuZGlkYXRlcy5sZW5ndGgpIHJldHVybjtcbiAgICAvLyBQaWNrIHRoZSBtb3N0IFJFQ0VOVExZIG1vZGlmaWVkICh0aGUgTE9HIGZpbGUpIGFzIHRoZSBtb3N0IHJlbGV2YW50IHNvdXJjZS5cbiAgICBjb25zdCB3aXRoTXRpbWUgPSBjYW5kaWRhdGVzLm1hcCgocCkgPT4ge1xuICAgICAgbGV0IG0gPSAwO1xuICAgICAgdHJ5IHtcbiAgICAgICAgbSA9IGZzLnN0YXRTeW5jKHBhdGguam9pbihwLCBcIkxvY2FsIFN0b3JhZ2VcIiwgXCJMT0dcIikpLm10aW1lTXM7XG4gICAgICB9IGNhdGNoIChfOiBhbnkpIHt9XG4gICAgICByZXR1cm4geyBwLCBtIH07XG4gICAgfSk7XG4gICAgd2l0aE10aW1lLnNvcnQoKGEsIGIpID0+IGIubSAtIGEubSk7XG4gICAgY29uc3Qgc3JjID0gcGF0aC5qb2luKHdpdGhNdGltZVswXSEucCwgXCJMb2NhbCBTdG9yYWdlXCIpO1xuICAgIGZzLm1rZGlyU3luYyhuZXdEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIGZzLmNwU3luYyhzcmMsIG5ld0xTLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIFwiW3VzZXJEYXRhXSBtaWdyYXNpIGxvY2FsU3RvcmFnZSBkYXJpXCIsXG4gICAgICB3aXRoTXRpbWVbMF0hLnAsXG4gICAgICBcIlx1MjE5MlwiLFxuICAgICAgbmV3RGlyLFxuICAgICk7XG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGNvbnNvbGUubG9nKFwiW3VzZXJEYXRhXSBtaWdyYXNpIGdhZ2FsIChub24tZmF0YWwpOlwiLCBlLm1lc3NhZ2UpO1xuICB9XG59XG5cbi8vIENhdGNoIGFuZCBsb2cgZXZlcnkgZ2xvYmFsIGVycm9yIHNvIGl0IHNob3dzIHVwIGluIHRoZSBjb25zb2xlXG5wcm9jZXNzLm9uKFwidW5jYXVnaHRFeGNlcHRpb25cIiwgKGVycm9yKSA9PiB7XG4gIGNvbnNvbGUuZXJyb3IoXCJbRWxlY3Ryb24gRXJyb3JdIFVuY2F1Z2h0IEV4Y2VwdGlvbjpcIiwgZXJyb3IpO1xufSk7XG5wcm9jZXNzLm9uKFwidW5oYW5kbGVkUmVqZWN0aW9uXCIsIChyZWFzb24sIHByb21pc2UpID0+IHtcbiAgY29uc29sZS5lcnJvcihcbiAgICBcIltFbGVjdHJvbiBFcnJvcl0gVW5oYW5kbGVkIFJlamVjdGlvbiBhdDpcIixcbiAgICBwcm9taXNlLFxuICAgIFwicmVhc29uOlwiLFxuICAgIHJlYXNvbixcbiAgKTtcbn0pO1xuXG4vLyA9PT0gTUVNT1JZIE9QVElNSVpBVElPTlMgPT09XG4vLyBDYXAgdGhlIENocm9taXVtIHJlbmRlcmVyJ3MgUkFNIHNvIGl0IGRvZXMgbm90IGJhbGxvb24gcGFzdCA1IEdCLlxuLy8gVGhlc2UgZmxhZ3MgTVVTVCBiZSBzZXQgQkVGT1JFIGFwcC53aGVuUmVhZHkoKS5cbi8vIC0ganMtZmxhZ3M6IGNhcCB0aGUgTm9kZS5qcyBWOCBoZWFwIGluIHRoZSBtYWluIHByb2Nlc3MgKGJhY2tlbmQvYWdlbnQpXG4vLyAtIG1heC1vbGQtc3BhY2Utc2l6ZTogdGhlIG1haW4gcHJvY2VzcyBWOCBoZWFwIGxpbWl0IChNQilcbi8vIC0gZGlzYWJsZS1ncHUtbWVtb3J5LWJ1ZmZlci1jb21wb3NpdG9yLXJlc291cmNlczogZnJlZSB0aGUgR1BVIGJ1ZmZlclxuLy8gLSBtZW1vcnktcHJlc3N1cmUtdGhyZXNob2xkczogcHVzaCBDaHJvbWl1bSB0byBHQyBtb3JlIGFnZ3Jlc3NpdmVseVxuYXBwLmNvbW1hbmRMaW5lLmFwcGVuZFN3aXRjaChcImpzLWZsYWdzXCIsIFwiLS1tYXgtb2xkLXNwYWNlLXNpemU9NTEyXCIpO1xuYXBwLmNvbW1hbmRMaW5lLmFwcGVuZFN3aXRjaChcImRpc2FibGUtaHR0cC1jYWNoZVwiKTtcbmFwcC5jb21tYW5kTGluZS5hcHBlbmRTd2l0Y2goXCJlbmFibGUtcHJlY2lzZS1tZW1vcnktaW5mb1wiKTtcbi8vIFx1MjUwMFx1MjUwMCBPTkUgZGlzYWJsZS1mZWF0dXJlcyBsaXN0LCBhbmQgdGhhdCBpcyBNQU5EQVRPUlkgXHUyNTAwXHUyNTAwXG4vL1xuLy8gYXBwZW5kU3dpdGNoKFwiZGlzYWJsZS1mZWF0dXJlc1wiLCAuLi4pIE9WRVJXUklURVMgdGhlIHByZXZpb3VzIHZhbHVlLCBpdCBkb2VzIG5vdFxuLy8gbWVyZ2Ugd2l0aCBpdC4gQ2FsbGluZyBpdCB0d2ljZSBzaWxlbnRseSBkaXNjYXJkcyB0aGUgZmlyc3QsIGFuZCB0aGUgb25seSBzeW1wdG9tXG4vLyBpcyBcInRoZSBmZWF0dXJlIHRoYXQgd2FzIHR1cm5lZCBvZmYgaXMgYmFjayBvblwiIHdpdGggbm8gZXJyb3IgYXQgYWxsLiBTbyBhbnl0aGluZ1xuLy8gdGhhdCBuZWVkcyB0dXJuaW5nIG9mZiBoYXMgdG8gZ28gaW4gdGhpcyBsaXN0LlxuLy9cbi8vICAgQ2FsY3VsYXRlTmF0aXZlV2luT2NjbHVzaW9uIFx1MjAxNCBmb3JjZXMgQ2hyb21pdW0gdG8gR0MgdW5kZXIgbWVtb3J5IHByZXNzdXJlLlxuLy9cbi8vICAgQXVkaW9TZXJ2aWNlU2FuZGJveCBcdTIwMTQgV0lUSE9VVCBUSElTIFRIRVJFIElTIE5PIFNPVU5EIGluIHRoZSBicm93c2VyIHBhbmVsLlxuLy8gICAgIFRoZSBzeW1wdG9tOiBZb3VUdWJlIHdvdWxkIG9ubHkgcGxheSB3aGlsZSBtdXRlZC4gV2hhdCB3YXMgbWVhc3VyZWQ6XG4vLyAgICAgICBBdWRpb0NvbnRleHQuc3RhdGUgICAgLT4gXCJydW5uaW5nXCIgICAoc28gdGhlIGF1dG9wbGF5IHBvbGljeSBpcyBOT1QgdGhlXG4vLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhdXNlOyB0ZXN0ZWQgd2l0aCBleGVjdXRlSmF2YVNjcmlwdFxuLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1c2VyR2VzdHVyZT10cnVlKVxuLy8gICAgICAgaXNDdXJyZW50bHlBdWRpYmxlKCkgIC0+IGZhbHNlICAgICAgIChubyBhdWRpbyByZWFjaGluZyB0aGUgb3V0cHV0KVxuLy8gICAgICAgYXVkaW9NdXRlZCAgICAgICAgICAgIC0+IGZhbHNlICAgICAgIChub3QgbXV0ZWQgZWl0aGVyKVxuLy8gICAgIEFmdGVyIEF1ZGlvU2VydmljZVNhbmRib3ggd2FzIGRpc2FibGVkOiBpc0N1cnJlbnRseUF1ZGlibGUoKSAtPiB0cnVlLlxuLy9cbi8vICAgICBUaGUgY2F1c2UgaXMgdGhlIHNhbWUgb25lIHRoYXQgaGFzIG5vdyBhcHBlYXJlZCB0d2ljZSBvbiB0aGlzIG1hY2hpbmU6IGFcbi8vICAgICBzYW5kYm94ZWQgQ2hyb21pdW0gVVRJTElUWSBwcm9jZXNzIGNhbm5vdCBiZSBib3JuLiBUaGUgR1BVIHByb2Nlc3MgZGllZCB3aXRoXG4vLyAgICAgU1RBVFVTX0RMTF9OT1RfRk9VTkQgKHNlZSAtLWRpc2FibGUtZ3B1LXNhbmRib3ggYmVsb3cpLCB0aGUgY3Jvc3Mtc2l0ZVxuLy8gICAgIHJlbmRlcmVyIGZhaWxlZCB3aXRoIEVSUl9GQUlMRUQgKHNlZSB0aGUgYnJvd3NlciB2aWV3IHNhbmRib3ggaW4gX2JyQnVhdCkuXG4vLyAgICAgVGhlIGF1ZGlvIHNlcnZpY2UgaXMgdGhlIHRoaXJkIHNhbmRib3hlZCB1dGlsaXR5IHByb2Nlc3MuXG4vL1xuLy8gICAgIFRoZSBOQVJST1dFU1Qgb3B0aW9uIHdhcyBjaG9zZW46IEF1ZGlvU2VydmljZU91dE9mUHJvY2VzcyBhbHNvIGN1cmVzIGl0LCBidXRcbi8vICAgICBpdCBtb3ZlcyBhdWRpbyBJTlRPIHRoZSBicm93c2VyIHByb2Nlc3MgXHUyMDE0IG9uZSBhdWRpbyBjcmFzaCB3b3VsZCB0aGVuIHRha2UgdGhlXG4vLyAgICAgYXBwbGljYXRpb24gZG93biB3aXRoIGl0LiBEaXNhYmxpbmcgb25seSBpdHMgc2FuZGJveCBrZWVwcyB0aGUgcHJvY2Vzc1xuLy8gICAgIHNlcGFyYXRpb24uXG5hcHAuY29tbWFuZExpbmUuYXBwZW5kU3dpdGNoKFxuICBcImRpc2FibGUtZmVhdHVyZXNcIixcbiAgW1wiQ2FsY3VsYXRlTmF0aXZlV2luT2NjbHVzaW9uXCIsIFwiQXVkaW9TZXJ2aWNlU2FuZGJveFwiXS5qb2luKFwiLFwiKSxcbik7XG4vLyBUdXJuIG9mZiB0aGUgY29tcG9zaXRpbmcgdGlsZSBtZW1vcnkgY2FwIHRvIHJlZHVjZSBWUkFNIHByZXNzdXJlXG5hcHAuY29tbWFuZExpbmUuYXBwZW5kU3dpdGNoKFwiZGlzYWJsZS1ncHUtbWVtb3J5LWJ1ZmZlci1jb21wb3NpdG9yLXJlc291cmNlc1wiKTtcblxuLy8gPT09IEdQVSBTQU5EQk9YID09PVxuLy8gV2l0aG91dCB0aGlzIHRoZSBhcHBsaWNhdGlvbiBET0VTIE5PVCBSVU4gQVQgQUxMIG9uIHNvbWUgV2luZG93cyBtYWNoaW5lcy5cbi8vXG4vLyBUaGUgc3ltcHRvbTogdGhlIGNoaWxkIEdQVSBwcm9jZXNzIGRpZXMgcmVwZWF0ZWRseSB3aXRoIGV4aXRfY29kZT0tMTA3Mzc0MTUxNVxuLy8gKFNUQVRVU19ETExfTk9UX0ZPVU5EKSwgQ2hyb21pdW0gcmV0cmllcyBlaWdodCBvciBuaW5lIHRpbWVzLCB0aGVuIGdpdmVzIHVwIHdpdGhcbi8vIGEgRkFUQUwgXCJHUFUgcHJvY2VzcyBpc24ndCB1c2FibGUuIEdvb2RieWUuXCIgYW5kIEtJTExTIHRoZSB3aG9sZSBhcHBsaWNhdGlvbi4gVGhlXG4vLyB3aW5kb3cgbmV2ZXIgYXBwZWFycywgYW5kIHRoZSBvbmx5IHRyYWNlIGlzIGEgcnVuIG9mIGdwdV9wcm9jZXNzX2hvc3QgRVJST1IgbGluZXNcbi8vIHRoYXQgbG9vayBsaWtlIG9yZGluYXJ5IHdhcm5pbmdzLlxuLy9cbi8vIFRoZSBjYXVzZSBpcyBub3QgYSBicm9rZW4gRWxlY3Ryb246IGFsbCBpdHMgRExMcyBhcmUgcHJlc2VudCBhbmQgaXRzIG1haW4gcHJvY2Vzc1xuLy8gaXMgaGVhbHRoeS4gU1RBVFVTX0RMTF9OT1RfRk9VTkQgaW4gYSBTQU5EQk9YRUQgY2hpbGQgcHJvY2VzcyBoYXMgYSBrbm93biBjYXVzZSBcdTIwMTRcbi8vIHRoZSBzYW5kYm94IHJlZnVzZXMgdG8gbG9hZCBhIERMTCBpbmplY3RlZCBieSBhIHRoaXJkIHBhcnR5IChhbnRpdmlydXMsIGFuXG4vLyBvdmVybGF5LCBhIGRyaXZlciB1dGlsaXR5KSBpbnRvIHRoYXQgcHJvY2Vzcy5cbi8vXG4vLyBNZWFzdXJlZCwgYWxsIGZvdXIsIG9uIGFuIGFmZmVjdGVkIG1hY2hpbmU6XG4vLyAgIGFzLWlzICAgICAgICAgICAgICAgICAgRkFUQUwgd2l0aGluIDEgc2Vjb25kLCA5IEdQVSBjcmFzaGVzXG4vLyAgIC0tZGlzYWJsZS1ncHUgICAgICAgICAgYWxzbyBGQVRBTCwgNiBjcmFzaGVzICA8LSBkb2VzIE5PVCBoZWxwXG4vLyAgIC0taW4tcHJvY2Vzcy1ncHUgICAgICAgYWxpdmUsIGJ1dCB0aGUgd2hvbGUgR1BVIGlzIHB1bGxlZCBpbnRvIHRoZSBtYWluIHByb2Nlc3Ncbi8vICAgLS1kaXNhYmxlLWdwdS1zYW5kYm94ICBhbGl2ZSwgMCBjcmFzaGVzLCBhY2NlbGVyYXRpb24gJiByZW5kZXIgaXNvbGF0aW9uIElOVEFDVFxuLy9cbi8vIFdoYXQgaXMgdHJhZGVkOiB0aGUgc2FuZGJveCBsYXllciBvbiB0aGUgR1BVIHByb2Nlc3MgYWxvbmUuIFRoZSByZW5kZXIgcHJvY2Vzc1xuLy8gc3RheXMgZnVsbHkgc2FuZGJveGVkLCBhbmQgdGhhdCBpcyB0aGUgbGF5ZXIgYWN0dWFsbHkgZmFjaW5nIHdlYiBjb250ZW50LlxuLy8gV09MRlNQQUNFX0dQVV9TQU5EQk9YPTEgcmVzdG9yZXMgaXQgZm9yIGFueW9uZSB3aG9zZSBtYWNoaW5lIGlzIHVuYWZmZWN0ZWQuXG5pZiAoXG4gIHByb2Nlc3MuZW52LldPTEZTUEFDRV9HUFVfU0FOREJPWCAhPT0gXCIxXCIgJiZcbiAgcHJvY2Vzcy5lbnYuV09MRlNQQUNFX0dQVV9TQU5EQk9YICE9PSBcInRydWVcIlxuKSB7XG4gIGFwcC5jb21tYW5kTGluZS5hcHBlbmRTd2l0Y2goXCJkaXNhYmxlLWdwdS1zYW5kYm94XCIpO1xufVxuXG4vLyBGb3JjZSBOb2RlLmpzIChtYWluIHByb2Nlc3MgVjgpIHRvIEdDIHBlcmlvZGljYWxseVxuY29uc3QgX2djSW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gIGlmIChnbG9iYWwuZ2MpIHtcbiAgICBnbG9iYWwuZ2MoKTtcbiAgfVxufSwgNjAwMDApOyAvLyBldmVyeSAxIG1pbnV0ZVxuX2djSW50ZXJ2YWwudW5yZWYoKTsgLy8gZG8gbm90IGhvbGQgdGhlIHByb2Nlc3Mgb3BlbiBqdXN0IGZvciB0aGlzIGludGVydmFsXG5cbmFwcC53aGVuUmVhZHkoKS50aGVuKCgpID0+IHtcbiAgcHJvYmUuc3RhcnRTdG9wUHJvYmUoKTtcbiAgcHJvYmUuc3RhcnRMb29wUHJvYmUoKTtcbiAgbWlncmF0ZU9sZFVzZXJEYXRhT25jZSgpO1xuICByZWdpc3RlckFwcFByb3RvY29sKCk7XG4gIHJlZ2lzdGVySXBjKCk7XG4gIHN0YXJ0QmFja2VuZCgpO1xuICBjcmVhdGVXaW5kb3coKTtcbiAgLy8gSG90IHJlbG9hZDogc2VsdXJ1aCBzeXN0ZW0gV09MRlNQQUNFIHRhbnBhIHJlc2V0IG1hbnVhbFxuICB0cnkge1xuICAgIGNvbnN0IHJvb3QgPSB1bnBhY2tlZFJvb3QoKTtcbiAgICBjb25zdCBiYWNrZW5kRGlycyA9IFtcImFnZW50XCIsIFwiZWxlY3Ryb25cIiwgXCJzY3JpcHRzXCJdO1xuICAgIGNvbnN0IGJhY2tlbmRGaWxlcyA9IFtcbiAgICAgIFwic2VydmVyLmNqc1wiLFxuICAgICAgXCJ0ZXJtaW5hbC5janNcIixcbiAgICAgIFwiY29yZS5qc1wiLFxuICAgICAgXCJjb25maWcuanNvblwiLFxuICAgICAgXCJicmlkZ2UuanNcIixcbiAgICBdO1xuICAgIGNvbnN0IGZyb250ZW5kRGlycyA9IFtcInB1YmxpY1wiXTtcbiAgICBsZXQgZGVib3VuY2VUaW1lcjogYW55LCBiYWNrZW5kVGltZXI6IGFueTtcbiAgICBjb25zdCBpc0JhY2tlbmQgPSAoZnA6IGFueSkgPT4ge1xuICAgICAgY29uc3QgcmVsID0gcGF0aC5yZWxhdGl2ZShyb290LCBmcCkucmVwbGFjZSgvXFxcXC9nLCBcIi9cIik7XG4gICAgICBpZiAoXG4gICAgICAgIHJlbC5zdGFydHNXaXRoKFwicHVibGljL1wiKSB8fFxuICAgICAgICByZWwuc3RhcnRzV2l0aChcIi5naXQvXCIpIHx8XG4gICAgICAgIHJlbC5zdGFydHNXaXRoKFwibm9kZV9tb2R1bGVzL1wiKSB8fFxuICAgICAgICByZWwuc3RhcnRzV2l0aChcInN0dWRpby9cIikgfHxcbiAgICAgICAgcmVsLnN0YXJ0c1dpdGgoXCIuYXNhci1wYWNrL1wiKVxuICAgICAgKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICBmb3IgKGNvbnN0IGQgb2YgYmFja2VuZERpcnMpIGlmIChyZWwuc3RhcnRzV2l0aChkICsgXCIvXCIpKSByZXR1cm4gdHJ1ZTtcbiAgICAgIGZvciAoY29uc3QgZiBvZiBiYWNrZW5kRmlsZXMpIGlmIChyZWwgPT09IGYpIHJldHVybiB0cnVlO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH07XG4gICAgY29uc3QgaXNGcm9udGVuZCA9IChmcDogYW55KSA9PiB7XG4gICAgICBjb25zdCByZWwgPSBwYXRoLnJlbGF0aXZlKHJvb3QsIGZwKS5yZXBsYWNlKC9cXFxcL2csIFwiL1wiKTtcbiAgICAgIHJldHVybiByZWwuc3RhcnRzV2l0aChcInB1YmxpYy9cIik7XG4gICAgfTtcbiAgICAvLyBBIGJhc2VsaW5lIGhhc2ggb2YgZXZlcnkgYmFja2VuZCBBTkQgZnJvbnRlbmQgZmlsZSAtPiBGQUxTRSBmcy53YXRjaCBldmVudHNcbiAgICAvLyAoV2luZG93cyBvZnRlbiByZXBvcnRzIFwiY2hhbmdlZFwiIGZvciBhIGZpbGUgd2hvc2UgY29udGVudHMgZGlkIE5PVCBjaGFuZ2UgYXRcbiAgICAvLyBhbGwgXHUyMDE0IGRlbW9uc3RyYXRlZDogb2xkIHZlbmRvciBmaWxlcyBsaWtlIGJhYmVsLm1pbi5qcy9tb25hY28vZm9udHMgdHJpZ2dlcmVkIGFcbiAgICAvLyByZWxvYWQgZXZlbiB0aG91Z2ggdGhlaXIgbXRpbWUgd2FzIGZhciBvbGRlciB0aGFuIHRoaXMgcHJvY2VzcydzIHN0YXJ0KS4gV2l0aG91dFxuICAgIC8vIHRoaXMgZ3VhcmQsIGEgcmVsb2FkL3Jlc3RhcnQgY2FuIGZpcmUgYXQgcmFuZG9tIGFuZCBmZWVscyBsaWtlIFwiZWxlY3Ryb25cbiAgICAvLyByZWxvYWRpbmcgaXRzZWxmXCIgZm9yIG5vIGNsZWFyIHJlYXNvbi5cbiAgICBjb25zdCBjcnlwdG8gPSByZXF1aXJlKFwiY3J5cHRvXCIpO1xuICAgIGNvbnN0IF9ia0hhc2ggPSBuZXcgTWFwKCk7IC8vIHVzZWQgYnkgYmFja2VuZCAmIGZyb250ZW5kIFx1MjAxNCBoaXN0b3JpYyBuYW1lLCBzY29wZSBnZW5lcmFsaXNlZFxuICAgIGNvbnN0IF9oYXNoRmlsZSA9IChmcDogYW55KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gY3J5cHRvXG4gICAgICAgICAgLmNyZWF0ZUhhc2goXCJtZDVcIilcbiAgICAgICAgICAudXBkYXRlKGZzLnJlYWRGaWxlU3luYyhmcCkpXG4gICAgICAgICAgLmRpZ2VzdChcImhleFwiKTtcbiAgICAgIH0gY2F0Y2ggKF86IGFueSkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICB9O1xuICAgIC8vIEFTWU5DSFJPTk9VUzogcmVhZCBhbmQgaGFzaCBmaWxlcyB0aHJvdWdoIGZzLnByb21pc2VzIHNvIEVWRVJZIGZpbGUgcmV0dXJuc1xuICAgIC8vIGNvbnRyb2wgdG8gdGhlIGV2ZW50IGxvb3AuIFRoZSBvbGQgc3luY2hyb25vdXMgdmVyc2lvbiAoZnMucmVhZEZpbGVTeW5jKSBoYXNoZWRcbiAgICAvLyBBTEwgfjI5IE1CIG9mIHB1YmxpYy8gaW4gb25lIGJyZWF0aCBvbiB0aGUgTUFJTiBwcm9jZXNzLCByaWdodCBhZnRlclxuICAgIC8vIGNyZWF0ZVdpbmRvdygpOyBiZWNhdXNlIHRoZSBVSSBpcyBzZXJ2ZWQgb3ZlciB0aGUgYXBwOi8vIHByb3RvY29sIChhbHNvIG9uIHRoZVxuICAgIC8vIG1haW4gcHJvY2VzcyksIHRoYXQgYmxvY2tlZCBtYWluIHRocmVhZCBoZWxkIGJhY2sgZGVsaXZlcnkgb2YgaW5kZXguaHRtbCBhbmRcbiAgICAvLyBldmVyeSBhc3NldCAtPiB0aGUgd2luZG93IGFwcGVhcmVkIGJ1dCB3YXMgXCJOb3QgUmVzcG9uZGluZ1wiIHVudGlsIGhhc2hpbmdcbiAgICAvLyBmaW5pc2hlZC4gQXN5bmMgcmVhZEZpbGUgcGx1cyBhIHlpZWxkIGJldHdlZW4gZmlsZXMga2VlcHMgbWFpbiBzZXJ2aW5nIGFzc2V0c1xuICAgIC8vIHdoaWxlIHRoZSBzZWVkaW5nIHJ1bnMuXG4gICAgY29uc3QgX2hhc2hGaWxlQXN5bmMgPSAoZnA6IGFueSkgPT4ge1xuICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgaGFzaCA9IGNyeXB0by5jcmVhdGVIYXNoKFwibWQ1XCIpO1xuICAgICAgICAgIGNvbnN0IHN0cmVhbSA9IGZzLmNyZWF0ZVJlYWRTdHJlYW0oZnAsIHsgaGlnaFdhdGVyTWFyazogNjQgKiAxMDI0IH0pO1xuICAgICAgICAgIHN0cmVhbS5vbihcImRhdGFcIiwgKGNodW5rOiBhbnkpID0+IGhhc2gudXBkYXRlKGNodW5rKSk7XG4gICAgICAgICAgc3RyZWFtLm9uKFwiZW5kXCIsICgpID0+IHJlc29sdmUoaGFzaC5kaWdlc3QoXCJoZXhcIikpKTtcbiAgICAgICAgICBzdHJlYW0ub24oXCJlcnJvclwiLCAoKSA9PiByZXNvbHZlKG51bGwpKTtcbiAgICAgICAgfSBjYXRjaCAoXzogYW55KSB7XG4gICAgICAgICAgcmVzb2x2ZShudWxsKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfTtcbiAgICBjb25zdCBfc2VlZEhhc2hlcyA9IGFzeW5jIChcbiAgICAgIGRpcjogYW55LFxuICAgICAgZGVwdGg6IGFueSxcbiAgICAgIG1heERlcHRoOiBhbnksXG4gICAgICBleHRGaWx0ZXI6IGFueSxcbiAgICApID0+IHtcbiAgICAgIGlmIChkZXB0aCA+IG1heERlcHRoKSByZXR1cm47XG4gICAgICBsZXQgZW50cztcbiAgICAgIHRyeSB7XG4gICAgICAgIGVudHMgPSBhd2FpdCBmcy5wcm9taXNlcy5yZWFkZGlyKGRpciwgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pO1xuICAgICAgfSBjYXRjaCAoXzogYW55KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGZvciAoY29uc3QgZSBvZiBlbnRzKSB7XG4gICAgICAgIGlmIChlLm5hbWUgPT09IFwibm9kZV9tb2R1bGVzXCIgfHwgZS5uYW1lLnN0YXJ0c1dpdGgoXCIuXCIpKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgZnAgPSBwYXRoLmpvaW4oZGlyLCBlLm5hbWUpO1xuICAgICAgICBpZiAoZS5pc0RpcmVjdG9yeSgpKVxuICAgICAgICAgIGF3YWl0IF9zZWVkSGFzaGVzKGZwLCBkZXB0aCArIDEsIG1heERlcHRoLCBleHRGaWx0ZXIpO1xuICAgICAgICBlbHNlIGlmICghZXh0RmlsdGVyIHx8IGV4dEZpbHRlci50ZXN0KGUubmFtZSkpIHtcbiAgICAgICAgICBfYmtIYXNoLnNldChmcCwgYXdhaXQgX2hhc2hGaWxlQXN5bmMoZnApKTtcbiAgICAgICAgICAvLyBZaWVsZCB0aGUgZXZlbnQgbG9vcCBzbyBJUEMgLyB0aGUgcmVuZGVyZXIgVUkgZG9lcyBub3QgaGFuZ1xuICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyKSA9PiBzZXRJbW1lZGlhdGUocikpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcbiAgICAvLyBCYXNlbGluZS1oYXNoIHNlZWRpbmcgcnVucyBTRVBBUkFURUxZIGFuZCBkb2VzIG5vdCBob2xkIHVwIHdoZW5SZWFkeS4gVGhlXG4gICAgLy8gd2F0Y2hlciBhbHJlYWR5IGhhcyBhIDQtc2Vjb25kIGdyYWNlIHBlcmlvZCAoX3dhdGNoU3RhcnQpIGJlZm9yZSBpdCByZWFjdHMsIHNvXG4gICAgLy8gaXQgaXMgc2FmZSBpZiBzZWVkaW5nIGhhcyBub3QgZmluaXNoZWQgd2hlbiB3YXRjaGluZyBzdGFydHMgXHUyMDE0IGVhcmx5IGV2ZW50cyBhcmVcbiAgICAvLyBpZ25vcmVkLlxuICAgIGNvbnN0IF9zZWVkQWxsID0gYXN5bmMgKCkgPT4ge1xuICAgICAgZm9yIChjb25zdCBkIG9mIGJhY2tlbmREaXJzKSB7XG4gICAgICAgIGNvbnN0IHAgPSBwYXRoLmpvaW4ocm9vdCwgZCk7XG4gICAgICAgIGlmIChmcy5leGlzdHNTeW5jKHApKSBhd2FpdCBfc2VlZEhhc2hlcyhwLCAwLCA0LCAvXFwuKGM/anN8anNvbikkLyk7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IGYgb2YgYmFja2VuZEZpbGVzKSB7XG4gICAgICAgIGNvbnN0IHAgPSBwYXRoLmpvaW4ocm9vdCwgZik7XG4gICAgICAgIGlmIChmcy5leGlzdHNTeW5jKHApKSBfYmtIYXNoLnNldChwLCBhd2FpdCBfaGFzaEZpbGVBc3luYyhwKSk7XG4gICAgICB9XG4gICAgICAvLyBwdWJsaWMvIG5lZWRzIGZhciBncmVhdGVyIGRlcHRoIChtb25hY28gbmVzdHMgfjEwIGxldmVscywgZm9yIGluc3RhbmNlKSBhbmRcbiAgICAgIC8vIE5PIGV4dGVuc2lvbiBmaWx0ZXIgXHUyMDE0IGV2ZXJ5IGZpbGUgdHlwZSAoanMsIGNzcywgaHRtbCwgZm9udCwgYW5kIHNvIG9uKSBjYW5cbiAgICAgIC8vIHRyaWdnZXIgdGhlIHNhbWUgZmFsc2UgZXZlbnQsIHNvIGFsbCBvZiB0aGVtIG5lZWQgYSBiYXNlbGluZSBoYXNoLlxuICAgICAgY29uc3QgcHViRGlyID0gcGF0aC5qb2luKHJvb3QsIFwicHVibGljXCIpO1xuICAgICAgaWYgKGZzLmV4aXN0c1N5bmMocHViRGlyKSkgYXdhaXQgX3NlZWRIYXNoZXMocHViRGlyLCAwLCAyMCwgbnVsbCk7XG4gICAgfTtcbiAgICBfc2VlZEFsbCgpO1xuICAgIGNvbnN0IF93YXRjaFN0YXJ0ID0gRGF0ZS5ub3coKTtcbiAgICAvLyBNZW5nYWt0aWZrYW4ga2VtYmFsaSBIb3QgUmVsb2FkXG4gICAgaWYgKGZzLmV4aXN0c1N5bmMocm9vdCkgJiYgIXByb2Nlc3MuZW52LkVMRUNUUk9OX1JVTl9BU19OT0RFKSB7XG4gICAgICBjb25zdCBoYW5kbGVXYXRjaCA9IChiYXNlRGlyOiBhbnksIGV2ZW50VHlwZTogYW55LCBmaWxlbmFtZTogYW55KSA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAhZmlsZW5hbWUgfHxcbiAgICAgICAgICBwYXRoLmJhc2VuYW1lKGZpbGVuYW1lKS5zdGFydHNXaXRoKFwiLlwiKSB8fFxuICAgICAgICAgIGZpbGVuYW1lLmluY2x1ZGVzKFwibm9kZV9tb2R1bGVzXCIpIHx8XG4gICAgICAgICAgZmlsZW5hbWUuaW5jbHVkZXMoXCIuZ2l0XCIpIHx8XG4gICAgICAgICAgZmlsZW5hbWUuZW5kc1dpdGgoXCJ+XCIpIHx8XG4gICAgICAgICAgZmlsZW5hbWUuZW5kc1dpdGgoXCIuc3dwXCIpXG4gICAgICAgIClcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIGNsZWFyVGltZW91dChkZWJvdW5jZVRpbWVyKTtcbiAgICAgICAgZGVib3VuY2VUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IGZ1bGxQYXRoID0gcGF0aC5qb2luKGJhc2VEaXIsIGZpbGVuYW1lKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKGZ1bGxQYXRoKSB8fCBmcy5zdGF0U3luYyhmdWxsUGF0aCkuaXNEaXJlY3RvcnkoKSlcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH0gY2F0Y2ggKF86IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJTVBPUlRBTlQ6IHRoZSBiYXNlbGluZSBoYXNoIChfYmtIYXNoKSBpcyBub3cgc2VlZGVkIEFTWU5DSFJPTk9VU0xZIChzZWVcbiAgICAgICAgICAvLyBfc2VlZEFsbCBcdTIwMTQgdGhlIHN0YXJ0dXAtZnJlZXplIGZpeCksIHNvIGl0IG1heSBOT1QgZXhpc3QgeWV0IHdoZW4gYW5cbiAgICAgICAgICAvLyBmcy53YXRjaCBldmVudCBhcnJpdmVzLCBldmVuIGFmdGVyIHRoZSA0LXNlY29uZCBncmFjZSAocHVibGljLyAyOSBNQiBpc1xuICAgICAgICAgIC8vIHNlZWRlZCBsYXN0KS4gV2l0aG91dCBhIGJhc2VsaW5lIHdlIENBTk5PVCB0ZWxsIHdoZXRoZXIgdGhlIGZpbGUgcmVhbGx5XG4gICAgICAgICAgLy8gY2hhbmdlZDsgYSBGQUxTRSBXaW5kb3dzIGV2ZW50IChpZGVudGljYWwgY29udGVudHMpIHdvdWxkIHRoZW4gYmVcbiAgICAgICAgICAvLyBtaXN0YWtlbiBmb3IgXCJjaGFuZ2VkXCIgLT4gYSBQSEFOVE9NIHJlbG9hZC9yZXN0YXJ0LiBUaGUgY29ycmVjdCBydWxlOiBpZlxuICAgICAgICAgIC8vIHRoZSBiYXNlbGluZSBpcyBtaXNzaW5nICh1bmRlZmluZWQpIE9SIGVxdWFsIC0+IHNlZWQgYW5kIFNUQVkgUVVJRVQ7XG4gICAgICAgICAgLy8gcmVhY3QgT05MWSB3aGVuIHRoZSBiYXNlbGluZSBpcyBrbm93biBBTkQgdGhlIGNvbnRlbnRzIGRpZmZlci5cbiAgICAgICAgICBpZiAoaXNGcm9udGVuZChmdWxsUGF0aCkpIHtcbiAgICAgICAgICAgIGlmIChEYXRlLm5vdygpIC0gX3dhdGNoU3RhcnQgPCA0MDAwKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBwcmV2ID0gX2JrSGFzaC5nZXQoZnVsbFBhdGgpO1xuICAgICAgICAgICAgY29uc3QgaGYgPSBfaGFzaEZpbGUoZnVsbFBhdGgpO1xuICAgICAgICAgICAgaWYgKCFoZikgcmV0dXJuO1xuICAgICAgICAgICAgX2JrSGFzaC5zZXQoZnVsbFBhdGgsIGhmKTtcbiAgICAgICAgICAgIGlmIChwcmV2ID09PSB1bmRlZmluZWQgfHwgcHJldiA9PT0gaGYpIHJldHVybjtcbiAgICAgICAgICAgIF90dW5kYVNlbGFnaVNpYnVrKFwiaG1yIFwiICsgZmlsZW5hbWUsICgpID0+IHtcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCB3aW5zID0gQnJvd3NlcldpbmRvdy5nZXRBbGxXaW5kb3dzKCk7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCB3IG9mIHdpbnMpXG4gICAgICAgICAgICAgICAgICB3LndlYkNvbnRlbnRzLnNlbmQoXCJXT0xGU1BBQ0U6aG1yXCIsIGZpbGVuYW1lKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIltobXJdIGZyb250ZW5kIHVwZGF0ZSBzZW50IHRvIFVJIGZvcjpcIiwgZmlsZW5hbWUpO1xuICAgICAgICAgICAgICB9IGNhdGNoIChfOiBhbnkpIHt9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGlzQmFja2VuZChmdWxsUGF0aCkpIHtcbiAgICAgICAgICAgIGlmIChEYXRlLm5vdygpIC0gX3dhdGNoU3RhcnQgPCA0MDAwKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBwcmV2ID0gX2JrSGFzaC5nZXQoZnVsbFBhdGgpO1xuICAgICAgICAgICAgY29uc3QgaCA9IF9oYXNoRmlsZShmdWxsUGF0aCk7XG4gICAgICAgICAgICBpZiAoIWgpIHJldHVybjtcbiAgICAgICAgICAgIF9ia0hhc2guc2V0KGZ1bGxQYXRoLCBoKTtcbiAgICAgICAgICAgIGlmIChwcmV2ID09PSB1bmRlZmluZWQgfHwgcHJldiA9PT0gaCkgcmV0dXJuO1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KGJhY2tlbmRUaW1lcik7XG4gICAgICAgICAgICBiYWNrZW5kVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgX3R1bmRhU2VsYWdpU2lidWsoXCJiYWNrZW5kIFwiICsgZmlsZW5hbWUsICgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgICAgICAgIFwiW2hvdC1yZWxvYWRdIGJhY2tlbmQgY2hhbmdlZCwgcmVsb2FkaW5nIGNvcmUgaW4tbWVtb3J5OlwiLFxuICAgICAgICAgICAgICAgICAgZmlsZW5hbWUsXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICBjb25zdCByb290RGlyID0gdW5wYWNrZWRSb290KCk7XG4gICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGsgb2YgT2JqZWN0LmtleXMocmVxdWlyZS5jYWNoZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGsuc3RhcnRzV2l0aChyb290RGlyKSkgZGVsZXRlIHJlcXVpcmUuY2FjaGVba107XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBfY29yZSA9IG51bGw7XG4gICAgICAgICAgICAgICAgICBjb3JlKCk7XG4gICAgICAgICAgICAgICAgICBjb25zdCBtcyA9IHBlcmZvcm1hbmNlLm5vdygpIC0gdDA7XG4gICAgICAgICAgICAgICAgICBpZiAobXMgPj0gMTAwKVxuICAgICAgICAgICAgICAgICAgICBwcm9iZS5zYXkoXCJob3QtcmVsb2FkIGNvcmUgXCIgKyBtcy50b0ZpeGVkKDApICsgXCJtc1wiKTtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiW2hvdC1yZWxvYWRdIGJhY2tlbmQgcmVsb2FkZWQgc3VjY2Vzc2Z1bGx5IVwiKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgICAgICAgICAgXCJbaG90LXJlbG9hZF0gZXJyb3IgcmVsb2FkaW5nIGNvcmU6XCIsXG4gICAgICAgICAgICAgICAgICAgIGVyci5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgNTAwKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sIDMwMCk7XG4gICAgICB9O1xuXG4gICAgICBjb25zdCBXQVRDSF9ESVJTID0gW1wicHVibGljXCIsIFwiZWxlY3Ryb25cIiwgXCJhZ2VudFwiLCBcInNjcmlwdHNcIl07XG4gICAgICBmb3IgKGNvbnN0IGQgb2YgV0FUQ0hfRElSUykge1xuICAgICAgICBjb25zdCBkcCA9IHBhdGguam9pbihyb290LCBkKTtcbiAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoZHApKSB7XG4gICAgICAgICAgZnMud2F0Y2goZHAsIHsgcmVjdXJzaXZlOiB0cnVlIH0sIChldmVudFR5cGU6IGFueSwgZmlsZW5hbWU6IGFueSkgPT5cbiAgICAgICAgICAgIGhhbmRsZVdhdGNoKGRwLCBldmVudFR5cGUsIGZpbGVuYW1lKSxcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IGYgb2YgYmFja2VuZEZpbGVzKSB7XG4gICAgICAgIGNvbnN0IGZwID0gcGF0aC5qb2luKHJvb3QsIGYpO1xuICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyhmcCkpIHtcbiAgICAgICAgICBmcy53YXRjaChmcCwgKGV2ZW50VHlwZTogYW55LCBmaWxlbmFtZTogYW55KSA9PlxuICAgICAgICAgICAgaGFuZGxlV2F0Y2gocm9vdCwgZXZlbnRUeXBlLCBmaWxlbmFtZSB8fCBmKSxcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9IGNhdGNoIChfOiBhbnkpIHt9XG59KTtcbmFwcC5vbihcIndpbmRvdy1hbGwtY2xvc2VkXCIsICgpID0+IHtcbiAgZm9yIChjb25zdCBwIG9mIHByb2NzKSB7XG4gICAgdHJ5IHtcbiAgICAgIHAua2lsbCgpO1xuICAgIH0gY2F0Y2ggKGU6IGFueSkge31cbiAgfVxuICBhcHAucXVpdCgpO1xufSk7XG5cbi8vIE1hcmtzIHRoaXMgZmlsZSBhcyBhIE1PRFVMRSByYXRoZXIgdGhhbiBhIGdsb2JhbCBzY3JpcHQuIFdpdGhvdXQgaXQgZXZlcnlcbi8vIHRvcC1sZXZlbCBjb25zdCBsYW5kcyBpbiB0aGUgZ2xvYmFsIHNjb3BlIGFuZCBjb2xsaWRlcyB3aXRoIHRoZSBET00gbGliIFx1MjAxNFxuLy8gYGNyeXB0b2AgaGVyZSB3b3VsZCBzaGFkb3cgdGhlIGJyb3dzZXIgYGNyeXB0b2AsIGFuZCBub2RlOmNyeXB0bydzIGNyZWF0ZUhhc2hcbi8vIHdvdWxkIHZhbmlzaC4gUGxhY2VkIGF0IHRoZSBlbmQsIGFuZCBsZWZ0IGFzIGBleHBvcnQge31gIHJhdGhlciB0aGFuIGNvbnZlcnRpbmdcbi8vIHRoZSByZXF1aXJlcyB0byBpbXBvcnRzLCBiZWNhdXNlIGltcG9ydHMgSE9JU1Q6IHRoZSBzdGFydHVwIG9yZGVyIGluIHRoaXMgZmlsZVxuLy8gd2FzIGRlbGliZXJhdGVseSB0dW5lZCAoMTA3MSBtcyAtPiAzMTQgbXMpIGFuZCBsYXp5IHJlcXVpcmVzIG11c3Qgc3RheSBsYXp5LlxuZXhwb3J0IHt9O1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFHQSxNQUFNLEVBQUUsS0FBSyxlQUFlLE9BQU8sU0FBUyxTQUFTLElBQUksUUFBUSxVQUFVO0FBQzNFLE1BQU0sRUFBRSxPQUFPLFNBQVMsSUFBSSxRQUFRLGVBQWU7QUFDbkQsTUFBTSxPQUFPLFFBQVEsTUFBTTtBQUMzQixNQUFNLEtBQUssUUFBUSxJQUFJO0FBQ3ZCLE1BQU0sT0FBTyxRQUFRLE1BQU07QUFFM0IsTUFBTSxPQUFPLEtBQUssS0FBSyxXQUFXLElBQUk7QUFDdEMsTUFBTSxPQUFPO0FBQ2IsTUFBTSxRQUFlLENBQUM7QUFDdEIsTUFBTSxRQUFRLFFBQVEsU0FBUztBQUM5QixPQUFlLFVBQVU7QUFjMUIsTUFBTSxTQUFTLFFBQVEsUUFBUTtBQUMvQixJQUFJLFFB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
