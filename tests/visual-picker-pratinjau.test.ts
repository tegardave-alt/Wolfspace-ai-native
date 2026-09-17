// The Visual Picker must reach INTO the previewed page — the content the
// user is building — and what it copies must name that page and carry no
// picker-only classes.
//
// WHAT WENT WRONG. useVisualPicker computed the preview's document and then
// never used it: `docs` stayed [document], every listener went onto
// WOLFSPACE's own page, and a mouse over the Live Browser reached nothing.
// A mouse event over an iframe lands in the iframe's document; a picker not
// listening there does not exist there. Visual Draw was unaffected because
// it draws an overlay. Separately, every copied snippet carried the
// picker's own `vp-hover` class, and the agent then searched the source for
// a class that exists only while the picker runs.

const fs = require("fs");
const os = require("os");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const VT = fs.readFileSync(
  path.join(AKAR, "public", "app", "VisualTools.tsx"),
  "utf8",
);

describe("the picker listens inside the preview", () => {
  test("the preview document joins the listener list", () => {
    const i = VT.indexOf("function useVisualPicker(");
    const blok = VT.slice(i, i + 2500);
    expect(blok).toMatch(
      /if \(frameDoc && frameDoc\.defaultView && frameDoc\.body\)\s*docs\.push\(frameDoc\);/,
    );
  });

  test("a snippet from the preview names the previewed file", () => {
    expect(VT).toMatch(/el\.ownerDocument !== document/);
    expect(VT).toMatch(/Inside the previewed page/);
    expect(VT).toMatch(/GENERATED content, not in WOLFSPACE's own UI/);
  });

  test("the copied markup is cleaned of the picker's hover class first", () => {
    const i = VT.indexOf("const click = (e: any) => {");
    const blok = VT.slice(i, i + 1200);
    const bersih = blok.indexOf("cleanHovers();");
    const baca = blok.indexOf("el.outerHTML");
    expect(bersih).toBeGreaterThan(-1);
    expect(baca).toBeGreaterThan(bersih);
  });
});

// ── In a browser: the real thing ──
const { punyaBrowser, describeKalau } = require("./butuh.cjs");
const whenPossible = describeKalau(punyaBrowser());

whenPossible("the picker, over a previewed page (needs playwright)", () => {
  const { spawn } = require("child_process");
  const http = require("http");
  const PORT = 8176;
  let server: any;
  let dir = "";
  let html = "";

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-picker-"));
    html = path.join(dir, "halaman.html").replace(/\\/g, "/");
    fs.writeFileSync(
      html,
      '<!doctype html><body style="margin:0"><h1 id="judul">Made page</h1>' +
        '<button class="cta" style="margin:24px;padding:10px 18px">Sign up</button></body>',
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

  test("hover lights an element INSIDE the iframe; the copy names the file, no vp-hover", async () => {
    const { chromium } = require("playwright");
    const b = await chromium.launch();
    try {
      const ctx = await b.newContext({
        viewport: { width: 1280, height: 800 },
      });
      await ctx.addInitScript(() => {
        localStorage.setItem("wolfspace_migrated", "1");
        (window as any).__papan = null;
        Object.defineProperty(navigator, "clipboard", {
          value: {
            writeText: (t: string) => {
              (window as any).__papan = t;
              return Promise.resolve();
            },
          },
        });
        window.alert = () => {};
      });
      const p = await ctx.newPage();
      await p.goto("http://127.0.0.1:" + PORT + "/", {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      await p.waitForTimeout(800);
      await p.addStyleTag({
        content: ".project-picker-screen{display:none !important}",
      });
      // Open the preview the way an agent write does.
      await p.evaluate((h: string) => {
        window.dispatchEvent(
          new CustomEvent("wolfspace_agent_act", {
            detail: { kind: "write", path: h, ok: true },
          }),
        );
      }, html);
      await p.waitForSelector("iframe[src*='preview-file']", {
        timeout: 10000,
      });
      const frame = p
        .frames()
        .find((f: any) => f.url().includes("preview-file"));
      await frame.waitForSelector(".cta", { timeout: 10000 });

      await p.click('[title="Panel menu"]');
      await p.click("button:has-text('Visual Picker')");
      await p.waitForTimeout(300);
      expect(
        await frame.evaluate(() => document.body.classList.contains("vp-on")),
      ).toBe(true);

      await frame.hover(".cta");
      await p.waitForTimeout(150);
      expect(
        await frame.evaluate(() =>
          document.querySelector(".cta")!.classList.contains("vp-hover"),
        ),
      ).toBe(true);

      await frame.click(".cta");
      await p.waitForTimeout(200);
      const papan: string = await p.evaluate(() => (window as any).__papan);
      expect(papan).toMatch(/^Inside the previewed page \(.*halaman\.html\)/);
      expect(papan).toMatch(/<button class="cta"/);
      expect(papan).not.toMatch(/vp-hover/);
      // And the picker switched itself off afterwards.
      expect(
        await frame.evaluate(() => document.body.classList.contains("vp-on")),
      ).toBe(false);
    } finally {
      await b.close();
    }
  }, 90000);
});
