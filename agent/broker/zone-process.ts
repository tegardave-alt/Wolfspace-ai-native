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
// @ts-check
"use strict";

/**
 * The zone's network containment status.
 *
 * A UNION, and its shape here enforces something real: `alasan` exists ONLY
 * on the branch that is NOT contained. So there can be no "contained, but
 * here is why it is not" — and no "not contained" without saying why. That
 * reason is the only thing separating a safeguard that was unavailable from
 * one that died quietly.
 *
 * The second effect is in laporSekali(): the guard
 * `if (... || st.jaringanTerkurung) return;` is now MACHINE-CHECKED. Delete
 * that guard and the `st.alasan` read below becomes a type error, rather
 * than an `undefined` printed silently into a security warning.
 *
 * The union is declared below as a real TypeScript type.
 */

// `alasan` exists ONLY on the un-contained branch, and that is the whole
// point: reading st.alasan without first narrowing on jaringanTerkurung is a
// type error rather than an `undefined` quietly printed into a security
// warning. Members are comma-separated to match the shape the ratchet test
// pins (tests/kontrak-tipe.test.js).
type StatusKurungan =
  | { transport: "linux-netns"; jaringanTerkurung: true }
  | {
      transport: "wsl-netns";
      jaringanTerkurung: true;
      berkasTerkurung: boolean;
      pembungkus: "bwrap" | "unshare";
      distro: string;
    }
  | { transport: "fork"; jaringanTerkurung: false; alasan: string };

import { fork, spawn, execFileSync } from "child_process";
import * as path from "path";
const { getPlatformAdapter } = require("../platform/index.cjs");

const WORKER = path.join(__dirname, "zone-worker.cjs");

// ── The permission flag is named differently across Node versions ──
//
// WHY THIS EXISTS. Node's permission model stabilised in v23 as
// `--permission`; in v20-v22 it was `--experimental-permission`. This code
// used `--permission` unconditionally, so on Node 20 EVERY zone died
// instantly:
//     $ node --permission -e 0
//     node: bad option: --permission        (exit 9)
// Measured on a real Node 20.15.1. The consequences layered up and were
// invisible from a dev machine running Node 24:
//   - CI is pinned to Node 20, so 7 of 15 suites went red on every push;
//   - the Dockerfile uses node:20-bookworm-slim, so hosted deployments had a
//     completely dead capability_exec;
//   - package.json promised engines ">=18", a promise that was never true.
// All the user ever saw was "zone process exited with code 9" — with no hint
// that a flag name was the cause.
//
// FAILS CLOSED below v20. Running a zone with no flag at all would still
// "succeed", but with no file restriction whatsoever — exactly the kind of
// silent guarantee downgrade that has caused trouble in this file before.
// Better to refuse with a readable reason.
function flagPermission(major: number, worker?: string): string[] | null {
  if (major >= 23) return ["--permission"];
  if (major >= 20) {
    return [
      "--experimental-permission",
      // --no-warnings accompanies the experimental flag: without it every
      // zone prints an ExperimentalWarning to stderr, and zone stderr is
      // reported back to the caller (_withIo in agent/tools/index.ts), so
      // every capability_exec result would come back dirty.
      "--no-warnings",
      // v20 demands an EXPLICIT read permission for its own entry script;
      // v23+ allows it implicitly. Without this line the zone dies before it
      // can run at all:
      //     Error: Access to this API has been restricted
      //     at internalModuleStat (node:internal/modules/cjs/loader)
      // Measured directly on Node 20.15.1. The grant is as narrow as it can
      // be — a single file, the worker's own source, which is not a secret.
      // Every other file access stays denied.
      "--allow-fs-read=" + worker,
    ];
  }
  return null;
}

const _MAJOR_LOKAL = Number(String(process.versions.node).split(".")[0]);

// ── Network containment (optional, Linux only) ──
//
// `--permission` closes off files but does NOT touch the network at all —
// Node's permission model simply has no such dimension, so there is no flag
// to add. Which means zone code can call https.get() directly and succeed;
// in the README that is the one row of the attack table that gets through.
//
// Patching it FROM INSIDE the zone cannot be a boundary. Tested by replacing
// http/https/net/tls/dgram in require.cache and then attacking it:
// `require('node:https')` got through (different cache key) and
// `process.binding('tcp_wrap')` got through (it sits BELOW the module layer)
// — 2 of 5 attempts, with no real effort. That is precisely the mistake the
// old vm.createContext version made: hiding references rather than removing
// the capability.
//
// The real boundary is in the kernel. `unshare -n` gives a process an empty
// network namespace (loopback only, no routes). What matters for this
// architecture: the IPC channel SURVIVES, because its socketpair was already
// open before the process entered the namespace. So request() keeps working
// exactly as before — the broker on the host has the network, the zone does
// not.
//
// Measured on WSL2 (kernel 6.18, node v24.16.0):
//     without netns -> https.get succeeded, status 403 (it reached the server)
//     with netns    -> EAI_AGAIN, and IPC stayed ALIVE
//     spawn cost    -> 78.3 ms vs 95.0 ms median; the ranges overlap
// No measurable overhead, no daemon, no container pool.
//
// Windows has no equivalent: firewall rules are per-executable and the zone
// process is the SAME node.exe as the host, so they cannot be told apart.
// There the value is null and behaviour stays as it was (a plain fork).
// ── The zone in WSL, the broker still on Windows ──
//
// Network containment only exists in the Linux kernel. Until now, using it on
// Windows would have meant moving the ENTIRE backend into WSL — far too much
// for something only the zone needs. This path bundles just the part that
// needs it: the broker stays in the Windows server process, and only the zone
// worker runs in WSL.
//
// It works because of two things that were tested first:
//   1. zone-worker.cjs only requires BUILTIN modules (vm, module), so it can
//      run straight from /mnt/c without the repo being synced into WSL.
//   2. stdio pipes are forwarded by wsl.exe AND survive inside `unshare -n`
//      — because a pipe is not the network. A TCP bridge would be impossible
//      here: a zone with no network routes cannot call its broker back.
//      Tested: ping/pong got through while https inside the zone still
//      returned EAI_AGAIN.
// Provide zone-worker.cjs INSIDE the distro, without depending on /mnt.
//
// WHY. Originally the worker ran straight from /mnt/c — convenient, since it
// only requires builtins and so needs no repo sync. But /mnt belongs to the
// distro's configuration, not to us: a single `[automount] enabled = false`
// line in /etc/wsl.conf empties it, and the whole WSL path degrades silently
// to an uncontained fork. That is not hypothetical — it happened on this
// machine as soon as the distro was hardened, and that hardening was the
// RIGHT call: a distro that cannot see Windows files is the stronger posture,
// not the weaker one. So we are the ones who have to adapt.
//
// HOW. The worker's contents are streamed through wsl.exe's stdin into the
// distro. This direction keeps working even with `[interop] enabled = false`,
// because what interop disables is calling Windows binaries FROM INSIDE WSL —
// not the reverse.
//
// The filename carries a sha1 of the contents, so no staleness check is
// needed at all: different contents means a different path. Re-copying only
// happens when the worker actually changes, and the result survives across
// processes.
function siapkanWorker(distro: string) {
  const jalankan = (perintah: string, input?: string | Buffer) =>
    execFileSync("wsl.exe", ["-d", distro, "--", "sh", "-c", perintah], {
      stdio: input === undefined ? "ignore" : ["pipe", "ignore", "ignore"],
      ...(input === undefined ? {} : { input }),
      timeout: 20000,
    });

  // The /mnt path is still tried first when it is mounted: zero copying, and
  // it always follows the file on disk with nothing in between.
  const viaMnt = winKeWsl(WORKER);
  if (viaMnt) {
    try {
      jalankan(`test -f ${viaMnt}`);
      return viaMnt;
    } catch (_) {
      /* /mnt not mounted — fall through to copying */
    }
  }

  let isi;
  try {
    isi = require("fs").readFileSync(WORKER);
  } catch (e) {
    _wslAlasan = `worker unreadable on the Windows side (${WORKER}): ${e.code || e.message}`;
    return null;
  }
  const sha = require("crypto").createHash("sha1").update(isi).digest("hex");

  // /opt when writable, otherwise /tmp (lost when the distro stops, which is
  // fine — the copy is a few tens of KB and happens once per process).
  for (const dir of ["/opt/wolfspace", "/tmp/wolfspace"]) {
    const tujuan = `${dir}/zone-worker-${sha}.cjs`;
    try {
      jalankan(`test -f ${tujuan}`);
      return tujuan; // already there from an earlier process
    } catch (_) {
      /* not there yet — copy it */
    }
    try {
      jalankan(
        `mkdir -p ${dir} && cat > ${tujuan}.tmp && mv ${tujuan}.tmp ${tujuan}`,
        isi,
      );
      return tujuan;
    } catch (_) {
      /* cannot write here — try the next location */
    }
  }
  _wslAlasan = `worker could not be copied into distro "${distro}" — both /opt and /tmp are not wisa ditulis`;
  return null;
}

/** Everything needed to launch a zone inside a WSL distro. */
interface ZonaWsl {
  distro: string;
  nodeWsl: string;
  workerWsl: string;
  flag: string[];
  bwrap: boolean;
}

let _wslCache: ZonaWsl | null | undefined;
let _wslAlasan: string | null = null; // why WSL was not used — once swallowed by catch(_)
function wslZona() {
  if (_wslCache !== undefined) return _wslCache;
  _wslCache = null;
  if (process.platform !== "win32") {
    _wslAlasan = "not Windows";
    return _wslCache;
  }
  if (process.env.WOLFSPACE_ZONE_WSL === "0") {
    _wslAlasan = "dimatikan lewat WOLFSPACE_ZONE_WSL=0";
    return _wslCache;
  }
  const distro = process.env.WOLFSPACE_WSL_DISTRO || "WolfspaceTest";
  const nodeWsl = process.env.WOLFSPACE_WSL_NODE || "/opt/node24/bin/node";
  const workerWsl = siapkanWorker(distro);
  if (!workerWsl) return _wslCache; // siapkanWorker already set the reason
  // Four conditions, REALLY tested and distinguished ONE BY ONE through exit
  // codes. The old `a && b && c` chain could only say "failed" — but "distro
  // missing" and "the Node inside it is too old" call for completely
  // different actions. Still a single wsl.exe call, so it costs no more.
  const SEBAB = {
    11: () =>
      `Node is missing / not executable at ${nodeWsl} (inside distro "${distro}")`,
    12: () =>
      `worker hilang dari dalam WSL di ${workerWsl} setelah sempat disiapkan — distro mungkin di-restart di tengah jalan`,
    13: () =>
      `Node at ${nodeWsl} exists but its permission flag was refused — a corrupt binary, or not real Noden`,
    14: () =>
      `unshare could not create a network namespace in distro "${distro}"`,
  };
  // There is no code 15: the version check moved to the JS side after the
  // probe, because the shell no longer computes it. A dead entry in this table
  // would be an explanation that never appears — exactly the kind of
  // documentation that misleads its reader.
  try {
    // Exit code 0 ALONE is not enough for the Node stage: a binary that
    // ignores unknown flags (/bin/echo, say) also exits 0, and the probe would
    // then declare containment active when it is not. Proven while testing
    // this. So Node is asked to PRINT its version — only Node can — and that
    // number also decides which flag is used later.
    const keluar = execFileSync(
      "wsl.exe",
      [
        "-d",
        distro,
        "--",
        "sh",
        "-c",
        // The version is read FIRST with no flags at all; the matching flag is
        // only tried on the second call. The reverse order is impossible —
        // using --permission to detect the version would fail on Node 20,
        // precisely on the distros that are actually supported.
        //
        // NO `$(...)`: command substitution does not survive the trip through
        // wsl.exe (measured: `sh: syntax error: unexpected "("`). So the
        // version is printed directly by Node and parsed on the JS side.
        `test -x ${nodeWsl} || exit 11; test -f ${workerWsl} || exit 12; ` +
          `unshare -n true || exit 14; ` +
          // bwrap is CHECKED, not assumed — the same pattern as _hasBwrap() in
          // LinuxAdapter. Its absence is not a failure: the zone still runs
          // with unshare -n alone, just without file containment. The marker
          // is printed so the JS side knows which guarantee it actually got.
          `if bwrap --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp ` +
          `--tmpfs /mnt --unshare-net --die-with-parent true 2>/dev/null; ` +
          `then printf BWRAPYA; else printf BWRAPTIDAK; fi; ` +
          `${nodeWsl} -e 'process.stdout.write("NODEV"+process.versions.node)' || exit 13`,
      ],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 20000, encoding: "utf8" },
    );
    const v = /NODEV(\d+)\./.exec(keluar || "");
    if (!v) {
      _wslAlasan = `${nodeWsl} in distro "${distro}" exited cleanly but is not Node — it printed no versi apa pun`;
      return _wslCache;
    }
    const flag = flagPermission(Number(v[1]), workerWsl);
    if (!flag) {
      _wslAlasan =
        `Node ${v[1]}.x at ${nodeWsl} is too old — the permission model needs Node >= 20 ` +
        `(v20-v22: --experimental-permission, v23+: --permission)`;
      return _wslCache;
    }
    // The flag is NOT assumed to work just because the version number matches.
    // This is the check that once caught /bin/echo passing as "Node"; removing
    // it means going back to trusting a guess.
    try {
      execFileSync(
        "wsl.exe",
        ["-d", distro, "--", nodeWsl, ...flag, "-e", "0"],
        { stdio: "ignore", timeout: 20000 },
      );
    } catch (_) {
      _wslAlasan = `Node ${v[1]}.x at ${nodeWsl} refused ${flag[0]} — a corrupt binary or not real Nodeguhan`;
      return _wslCache;
    }
    _wslCache = {
      distro,
      nodeWsl,
      workerWsl,
      flag,
      bwrap: /BWRAPYA/.test(keluar),
    };
  } catch (e) {
    // WSL is not ready — fall back to a plain fork. The reason is KEPT, not
    // discarded.
    _wslCache = null;
    if (e.code === "ETIMEDOUT" || /timed? ?out/i.test(String(e.message))) {
      _wslAlasan = `distro "${distro}" did not answer within 20 seconds`;
    } else if (SEBAB[e.status]) {
      _wslAlasan = SEBAB[e.status]();
    } else {
      // An exit code outside 11-14 means wsl.exe itself failed — distro not
      // registered, WSL not installed. The message is in wsl.exe's stderr,
      // which is UTF-16; without stripping NULs it reads as "D.i.s.t.r.o".
      const se = String(e.stderr || "")
        .replace(/ /g, "")
        .trim()
        .split("\n")[0];
      // status -1 arrives as 4294967295 (unsigned). That number means nothing
      // to whoever reads it, so it is normalised.
      const kode = e.status === 4294967295 ? -1 : e.status;
      _wslAlasan =
        `wsl.exe failed to run distro "${distro}" (code ${kode}) — ` +
        (se || "the distro is probably not registered; check `wsl -l -v`");
    }
  }
  return _wslCache;
}

// Containment status for ONE zone execution, in a form that can be attached
// to the result.
//
// WHY THIS EXISTS. Before it, a WSL failure meant the zone quietly ran with no
// network containment: no log, no marker in the result, and `--permission`
// still holding files back made everything LOOK normal. That is the same
// pattern as the old Docker gate that was removed — a safeguard that can die
// on its own without saying so. The danger is not the missing containment
// (sometimes it genuinely is unavailable) but having no way to tell which.
// The wrapper that runs the worker INSIDE the distro.
//
// `unshare -n` contains the NETWORK only. Files are held by Node's
// --permission, and that applies to the Node process alone — anything spawned
// from inside the zone gets full access to the distro rootfs again.
//
// bwrap closes that gap in the kernel, and it costs NOTHING: measured at -3 ms
// against running node bare, i.e. inside the noise. What is expensive on this
// path is launching wsl.exe (183 ms of 216 ms total), not the containment.
//
// --tmpfs /mnt is the most important part, not mere tidiness. An ordinary WSL
// distro mounts the ENTIRE Windows drive at /mnt/c. Without that mask, the
// zone's containment depends on how the distro was configured — something
// this code cannot guarantee. With the mask, the guarantee belongs to the code.
/**
 * @param {{distro:string, bwrap?:boolean}} wsl  zona WSL hasil wslZona()
 * @returns {string[]} wrapper argv, ready to insert before the node path
 */
function pembungkusWsl(wsl: ZonaWsl) {
  if (!wsl.bwrap) return ["unshare", "-n"];
  return [
    "bwrap",
    "--ro-bind",
    "/",
    "/", // read-only rootfs: node, worker and libraries stay readable
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    "--tmpfs",
    "/tmp", // the only writable place, and it vanishes when the zone dies
    "--tmpfs",
    "/mnt", // tutup drive Windows apa pun konfigurasi distronya
    "--unshare-net", // replaces unshare -n
    "--die-with-parent", // no orphans if the Windows side dies suddenly
  ];
}

/**
 * @param {unknown} ns  netnsWrapper() result — truthy when a Linux namespace is used
 * @param {{distro:string, bwrap?:boolean}|null|undefined} wsl  the WSL zone, when used
 * @param {boolean} [matiSengaja] caller disabled it via opts.netns=false
 * @returns {StatusKurungan}
 */
function statusKurungan(
  ns: string | null,
  wsl: ZonaWsl | null,
  matiSengaja?: boolean,
): StatusKurungan {
  if (ns) return { transport: "linux-netns", jaringanTerkurung: true };
  if (wsl)
    return {
      transport: "wsl-netns",
      jaringanTerkurung: true,
      // The FILE guarantee is reported separately from the network guarantee,
      // because the two really can differ: without bwrap the zone still loses
      // the network, but the distro rootfs is wide open to anything spawned
      // from inside it. A single "contained" flag would hide that gap.
      berkasTerkurung: !!wsl.bwrap,
      pembungkus: wsl.bwrap ? "bwrap" : "unshare",
      distro: wsl.distro,
    };
  let alasan;
  if (matiSengaja) alasan = "dimatikan pemanggil (opts.netns=false)";
  else if (process.platform === "win32") alasan = _wslAlasan || "WSL not ready";
  else if (process.platform === "linux")
    alasan =
      "unshare could not create a namespace — needs CAP_SYS_ADMIN or a user namespace";
  else alasan = `platform ${process.platform} has no network namespace`;
  return { transport: "fork", jaringanTerkurung: false, alasan };
}

// A ONE-SHOT warning, straight to stderr.
//
// Deliberately NOT through agent/debug.ts: that logger is gated on
// VERBOSE/DEBUG_ON, both off by default — and a warning that a security
// guarantee has been downgraded is exactly what someone who turned nothing on
// most needs to see. Once per process rather than per execution, so it does
// not flood the agent's output.
let _sudahLapor = false;
/** @param {StatusKurungan} st */
function laporSekali(st: StatusKurungan) {
  if (_sudahLapor || st.jaringanTerkurung) return;
  _sudahLapor = true;
  try {
    process.stderr.write(
      "[WOLFSPACE:broker] WARNING: the capability zone is running WITHOUT network " +
        "confinement.\n" +
        "  alasan   : " +
        st.alasan +
        "\n" +
        "  effect   : code inside the zone can reach the network directly; " +
        "files are STILL held by --permission.\n" +
        (process.platform === "win32"
          ? "  perbaikan: pastikan distro WSL hidup dan Node >= 23 ada di dalamnya " +
            "(WOLFSPACE_WSL_DISTRO / WOLFSPACE_WSL_NODE).\n"
          : ""),
    );
  } catch (_) {}
}

function winKeWsl(p: string) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(String(p));
  if (!m) return null;
  return "/mnt/" + m[1].toLowerCase() + "/" + m[2].replace(/\\/g, "/");
}

let _netnsCache: string | null | undefined;
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
      _netnsCache = null; // needs CAP_SYS_ADMIN / user-ns — runs unconfined
    }
  }
  return _netnsCache;
}

// How much zone output is KEPT. This is NOT a limit on how much is read: the
// pipe must be drained continuously whatever it holds (see makeSink).
const MAX_CAPTURE = 256 * 1024;

// A sink that ALWAYS consumes but only keeps up to `limit`.
//
// This is the heart of the fix. stdout used to be opened as 'pipe' and then
// never read at all — only stderr had a listener. Once the OS pipe buffer
// filled (~64 KB), the zone process BLOCKED forever in console.log and then
// died on timeout. Measured on identical code, varying only the volume:
//     no printing        -> 42 in 167 ms
//     printing ~2 KB     -> 42 in 185 ms
//     printing ~200 KB   -> TIMEOUT after 8 seconds
// The failure was silent: the message was just "zone timeout", with no hint
// that printing too much caused it — people would blame their own code rather
// than the sandbox. For a sandbox whose whole job is running foreign code,
// "a program that prints a lot will hang" is a defect you hit on first use.
//
// Limiting what is KEPT must never mean stopping READING — drop the listener
// once it is full and the deadlock comes straight back.
function makeSink(limit: number) {
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

function runInCapabilityZone(
  code: string,
  broker: any,
  opts: {
    timeout?: number;
    maxCapture?: number;
    netns?: boolean;
    pelapor?: unknown;
  } = {},
) {
  const timeoutMs = opts.timeout || 10000;
  const limit = opts.maxCapture || MAX_CAPTURE;

  return new Promise((resolve, reject) => {
    // With netns, spawn is used rather than fork: fork cannot have a wrapper
    // command inserted in front of it. `stdio: [..., 'ipc']` still provides the
    // same child.send/on('message') channel, because the child Node reads it
    // from NODE_CHANNEL_FD.
    // Three transports, chosen automatically. The order is not an aesthetic
    // preference: the ones above give stronger guarantees.
    //   1. Linux    -> unshare -n + fork/spawn, IPC fd. The cheapest.
    //   2. Windows  -> wsl.exe + unshare -n, stdio protocol. Adds wsl.exe
    //                  startup cost, but it is the ONLY way to get network
    //                  containment on Windows.
    //   3. other    -> a plain fork. Files are still held by --permission; the
    //                  network is not. The old behaviour, as it was.
    const ns = opts.netns === false ? null : netnsWrapper();
    const wsl = ns || opts.netns === false ? null : wslZona();
    const kurungan = statusKurungan(ns, wsl, opts.netns === false);
    laporSekali(kurungan);
    // Frame token: random per execution so zone code cannot forge a protocol
    // line by printing a guessable prefix.
    const token = wsl
      ? "WSZ" + require("crypto").randomBytes(8).toString("hex") + ""
      : "";
    // Node too old: refuse, rather than running with no file restriction.
    const flagLokal = flagPermission(_MAJOR_LOKAL, WORKER) || [];
    if (!wsl && !flagLokal) {
      return reject(
        Object.assign(
          new Error(
            `Node ${process.versions.node} does not support the permission model — ` +
              "capability_exec butuh Node >= 20 (v20-v22: --experimental-permission, " +
              "v23+: --permission). The zone is NOT run, because without that flag " +
              "the task code would run with full file access.",
          ),
          { kurungan, stdout: "", stderr: "" },
        ),
      );
    }

    // The INVARIANT that keeps `...flagLokal` below safe, and which until now
    // was written down nowhere: `ns` is only ever set on Linux (netnsWrapper),
    // `wsl` only on win32 (wslZona). They are NEVER both set. So the `if (ns)`
    // branch is only reachable on Linux, where `wsl` must be null, which means
    // the `!wsl && !flagLokal` guard above has already ensured flagLokal is not
    // null.
    //
    // Written down because TypeScript flagged it and the invariant turned out
    // to live in TWO other functions — a reader has no way to know without
    // opening both. If wslZona() is ever made to run on Linux (for testing,
    // say), this branch becomes reachable with flagLokal null and `...null`
    // throws.
    // stdout/stderr are asserted non-null because ALL THREE branches below use
    // "pipe" for both. stdin is deliberately NOT asserted: two of the three
    // branches use "ignore", so there it really is null — and that is reflected
    // at the one place that touches it (the wsl branch).
    /** @type {import("child_process").ChildProcess & {
     *    stdout: import("stream").Readable,
     *    stderr: import("stream").Readable }} */
    let child;
    if (ns) {
      // A cast, NOT `|| []`. If the invariant above ever breaks, `...null`
      // throws and the zone does not run — which is the correct behaviour.
      // `|| []` would run it WITHOUT the permission flag, i.e. silently with no
      // file containment: exactly the quiet failure this module exists to avoid.
      // Casting the spawn result: the stdio literal is inferred as string[]
      // rather than a tuple, so TypeScript picks the overload whose streams are
      // nullable. "pipe" in positions 1 and 2 is plain to see on the next line.
      child = /** @type {typeof child} */ spawn(
        ns,
        ["-n", process.execPath, .../** @type {string[]} */ flagLokal, WORKER],
        { stdio: ["ignore", "pipe", "pipe", "ipc"] },
      );
    } else if (wsl) {
      child = spawn(
        "wsl.exe",
        [
          "-d",
          wsl.distro,
          "--",
          "env",
          "WOLFSPACE_ZONE_TOKEN=" + token,
          ...pembungkusWsl(wsl),
          wsl.nodeWsl,
          // The flag comes from the Node version INSIDE the distro, not the
          // local one — the two can differ considerably.
          ...wsl.flag,
          wsl.workerWsl,
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
    } else {
      // This branch is only reachable when !ns && !wsl, and the guard above
      // (`!wsl && !flagLokal` -> reject) has already ensured flagLokal is not
      // null in exactly that state. A cast, not a default value — Node without
      // the permission flag must FAIL, not run with no file containment.
      child = /** @type {typeof child} */ fork(WORKER, [], {
        execArgv: /** @type {string[]} */ flagLokal, // tanpa --allow-fs-read/write => fs ditolak se-proses
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
    }

    // Satu cara mengirim, apa pun transportnya.
    const kirimKeZona = (msg) => {
      if (wsl) {
        try {
          // Only the wsl branch uses stdio "pipe" at position 0; in the other
          // two branches stdin really is null. The `if (wsl)` guard is what
          // makes this safe, and this cast marks that dependency.
          /** @type {import("stream").Writable} */ child.stdin.write(
            JSON.stringify(msg) + "\n",
          );
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
    // On the WSL transport, stdout carries TWO things: protocol lines (token-
    // prefixed) and whatever the zone code printed. They are separated here —
    // protocol lines are taken out, the rest goes into the output sink as
    // usual, so the "zone output comes back whole" guarantee holds on both
    // transports.
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
      // A trailing chunk with no newline when the process ends — still user output.
      child.stdout.on("end", () => {
        if (sisa) out.push(sisa);
      });
    } else {
      child.stdout.on("data", (c) => out.push(c));
    }
    child.stderr.on("data", (c) => err.push(c));

    // Output is attached to FAILURES too, not just successes — when the zone
    // times out or throws, whatever it managed to print is the only clue left.
    // `kurungan` is in io() rather than only on the success path: if the zone
    // times out or throws, the question "was that contained or not" becomes
    // more important, not less.
    const io = () => ({
      stdout: out.text,
      stderr: err.text,
      truncated: out.truncated || err.truncated,
      outBytes: out.bytes,
      errBytes: err.bytes,
      kurungan,
    });

    // Settle AFTER stdio has drained, not immediately.
    //
    // `done` from IPC used to be followed straight by SIGKILL. An IPC message
    // can arrive ahead of data still queued in the stdout pipe, so killing the
    // child right then DISCARDS output that has not been read. Measured on a
    // zone printing ~5 MB: only 530,452 bytes arrived. On Windows it happened
    // not to show because the ordering differs — it surfaced as soon as the
    // netns path started using spawn. Silent loss like this is exactly what
    // must be avoided.
    //
    // What is awaited is 'close' — the event that fires after the process exits
    // AND both stdio pipes are exhausted. Measured on the 5 MB printer:
    //     +605 ms  done message (only 327,240 B read so far)
    //     +875 ms  stdout END (5,050,000 B — whole)
    //     +878 ms  close
    //
    // DO NOT call child.disconnect() here. Measured: with a parent-side
    // disconnect, 'exit' still fires (~240 ms) but 'close' NEVER does, so the
    // DRAIN_MS safety net always expires and every zone execution carries an
    // extra ~3 seconds. What releases the child's event loop is
    // process.disconnect() in zone-worker, not here.
    const DRAIN_MS = 3000;
    let selesai = false;
    const settle = (fn: Function, mkVal: () => unknown, killNow?: boolean) => {
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

    const fail = (e: Error, killNow?: boolean) =>
      settle(reject, () => Object.assign(e, io()), killNow);

    const timer = setTimeout(() => {
      fail(new Error(`zone timeout (${timeoutMs}ms)`), true);
    }, timeoutMs);

    // ONE handler for both transports. This logic used to hang off
    // child.on("message"), which only exists on the IPC channel — so the stdio
    // transport would ignore capability requests entirely, and a zone in WSL
    // could not use request() for anything.
    async function tanganiPesanZona(msg) {
      // A report of a direct network attempt from the zone. Not a request —
      // there is nothing to answer, it just needs recording so the attempt is
      // visible in the audit trail instead of failing in silence.
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
      // io() is called LATER (inside the thunk), after stdio has drained — if
      // it were evaluated here, the contents would be truncated again.
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

    // opts.pelapor === false disables the network-reporter stub inside the zone.
    // Used by the netns test: with the reporter active, the stub throws before a
    // socket is created, so the test would pass even with a dead namespace.
    // Disabling it makes the attempt genuinely tested against the kernel.
    kirimKeZona({ type: "run", code, pelapor: opts.pelapor !== false });
  });
}

module.exports = {
  runInCapabilityZone,
  statusKurungan,
  wslZona,
  netnsWrapper,
  flagPermission,
};
