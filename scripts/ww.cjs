#!/usr/bin/env node
/*
 * ww — workspace manager (prototype)
 *
 * Analogi: satu direktori induk (default C:\Users\dave\ww) berisi banyak folder.
 * SETIAP folder = satu repo git INDEPENDEN dengan branch-nya sendiri, terisolasi
 * penuh (masing-masing punya .git sendiri, tidak berbagi riwayat). Begitu sebuah
 * folder dibuat — lewat perintah `create` ATAU dibuat manual di Explorer lalu
 * ditangkap `watch` — folder itu langsung jadi repo + branch sendiri.
 *
 * Perintah:
 *   node scripts/ww.cjs create <nama> [--branch <b>] [--root <dir>]
 *   node scripts/ww.cjs adopt  <nama> [--branch <b>] [--root <dir>]
 *   node scripts/ww.cjs list                          [--root <dir>]
 *   node scripts/ww.cjs watch                         [--root <dir>]
 *
 * Ini prototype standalone: TIDAK menyentuh server/UI WOLFSPACE. Tujuannya
 * membuktikan logika worktree+branch per-folder dulu, baru diintegrasikan.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DEFAULT_ROOT = path.join(
  process.env.USERPROFILE || require("os").homedir(),
  "ww",
);

// ── util ──────────────────────────────────────────────────────────────────────
const log = (...a) => console.log(...a);
const ok = (m) => log("  \x1b[32m✓\x1b[0m " + m);
const info = (m) => log("  \x1b[36m•\x1b[0m " + m);
const warn = (m) => log("  \x1b[33m!\x1b[0m " + m);
const die = (m) => {
  console.error("\x1b[31m✗ " + m + "\x1b[0m");
  process.exit(1);
};

// Jalankan git di dalam cwd. Kembalikan stdout (trim). Lempar bila gagal.
function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
// Versi yang tidak melempar (untuk probing) — kembalikan null bila gagal.
function gitTry(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

// Ubah nama folder jadi nama branch git yang valid.
function toBranch(name) {
  let b = String(name)
    .trim()
    .replace(/[^\w.\-/]+/g, "-") // karakter ilegal → '-'
    .replace(/\.\.+/g, ".") // hindari '..'
    .replace(/^[-/.]+|[-/.]+$/g, "") // buang pemisah di ujung
    .replace(/-{2,}/g, "-");
  return b || "work";
}

// Sebuah folder sudah repo git bila punya subfolder .git.
function isRepo(dir) {
  return fs.existsSync(path.join(dir, ".git"));
}

// Nama folder yang harus diabaikan watcher (sementara/tersembunyi/sistem).
function isIgnorableName(name) {
  return (
    !name ||
    name.startsWith(".") ||
    name.startsWith("_") ||
    name.startsWith("$") ||
    name.startsWith("~") ||
    // Nama default Explorer/Finder SEBELUM di-rename user: jangan buru-buru adopt
    // "New folder" lalu identitasnya terlanjur salah. Tunggu sampai diberi nama asli.
    /^(new folder|untitled folder|new folder \(\d+\))$/i.test(name) ||
    /^(node_modules|System Volume Information|\$RECYCLE\.BIN)$/i.test(name)
  );
}

// Pastikan root tidak berada di dalam repo git lain (agar tiap folder benar-benar
// repo terpisah, bukan subdir dari repo induk yang tak sengaja).
function assertRootNotNested(root) {
  const inside = gitTry(["rev-parse", "--is-inside-work-tree"], root);
  if (inside === "true") {
    // root sendiri boleh saja BUKAN repo; yang bahaya kalau root DI DALAM repo lain.
    if (!isRepo(root)) {
      die(
        `Root '${root}' berada di DALAM repo git lain. Tiap folder harus repo terpisah.\n` +
          `  Pindahkan root ke lokasi yang bukan bagian dari repo mana pun.`,
      );
    }
  }
}

function ensureRoot(root) {
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
    info(`root dibuat: ${root}`);
  }
  const st = fs.statSync(root);
  if (!st.isDirectory()) die(`root bukan direktori: ${root}`);
  assertRootNotNested(root);
}

// ── inti: jadikan sebuah folder repo independen + branch sendiri ───────────────
function initWorkspace(dir, name, branchArg) {
  const branch = toBranch(branchArg || name);

  if (isRepo(dir)) {
    const cur = gitTry(["rev-parse", "--abbrev-ref", "HEAD"], dir) || "?";
    warn(`'${name}' sudah repo (branch: ${cur}) — dilewati.`);
    return { name, dir, branch: cur, skipped: true };
  }

  fs.mkdirSync(dir, { recursive: true });

  // git init dengan branch bernama sesuai folder (git ≥ 2.28).
  git(["init", "-b", branch], dir);
  // Identitas lokal supaya commit awal tidak gagal di mesin tanpa user.name global.
  git(["config", "user.name", "ww"], dir);
  git(["config", "user.email", "ww@local"], dir);

  // Marker ww (selalu ditulis — ini milik kita; menjamin ada ≥1 file untuk commit
  // pertama supaya branch termaterialisasi).
  const meta = {
    name,
    branch,
    createdAt: new Date().toISOString(),
    manager: "ww",
  };
  fs.writeFileSync(
    path.join(dir, ".ww.json"),
    JSON.stringify(meta, null, 2) + "\n",
  );
  // Seed HANYA jika belum ada — JANGAN menimpa file milik user saat attach folder
  // yang sudah berisi proyek nyata.
  const giPath = path.join(dir, ".gitignore");
  if (!fs.existsSync(giPath)) {
    fs.writeFileSync(
      giPath,
      ["node_modules/", "dist/", "build/", ".env", "*.log", ".DS_Store"].join(
        "\n",
      ) + "\n",
    );
  }
  const rmPath = path.join(dir, "README.md");
  if (!fs.existsSync(rmPath)) {
    fs.writeFileSync(
      rmPath,
      `# ${name}\n\nWorkspace terisolasi (branch \`${branch}\`).\n`,
    );
  }

  git(["add", "-A"], dir);
  git(["commit", "-m", `chore: initialize workspace ${name}`], dir);

  const head = gitTry(["rev-parse", "--short", "HEAD"], dir) || "?";
  ok(`'${name}' → repo baru, branch '${branch}', commit awal ${head}`);
  return { name, dir, branch, head, skipped: false };
}

// ── perintah ──────────────────────────────────────────────────────────────────
function cmdCreate(name, opts) {
  if (!name) die("pemakaian: ww create <nama> [--branch <b>] [--root <dir>]");
  ensureRoot(opts.root);
  const dir = path.join(opts.root, name);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length && !isRepo(dir)) {
    die(
      `folder '${name}' sudah ada dan tidak kosong (bukan repo). Pakai 'adopt' bila memang mau dikonversi.`,
    );
  }
  initWorkspace(dir, name, opts.branch);
}

function cmdAdopt(name, opts) {
  if (!name) die("pemakaian: ww adopt <nama> [--branch <b>] [--root <dir>]");
  ensureRoot(opts.root);
  const dir = path.join(opts.root, name);
  if (!fs.existsSync(dir)) die(`folder '${name}' tidak ada di ${opts.root}`);
  initWorkspace(dir, name, opts.branch);
}

// Kembalikan daftar workspace di root sebagai DATA (untuk server/UI). Kebenaran disk.
function listWorkspaces(root) {
  const r = path.resolve(root || DEFAULT_ROOT);
  if (!fs.existsSync(r)) return [];
  return fs
    .readdirSync(r, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !isIgnorableName(d.name))
    .map((d) => {
      const dir = path.join(r, d.name);
      const repo = isRepo(dir);
      const branch = repo
        ? gitTry(["rev-parse", "--abbrev-ref", "HEAD"], dir) || "?"
        : null;
      const dirty = repo ? !!gitTry(["status", "--porcelain"], dir) : false;
      return { name: d.name, path: dir, isRepo: repo, branch, dirty };
    });
}

function cmdList(opts) {
  ensureRoot(opts.root);
  const entries = fs
    .readdirSync(opts.root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !isIgnorableName(d.name));
  if (!entries.length) {
    info(`(kosong) ${opts.root}`);
    return;
  }
  log(`Workspaces di ${opts.root}:\n`);
  for (const d of entries) {
    const dir = path.join(opts.root, d.name);
    if (!isRepo(dir)) {
      log(
        `  \x1b[90m○\x1b[0m ${d.name.padEnd(24)} \x1b[90m(bukan repo)\x1b[0m`,
      );
      continue;
    }
    const branch = gitTry(["rev-parse", "--abbrev-ref", "HEAD"], dir) || "?";
    const dirty = gitTry(["status", "--porcelain"], dir);
    const state = dirty ? "\x1b[33m● dirty\x1b[0m" : "\x1b[32m● clean\x1b[0m";
    log(
      `  \x1b[36m◆\x1b[0m ${d.name.padEnd(24)} branch \x1b[1m${branch}\x1b[0m  ${state}`,
    );
  }
}

// Core watcher — dipakai CLI `watch` DAN server WOLFSPACE (auto-start). Mengembalikan
// handle chokidar (pemanggil yang menutup lewat .close()). `throw` (bukan die) supaya
// aman dipanggil di dalam proses server. opts.log(msg) opsional untuk laporan event.
function startWatcher(root, opts = {}) {
  const rootResolved = path.resolve(root || DEFAULT_ROOT);
  // Validasi root tanpa mematikan proses (throw, bukan die).
  if (!fs.existsSync(rootResolved))
    fs.mkdirSync(rootResolved, { recursive: true });
  if (!fs.statSync(rootResolved).isDirectory())
    throw new Error("root bukan direktori: " + rootResolved);
  if (
    gitTry(["rev-parse", "--is-inside-work-tree"], rootResolved) === "true" &&
    !isRepo(rootResolved)
  )
    throw new Error("root berada di dalam repo git lain: " + rootResolved);

  const chokidar = require("chokidar"); // throw bila tak terpasang → ditangani pemanggil
  const onLog = typeof opts.log === "function" ? opts.log : () => {};
  const pending = new Map(); // dir → timer (debounce)
  const inFlight = new Set();

  const watcher = chokidar.watch(rootResolved, {
    depth: 0, // hanya level teratas
    ignoreInitial: true, // jangan proses folder yang sudah ada saat start
    persistent: true,
    awaitWriteFinish: false,
  });

  watcher.on("addDir", (dir) => {
    if (path.resolve(dir) === rootResolved) return; // root sendiri
    const name = path.basename(dir);
    if (isIgnorableName(name)) return;
    if (inFlight.has(dir)) return;
    // Debounce: tunggu folder selesai dibuat sebelum menyentuhnya.
    clearTimeout(pending.get(dir));
    pending.set(
      dir,
      setTimeout(() => {
        pending.delete(dir);
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
        if (isRepo(dir)) return; // sudah repo (mis. dibuat via `create`) — abaikan
        inFlight.add(dir);
        try {
          onLog(`folder baru terdeteksi: ${name}`);
          const res = initWorkspace(dir, name);
          if (res && res.branch)
            onLog(`'${name}' → repo+branch '${res.branch}' tertanam`);
        } catch (e) {
          onLog(`gagal adopt '${name}': ${e.message.split("\n")[0]}`);
        } finally {
          inFlight.delete(dir);
        }
      }, 900),
    );
  });
  watcher.on("error", (e) => onLog("watcher error: " + e.message));
  return watcher;
}

function cmdWatch(opts) {
  let watcher;
  try {
    watcher = startWatcher(opts.root, {
      log: (m) => log(`  \x1b[35m↳\x1b[0m ${m}`),
    });
  } catch (e) {
    die(e.message);
  }
  log(
    `\x1b[36m▶ ww watch\x1b[0m — memantau folder baru di ${path.resolve(opts.root)}`,
  );
  log(
    `  Buat folder di sana (Explorer/mkdir) → otomatis jadi repo + branch. Ctrl+C untuk berhenti.\n`,
  );
  process.on("SIGINT", () => {
    log("\n\x1b[36m■ watcher dihentikan.\x1b[0m");
    watcher.close().then(() => process.exit(0));
  });
}

// ── argumen ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const positional = [];
  const opts = { root: DEFAULT_ROOT, branch: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") opts.root = path.resolve(argv[++i] || DEFAULT_ROOT);
    else if (a === "--branch") opts.branch = argv[++i];
    else positional.push(a);
  }
  return { positional, opts };
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { positional, opts } = parseArgs(rest);
  switch (cmd) {
    case "create":
      return cmdCreate(positional[0], opts);
    case "adopt":
      return cmdAdopt(positional[0], opts);
    case "list":
      return cmdList(opts);
    case "watch":
      return cmdWatch(opts);
    default:
      log("ww — workspace manager (repo+branch per folder)\n");
      log(
        "  ww create <nama> [--branch <b>] [--root <dir>]   buat folder → repo+branch baru",
      );
      log(
        "  ww adopt  <nama> [--branch <b>] [--root <dir>]   konversi folder yang sudah ada",
      );
      log(
        "  ww list                          [--root <dir>]   daftar workspace + branch + status",
      );
      log(
        "  ww watch                         [--root <dir>]   auto-adopt folder baru (chokidar)",
      );
      log(`\n  root default: ${DEFAULT_ROOT}`);
      if (cmd && cmd !== "help") process.exitCode = 1;
  }
}

// Dipakai sebagai modul oleh server (auto-start watcher) ATAU sebagai CLI.
// Ringkasan git read-only untuk SATU folder workspace (dipakai UI untuk
// menampilkan branch + status kotor/bersih di sidebar). Tak pernah melempar —
// folder yang belum jadi repo mengembalikan { repo:false }.
function gitInfo(dir) {
  if (!dir || !fs.existsSync(dir)) return { repo: false, error: "not-found" };
  if (!isRepo(dir)) return { repo: false };
  const branch = gitTry(["rev-parse", "--abbrev-ref", "HEAD"], dir) || "?";
  // --porcelain: satu baris per perubahan (staged/unstaged/untracked). Jumlah
  // baris tak kosong = jumlah perubahan yang belum tercermin di commit.
  const porcelain = gitTry(["status", "--porcelain"], dir);
  const dirtyCount =
    porcelain == null ? 0 : porcelain.split("\n").filter((l) => l.trim()).length;
  // Commit terakhir: hash pendek + subject + waktu relatif. null bila belum ada commit.
  const last = gitTry(["log", "-1", "--format=%h%s%cr"], dir);
  let lastCommit = null;
  if (last) {
    const [hash, subject, when] = last.split("");
    lastCommit = { hash, subject, when };
  }
  return { repo: true, branch, dirtyCount, dirty: dirtyCount > 0, lastCommit };
}

module.exports = {
  initWorkspace,
  startWatcher,
  listWorkspaces,
  toBranch,
  isRepo,
  gitInfo,
  DEFAULT_ROOT,
};
if (require.main === module) main();
