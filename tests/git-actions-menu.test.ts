// ── The git panel's remote actions live behind ONE horizontal ⋯ button ──
//
// Asked for with two screenshots. The first showed Fetch, Pull, Push and
// Stashes as four separate outlined pills in a row; the second pointed at the
// top bar's vertical panel-menu handle (⋮) and asked for "the same, but
// horizontal", at the right end of the row. So: the commit line keeps the
// row, a three-dot button (⋯) sits at its right end, and the four actions are
// the items of its menu. While an action runs, the commit line says which
// ("Pushing…"), because the panel goes inert meanwhile.
//
// The pills wore `vp-hover` -- the VISUAL PICKER's hover outline, borrowed
// for its look. The picker paints every such element blue while it is on and
// strips the class when switched off, so the buttons lost their edge after the
// first use of the picker. Nothing here touches that class.
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

// The row: from its heading to the stash list under it.
const actionsRow = () => {
  const a = SB.indexOf("── Commit line + actions menu ──");
  const b = SB.indexOf("── Stash list ──", a);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return SB.slice(a, b);
};

const cssRule = (sel: string) => {
  const m = CSS.match(
    new RegExp(
      "\\n" + sel.replace(/[.+:()*]/g, (c) => "\\" + c) + " \\{([^}]*)\\}",
    ),
  );
  expect(m).not.toBeNull();
  return m![1];
};

describe("the ⋯ button is the horizontal twin of the ⋮ panel-menu handle", () => {
  test("three dots of the same radius, laid out along x instead of y", () => {
    const m = SBC.match(/function DotsMenuButton\([\s\S]*?\n\}/);
    expect(m).not.toBeNull();
    const src = m![0];
    // The vertical original in app.tsx: viewBox 0 0 10 20, cy 4/10/16, r 1.6.
    expect(src).toMatch(/viewBox="0 0 20 10"/);
    const cx = [...src.matchAll(/cx="(\d+)" cy="5" r="1\.6"/g)].map((x) =>
      Number(x[1]),
    );
    expect(cx).toEqual([4, 10, 16]);
    // A real button with menu semantics, and it does not borrow the picker's class.
    expect(src).toMatch(/<button/);
    expect(src).toMatch(/aria-haspopup="menu"/);
    expect(src).toMatch(/aria-expanded=\{!!open\}/);
    expect(src).not.toMatch(/vp-hover/);
    // Its own mousedown must not count as a click outside the menu.
    expect(src).toMatch(/onMouseDown=\{\(e: any\) => e\.stopPropagation\(\)\}/);
  });

  test("it sits at the right end of the commit line, 28×18", () => {
    const row = stripComments(actionsRow());
    // The line first (flex: 1), then the button.
    const line = row.indexOf("flex: 1");
    const btn = row.indexOf("<DotsMenuButton");
    expect(line).toBeGreaterThan(-1);
    expect(btn).toBeGreaterThan(line);
    expect(row).toMatch(/title="Git actions"/);
    expect(cssRule(".dots-btn")).toMatch(/width: 28px/);
    expect(cssRule(".dots-btn")).toMatch(/height: 18px/);
    expect(cssRule(".dots-menu")).toMatch(/right: 0/);
    expect(cssRule(".dots-menu")).toMatch(/top: calc\(100% \+ 4px\)/);
  });
});

describe("the menu holds the list from the screenshot", () => {
  test("Fetch, Pull, Push, then the stash toggle, in that order", () => {
    const m = SBC.match(/function remoteOps\([\s\S]*?\n\}/);
    expect(m).not.toBeNull();
    const ops = m![0];
    const keys = [...ops.matchAll(/key: "(\w+)"/g)].map((x) => x[1]);
    expect(keys).toEqual(["fetch", "pull", "push"]);
    expect(ops).toMatch(/runningLabel: "Fetching…"/);
    expect(ops).toMatch(/runningLabel: "Pulling…"/);
    expect(ops).toMatch(/runningLabel: "Pushing…"/);
    expect(ops).toMatch(/url: "\/ww\/remote\/fetch"/);
    expect(ops).toMatch(/url: "\/ww\/remote\/pull"/);
    expect(ops).toMatch(/url: "\/ww\/remote\/push"/);
    // The first push of a new branch must not fail asking for --set-upstream.
    expect(ops).toMatch(/body: \{ branch: current, setUpstream: true \}/);

    const row = stripComments(actionsRow());
    expect(row).toMatch(/role="menu"/);
    expect(row).toMatch(/remoteOps\(br\.current\)\.map/);
    expect(row).toMatch(/role="menuitem"/);
    const sep = row.indexOf('className="dots-sep"');
    const stash = row.indexOf('"Show stashes" : "Hide stashes"');
    expect(sep).toBeGreaterThan(row.indexOf("remoteOps(br.current)"));
    expect(stash).toBeGreaterThan(sep);
    // The count rides on the item once the list is loaded.
    expect(row).toMatch(
      /stashes !== null && \(\s*<span className="seg-badge">\{stashes\.length\}<\/span>/,
    );
    expect(row).toMatch(
      /if \(stashes === null\) muatStash\(\);\s*else setStashes\(null\);/,
    );
  });

  test("choosing an item closes the menu and runs it; the line says which", () => {
    const row = stripComments(actionsRow());
    expect(row).toMatch(/setMenuOpen\(false\);\s*runRemote\(op\);/);
    expect(row).toMatch(/remoteOp\s*\?\s*remoteOp\.runningLabel/);
    const m = SBC.match(
      /const runRemote = async \(op: any\) => \{[\s\S]*?\n  \};/,
    );
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/setRemoteOp\(op\);/);
    // In a finally: a push that FAILS must clear the label too.
    expect(m![0]).toMatch(/finally \{\s*setRemoteOp\(null\);\s*\}/);
  });

  test("a mousedown outside or Escape closes it; inside does not", () => {
    const m = SBC.match(
      /React\.useEffect\(\(\) => \{\s*if \(!menuOpen\) return;[\s\S]*?\}, \[menuOpen\]\);/,
    );
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/document\.addEventListener\("mousedown", close\)/);
    expect(m![0]).toMatch(/e\.key === "Escape"/);
    expect(m![0]).toMatch(/removeEventListener\("mousedown", close\)/);
    const row = stripComments(actionsRow());
    expect(row).toMatch(
      /className="dots-menu"\s*role="menu"\s*onMouseDown=\{\(e: any\) => e\.stopPropagation\(\)\}/,
    );
  });

  test("the picker's hover class is gone from the row and the stash list", () => {
    const a = SB.indexOf("── Commit line + actions menu ──");
    const b = SB.indexOf("{msg && (", a);
    expect(b).toBeGreaterThan(a);
    expect(SB.slice(a, b)).not.toMatch(/vp-hover/);
  });

  test("an open stash list is refreshed after a branch switch", () => {
    const m = SBC.match(
      /const doSwitch = async[\s\S]*?setHalangan\(null\);[\s\S]*?\},\n\s*\);/,
    );
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/if \(stashes !== null\) muatStash\(\);/);
  });
});

describe("Pop | Drop stays a two-tooth pill on each stash row", () => {
  test("one edge, a divider between the teeth, Drop asks first", () => {
    const a = SB.indexOf("── Stash list ──");
    const b = SB.indexOf("{msg && (", a);
    const blk = stripComments(SB.slice(a, b));
    expect(blk).toMatch(/<SegmentedButtons/);
    expect(blk).toMatch(/label: "Pop"/);
    expect(blk).toMatch(/label: "Drop",\s*title: [^\n]*\n\s*danger: true/);
    expect(blk).toMatch(/window\.confirm\(/);
    expect(cssRule(".seg-group")).toMatch(/height: 20px/);
    expect(cssRule(".seg-group")).toMatch(/overflow: hidden/);
    expect(cssRule(".seg-btn + .seg-btn")).toMatch(/border-left: 1px solid/);
    // The pill clips its overflow, so keyboard focus must draw inside it.
    expect(cssRule(".seg-btn:focus-visible")).toMatch(/outline-offset: -2px/);
    expect(cssRule(".seg-btn.seg-danger:hover:not(:disabled)")).toMatch(
      /#f85149/,
    );
  });

  test("the panel's own palette, because its popover stays dark in the light theme", () => {
    // The folder popover is painted inline (#161b22 / #30363d) and no theme
    // touches it; a token-coloured control would turn light inside it.
    expect(SB).toMatch(/background: "#161b22",\s*border: "1px solid #30363d"/);
    for (const sel of [".seg-group", ".dots-menu", ".dots-sep"]) {
      expect(cssRule(sel)).toMatch(/#30363d/);
      expect(cssRule(sel)).not.toMatch(/var\(--/);
    }
  });
});

// ── Part 2: the real thing, in a browser ──
const { punyaBrowser, describeKalau } = require("./butuh.cjs");
const whenPossible = describeKalau(punyaBrowser());

whenPossible("the ⋯ menu, rendered and used (needs playwright)", () => {
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
    TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-dots-"));
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

  test("opens, closes, lists the four actions; Fetch names itself on the line; Push and Pop are real", async () => {
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
      // fast to be SEEN. Hold its reply so the running label is observable.
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
      await p.waitForSelector(".dots-btn", { timeout: 15000 });
      await p.waitForTimeout(500);

      const line = () =>
        p.evaluate(
          () =>
            document.querySelector(".dots-btn")!.previousElementSibling!
              .textContent,
        );
      const items = () =>
        p.$$eval(".dots-item", (els: any[]) => els.map((e) => e.textContent));
      const menuOpen = async () => !!(await p.$(".dots-menu"));

      // The button: 28×18, at the right end of the commit line.
      const btn = (await p.locator(".dots-btn").boundingBox())!;
      expect([Math.round(btn.width), Math.round(btn.height)]).toEqual([28, 18]);
      const ln = (await p
        .locator('[title="Git actions"] >> xpath=preceding-sibling::span[1]')
        .boundingBox())!;
      expect(btn.x).toBeGreaterThan(ln.x + ln.width - 1);
      expect(await line()).toMatch(/^[0-9a-f]{7} · feat: second · /);

      // Open: the four items, in order.
      await p.click(".dots-btn");
      await p.waitForSelector(".dots-menu", { timeout: 5000 });
      expect(await items()).toEqual(["Fetch", "Pull", "Push", "Show stashes"]);
      // A mousedown elsewhere in the panel closes it.
      await p.click(
        '[title="Git actions"] >> xpath=preceding-sibling::span[1]',
      );
      await p.waitForTimeout(150);
      expect(await menuOpen()).toBe(false);
      // So does Escape.
      await p.click(".dots-btn");
      await p.waitForSelector(".dots-menu");
      await p.keyboard.press("Escape");
      await p.waitForTimeout(150);
      expect(await menuOpen()).toBe(false);

      // Fetch: the menu closes and the line names the action while it runs.
      await p.click(".dots-btn");
      await p.waitForSelector(".dots-menu");
      await p.click(".dots-item:has-text('Fetch')");
      await p.waitForFunction(
        () =>
          document.querySelector(".dots-btn")!.previousElementSibling!
            .textContent === "Fetching…",
        null,
        { timeout: 5000 },
      );
      expect(await menuOpen()).toBe(false);
      await p.waitForSelector("text=fetched origin", { timeout: 15000 });
      expect(await line()).toMatch(/^[0-9a-f]{7} · feat: second · /);

      // Push: the remote really receives the commit.
      const before = git(["rev-parse", "main"], REMOTE);
      await p.click(".dots-btn");
      await p.waitForSelector(".dots-menu");
      await p.click(".dots-item:has-text('Push')");
      await p.waitForSelector("text=pushed main to origin", {
        timeout: 60000,
      });
      const after = git(["rev-parse", "main"], REMOTE);
      expect(after).not.toBe(before);
      expect(after).toBe(git(["rev-parse", "main"]));

      // Stashes: the list appears under the line, the item flips and
      // carries the count.
      await p.click(".dots-btn");
      await p.waitForSelector(".dots-menu");
      await p.click(".dots-item:has-text('Show stashes')");
      await p.waitForSelector(".seg-group", { timeout: 15000 });
      expect(
        await p.$$eval(".seg-btn", (els: any[]) =>
          els.map((e) => e.textContent),
        ),
      ).toEqual(["Pop", "Drop"]);
      await p.click(".dots-btn");
      await p.waitForSelector(".dots-menu");
      expect(await items()).toEqual(["Fetch", "Pull", "Push", "Hide stashes1"]);
      await p.keyboard.press("Escape");

      // Pop: the work comes back and the list empties.
      expect(fs.existsSync(path.join(REPO, "wip.txt"))).toBe(false);
      await p.click(".seg-btn:has-text('Pop')");
      await p.waitForSelector("text=stash applied", { timeout: 60000 });
      await p.waitForSelector("text=no stashes", { timeout: 15000 });
      expect(fs.existsSync(path.join(REPO, "wip.txt"))).toBe(true);

      expect(errors).toEqual([]);
    } finally {
      await b.close();
    }
  }, 180000);
});
