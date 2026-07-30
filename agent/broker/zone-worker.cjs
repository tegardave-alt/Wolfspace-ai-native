// ── Zone worker (runs INSIDE a --permission-restricted child process) ──
// This process is launched with `--permission` and NO --allow-fs-read/write
// grants at all, so Node's own runtime denies fs access at the native binding
// layer — not at a JS-realm boundary. That's why it survives the exact escape
// (`this.constructor.constructor('return process')`) that broke vm.cjs: the
// escape can still fetch a `process`/`require` reference (there's no realm to
// break out of — it's all one process), but the moment it calls the real
// fs.readFileSync, Node's permission check fires regardless of how that call
// was reached.
//
// The ONLY way this worker can affect the outside world is the `request()`
// bridge below, which forwards to the parent (Broker) over IPC and awaits
// its decision.
"use strict";

const vm = require("vm");

// ── Pelapor jaringan (BUKAN penjaga) ──
//
// Modul jaringan diganti stub yang MELAPORKAN percobaan ke broker lalu melempar
// error yang menjelaskan jalan yang benar. Ini sengaja BUKAN batas keamanan:
// diuji langsung, `require('node:https')` menembusnya (kunci cache berbeda) dan
// `process.binding('tcp_wrap')` menembusnya (di bawah lapisan modul) — 2 dari 5
// percobaan, sekali coba. Yang menahan tetap network namespace di kernel.
//
// Gunanya melengkapi netns, bukan menggantikannya. Tanpa ini, kode yang nyasar
// ke jaringan mati dengan EAI_AGAIN dan meninggalkan **0 entri audit** — jadi ia
// terhenti tapi tak terlihat. Dengan ini, percobaan yang lewat jalur modul biasa
// jadi tercatat; yang menyelinap lewat celah di atas tetap mati di kernel, hanya
// tak tercatat. Lebih baik sebagian terlihat daripada tak satu pun.
// Dicegat di Module._load, BUKAN dengan menimpa require.cache.
//
// Menimpa cache hanya menangkap `require("https")`. Bentuk `require("node:https")`
// lolos, karena modul builtin ber-prefix `node:` tak pernah melewati
// require.cache sama sekali — diukur langsung: bentuk polos menghasilkan 1 entri
// audit, bentuk `node:` menghasilkan 0. Module._load adalah titik yang dilewati
// KEDUANYA.
const MODUL_JARINGAN = new Set(["http", "https", "net", "tls", "dgram"]);
function pasangPelaporJaringan() {
  const Module = require("module");
  const _load = Module._load;
  Module._load = function (spesifier, ...sisa) {
    const nama = String(spesifier).replace(/^node:/, "");
    if (!MODUL_JARINGAN.has(nama)) return _load.call(this, spesifier, ...sisa);
    return new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "__pelapor") return true;
          return (...args) => {
            const tujuan = args.find((a) => typeof a === "string") || "";
            try {
              process.send({
                type: "net-attempt",
                modul: nama,
                metode: String(prop),
                tujuan: tujuan.slice(0, 120),
              });
            } catch (_) {}
            throw new Error(
              `Akses jaringan langsung lewat ${nama}.${String(prop)}() ditolak. ` +
                `Zona tidak punya rute jaringan (network namespace kosong). ` +
                `Pakai request("fetch", { url }) agar melewati broker dan tercatat di audit.`,
            );
          };
        },
      },
    );
  };
}

let reqId = 0;
const pending = new Map();

process.on("message", (msg) => {
  if (msg.type === "capability-response") {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error)
      p.reject(Object.assign(new Error(msg.error), { code: msg.errCode }));
    else p.resolve(msg.result);
    return;
  }
  if (msg.type === "run") {
    // Pelapor dipasang SAAT run, bukan saat modul dimuat, supaya bisa dimatikan
    // per-eksekusi. Dibutuhkan uji netns: dengan pelapor aktif, stub melempar
    // lebih dulu sehingga uji akan LULUS meski network namespace-nya mati —
    // buktinya jadi palsu. Mematikannya membuat percobaan benar-benar sampai ke
    // kernel, dan itulah yang harus diuji.
    if (msg.pelapor !== false) pasangPelaporJaringan();
    runTask(msg.code);
  }
});

function request(capability, params) {
  return new Promise((resolve, reject) => {
    const id = ++reqId;
    pending.set(id, { resolve, reject });
    process.send({ type: "capability-request", id, capability, params });
  });
}

async function runTask(code) {
  try {
    // vm.compileFunction compiles in THIS process's own context (no new
    // Context/realm — so there is no realm to escape from in the first
    // place). We deliberately hand the task a REAL `require`, matching a
    // realistic "run this Node code" attacker who has normal module access —
    // the security boundary here is NOT scope-hiding, it's the OS process's
    // --permission flag denying the fs binding itself, regardless of how
    // fs.readFileSync gets called.
    const fn = vm.compileFunction(
      `return (async () => {\n${code}\n})()`,
      ["request", "require"],
      { filename: "capability-task.js" },
    );
    const result = await fn(request, require);
    // Lepas kanal IPC SETELAH pesan benar-benar terkirim. Kanal itu satu-satunya
    // handle yang menahan event loop proses ini; begitu dilepas, proses keluar
    // sendiri, stdout ter-flush, dan induk menerima 'close' seketika.
    //
    // Tanpa ini induk harus menunggu jaring pengaman DRAIN_MS sampai habis pada
    // SETIAP eksekusi (terukur: ~3,1 detik per zona). process.exit() bukan
    // gantinya — ia memotong tulisan stdout yang masih mengantre, yang justru
    // kehilangan keluaran yang sedang kita usahakan.
    process.send({ type: "done", result }, () => {
      try {
        process.disconnect();
      } catch (_) {}
    });
  } catch (e) {
    process.send({ type: "error", message: e.message, code: e.code }, () => {
      try {
        process.disconnect();
      } catch (_) {}
    });
  }
}
