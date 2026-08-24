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
const fs = require("fs");
const os = require("os");

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
    `Distro WSL "${DISTRO}" cannot be started. Set WOLFSPACE_WSL_DISTRO ` +
      `bila namanya berbeda. (${String(e.message).split("\n")[0]})`,
  );
}
try {
  wslSync(`test -f ${WSL_DIR}/server.cjs && test -x ${WSL_NODE}`);
} catch (_) {
  mati(
    `Backend not found inside WSL.\n` +
      `  dicari: ${WSL_DIR}/server.cjs  dan  ${WSL_NODE}\n` +
      `  Lihat "Running the backend in WSL" di agent/broker/README.md for how to set it up.`,
  );
}

// ── 1b. Sinkronkan kode ke WSL SEBELUM menyalakan ──
//
// Tanpa ini, salinan di WSL adalah snapshot yang membeku di saat terakhir
// di-deploy — dan pertanyaan "yang saya jalankan ini versi yang mana?" jadi tak
// bisa dijawab tanpa membandingkan checksum. Terbukti terjadi: setelah beberapa
// commit, berkas di WSL berbeda md5 dengan yang di Windows.
//
// Yang disalin adalah berkas TERLACAK di working tree, bukan HEAD: saat
// mengembangkan, yang ingin dijalankan adalah kode yang sedang dikerjakan,
// termasuk perubahan yang belum di-commit. node_modules TIDAK ikut — biner
// native berbeda per platform, dan menimpanya akan merusak pemasangan di WSL.
function winKeWsl(p) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (!m) return null;
  return "/mnt/" + m[1].toLowerCase() + "/" + m[2].replace(/\\/g, "/");
}

// Identitas isi working tree: sha1 dari (path, ukuran, mtime) tiap berkas
// terlacak.
//
// SENGAJA bukan commit hash. Yang disinkronkan adalah working tree — termasuk
// perubahan yang belum di-commit — jadi commit hash akan melaporkan "sama"
// padahal isinya berbeda, tepat pada kasus yang paling sering terjadi saat
// mengembangkan. Membaca isi tiap berkas lebih akurat lagi, tapi mtime+ukuran
// sudah cukup membedakan suntingan nyata dan jauh lebih murah untuk ~600 berkas.
function versiKode(repo, berkas) {
  const h = require("crypto").createHash("sha1");
  for (const f of berkas) {
    try {
      const st = fs.statSync(path.join(repo, f));
      h.update(f + ":" + st.size + ":" + Math.floor(st.mtimeMs) + "\n");
    } catch (_) {
      h.update(f + ":hilang\n");
    }
  }
  return h.digest("hex").slice(0, 12);
}

// Berkas terlacak + versinya — dihitung SEBELUM apa pun dinyalakan, karena
// keputusan "pakai ulang atau nyalakan ulang" bergantung padanya.
const REPO_WIN = path.resolve(path.join(__dirname, ".."));
function rencanaSinkron() {
  if (process.env.WOLFSPACE_WSL_NO_SYNC === "1") {
    log("sinkronisasi dilewati (WOLFSPACE_WSL_NO_SYNC=1)");
    return null;
  }
  const repoWsl = winKeWsl(REPO_WIN);
  if (!repoWsl) {
    log("skipping sync: the repo path cannot be mapped to /mnt/...");
    return null;
  }
  let daftar;
  try {
    daftar = execFileSync("git", ["ls-files"], {
      cwd: REPO_WIN,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (e) {
    log("skipping sync: `git ls-files` failed — " + e.message.split("\n")[0]);
    return null;
  }
  const berkas = daftar.split("\n").filter(Boolean);
  return { repoWsl, berkas, versi: versiKode(REPO_WIN, berkas) };
}

function sinkronkan(rencana) {
  if (!rencana) return;
  const { repoWsl, berkas, versi } = rencana;
  const listWin = path.join(os.tmpdir(), "wolfspace-sync-list.txt");
  fs.writeFileSync(listWin, berkas.join("\n") + "\n", "utf8");
  const listWsl = winKeWsl(listWin);
  // Skrip DITULIS KE BERKAS, tidak dioper sebagai `sh -c "<perintah panjang>"`.
  //
  // Versi inline-nya melapor SUKSES tapi tak menghapus apa pun: perintahnya
  // melewati penggabungan baris-perintah Windows lalu wsl.exe sebelum sampai ke
  // sh, dan tanda kutip di dalam loop tak selamat. Dijalankan dari berkas, skrip
  // yang sama persis bekerja — diverifikasi manual, 3 berkas terhapus.
  //
  // Ini pelajaran yang berulang sepanjang pengerjaan ini: begitu sebuah perintah
  // punya kutip bersarang, oper lewat berkas.
  const skripWin = path.join(os.tmpdir(), "wolfspace-sync.sh");
  const skrip = [
    "#!/bin/sh",
    "set -e",
    `cd ${rencana.repoWsl}`,
    `tar -cf - -T ${listWsl} | tar -xf - -C ${WSL_DIR}`,
    `cd ${WSL_DIR}`,
    `sort ${listWsl} > /tmp/ws-keep.txt`,
    // Pengecualian penghapusan — semuanya WAJIB, dan masing-masing punya alasan:
    //   node_modules  biner native, berbeda per platform, tak pernah terlacak
    //   .git          bukan berkas terlacak tapi wajib ada
    //   .wolfspace    quarantine + snapshots = state rollback agent; menghapusnya
    //                 tiap sinkron akan membuang riwayat pemulihannya
    //   stempel versi & kunci cloud & pid MCP = runtime, bukan kode
    "find . -type f \\",
    "  -not -path './node_modules/*' -not -path './.git/*' \\",
    "  -not -path './.wolfspace/*' -not -path './config/.mcp-pids/*' \\",
    "  -not -name '.wolfspace-version.json' -not -name 'cloud-keys.json' \\",
    "  | sed 's|^\\./||' | sort > /tmp/ws-ada.txt",
    "comm -13 /tmp/ws-keep.txt /tmp/ws-ada.txt > /tmp/ws-buang.txt",
    'while IFS= read -r f; do [ -n "$f" ] && rm -f "$f"; :; done < /tmp/ws-buang.txt',
    // Direktori kosong ikut dipangkas. Menghapus berkas saja menyisakan cangkang
    // folder — terukur 98 setelah pembersihan pertama — dan folder kosong bernama
    // `vscode-extension-fork` tetap memberi kesan sesuatu masih ada di sana.
    // Pengecualiannya sama; `|| true` karena find kehabisan direktori bukan galat.
    "find . -type d -empty \\",
    "  -not -path './node_modules/*' -not -path './.git/*' \\",
    "  -not -path './.wolfspace/*' -not -path './config/*' \\",
    "  -delete 2>/dev/null || true",
  ].join("\n");
  fs.writeFileSync(skripWin, skrip, "utf8");
  const skripWsl = winKeWsl(skripWin);

  try {
    // tar dijalankan DI DALAM WSL: menulis langsung ke filesystem Linux jauh
    // lebih cepat daripada menyalin lewat lapisan /mnt per berkas.
    execFileSync("wsl.exe", ["-d", DISTRO, "--", "sh", skripWsl, "--abaikan"], {
      stdio: "ignore",
      timeout: 180000,
    });
    // Stempel DITULIS SESUDAH tar berhasil, tidak sebelumnya: kalau sinkronisasi
    // gagal di tengah, stempel yang sudah terlanjur ada akan berbohong bahwa
    // backend memakai kode terbaru.
    const stempel = JSON.stringify({
      version: versi,
      syncedAt: new Date().toISOString(),
    });
    execFileSync(
      "wsl.exe",
      [
        "-d",
        DISTRO,
        "--",
        "sh",
        "-c",
        `cat > ${WSL_DIR}/.wolfspace-version.json <<'__EOF__'\n${stempel}\n__EOF__`,
      ],
      { stdio: "ignore", timeout: 20000 },
    );
    log(`synced: ${berkas.length} files -> ${DISTRO}:${WSL_DIR} (${versi})`);
  } catch (e) {
    mati(
      "sync to WSL failed: " +
        String(e.message).split("\n")[0] +
        "\n  Set WOLFSPACE_WSL_NO_SYNC=1 to use the existing copy.",
    );
  }
}
// ── 2. Menyalakan server — TAPI hanya kalau memang perlu (lihat alur utama) ──
// exec agar node menggantikan sh: sinyal dari sini langsung mengenai server,
// bukan cangkang perantara yang menyisakan node yatim.
let server = null;
let berhenti = false;
function nyalakanServer() {
  log(`menyalakan backend di ${DISTRO}:${WSL_DIR} …`);
  server = spawn(
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
}

// Hanya menghentikan backend yang KITA nyalakan. Kalau kita memakai ulang milik
// sesi lain, menutup app ini tak boleh menjatuhkannya — itu justru akan
// mengubah "jangan bertumpuk" jadi "saling membunuh".
const bunuhServer = () => {
  berhenti = true;
  if (!server) return;
  try {
    server.kill();
  } catch (_) {}
};
process.on("exit", bunuhServer);
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

// Hentikan backend milik orang lain saat versinya berbeda — lewat PID yang
// DILAPORKAN /healthz, bukan tebakan dari daftar proses.
function hentikanBackendLama(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    execFileSync("wsl.exe", ["-d", DISTRO, "--", "kill", "-9", String(pid)], {
      stdio: "ignore",
      timeout: 10000,
    });
    return true;
  } catch (_) {
    return false;
  }
}

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

// ── 4. /healthz — mengembalikan { version, pid } atau null bila tak menjawab ──
function cekSehat(ip) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: ip, port: Number(PORT), path: "/healthz", timeout: 3000 },
      (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          if (res.statusCode !== 200) return resolve(null);
          try {
            resolve(JSON.parse(b));
          } catch (_) {
            // Backend versi lama menjawab "ok" polos, bukan JSON. Itu bukan
            // kegagalan — hanya berarti versinya tak bisa dipastikan.
            resolve({ ok: true, version: "unknown", pid: null });
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const ip0 = ipDistro();
  const rencana = rencanaSinkron();
  const versiTarget = rencana ? rencana.versi : null;

  // ── Jaminan SATU server ──
  // Tanpa ini, tiap peluncuran menambah proses baru dan port bentrok jadi
  // mekanisme utama — persis yang membuat "matikan proses lama" berubah jadi
  // bug destruktif kemarin. Keputusannya dibuat SEBELUM apa pun dinyalakan.
  const sehat = ip0 ? await cekSehat(ip0) : null;
  let pakaiUlang = false;
  if (sehat) {
    if (versiTarget && sehat.version === versiTarget) {
      log(
        `backend already running (pid ${sehat.pid}) and the version is THE SAME (${versiTarget}) — reused`,
      );
      pakaiUlang = true;
    } else {
      log(
        `backend jalan tapi versinya beda (${sehat.version} vs ${versiTarget || "?"}) — dihentikan`,
      );
      if (!hentikanBackendLama(sehat.pid))
        log(
          "  failed to stop it by PID; continuing — the new server will try to take the port",
        );
      await tunggu(1500);
    }
  }

  if (!pakaiUlang) {
    sinkronkan(rencana);
    nyalakanServer();
  }

  const batas = Date.now() + SIAP_TIMEOUT_MS;
  let ip = null;
  while (Date.now() < batas) {
    ip = ip || ipDistro();
    if (ip && (await cekSehat(ip))) break;
    await tunggu(1500);
    if (Date.now() >= batas) ip = null;
  }
  if (!ip) {
    bunuhServer();
    mati(
      `backend not ready within ${SIAP_TIMEOUT_MS / 1000} detik ` +
        `(ip=${ipDistro() || "not detected"}, port=${PORT})`,
    );
  }

  const backend = `http://${ip}:${PORT}/`;
  log(
    `backend ready at ${backend} (versi ${versiTarget || "?"}${pakaiUlang ? ", reused" : ""}) — membuka Electron`,
  );

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
    mati("failed to launch Electron: " + e.message);
  });
})();
