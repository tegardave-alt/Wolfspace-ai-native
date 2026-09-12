// ── The git panel's remote buttons are ONE segmented control, not four pills ──
//
// Asked for with a screenshot: Fetch, Pull, Push and Stashes sat in a row as
// four separate outlined pills, each wearing `vp-hover` -- the VISUAL PICKER's
// hover outline, borrowed for its look. The picker paints every git button
// blue while it is on and strips the class when it is switched off, so the
// buttons lost their edge after the first use of the picker.
//
// Now: one pill with three teeth (Fetch | Pull | Push), a Stashes toggle that
// carries the count once the list is loaded, and Pop | Drop as a two-tooth
// pill on every stash row. The tooth that is working keeps its own label
// ("Pushing…") while its neighbours go quiet.
//
// Part 1 reads the source. Part 2 renders the panel in a real browser against
// a throwaway repository with a bare remote next to it, so fetch, push and pop
// are real git with no network.

const fs = require("fs");
const os = require("os");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const read = (p: string) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");
const SB = read("public/app/Sidebar.tsx");
const CSS = read("public/styles.css");
const stripComments = (t: string) =>
  t
    .split("\n")
    .filter((b) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(b))
    .join("\n");
const SBC = stripComments(SB);

// The remote block, from its heading to the last-commit line under it.
const remoteBlock = () => {
  const a = SB.indexOf("── Remote ──");
  const b = SB.indexOf("{g.lastCommit && (", a);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return SB.slice(a, b);
};

describe("SegmentedButtons: one pill, several teeth", () => {
  test("the component exists and every tooth is a real button", () => {
    const m = SBC.match(
      /function SegmentedButtons\(\{[^}]*\}: any\) \{[\s\S]*?\n\}/,
    );
    expect(m).not.toBeNull();
    const src = m![0];
    expect(src).toMatch(/role="group"/);
    expect(src).toMatch(/<button/);
    expect(src).toMatch(/type="button"/);
    expect(src).toMatch(/"btn-reset seg-btn"/);
    expect(src).toMatch(/disabled=\{!!busy \|\| !!it\.disabled\}/);
    // The running tooth swaps its label; the others keep theirs.
    expect(src).toMatch(
      /it\.running \? it\.runningLabel \|\| it\.label : it\.label/,
    );
    // A badge only when there is a number to show.
    expect(src).toMatch(/it\.badge !== undefined && it\.badge !== null/);
    expect(src).toMatch(/className="seg-badge"/);
  });

  test("Fetch | Pull | Push are the three teeth, in that order", () => {
    const blk = stripComments(remoteBlock());
    const keys = [...blk.matchAll(/key: "(\w+)"/g)].map((x) => x[1]);
    expect(keys).toEqual(["fetch", "pull", "push"]);
    expect(blk).toMatch(/runningLabel: "Fetching…"/);
    expect(blk).toMatch(/runningLabel: "Pulling…"/);
    expect(blk).toMatch(/runningLabel: "Pushing…"/);
    expect(blk).toMatch(/url: "\/ww\/remote\/fetch"/);
    expect(blk).toMatch(/url: "\/ww\/remote\/pull"/);
    expect(blk).toMatch(/url: "\/ww\/remote\/push"/);
    // The first push of a new branch must not fail asking for --set-upstream.
    expect(blk).toMatch(/body: \{ branch: br\.current, setUpstream: true \}/);
    expect(blk).toMatch(/running: remoteOp === op\.key/);
    expect(blk).toMatch(/onClick: \(\) => runRemote\(op\)/);
  });

  test("the pressed tooth is remembered only while it works", () => {
    const m = SBC.match(
      /const runRemote = async \(op: any\) => \{[\s\S]*?\n  \};/,
    );
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/setRemoteOp\(op\.key\);/);
    expect(m![0]).toMatch(/finally \{\s*setRemoteOp\(""\);\s*\}/);
  });

  test("Stashes is a toggle that carries the count once loaded", () => {
    const blk = stripComments(remoteBlock());
    expect(blk).toMatch(/label: "Stashes"/);
    expect(blk).toMatch(/active: stashes !== null/);
    expect(blk).toMatch(
      /badge: stashes === null \? undefined : stashes\.length/,
    );
    expect(blk).toMatch(
      /stashes === null \? muatStash\(\) : setStashes\(null\)/,
    );
  });

  test("Pop | Drop is a two-tooth pill, and Drop still asks first", () => {
    const a = SB.indexOf("── Stash list ──");
    const b = SB.indexOf("{g.lastCommit && (", a);
    const blk = stripComments(SB.slice(a, b));
    expect(blk).toMatch(/<SegmentedButtons/);
    expect(blk).toMatch(/label: "Pop"/);
    expect(blk).toMatch(/label: "Drop",\s*title: [^\n]*\n\s*danger: true/);
    expect(blk).toMatch(/window\.confirm\(/);
    expect(blk).toMatch(/"\/ww\/stash\/pop"/);
    expect(blk).toMatch(/"\/ww\/stash\/drop"/);
  });

  test("the picker's hover class is gone from the remote and stash buttons", () => {
    const a = SB.indexOf("── Remote ──");
    const b = SB.indexOf("{g.lastCommit && (", a);
    expect(SB.slice(a, b)).not.toMatch(/vp-hover/);
  });

  test("an open stash list is refreshed after a branch switch", () => {
    const m = SBC.match(
      /const doSwitch = async[\s\S]*?setHalangan\(null\);[\s\S]*?\},\n\s*\);/,
    );
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/if \(stashes !== null\) muatStash\(\);/);
  });

  test("the CSS draws one edge, dividers between teeth, and states", () => {
    const rule = (sel: string) => {
      const m = CSS.match(
        new RegExp(
          "\\n" + sel.replace(/[.+:()*]/g, (c) => "\\" + c) + " \\{([^}]*)\\}",
        ),
      );
      expect(m).not.toBeNull();
      return m![1];
    };
    expect(rule(".seg-group")).toMatch(/height: 20px/);
    expect(rule(".seg-group")).toMatch(
      /border: 1px solid var\(--line-strong\)/,
    );
    expect(rule(".seg-group")).toMatch(/overflow: hidden/);
    expect(rule(".seg-btn")).toMatch(/font-size: 11px/);
    // The divider belongs to the tooth on the right: teeth minus one dividers.
    expect(rule(".seg-btn + .seg-btn")).toMatch(/border-left: 1px solid/);
    // The pill clips its overflow, so keyboard focus must draw inside it.
    expect(rule(".seg-btn:focus-visible")).toMatch(/outline-offset: -2px/);
    expect(rule(".seg-btn:disabled")).toMatch(/cursor: not-allowed/);
    expect(CSS).toMatch(
      /\.seg-btn\.seg-running,\n\.seg-btn\.seg-running:disabled \{[^}]*cursor: progress/,
    );
    expect(rule(".seg-btn.seg-active")).toMatch(/var\(--text\)/);
    expect(rule(".seg-btn.seg-danger:hover:not(:disabled)")).toMatch(
      /var\(--danger\)/,
    );
    expect(rule(".seg-badge")).toMatch(/tabular-nums/);
    // Every colour is a token, so the light theme gets the same control.
    for (const sel of [
      ".seg-group",
      ".seg-btn",
      ".seg-btn.seg-active",
      ".seg-badge",
    ]) {
      expect(rule(sel)).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i);
    }
  });
});

// ── Part 2: the real thing, in a browser ──
const { punyaBrowser, describeKalau } = require("./butuh.cjs");
const whenPossible = describeKalau(punyaBrowser());

whenPossible(
  "the segmented git buttons, rendered and pressed (needs playwright)",
  () => {
    const { spawn, execFileSync } = require("child_process");
    const http = require("http");
    const PORT = 8139;
    let server: any;
    let TMP: string;
    let REPO: string;
    let REMOTE: string;
    const git = (args: string[], cwd?: string) =>
      execFileSync("git", args, { cwd: cwd || REPO, stdio: "pipe" })
        .toString()
        .trim();

    beforeAll(async () => {
      TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-seg-"));
      REPO = path.join(TMP, "segrepo");
      REMOTE = path.join(TMP, "segremote.git");
      fs.mkdirSync(REPO);
      git(["init", "--bare", "-b", "main", REMOTE], TMP);
      git(["init", "-b", "main"]);
      git(["config", "user.email", "seg@test"]);
      git(["config", "user.name", "seg"]);
      fs.writeFileSync(path.join(REPO, "README.md"), "hello\n");
      git(["add", "."]);
      git(["commit", "-m", "chore: initialize workspace"]);
      git(["remote", "add", "origin", REMOTE]);
      git(["push", "-u", "origin", "main"]);
      // A second commit that is NOT on the remote yet, so Push has work to do.
      fs.writeFileSync(path.join(REPO, "second.txt"), "two\n");
      git(["add", "."]);
      git(["commit", "-m", "feat: second"]);
      // One stash, so the list has a row with Pop | Drop.
      fs.writeFileSync(path.join(REPO, "wip.txt"), "wip\n");
      git(["stash", "push", "-u", "-m", "work in progress"]);

      server = spawn(process.execPath, [path.join(AKAR, "server.cjs")], {
        cwd: AKAR,
        env: { ...process.env, PORT: String(PORT) },
        stdio: "ignore",
        windowsHide: true,
      });
      for (let i = 0; i < 60; i++) {
        const alive = await new Promise((ok) => {
          const r = http.get(
            { host: "127.0.0.1", port: PORT, path: "/healthz", timeout: 1000 },
            (res: any) => {
              res.resume();
              ok(res.statusCode === 200);
            },
          );
          r.on("error", () => ok(false));
          r.on("timeout", () => {
            r.destroy();
            ok(false);
          });
        });
        if (alive) return;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error("server never became ready on port " + PORT);
    }, 60000);

    afterAll(() => {
      try {
        server && server.kill();
      } catch (_) {}
      try {
        fs.rmSync(TMP, { recursive: true, force: true });
      } catch (_) {}
    });

    test("three teeth, one edge; Stashes counts; Fetch shows which tooth works; Push and Pop are real", async () => {
      const { chromium } = require("playwright");
      const b = await chromium.launch();
      try {
        const ctx = await b.newContext({
          viewport: { width: 1280, height: 800 },
        });
        // The workspace list lives in localStorage; attach the fixture
        // before the page loads.
        await ctx.addInitScript(
          (win: string) => {
            localStorage.setItem(
              "wolfspace_projects_list",
              JSON.stringify([{ name: "segrepo", path: win }]),
            );
            localStorage.setItem("wolfspace_migrated", "1");
          },
          REPO.replace(/\//g, "\\"),
        );
        const p = await ctx.newPage();
        const errors: string[] = [];
        p.on("pageerror", (e: any) => errors.push("PAGEERROR " + e.message));
        p.on("console", (m: any) => {
          if (m.type() === "error") errors.push(m.text().slice(0, 200));
        });
        // Fetch against a local bare remote finishes in milliseconds -- too
        // fast to be SEEN. Hold its reply so the running state is observable.
        await p.route("**/ww/remote/fetch", async (route: any) => {
          await new Promise((r) => setTimeout(r, 700));
          await route.continue();
        });
        await p.goto("http://127.0.0.1:" + PORT + "/", {
          waitUntil: "networkidle",
          timeout: 60000,
        });
        await p.waitForTimeout(800);
        // The welcome picker is a fixed overlay over the whole app; the
        // sidebar under it is what this test is about.
        await p.addStyleTag({
          content: ".project-picker-screen{display:none !important}",
        });
        await p.click('[title="Folder options"]');
        await p.waitForSelector(".seg-group", { timeout: 15000 });
        await p.waitForTimeout(500);

        const measure = () =>
          p.evaluate(() =>
            [...document.querySelectorAll(".seg-group")].map((g: any) => ({
              h: Math.round(g.getBoundingClientRect().height),
              teeth: [...g.querySelectorAll(".seg-btn")].map((t: any) => ({
                text: t.textContent,
                disabled: t.disabled,
                running: t.classList.contains("seg-running"),
                active: t.classList.contains("seg-active"),
                divider: getComputedStyle(t).borderLeftWidth,
              })),
            })),
          );

        // Idle: Fetch | Pull | Push, then the Stashes toggle with no count.
        let g: any = await measure();
        expect(g.length).toBe(2);
        expect(g[0].teeth.map((t: any) => t.text)).toEqual([
          "Fetch",
          "Pull",
          "Push",
        ]);
        expect(g[0].h).toBe(20);
        expect(g[0].teeth.map((t: any) => t.divider)).toEqual([
          "0px",
          "1px",
          "1px",
        ]);
        expect(g[1].teeth.map((t: any) => t.text)).toEqual(["Stashes"]);

        // Stashes: the toggle lights up, carries the count, and the row
        // has Pop | Drop.
        await p.click(".seg-btn:has-text('Stashes')");
        await p.waitForSelector(".seg-btn.seg-active", { timeout: 15000 });
        g = await measure();
        expect(g[1].teeth[0].text).toBe("Stashes1");
        expect(g[1].teeth[0].active).toBe(true);
        expect(g[2].teeth.map((t: any) => t.text)).toEqual(["Pop", "Drop"]);

        // Fetch: the pressed tooth says so; its neighbours only go quiet.
        await p.click(".seg-btn:has-text('Fetch')");
        await p.waitForSelector(".seg-running", { timeout: 5000 });
        g = await measure();
        expect(g[0].teeth[0]).toMatchObject({
          text: "Fetching…",
          running: true,
          disabled: true,
        });
        expect(g[0].teeth[1]).toMatchObject({
          text: "Pull",
          running: false,
          disabled: true,
        });
        expect(g[0].teeth[2]).toMatchObject({
          text: "Push",
          running: false,
          disabled: true,
        });
        await p.waitForFunction(
          () => !document.querySelector(".seg-running"),
          null,
          { timeout: 60000 },
        );
        await p.waitForSelector("text=fetched origin", { timeout: 5000 });

        // Push: the remote really receives the commit.
        const before = git(["rev-parse", "main"], REMOTE);
        await p.click(".seg-btn:has-text('Push')");
        await p.waitForSelector("text=pushed main to origin", {
          timeout: 60000,
        });
        const after = git(["rev-parse", "main"], REMOTE);
        expect(after).not.toBe(before);
        expect(after).toBe(git(["rev-parse", "main"]));

        // Pop: the work comes back, the list empties, the toggle says 0.
        expect(fs.existsSync(path.join(REPO, "wip.txt"))).toBe(false);
        await p.click(".seg-btn:has-text('Pop')");
        await p.waitForSelector("text=stash applied", { timeout: 60000 });
        await p.waitForSelector("text=no stashes", { timeout: 15000 });
        expect(fs.existsSync(path.join(REPO, "wip.txt"))).toBe(true);
        g = await measure();
        expect(g[1].teeth[0].text).toBe("Stashes0");

        expect(errors).toEqual([]);
      } finally {
        await b.close();
      }
    }, 180000);
  },
);
