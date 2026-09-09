// git-tool.ts — git as a NAMED CAPABILITY with a fixed vocabulary, never as a
// shell command.
//
// ROLE IN THE SYSTEM. git CANNOT run inside an AppContainer, and that cannot be
// patched around: git calls sanitize_stdfds() at startup, which opens /dev/null
// with O_RDWR UNCONDITIONALLY, not only when a standard fd is missing. Inside a container the NUL device can be WRITTEN but not READ
// (measured: `cmd /c echo x > NUL` succeeds, `[IO.File]::OpenRead('NUL')` is
// refused). So any git command at all dies before running anything.
//
// Once bash became kernel-contained, that meant the coding agent lost git
// entirely. Punching a hole in the containment for git would defeat its whole
// purpose: a command allowed out is a command usable to get out.
//
// ITS SHAPE FOLLOWS net-diag.ts: this tool accepts no command. It accepts an
// OPERATION from a fixed list and BUILDS its own argv. There is no command text
// to scan, so there is nothing to assemble that could slip past — the boundary
// is a property of the data's shape, not a guess about a string.
//
// CONNECTS TO
//   imports  ../broker/commandchain (the admission decision)
//   used by  agent/tools/index.ts, agent/penjaga-agent.ts
//
// HONEST ABOUT ITS LIMITS. The git process runs OUTSIDE the AppContainer, so
// this path is NOT kernel containment and is not labelled as such. What limits
// it is the shape of its API:
//   - operations from a fixed list; no `-c`, `--exec-path`, `--upload-pack`
//   - every path is validated to be INSIDE the workspace
//   - `-C <workspace>` is forced, so another repo cannot be targeted
//   - no network at all: push/pull/fetch/clone/remote-set DO NOT EXIST
//   - the pager, editor and credential prompt are disabled so it never hangs
//     waiting for a human who is not there
//
// HOOKS ARE THE HOLE, and that is said plainly. `commit` and `checkout` run the
// repo's hooks, and a hook is a file inside the workspace that the agent can
// write. So a WRITE operation genuinely can execute code outside the
// containment. Hooks are NOT disabled — disabling them would make commits skip
// quality gates people installed deliberately. Instead, write operations pass
// through CommandChain admission (the `proc.raw` capability), so they can be
// revoked per session and are recorded in the ledger. READ operations run no
// hooks at all, so they are not gated.
"use strict";

import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
const _penegakan = require("../penegakan.ts");

const BATAS_MS = 60000;
const MAKS_KELUARAN = 12000;

/** How many commits `log` returns: 1..200, defaulting only when none was given. */
function _batasJumlah(n) {
  // ABSENT is not the same as ZERO, and Number() blurs the two: Number(null),
  // Number("") and Number([]) are all 0, which would clamp to 1 and return a
  // single commit to a caller who simply did not pass the field. Only a real
  // number or a string that parses as one counts as a value given.
  if (typeof n !== "number" && typeof n !== "string") return 20;
  if (typeof n === "string" && !n.trim()) return 20;
  const v = Number(n);
  if (!Number.isFinite(v)) return 20;
  // A caller who genuinely asks for 0 or a negative gets the smallest legal
  // request rather than the default — that is a value, not an omission.
  return Math.min(Math.max(Math.trunc(v), 1), 200);
}

/** A ref/branch name: no whitespace, no leading `-` (so it cannot become an option). */
const REF_SAH = /^[A-Za-z0-9._\/][A-Za-z0-9._\/-]{0,200}$/;

/**
 * Operations. `tulis: true` means it can change the repo AND can run hooks, so
 * it is admission-gated.
 * @type {Record<string, {tulis?: boolean, argv: (a: any, ws: string) => string[], jelas: string}>}
 */
const OPERASI = {
  status: {
    jelas: "keadaan pohon kerja, ringkas",
    argv: () => ["status", "--porcelain=v1", "--branch"],
  },
  diff: {
    jelas: "changes; pass bertahap:true for what is already staged",
    argv: (a) => [
      "diff",
      ...(a.bertahap ? ["--staged"] : []),
      "--no-color",
      ...(a.berkas && a.berkas.length ? ["--", ...a.berkas] : []),
    ],
  },
  log: {
    jelas: "riwayat commit, satu baris per commit",
    argv: (a) => [
      "log",
      "--oneline",
      "--no-color",
      "-n",
      // `Number(a.jumlah) || 20` turned 0 into 20, because 0 is falsy — a
      // caller asking for none silently got the default. Only an absent or
      // unreadable value takes the default now; a number given is clamped.
      String(_batasJumlah(a.jumlah)),
      ...(a.berkas && a.berkas.length ? ["--", ...a.berkas] : []),
    ],
  },
  show: {
    jelas: "isi satu commit (ringkasan perubahan)",
    argv: (a) => ["show", "--stat", "--no-color", a.ref || "HEAD"],
  },
  berkas: { jelas: "files tracked by git", argv: () => ["ls-files"] },
  cabang: {
    jelas: "daftar cabang lokal",
    argv: () => ["branch", "--list", "--no-color"],
  },
  kepala: {
    jelas: "the current HEAD commit",
    argv: () => ["rev-parse", "HEAD"],
  },
  blame: {
    jelas: "who changed each line of one file",
    // NO --no-color HERE, and that is the whole fix: this operation had never
    // worked once. git blame has no --no-color, only --color-lines and
    // --color-by-age, so git answered
    //
    //   error: ambiguous option: no-color (could be --no-color-lines or
    //          --no-color-by-age)
    //
    // and printed its usage. Every other operation takes --no-color happily,
    // which is exactly why it was copied here without being tried.
    //
    // Nothing replaces it: git only colours when stdout is a terminal, and
    // here it is a pipe.
    argv: (a) => ["blame", "--", a.berkas[0]],
  },

  tambah: {
    tulis: true,
    jelas: "stage files (equivalent to git add)",
    argv: (a) => ["add", "--", ...a.berkas],
  },
  commit: {
    tulis: true,
    jelas: "commit what is staged; the repo hooks DO RUN",
    argv: (a) => ["commit", "-m", String(a.pesan)],
  },
  pulihkan: {
    tulis: true,
    jelas: "discard changes to files (equivalent to git restore)",
    argv: (a) => ["restore", "--", ...a.berkas],
  },
  cabang_baru: {
    tulis: true,
    jelas: "buat cabang baru lalu pindah ke sana",
    argv: (a) => ["checkout", "-b", String(a.ref)],
  },
  pindah: {
    tulis: true,
    jelas: "switch to an existing branch; the checkout hooks DO RUN",
    argv: (a) => ["checkout", String(a.ref)],
  },
};

/**
 * git's environment. All three stop git from HANGING while waiting for a human
 * who is not there — a failure that from outside looks exactly like an
 * unexplained hang.
 * @param {string} ws
 */
function _env(ws) {
  return {
    ...process.env,
    GIT_PAGER: "cat",
    PAGER: "cat",
    GIT_EDITOR: "true",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "",
    GIT_DIR: undefined,
    GIT_WORK_TREE: undefined,
    GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
    HOME: process.env.HOME || process.env.USERPROFILE,
    LC_ALL: "C",
  };
}

/**
 * A path must be INSIDE the workspace. This is the check a text scanner cannot
 * make: here the path is already a value, not a fragment of a string that might
 * be assembled later.
 * @param {string[]} daftar
 * @param {string} ws
 * @returns {{ok: true, berkas: string[]} | {ok: false, alasan: string}}
 */
function _validasiBerkas(daftar, ws) {
  const keluar: string[] = [];
  for (const p of daftar) {
    if (typeof p !== "string" || !p.trim())
      return { ok: false, alasan: "empty path" };
    if (p.startsWith("-"))
      return { ok: false, alasan: "a path must not start with '-': " + p };
    const abs = path.resolve(ws, p);
    const rel = path.relative(ws, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel))
      return { ok: false, alasan: "path di luar workspace: " + p };
    // THE WORKSPACE ITSELF IS INSIDE THE WORKSPACE.
    //
    // rel === "" means the path resolved to the workspace root — which is what
    // "." is, and "." is how anyone stages everything. It used to be refused
    // with "path di luar workspace: .", which is not merely unhelpful but
    // untrue, and it left no way to `git add .` at all: the agent had to
    // enumerate every changed file, and could not stage a DELETION that way.
    keluar.push(rel === "" ? "." : rel.split(path.sep).join("/"));
  }
  return { ok: true, berkas: keluar };
}

/**
 * The repository this folder belongs to, or null.
 *
 * ── WHY IT WALKS UP ──────────────────────────────────────────────────────────
 *
 * The check used to be `fs.existsSync(ws + "/.git")`, which is only true at the
 * TOP of a repository. Open a package inside a monorepo — or any subfolder at
 * all — and every git operation was refused with "is not a git repo", while
 * git itself worked there perfectly. MEASURED on a real repo:
 *
 *     git -C <repo>/sub status --porcelain=v1 --branch   ->   ## master
 *     the tool                                           ->   "not a git repo"
 *
 * git searches upward for .git and so does this. A repository is not defined by
 * where you happen to be standing in it.
 *
 * ── WHAT THAT MEANS, SAID PLAINLY ────────────────────────────────────────────
 *
 * The repository may be rooted ABOVE the workspace, and then status, log and
 * commit concern that repository — which is what git does everywhere else and
 * what someone opening a subfolder expects. The confinement that matters is
 * unchanged: every path argument is still validated to be inside the workspace,
 * so no file outside it can be staged, restored or blamed.
 *
 * `.git` may be a FILE rather than a directory (worktrees, submodules), so the
 * existence check must not require a directory.
 *
 * @param {string} ws
 * @returns {string|null}
 */
function _akarRepo(ws) {
  let d = path.resolve(ws);
  // Bounded by the filesystem root: path.dirname("C:\\") === "C:\\", so the
  // loop ends when it stops moving.
  for (;;) {
    if (fs.existsSync(path.join(d, ".git"))) return d;
    const naik = path.dirname(d);
    if (naik === d) return null;
    d = naik;
  }
}

/**
 * @param {{operasi?: string, berkas?: string[], ref?: string, pesan?: string, bertahap?: boolean, jumlah?: number}} args
 * @param {string} workspace
 */
async function jalankan(args, workspace) {
  const a = args || {};
  const ws = path.resolve(workspace || process.cwd());
  const nama = String(a.operasi || "");
  const op = OPERASI[nama];
  if (!op) {
    return {
      ok: false,
      ..._penegakan.label("penasihat", "kapabilitas-git"),
      output:
        "operasi '" +
        nama +
        "' is not recognised. Available:\n" +
        Object.entries(OPERASI)
          .map(([k, v]) => "  " + k.padEnd(13) + v.jelas)
          .join("\n") +
        "\nNO network operations (push/pull/fetch/clone) in this tool.",
    };
  }

  // Validate BEFORE anything runs.
  const b = { ...a };
  if (a.berkas && a.berkas.length) {
    const v = _validasiBerkas(a.berkas, ws);
    if (!v.ok)
      return {
        ok: false,
        ..._penegakan.label("penasihat", "kapabilitas-git"),
        output: "REFUSED: " + v.alasan,
      };
    b.berkas = v.berkas;
  }
  if (nama === "blame" && (!b.berkas || !b.berkas.length))
    return {
      ok: false,
      ..._penegakan.label("penasihat", "kapabilitas-git"),
      output: "blame needs exactly one file",
    };
  if (a.ref !== undefined && !REF_SAH.test(String(a.ref)))
    return {
      ok: false,
      ..._penegakan.label("penasihat", "kapabilitas-git"),
      output:
        "ref '" + a.ref + "' is invalid (no spaces, must not start with '-')",
    };
  if (nama === "commit" && !String(a.pesan || "").trim())
    return {
      ok: false,
      ..._penegakan.label("penasihat", "kapabilitas-git"),
      output: "commit butuh 'pesan'",
    };
  if (!_akarRepo(ws))
    return {
      ok: false,
      ..._penegakan.label("penasihat", "kapabilitas-git"),
      output:
        ws +
        " is not inside a git repo (no .git here or in any folder above it)",
    };

  // WRITE operations can run the repo's hooks, and a hook is a file the agent
  // can write. So it goes through the same door as raw process execution:
  // revocable per session, and recorded.
  if (op.tulis) {
    const gerbang = _admission(nama);
    if (gerbang) return gerbang;
  }

  const argv = ["-C", ws, "--no-pager", ...op.argv(b, ws)];
  return new Promise((res) => {
    execFile(
      "git",
      argv,
      {
        cwd: ws,
        encoding: "utf8",
        timeout: BATAS_MS,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
        env: _env(ws),
      },
      (err, stdout, stderr) => {
        const teks = String(stdout || "") + String(stderr || "");
        const label = _penegakan.label("penasihat", "kapabilitas-git");
        if (err && !stdout && !stderr) {
          return res({
            ok: false,
            ...label,
            output:
              "git failed: " +
              String(err.message).slice(0, 300) +
              (err.killed ? "\n[stopped: past the time limit]" : ""),
          });
        }
        res({
          // A non-zero exit code is a legitimate RESULT for some operations
          // (diff found differences, commit with nothing to commit). The output
          // is still returned as is.
          ok: !err,
          ...label,
          output: teks.trim().slice(0, MAKS_KELUARAN) || "(no output)",
        });
      },
    );
  });
}

/**
 * CommandChain admission for write operations. A missing checker CLOSES rather
 * than opens — the same principle as sandbox_run.
 * @param {string} nama
 */
function _admission(nama) {
  try {
    const cc = require("../broker/commandchain.ts");
    const rs = cc.sesiRuleset();
    const adm = cc.periksa(rs, "proc.raw");
    if (!adm.allow) {
      cc.catat({
        capability: "proc.raw",
        decision: "DENY",
        reason: adm.alasan,
        params: { git: nama },
      });
      return {
        ok: false,
        ..._penegakan.label("penasihat", "admission"),
        output:
          "This session is locked without raw process execution, and the git operation '" +
          nama +
          "' can run repo hooks outside the confinement.\nTechnical reason: " +
          adm.alasan,
      };
    }
    return null;
  } catch (_) {
    return {
      ok: false,
      ..._penegakan.label("penasihat", "admission"),
      output:
        "git '" +
        nama +
        "' refused: CommandChain is unavailable to check admission, and " +
        "this operation can run repo hooks outside the confinement.",
    };
  }
}

module.exports = {
  jalankan,
  OPERASI,
  _akarRepo,
  _batasJumlah,
  _validasiBerkas,
};
