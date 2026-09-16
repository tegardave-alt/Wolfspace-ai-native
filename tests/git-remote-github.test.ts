// A folder with no remote must be told so, and one click must fix it when a
// GitHub account is connected. Push must then authenticate with that account.
//
// WHAT WENT WRONG. Every remote test made a remote first, so the first state
// a user actually meets -- a project created in the editor, `git init` done,
// nothing pushed anywhere -- was never exercised. There, Fetch/Pull/Push
// failed with git's own text: "'origin' does not appear to be a git
// repository ... make sure you have the correct access rights". Wrong
// problem, and no way forward from the panel. The GitHub panel meanwhile
// held everything needed (a token and a linked repository) that the git
// panel never read.
//
// And with a remote, `git push` over HTTPS asked Git Credential Manager,
// which opens a GUI dialog a server process cannot show -- measured with
// GIT_TRACE: `git credential-manager get` ran and the push sat until killed.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));

// Every test here spawns git several times, and the first spawn also has to
// locate git.exe. Measured at 2-9 s on this machine; the 5 s default is not
// a statement about correctness, so it is raised rather than gamed.
jest.setTimeout(60000);

const git = (cwd: string, a: string[]) =>
  execFileSync("git", a, { cwd, stdio: "pipe", encoding: "utf8" }).trim();

// The server handler, lifted out of server.ts. It is not exported (nothing
// else needs it), and a copy typed into the test would prove the copy.
function muatHandler(): (url: string, b: any) => Promise<any> {
  const src = fs.readFileSync(path.join(AKAR, "server.ts"), "utf8");
  const a = src.indexOf("async function _gitVscode(");
  expect(a).toBeGreaterThan(-1);
  const m = /\r?\n\}\r?\n/.exec(src.slice(a));
  const b = a + m!.index + m![0].length;
  const berkas = path.join(os.tmpdir(), "gitvscode-uji-" + process.pid + ".ts");
  fs.writeFileSync(
    berkas,
    src
      .slice(a, b)
      .replace(
        'require("./core/git-vscode.ts")',
        "require(" +
          JSON.stringify(path.join(AKAR, "core", "git-vscode.ts")) +
          ")",
      )
      .replace(
        'require("./core/git-remote.ts")',
        "require(" +
          JSON.stringify(path.join(AKAR, "core", "git-remote.ts")) +
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

let keys = "";
let dir = "";

beforeAll(() => {
  // A throwaway GitHub store: the real keys are never read or written.
  keys = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-gh-keys-"));
  process.env.WOLFSPACE_KEYS_DIR = keys;
});

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-remote-"));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "a@b.c"]);
  git(dir, ["config", "user.name", "uji"]);
  fs.writeFileSync(path.join(dir, "a.txt"), "1");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-qm", "awal"]);
});

afterEach(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
});

afterAll(() => {
  try {
    fs.rmSync(keys, { recursive: true, force: true });
  } catch (_) {}
});

describe("a folder without a remote", () => {
  test("says so, in its own words, before git is asked", async () => {
    const h = muatHandler();
    for (const url of [
      "/ww/remote/push",
      "/ww/remote/pull",
      "/ww/remote/fetch",
    ]) {
      const r = await h(url, { path: dir, branch: "main" });
      expect(r.ok).toBe(false);
      expect(r.kode).toBe("NoRemote");
      // Not git's text: no "access rights", which is the wrong diagnosis.
      expect(r.err).toMatch(/no remote "origin" yet/);
      expect(r.err).not.toMatch(/access rights/);
    }
  });

  test("/ww/remotes reports none, then the one that was added", async () => {
    const h = muatHandler();
    expect((await h("/ww/remotes", { path: dir })).remotes).toEqual([]);
    const add = await h("/ww/remote/add", {
      path: dir,
      url: "https://example.com/x/y.git",
    });
    expect(add.ok).toBe(true);
    const r = await h("/ww/remotes", { path: dir });
    expect(r.remotes.map((x: any) => x.name)).toEqual(["origin"]);
    expect(git(dir, ["remote", "get-url", "origin"])).toBe(
      "https://example.com/x/y.git",
    );
  });

  test("connect-to-GitHub builds the URL from the linked repository", async () => {
    fs.writeFileSync(
      path.join(keys, "github.json"),
      JSON.stringify({
        token: "gho_uji",
        taut: { owner: "dave", repo: "proyek", branch: "main" },
      }),
    );
    const h = muatHandler();
    const r = await h("/ww/remote/add", { path: dir, github: true });
    expect(r.ok).toBe(true);
    expect(r.url).toBe("https://github.com/dave/proyek.git");
    expect(git(dir, ["remote", "get-url", "origin"])).toBe(
      "https://github.com/dave/proyek.git",
    );
    // The guard now lets network operations through: no test reaches the
    // real github.com, so this is checked on the state the guard reads.
    const r2 = await h("/ww/remotes", { path: dir });
    expect(r2.remotes.map((x: any) => x.name)).toEqual(["origin"]);
  });

  test("connect-to-GitHub without a link says what to do", async () => {
    fs.writeFileSync(
      path.join(keys, "github.json"),
      JSON.stringify({ token: "gho_uji" }),
    );
    const h = muatHandler();
    const r = await h("/ww/remote/add", { path: dir, github: true });
    expect(r.ok).toBe(false);
    expect(r.kode).toBe("NoGithubLink");
  });

  test("a second add is refused, not silently replaced", async () => {
    const h = muatHandler();
    await h("/ww/remote/add", { path: dir, url: "https://example.com/a.git" });
    const r = await h("/ww/remote/add", {
      path: dir,
      url: "https://example.com/b.git",
    });
    expect(r.ok).toBe(false);
    expect(r.kode).toBe("RemoteExists");
    expect(git(dir, ["remote", "get-url", "origin"])).toBe(
      "https://example.com/a.git",
    );
  });

  test("garbage is not a remote URL", async () => {
    const h = muatHandler();
    const r = await h("/ww/remote/add", { path: dir, url: "dave/proyek" });
    expect(r.ok).toBe(false);
    expect(git(dir, ["remote"])).toBe("");
  });
});

describe("git authenticates with the connected account", () => {
  // `git credential fill` runs the SAME helper chain push/pull/fetch use and
  // prints what it resolved -- the real mechanism, without a network.
  const fill = async (host: string, batas = 15000) => {
    const gv = require(path.join(AKAR, "core", "git-vscode.ts"));
    const env = { ...process.env, ...(await gv._envUntukUji()) };
    return execFileSync("git", ["credential", "fill"], {
      env,
      input: "protocol=https\nhost=" + host + "\n\n",
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: batas,
    }).trim();
  };

  test("our helper runs FIRST, and the machine's own helpers stay behind it", async () => {
    const gv = require(path.join(AKAR, "core", "git-vscode.ts"));
    const env = await gv._envUntukUji();
    const n = Number(env.GIT_CONFIG_COUNT);
    expect(n).toBeGreaterThanOrEqual(2);
    // "" resets the list; ours is the first real entry.
    expect(env.GIT_CONFIG_KEY_0).toBe("credential.helper");
    expect(env.GIT_CONFIG_VALUE_0).toBe("");
    expect(env.GIT_CONFIG_VALUE_1).toMatch(/WOLFSPACE_ASKPASS_MAIN/);
    // Anything the machine had configured is re-added after ours, in order.
    let sistem: string[] = [];
    try {
      sistem = git(AKAR, ["config", "--get-all", "credential.helper"])
        .split(/\r?\n/)
        .filter(Boolean);
    } catch (_) {}
    const sesudah = [];
    for (let i = 2; i < n; i++) sesudah.push(env["GIT_CONFIG_VALUE_" + i]);
    expect(sesudah).toEqual(sistem);
    // And a prompt with nobody to answer it must fail, not wait.
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(env.GIT_ASKPASS).toMatch(/git-askpass\.sh$/);
  });

  test("github.com resolves to the app's token", async () => {
    fs.writeFileSync(
      path.join(keys, "github.json"),
      JSON.stringify({ token: "gho_uji_token", akun: { login: "dave" } }),
    );
    const out = await fill("github.com");
    expect(out).toMatch(/^username=dave$/m);
    expect(out).toMatch(/^password=gho_uji_token$/m);
  });

  test("the helper answers github.com only", () => {
    // Called directly: with the token in place, another host gets nothing
    // from us, so the token can never be handed to a server that is not
    // GitHub.
    fs.writeFileSync(
      path.join(keys, "github.json"),
      JSON.stringify({ token: "gho_uji_token", akun: { login: "dave" } }),
    );
    const jalan = (host: string) =>
      execFileSync(
        process.execPath,
        [path.join(AKAR, "scripts", "git-askpass.cjs"), "get"],
        {
          env: {
            ...process.env,
            WOLFSPACE_GH_STORE: path.join(keys, "github.json"),
          },
          input: "protocol=https\nhost=" + host + "\n\n",
          encoding: "utf8",
        },
      );
    expect(jalan("github.com")).toMatch(/password=gho_uji_token/);
    expect(jalan("gitlab.com")).toBe("");
    expect(jalan("evil-github.com")).toBe("");
    expect(jalan("github.com.evil.example")).toBe("");
  });

  test("the token is never placed in the environment itself", async () => {
    fs.writeFileSync(
      path.join(keys, "github.json"),
      JSON.stringify({ token: "gho_rahasia" }),
    );
    const gv = require(path.join(AKAR, "core", "git-vscode.ts"));
    const env = await gv._envUntukUji();
    expect(JSON.stringify(env)).not.toMatch(/gho_rahasia/);
    // Only the store's path travels; the script reads it when git asks.
    expect(env.WOLFSPACE_GH_STORE).toBe(path.join(keys, "github.json"));
  });
});

describe("the panel and the agent know", () => {
  const SB = fs.readFileSync(
    path.join(AKAR, "public", "app", "Sidebar.tsx"),
    "utf8",
  );

  test("Fetch/Pull/Push are disabled without a remote, with the reason", () => {
    expect(SB).toMatch(/disabled=\{busy \|\| !adaOrigin\}/);
    expect(SB).toMatch(
      /No remote yet - connect this folder to a repository first/,
    );
  });

  test("the fix is offered in the same menu", () => {
    expect(SB).toMatch(/remotes !== null && !adaOrigin &&/);
    expect(SB).toMatch(
      /"Connect to " \+ github\.taut\.owner \+ "\/" \+ github\.taut\.repo/,
    );
    expect(SB).toMatch(/\{ path, github: true \}/);
    // And a manual URL when nothing is linked, cancelled by Escape or empty.
    expect(SB).toMatch(/"Add remote…"/);
    expect(SB).toMatch(/if \(!u\) return; \/\/ cancel/);
  });

  test("the shell wrapper is LF, and git is told to keep it that way", () => {
    // sh treats a trailing CR as part of the command: the wrapper would fail
    // with ": command not found" and every push would lose its fallback. The
    // working copy on this Windows machine came out CRLF once; the rule in
    // .gitattributes is what stops that on every future checkout.
    const sh = fs.readFileSync(
      path.join(AKAR, "scripts", "git-askpass.sh"),
      "utf8",
    );
    expect(sh).not.toMatch(/\r/);
    const attrs = fs.readFileSync(path.join(AKAR, ".gitattributes"), "utf8");
    expect(attrs).toMatch(/^\*\.sh\s+text\s+eol=lf/m);
  });

  test("the installer ships both askpass files OUTSIDE the asar", () => {
    // git is an external process: it cannot open a file inside app.asar. The
    // scripts must be in build.files (the allowlist -- electron-builder does
    // not read .gitignore) AND in asarUnpack, or push works in dev only.
    const b = require(path.join(AKAR, "package.json")).build;
    for (const f of ["scripts/git-askpass.sh", "scripts/git-askpass.cjs"]) {
      expect(b.files).toContain(f);
      expect(b.asarUnpack).toContain(f);
    }
  });

  test("the agent is told it has git, and where push lives", () => {
    const t = require(path.join(AKAR, "config", "prompts.json")).prompts
      .self_agent.text;
    expect(t).toMatch(/Version control: .* `git` tool/);
    // The network side is the agent's now -- only when asked, and never
    // without the user's approval (tests/agent-git-jaringan.test.ts proves
    // the hold). The prompt must say both halves.
    expect(t).toMatch(/network side when the user ASKS for it/);
    expect(t).toMatch(/pauses for the user's approval before it runs/);
    expect(t).toMatch(/Never run git through bash/);
  });
});
