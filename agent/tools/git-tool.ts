// ── git as a NAMED CAPABILITY, not as a shell command ──
//
// WHY THIS EXISTS. git CANNOT run inside an AppContainer, and that is not
// something that can be patched around. git calls sanitize_stdfds() at startup,
// which opens /dev/null with O_RDWR UNCONDITIONALLY — not only when a standard
// fd is missing. Inside a container the NUL device can be WRITTEN but not READ
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
const _penegakan = require("../penegakan.cjs");

const BATAS_MS = 60000;
const MAKS_KELUARAN = 12000;

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
    jelas: "perubahan; pakai bertahap:true untuk yang sudah di-stage",
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
      String(Math.min(Math.max(Number(a.jumlah) || 20, 1), 200)),
      ...(a.berkas && a.berkas.length ? ["--", ...a.berkas] : []),
    ],
  },
  show: {
    jelas: "isi satu commit (ringkasan perubahan)",
    argv: (a) => ["show", "--stat", "--no-color", a.ref || "HEAD"],
  },
  berkas: { jelas: "berkas yang dilacak git", argv: () => ["ls-files"] },
  cabang: {
    jelas: "daftar cabang lokal",
    argv: () => ["branch", "--list", "--no-color"],
  },
  kepala: { jelas: "commit HEAD saat ini", argv: () => ["rev-parse", "HEAD"] },
  blame: {
    jelas: "siapa mengubah tiap baris satu berkas",
    argv: (a) => ["blame", "--no-color", "--", a.berkas[0]],
  },

  tambah: {
    tulis: true,
    jelas: "stage berkas (setara git add)",
    argv: (a) => ["add", "--", ...a.berkas],
  },
  commit: {
    tulis: true,
    jelas: "commit yang sudah di-stage; hook repo IKUT JALAN",
    argv: (a) => ["commit", "-m", String(a.pesan)],
  },
  pulihkan: {
    tulis: true,
    jelas: "buang perubahan pada berkas (setara git restore)",
    argv: (a) => ["restore", "--", ...a.berkas],
  },
  cabang_baru: {
    tulis: true,
    jelas: "buat cabang baru lalu pindah ke sana",
    argv: (a) => ["checkout", "-b", String(a.ref)],
  },
  pindah: {
    tulis: true,
    jelas: "pindah ke cabang yang sudah ada; hook checkout IKUT JALAN",
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
      return { ok: false, alasan: "path kosong" };
    if (p.startsWith("-"))
      return { ok: false, alasan: "path tak boleh diawali '-': " + p };
    const abs = path.resolve(ws, p);
    const rel = path.relative(ws, abs);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel))
      return { ok: false, alasan: "path di luar workspace: " + p };
    keluar.push(rel.split(path.sep).join("/"));
  }
  return { ok: true, berkas: keluar };
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
        "' tak dikenal. Yang ada:\n" +
        Object.entries(OPERASI)
          .map(([k, v]) => "  " + k.padEnd(13) + v.jelas)
          .join("\n") +
        "\nTIDAK ADA operasi jaringan (push/pull/fetch/clone) di tool ini.",
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
        output: "DITOLAK: " + v.alasan,
      };
    b.berkas = v.berkas;
  }
  if (nama === "blame" && (!b.berkas || !b.berkas.length))
    return {
      ok: false,
      ..._penegakan.label("penasihat", "kapabilitas-git"),
      output: "blame butuh tepat satu berkas",
    };
  if (a.ref !== undefined && !REF_SAH.test(String(a.ref)))
    return {
      ok: false,
      ..._penegakan.label("penasihat", "kapabilitas-git"),
      output: "ref '" + a.ref + "' tak sah (tanpa spasi, tak diawali '-')",
    };
  if (nama === "commit" && !String(a.pesan || "").trim())
    return {
      ok: false,
      ..._penegakan.label("penasihat", "kapabilitas-git"),
      output: "commit butuh 'pesan'",
    };
  if (!fs.existsSync(path.join(ws, ".git")))
    return {
      ok: false,
      ..._penegakan.label("penasihat", "kapabilitas-git"),
      output: ws + " bukan repo git (tak ada .git)",
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
              "git gagal: " +
              String(err.message).slice(0, 300) +
              (err.killed ? "\n[dihentikan: lewat batas waktu]" : ""),
          });
        }
        res({
          // A non-zero exit code is a legitimate RESULT for some operations
          // (diff found differences, commit with nothing to commit). The output
          // is still returned as is.
          ok: !err,
          ...label,
          output: teks.trim().slice(0, MAKS_KELUARAN) || "(tak ada keluaran)",
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
          "Sesi ini dikunci tanpa eksekusi proses mentah, dan operasi git '" +
          nama +
          "' bisa menjalankan hook repo di luar kurungan.\nAlasan teknis: " +
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
        "' ditolak: CommandChain tak tersedia untuk memeriksa admission, dan " +
        "operasi ini bisa menjalankan hook repo di luar kurungan.",
    };
  }
}

module.exports = { jalankan, OPERASI };
