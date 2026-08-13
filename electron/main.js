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

// findRuntime() DIHAPUS — nol pemanggil. Pencarian runtime bun/node relevan
// saat backend di-spawn sebagai proses terpisah; sejak backend jalan
// in-process lewat core.js, ia tak pernah dipakai lagi.

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

// waitReady() DIHAPUS — komentarnya sendiri sudah menandainya OBSOLETE, dan
// isinya memang hanya cb() tanpa menunggu apa pun. Nol pemanggil.

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
  // WOLFSPACE_BACKEND mengarahkan jendela ke backend yang berjalan di tempat lain
  // — dipakai untuk menjalankan backend di dalam WSL, satu-satunya tempat
  // pengurungan jaringan zona (unshare -n) benar-benar berlaku. Kosong = perilaku
  // lama: UI dilayani dari disk lewat protocol app://.
  //
  // Preload ikut membaca env yang sama dan mematikan bendera `ipc`, supaya
  // frontend memakai jalur HTTP ke origin ini alih-alih core in-process.
  const BACKEND = process.env.WOLFSPACE_BACKEND;
  if (BACKEND) {
    console.log("[WOLFSPACE] backend eksternal: " + BACKEND);
    win.loadURL(BACKEND);
  } else {
    win.loadURL("app://WOLFSPACE/index.html"); // served from disk via the app:// protocol
  }
  // open real external links in the system browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  // Teruskan console.log/warn/error dari RENDERER ke stdout proses main — tanpa ini
  // console.log di app.jsx (browser DevTools) tak pernah terlihat lewat terminal/log
  // dev, hanya lewat DevTools yang tak selalu dibuka. Beda dari dlog/[WOLFSPACE:xxx]
  // yang berasal dari proses BACKEND (Node), bukan renderer.
  // Electron >= 33 mengirim SATU objek event ({level, message, lineNumber,
  // sourceId, frame}) — bukan lagi (event, level, message, line, sourceId).
  // Dengan tanda tangan lama, `message` menerima argumen posisi yang salah dan
  // yang tercetak justru objek `console` global secara utuh, satu kali PER BARIS
  // log renderer. Terpantau di app nyata: satu baris "[Composer] render" ikut
  // menyeret dump 25 properti console. Kedua bentuk didukung di sini supaya
  // tak terikat satu versi Electron.
  const LEVELS = ["log", "warning", "error"];
  win.webContents.on("console-message", (...a) => {
    const ev =
      a[0] && typeof a[0] === "object" && "message" in a[0] ? a[0] : null;
    const level = ev ? ev.level : a[1];
    const message = ev ? ev.message : a[2];
    console.log("[renderer:" + (LEVELS[level] || level) + "]", message);
  });
}

// â”€â”€ IPC: renderer â†” Node core, no HTTP â”€â”€
let _core = null;
function core() {
  if (_core) return _core;
  _core = require(path.join(unpackedRoot(), "core.js")); // single source; requiring does NOT open a port
  return _core;
}
const _streams = new Map(); // id -> { cancelled, req, channel }

// ── Hot-reload DITUNDA selama agent bekerja ──
//
// KENAPA ADA. Agent WOLFSPACE menyunting sumbernya sendiri, dan direktori yang
// dipantau (public, electron, agent, scripts) persis yang disuntingnya. Jadi
// agent memicu reload-nya SENDIRI, di tengah run, tanpa satu pun penjaga.
// Akibatnya berantai:
//   - suntingan di public/** non-js  -> UI menjalankan window.location.reload()
//     (public/index.html), dan thread_id yang hidup di state React ikut hilang;
//   - permintaan berikutnya dikirim TANPA thread_id, sehingga self_agent.cjs
//     mencetak thread baru, MemorySaver tak punya checkpoint untuknya, dan agent
//     mulai dari nol — persis gejala "agent mengulang pekerjaan";
//   - suntingan di agent/** membuang require.cache lalu membangun ulang core di
//     tengah run yang sedang memakainya.
//
// Reload tidak DIBATALKAN, hanya ditunda sampai run terakhir selesai — supaya
// tujuan aslinya (agent melihat perubahan sumbernya sendiri) tetap tercapai.
let _reloadTertunda = null;
// Run agent yang lebih tua dari ini dianggap TIDAK lagi menahan reload.
//
// KENAPA ADA BATAS SAMA SEKALI. Penjaga ini bergantung pada finish() yang selalu
// dipanggil. Sekali saja terlewat — dan sudah pernah: lemparan SINKRON dari fn()
// melewati Promise.resolve lalu keluar dari handler — entri stream tertinggal
// selamanya, _agentSibuk() terus true, dan aplikasi berhenti memperbarui diri
// TANPA pesan apa pun. Gejalanya cuma "perubahan tidak muncul", yang tak
// menunjuk ke sini sedikit pun.
//
// Jadi kebergantungan itu dibatasi waktu. Reload yang menembak di menit ke-15
// sebuah run jauh lebih ringan akibatnya daripada hot-reload yang mati diam-diam
// dan baru ketahuan setelah lama bertanya-tanya kenapa kode tak berubah.
const AGENT_SIBUK_MAKS_MS = 15 * 60 * 1000;
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
    // Hanya yang TERAKHIR yang disimpan: menumpuk reload tak ada gunanya, yang
    // dibutuhkan cuma satu kali muat ulang setelah semuanya reda.
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

// Run a non-streaming HTTP endpoint IN-PROCESS via mock req/res against core's
// request handler â€” reuses every existing JSON handler without extracting them,
// so the renderer can drop fetch() in favour of IPC. (Streaming endpoints use
// WOLFSPACE:stream instead.)
const { PassThrough, Writable } = require("stream");
// Menandai "respons sudah ditutup" pada objek res TIRUAN, dengan cara yang
// benar-benar terbaca oleh handler.
//
// KENAPA TIDAK CUKUP `res.writableEnded = true`. `writableEnded` dan
// `writableFinished` adalah ACCESSOR HANYA-BACA di prototipe Writable — tak
// punya setter. Menugaskannya dari kode non-strict TIDAK melempar dan TIDAK
// mengubah apa pun; ia diabaikan dalam diam. Diverifikasi langsung:
//
//   const res = new Writable();
//   res.writableEnded = true;
//   res.writableEnded            // -> false
//   hasOwnProperty('writableEnded') -> false
//
// Akibatnya seluruh 17 penjaga di server.cjs MATI di jalur desktop, karena
// di sini res bukan ServerResponse asli melainkan Writable telanjang yang
// method end()-nya ditimpa — jadi mesin stream aslinya tak pernah jalan dan
// nilai bawaannya `false` selamanya. Yang ikut mati:
//
//   if (!res.writableEnded) res.write(...)   -> menulis SESUDAH respons ditutup
//   if (!res.writableEnded) res.end()        -> menutup dua kali
//   if (cancelled || res.writableEnded) ...  -> pemeriksaan batal tak pernah benar
//
// Yang terakhir yang paling terasa: itu satu-satunya rem yang menghentikan
// kerja setelah pemakai membatalkan.
function _pasangTandaSelesai(res) {
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

// ── Browser sungguhan di dalam panel "Web Dev Live Browser" ──
//
// KENAPA BUKAN <iframe>. Renderer ini TIDAK BISA memuat situs luar lewat
// subframe sama sekali. Diukur sampai tuntas: permintaan subFrame dikirim lalu
// net::ERR_ABORTED sebelum satu pun header respons kembali. Yang disingkirkan
// satu per satu sebagai penyebab — atribut sandbox iframe, CSP <meta> produksi,
// X-Frame-Options situsnya, User-Agent Electron, dan jaringan (net.fetch dari
// proses main mengembalikan 200, 473 KB dari Bing). Yang memutuskan adalah uji
// pemakai: wikipedia.org pun kosong, padahal Wikipedia terbukti boleh di-frame.
//
// KENAPA BUKAN <webview>. Sudah dicoba, dan Electron CRASH:
//   FATAL:check.cc(361) Check failed: false. NOTREACHED
// Tag itu memang jalur yang tak dianjurkan Electron dan dirawat seadanya.
//
// WebContentsView adalah cara yang didukung: ia WebContents penuh — persis
// seperti tab browser — yang dipasang sebagai lapisan di atas jendela. Tak ada
// pembatasan frame yang berlaku padanya.
//
// HARGA YANG DIBAYAR, dan ini disebut supaya tak mengagetkan: ia MENGAMBANG di
// atas DOM, bukan mengalir di dalamnya. Jadi posisinya harus disuapi dari
// renderer (bounds panel), dan ia WAJIB disembunyikan saat panel ditutup atau
// tertutup dialog — kalau tidak, ia menutupi UI. Itu sebabnya renderer memanggil
// `sembunyi` secara eksplisit, bukan mengandalkan CSS.
let _br = null; // { tampil: WebContentsView, win }
function _brWin() {
  return BrowserWindow.getAllWindows()[0] || null;
}
function _brBuat() {
  if (_br) return _br;
  const win = _brWin();
  if (!win) return null;
  const { WebContentsView } = require("electron");
  // ── sandbox: false, dan ini keputusan yang harus dijelaskan ──
  //
  // Di mesin ini Chromium TIDAK BISA melahirkan proses renderer ber-sandbox.
  // Itu bukan dugaan; ia diukur berlapis:
  //
  //   net.fetch dari proses main      -> 200 (jaringan sehat)
  //   resolveProxy                    -> DIRECT (tak ada proxy)
  //   permintaan navigasi             -> TERKIRIM, bahkan mengikuti pengalihan
  //                                      wikipedia.org -> www.wikipedia.org
  //   webRequest.onErrorOccurred      -> TIDAK PERNAH menyala
  //   loadURL                         -> ERR_FAILED (-2)
  //
  // Jaringannya berhasil; yang gagal PEMBUATAN PROSES untuk menampung halaman
  // itu. Navigasi lintas-situs menuntut renderer baru, dan renderer baru tak
  // pernah lahir. Gejala sekeluarga sudah muncul dua kali di mesin ini: proses
  // GPU mati dengan STATUS_DLL_NOT_FOUND sampai --disable-gpu-sandbox dipasang,
  // dan <webview> membuat Electron crash NOTREACHED.
  //
  // Diuji tiga pilihan; hanya yang PALING SEMPIT ini yang dipakai:
  //   --no-sandbox (seluruh aplikasi)   -> berhasil, tapi jauh melebihi kebutuhan
  //   site isolation dimatikan          -> TETAP GAGAL
  //   sandbox: false pada view ini saja -> berhasil, 2022 karakter ter-render
  //
  // Yang TIDAK ikut dilonggarkan, dan itu yang menahan risikonya: nodeIntegration
  // tetap mati dan contextIsolation tetap hidup, jadi halaman asing tak punya
  // jalan ke Node maupun ke konteks preload. Yang hilang hanya kurungan OS —
  // dan di mesin ini kurungan itu memang tak pernah bisa dipakai; pilihannya
  // bukan "ber-sandbox vs tidak", melainkan "jalan vs tidak jalan sama sekali".
  //
  // Bisa dikembalikan dengan WOLFSPACE_BROWSER_SANDBOX=1 di mesin yang sehat.
  const tampil = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: process.env.WOLFSPACE_BROWSER_SANDBOX === "1",
      webSecurity: true,
    },
  });
  const wc = tampil.webContents;
  // Semua keadaan dikirim balik ke renderer, supaya bilah alamat dan pesan
  // galat di panel memang mencerminkan apa yang benar-benar terjadi.
  const kirim = (t, d) => {
    try {
      win.webContents.send("WOLFSPACE:browser", { t, ...d });
    } catch (_) {}
  };
  wc.on("did-start-loading", () => kirim("muat", {}));
  wc.on("did-stop-loading", () =>
    kirim("selesai", { url: wc.getURL(), judul: wc.getTitle() }),
  );
  wc.on("did-fail-load", (_e, kode, desc, url, utama) => {
    if (!utama) return;
    kirim("gagal", { kode, desc, url });
  });
  wc.on("did-navigate", (_e, url) => kirim("pindah", { url }));
  wc.on("did-navigate-in-page", (_e, url) => kirim("pindah", { url }));
  // Tautan yang membuka jendela baru dibuka DI PANEL ini, bukan di browser OS —
  // itu yang diharapkan dari sebuah browser di dalam aplikasi.
  wc.setWindowOpenHandler(({ url }) => {
    wc.loadURL(url);
    return { action: "deny" };
  });
  _br = { tampil, win };
  return _br;
}
// Electron adalah DUA mesin: renderer (web) dan main (node). Saat panel putih,
// pertanyaan pertama selalu "yang mana yang gagal" — dan tanpa catatan dari sisi
// main, satu-satunya yang terlihat hanyalah putih, yang bisa berarti apa saja:
// view tak pernah dibuat, dibuat tapi tak dipasang, dipasang tapi bounds-nya
// nol, terpasang dengan benar tapi halamannya yang tak dimuat, atau termuat
// tapi tertutup lapisan lain.
//
// Versi pertama fungsi ini justru MENELAN jawabannya: addChildView dan
// removeChildView dibungkus `try { } catch (_) {}`. Kalau pemasangan lapisan
// itulah yang gagal, galatnya hilang tanpa jejak dan gejalanya tetap "putih".
//
// console.log di proses main diteruskan ke WOLFSPACE-debug.log, jadi catatan ini
// bisa dibaca sesudah kejadian — tak perlu menebak dari layar.
function _brLog(pesan, data) {
  try {
    console.log(
      "[browser] " + pesan + (data ? " " + JSON.stringify(data) : ""),
    );
  } catch (_) {}
}
function _brKeadaan() {
  if (!_br) return { ada: false };
  const wc = _br.tampil.webContents;
  let anak = -1;
  try {
    anak = _br.win.contentView.children.length;
  } catch (_) {}
  let b = null;
  try {
    b = _br.tampil.getBounds();
  } catch (_) {}
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
function browserAksi(p) {
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
    _brLog("_brBuat mengembalikan null — tak ada jendela");
    return { ok: false, error: "tak ada jendela" };
  }

  // Bounds NOL adalah salah satu sebab "putih" yang paling mudah terlewat:
  // viewnya ada, terpasang, halamannya termuat — hanya saja ukurannya 0x0.
  // Itu sebabnya nilai yang diterima ikut dicatat, bukan cuma dipakai.
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
    } catch (e) {
      _brLog("setBounds GAGAL", { kotak, pesan: e.message });
      return { ok: false, error: "setBounds: " + e.message };
    }
  }

  if (aksi === "tampil" || aksi === "buka") {
    try {
      // Dipasang hanya bila BELUM terpasang. Memanggilnya berulang tiap denyut
      // memindahkan view ke urutan paling atas berkali-kali — kerja sia-sia yang
      // juga bisa mengacaukan susunan lapisan lain.
      const anak = b.win.contentView.children || [];
      if (!anak.includes(b.tampil)) {
        b.win.contentView.addChildView(b.tampil);
        _brLog("view dipasang", {
          anakSekarang: b.win.contentView.children.length,
        });
      }
    } catch (e) {
      // Dulu ditelan `catch (_) {}` — kalau justru pemasangan lapisan yang
      // gagal, gejalanya "putih" tanpa satu pun jejak.
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
      if (res._selesai) return; // handler yang memanggil end() dua kali tak menjawab dua kali
      if (chunk) res._chunks.push(Buffer.from(chunk));
      res._selesai = true;
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
    // channel disimpan supaya penjaga hot-reload tahu run agent sedang hidup.
    const st = { cancelled: false, req: null, channel, mulai: Date.now() };
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
      // Dihapus DULU dari _streams, baru dilepas — supaya _agentSibuk() melihat
      // keadaan sesudah run ini berakhir, bukan sebelumnya.
      _lepasReloadTertunda();
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
    // fn DIPANGGIL DI DALAM try: `Promise.resolve(fn(...))` saja tidak cukup,
    // karena lemparan SINKRON terjadi sebelum Promise.resolve sempat
    // membungkusnya — lemparannya keluar dari handler ini dan finish() tak
    // pernah jalan. Stream lalu tertinggal selamanya di _streams, dan sejak ada
    // penjaga hot-reload akibatnya berlipat: _agentSibuk() terus true, jadi
    // SETIAP reload ditunda tanpa batas dan aplikasi berhenti memperbarui diri
    // tanpa satu pun pesan kesalahan.
    try {
      Promise.resolve(fn(payload, emit, ctl)).then(finish, (err) => {
        emit({ t: "err", m: (err && err.message) || String(err) });
        finish();
      });
    } catch (err) {
      emit({ t: "err", m: (err && err.message) || String(err) });
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

// === MEMORY OPTIMIZATIONS ===
// Batasi RAM Chromium renderer agar tidak membengkak ke 5GB+.
// Flag ini wajib dipanggil SEBELUM app.whenReady().
// - js-flags: batasi V8 heap Node.js di main process (backend/agent)
// - max-old-space-size: batas heap V8 main process (MB)
// - disable-gpu-memory-buffer-compositor-resources: bebaskan GPU buffer
// - memory-pressure-thresholds: paksa Chromium GC lebih agresif
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=512");
app.commandLine.appendSwitch("disable-http-cache");
app.commandLine.appendSwitch("enable-precise-memory-info");
// Paksa Chromium untuk melakukan GC ketika tekanan memori terdeteksi
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
// Matikan compositing tile memory cap untuk mengurangi beban VRAM
app.commandLine.appendSwitch("disable-gpu-memory-buffer-compositor-resources");

// === SANDBOX GPU ===
// Tanpa ini aplikasi TIDAK JALAN SAMA SEKALI di sebagian mesin Windows.
//
// Gejalanya: proses GPU anak mati berulang dengan exit_code=-1073741515
// (STATUS_DLL_NOT_FOUND), Chromium mencoba lagi delapan-sembilan kali, lalu
// menyerah dengan FATAL "GPU process isn't usable. Goodbye." dan MEMBUNUH
// seluruh aplikasi. Jendela tak pernah muncul, dan satu-satunya jejak adalah
// deretan baris ERROR gpu_process_host yang terlihat seperti peringatan biasa.
//
// Penyebabnya bukan Electron yang cacat: seluruh DLL-nya lengkap, dan proses
// utamanya sehat. STATUS_DLL_NOT_FOUND pada proses anak yang DI-SANDBOX punya
// sebab yang sudah dikenal — sandbox menolak memuat DLL yang disuntikkan
// pihak ketiga (antivirus, overlay, utilitas driver) ke dalam proses itu.
//
// Terukur, keempatnya pada mesin yang terkena:
//   apa adanya             FATAL dalam 1 detik, 9 kali crash GPU
//   --disable-gpu          FATAL juga, 6 kali crash  <- TIDAK menolong
//   --in-process-gpu       hidup, tapi seluruh GPU ditarik ke proses utama
//   --disable-gpu-sandbox  hidup, 0 crash, akselerasi & isolasi render UTUH
//
// Yang ditukar: lapisan sandbox pada proses GPU saja. Proses render tetap
// ter-sandbox penuh, dan itu lapisan yang benar-benar menghadapi konten web.
// WOLFSPACE_GPU_SANDBOX=1 mengembalikannya bagi yang mesinnya tak terkena.
if (
  process.env.WOLFSPACE_GPU_SANDBOX !== "1" &&
  process.env.WOLFSPACE_GPU_SANDBOX !== "true"
) {
  app.commandLine.appendSwitch("disable-gpu-sandbox");
}

// Paksa Node.js (V8 main process) untuk melakukan GC periodik
const _gcInterval = setInterval(() => {
  if (global.gc) {
    global.gc();
  }
}, 60000); // setiap 1 menit
_gcInterval.unref(); // jangan tahan proses hanya karena interval ini

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
            _tundaSelagiSibuk("hmr " + filename, () => {
              try {
                const wins = BrowserWindow.getAllWindows();
                for (const w of wins)
                  w.webContents.send("WOLFSPACE:hmr", filename);
                console.log("[hmr] frontend update sent to UI for:", filename);
              } catch (_) {}
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
              });
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
