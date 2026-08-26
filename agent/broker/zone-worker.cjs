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

// ── Network reporter (NOT a guard) ──
//
// The network modules are replaced with stubs that REPORT the attempt to the
// broker and then throw an error naming the correct route. This is deliberately
// not a security boundary: tested directly, `require('node:https')` walks past
// it (different cache key) and `process.binding('tcp_wrap')` walks past it
// (below the module layer) — 2 out of 5 attempts, on the first try. What
// actually holds is the kernel's network namespace.
//
// Its job is to COMPLETE netns, not replace it. Without it, code that wanders
// towards the network dies with EAI_AGAIN and leaves **0 audit entries** — so it
// is stopped but invisible. With it, attempts taking the ordinary module route
// get recorded; the ones slipping through the gaps above still die in the
// kernel, just unrecorded. Partly visible beats not at all.
// Intercepted at Module._load, NOT by overwriting require.cache.
//
// Overwriting the cache only catches `require("https")`. The
// `require("node:https")` form escapes it, because a builtin with the `node:`
// prefix never goes through require.cache at all — measured directly: the plain
// form produced 1 audit entry, the `node:` form produced 0. Module._load is the
// one point BOTH forms pass through.
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
              kirim({
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

// ── Channel to the broker: IPC fd OR stdio ──
//
// The IPC fd (socketpair) is used when the worker is forked directly — fast,
// and it survives `unshare -n` because the socketpair is already open before the
// process enters the namespace.
//
// But an inherited fd does NOT cross `wsl.exe`. That became the obstacle when
// the broker lives on Windows while the zone has to run on Linux for netns to
// apply at all. A TCP bridge is impossible there: a zone under `unshare -n` has
// no network route whatsoever, not even to the host — so it cannot call back.
// An stdio pipe is NOT network and wsl.exe forwards it, which makes it the only
// channel that survives. Tested: ping/pong gets through, and the network inside
// the zone still answers EAI_AGAIN.
//
// TOKEN separates the protocol from user output on that same stdout. It is
// random per execution, so zone code cannot forge a protocol line by printing a
// guessed prefix — the same pattern as the heredoc in bash-jail.
const TOKEN = process.env.WOLFSPACE_ZONE_TOKEN || "";
const PAKAI_STDIO = !!TOKEN;

function kirim(msg, sesudah) {
  if (PAKAI_STDIO) {
    process.stdout.write(TOKEN + JSON.stringify(msg) + "\n", () => {
      if (sesudah) sesudah();
    });
    return;
  }
  process.send(msg, sesudah);
}

// Release the channel so the process exits on its own — NOT process.exit(),
// which cuts off stdout writes still queued (losing exactly the zone output we
// are trying to keep intact).
//
// In stdio mode what holds the event loop is the resumed stdin; in IPC mode it
// is the socketpair. Each has to be released its own way.
function tutupKanal() {
  if (PAKAI_STDIO) {
    try {
      process.stdin.pause();
    } catch (_) {}
    return;
  }
  try {
    process.disconnect();
  } catch (_) {}
}

let reqId = 0;
const pending = new Map();

function tanganiPesan(msg) {
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
    // The reporter is installed AT run time, not at module load, so it can be
    // switched off per execution. The netns test needs that: with the reporter
    // active the stub throws first, so the test would PASS even with the network
    // namespace dead — proof that proves nothing. Switching it off lets the
    // attempt actually reach the kernel, which is the thing under test.
    if (msg.pelapor !== false) pasangPelaporJaringan();
    runTask(msg.code);
  }
}

if (PAKAI_STDIO) {
  let buf = "";
  process.stdin.on("data", (c) => {
    buf += c.toString();
    let i;
    while ((i = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        tanganiPesan(JSON.parse(line));
      } catch (_) {}
    }
  });
  process.stdin.resume();
} else {
  process.on("message", tanganiPesan);
}

function request(capability, params) {
  return new Promise((resolve, reject) => {
    const id = ++reqId;
    pending.set(id, { resolve, reject });
    kirim({ type: "capability-request", id, capability, params });
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
    // Release the IPC channel AFTER the message has actually been sent. That
    // channel is the only handle holding this process's event loop; once it goes,
    // the process exits by itself, stdout flushes, and the parent gets 'close'
    // immediately.
    //
    // Without this the parent has to wait out the DRAIN_MS safety net on EVERY
    // execution (measured: ~3.1 s per zone). process.exit() is not a substitute —
    // it cuts off stdout writes still queued, losing the very output we are
    // trying to keep.
    kirim({ type: "done", result }, tutupKanal);
  } catch (e) {
    kirim({ type: "error", message: e.message, code: e.code }, tutupKanal);
  }
}
