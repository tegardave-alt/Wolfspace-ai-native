// ── A kernel-contained shell on Windows, through WSL + CIFS + bwrap ──
//
// THE PROBLEM THIS SOLVES. On Windows the `bash` tool has no real boundary:
// its guard scans the command TEXT, and a command that assembles a path at run
// time walks straight through. Measured — a folder was genuinely created on the
// Desktop from inside a "contained" workspace.
//
// Linux namespaces (bash-jail.ts) give a real boundary, but only on Linux. And
// a WSL distro cannot see Windows files: automount is off, and its kernel has
// no drvfs.
//
// THE WAY OUT. The folder STAYS on Windows, is shared over SMB, and is mounted
// into the distro as /work. The process runs inside a bwrap that binds only
// /work — so the shell works with ordinary file APIs (cat, npm, git) while the
// boundary is enforced by the Linux kernel.
//
// Measured once installed:
//   /work inside bwrap     65 entries, writable
//   /root                  not visible
//   /etc                   not writable
//   network                cut off
//   200 small files        3 seconds (CIFS) vs 1 second (local)
//
// TWO THINGS LEARNED EXPENSIVELY, and both became decisions here:
//
//   1. `credentials=/path` DOES NOT WORK in this distro's CIFS client. It is
//      refused without producing a single logon event on Windows — meaning the
//      request was never sent. Eight mount attempts failed on it. What works:
//      user= and pass= directly as mount options.
//
//   2. THE MOUNT DISAPPEARS while the distro is idle. WSL2 shuts its VM down
//      and the mount goes with it. So every execution ensures the mount exists
//      first — installing it once at startup is not enough.
//
// IT CANNOT BE COMBINED WITH APPCONTAINER, and that has been measured.
//
// "Just combine the two" has exactly one technical meaning: running wsl.exe
// from INSIDE an AppContainer, so the command crosses both boundaries.
// Measured:
//   wsl -d <distro> -- echo alive   OUTSIDE the container   ok, 4589 ms
//   wsl -d <distro> -- echo alive   INSIDE the container    Access is denied
//   wsl --list                      INSIDE the container    Access is denied
// wsl.exe talks to the utility VM through devices and COM, and AppContainer
// closes the device namespace. So the two are NOT stackable layers; they are
// two mutually exclusive execution paths.
//
// AND THIS PATH IS NO LONGER ABOUT THE NETWORK. It was once described that way
// and then disproven: AppContainer already closes outbound networking (DNS
// fails, TCP AccessDenied, loopback refused) because its profile is built with
// no network capability. What remains as this path's unique value is one thing,
// and it is the most expensive to reproduce: A SEPARATE KERNEL. WSL2 is a
// Hyper-V utility VM with its own kernel, so escaping from here means breaking
// a VM boundary, not merely an access check.
//
// WHY IT STAYS OPT-IN rather than default like AppContainer: commands here are
// run by POSIX `sh`, not cmd/PowerShell. Every Windows command the model has
// already written breaks. A change of command language has to be chosen
// deliberately.
"use strict";

const { ukurBlok } = require("../ukur-blok.ts");

import { execFileSync } from "child_process";
const _penegakan = require("../penegakan.ts");

const DISTRO = process.env.WOLFSPACE_WSL_DISTRO || "WolfspaceTest";
const SHARE = process.env.WOLFSPACE_WSL_SHARE || "wolfws";
const KRED = "/root/.smbcred";
const TITIK = "/work";

// The mount installer script. Idempotent: if /work is already mounted it does
// nothing. The password is read INSIDE the distro from a mode-600 file and
// never passes through an argument, a log, or a Windows process.
// ONE LINE, separated by ';' — not a writing style but a necessity. wsl.exe
// CORRUPTS newlines inside an argument: a multi-line script arrives inside the
// distro truncated, and the symptom misleads — `sed` returns empty, so it looks
// like a broken credentials file when the file is intact. The same mistake once
// wrote a 0-byte credentials file when sent through an argument with newlines.
const SKRIP_MOUNT = [
  "grep -q ' " + TITIK + " ' /proc/mounts && exit 0",
  "IP=$(ip route | awk '/^default/{print $3}')",
  "U=$(sed -n 's/^username=//p' " + KRED + ")",
  "P=$(sed -n 's/^password=//p' " + KRED + ")",
  '[ -n "$U" ] && [ -n "$P" ] || { echo "empty credentials, or ' +
    KRED +
    ' is unreadable"; exit 3; }',
  "mkdir -p " + TITIK,
  // user=/pass=, NOT credentials= — see note (1) in this file's header.
  'mount -t cifs "//$IP/' +
    SHARE +
    '" ' +
    TITIK +
    ' -o "user=$U,pass=$P,vers=3.0,uid=0,gid=0,file_mode=0644,dir_mode=0755"',
].join("\n");

type SiapWsl = { siap: boolean; alasan: string };
let _siapCache: SiapWsl | null = null;
let _skripTerpasang = false;

function _wsl(args, opts) {
  // Labelled: this is the single busiest synchronous child process in the
  // jail path, and its default budget is 30000 ms — six times the 5000 ms at
  // which Windows calls the window dead. A timeout that large is not a safety
  // net; it is the size of the freeze it permits.
  return ukurBlok("wsl:exec", () =>
    execFileSync("wsl.exe", ["-d", DISTRO, "--", ...args], {
      encoding: "utf8",
      timeout: (opts && opts.timeout) || 30000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    }),
  );
}

// The script is installed as a FILE through stdin, then run with `sh /path`.
// The reason is not tidiness: sending the script as an ARGUMENT to wsl.exe is
// demonstrably broken — newlines are lost AND single quotes are eaten by the
// Windows quoting layer, so `sed -n 's/^username=//p'` returns empty even
// though the credentials file is intact. The symptom misleads: it looks like
// broken credentials when what is broken is the delivery. Through stdin, the
// script's contents arrive as they are.
const JALUR_SKRIP = "/tmp/wolfspace-mount.sh";

function _pasangSkrip() {
  if (_skripTerpasang) return;
  ukurBlok("wsl:pasang-skrip", () =>
    execFileSync(
      "wsl.exe",
      ["-d", DISTRO, "--", "sh", "-c", "cat > " + JALUR_SKRIP],
      {
        input: SKRIP_MOUNT,
        timeout: 25000,
        windowsHide: true,
        stdio: ["pipe", "ignore", "pipe"],
      },
    ),
  );
  _skripTerpasang = true;
}

/**
 * Is this path usable? Checked ONCE and then cached, because each check wakes
 * the distro (~3 seconds when cold).
 * @returns {{siap: boolean, alasan: string}}
 */
function tersedia() {
  if (_siapCache) return _siapCache;
  _siapCache = { siap: false, alasan: "not checked yet" };
  if (process.platform !== "win32") {
    _siapCache = { siap: false, alasan: "Windows only" };
    return _siapCache;
  }
  try {
    const out = _wsl(["sh", "-c", "test -f " + KRED + " && command -v bwrap"], {
      timeout: 25000,
    });
    if (!String(out).includes("bwrap")) {
      _siapCache = {
        siap: false,
        alasan: "bwrap is missing in distro " + DISTRO,
      };
      return _siapCache;
    }
    // The MOUNT is checked too, not only its prerequisites.
    //
    // Before this, tersedia() only confirmed credentials existed and bwrap was
    // installed, then reported "ready". Measured: it reported ready while every
    // execution failed with "mount //IP/wolfws on /work failed: Permission
    // denied" — its SMB firewall rule had gone. The result was a report
    // stronger than reality, exactly the defect removed from the bash path.
    //
    // What makes this path contained is /work, not bwrap. If /work was never
    // mounted then nothing is contained, and calling it ready misleads anyone
    // who reads it.
    const m = pastikanMount();
    if (!m.ok) {
      _siapCache = { siap: false, alasan: "mount /work failed: " + m.alasan };
      return _siapCache;
    }
    _siapCache = { siap: true, alasan: "" };
  } catch (e) {
    _siapCache = {
      siap: false,
      alasan:
        "distro " +
        DISTRO +
        " is not ready, or " +
        KRED +
        " is missing (" +
        String(e.code || e.message).slice(0, 60) +
        ")",
    };
  }
  return _siapCache;
}

/** Install the mount if absent. Called before EVERY execution. */
function pastikanMount() {
  try {
    _pasangSkrip();
    _wsl(["sh", JALUR_SKRIP], { timeout: 40000 });
    return { ok: true };
  } catch (e) {
    const pesan = String((e.stderr || "") + (e.stdout || "") + e.message);
    return { ok: false, alasan: pesan.replace(/\s+/g, " ").slice(0, 160) };
  }
}

// bwrap arguments: a READ-ONLY rootfs, /work bound read-write, everything else
// closed. --unshare-net is a separate option so a command that genuinely needs
// the network (npm install) can ask for it deliberately rather than get it
// silently.
function _argBwrap(jaringan) {
  const a = [
    "bwrap",
    "--ro-bind",
    "/usr",
    "/usr",
    "--ro-bind",
    "/bin",
    "/bin",
    "--ro-bind",
    "/lib",
    "/lib",
    "--ro-bind",
    "/sbin",
    "/sbin",
    "--ro-bind",
    "/etc",
    "/etc",
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    "--tmpfs",
    "/tmp",
    "--bind",
    TITIK,
    TITIK,
    "--chdir",
    TITIK,
    "--die-with-parent",
  ];
  try {
    // /opt often holds a runtime (node) in this distro; bound when present.
    _wsl(["test", "-d", "/opt"], { timeout: 15000 });
    a.splice(10, 0, "--ro-bind", "/opt", "/opt");
  } catch (_) {}
  if (!jaringan) a.push("--unshare-net");
  return a;
}

/**
 * Run a POSIX SHELL command inside the containment.
 *
 * AN IMPORTANT NOTE for callers: this is not PowerShell. Commands are run by
 * `sh` inside Linux, so `dir`, `Get-ChildItem` and `%VAR%` do not apply. That
 * is an unavoidable consequence of moving execution somewhere with a kernel
 * boundary.
 *
 * @param {string} perintah
 * @param {{timeout?: number, jaringan?: boolean}} [opts]
 */
async function jalankan(perintah, opts) {
  const o = opts || {};
  const siap = tersedia();
  if (!siap.siap) {
    return {
      ok: false,
      output: "WSL path unavailable: " + siap.alasan,
      ..._penegakan.label("penasihat", "tak-tersedia"),
    };
  }
  const m = pastikanMount();
  if (!m.ok) {
    return {
      ok: false,
      output:
        "mount " +
        TITIK +
        " failed: " +
        m.alasan +
        "\nRe-run the share setup, or check " +
        KRED,
      ..._penegakan.label("penasihat", "mount-gagal"),
    };
  }
  try {
    const out = _wsl([..._argBwrap(!!o.jaringan), "sh", "-c", perintah], {
      timeout: o.timeout || 120000,
    });
    return {
      ok: true,
      output: String(out).slice(0, 8000),
      ..._penegakan.label("kernel", "wsl-bwrap"),
    };
  } catch (e) {
    const teks = String((e.stdout || "") + (e.stderr || "")).trim();
    return {
      // A non-zero exit code is a legitimate RESULT for many commands (grep
      // found nothing, a test failed). The output is still returned.
      ok: false,
      output:
        (teks || String(e.message)).slice(0, 8000) +
        (e.killed ? "\n[stopped: past the time limit]" : ""),
      ..._penegakan.label("kernel", "wsl-bwrap"),
    };
  }
}

module.exports = { tersedia, pastikanMount, jalankan, DISTRO, TITIK };
