// Switching branches from the workspace panel.
//
// WHY THIS FILE EXISTS. The report was plain: "when I move to another branch /
// main, it doesn't work". Measured against a real repository, the panel was
// hiding THREE separate things, and none of them looked like a failure:
//
//   1. git refused correctly (uncommitted changes in the way), but its reason is
//      four lines long while the message box was ONE clipped line that vanished
//      after 2.8 seconds. What reached the user was "error: Your local changes to
//      the following fi…".
//   2. `git checkout` accepts ANYTHING. switchBranch(dir, ".") returned
//      { ok: true } AND DESTROYED uncommitted work; "--help" returned
//      { ok: true } without moving HEAD at all.
//   3. HEAD was never read back, so "ok" never meant "the branch changed".
//
// All of it runs against a throwaway repository in a temp folder: git's write
// half is only reachable when the repository being disturbed is not this one.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const ww = require("../scripts/ww.ts");

jest.setTimeout(90000);

/**
 * Strip comments before matching source, so a test can never pass on a sentence
 * I wrote about the code instead of on the code.
 *
 * LINE BY LINE, deliberately. The first version used /\/\*[\s\S]*?\*\//g and it
 * ATE CODE: one "/*" occurring inside a string opened a phantom comment that
 * swallowed the next 9,583 characters — including the whole function under test —
 * and the test then failed with indexOf === -1, which explains nothing. Only
 * lines that BEGIN as comments are dropped, so no string can be mistaken for one.
 */
function withoutComments(src: any) {
  const out: any[] = [];
  let inBlock = false;
  for (const line of String(src).split("\n")) {
    const t = line.trim();
    const closes = t.endsWith("*/") || t.endsWith("*/}");
    if (inBlock) {
      if (closes) inBlock = false;
      continue;
    }
    if (t.startsWith("//")) continue;
    if (t.startsWith("/*") || t.startsWith("{/*")) {
      if (!closes) inBlock = true;
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

describe("git's refusal is made readable", () => {
  const FULL = [
    "error: Your local changes to the following files would be overwritten by checkout:",
    "\ta.txt",
    "\tsrc/b.ts",
    "Please commit your changes or stash them before you switch branches.",
    "Aborting",
  ].join("\n");

  test("uncommitted changes: one sentence, naming the files", () => {
    const s = ww._switchFailureReason(FULL);
    expect(s).not.toMatch(/\n/); // the message box is one short paragraph
    expect(s).toMatch(/uncommitted changes/);
    expect(s).toMatch(/a\.txt/);
    expect(s).toMatch(/src\/b\.ts/);
    expect(s).toMatch(/Commit them first/);
    // "Aborting" tells the user nothing at all.
    expect(s).not.toMatch(/Aborting/);
  });

  test("many files are summarised, not cut off mid-list", () => {
    const many = [
      "error: Your local changes to the following files would be overwritten by checkout:",
      "\tone.txt",
      "\ttwo.txt",
      "\tthree.txt",
      "\tfour.txt",
      "\tfive.txt",
      "Aborting",
    ].join("\n");
    const s = ww._switchFailureReason(many);
    expect(s).toMatch(/one\.txt, two\.txt, three\.txt \+2 more/);
  });

  test("untracked files are named as untracked", () => {
    const s = ww._switchFailureReason(
      [
        "error: The following untracked working tree files would be overwritten by checkout:",
        "\tnew.txt",
        "Aborting",
      ].join("\n"),
    );
    expect(s).toMatch(/untracked files/);
    expect(s).toMatch(/new\.txt/);
  });

  test("a missing branch is answered in human words", () => {
    const s = ww._switchFailureReason(
      "error: pathspec 'nope' did not match any file(s) known to git",
    );
    expect(s).toMatch(/no branch by that name/);
  });

  test("anything else: the first line only, without 'error: '", () => {
    const s = ww._switchFailureReason("error: something else\nsecond line");
    expect(s).toBe("something else");
  });

  test("a failure with no text still says something", () => {
    // Returning "" means an empty box blinks — indistinguishable from a dead
    // button, which is the bug being fixed.
    expect(ww._switchFailureReason("")).toMatch(/\S/);
    expect(ww._switchFailureReason(null)).toMatch(/\S/);
  });
});

describe("switching branches in a real repository", () => {
  let dir = "";
  const g = (...a: any[]) =>
    execFileSync("git", ["-C", dir, ...a], { encoding: "utf8" });
  const HEAD = () => g("rev-parse", "--abbrev-ref", "HEAD").trim();

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "uji-cabang-"));
    g("init", "-q", "-b", "main");
    g("config", "user.email", "uji@example.com");
    g("config", "user.name", "Uji");
    fs.writeFileSync(path.join(dir, "a.txt"), "original\n");
    g("add", "-A");
    g("commit", "-qm", "first");
    g("branch", "fitur");
    ww.lupakanGit(dir);
  });

  test("an ordinary switch works, and reports the real HEAD", async () => {
    const r = await ww.switchBranch(dir, "fitur");
    expect(r.ok).toBe(true);
    expect(r.current).toBe("fitur");
    expect(HEAD()).toBe("fitur");
  });

  test("'.' is REFUSED, and uncommitted work survives", async () => {
    // The regression that matters most: `git checkout .` restores files from
    // HEAD. The old version answered { ok: true } and the panel said
    // "switched to ." while the user's work was already gone.
    fs.writeFileSync(path.join(dir, "a.txt"), "NOT SAVED YET\n");
    const r = await ww.switchBranch(dir, ".");
    expect(r.ok).toBe(false);
    expect(r.err).toMatch(/no local branch/);
    expect(fs.readFileSync(path.join(dir, "a.txt"), "utf8")).toMatch(
      /NOT SAVED YET/,
    );
  });

  test("a name that is an option is refused, not executed", async () => {
    // `git checkout --help` exits 0 after printing its usage: a "success" that
    // moves nothing.
    const r = await ww.switchBranch(dir, "--help");
    expect(r.ok).toBe(false);
    expect(HEAD()).toBe("main");
  });

  test("a sha is refused — switching branches is not detaching HEAD", async () => {
    const sha = g("rev-parse", "HEAD").trim();
    const r = await ww.switchBranch(dir, sha);
    expect(r.ok).toBe(false);
    expect(HEAD()).toBe("main");
  });

  test("a branch that does not exist, and a name with a trailing space", async () => {
    expect((await ww.switchBranch(dir, "nope")).ok).toBe(false);
    const r = await ww.switchBranch(dir, "main ");
    expect(r.ok).toBe(false);
    expect(r.err).toMatch(/no local branch/);
  });

  test("an empty name, and a folder that is not a repo", async () => {
    expect((await ww.switchBranch(dir, "")).err).toMatch(/empty branch name/);
    expect((await ww.switchBranch(dir, null)).err).toMatch(/empty branch name/);
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "bukan-repo-"));
    expect((await ww.switchBranch(empty, "main")).err).toMatch(
      /not a git repo/,
    );
  });

  test("conflicting changes: it fails, with a reason that can be read", async () => {
    g("checkout", "-q", "fitur");
    fs.writeFileSync(path.join(dir, "a.txt"), "from-fitur\n");
    g("commit", "-qam", "fitur changes a");
    g("checkout", "-q", "main");
    fs.writeFileSync(path.join(dir, "a.txt"), "uncommitted\n");

    const r = await ww.switchBranch(dir, "fitur");
    expect(r.ok).toBe(false);
    expect(r.err).toMatch(/uncommitted changes/);
    expect(r.err).toMatch(/a\.txt/);
    expect(r.err).toMatch(/Commit them first/);
    expect(r.err).not.toMatch(/\n/);
    expect(HEAD()).toBe("main"); // git moved nothing, and neither did the report
  });

  test("changes that do not conflict still travel across", async () => {
    // This is git's own behaviour and must not be narrowed: an untracked file
    // absent from the target branch crosses over without trouble.
    fs.writeFileSync(path.join(dir, "new.txt"), "untracked\n");
    const r = await ww.switchBranch(dir, "fitur");
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(dir, "new.txt"))).toBe(true);
  });

  test("_localBranchExists recognises local branches and nothing else", async () => {
    expect(await ww._localBranchExists(dir, "main")).toBe(true);
    expect(await ww._localBranchExists(dir, "fitur")).toBe(true);
    expect(await ww._localBranchExists(dir, ".")).toBe(false);
    expect(await ww._localBranchExists(dir, "--help")).toBe(false);
    expect(
      await ww._localBranchExists(dir, g("rev-parse", "HEAD").trim()),
    ).toBe(false);
    expect(await ww._localBranchExists(dir, "HEAD")).toBe(false);
  });

  test("a detached HEAD is not a branch called HEAD", async () => {
    g("checkout", "-q", "--detach");
    ww.lupakanGit(dir);
    const d = await ww.listBranchesAsync(dir);
    expect(d.repo).toBe(true);
    expect(d.current).toBe(null);
    expect(String(d.detached)).toMatch(/^[0-9a-f]{4,40}$/);
    expect(d.branches).toEqual(expect.arrayContaining(["main", "fitur"]));
    // And from there, switching back to a branch must still work.
    const r = await ww.switchBranch(dir, "main");
    expect(r.ok).toBe(true);
    expect(r.current).toBe("main");
  });

  test("the cache is dropped after a switch, or the panel shows the old branch", async () => {
    // The 1.5s cache is deliberate, and the /ww/branch/* route calls lupakanGit
    // after every change. Without it even a SUCCESSFUL switch looks like a
    // failure: the button still names the branch left behind.
    await ww.listBranchesAsync(dir); // fill the cache first
    await ww.switchBranch(dir, "fitur");
    ww.lupakanGit(dir);
    expect((await ww.listBranchesAsync(dir)).current).toBe("fitur");
  });
});

describe("the panel: the reason has to reach the user's eyes", () => {
  const src = withoutComments(
    fs.readFileSync(path.join(AKAR, "public", "app", "Sidebar.tsx"), "utf8"),
  );

  test("a failure message outlives a success message", () => {
    const i = src.indexOf("const flash =");
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 320)).toMatch(/ok \? 2800 : 9000/);
  });

  test("the message box wraps instead of being clipped to one line", () => {
    const i = src.indexOf("msg.ok ?");
    expect(i).toBeGreaterThan(-1);
    const blok = src.slice(i - 200, i + 300);
    expect(blok).toMatch(/whiteSpace: "pre-wrap"/);
    expect(blok).not.toMatch(/textOverflow: "ellipsis"/);
  });

  test("the confirmation uses the HEAD the server reported", () => {
    const i = src.indexOf("/ww/branch/switch");
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 260)).toMatch(/r\.current/);
  });
});
