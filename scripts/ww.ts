#!/usr/bin/env node
/*
 * ww — workspace manager (prototype)
 *
 * The idea: one parent directory (C:\Users\dave\ww by default) holding many
 * folders. EACH folder is an INDEPENDENT git repo with its own branch, fully
 * isolated (each has its own .git and shares no history). As soon as a folder
 * appears — through the `create` command, OR created by hand in Explorer and
 * caught by `watch` — it immediately becomes its own repo plus branch.
 *
 * Commands:
 *   npm run ww -- create <name> [--branch <b>] [--root <dir>]
 *   npm run ww -- adopt  <name> [--branch <b>] [--root <dir>]
 *   npm run ww -- list                         [--root <dir>]
 *   npm run ww -- watch                        [--root <dir>]
 *
 * This began as a standalone prototype that did NOT touch the WOLFSPACE
 * server/UI, to prove the per-folder worktree+branch logic before integrating.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync, execFile } = require("child_process");

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

// Run git inside cwd. Return stdout (trimmed). Throws on failure.
function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
// The non-throwing version (for probing) — returns null on failure.
function gitTry(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

// Turn a folder name into a valid git branch name.
function toBranch(name) {
  let b = String(name)
    .trim()
    .replace(/[^\w.\-/]+/g, "-") // karakter ilegal → '-'
    .replace(/\.\.+/g, ".") // hindari '..'
    .replace(/^[-/.]+|[-/.]+$/g, "") // buang pemisah di ujung
    .replace(/-{2,}/g, "-");
  return b || "work";
}

// A folder is already a git repo when it has a .git subfolder.
function isRepo(dir) {
  return fs.existsSync(path.join(dir, ".git"));
}

// Folder names the watcher must ignore (temporary/hidden/system).
function isIgnorableName(name) {
  return (
    !name ||
    name.startsWith(".") ||
    name.startsWith("_") ||
    name.startsWith("$") ||
    name.startsWith("~") ||
    // The default Explorer/Finder name BEFORE the user renames it: do not rush to
    // adopt "New folder" and lock in the wrong identity. Wait for a real name.
    /^(new folder|untitled folder|new folder \(\d+\))$/i.test(name) ||
    /^(node_modules|System Volume Information|\$RECYCLE\.BIN)$/i.test(name)
  );
}

// Make sure the root is not inside another git repo (so each folder really is a
// separate repo rather than an accidental subdirectory of a parent one).
function assertRootNotNested(root) {
  const inside = gitTry(["rev-parse", "--is-inside-work-tree"], root);
  if (inside === "true") {
    // The root itself may well NOT be a repo; the danger is the root being INSIDE
    // another one.
    if (!isRepo(root)) {
      die(
        `Root '${root}' is INSIDE another git repo. Every folder must be its own repo.\n` +
          `  Move the root somewhere that is not part of any repo.`,
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
  if (!st.isDirectory()) die(`root is not a directory: ${root}`);
  assertRootNotNested(root);
}

// ── inti: jadikan sebuah folder repo independen + branch sendiri ───────────────
function initWorkspace(dir, name, branchArg?) {
  const branch = toBranch(branchArg || name);

  if (isRepo(dir)) {
    const cur = gitTry(["rev-parse", "--abbrev-ref", "HEAD"], dir) || "?";
    warn(`'${name}' already a repo (branch: ${cur}) — skipped.`);
    return { name, dir, branch: cur, skipped: true };
  }

  fs.mkdirSync(dir, { recursive: true });

  // git init with the branch named after the folder (git >= 2.28).
  git(["init", "-b", branch], dir);
  // A local identity so the first commit does not fail on a machine with no global
  // user.name.
  git(["config", "user.name", "ww"], dir);
  git(["config", "user.email", "ww@local"], dir);

  // The ww marker (always written — it is ours, and it guarantees at least one
  // file for the first commit so the branch materialises).
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
  // Seed ONLY when absent — do NOT overwrite the user's files when attaching a
  // folder that already holds a real project.
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
  if (!name) die("usage: ww create <name> [--branch <b>] [--root <dir>]");
  ensureRoot(opts.root);
  const dir = path.join(opts.root, name);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length && !isRepo(dir)) {
    die(
      `folder '${name}' already exists and is not empty (not a repo). Use 'adopt' if you really want to conversi.`,
    );
  }
  initWorkspace(dir, name, opts.branch);
}

function cmdAdopt(name, opts) {
  if (!name) die("usage: ww adopt <name> [--branch <b>] [--root <dir>]");
  ensureRoot(opts.root);
  const dir = path.join(opts.root, name);
  if (!fs.existsSync(dir))
    die(`folder '${name}' does not exist at ${opts.root}`);
  initWorkspace(dir, name, opts.branch);
}

// Return the workspaces under the root as DATA (for the server/UI). The disk is
// the truth.
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
    info(`(empty) ${opts.root}`);
    return;
  }
  log(`Workspaces di ${opts.root}:\n`);
  for (const d of entries) {
    const dir = path.join(opts.root, d.name);
    if (!isRepo(dir)) {
      log(
        `  \x1b[90m○\x1b[0m ${d.name.padEnd(24)} \x1b[90m(not a repo)\x1b[0m`,
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

// The core watcher — used by the `watch` CLI AND by the WOLFSPACE server
// (auto-start). Returns the chokidar handle (the caller closes it with .close()).
// It THROWS rather than dying, so it is safe to call inside the server process.
// opts.log(msg) is optional, for event reporting.
function startWatcher(root, opts: any = {}) {
  const rootResolved = path.resolve(root || DEFAULT_ROOT);
  // Validate the root without killing the process (throw, not die).
  if (!fs.existsSync(rootResolved))
    fs.mkdirSync(rootResolved, { recursive: true });
  if (!fs.statSync(rootResolved).isDirectory())
    throw new Error("root is not a directory: " + rootResolved);
  if (
    gitTry(["rev-parse", "--is-inside-work-tree"], rootResolved) === "true" &&
    !isRepo(rootResolved)
  )
    throw new Error("root berada di dalam repo git lain: " + rootResolved);

  const chokidar = require("chokidar"); // throws when not installed -> handled by the caller
  const onLog = typeof opts.log === "function" ? opts.log : () => {};
  const pending = new Map(); // dir → timer (debounce)
  const inFlight = new Set();

  const watcher = chokidar.watch(rootResolved, {
    depth: 0, // top level only
    ignoreInitial: true, // do not process folders that already exist at start
    persistent: true,
    awaitWriteFinish: false,
  });

  watcher.on("addDir", (dir) => {
    if (path.resolve(dir) === rootResolved) return; // root sendiri
    const name = path.basename(dir);
    if (isIgnorableName(name)) return;
    if (inFlight.has(dir)) return;
    // Debounce: wait for the folder to finish being created before touching it.
    clearTimeout(pending.get(dir));
    pending.set(
      dir,
      setTimeout(() => {
        pending.delete(dir);
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
        if (isRepo(dir)) return; // already a repo (created via `create`, say) — ignore
        inFlight.add(dir);
        try {
          onLog(`new folder detected: ${name}`);
          const res = initWorkspace(dir, name);
          if (res && res.branch)
            onLog(`'${name}' → repo+branch '${res.branch}' tertanam`);
        } catch (e) {
          onLog(`failed to adopt '${name}': ${e.message.split("\n")[0]}`);
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
    `\x1b[36m▶ ww watch\x1b[0m — watching for new folders at ${path.resolve(opts.root)}`,
  );
  log(
    `  Create a folder there (Explorer/mkdir) → it becomes a repo + branch automatically. Ctrl+C to stop.\n`,
  );
  process.on("SIGINT", () => {
    log("\n\x1b[36m■ watcher dihentikan.\x1b[0m");
    watcher.close().then(() => process.exit(0));
  });
}

// ── argumen ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const positional: any[] = [];
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
        "  ww create <name> [--branch <b>] [--root <dir>]   create a folder → new repo+branch",
      );
      log(
        "  ww adopt  <name> [--branch <b>] [--root <dir>]   convert an existing folder",
      );
      log(
        "  ww list                          [--root <dir>]   daftar workspace + branch + status",
      );
      log(
        "  ww watch                         [--root <dir>]   auto-adopt new folders (chokidar)",
      );
      log(`\n  root default: ${DEFAULT_ROOT}`);
      if (cmd && cmd !== "help") process.exitCode = 1;
  }
}

// Used as a module by the server (auto-starting the watcher) OR as a CLI.
// A read-only git summary for ONE workspace folder (used by the UI to show the
// branch and dirty/clean status in the sidebar). Never throws — a folder that is
// not yet a repo returns { repo:false }.
function gitInfo(dir) {
  if (!dir || !fs.existsSync(dir)) return { repo: false, error: "not-found" };
  if (!isRepo(dir)) return { repo: false };
  const branch = gitTry(["rev-parse", "--abbrev-ref", "HEAD"], dir) || "?";
  // --porcelain: one line per change (staged/unstaged/untracked). The count of
  // non-empty lines is the number of changes not yet reflected in a commit.
  const porcelain = gitTry(["status", "--porcelain"], dir);
  const dirtyCount =
    porcelain == null
      ? 0
      : porcelain.split("\n").filter((l) => l.trim()).length;
  // The last commit: short hash + subject + relative time. null when there is none.
  const last = gitTry(["log", "-1", "--format=%h%s%cr"], dir);
  let lastCommit: any = null;
  if (last) {
    const [hash, subject, when] = last.split("");
    lastCommit = { hash, subject, when };
  }
  return { repo: true, branch, dirtyCount, dirty: dirtyCount > 0, lastCommit };
}

// Run git and capture its result/error cleanly (for actions that must report
// success or failure).
function gitRun(args, cwd) {
  try {
    const out = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return { ok: true, out };
  } catch (e) {
    const err = ((e.stderr || "") + (e.stdout || "") || e.message || "")
      .toString()
      .trim();
    return { ok: false, err: err || "git failed" };
  }
}

// ── NON-BLOCKING versions of gitInfo and listBranches ──
//
// Both ran three git commands BACK TO BACK through execFileSync. Measured in this
// repo: rev-parse 56 ms, status --porcelain 220 ms, log -1 67 ms, for-each-ref
// 64 ms — so /ww/git froze the thread for ~291 ms and /ww/branches for ~194 ms.
// Because all of server.ts runs inside Electron's main process, that is a genuinely
// frozen window rather than merely a slow request.
//
// The three now run TOGETHER (Promise.all) rather than in sequence: they do not
// depend on each other, so the duration becomes the slowest command rather than
// the sum of all three.
//
// The synchronous versions REMAIN — this file is also used as a CLI (see main()
// below), and there is no window there to freeze.
// ── One result shared, and held briefly ──
//
// WHY. Measured against a genuinely running server: /ww/git is healthy on its own
// (40 ms), but it collapses under load —
//
//     1 concurrent  -> p99   322 ms
//     8 concurrent  -> p99  2023 ms
//    32 concurrent  -> p99  8149 ms   (past the "Not Responding" threshold)
//
// The cause is NOT synchronous code: this route is already async. What is scarce
// is the system's ability to spawn processes — each request spawns three git
// processes, so 32 requests mean 96 processes. The proof: throughput stayed flat
// at 6 rps AT EVERY concurrency level. More load only lengthened the queue without
// producing more results.
//
// So the cure is not parallelism but LESS WORK:
//   1. share the result — a request arriving while one is in flight waits for that
//      one instead of spawning three more processes;
//   2. a short cache — git status rarely changes within seconds, and the UI calls
//      this when a menu opens.
//
// A cache means stale data, and that is taken seriously: every operation that
// CHANGES git (commit, switching/creating/deleting a branch) invalidates that
// folder's cache. Without it the user commits and their panel still reports the
// pre-commit state — a mistake far worse than being slow.
const CACHE_MS = 1500;
// The key is "<kind>|<dir>", but THE FOLDER IS STORED SEPARATELY inside the entry —
// invalidation compares that value rather than matching the key's text suffix.
//
// Not tidiness: the first version used `k.endsWith(" " + dir)`, and the space
// inside it was quietly written as a NUL byte. The match therefore always failed —
// the cache was never invalidated, and there was no error at all. The only thing
// that found it was the test that specifically tested invalidation. Comparing
// values removes that entire class of mistake.
const _cacheGit = new Map(); // kunci -> { dir, waktu, nilai }
const _jalanGit = new Map(); // key -> the promise currently in flight

function _bersamaGit(jenis, dir, buat) {
  const kunci = jenis + "|" + dir;
  const c = _cacheGit.get(kunci);
  if (c && Date.now() - c.waktu < CACHE_MS) return Promise.resolve(c.nilai);
  const berjalan = _jalanGit.get(kunci);
  if (berjalan) return berjalan;
  const janji = buat()
    .then((nilai) => {
      _cacheGit.set(kunci, { dir, waktu: Date.now(), nilai });
      _jalanGit.delete(kunci);
      return nilai;
    })
    .catch((e) => {
      // Failures are NOT cached: one git that failed because the folder was locked
      // would freeze the wrong answer in place for the next 1.5 seconds.
      _jalanGit.delete(kunci);
      throw e;
    });
  _jalanGit.set(kunci, janji);
  return janji;
}

/** Drops the cache for one folder. Called after git has been CHANGED. */
function lupakanGit(dir) {
  const cari = String(dir || "");
  for (const [k, v] of [..._cacheGit.entries()])
    if (v.dir === cari) _cacheGit.delete(k);
}

function gitTryAsync(args, cwd): Promise<any> {
  return new Promise((selesai) => {
    execFile(
      "git",
      args,
      { cwd, encoding: "utf8", windowsHide: true },
      (galat, keluar) => selesai(galat ? null : String(keluar).trim()),
    );
  });
}
async function _gitInfoTarik(dir) {
  if (!dir || !fs.existsSync(dir)) return { repo: false, error: "not-found" };
  if (!isRepo(dir)) return { repo: false };
  const [cabang, porcelain, terakhir] = await Promise.all([
    gitTryAsync(["rev-parse", "--abbrev-ref", "HEAD"], dir),
    gitTryAsync(["status", "--porcelain"], dir),
    gitTryAsync(["log", "-1", "--format=%h\x1f%s\x1f%cr"], dir),
  ]);
  const dirtyCount =
    porcelain == null
      ? 0
      : porcelain.split("\n").filter((l) => l.trim()).length;
  let lastCommit: any = null;
  if (terakhir) {
    const [hash, subject, when] = terakhir.split("\x1f");
    lastCommit = { hash, subject, when };
  }
  return {
    repo: true,
    branch: cabang || "?",
    dirtyCount,
    dirty: dirtyCount > 0,
    lastCommit,
  };
}
async function _listBranchesTarik(dir) {
  if (!dir || !isRepo(dir)) return { repo: false, current: null, branches: [] };
  const [current, daftar] = await Promise.all([
    gitTryAsync(["rev-parse", "--abbrev-ref", "HEAD"], dir),
    gitTryAsync(
      ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
      dir,
    ),
  ]);
  const branches = (daftar || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return { repo: true, current: current || null, branches };
}

// The wrapper: ONE git request per folder per 1.5 seconds, however many callers
// arrive at once.
function gitInfoAsync(dir) {
  return _bersamaGit("info", dir, () => _gitInfoTarik(dir));
}
function listBranchesAsync(dir) {
  return _bersamaGit("branches", dir, () => _listBranchesTarik(dir));
}

// The local branches plus the active one. Does not throw.
function listBranches(dir) {
  if (!dir || !isRepo(dir)) return { repo: false, current: null, branches: [] };
  const current = gitTry(["rev-parse", "--abbrev-ref", "HEAD"], dir);
  const r = gitRun(
    ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    dir,
  );
  const branches = r.ok
    ? r.out
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return { repo: true, current: current || null, branches };
}

// Switch to another branch (checkout). Fails when a conflict or change blocks it.
function switchBranch(dir, branch) {
  if (!isRepo(dir)) return { ok: false, err: "not a git repo" };
  if (!branch) return { ok: false, err: "empty branch name" };
  return gitRun(["checkout", branch], dir);
}

// Create a new branch (optionally from another branch/ref) and switch to it.
function createBranch(dir, branch, from) {
  if (!isRepo(dir)) return { ok: false, err: "not a git repo" };
  const name = toBranch(branch);
  if (!name) return { ok: false, err: "invalid branch name" };
  const args = from ? ["checkout", "-b", name, from] : ["checkout", "-b", name];
  const r = gitRun(args, dir);
  return r.ok ? { ok: true, out: r.out, name } : r;
}

// Rename a branch (git branch -m). When oldName is the active branch it may be
// omitted.
function renameBranch(dir, oldName, newName) {
  if (!isRepo(dir)) return { ok: false, err: "not a git repo" };
  const nn = toBranch(newName);
  if (!nn) return { ok: false, err: "invalid new branch name" };
  const r = gitRun(["branch", "-m", oldName, nn], dir);
  return r.ok ? { ok: true, name: nn } : r;
}

// Delete a local branch (-D, forced). Refuses to delete the active branch.
function deleteBranch(dir, branch) {
  if (!isRepo(dir)) return { ok: false, err: "not a git repo" };
  const cur = gitTry(["rev-parse", "--abbrev-ref", "HEAD"], dir);
  if (cur === branch)
    return { ok: false, err: "cannot delete the currently active branch" };
  return gitRun(["branch", "-D", branch], dir);
}

// Commit EVERY change in the workspace working tree, with a message from the user.
//
// `add -A` on purpose: this panel shows a single number ("N uncommitted changes")
// counted from the whole working tree, so the commit has to cover the same thing.
// Partial staging would need a file-list UI that does not exist — and a button that
// commits LESS than its own number claims would be misleading.
//
// When nothing has changed, `git commit` exits non-zero with "nothing to commit".
// That is not a failure the user needs to fear, so it is separated out first and
// answered clearly.
function commitAll(dir, message) {
  if (!isRepo(dir)) return { ok: false, err: "not a git repo" };
  const pesan = String(message || "").trim();
  if (!pesan) return { ok: false, err: "empty commit message" };
  // Only the first line becomes the subject; the rest is ignored so `git log
  // --oneline` stays readable. The 200 limit follows git convention, not a rule.
  const subject = pesan.split(/\r?\n/)[0].slice(0, 200);
  const kotor = gitTry(["status", "--porcelain"], dir);
  if (!kotor) return { ok: false, err: "nothing to commit" };
  const staged = gitRun(["add", "-A"], dir);
  if (!staged.ok) return staged;
  const r = gitRun(["commit", "-m", subject], dir);
  if (!r.ok) return r;
  const hash = gitTry(["rev-parse", "--short", "HEAD"], dir) || "";
  return { ok: true, hash, subject };
}

// Rename a workspace FOLDER on disk (fs.rename) and update .ww.json. Safe: only
// folders with a .ww.json (a legitimate ww workspace), only when the target does
// not exist, and only for a valid name.
function renameWorkspaceFolder(dir, newName) {
  try {
    if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory())
      return { ok: false, err: "folder not found" };
    // Folder name: no path separator, no .., no character Windows forbids.
    const nm = String(newName || "").trim();
    if (!nm || /[\\/:*?"<>|]/.test(nm) || nm === "." || nm === "..")
      return { ok: false, err: "invalid folder name" };
    const marker = path.join(dir, ".ww.json");
    if (!fs.existsSync(marker))
      return {
        ok: false,
        err: "not a WOLFSPACE workspace (.ww.json is missing)",
      };
    const parent = path.dirname(dir);
    const newPath = path.join(parent, nm);
    if (path.resolve(newPath) === path.resolve(dir))
      return { ok: true, path: dir, unchanged: true };
    if (fs.existsSync(newPath))
      return {
        ok: false,
        err: "a folder or file with that name already exists",
      };
    fs.renameSync(dir, newPath);
    // Update .ww.json (which holds the name/label) when it has that field.
    try {
      const mk = path.join(newPath, ".ww.json");
      const j = JSON.parse(fs.readFileSync(mk, "utf8"));
      j.name = nm;
      fs.writeFileSync(mk, JSON.stringify(j, null, 2));
    } catch (_) {}
    return { ok: true, path: newPath, name: nm };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

module.exports = {
  initWorkspace,
  startWatcher,
  listWorkspaces,
  toBranch,
  isRepo,
  gitInfo,
  gitInfoAsync,
  lupakanGit,
  listBranches,
  listBranchesAsync,
  switchBranch,
  createBranch,
  renameBranch,
  deleteBranch,
  renameWorkspaceFolder,
  commitAll,
  DEFAULT_ROOT,
};
if (require.main === module) main();

// Marks this file as a MODULE rather than a global script, so its top-level names
// do not share one scope with the other .ts files in this project.
export {};
