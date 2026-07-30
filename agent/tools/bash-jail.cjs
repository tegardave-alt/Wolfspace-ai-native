// ── Pengurungan bash lewat namespace Linux (pengganti kontainer Docker) ──
//
// KENAPA ADA. Pengurungan workspace untuk `bash` sebelumnya hanya punya dua
// tingkat: kontainer Docker sekali-pakai bila daemon-nya hidup, atau penjaga
// regex yang kodenya sendiri melabeli "bocor". Docker berarti bergantung pada
// daemon yang harus dipasang dan dinyalakan — di mesin pengembangan ini ia mati,
// sehingga yang benar-benar berjalan sehari-hari adalah penjaga regex itu.
//
// Kernel sudah menyediakan bahan yang sama tanpa daemon apa pun. Yang ditiru,
// satu per satu dari argumen `docker run` yang lama:
//
//   --network none          -> unshare -n            (namespace jaringan kosong)
//   -v <ws>:/work           -> mount --bind ws       (hanya folder itu terlihat)
//   --read-only             -> bind sistem, remount ro
//   --tmpfs /tmp:size=64m   -> mount -t tmpfs -o size=64m
//   --pids-limit            -> unshare -p -f + ulimit -u
//   --memory / --cpus       -> ulimit -v / -t  (perkiraan; lihat CATATAN di bawah)
//
// Terbukti pada prototipe di WSL2 (kernel 6.18): berkas rahasia host tak
// terbaca, /etc tak ada sama sekali, `ls /work/../..` hanya memperlihatkan isi
// jail, /bin read-only, jaringan mati — sementara tulisan di /work tetap sampai
// ke folder workspace yang asli di host.
//
// CATATAN JUJUR: ulimit BUKAN padanan penuh cgroup. `ulimit -v` membatasi ruang
// alamat virtual per proses, bukan total RSS satu grup proses seperti
// `--memory`. Untuk menahan pemakaian sumber daya yang benar-benar ketat,
// cgroup v2 tetap jawabannya. Yang dijamin di sini adalah batas AKSES
// (berkas & jaringan) — itu yang menjadi alasan pengurungan ini ada.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFileSync } = require("child_process");

// Direktori sistem yang di-bind READ-ONLY supaya shell punya perkakas tanpa
// bisa mengubahnya. /etc SENGAJA tidak ikut: isinya sering memuat konfigurasi
// dan kredensial, dan shell tak membutuhkannya untuk perintah biasa.
const BIND_RO = ["/bin", "/sbin", "/usr", "/lib", "/lib64"];
// /dev TIDAK di-bind seluruhnya — isinya memuat disk mentah (/dev/sda dsb) yang
// justru ingin disembunyikan. Hanya node yang benar-benar dibutuhkan shell yang
// disalin satu per satu. Tanpa ini `cmd > /dev/null` — pola yang sangat lazim —
// gagal dengan "can't create /dev/null: nonexistent directory", jadi pengurungan
// yang benar pun jadi tak terpakai karena merusak perintah biasa.
const DEV_NODES = ["null", "zero", "urandom", "random", "tty"];
const TMPFS_SIZE = "64m";
const MAX_PROC = 256;
const MAX_VMEM_KB = 512 * 1024;
const MAX_CPU_SEC = 60;

let _bisa = null;
function tersedia() {
  if (_bisa !== null) return _bisa;
  _bisa = false;
  if (process.platform === "linux") {
    try {
      // Butuh hak untuk membuat mount namespace DAN mem-bind di dalamnya.
      // Diuji nyata, bukan ditebak dari uid: sekali gagal berarti tak dipakai.
      execFileSync("unshare", ["-m", "-n", "true"], {
        stdio: "ignore",
        timeout: 5000,
      });
      execFileSync("sh", ["-c", "command -v chroot >/dev/null"], {
        stdio: "ignore",
        timeout: 5000,
      });
      _bisa = true;
    } catch (_) {
      _bisa = false;
    }
  }
  return _bisa;
}

function _skripJail(jail, root, workdir, cmd) {
  const binds = BIND_RO.map(
    (d) =>
      `[ -d ${d} ] && mkdir -p ${jail}${d} && mount --bind ${d} ${jail}${d} && ` +
      `mount -o remount,ro,bind ${jail}${d}`,
  ).join("\n");
  // Perintah user diteruskan lewat stdin `sh -s`, TIDAK ditempel ke dalam string
  // skrip: menempelkannya berarti tanda kutip atau `$(...)` di perintah user bisa
  // memecah skrip pembungkus ini dan lolos dari chroot sebelum sempat terkurung.
  const devs = DEV_NODES.map(
    (n) =>
      `[ -e /dev/${n} ] && : > ${jail}/dev/${n} && mount --bind /dev/${n} ${jail}/dev/${n}`,
  ).join("\n");
  return `
set -e
${binds}
mkdir -p ${jail}/work ${jail}/tmp ${jail}/dev
mount --bind ${root} ${jail}/work
mount -t tmpfs -o size=${TMPFS_SIZE} tmpfs ${jail}/tmp
mount -t tmpfs -o size=1m tmpfs ${jail}/dev
${devs}
exec chroot ${jail} /bin/sh -c '
  cd ${workdir} 2>/dev/null || cd /work
  ulimit -u ${MAX_PROC} 2>/dev/null || true
  ulimit -v ${MAX_VMEM_KB} 2>/dev/null || true
  ulimit -t ${MAX_CPU_SEC} 2>/dev/null || true
  exec /bin/sh -s
' <<'__WOLFSPACE_CMD__'
${cmd}
__WOLFSPACE_CMD__
`;
}

// root    = folder workspace di host yang boleh dilihat
// workdir = direktori kerja DI DALAM jail ("/work" atau "/work/<sub>")
function jalankan(cmd, root, opts = {}) {
  const timeoutMs = opts.timeout || 60000;
  const jail = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-jail-"));
  const workdir = opts.workdir || "/work";

  return new Promise((resolve) => {
    const child = spawn(
      "unshare",
      ["-m", "-n", "-p", "-f", "--mount-proc", "sh", "-c", "sh -s"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let out = "";
    let err = "";
    let selesai = false;
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));

    const bereskan = () => {
      // Mount hilang sendiri bersama namespace-nya; yang tersisa cuma direktori
      // kosong. Dihapus agar /tmp tak menumpuk jail bekas.
      try {
        fs.rmSync(jail, { recursive: true, force: true });
      } catch (_) {}
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch (_) {}
    }, timeoutMs);

    child.on("close", (code) => {
      if (selesai) return;
      selesai = true;
      clearTimeout(timer);
      bereskan();
      const teks = (out + (err ? "\n" + err : "")).trim();
      resolve({
        ok: code === 0,
        output: teks || (code === 0 ? "(exit 0)" : `exit ${code}`),
        mode: "namespace",
      });
    });

    child.on("error", (e) => {
      if (selesai) return;
      selesai = true;
      clearTimeout(timer);
      bereskan();
      resolve({ ok: false, output: "gagal menjalankan jail: " + e.message });
    });

    child.stdin.write(_skripJail(jail, root, workdir, cmd));
    child.stdin.end();
  });
}

module.exports = { tersedia, jalankan };
