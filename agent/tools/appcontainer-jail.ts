// ── An AppContainer-contained shell: one directory, enforced by the Windows kernel ──
//
// THE PROBLEM THIS SOLVES. The `bash` tool on Windows could only SCAN COMMAND
// TEXT. It was demonstrably defeatable: a command that assembled a path at run
// time passed the scan and genuinely created a folder in C:\Users\dave\Desktop.
//
// A process inside an AppContainer runs on a token carrying a container SID.
// File access checks then REQUIRE that SID in the object's DACL — ordinary user
// rights are NOT enough. So the entire filesystem is closed except what is
// explicitly opened for that SID. Deny-by-default, in the kernel.
//
// MEASURED, on the very same escape:
//   cwd                C:\Users\dave\WOLFSPACE
//   write workspace    CAN           read workspace    CAN
//   write Desktop      EPERM         read cloud-keys   EPERM
//   read Documents     EPERM         ASSEMBLED path    EPERM
//
// WHY THIS WAS CHOSEN as the default rather than WSL or a separate account:
//   - commands stay PowerShell; WSL replaces them with POSIX sh
//   - launching it needs NO elevation; a separate account would require
//     WOLFSPACE to run as Administrator, which enlarges the risk instead
//   - no SMB share, no mount that can drop, no stored password
//
// FOUR TRAPS paid for dearly while building it, all guarded in
// tests/appcontainer-jail.test.js so they cannot come back:
//   1. A NULL stdin makes node crash WITH NO MESSAGE in
//      InitializeOncePerProcess, and git reports "could not open /dev/null".
//      Programs need a valid stdin handle; NUL must be opened by the parent
//      and inherited.
//   2. Capturing output through a FILE catches PowerShell's output but NOT its
//      children's. A pipe is inherited down the whole chain; a file is not.
//   3. PowerShell's provider location silently falls back to another drive
//      while the process's own cwd is CORRECT. The first theory (traverse
//      rights) was tested until disproven: the cause is closed drive volume
//      information, not an ACL.
//   4. The launcher has to be a BINARY. Six PowerShell versions failed in a row
//      over ANSI/Unicode marshalling and assignments to nested struct fields
//      that would not stick — neither of which exists in C#.
"use strict";

const { ukurBlok } = require("../ukur-blok.ts");

import { execFile, execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
const _penegakan = require("../penegakan.ts");

const CONTAINER = process.env.WOLFSPACE_AC_NAME || "wolfspace-jail";
const EXE = path.join(
  __dirname,
  "..",
  "..",
  "scripts",
  "appcontainer",
  "AcLaunch.exe",
);
const PS = path.join(
  process.env.SystemRoot || "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);

// ── State that MUST survive a hot reload ──
//
// electron/main.js watches agent/, public/, electron/ and scripts/, and on every
// change DISCARDS THE WHOLE project require.cache and reloads core. The
// WOLFSPACE agent edits its own source, so it triggers that reload itself, many
// times, mid-task.
//
// The consequence if this state lived at module scope: an availability probe
// costing 976 ms would be PAID AGAIN every time the agent touched one file.
// Measured on a simulated reload cycle: the cache dropped 26 modules per round,
// and every round started everything from scratch.
//
// What is stored here is PROCESS-level fact, not module state: whether this
// container is usable, what its SID is, which folders have been granted. None
// of it changes because a source file was edited. So it lives on globalThis,
// which is not discarded.
const _G = (globalThis.__wolfspaceAc = globalThis.__wolfspaceAc || {
  cache: null,
  sid: null,
  diberi: new Set(),
  sementara: new Set(),
});

/**
 * A prologue that puts PowerShell in the working folder.
 *
 * WHY IT IS NEEDED. CreateProcessW sets the process cwd correctly — node inside
 * the container reports the right folder, and [Environment]::CurrentDirectory is
 * right too. But PowerShell has its own PROVIDER location and refuses to adopt
 * it: `Set-Location` to that folder fails "Access is denied", the provider
 * location silently falls back to another drive, and EVERY RELATIVE PATH lands
 * somewhere wrong — `Out-File '_x.txt'` fails even though the workspace is
 * plainly writable.
 *
 * THE CAUSE IS NOT FILE RIGHTS, and that was tested until disproven. The first
 * theory was a traverse chain on C:\ and C:\Users. Those grants were installed
 * (which needs Administrator) and it was measured again: Set-Location was STILL
 * refused. What separated the cause:
 *   [IO.Directory]::SetCurrentDirectory(workspace)  -> SUCCEEDS
 *   Set-Location -LiteralPath workspace             -> Access is denied
 *   [IO.DriveInfo]::new('C:').VolumeLabel/TotalSize -> EMPTY
 * The folder is fully reachable; what is not reachable is the drive's VOLUME
 * information. PowerShell's FileSystem provider demands it, and AppContainer
 * closes device access — the same restriction that kills `vol` and `dir`. No
 * file ACL can fix it.
 *
 * New-PSDrive does not demand that information, so it succeeds where
 * Set-Location fails.
 *
 * @param {string} cwd
 */
function _pembukaCwd(cwd) {
  const q = cwd.replace(/'/g, "''");
  return (
    "try{Set-Location -LiteralPath '" +
    q +
    "' -EA Stop}catch{$null=New-PSDrive -Name WS -PSProvider FileSystem -Root '" +
    q +
    "' -Scope Global -EA SilentlyContinue;Set-Location WS: -EA SilentlyContinue};"
  );
}

/**
 * Is this path ready? Checked ONCE and then cached.
 * @returns {{siap: boolean, alasan: string}}
 */
// The CHEAP checks that need to run nothing. Split out so the synchronous and
// asynchronous paths use exactly the same judgement.
function _tersediaMurah() {
  if (process.platform !== "win32")
    return { siap: false, alasan: "Windows only" };
  if (!fs.existsSync(EXE))
    return {
      siap: false,
      alasan:
        // Points at the npm script rather than build.cmd, because that is the
        // one every other path uses: `npm run app`, `npm run dist`, ci.yml and
        // the release workflow all call build:aclaunch. build.cmd still works,
        // but sending someone to the route nothing else takes is how a message
        // ends up describing a build that no longer exists.
        "AcLaunch.exe has not been compiled (" +
        EXE +
        ") — jalankan `npm run build:aclaunch`",
    };
  return null; // perlu uji nyata
}
const _ARGV_UJI = () => [
  CONTAINER,
  process.cwd(),
  PS,
  "-NoProfile",
  "-Command",
  "'ready'",
];
function _nilaiUji(out) {
  if (!String(out).includes("ready"))
    return {
      siap: false,
      alasan:
        "the container answered unexpectedly: " + String(out).slice(0, 80),
    };
  return { siap: true, alasan: "" };
}
function _nilaiGagal(e) {
  return {
    siap: false,
    alasan: String((e.stderr || "") + " " + e.message)
      .replace(/\s+/g, " ")
      .slice(0, 160),
  };
}

function tersedia() {
  if (_G.cache) return _G.cache;
  const murah = _tersediaMurah();
  if (murah) return (_G.cache = murah);
  try {
    // A real test, not an assumption: if the container profile has not been
    // created or its ACLs are not installed, this fails here rather than on the
    // agent's first command.
    // 30000 ms on the window-drawing thread. Named so a freeze here stops
    // being anonymous.
    _G.cache = _nilaiUji(
      ukurBlok("appcontainer:uji-kapabilitas", () =>
        execFileSync(EXE, _ARGV_UJI(), {
          encoding: "utf8",
          timeout: 30000,
          windowsHide: true,
        }),
      ),
    );
  } catch (e) {
    _G.cache = _nilaiGagal(e);
  }
  return _G.cache;
}

/**
 * The ASYNCHRONOUS version of tersedia(), used on the hot path.
 *
 * WHY THERE MUST BE TWO. The WOLFSPACE agent runs INSIDE Electron's main
 * process (electron/main.js requires core.js and calls its handlers directly,
 * with no HTTP). So every SYNCHRONOUS millisecond here is a millisecond the
 * window is frozen — exactly the "not responding" symptom.
 *
 * Measured with a CPU profile plus an event-loop heartbeat monitor: the real
 * test below starts AcLaunch.exe plus PowerShell, and through execFileSync that
 * held the event loop for 2025 ms on the FIRST bash command of every session.
 * Waiting for a child process need freeze nothing — only the shape of the call
 * was wrong.
 *
 * The synchronous version STAYS, deliberately: daftarAkses() and the test files
 * call it from synchronous context, and there the cost is genuinely paid once,
 * off the path the user sees. Both share _G.cache, so whichever runs first pays
 * for both.
 */
function tersediaAsync() {
  if (_G.cache) return Promise.resolve(_G.cache);
  const murah = _tersediaMurah();
  if (murah) return Promise.resolve((_G.cache = murah));
  return new Promise((res) => {
    execFile(
      EXE,
      _ARGV_UJI(),
      { encoding: "utf8", timeout: 30000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          err.stderr = stderr;
          _G.cache = _nilaiGagal(err);
        } else {
          _G.cache = _nilaiUji(stdout);
        }
        res(_G.cache);
      },
    );
  });
}

// The one remaining failure, and it is PERMANENT for this path.
//
// git calls sanitize_stdfds() at startup, which opens /dev/null with O_RDWR
// UNCONDITIONALLY — not only when a standard fd is missing. So inheriting valid
// stdin/stdout/stderr handles does not help it.
//
// Measured inside the container: `cmd /c echo x > NUL` works, `> $null` works,
// but opening '\\.\NUL' is refused. The first form uses the device-name
// shortcut in the Win32 path parser; the second walks the DosDevices object
// directory, which is closed to an AppContainer. .NET and node both normalise
// 'NUL' to '\\.\NUL', and git reaches the same path.
//
// git's own message ("Permission denied") points people at the repo's file
// rights, which is not the cause at all. Hence this explanation.
const _POLA_NUL = /could not open '\/dev\/null'/;
// The second casualty of the closed device namespace, and the most commonly
// hit: `dir`.
//
// cmd.exe reads the volume label and serial number for `dir`'s header, and that
// requires opening the drive root as a device. The container has no rights
// there, so `dir` fails "Access is denied" — even `dir /b`, which prints no
// header at all. Measured: `vol` fails with exactly the same message, while
// `type`, `cd`, `echo >` and Get-ChildItem on the same absolute path all work.
//
// An "Access is denied" on a command as simple as `dir` reads very easily as
// "the containment is broken" or "that folder cannot be read". Both are wrong,
// and both send people to fix something that is not broken.
const _POLA_VOL = /^\s*(?:@?echo\s+off\s*)?(?:dir|vol)\b/im;

// The third casualty, and the easiest to misread: `del`.
//
// Measured, all on a file the container had JUST created itself:
//   del <relative> / del <absolute> / erase  -> Access is denied, file remains
//   rmdir                                    -> works
//   Remove-Item (PowerShell)                 -> works
// So it is not the file's rights, and not deletion in general — only deleting a
// FILE through cmd.exe. The PowerShell equivalent works fully.
const _POLA_HAPUS = /^\s*(?:@?echo\s+off\s*)?(?:del|erase)\b/im;

/**
 * @param {string} teks
 * @param {string} [perintah]
 */
function _jelaskan(teks: any, perintah?: any) {
  if (
    perintah &&
    _POLA_HAPUS.test(perintah) &&
    /Access is denied/i.test(teks)
  ) {
    return (
      teks +
      "\n\n[WOLFSPACE] `del` and `erase` CANNOT delete a file inside " +
      "an AppContainer, not even one it just created itself. This is not " +
      "about file permissions: `rmdir` works, and `Remove-Item` on the same file " +
      "works too.\n" +
      'Pakai: powershell -NoProfile -Command "Remove-Item -LiteralPath ' +
      "'<jalur>' -Force\""
    );
  }
  if (perintah && _POLA_VOL.test(perintah) && /Access is denied/i.test(teks)) {
    return (
      teks +
      "\n\n[WOLFSPACE] `dir` and `vol` CANNOT run inside an AppContainer: " +
      "cmd.exe reads drive volume information for both, and that is a device " +
      "closed to the container. The folder itself reads perfectly well.\n" +
      "Use `Get-ChildItem` (PowerShell) to list a folder — proven to " +
      "work on the very same path."
    );
  }
  if (!_POLA_NUL.test(teks)) return teks;
  return (
    teks +
    "\n\n[WOLFSPACE] This is NOT about repo file permissions, and changing them " +
    "will not help. git always opens /dev/null (read+write) at start-up, " +
    "and the NUL device is not open for reading to an AppContainer -- writing to " +
    "NUL works, reading it does not. So git cannot run inside this confinement " +
    "at all, for any git command.\n" +
    "PAKAI TOOL `git`. Ia menyediakan operasi bernama (status, diff, log, show, " +
    "berkas, cabang, kepala, blame, tambah, commit, pulihkan, cabang_baru, " +
    "pindah) with an argv it builds itself and paths that must lie " +
    "inside the workspace. Repeating this command through bash will never " +
    "succeed, however differently it is spelled."
  );
}

// The most dangerous failure mode on this path, because it is SILENT.
//
// A program whose executable the container can reach but whose DLLs it cannot
// will launch and then die while loading libraries, with exit code 0xC0000142
// (STATUS_DLL_INIT_FAILED) and BOTH stdout and stderr completely empty.
// Measured on `ls`: its exe is found through PATH, its DLLs live in a closed
// Program Files, and the result is a command that "completes" with no output
// and no complaint. Without this explanation the agent reads that emptiness as
// "the directory really is empty" — a wrong conclusion with nothing to
// contradict it.
const KODE_DLL_GAGAL = 0xc0000142;

/** @param {number} kode @returns {string|null} */
function jelaskanKode(kode) {
  if (kode >>> 0 !== KODE_DLL_GAGAL) return null;
  return (
    "The program failed to load inside the AppContainer (0xC0000142, " +
    "STATUS_DLL_INIT_FAILED) and produced no output at all. " +
    "Empty output here does NOT mean the result was empty.\n" +
    "Two causes, and only one of them can be fixed:\n" +
    "  1. The DLL sits in a folder not yet opened to the container — grant read " +
    "access to its runtime folder through scripts/appcontainer/pasang.ps1.\n" +
    "  2. The program uses the MSYS/Cygwin runtime (ls, grep, sed and " +
    "friends from Git for Windows). That runtime needs a kernel object the " +
    "shared component AppContainer closes off, so it fails EVEN when the file is " +
    "fully readable — measured, after read access was granted. No permission " +
    "can fix it.\n" +
    "What works instead: cmd/PowerShell built-ins, node, and binaries " +
    "that are not MSYS (curl from mingw64 is proven to work)."
  );
}

/**
 * Wrap any shell so it runs INSIDE the container, without changing its
 * arguments. Used by the `bash` tool: it still spawns for itself, so the whole
 * AbortController, timeout, streaming and session process-tracking machinery
 * still applies. The branch that called execFileSync itself lost all of that,
 * and blocked the event loop as well.
 *
 * The environment is not passed explicitly: AcLaunch calls CreateProcessW with
 * a NULL lpEnvironment, so the child inherits AcLaunch's environment — which the
 * caller already hardened when spawning AcLaunch.
 * @param {string} cwd
 * @param {string} shBin
 * @param {string[]} shArgs
 * @returns {[string, string[]]}
 */
function bungkus(cwd, shBin, shArgs) {
  return [EXE, [CONTAINER, path.resolve(cwd), _jalurPenuh(shBin), ...shArgs]];
}

/**
 * The container SID. It has no friendly name — icacls accepts only the
 * S-1-15-2-... form, so it is derived through the launcher and cached.
 * @returns {string|null}
 */
function sid() {
  if (_G.sid !== null) return _G.sid || null;
  try {
    _G.sid = String(
      ukurBlok("appcontainer:sid", () =>
        execFileSync(EXE, ["--sid", CONTAINER], {
          encoding: "utf8",
          timeout: 15000,
          windowsHide: true,
        }),
      ),
    ).trim();
  } catch (_) {
    _G.sid = "";
  }
  return _G.sid || null;
}

/** The asynchronous version of sid(). Same reason as tersediaAsync(): through
 *  execFileSync this call held the event loop for 106 ms, and that is paid in
 *  Electron's main process. */
function sidAsync() {
  if (_G.sid !== null) return Promise.resolve(_G.sid || null);
  return new Promise((res) => {
    execFile(
      EXE,
      ["--sid", CONTAINER],
      { encoding: "utf8", timeout: 15000, windowsHide: true },
      (err, stdout) => {
        _G.sid = err ? "" : String(stdout).trim();
        res(_G.sid || null);
      },
    );
  });
}

/**
 * Ensure the container may read and write ONE folder: the workspace in use.
 *
 * WHY ONCE AT INSTALL IS NOT ENOUGH. The container profile is installed with
 * rights on the WOLFSPACE folder, but the agent can be pointed at any workspace
 * — and on another workspace EVERY command fails "Access is denied", including
 * `echo`. The symptom looks like broken containment when it is in fact working:
 * that folder has simply never been opened to the container.
 *
 * The grant is narrow and deliberate: only a folder that is already the agent's
 * workspace, and only that folder. It needs no elevation as long as the user
 * owns the folder, and it widens nothing — the agent is already allowed to read
 * and write there; what changes is only whether the CONTAINER TOKEN may too.
 *
 * ONLY THE ROOT, not its parents. An earlier version also granted traverse
 * upward, and that was wrong twice over: unnecessary (measured — a workspace
 * under AppData\Local works fully with a root grant alone: read, write, create,
 * node, all through absolute paths), and very expensive — READING the ACL of
 * C:\Users\dave\AppData\Local takes 77 ms, CHANGING it more than 120 seconds,
 * because Windows re-propagates inheritance to the hundreds of thousands of
 * cache files beneath it.
 *
 * ONE WORKSPACE AT A TIME. Grants for other workspaces are REVOKED here rather
 * than left to accumulate. Without that the container slowly collects access to
 * every folder the agent has ever used, and "contained to one directory" turns
 * quietly into "contained to the union of every directory ever opened" — a
 * loosening invisible anywhere until someone inspects the ACLs one by one. See
 * cabutSemuaKecuali().
 * @returns {Promise<{siap: boolean, alasan: string}>}
 */
async function siapUntuk(root) {
  const dasar = await tersediaAsync();
  if (!dasar.siap) return dasar;
  const s = await sidAsync();
  if (!s)
    return { siap: false, alasan: "the container SID could not be derived" };
  const r = path.resolve(root || process.cwd());
  const kunci = r.toLowerCase();
  if (_G.diberi.has(kunci)) return { siap: true, alasan: "" };
  try {
    const kini = await _icacls([r]);
    if (!kini.includes(s)) {
      await _icacls([r, "/grant", "*" + s + ":(OI)(CI)(M)"]);
    }
    // The container's private temp folder. It does not create this itself, and
    // without it %TEMP% inside points nowhere — see envTambahan().
    fs.mkdirSync(path.join(_akarAc(r), "Packages", CONTAINER, "AC", "Temp"), {
      recursive: true,
    });
    _catatHibah(r);
    _G.diberi.add(kunci);
    await cabutSemuaKecuali(r);
    return { siap: true, alasan: "" };
  } catch (e) {
    return {
      siap: false,
      alasan:
        "the container could not be granted access to " +
        r +
        ": " +
        String(e.stderr || e.message)
          .replace(/\s+/g, " ")
          .slice(0, 120),
    };
  }
}

/**
 * icacls, ASYNCHRONOUS.
 *
 * The synchronous version blocks the event loop, and the cost is not trivial:
 * measured at 0.24 ms per tree entry, so a grant on a 46-thousand-file workspace
 * holds the whole process for ~11 seconds. In an Electron app that is a frozen
 * UI.
 * @param {string[]} argv
 * @returns {Promise<string>}
 */
function _icacls(argv: any): Promise<string> {
  return new Promise((res, rej) => {
    execFile(
      "icacls",
      argv,
      { encoding: "utf8", timeout: 600000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          err.stderr = stderr;
          return rej(err);
        }
        res(String(stdout));
      },
    );
  });
}

// A record of grants EVER made, kept outside the process.
//
// It is needed because no system index can be asked "which folders are open to
// this SID" — ACLs are stored per object, not per subject. Without this record,
// old grants become invisible and impossible to revoke.
const BERKAS_HIBAH = path.join(
  process.env.USERPROFILE || os.homedir(),
  ".wolfspace",
  "ac-hibah.json",
);

// Folders NEVER revoked automatically: shared runtimes (node, git) and traverse
// grants near the root. All are read+execute only, hold no user data, and
// revoking them would kill every command. Installed once by
// scripts/appcontainer/pasang.ps1.
const TETAP = (process.env.WOLFSPACE_AC_TETAP || "")
  .split(";")
  .map((x) => x.trim())
  .filter(Boolean)
  .concat(["C:\\langs", "C:\\Program Files\\Git", "C:\\", "C:\\Users"])
  .map((x) => x.toLowerCase());

/** @returns {string[]} */
function _bacaHibah() {
  try {
    const j = JSON.parse(fs.readFileSync(BERKAS_HIBAH, "utf8"));
    return Array.isArray(j.kerja) ? j.kerja : [];
  } catch (_) {
    return [];
  }
}

/** @param {string} root */
function _catatHibah(root) {
  const daftar = _bacaHibah();
  if (daftar.some((x) => x.toLowerCase() === root.toLowerCase())) return;
  daftar.push(root);
  try {
    fs.mkdirSync(path.dirname(BERKAS_HIBAH), { recursive: true });
    fs.writeFileSync(
      BERKAS_HIBAH,
      JSON.stringify({ kerja: daftar }, null, 2),
      "utf8",
    );
  } catch (_) {}
}

/**
 * Open ONE folder temporarily for the container, WITHOUT recording it as a
 * working folder.
 *
 * The difference from siapUntuk() is decisive: working folders replace each
 * other — opening a new one revokes the old. A sandbox_run scratch directory is
 * not a workspace; it lives alongside one and dies with its session. If it went
 * through siapUntuk(), every sandbox_run call would REVOKE the workspace's
 * rights, and the next bash command would pay a re-grant of tens of seconds.
 *
 * Its ACE is removed when the folder is deleted, so nothing accumulates.
 * @param {string} dir
 * @returns {Promise<boolean>} whether it succeeded
 */
async function beriSementara(dir) {
  if (!(await tersediaAsync()).siap) return false;
  const s = await sidAsync();
  if (!s) return false;
  const r = path.resolve(dir);
  const k = r.toLowerCase();
  if (_G.sementara.has(k)) return true;
  try {
    await _icacls([r, "/grant", "*" + s + ":(OI)(CI)(M)"]);
    fs.mkdirSync(path.join(_akarAc(r), "Packages", CONTAINER, "AC", "Temp"), {
      recursive: true,
    });
    _G.sementara.add(k);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Revoke the container's rights on ALL working folders except the one in use.
 *
 * This is what keeps "contained to one directory" true over time rather than
 * only true on the first day. Runtime folders in TETAP are not revoked — both
 * are read+execute and hold no user data.
 *
 * A DELIBERATE CONSEQUENCE: two WOLFSPACE instances on different workspaces
 * cannot run at once; the second revokes the first's rights. That is what
 * "only the one currently selected" means, and it is better than quietly
 * leaving both open.
 * @param {string} aktif
 * @returns {Promise<string[]>} the folders revoked
 */
async function cabutSemuaKecuali(aktif) {
  // The cost is real and has to be refusable deliberately. Measured at 0.24 ms
  // per tree entry: revoking and re-granting a 46-thousand-file workspace takes
  // ~20 seconds, and that is paid EVERY time the workspace changes. Turning it
  // off trades the "only one directory" guarantee for "the union of every
  // directory ever opened" — a loosening invisible anywhere, so it has to be
  // chosen rather than inherited.
  if (
    process.env.WOLFSPACE_AC_CABUT === "0" ||
    process.env.WOLFSPACE_AC_CABUT === "false"
  )
    return [];
  const s = await sidAsync();
  if (!s) return [];
  const a = path.resolve(aktif).toLowerCase();
  const daftar = _bacaHibah();
  const sisa: any[] = [];
  const dicabut: any[] = [];
  for (const r of daftar) {
    const k = r.toLowerCase();
    if (k === a || TETAP.includes(k)) {
      sisa.push(r);
      continue;
    }
    if (!fs.existsSync(r)) continue; // gone -> nothing to revoke, nothing to record
    try {
      await _icacls([r, "/remove:g", "*" + s]);
      dicabut.push(r);
      _G.diberi.delete(k);
    } catch (_) {
      sisa.push(r); // revoke failed: STILL recorded, so it is retried later
    }
  }
  if (dicabut.length || sisa.length !== daftar.length) {
    try {
      fs.mkdirSync(path.dirname(BERKAS_HIBAH), { recursive: true });
      fs.writeFileSync(
        BERKAS_HIBAH,
        JSON.stringify({ kerja: sisa }, null, 2),
        "utf8",
      );
    } catch (_) {}
  }
  return dicabut;
}

/**
 * What the container can currently reach. Built so the claim can be CHECKED
 * rather than trusted: ACLs have no per-subject index, so without this list
 * there is no way to see the access surface at once.
 */
function daftarAkses() {
  return {
    sid: sid(),
    kerja: _bacaHibah(),
    tetap: TETAP,
    berkas: BERKAS_HIBAH,
  };
}

/**
 * Variables that must exist when AcLaunch runs, ON TOP OF the environment the
 * caller already hardened.
 *
 * CreateProcessW requires LOCALAPPDATA to create an AppContainer process (it
 * prepares the container profile folder under LOCALAPPDATA\Packages). Without
 * it: code 203, which names no variable at all.
 *
 * Only its PRESENCE is required to create the process: measured working with an
 * empty string and with a folder that does not exist. So its value is POINTED
 * INTO the workspace, like TEMP and USERPROFILE — the real value contains the
 * actual account name, which is precisely what is being hidden.
 *
 * BUT THE VALUE IS NOT FREE ONCE THE PROCESS RUNS. AppContainer REWRITES TEMP
 * and TMP inside its process to <LOCALAPPDATA>\Packages\<container>\AC\Temp. If
 * that folder does not exist, TEMP points nowhere and `echo x > %TEMP%\a.txt`
 * fails with "The system cannot find the path specified" — while writing to an
 * absolute path in the same folder succeeds. A confusing symptom with a trivial
 * cause. The folder is prepared in siapUntuk().
 *
 * @param {string} cwd
 * @returns {Record<string, string>}
 */
function envTambahan(cwd) {
  return { LOCALAPPDATA: _akarAc(cwd), ..._envJob() };
}

/**
 * Resource ceilings for the launched command, handed to AcLaunch.exe.
 *
 * An AppContainer confines what a command can REACH, not how much it can
 * CONSUME — a command could take every byte of RAM and every CPU cycle on the
 * machine while staying perfectly inside its sandbox. The Linux path never had
 * that gap: agent/tools/bash-jail.ts caps processes, virtual memory and CPU
 * through the namespace jail. This closes the same gap on Windows through a Job
 * Object, applied in scripts/appcontainer/AcLaunch.cs.
 *
 * WHY THROUGH THE ENVIRONMENT. Everything after <exe> in AcLaunch's argv is
 * forwarded verbatim to the command, so a new flag there could not be told
 * apart from an argument meant for the command itself.
 *
 * It rides on envTambahan() rather than being wired separately because all
 * three spawn paths already spread that one function — jalankan() here, and the
 * two callers of bungkus() in agent/sandbox.ts and agent/tools/index.ts. Adding
 * it anywhere else would have left one of them silently unbounded.
 *
 * @returns {Record<string, string>}
 */
function _envJob() {
  const A = require("../anggaran.ts");
  return {
    [A.JOB_ENV.mem]: String(A.JOB_MEM_MB),
    [A.JOB_ENV.proses]: String(A.JOB_MAKS_PROSES),
    [A.JOB_ENV.cpu]: String(A.JOB_CPU_DETIK),
  };
}

/**
 * A fake LOCALAPPDATA root for the container: a workspace subfolder rather than
 * the workspace itself. Using the workspace directly makes AppContainer create a
 * folder named "Packages" right in the middle of someone's repo.
 * @param {string} cwd
 */
function _akarAc(cwd) {
  return path.join(path.resolve(cwd || process.cwd()), ".wolfspace-cmd");
}

/**
 * AcLaunch passes the shell as lpApplicationName, which does NOT search PATH. A
 * bare name like "cmd.exe" fails with code 203, and that code mentions no
 * filename — so the trail points everywhere except here. Bare names are resolved
 * first.
 * @param {string} bin
 */
function _jalurPenuh(bin) {
  if (path.isAbsolute(bin)) return bin;
  const sys = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    bin,
  );
  return fs.existsSync(sys) ? sys : bin;
}

/**
 * Run a PowerShell command inside the container.
 *
 * A short path for non-agent callers (tests, diagnostics). The `bash` tool does
 * NOT come through here — it uses bungkus() above.
 * @param {string} perintah
 * @param {{cwd?: string, timeout?: number}} [opts]
 */
async function jalankan(perintah, opts) {
  const o = opts || {};
  const siap = await tersediaAsync();
  if (!siap.siap) {
    return {
      ok: false,
      output: "AppContainer not ready: " + siap.alasan,
      ..._penegakan.label("penasihat", "ac-tak-siap"),
    };
  }
  const cwd = path.resolve(o.cwd || process.cwd());
  try {
    // execFile ASYNCHRONOUS, not execFileSync. The synchronous version blocks the
    // event loop while the command runs; in an Electron app that means the UI
    // freezes every time a command is run.
    const out = await new Promise((res, rej) => {
      execFile(
        EXE,
        [
          CONTAINER,
          cwd,
          PS,
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          _pembukaCwd(cwd) + perintah,
        ],
        {
          encoding: "utf8",
          timeout: o.timeout || 120000,
          windowsHide: true,
          maxBuffer: 8 * 1024 * 1024,
          // This path used to inherit the environment implicitly. It still
          // does — process.env is spread first — with the Job Object ceilings
          // added on top, so a command run through here is bounded exactly like
          // one run through bungkus().
          env: { ...process.env, ...envTambahan(cwd) },
        },
        (err, stdout, stderr) => {
          if (err) {
            err.stdout = stdout;
            err.stderr = stderr;
            return rej(err);
          }
          res(stdout);
        },
      );
    });
    return {
      ok: true,
      output: _jelaskan(String(out).slice(0, 8000)) || "(no output)",
      ..._penegakan.label("kernel", "appcontainer"),
    };
  } catch (e) {
    const teks = _jelaskan(String((e.stdout || "") + (e.stderr || "")).trim());
    return {
      // A non-zero exit code is a legitimate RESULT for many commands
      // (Select-String found nothing, a test failed). The output is still returned.
      ok: false,
      output:
        (teks || String(e.message)).slice(0, 8000) +
        (e.killed ? "\n[stopped: past the time limit]" : ""),
      ..._penegakan.label("kernel", "appcontainer"),
    };
  }
}

module.exports = {
  tersedia,
  tersediaAsync,
  sidAsync,
  siapUntuk,
  beriSementara,
  cabutSemuaKecuali,
  daftarAkses,
  sid,
  jalankan,
  bungkus,
  envTambahan,
  jelaskan: _jelaskan,
  jelaskanKode,
  CONTAINER,
  EXE,
};
