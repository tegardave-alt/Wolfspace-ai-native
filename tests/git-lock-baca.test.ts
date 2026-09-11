// A read must not hold .git/index.lock, or the panel fights the user.
//
// THE SYMPTOM, reported from the real app while switching branch:
//
//   repository is locked by another git process (.git/index.lock)
//
// That message is WOLFSPACE reporting git correctly -- git really did refuse.
// The question is who was holding the lock, and part of the answer was
// WOLFSPACE itself: `git status` refreshes the index while it reads, and to do
// that it takes index.lock. The sidebar polls git every 6 seconds, so a poll
// and a checkout can land on the same repository at the same moment.
//
// REPRODUCED with raw git in a 400-file repo, a status poll running against the
// same folder throughout:
//
//   git status --porcelain              40 checkouts -> 3 failed on the lock
//   git --no-optional-locks status ...  40 checkouts -> 0 failed
//
// with the same number of status runs either way (53 vs 55). So the flag is not
// a mitigation of a race, it removes the race: git stops taking a lock it never
// needed for a read.
//
// THE SPLIT IS THE POINT. Probes give the lock up; commit and checkout keep it.
// Putting the flag in git() itself would have taken it from the writes too,
// which is how a "fix" becomes a corruption.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const ww = require(path.join(AKAR, "scripts", "ww.ts"));
const SRC = fs
  .readFileSync(path.join(AKAR, "scripts", "ww.ts"), "utf8")
  .replace(/\r\n/g, "\n");

/** The body of a function, from its signature to the closing brace at column 0. */
function tubuh(nama: string): string {
  const i = SRC.indexOf(nama);
  expect(i).toBeGreaterThan(-1);
  const j = SRC.indexOf("\n}", i);
  return SRC.slice(i, j < 0 ? SRC.length : j);
}

describe("pembacaan git melepaskan index.lock", () => {
  test("kedua penyelidik memakai --no-optional-locks", () => {
    expect(tubuh("function gitTry(args: any, cwd: any)")).toContain(
      "--no-optional-locks",
    );
    expect(tubuh("function gitTryAsync(args: any, cwd: any)")).toContain(
      "--no-optional-locks",
    );
  });

  test("yang MENULIS tetap memegang locknya", () => {
    // A commit or a checkout that gave up its lock would be a corruption, not a
    // fix. Only the probes are allowed to.
    expect(tubuh("function git(args: any, cwd: any)")).not.toContain(
      "--no-optional-locks",
    );
    expect(tubuh("function gitRunAsync(args: any, cwd: any)")).not.toContain(
      "--no-optional-locks",
    );
  });
});

describe("index.lock DITUNGGU, bukan dijadikan jawaban", () => {
  // ASKED BY THE USER, and the question was the right one: switching branch
  // failed with the lock message, "but shouldn't it just be able to switch?"
  //
  // Yes. index.lock is held for MILLISECONDS by whatever happens to be reading
  // the repository, and giving up on it turns a passing condition into a
  // refusal the user has to understand and act on. No other git client does
  // that.
  //
  // RETRYING IS SAFE FOR THIS FAILURE AND NO OTHER: index.lock is taken BEFORE
  // the work starts, so a command that could not take it did nothing at all --
  // there is no half-finished state to repeat.
  let dir = "";
  const lockPath = () => path.join(dir, ".git", "index.lock");

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-lock2-"));
    const j = (a: string[]) =>
      execFileSync("git", a, { cwd: dir, stdio: "ignore" });
    j(["init", "-q", "-b", "utama", "."]);
    j(["config", "user.email", "a@b.c"]);
    j(["config", "user.name", "uji"]);
    fs.writeFileSync(path.join(dir, "a.txt"), "satu");
    j(["add", "."]);
    j(["commit", "-qm", "awal"]);
    j(["branch", "fitur"]);
  });

  afterEach(() => {
    try {
      fs.rmSync(lockPath(), { force: true });
    } catch (_) {}
  });

  afterAll(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  });

  test("lock yang HILANG di tengah: perpindahan tetap berhasil", async () => {
    // The real case: another reader held it for a moment and let go.
    fs.writeFileSync(lockPath(), "");
    setTimeout(() => {
      try {
        fs.rmSync(lockPath(), { force: true });
      } catch (_) {}
    }, 350);
    const r = await ww.switchBranch(dir, "fitur");
    expect(r.err || "").not.toMatch(/lock/i);
    expect(r.ok).toBe(true);
    expect(r.current).toBe("fitur");
  }, 30000);

  test("lock yang MENETAP: menyerah, dan mengatakan sebabnya", async () => {
    // A lock still held after the budget is a crashed process, not a passing
    // reader -- and then the message IS the honest answer, because the user may
    // have to delete a stale .git/index.lock by hand.
    fs.writeFileSync(lockPath(), "");
    const t0 = Date.now();
    const r = await ww.switchBranch(dir, "utama");
    const ms = Date.now() - t0;
    expect(r.ok).toBe(false);
    expect(String(r.err)).toMatch(/lock/i);
    // It WAITED rather than refusing instantly: six retries, 180 ms apart.
    expect(ms).toBeGreaterThan(800);
  }, 30000);

  test("kegagalan LAIN tidak diulang — hanya lock yang ditunggu", () => {
    // Retrying "would be overwritten by checkout" would just delay a refusal
    // that is never going to change.
    const badan = tubuh("async function gitRunAsync(args: any, cwd: any)");
    expect(badan).toContain("_terkunci(r.err)");
    expect(badan).toContain("LOCK_COBA_LAGI");
  });
});

describe("benderanya tidak merusak pembacaan", () => {
  let dir = "";

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-lock-"));
    const j = (a: string[]) =>
      execFileSync("git", a, { cwd: dir, stdio: "ignore" });
    j(["init", "-q", "-b", "utama", "."]);
    j(["config", "user.email", "a@b.c"]);
    j(["config", "user.name", "uji"]);
    fs.writeFileSync(path.join(dir, "a.txt"), "satu");
    j(["add", "."]);
    j(["commit", "-qm", "awal"]);
    j(["branch", "fitur"]);
  });

  afterAll(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  });

  test("gitInfo masih membaca cabang dan kekotoran dengan benar", () => {
    // The assertions that matter are the VALUES: a flag that quietly broke the
    // read would still leave the shape intact.
    const bersih = ww.gitInfo(dir);
    expect(bersih.repo).toBe(true);
    expect(bersih.branch).toBe("utama");
    expect(bersih.dirty).toBe(false);

    fs.writeFileSync(path.join(dir, "a.txt"), "berubah");
    const kotor = ww.gitInfo(dir);
    expect(kotor.dirty).toBe(true);
    expect(kotor.dirtyCount).toBeGreaterThan(0);
  });

  test("daftar cabang tetap utuh lewat jalur async", async () => {
    const b = await ww.listBranchesAsync(dir);
    expect(b.repo).toBe(true);
    expect(b.branches.sort()).toEqual(["fitur", "utama"]);
  });
});
