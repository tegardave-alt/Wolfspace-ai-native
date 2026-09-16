// Review comments in the code editor, and a right-click menu for plain text
// fields.
//
// WHAT WAS MISSING. (1) A note on a piece of code had to be typed into the
// chat as a description of WHERE the code was; (2) a right-click in the
// composer or any input answered with nothing -- Electron gives text fields
// no native menu. The reference for both is VS Code: its comments
// contribution (gutter "+", a thread widget under the range) and its
// textInputActions.ts (Undo/Redo/Cut/Copy/Paste/Select All on any text
// field). Monaco's own menu already had Cut/Copy/Paste and is left alone.

const fs = require("fs");
const os = require("os");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const baca = (p: string) => fs.readFileSync(path.join(AKAR, p), "utf8");

describe("wiring", () => {
  test("both modules are in the bundle, after AgentDiff and before app.tsx", () => {
    const html = baca("public/index.html");
    const m = html.match(/const APP_MODULES = \[([\s\S]*?)\];/);
    expect(m).toBeTruthy();
    const daftar = m![1].match(/"\/app\/[^"]+"/g)!.map((s) => s.slice(1, -1));
    const iDiff = daftar.indexOf("/app/AgentDiff.ts");
    expect(daftar.indexOf("/app/MenuTeks.ts")).toBeGreaterThan(iDiff);
    expect(daftar.indexOf("/app/KomentarKode.ts")).toBeGreaterThan(iDiff);
  });

  test("the text menu is installed once, at App mount; comments per editor", () => {
    const app = baca("public/app.tsx");
    expect(app).toMatch(/installMenuTeks\(\);/);
    expect(app).toMatch(
      /installKomentarKode\(monaco, edRef\.current, \(\) => \(\{/,
    );
    // The lane the "+" lives in is wide enough to read.
    expect(app).toMatch(/lineDecorationsWidth: 20,/);
  });

  test("Send to agent goes through a set-and-send event on the composer", () => {
    const k = baca("public/app/KomentarKode.ts");
    const c = baca("public/app/Components.tsx");
    expect(k).toMatch(/new CustomEvent\("WOLFSPACE:send-composer"/);
    expect(c).toMatch(/addEventListener\("WOLFSPACE:send-composer", h\)/);
    // The send happens from the effect on `val`, never inside the handler:
    // submit() reads the render's own state.
    expect(c).toMatch(
      /kirimSetelahSetRef\.current = false;\s*if \(val\.trim\(\)\) submit\(\);/,
    );
  });

  test("Monaco's own text area is left to Monaco's own menu", () => {
    const m = baca("public/app/MenuTeks.ts");
    expect(m).toMatch(/classList\.contains\("inputarea"\)\) return null;/);
  });
});

describe("the message the agent receives", () => {
  // Run the module's pure function in a bare window: the file has no
  // exports (it is concatenated into the bundle), so it is transpiled and
  // evaluated with a stub window to read its handle.
  const ts = require("typescript");
  const src = ts.transpileModule(baca("public/app/KomentarKode.ts"), {
    compilerOptions: { target: "ES2020", module: "None" },
  }).outputText;
  const w: any = {};
  new Function("window", "localStorage", "document", src)(
    w,
    { getItem: () => null, setItem: () => {} },
    {},
  );
  const pesan = w.__wolfspaceKomentarKode.pesanUntukAgent;

  test("names the file and the lines, quotes the note, fences the code", () => {
    const t = pesan({
      abs: "C:/proj/src/a.ts",
      mulai: 3,
      akhir: 5,
      bahasa: "typescript",
      kode: "a\nb\nc\n",
      teks: "use async here\nplease",
    });
    expect(t).toMatch(/^Code comment on C:\/proj\/src\/a\.ts \(lines 3-5\):/);
    expect(t).toContain("> use async here\n> please");
    expect(t).toContain("```typescript\na\nb\nc\n```");
    expect(t).toMatch(/make it in that file; otherwise explain/);
  });

  test("one line reads as a line, not a range", () => {
    expect(
      pesan({ abs: "x", mulai: 7, akhir: 7, bahasa: "", kode: "z", teks: "t" }),
    ).toMatch(/\(line 7\)/);
  });
});

// ── In a browser: the real thing ──
const { punyaBrowser, describeKalau } = require("./butuh.cjs");
const whenPossible = describeKalau(punyaBrowser());

whenPossible("in the editor and the composer (needs playwright)", () => {
  const { spawn } = require("child_process");
  const http = require("http");
  const PORT = 8180;
  let server: any;
  let dir = "";
  let html = "";

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-komentar-"));
    html = path.join(dir, "index.html").replace(/\\/g, "/");
    fs.writeFileSync(
      html,
      "<!doctype html>\n<body>\n<h1>Web Dev</h1>\n<p>line four</p>\n</body>\n",
    );
    server = spawn(process.execPath, [path.join(AKAR, "server.cjs")], {
      cwd: AKAR,
      env: { ...process.env, PORT: String(PORT) },
      stdio: "ignore",
    });
    for (let i = 0; i < 60; i++) {
      const ok = await new Promise((res) => {
        const r = http.get(
          { host: "127.0.0.1", port: PORT, path: "/healthz", timeout: 1000 },
          (x: any) => res(x.statusCode === 200),
        );
        r.on("error", () => res(false));
        r.on("timeout", () => {
          r.destroy();
          res(false);
        });
      });
      if (ok) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }, 60000);

  afterAll(() => {
    try {
      server.kill();
    } catch (_) {}
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  });

  test("right-click in the composer: six actions; Paste and Cut really move text", async () => {
    const { chromium } = require("playwright");
    const b = await chromium.launch();
    try {
      const ctx = await b.newContext({
        viewport: { width: 1400, height: 800 },
        permissions: ["clipboard-read", "clipboard-write"],
      });
      await ctx.addInitScript(() =>
        localStorage.setItem("wolfspace_migrated", "1"),
      );
      const p = await ctx.newPage();
      await p.goto("http://127.0.0.1:" + PORT + "/", {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      await p.waitForTimeout(800);
      await p.addStyleTag({
        content: ".project-picker-screen{display:none !important}",
      });
      await p.evaluate(() => navigator.clipboard.writeText("pasted text"));
      const ta = await p.$(".composer textarea");
      const tb = await ta.boundingBox();
      await p.mouse.click(tb.x + 30, tb.y + 10, { button: "right" });
      await p.waitForSelector("#menu-teks");
      const items = await p.$$eval("#menu-teks button", (bs: any[]) =>
        bs.map((x) => x.textContent + (x.disabled ? "!" : "")),
      );
      // Nothing selected: Cut and Copy are greyed, as in VS Code.
      expect(items).toEqual([
        "Undo",
        "Redo",
        "Cut!",
        "Copy!",
        "Paste",
        "Select All",
      ]);
      await p.click("#menu-teks button:has-text('Paste')");
      await p.waitForTimeout(200);
      expect(await ta.inputValue()).toBe("pasted text");
      expect(await p.$("#menu-teks")).toBeNull();

      await p.mouse.click(tb.x + 30, tb.y + 10, { button: "right" });
      await p.click("#menu-teks button:has-text('Select All')");
      await p.mouse.click(tb.x + 30, tb.y + 10, { button: "right" });
      await p.click("#menu-teks button:has-text('Cut')");
      await p.waitForTimeout(200);
      expect(await ta.inputValue()).toBe("");
      expect(await p.evaluate(() => navigator.clipboard.readText())).toBe(
        "pasted text",
      );
    } finally {
      await b.close();
    }
  }, 90000);

  test("hover shows +, the thread opens under the line, Send to agent sends the note with the code", async () => {
    const { chromium } = require("playwright");
    const b = await chromium.launch();
    try {
      const ctx = await b.newContext({
        viewport: { width: 1400, height: 800 },
      });
      await ctx.addInitScript(() =>
        localStorage.setItem("wolfspace_migrated", "1"),
      );
      const p = await ctx.newPage();
      await p.goto("http://127.0.0.1:" + PORT + "/", {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      await p.waitForTimeout(800);
      await p.addStyleTag({
        content: ".project-picker-screen{display:none !important}",
      });
      // What the composer sends, without a cloud run behind it.
      await p.evaluate(() => {
        (window as any).__kiriman = [];
        window.addEventListener("WOLFSPACE:send-composer", (e: any) =>
          (window as any).__kiriman.push(String(e.detail)),
        );
      });
      await p.evaluate(
        (h: string) =>
          window.dispatchEvent(
            new CustomEvent("wolfspace_agent_act", {
              detail: { kind: "write", path: h, ok: true },
            }),
          ),
        html,
      );
      await p.waitForSelector("iframe[src*='preview-file']", {
        timeout: 10000,
      });
      await p.click('[title="Panel menu"]');
      await p.click("button:has-text('Logic')");
      await p.waitForSelector('[data-panel="logic"]', { timeout: 10000 });
      await p.waitForTimeout(800);
      await p.click('[data-panel="logic"] :text("index.html")');
      await p.waitForSelector(
        '[data-panel="logic"] .monaco-editor .view-line',
        { timeout: 10000 },
      );
      await p.waitForTimeout(800);

      const lines = await p.$$(
        '[data-panel="logic"] .monaco-editor .view-line',
      );
      const l3 = await lines[2].boundingBox();
      await p.mouse.move(l3.x + 30, l3.y + 8);
      await p.waitForTimeout(200);
      const plus = await p.$('[data-panel="logic"] .komentar-plus');
      expect(plus).toBeTruthy();
      const pb = await plus.boundingBox();
      await p.mouse.click(pb.x + pb.width / 2, pb.y + pb.height / 2);
      await p.waitForSelector(".komentar-zona");
      expect(
        await p.$eval(
          ".komentar-zona .komentar-judul",
          (e: any) => e.textContent,
        ),
      ).toBe("Line 3");
      // Under the line, not over it.
      const zb = await (await p.$(".komentar-zona")).boundingBox();
      expect(zb.y).toBeGreaterThan(l3.y + l3.height - 1);

      await p.type(".komentar-zona textarea", "make this heading smaller");
      await p.click(".komentar-zona .komentar-kirim");
      await p.waitForTimeout(400);
      const kiriman: string[] = await p.evaluate(
        () => (window as any).__kiriman,
      );
      expect(kiriman.length).toBe(1);
      expect(kiriman[0]).toMatch(/^Code comment on .*index\.html \(line 3\):/);
      expect(kiriman[0]).toContain("> make this heading smaller");
      expect(kiriman[0]).toContain("<h1>Web Dev</h1>");
      // The thread closed, the note is kept, and its glyph marks the line.
      expect(await p.$(".komentar-zona")).toBeNull();
      const simpanan = JSON.parse(
        await p.evaluate(() => localStorage.getItem("wolfspace_komentar_kode")),
      );
      expect(simpanan[html][0]).toMatchObject({ mulai: 3, akhir: 3 });
      const ikon = await p.$('[data-panel="logic"] .komentar-ikon');
      expect(ikon).toBeTruthy();
      // Clicking the glyph reopens the thread with the note in it.
      const ib = await ikon.boundingBox();
      await p.mouse.click(ib.x + ib.width / 2, ib.y + ib.height / 2);
      await p.waitForSelector(".komentar-zona .komentar-badan");
      expect(
        await p.$eval(
          ".komentar-zona .komentar-badan",
          (e: any) => e.textContent,
        ),
      ).toBe("make this heading smaller");

      // The editor's own menu carries the new actions beside Cut/Copy/Paste.
      await p.keyboard.press("Escape");
      await p.mouse.click(l3.x + 30, l3.y + 8, { button: "right" });
      await p.waitForTimeout(400);
      const labels: string[] = await p.evaluate(() => {
        const out: string[] = [];
        const walk = (root: any) =>
          root.querySelectorAll("*").forEach((el: any) => {
            if (el.shadowRoot) walk(el.shadowRoot);
            if (el.classList && el.classList.contains("action-label"))
              out.push(el.textContent);
          });
        walk(document);
        return out;
      });
      expect(labels).toEqual(
        expect.arrayContaining([
          "Cut",
          "Copy",
          "Paste",
          "Add Comment…",
          "Ask Agent to Explain",
        ]),
      );
    } finally {
      await b.close();
    }
  }, 120000);
});
