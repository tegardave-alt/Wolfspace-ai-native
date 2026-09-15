// Two panels on one side get a divider BETWEEN them, and dragging it moves
// width from one to the other.
//
// WHAT WENT WRONG. With Web Dev (preview) and the code editor (Logic) both
// on the right, each panel's order was a flat number and its divider "one
// step toward chat" -- the SAME number for both. The row sorted as
// [chat][div][div][preview][logic]: two dividers stacked beside chat and
// nothing between the panels. Reported as "there is no resize between the
// two, and it cannot be adjusted".
//
// Three things had to change, each measured in a real browser:
//   1. order runs in sequence per side: [chat][d0][p0][d1][p1];
//   2. a drag over the Live Browser's <iframe> died the moment the pointer
//      entered it (mousemove goes to the iframe's document), so iframes lose
//      pointer-events for the drag's duration;
//   3. the percentage is of the CONTAINER, not the window, and a divider
//      between two panels transfers width between them -- before that a
//      150px drag moved the divider 16px, then 38px.

const fs = require("fs");
const os = require("os");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const APP = fs.readFileSync(path.join(AKAR, "public", "app.tsx"), "utf8");
const CSS = fs.readFileSync(path.join(AKAR, "public", "styles.css"), "utf8");

describe("the wiring", () => {
  test("panels are named, ordered per side, and tagged in the DOM", () => {
    expect(APP).toMatch(/const _indeksSisi = \(nama: any\) =>/);
    expect(APP).toMatch(/const _orderPanel = \(sisi: any, nama\?: any\) =>/);
    for (const n of ["terminal", "preview", "logic"]) {
      expect(APP).toMatch(new RegExp('data-panel="' + n + '"'));
      expect(APP).toMatch(
        new RegExp("gayaPembagi\\(posisi\\." + n + ', "' + n + '"\\)'),
      );
    }
  });

  test("a drag measures its own panel and its neighbour, against the container", () => {
    const i = APP.indexOf(
      "const geserPembagi = (sumbu: any, set: any, nama?: any) =>",
    );
    expect(i).toBeGreaterThan(-1);
    const b = APP.slice(i, i + 4000);
    expect(b).toMatch(
      /document\.querySelector\('\[data-panel="' \+ nama \+ '"\]'\)/,
    );
    expect(b).toMatch(/el\.parentElement\.getBoundingClientRect\(\)/);
    expect(b).toMatch(/tetangga\.set\(tetangga\.pct - \(baru - pctAwal\)\)/);
    // Iframes must not swallow the drag.
    expect(b).toMatch(/document\.body\.classList\.add\("menyeret-pembagi"\)/);
    expect(b).toMatch(
      /document\.body\.classList\.remove\("menyeret-pembagi"\)/,
    );
    expect(CSS).toMatch(
      /body\.menyeret-pembagi iframe[\s\S]*?pointer-events: none/,
    );
  });
});

// ── In a browser: the real thing ──
const { punyaBrowser, describeKalau } = require("./butuh.cjs");
const whenPossible = describeKalau(punyaBrowser());

whenPossible("Web Dev beside the code editor (needs playwright)", () => {
  const { spawn } = require("child_process");
  const http = require("http");
  const PORT = 8178;
  let server: any;
  let dir = "";
  let html = "";

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-pembagi-"));
    html = path.join(dir, "index.html").replace(/\\/g, "/");
    fs.writeFileSync(html, "<!doctype html><body><h1>Web Dev</h1></body>");
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

  test("a divider sits between them and follows the pointer", async () => {
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
      await p.waitForTimeout(500);

      const tata = () =>
        p.evaluate(() =>
          [...document.querySelectorAll(".chat-split > *")]
            .map((e: any) => {
              const r = e.getBoundingClientRect();
              const nama =
                e.dataset.panel ||
                (e.classList.contains("split-divider")
                  ? "div"
                  : e.className.split(" ")[0]);
              return { nama, x: Math.round(r.left), w: Math.round(r.width) };
            })
            .filter((e: any) => e.w > 0)
            .sort((a: any, c: any) => a.x - c.x),
        );
      const sebelum = await tata();
      const nama = sebelum.map((e: any) => e.nama);
      // [chat][div][preview][div][logic]: a divider between the two panels.
      expect(nama).toEqual(["chat-col", "div", "preview", "div", "logic"]);

      const pembagi = sebelum[3];
      const preW = sebelum[2].w;
      const logW = sebelum[4].w;
      const divs = await p.$$(".split-divider");
      let target: any = null;
      for (const d of divs) {
        const r = await d.boundingBox();
        if (r && Math.round(r.x) === pembagi.x) target = d;
      }
      expect(target).toBeTruthy();
      const r = await target.boundingBox();
      // Drag 150px to the LEFT, across the preview's iframe.
      await p.mouse.move(r.x + 2, r.y + 100);
      await p.mouse.down();
      await p.mouse.move(r.x - 150, r.y + 100, { steps: 8 });
      await p.mouse.up();
      await p.waitForTimeout(300);
      const sesudah = await tata();
      const preW2 = sesudah[2].w;
      const logW2 = sesudah[4].w;
      // Width moved from preview to logic, about 150px, and the pair's total
      // is unchanged (chat did not absorb it).
      expect(logW2 - logW).toBeGreaterThan(120);
      expect(preW - preW2).toBeGreaterThan(120);
      expect(Math.abs(preW2 + logW2 - (preW + logW))).toBeLessThanOrEqual(3);
      // The divider is where the pointer let go.
      expect(Math.abs(sesudah[3].x - (r.x - 150))).toBeLessThanOrEqual(4);
    } finally {
      await b.close();
    }
  }, 90000);
});
