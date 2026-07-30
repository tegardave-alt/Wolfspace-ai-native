#!/usr/bin/env node
// Peluncur WOLFSPACE dengan backend di dalam WSL.
//
// KENAPA ADA. Pengurungan jaringan zona kapabilitas (`unshare -n`) hanya berlaku
// di Linux — model permission Node tak punya dimensi jaringan, dan aturan
// firewall Windows bersifat per-executable sehingga tak bisa membedakan proses
// zona dari host (keduanya node.exe yang sama). Jadi satu-satunya cara memakainya
// di Windows adalah menjalankan backend di WSL dan mengarahkan UI ke sana.
//
// Dua hal yang membuat itu merepotkan bila dikerjakan manual, dan keduanya
// ditangani di sini:
//
//   1. WSL MEMATIKAN DISTRO saat sesi terakhir tertutup. Server yang di-nohup
//      pun ikut mati. Karena itu proses wsl.exe di bawah TIDAK dilepas — ia
//      ditahan selama app hidup, dan itulah yang menjaga distro tetap menyala.
//   2. IP DISTRO BERUBAH tiap restart, dan localhost forwarding WSL2 terbukti
//      tidak andal (terukur: sempat bekerja lalu putus di tengah sesi padahal
//      server tetap melayani dari dalam distro). Jadi IP dideteksi tiap kali
//      dijalankan, bukan dihardcode atau diasumsikan 127.0.0.1.
//
// ELECTRON_RUN_AS_NODE dibuang dengan alasan sama seperti scripts/app.cjs: bila
// ter-set, Electron menjalankan main.js sebagai Node biasa sehingga
// require('electron') tak memberi API dan app-nya undefined.
"use strict";
const { spawn, execFileSync } = require("child_process");
const http = require("http");
const path = require("path");

const DISTRO = process.env.WOLFSPACE_WSL_DISTRO || "WolfspaceTest";
const WSL_DIR = process.env.WOLFSPACE_WSL_DIR || "/root/wolfspace";
const WSL_NODE = process.env.WOLFSPACE_WSL_NODE || "/opt/node24/bin/node";
const PORT = process.env.PORT || "8090";
const SIAP_TIMEOUT_MS = 90000;

const log = (s) => process.stdout.write("[wsl-app] " + s + "\n");
const mati = (s) => {
  process.stderr.write("[wsl-app] " + s + "\n");
  process.exit(1);
};

function wslSync(cmd) {
  return execFileSync("wsl.exe", ["-d", DISTRO, "--", "sh", "-c", cmd], {
    encoding: "utf8",
    timeout: 30000,
  })
    .replace(/\0/g, "")
    .trim();
}

// ── 1. Distro & backend ada? ──
try {
  wslSync("true");
} catch (e) {
  mati(
    `Distro WSL "${DISTRO}" tak bisa dijalankan. Setel WOLFSPACE_WSL_DISTRO ` +
      `bila namanya berbeda. (${String(e.message).split("\n")[0]})`,
  );
}
try {
  wslSync(`test -f ${WSL_DIR}/server.cjs && test -x ${WSL_NODE}`);
} catch (_) {
  mati(
    `Backend tak ditemukan di dalam WSL.\n` +
      `  dicari: ${WSL_DIR}/server.cjs  dan  ${WSL_NODE}\n` +
      `  Lihat "Running the backend in WSL" di agent/broker/README.md untuk cara menyiapkannya.`,
  );
}

// ── 2. Nyalakan server, TAHAN prosesnya ──
// exec agar node menggantikan sh: sinyal dari sini langsung mengenai server,
// bukan cangkang perantara yang menyisakan node yatim.
log(`menyalakan backend di ${DISTRO}:${WSL_DIR} …`);
const server = spawn(
  "wsl.exe",
  [
    "-d",
    DISTRO,
    "--",
    "sh",
    "-c",
    `cd ${WSL_DIR} && HOST=0.0.0.0 PORT=${PORT} exec ${WSL_NODE} server.cjs`,
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
server.stdout.on("data", (d) => process.stdout.write(d));
server.stderr.on("data", (d) => process.stderr.write(d));
server.on("exit", (code) => {
  if (!berhenti) mati(`backend WSL berhenti lebih dulu (kode ${code})`);
});

let berhenti = false;
const bunuhServer = () => {
  berhenti = true;
  try {
    server.kill();
  } catch (_) {}
};
process.on("exit", bunuhServer);
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

// ── 3. IP distro (bukan 127.0.0.1) ──
function ipDistro() {
  try {
    const out = wslSync("ip -4 addr show eth0");
    const m = out.match(/inet\s+([0-9.]+)/);
    return m ? m[1] : null;
  } catch (_) {
    return null;
  }
}

// ── 4. Tunggu /healthz benar-benar menjawab ──
function cekSehat(ip) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: ip, port: Number(PORT), path: "/healthz", timeout: 3000 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

(async () => {
  const batas = Date.now() + SIAP_TIMEOUT_MS;
  let ip = null;
  while (Date.now() < batas) {
    ip = ip || ipDistro();
    if (ip && (await cekSehat(ip))) break;
    await new Promise((r) => setTimeout(r, 1500));
    if (Date.now() >= batas) ip = null;
  }
  if (!ip) {
    bunuhServer();
    mati(
      `backend tak siap dalam ${SIAP_TIMEOUT_MS / 1000} detik ` +
        `(ip=${ipDistro() || "tak terdeteksi"}, port=${PORT})`,
    );
  }

  const backend = `http://${ip}:${PORT}/`;
  log(`backend siap di ${backend} — membuka Electron`);

  const env = { ...process.env, WOLFSPACE_BACKEND: backend };
  delete env.ELECTRON_RUN_AS_NODE;

  const electronExe = require("electron");
  const mainJs = path.join(__dirname, "..", "electron", "main.js");
  const ui = spawn(
    electronExe,
    [
      "--js-flags=--max-old-space-size=512 --expose-gc",
      "--disable-http-cache",
      mainJs,
    ],
    { stdio: "inherit", env },
  );
  ui.on("exit", (code) => {
    bunuhServer();
    process.exit(code == null ? 0 : code);
  });
  ui.on("error", (e) => {
    bunuhServer();
    mati("gagal meluncurkan Electron: " + e.message);
  });
})();
