// ── bash containment through Linux namespaces (replacing the Docker container) ──
//
// WHY IT EXISTS. Workspace containment for `bash` used to have only two levels:
// a single-use Docker container when the daemon was alive, or a regex guard
// whose own code labelled it "leaky". Docker meant depending on a daemon that
// has to be installed and running — on this development machine it is off, so
// what actually ran day to day was that regex guard.
//
// The kernel already provides the same ingredients with no daemon at all. What
// is reproduced, one by one, from the old `docker run` arguments:
//
//   --network none          -> unshare -n            (empty network namespace)
//   -v <ws>:/work           -> mount --bind ws       (only that folder visible)
//   --read-only             -> bind system dirs, remount ro
//   --tmpfs /tmp:size=64m   -> mount -t tmpfs -o size=64m
//   --pids-limit            -> unshare -p -f + ulimit -u
//   --memory / --cpus       -> ulimit -v / -t  (approximate; see the NOTE below)
//
// Proven on a WSL2 prototype (kernel 6.18): host secret files unreadable, /etc
// absent entirely, `ls /work/../..` showing only the jail's contents, /bin
// read-only, network dead — while writes in /work still reach the real
// workspace folder on the host.
//
// AN HONEST NOTE: ulimit is NOT a full equivalent of cgroups. `ulimit -v` caps
// virtual address space per process, not the total RSS of a process group as
// `--memory` does. For genuinely strict resource limits, cgroup v2 remains the
// answer. What is guaranteed here is the ACCESS boundary (files and network) —
// which is the reason this containment exists.
"use strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn, execFileSync } from "child_process";

// System directories bound READ-ONLY so the shell has its tools without being
// able to change them. /etc is DELIBERATELY excluded: it often holds
// configuration and credentials, and a shell does not need it for ordinary
// commands.
const BIND_RO = ["/bin", "/sbin", "/usr", "/lib", "/lib64"];
// /dev is NOT bound wholesale — it contains raw disks (/dev/sda and friends)
// which are exactly what should stay hidden. Only the nodes a shell genuinely
// needs are copied in one by one. Without this, `cmd > /dev/null` — an
// extremely common pattern — fails with "can't create /dev/null: nonexistent
// directory", so even correct containment ends up unused because it breaks
// ordinary commands.
const DEV_NODES = ["null", "zero", "urandom", "random", "tty"];
const TMPFS_SIZE = "64m";
const MAX_PROC = 256;
const MAX_VMEM_KB = 512 * 1024;
const MAX_CPU_SEC = 60;

let _bisa: any = null;
function tersedia() {
  if (_bisa !== null) return _bisa;
  _bisa = false;
  if (process.platform === "linux") {
    try {
      // Needs the right to create a mount namespace AND to bind inside it.
      // Tested for real rather than guessed from the uid: one failure means it
      // is not used.
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
  // The user's command is fed through `sh -s` on stdin, NOT pasted into the
  // script string: pasting it would let a quote or a `$(...)` in the user's
  // command break this wrapper script and escape the chroot before it is
  // contained.
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

// root    = the host workspace folder that may be seen
// workdir = the working directory INSIDE the jail ("/work" or "/work/<sub>")
function jalankan(cmd, root, opts: any = {}) {
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
      // The mounts vanish with their namespace; all that is left is an empty
      // directory. Removed so /tmp does not accumulate spent jails.
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
