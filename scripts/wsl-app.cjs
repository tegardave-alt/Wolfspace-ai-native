#!/usr/bin/env node
// wsl-app.cjs — launches WOLFSPACE with its backend running inside WSL.
//
// ROLE IN THE SYSTEM. Network containment for capability zones (`unshare -n`)
// exists only on Linux: Node's permission model has no network dimension, and
// Windows firewall rules are per-executable so they cannot tell a zone process
// from its host (both are the same node.exe). Running the backend in WSL and
// pointing the UI at it is therefore the only way to have that containment on
// Windows.
//
// Two things make doing this by hand awkward, and both are handled here:
//
//   1. WSL SHUTS THE DISTRO DOWN when the last session closes, taking even a
//      nohup'd server with it. So the wsl.exe process below is NOT detached —
//      it is held for as long as the app lives, and that is what keeps the
//      distro up.
//   2. THE DISTRO'S IP CHANGES on every restart, and WSL2's localhost
//      forwarding proved unreliable (measured: it worked, then dropped
//      mid-session while the server kept serving from inside the distro). So
//      the IP is detected on every run rather than hardcoded or assumed to be
//      127.0.0.1.
//
// ELECTRON_RUN_AS_NODE is cleared for the same reason as in scripts/app.cjs: if
// ter-set, Electron menjalankan main.js sebagai Node biasa sehingga
// it is set, require("electron") returns no API and `app` is undefined.
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
// Without this the copy inside WSL is a snapshot frozen at the last deploy, and
// "which version am I actually running?" cannot be answered without comparing
// checksums. It really happened: after a few commits the files in WSL had a
// different md5 from the ones on Windows.
//
// What is copied is the TRACKED files in the working tree, not HEAD: while
// developing, the code you want to run is the code you are working on,
// uncommitted changes included. node_modules is NOT copied — native binaries
// differ per platform, and overwriting them would break the WSL install.
function winKeWsl(p) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (!m) return null;
  return "/mnt/" + m[1].toLowerCase() + "/" + m[2].replace(/\\/g, "/");
}

// An identity for the working tree's contents: sha1 over (path, size, mtime) of
// every file
// terlacak.
//
// DELIBERATELY not a commit hash. What is synchronised is the working tree,
// uncommitted changes included, so a commit hash would report "identical" while
// the contents differ — exactly the case that occurs most often while
// developing. Hashing file contents would be more accurate still, but size and
// mtime separate real edits well enough and cost far less over ~600 files.
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

// The tracked files and their version, computed BEFORE anything is started,
// because the "reuse or restart" decision depends on it.
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
  // The script is WRITTEN TO A FILE rather than passed as `sh -c "<long
  // command>"`.
  //
  // The inline version reported SUCCESS and deleted nothing: the command passed
  // through Windows command-line joining and then wsl.exe before reaching sh,
  // and the quotes inside the loop did not survive. Run from a file, the exact
  // same script works — verified by hand, 3 files removed.
  //
  // A lesson that recurred throughout this work: as soon as a command has
  // nested quotes, pass it through a file.
  const skripWin = path.join(os.tmpdir(), "wolfspace-sync.sh");
  const skrip = [
    "#!/bin/sh",
    "set -e",
    `cd ${rencana.repoWsl}`,
    `tar -cf - -T ${listWsl} | tar -xf - -C ${WSL_DIR}`,
    `cd ${WSL_DIR}`,
    `sort ${listWsl} > /tmp/ws-keep.txt`,
    // Pengecualian penghapusan — semuanya WAJIB, dan masing-masing punya alasan:
    //   node_modules  native binaries, platform-specific, never tracked
    //   .git          not a tracked file, but it has to be there
    //   .wolfspace    quarantine + snapshots = state rollback agent; menghapusnya
    //                 every sync would throw its recovery history away
    //   version stamp, cloud keys, MCP pids = runtime state, not code
    "find . -type f \\",
    "  -not -path './node_modules/*' -not -path './.git/*' \\",
    "  -not -path './.wolfspace/*' -not -path './config/.mcp-pids/*' \\",
    "  -not -name '.wolfspace-version.json' -not -name 'cloud-keys.json' \\",
    "  | sed 's|^\\./||' | sort > /tmp/ws-ada.txt",
    "comm -13 /tmp/ws-keep.txt /tmp/ws-ada.txt > /tmp/ws-buang.txt",
    'while IFS= read -r f; do [ -n "$f" ] && rm -f "$f"; :; done < /tmp/ws-buang.txt',
    // Empty directories are pruned too. Removing only files leaves a shell
    // folder — terukur 98 setelah pembersihan pertama — dan folder kosong bernama
    // like `vscode-extension-fork` still suggesting something is in there. The
    // exclusions are the same; `|| true` because find running out of
    // directories is not an error.
    "find . -type d -empty \\",
    "  -not -path './node_modules/*' -not -path './.git/*' \\",
    "  -not -path './.wolfspace/*' -not -path './config/*' \\",
    "  -delete 2>/dev/null || true",
  ].join("\n");
  fs.writeFileSync(skripWin, skrip, "utf8");
  const skripWsl = winKeWsl(skripWin);

  try {
    // tar runs INSIDE WSL: writing straight to the Linux filesystem is far
    // faster than copying file by file across the /mnt layer.
    execFileSync("wsl.exe", ["-d", DISTRO, "--", "sh", skripWsl, "--abaikan"], {
      stdio: "ignore",
      timeout: 180000,
    });
    // The stamp is written AFTER tar succeeds, never before: if the sync fails
    // half way, a stamp already in place would lie and claim
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
// ── 2. Start the server — but ONLY when it is needed (see the main flow) ────
// exec so that node replaces sh: a signal from here then reaches the server
// directly, rather than an intermediate shell that would leave node orphaned.
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

// Only the backend WE started is stopped. If we reused another session's,
// closing this app must not take it down — that would turn "do not stack up"
// into "kill each other".
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

// Stop somebody else's backend when its version differs — using the PID
// /healthz REPORTS, not one guessed from the process list.
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

// ── 3. The distro's IP (not 127.0.0.1) ──
function ipDistro() {
  try {
    const out = wslSync("ip -4 addr show eth0");
    const m = out.match(/inet\s+([0-9.]+)/);
    return m ? m[1] : null;
  } catch (_) {
    return null;
  }
}

// ── 4. /healthz — returns { version, pid }, or null when it does not answer ──
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
            // Older backends answer a plain "ok" rather than JSON. That is not
            // a failure — it only means the version cannot be determined.
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
  // Without this, every launch adds another process and a port clash becomes
  // the governing mechanism — which is exactly what turned "kill the old
  // process" into a destructive bug. The decision is made BEFORE anything is
  // started.
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
