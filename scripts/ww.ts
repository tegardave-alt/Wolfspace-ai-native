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
const log = (...a: any[]) => console.log(...a);
const ok = (m: any) => log("  \x1b[32m✓\x1b[0m " + m);
const info = (m: any) => log("  \x1b[36m•\x1b[0m " + m);
const warn = (m: any) => log("  \x1b[33m!\x1b[0m " + m);
const die = (m: any) => {
  console.error("\x1b[31m✗ " + m + "\x1b[0m");
  process.exit(1);
};

// Run git inside cwd. Return stdout (trimmed). Throws on failure.
function git(args: any, cwd: any) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
// The non-throwing version (for probing) — returns null on failure.
//
// --no-optional-locks, AND IT IS NOT COSMETIC. `git status` refreshes the index
// while it reads, and to do that it takes .git/index.lock -- so a poll that only
// ever LOOKS at the repository can make a checkout the user just asked for fail
// with "Another git process seems to be running".
//
// REPRODUCED, and the numbers are from a 400-file repo with a status poll
// running against the same folder:
//
//   git status --porcelain                    40 checkouts -> 3 failed on the lock
//   git --no-optional-locks status ...        40 checkouts -> 0 failed
//
// with the same number of status runs either way (53 vs 55). The flag tells git
// not to take locks it does not need, which is exactly what a read is.
//
// IT GOES HERE AND NOT IN git(), because git() is also how this file COMMITS and
// CHECKS OUT. Those must keep their locks; the whole point is that only the
// probes give theirs up. Requires git >= 2.15 (2017).
function gitTry(args: any, cwd: any) {
  try {
    return git(["--no-optional-locks", ...args], cwd);
  } catch {
    return null;
  }
}

// Turn a folder name into a valid git branch name.
function toBranch(name: any) {
  let b = String(name)
    .trim()
    .replace(/[^\w.\-/]+/g, "-") // karakter ilegal → '-'
    .replace(/\.\.+/g, ".") // hindari '..'
    .replace(/^[-/.]+|[-/.]+$/g, "") // buang pemisah di ujung
    .replace(/-{2,}/g, "-");
  return b || "work";
}

// A folder is already a git repo when it has a .git subfolder.
function isRepo(dir: any) {
  return fs.existsSync(path.join(dir, ".git"));
}

// Folder names the watcher must ignore (temporary/hidden/system).
function isIgnorableName(name: any) {
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
function assertRootNotNested(root: any) {
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

function ensureRoot(root: any) {
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
    info(`root dibuat: ${root}`);
  }
  const st = fs.statSync(root);
  if (!st.isDirectory()) die(`root is not a directory: ${root}`);
  assertRootNotNested(root);
}

// ── core: turn a folder into an independent repo with its own branch ─────────
function initWorkspace(dir: any, name: any, branchArg?: any) {
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
function cmdCreate(name: any, opts: any) {
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

function cmdAdopt(name: any, opts: any) {
  if (!name) die("usage: ww adopt <name> [--branch <b>] [--root <dir>]");
  ensureRoot(opts.root);
  const dir = path.join(opts.root, name);
  if (!fs.existsSync(dir))
    die(`folder '${name}' does not exist at ${opts.root}`);
  initWorkspace(dir, name, opts.branch);
}

// Return the workspaces under the root as DATA (for the server/UI). The disk is
// the truth.
function listWorkspaces(root: any) {
  const r = path.resolve(root || DEFAULT_ROOT);
  if (!fs.existsSync(r)) return [];
  return fs
    .readdirSync(r, { withFileTypes: true })
    .filter((d: any) => d.isDirectory() && !isIgnorableName(d.name))
    .map((d: any) => {
      const dir = path.join(r, d.name);
      const repo = isRepo(dir);
      const branch = repo
        ? gitTry(["rev-parse", "--abbrev-ref", "HEAD"], dir) || "?"
        : null;
      const dirty = repo ? !!gitTry(["status", "--porcelain"], dir) : false;
      return { name: d.name, path: dir, isRepo: repo, branch, dirty };
    });
}

function cmdList(opts: any) {
  ensureRoot(opts.root);
  const entries = fs
    .readdirSync(opts.root, { withFileTypes: true })
    .filter((d: any) => d.isDirectory() && !isIgnorableName(d.name));
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
function startWatcher(root: any, opts: any = {}) {
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

  watcher.on("addDir", (dir: any) => {
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
  watcher.on("error", (e: any) => onLog("watcher error: " + e.message));
  return watcher;
}

function cmdWatch(opts: any) {
  let watcher: any;
  try {
    watcher = startWatcher(opts.root, {
      log: (m: any) => log(`  \x1b[35m↳\x1b[0m ${m}`),
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
function parseArgs(argv: any) {
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
function gitInfo(dir: any) {
  if (!dir || !fs.existsSync(dir)) return { repo: false, error: "not-found" };
  if (!isRepo(dir)) return { repo: false };
  const branch = gitTry(["rev-parse", "--abbrev-ref", "HEAD"], dir) || "?";
  // --porcelain: one line per change (staged/unstaged/untracked). The count of
  // non-empty lines is the number of changes not yet reflected in a commit.
  const porcelain = gitTry(["status", "--porcelain"], dir);
  // NULL IS NOT CLEAN. `git status --porcelain` answers with an empty string
  // when there is nothing to report, so null means the question could not be
  // asked at all -- a timeout, or a lock held by another program. Counting
  // that as zero told the panel "clean, no changes" about a repository full
  // of uncommitted work, which is the one lie a git panel must never tell.
  if (porcelain == null)
    return {
      repo: true,
      branch,
      dirtyCount: null,
      dirty: false,
      takTerbaca: true,
      lastCommit: null,
    };
  const dirtyCount = porcelain.split("\n").filter((l: any) => l.trim()).length;
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
function gitRun(args: any, cwd: any) {
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

function _bersamaGit(jenis: any, dir: any, buat: any) {
  const kunci = jenis + "|" + dir;
  const c = _cacheGit.get(kunci);
  if (c && Date.now() - c.waktu < CACHE_MS) return Promise.resolve(c.nilai);
  const berjalan = _jalanGit.get(kunci);
  if (berjalan) return berjalan;
  const janji = buat()
    .then((nilai: any) => {
      _cacheGit.set(kunci, { dir, waktu: Date.now(), nilai });
      _jalanGit.delete(kunci);
      return nilai;
    })
    .catch((e: any) => {
      // Failures are NOT cached: one git that failed because the folder was locked
      // would freeze the wrong answer in place for the next 1.5 seconds.
      _jalanGit.delete(kunci);
      throw e;
    });
  _jalanGit.set(kunci, janji);
  return janji;
}

/** Drops the cache for one folder. Called after git has been CHANGED. */
function lupakanGit(dir: any) {
  const cari = String(dir || "");
  for (const [k, v] of [..._cacheGit.entries()])
    if (v.dir === cari) _cacheGit.delete(k);
}

// The async twin of gitRun. Same contract -- { ok, out } or { ok:false, err } --
// so the write paths could stop blocking without changing what they return.
//
// WHY IT MATTERS. These run on the "kerja" host, and execFileSync there holds
// that host's only thread: a slow commit stalled every other /ww call behind
// it, so the file tree went quiet while git worked.
/** One attempt, with no opinion about what its failure means. */
function _gitRunSekali(args: any, cwd: any): Promise<any> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd,
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        // Writes move data; reads do not. See BATAS_TULIS_MS.
        timeout: BATAS_TULIS_MS,
      },
      (e: any, stdout: any, stderr: any) => {
        if (!e) return resolve({ ok: true, out: String(stdout || "").trim() });
        resolve({ ok: false, err: _sebabGit(e, stderr, stdout, args) });
      },
    );
  });
}

// A LOCKED INDEX IS A WAIT, NOT AN ANSWER.
//
// Asked directly by the user, and the question was the right one: switching
// branch failed with
//
//   repository is locked by another git process (.git/index.lock)
//
// "but shouldn't it just be able to switch?" -- yes. That lock is held for
// MILLISECONDS by whatever is reading the repository at that instant, and
// giving up on it turns a transient condition into a refusal the user has to
// understand and act on. No other git client behaves that way.
//
// WHY RETRYING IS SAFE HERE, and only here: index.lock is taken BEFORE the work
// begins. A command that could not take it did nothing at all -- there is no
// half-done state to repeat. That is not true of other failures, so ONLY the
// lock is retried; "would be overwritten by checkout" is a real refusal and is
// returned on the first attempt, unchanged.
//
// The budget is small on purpose. A lock still held after roughly a second is
// not a passing reader, it is a stuck or crashed process, and then the honest
// answer IS the message -- with a stale .git/index.lock the user may have to
// delete by hand.
const LOCK_COBA_LAGI = 6;
const LOCK_JEDA_MS = 180;

function _terkunci(err: any) {
  return /index\.lock|Another git process|locked by another git/i.test(
    String(err || ""),
  );
}

/**
 * What the lock looks like RIGHT NOW, said in the failure itself.
 *
 * WHY THIS EXISTS. The lock message was reported from the real app and could
 * not be reproduced afterwards -- five explanations were tested and every one
 * was eliminated by measurement: the repository was watched for 60 seconds with
 * the app and the editor running and .git/index.lock never appeared once; no
 * stale lock file existed anywhere under the user's folders; overlapping
 * switches were absorbed by the retry; the git version accepts every flag used
 * here; and the running app was started after the fix was on disk.
 *
 * A failure nobody can reproduce is a failure nobody can fix, so the next
 * occurrence carries its own evidence instead of a description.
 *
 * THE AGE OF THE LOCK FILE IS THE PART THAT DECIDES IT. A lock a few hundred
 * milliseconds old is another process reading, and waiting longer would have
 * helped. A lock minutes old is a crashed git that will never let go, and no
 * amount of waiting will do anything -- that one has to be deleted by hand.
 * Those two need opposite responses and used to produce the identical sentence.
 */
function _potretLock(cwd: any, menungguMs: number, percobaan: number) {
  let bagian = "waited " + menungguMs + "ms over " + percobaan + " attempts";
  try {
    const berkas = path.join(String(cwd), ".git", "index.lock");
    const st = fs.statSync(berkas);
    const umur = Date.now() - st.mtimeMs;
    bagian +=
      "; .git/index.lock still there, " +
      (umur < 5000
        ? Math.round(umur) + "ms old (another git is working - it should clear)"
        : Math.round(umur / 1000) +
          "s old (STALE: a git process died holding it. Delete .git/index.lock)");
  } catch (_) {
    // Gone by the time we looked: the holder let go a moment too late for us.
    bagian += "; the lock was already gone when this was written";
  }
  return bagian;
}

async function gitRunAsync(args: any, cwd: any): Promise<any> {
  const t0 = Date.now();
  let percobaan = 1;
  let r = await _gitRunSekali(args, cwd);
  for (let i = 0; i < LOCK_COBA_LAGI && !r.ok && _terkunci(r.err); i++) {
    await new Promise((s) => setTimeout(s, LOCK_JEDA_MS));
    percobaan++;
    r = await _gitRunSekali(args, cwd);
  }
  // Only a lock that OUTLASTED the retries is worth describing. Everything else
  // already says what it is.
  if (!r.ok && _terkunci(r.err))
    r.err = r.err + " - " + _potretLock(cwd, Date.now() - t0, percobaan);
  return r;
}

// Git calls get a CEILING.
//
// Without one they wait for ever, and "for ever" is what a locked repository
// gives you: another program holding .git/index.lock, or a `git status -uall`
// grinding through a deep tree. Seen in the real app -- the panel span its
// loader indefinitely while the failure surfaced somewhere else entirely, as
// "the host is not answering", which names neither git nor the lock.
const BATAS_GIT_MS = 15000;

// WRITES GET THEIR OWN BUDGET, and one number for both was the bug.
//
// 15 seconds is right for a READ: it runs on a 6-second poll, and a `git
// status` that needs 15 seconds is already broken. For a WRITE the same number
// is wrong, because a write actually moves data.
//
// MEASURED on this repository, in an isolated clone with nothing else running:
//
//   git clone --local        3624 ms
//   git checkout <branch>    2852 ms   (445 files changed)
//   git checkout main        1892 ms
//   git status                758 ms
//
// A checkout is 2.9 seconds on an idle machine. In a real working tree it
// competes with a virus scanner inspecting every file git writes, with the
// app's own watcher reacting to hundreds of those changes, and with whatever
// the user is doing. Five times slower reaches the limit -- and what the user
// sees is a branch switch that FAILED, killed just before it finished.
//
// The limit is not removed: a git that has genuinely hung must still die. What
// is fixed is telling "slow because it is working" apart from "not answering".
const BATAS_TULIS_MS = 90000;

/** Reads a git failure and says what it actually was. */
/**
 * Reads a git failure and says what it actually was.
 *
 * A TIMEOUT IS NOT A LOCK, and saying it might be cost hours.
 *
 * The old text for a killed process read "the repository may be locked by
 * another program". That is a GUESS, printed as though it were a finding, and
 * it was wrong: a killed git means the command ran past its budget and was
 * stopped -- nothing about it says a lock was involved. The guess sent a whole
 * investigation after .git/index.lock, which was measured never to appear:
 * sixty seconds of watching the live repository with the app and the editor
 * running produced zero locks, and there was no stale lock file anywhere.
 *
 * So a timeout now reports the timeout, names the command, and stops there.
 * Where a lock IS the cause, git says so itself and the branch below reads it
 * from git's own words rather than inventing them.
 */
function _sebabGit(e: any, stderr: any, stdout: any, args?: any) {
  const teks = ((stderr || "") + (stdout || "")).toString().trim();
  if (e && (e.killed || e.signal)) {
    const perintah = Array.isArray(args) ? "`git " + args[0] + "` " : "git ";
    return (
      perintah +
      "was still running after " +
      Math.round((e.timeout || BATAS_GIT_MS) / 1000) +
      "s and was stopped. The repository may be large, the disk busy, or a " +
      "virus scanner may be inspecting every file git writes"
    );
  }
  if (/index\.lock|Another git process|Unable to create/i.test(teks))
    return "repository is locked by another git process (.git/index.lock)";
  return teks || (e && e.message) || "git failed";
}

function gitTryAsync(args: any, cwd: any): Promise<any> {
  // Same reason as gitTry above: a read must not hold .git/index.lock, or the
  // 6-second panel refresh competes with the user's own checkout.
  return new Promise((selesai: any) => {
    execFile(
      "git",
      ["--no-optional-locks", ...args],
      { cwd, encoding: "utf8", windowsHide: true, timeout: BATAS_GIT_MS },
      (galat: any, keluar: any) =>
        selesai(galat ? null : String(keluar).trim()),
    );
  });
}
async function _gitInfoTarik(dir: any) {
  if (!dir || !fs.existsSync(dir)) return { repo: false, error: "not-found" };
  if (!isRepo(dir)) return { repo: false };
  const [cabang, porcelain, terakhir] = await Promise.all([
    gitTryAsync(["rev-parse", "--abbrev-ref", "HEAD"], dir),
    gitTryAsync(["status", "--porcelain"], dir),
    gitTryAsync(["log", "-1", "--format=%h\x1f%s\x1f%cr"], dir),
  ]);
  // NULL IS NOT CLEAN. `git status --porcelain` answers with an empty string
  // when there is nothing to report, so null means the question could not be
  // asked at all -- a timeout, or a lock held by another program. Counting
  // that as zero told the panel "clean, no changes" about a repository full
  // of uncommitted work, which is the one lie a git panel must never tell.
  if (porcelain == null)
    return {
      repo: true,
      branch: cabang || "?",
      dirtyCount: null,
      dirty: false,
      takTerbaca: true,
      lastCommit: null,
    };
  const dirtyCount = porcelain.split("\n").filter((l: any) => l.trim()).length;
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
async function _listBranchesTarik(dir: any) {
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
    .map((s: any) => s.trim())
    .filter(Boolean);
  // A DETACHED HEAD IS NOT A BRANCH NAMED "HEAD". `rev-parse --abbrev-ref HEAD`
  // answers with the literal string "HEAD" when nothing is checked out by name,
  // and the panel printed that in the branch button as though it were a branch —
  // while no row in the list matched it, so every branch also looked inactive.
  if (current === "HEAD") {
    const sha = await gitTryAsync(["rev-parse", "--short", "HEAD"], dir);
    return { repo: true, current: null, detached: sha || "?", branches };
  }
  return { repo: true, current: current || null, branches };
}

// The wrapper: ONE git request per folder per 1.5 seconds, however many callers
// arrive at once.
function gitInfoAsync(dir: any) {
  return _bersamaGit("info", dir, () => _gitInfoTarik(dir));
}
function listBranchesAsync(dir: any) {
  return _bersamaGit("branches", dir, () => _listBranchesTarik(dir));
}

// The local branches plus the active one. Does not throw.
//
// IT MUST ANSWER EXACTLY WHAT _listBranchesTarik ANSWERS. These are the sync
// and async halves of one question, and tests/execsync-terikat.test.ts compares
// them precisely because a difference here is not an optimisation — it is a
// silent change of behaviour depending on which caller asked.
//
// The detached-HEAD branch below went into the async half alone, and the
// divergence was invisible on an ordinary checkout: both halves agree whenever
// a branch is checked out by name. CI is what found it, because
// actions/checkout leaves HEAD DETACHED for a pull request — there the sync
// half reported a branch called "HEAD" while the async half reported a sha.
function listBranches(dir: any) {
  if (!dir || !isRepo(dir)) return { repo: false, current: null, branches: [] };
  const current = gitTry(["rev-parse", "--abbrev-ref", "HEAD"], dir);
  const r = gitRun(
    ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    dir,
  );
  const branches = r.ok
    ? r.out
        .split("\n")
        .map((s: any) => s.trim())
        .filter(Boolean)
    : [];
  // A DETACHED HEAD IS NOT A BRANCH NAMED "HEAD" — see _listBranchesTarik for
  // what that looked like in the panel.
  if (current === "HEAD") {
    const sha = gitTry(["rev-parse", "--short", "HEAD"], dir);
    return { repo: true, current: null, detached: sha || "?", branches };
  }
  return { repo: true, current: current || null, branches };
}

/**
 * Does this repository have a LOCAL BRANCH by exactly this name?
 *
 * refs/heads/ is the whole point. `git checkout` is not a branch command — it is
 * four commands wearing one name — so anything at all could be handed to it and
 * something would happen. MEASURED against a real repository holding
 * uncommitted work:
 *
 *   switchBranch(dir, ".")      -> { ok: true }  and a.txt came back from HEAD:
 *                                  the uncommitted work was DESTROYED, while
 *                                  the panel flashed "switched to .".
 *   switchBranch(dir, "--help") -> { ok: true }  HEAD never moved; git printed
 *                                  its usage and exited 0.
 *   switchBranch(dir, <sha>)    -> { ok: true }  HEAD detached, after which the
 *                                  panel showed a branch named "HEAD".
 *
 * Verifying the ref first removes all three by construction rather than by
 * blacklist: `.`, `--help` and a sha are not refs/heads/*. It also settles the
 * option-injection question for good, because git's own check-ref-format
 * forbids a ref beginning with `-`, so a name that verifies can never be read
 * as a flag.
 */
async function _localBranchExists(dir: any, branch: any) {
  const sha = await gitTryAsync(
    ["rev-parse", "--verify", "--quiet", "refs/heads/" + branch],
    dir,
  );
  return !!sha;
}

/**
 * Reads git's refusal and says it in a sentence the panel can actually show.
 *
 * The everyday refusal is four lines long — the cause, a tab-indented list of
 * files, the advice, then "Aborting" — and the panel has one small line for it.
 * It was passed straight through, so what reached the user was
 *
 *   error: Your local changes to the following fi…
 *
 * and then it vanished after 2.8 seconds. The switch looked broken when git had
 * in fact answered clearly: commit first. That is the reported bug.
 */
function _switchFailureReason(err: any) {
  const text = String(err || "").trim();
  if (!text) return "git refused the switch without saying why";
  const lower = text.toLowerCase();
  if (lower.includes("would be overwritten by checkout")) {
    const files = text
      .split("\n")
      .filter((l: any) => l.startsWith("\t"))
      .map((l: any) => l.trim())
      .filter(Boolean);
    const listed = files.slice(0, 3).join(", ");
    const rest = files.length > 3 ? " +" + (files.length - 3) + " more" : "";
    const kind = lower.includes("untracked working tree")
      ? "untracked files"
      : "uncommitted changes";
    return (
      "cannot switch: " +
      kind +
      " here would be lost" +
      (listed ? " (" + listed + rest + ")" : "") +
      ". Commit them first, then switch."
    );
  }
  if (lower.includes("did not match any file"))
    return "no branch by that name in this repository";
  // Anything else: git puts the cause on the first line and the advice after
  // it, and "error: " in front of a message the panel already colours red adds
  // nothing.
  const first = text.split("\n")[0].trim();
  return first.startsWith("error: ") ? first.slice(7) : first;
}

// Switch to another branch. Refuses anything that is not a local branch, and
// reports what HEAD IS afterwards rather than what it was asked to be.
async function switchBranch(dir: any, branch: any) {
  if (!isRepo(dir)) return { ok: false, err: "not a git repo" };
  const wanted = String(branch == null ? "" : branch);
  if (!wanted.trim()) return { ok: false, err: "empty branch name" };
  if (!(await _localBranchExists(dir, wanted)))
    return {
      ok: false,
      err: "no local branch named " + JSON.stringify(wanted),
    };
  const r = await gitRunAsync(["checkout", wanted], dir);
  if (!r.ok) return { ok: false, err: _switchFailureReason(r.err) };
  // EXIT 0 IS NOT "THE BRANCH CHANGED". The measurements above are exactly that
  // case: git succeeded and HEAD stayed where it was. So HEAD is read back, and
  // the answer describes the repository rather than the request.
  const actual = await gitTryAsync(["rev-parse", "--abbrev-ref", "HEAD"], dir);
  if (actual !== wanted)
    return {
      ok: false,
      err:
        "git reported success but HEAD is now " +
        (actual || "unreadable") +
        ", not " +
        wanted,
    };
  return { ok: true, current: actual };
}

// Create a new branch (optionally from another branch/ref) and switch to it.
async function createBranch(dir: any, branch: any, from: any) {
  if (!isRepo(dir)) return { ok: false, err: "not a git repo" };
  const name = toBranch(branch);
  if (!name) return { ok: false, err: "invalid branch name" };
  const args = from ? ["checkout", "-b", name, from] : ["checkout", "-b", name];
  const r = await gitRunAsync(args, dir);
  return r.ok ? { ok: true, out: r.out, name } : r;
}

// Rename a branch (git branch -m). When oldName is the active branch it may be
// omitted.
async function renameBranch(dir: any, oldName: any, newName: any) {
  if (!isRepo(dir)) return { ok: false, err: "not a git repo" };
  const nn = toBranch(newName);
  if (!nn) return { ok: false, err: "invalid new branch name" };
  const r = await gitRunAsync(["branch", "-m", oldName, nn], dir);
  return r.ok ? { ok: true, name: nn } : r;
}

// Delete a local branch (-D, forced). Refuses to delete the active branch.
async function deleteBranch(dir: any, branch: any) {
  if (!isRepo(dir)) return { ok: false, err: "not a git repo" };
  const cur = await gitTryAsync(["rev-parse", "--abbrev-ref", "HEAD"], dir);
  if (cur === branch)
    return { ok: false, err: "cannot delete the currently active branch" };
  return gitRunAsync(["branch", "-D", branch], dir);
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
async function commitAll(dir: any, message: any) {
  if (!isRepo(dir)) return { ok: false, err: "not a git repo" };
  const pesan = String(message || "").trim();
  if (!pesan) return { ok: false, err: "empty commit message" };
  // Only the first line becomes the subject; the rest is ignored so `git log
  // --oneline` stays readable. The 200 limit follows git convention, not a rule.
  const subject = pesan.split(/\r?\n/)[0].slice(0, 200);
  const kotor = await gitTryAsync(["status", "--porcelain"], dir);
  if (!kotor) return { ok: false, err: "nothing to commit" };
  const staged = await gitRunAsync(["add", "-A"], dir);
  if (!staged.ok) return staged;
  const r = await gitRunAsync(["commit", "-m", subject], dir);
  if (!r.ok) return r;
  const hash = (await gitTryAsync(["rev-parse", "--short", "HEAD"], dir)) || "";
  return { ok: true, hash, subject };
}

// Rename a workspace FOLDER on disk (fs.rename) and update .ww.json. Safe: only
// folders with a .ww.json (a legitimate ww workspace), only when the target does
// not exist, and only for a valid name.
function renameWorkspaceFolder(dir: any, newName: any) {
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
  _localBranchExists,
  _switchFailureReason,
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
