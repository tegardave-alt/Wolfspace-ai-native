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

const { fork } = require("child_process");
const path = require("path");
const { getPlatformAdapter } = require("../platform/index.cjs");

const WORKER = path.join(__dirname, "zone-worker.cjs");

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
    const child = fork(WORKER, [], {
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

    const finish = (fn, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill("SIGKILL");
      } catch (_) {}
      fn(val);
    };
    const fail = (e) => finish(reject, Object.assign(e, io()));

    const timer = setTimeout(() => {
      const adapter = getPlatformAdapter();
      try {
        adapter.killTree(child);
      } catch (_) {
        try {
          child.kill("SIGKILL");
        } catch (__) {}
      }
      fail(new Error(`zone timeout (${timeoutMs}ms)`));
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
      if (msg.type === "done") finish(resolve, { result: msg.result, ...io() });
      else if (msg.type === "error")
        fail(Object.assign(new Error(msg.message), { code: msg.code }));
    });

    child.on("error", (e) => fail(e));
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
