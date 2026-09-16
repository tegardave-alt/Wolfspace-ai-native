// The sync control, after VS Code's SyncStatusBar: one control that carries
// the state ("3↓ 1↑") and offers the next action, instead of a Fetch item
// whose effect nobody can see.
//
// WHAT WENT WRONG. Fetch ran `git fetch origin` and flashed "fetched origin".
// Nothing on the panel read what it had fetched -- no ahead/behind, no
// remote branches -- so before and after Fetch the panel looked the same.
// A button whose effect is invisible is a button that does nothing.
//
// THE REFERENCE, verbatim from extensions/git/src on microsoft/vscode main:
//   syncLabel   = `${behind}↓ ${ahead}↑`
//   syncTooltip = !ahead  ? 'Pull {n} commits from {remote}/{branch}'
//               : !behind ? 'Push {n} commits to {remote}/{branch}'
//               :           'Pull {b} and push {a} commits between …'
//   no upstream -> $(cloud-upload) 'Publish Branch' (git.publish = push -u)
//   git.sync    -> pull, then push only if ahead > 0
//
// Proven here against a real bare remote: publish sets the upstream; a
// local commit reads 1↑; a commit on the remote reads 1↓; sync brings both
// to 0 and pushes only when there was something to push.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
jest.setTimeout(90000);

const git = (cwd: string, a: string[]) =>
  execFileSync("git", a, { cwd, stdio: "pipe", encoding: "utf8" }).trim();

function muatHandler(): (url: string, b: any) => Promise<any> {
  const src = fs.readFileSync(path.join(AKAR, "server.ts"), "utf8");
  const a = src.indexOf("async function _gitVscode(");
  const m = /\r?\n\}\r?\n/.exec(src.slice(a));
  const berkas = path.join(os.tmpdir(), "gv-sync-" + process.pid + ".ts");
  fs.writeFileSync(
    berkas,
    src
      .slice(a, a + m!.index + m![0].length)
      .replace(
        'require("./core/git-vscode.ts")',
        "require(" +
          JSON.stringify(path.join(AKAR, "core", "git-vscode.ts")) +
          ")",
      )
      .replace(
        'require("./agent/github.ts")',
        "require(" +
          JSON.stringify(path.join(AKAR, "agent", "github.ts")) +
          ")",
      ) + "\nmodule.exports = _gitVscode;\n",
  );
  return require(berkas);
}

let tmp = "";
let repo = "";
let remote = "";
let lain = "";

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-sync-"));
  repo = path.join(tmp, "repo");
  remote = path.join(tmp, "remote.git");
  lain = path.join(tmp, "lain");
  git(tmp, ["init", "-q", "--bare", "-b", "main", remote]);
  fs.mkdirSync(repo);
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "user.email", "a@b.c"]);
  git(repo, ["config", "user.name", "uji"]);
  fs.writeFileSync(path.join(repo, "a.txt"), "1");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "awal"]);
  git(repo, ["remote", "add", "origin", remote]);
});

afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (_) {}
});

// "Someone else": a second clone that pushes to the same remote.
function orangLainCommit() {
  git(tmp, ["clone", "-q", remote, lain]);
  git(lain, ["config", "user.email", "x@y.z"]);
  git(lain, ["config", "user.name", "lain"]);
  fs.writeFileSync(path.join(lain, "dari-lain.txt"), "hi");
  git(lain, ["add", "."]);
  git(lain, ["commit", "-qm", "dari orang lain"]);
  git(lain, ["push", "-q", "origin", "main"]);
}

describe("status, after VS Code's numbers", () => {
  test("no upstream yet: publish is the offer", async () => {
    const h = muatHandler();
    const s = await h("/ww/remote/status", { path: repo });
    expect(s.ok).toBe(true);
    expect(s.head.name).toBe("main");
    expect(s.head.upstream).toBeNull();
    // And sync refuses with the reason rather than failing inside git.
    const r = await h("/ww/remote/sync", { path: repo });
    expect(r.ok).toBe(false);
    expect(r.kode).toBe("NoUpstream");
  });

  test("publish sets the upstream, then status reads 0↓ 0↑", async () => {
    const h = muatHandler();
    const p = await h("/ww/remote/publish", { path: repo });
    expect(p.ok).toBe(true);
    expect(git(repo, ["rev-parse", "--abbrev-ref", "main@{upstream}"])).toBe(
      "origin/main",
    );
    const s = await h("/ww/remote/status", { path: repo });
    expect(s.head.upstream).toEqual({ remote: "origin", name: "main" });
    expect([s.head.behind, s.head.ahead]).toEqual([0, 0]);
  });

  test("a local commit reads 1↑; a remote commit reads 1↓", async () => {
    const h = muatHandler();
    await h("/ww/remote/publish", { path: repo });
    fs.writeFileSync(path.join(repo, "b.txt"), "2");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-qm", "lokal"]);
    let s = await h("/ww/remote/status", { path: repo });
    expect([s.head.behind, s.head.ahead]).toEqual([0, 1]);

    orangLainCommit();
    // Numbers move only after a fetch -- which is the whole point of
    // running one in the background.
    await h("/ww/remote/fetch", { path: repo });
    s = await h("/ww/remote/status", { path: repo });
    expect([s.head.behind, s.head.ahead]).toEqual([1, 1]);
  });

  test("sync pulls, then pushes only because there was something to push", async () => {
    const h = muatHandler();
    await h("/ww/remote/publish", { path: repo });
    fs.writeFileSync(path.join(repo, "b.txt"), "2");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-qm", "lokal"]);
    orangLainCommit();
    await h("/ww/remote/fetch", { path: repo });
    const r = await h("/ww/remote/sync", { path: repo });
    expect(r.ok).toBe(true);
    expect(r.ditarik).toBe(1);
    expect(r.didorong).toBeGreaterThanOrEqual(1);
    // Both sides now hold both commits.
    expect(fs.existsSync(path.join(repo, "dari-lain.txt"))).toBe(true);
    expect(git(remote, ["log", "--format=%s", "main"])).toMatch(/lokal/);
    const s = await h("/ww/remote/status", { path: repo });
    expect([s.head.behind, s.head.ahead]).toEqual([0, 0]);
  });

  test("sync with nothing local to push does not push", async () => {
    const h = muatHandler();
    await h("/ww/remote/publish", { path: repo });
    orangLainCommit();
    await h("/ww/remote/fetch", { path: repo });
    const r = await h("/ww/remote/sync", { path: repo });
    expect(r.ok).toBe(true);
    expect(r.ditarik).toBe(1);
    expect(r.didorong).toBe(0);
  });
});
