// ── Capability zone (process-isolated) ──
// Runs untrusted task code in a SEPARATE Node process launched with
// `--permission` and zero --allow-fs-read/--allow-fs-write grants. Node's
// runtime denies fs access at the native binding layer for that whole
// process — this holds even against the classic vm-escape technique that
// broke the earlier vm.createContext-based zone (see agent/broker/README.md
// for the side-by-side test result).
//
// The zone process's ONLY channel to the outside world is IPC messages
// forwarded here and validated by the Broker before anything executes.
"use strict";

const { fork, spawn, execFileSync } = require("child_process");
const path = require("path");
const { getPlatformAdapter } = require("../platform/index.cjs");

const WORKER = path.join(__dirname, "zone-worker.cjs");

// ── Pengurungan jaringan (opsional, hanya Linux) ──
//
// `--permission` menutup berkas tapi TIDAK menyentuh jaringan sama sekali —
// model permission Node memang tak punya dimensi itu, jadi tak ada flag yang
// bisa ditambahkan. Karena itu kode zona bisa memanggil https.get() langsung dan
// berhasil; di README itu satu-satunya baris tabel serangan yang lolos.
//
// Menambalnya DARI DALAM zona tidak bisa dijadikan batas. Diuji dengan mengganti
// http/https/net/tls/dgram di require.cache lalu diserang: `require('node:https')`
// tembus (kunci cache berbeda) dan `process.binding('tcp_wrap')` tembus (berada
// di BAWAH lapisan modul) — 2 dari 5 percobaan, tanpa usaha berarti. Itu
// kesalahan yang sama persis dengan versi vm.createContext dulu: menyembunyikan
// referensi, bukan mencabut kemampuan.
//
// Batas yang benar ada di kernel. `unshare -n` memberi proses network namespace
// kosong (hanya loopback, tanpa rute). Yang menentukan bagi arsitektur ini:
// kanal IPC SELAMAT, karena socketpair-nya sudah terbuka sebelum proses masuk
// namespace. Jadi request() tetap bekerja seperti sebelumnya — broker di host
// yang punya jaringan, zona tidak.
//
// Terukur di WSL2 (kernel 6.18, node v24.16.0):
//     tanpa netns   -> https.get berhasil, status 403 (sampai ke server)
//     dengan netns  -> EAI_AGAIN, dan IPC tetap HIDUP
//     ongkos spawn  -> 78,3 ms vs 95,0 ms median; rentang tumpang tindih
// Tak ada overhead terukur, tanpa daemon, tanpa pool kontainer.
//
// Windows tak punya padanannya: aturan firewall bersifat per-executable dan
// proses zona adalah node.exe yang SAMA dengan host, jadi tak bisa dibedakan.
// Di sana nilainya null dan perilakunya tetap seperti semula (fork biasa).
let _netnsCache;
function netnsWrapper() {
  if (_netnsCache !== undefined) return _netnsCache;
  _netnsCache = null;
  if (process.platform === "linux") {
    try {
      execFileSync("unshare", ["-n", "true"], {
        stdio: "ignore",
        timeout: 3000,
      });
      _netnsCache = "unshare";
    } catch (_) {
      _netnsCache = null; // butuh CAP_SYS_ADMIN / user-ns — jalan tanpa pengurungan
    }
  }
  return _netnsCache;
}

// Berapa banyak keluaran zona yang DISIMPAN. Ini BUKAN batas berapa yang
// dibaca: pipa harus terus dikuras apa pun isinya (lihat makeSink).
const MAX_CAPTURE = 256 * 1024;

// Penampung yang SELALU mengonsumsi, tapi hanya menyimpan sampai `limit`.
//
// Ini inti perbaikannya. Sebelumnya stdout dibuka sebagai 'pipe' tapi tak
// pernah dibaca sama sekali — hanya stderr yang punya listener. Begitu buffer
// pipa OS penuh (~64 KB), proses zona MEMBLOK selamanya di console.log lalu
// mati kena timeout. Terukur pada kode yang sama persis, hanya beda volume:
//     tanpa cetak        -> 42 dalam 167 ms
//     cetak ~2 KB        -> 42 dalam 185 ms
//     cetak ~200 KB      -> TIMEOUT 8 detik
// Kegagalannya senyap: pesannya cuma "zone timeout", tanpa petunjuk bahwa
// penyebabnya adalah mencetak terlalu banyak — orang akan menyalahkan kodenya
// sendiri, bukan sandbox-nya. Untuk sandbox yang tugasnya menjalankan kode
// asing, "program yang banyak mencetak akan menggantung" adalah cacat yang
// pasti ketemu di pemakaian pertama.
//
// Membatasi yang disimpan TIDAK boleh berarti berhenti membaca — kalau
// listenernya dilepas setelah penuh, deadlock-nya kembali persis seperti semula.
function makeSink(limit) {
  let kept = "";
  let total = 0;
  return {
    push(chunk) {
      const s = chunk.toString();
      total += s.length;
      if (kept.length < limit) kept += s.slice(0, limit - kept.length);
    },
    get text() {
      return kept;
    },
    get truncated() {
      return total > kept.length;
    },
    get bytes() {
      return total;
    },
  };
}

function runInCapabilityZone(code, broker, opts = {}) {
  const timeoutMs = opts.timeout || 10000;
  const limit = opts.maxCapture || MAX_CAPTURE;

  return new Promise((resolve, reject) => {
    // Dengan netns dipakai spawn, bukan fork: fork tak bisa disisipi pembungkus
    // perintah. `stdio: [..., 'ipc']` tetap memberi kanal child.send/on('message')
    // yang sama, karena Node anak membacanya dari NODE_CHANNEL_FD.
    const ns = opts.netns === false ? null : netnsWrapper();
    const child = ns
      ? spawn(ns, ["-n", process.execPath, "--permission", WORKER], {
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        })
      : fork(WORKER, [], {
          execArgv: ["--permission"], // no --allow-fs-read/write => fs denied process-wide
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        });

    let settled = false;
    const out = makeSink(limit);
    const err = makeSink(limit);
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => err.push(c));

    // Keluaran ikut dilampirkan ke KEGAGALAN juga, bukan cuma keberhasilan —
    // saat zona timeout atau melempar, apa yang sempat dicetaknya justru satu-
    // satunya petunjuk yang tersisa.
    const io = () => ({
      stdout: out.text,
      stderr: err.text,
      truncated: out.truncated || err.truncated,
      outBytes: out.bytes,
      errBytes: err.bytes,
    });

    // Selesaikan SETELAH stdio terkuras, bukan seketika.
    //
    // Dulu `done` dari IPC langsung diikuti SIGKILL. Pesan IPC bisa tiba
    // mendahului data yang masih mengantre di pipa stdout, jadi membunuh anak
    // saat itu juga MEMBUANG keluaran yang belum terbaca. Terukur pada zona yang
    // mencetak ~5 MB: hanya 530.452 byte yang sampai. Di Windows kebetulan tak
    // terlihat karena urutannya berbeda — tersingkap begitu jalur netns memakai
    // spawn. Kehilangan diam-diam seperti ini persis yang harus dihindari.
    //
    // Yang ditunggu adalah 'close' — peristiwa yang menyala setelah proses
    // keluar DAN kedua pipa stdio habis. Terukur pada zona pencetak 5 MB:
    //     +605 ms  pesan done (baru 327.240 B terbaca)
    //     +875 ms  stdout END (5.050.000 B — utuh)
    //     +878 ms  close
    //
    // JANGAN memanggil child.disconnect() di sini. Diukur: dengan disconnect
    // sisi induk, 'exit' tetap menyala (~240 ms) tapi 'close' TIDAK PERNAH
    // menyala, sehingga jaring pengaman DRAIN_MS selalu habis dan setiap
    // eksekusi zona menanggung tambahan ~3 detik. Yang melepas event loop anak
    // adalah process.disconnect() di zone-worker, bukan di sini.
    const DRAIN_MS = 3000;
    let selesai = false;
    const settle = (fn, mkVal, killNow) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killNow) {
        const adapter = getPlatformAdapter();
        try {
          adapter.killTree(child);
        } catch (_) {
          try {
            child.kill("SIGKILL");
          } catch (__) {}
        }
      }
      const tuntas = () => {
        if (selesai) return;
        selesai = true;
        clearTimeout(grace);
        try {
          child.kill("SIGKILL");
        } catch (_) {}
        fn(mkVal());
      };
      const grace = setTimeout(tuntas, DRAIN_MS);
      child.once("close", tuntas);
    };

    const fail = (e, killNow) =>
      settle(reject, () => Object.assign(e, io()), killNow);

    const timer = setTimeout(() => {
      fail(new Error(`zone timeout (${timeoutMs}ms)`), true);
    }, timeoutMs);

    child.on("message", async (msg) => {
      if (msg.type === "capability-request") {
        try {
          const result = await broker.request(msg.capability, msg.params);
          if (!settled)
            child.send({ type: "capability-response", id: msg.id, result });
        } catch (e) {
          if (!settled)
            child.send({
              type: "capability-response",
              id: msg.id,
              error: e.message,
              errCode: e.code,
            });
        }
        return;
      }
      // io() dipanggil BELAKANGAN (di dalam thunk), setelah stdio terkuras —
      // kalau dievaluasi di sini, isinya kembali terpotong.
      if (msg.type === "done")
        settle(resolve, () => ({ result: msg.result, ...io() }));
      else if (msg.type === "error")
        fail(Object.assign(new Error(msg.message), { code: msg.code }));
    });

    child.on("error", (e) => fail(e, true));
    child.on("exit", (code) => {
      if (!settled && code !== 0)
        fail(
          new Error(
            `zone process exited with code ${code}: ${err.text.slice(0, 500)}`,
          ),
        );
    });

    child.send({ type: "run", code });
  });
}

module.exports = { runInCapabilityZone };
