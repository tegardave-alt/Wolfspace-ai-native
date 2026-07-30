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
// ── Zona di WSL, broker tetap di Windows ──
//
// Pengurungan jaringan hanya ada di kernel Linux. Sebelum ini, memakainya di
// Windows menuntut SELURUH backend pindah ke WSL — dan itu terlalu banyak untuk
// sesuatu yang cuma dibutuhkan zona. Jalur ini membundel fungsinya saja: broker
// tetap di proses server Windows, hanya worker zona yang dijalankan di WSL.
//
// Bisa karena dua hal yang diuji lebih dulu:
//   1. zone-worker.cjs hanya me-require modul BUILTIN (vm, module), jadi bisa
//      dijalankan langsung dari /mnt/c tanpa perlu repo disinkronkan ke WSL.
//   2. pipa stdio diteruskan wsl.exe DAN selamat di dalam `unshare -n` — karena
//      pipa bukan jaringan. Jembatan TCP mustahil di sini: zona tanpa rute
//      jaringan tak bisa menelepon balik brokernya. Diuji: ping/pong lewat,
//      sementara https di dalam zona tetap EAI_AGAIN.
let _wslCache;
function wslZona() {
  if (_wslCache !== undefined) return _wslCache;
  _wslCache = null;
  if (process.platform !== "win32" || process.env.WOLFSPACE_ZONE_WSL === "0") {
    return _wslCache;
  }
  const distro = process.env.WOLFSPACE_WSL_DISTRO || "WolfspaceTest";
  const nodeWsl = process.env.WOLFSPACE_WSL_NODE || "/opt/node24/bin/node";
  const workerWsl = winKeWsl(WORKER);
  if (!workerWsl) return _wslCache;
  try {
    // Diuji NYATA, bukan ditebak: distro hidup, node-nya mendukung --permission
    // (yang butuh Node >= 23; Node 20 masih memakai --experimental-permission),
    // unshare bisa membuat namespace, dan berkas worker terlihat dari dalam WSL.
    execFileSync(
      "wsl.exe",
      [
        "-d",
        distro,
        "--",
        "sh",
        "-c",
        `test -x ${nodeWsl} && test -f ${workerWsl} && ` +
          `${nodeWsl} --permission -e "0" && unshare -n true`,
      ],
      { stdio: "ignore", timeout: 20000 },
    );
    _wslCache = { distro, nodeWsl, workerWsl };
  } catch (_) {
    _wslCache = null; // WSL tak siap — jatuh ke fork biasa, perilaku lama
  }
  return _wslCache;
}

function winKeWsl(p) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(String(p));
  if (!m) return null;
  return "/mnt/" + m[1].toLowerCase() + "/" + m[2].replace(/\\/g, "/");
}

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
    // Tiga transport, dipilih otomatis. Urutannya bukan preferensi estetika:
    // yang di atas memberi jaminan lebih kuat.
    //   1. Linux    -> unshare -n + fork/spawn, IPC fd. Paling murah.
    //   2. Windows  -> wsl.exe + unshare -n, protokol stdio. Menambah ongkos
    //                  startup wsl.exe, tapi ini SATU-SATUNYA cara mendapat
    //                  pengurungan jaringan di Windows.
    //   3. lainnya  -> fork biasa. Berkas tetap dijaga --permission; jaringan
    //                  tidak. Perilaku lama, apa adanya.
    const ns = opts.netns === false ? null : netnsWrapper();
    const wsl = ns || opts.netns === false ? null : wslZona();
    // Token framing: acak per eksekusi supaya kode zona tak bisa memalsukan baris
    // protokol dengan mencetak prefiks yang ditebak.
    const token = wsl
      ? "WSZ" + require("crypto").randomBytes(8).toString("hex") + ""
      : "";
    let child;
    if (ns) {
      child = spawn(ns, ["-n", process.execPath, "--permission", WORKER], {
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
    } else if (wsl) {
      child = spawn(
        "wsl.exe",
        [
          "-d",
          wsl.distro,
          "--",
          "env",
          "WOLFSPACE_ZONE_TOKEN=" + token,
          "unshare",
          "-n",
          wsl.nodeWsl,
          "--permission",
          wsl.workerWsl,
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
    } else {
      child = fork(WORKER, [], {
        execArgv: ["--permission"], // no --allow-fs-read/write => fs denied process-wide
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
    }

    // Satu cara mengirim, apa pun transportnya.
    const kirimKeZona = (msg) => {
      if (wsl) {
        try {
          child.stdin.write(JSON.stringify(msg) + "\n");
        } catch (_) {}
        return;
      }
      try {
        child.send(msg);
      } catch (_) {}
    };

    let settled = false;
    const out = makeSink(limit);
    const err = makeSink(limit);
    // Di transport WSL, stdout membawa DUA hal: baris protokol (berprefiks token)
    // dan keluaran cetak kode zona. Dipisahkan di sini — baris protokol diambil,
    // sisanya masuk ke penampung keluaran seperti biasa, jadi jaminan "keluaran
    // zona kembali utuh" tetap berlaku di kedua transport.
    if (wsl) {
      let sisa = "";
      child.stdout.on("data", (c) => {
        sisa += c.toString();
        let i;
        while ((i = sisa.indexOf("\n")) !== -1) {
          const baris = sisa.slice(0, i);
          sisa = sisa.slice(i + 1);
          if (baris.startsWith(token)) {
            try {
              tanganiPesanZona(JSON.parse(baris.slice(token.length)));
            } catch (_) {}
          } else {
            out.push(baris + "\n");
          }
        }
      });
      // Ekor tanpa newline saat proses berakhir — tetap keluaran user.
      child.stdout.on("end", () => {
        if (sisa) out.push(sisa);
      });
    } else {
      child.stdout.on("data", (c) => out.push(c));
    }
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

    // SATU penangan untuk kedua transport. Sebelumnya logika ini menempel di
    // child.on("message"), yang hanya ada di kanal IPC — jadi transport stdio
    // akan mengabaikan permintaan kapabilitas sama sekali, dan zona di WSL tak
    // bisa memakai request() untuk apa pun.
    async function tanganiPesanZona(msg) {
      // Laporan percobaan jaringan langsung dari zona. Bukan permintaan — tak
      // ada yang perlu dijawab, cukup dicatat supaya percobaannya terlihat di
      // jejak audit alih-alih gagal dalam diam.
      if (msg.type === "net-attempt") {
        try {
          broker.catatPercobaanLangsung(msg.modul, {
            metode: msg.metode,
            tujuan: msg.tujuan,
          });
        } catch (_) {}
        return;
      }
      if (msg.type === "capability-request") {
        try {
          const result = await broker.request(msg.capability, msg.params);
          if (!settled)
            kirimKeZona({ type: "capability-response", id: msg.id, result });
        } catch (e) {
          if (!settled)
            kirimKeZona({
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
    }

    if (!wsl) child.on("message", tanganiPesanZona);

    child.on("error", (e) => fail(e, true));
    child.on("exit", (code) => {
      if (!settled && code !== 0)
        fail(
          new Error(
            `zone process exited with code ${code}: ${err.text.slice(0, 500)}`,
          ),
        );
    });

    // opts.pelapor === false mematikan stub pelapor jaringan di dalam zona.
    // Dipakai uji netns: dengan pelapor aktif, stub melempar sebelum soket
    // dibuat, jadi ujinya akan lulus meski namespace-nya mati. Mematikannya
    // membuat percobaan benar-benar diuji terhadap kernel.
    kirimKeZona({ type: "run", code, pelapor: opts.pelapor !== false });
  });
}

module.exports = { runInCapabilityZone };
