// ── Visual Draw: the numbers are exact, and the snippet means what it says ──
//
// Asked with a screenshot of a drawn box: "are the coordinates accurate?", and
// "make it concise -- drop the white bordered card of code, keep a copy
// button". Measured before touching anything, a 120x90 drag at (400,150):
//
//   label X/Y, box position, width, height     exact, 1px     (already true)
//   data-target                                 the <p> under the box CENTRE
//   left/top relative to it                     144 / -41 -- NEGATIVE: the area
//                                               was not inside that element
//   the snippet inserted into its target        landed at (376, 5), because the
//                                               target was position: static
//
// So three things changed. The target is now the element the area lies
// INSIDE (walk up until the box holds the rectangle), left/top count from its
// padding box (past the border, the way position: absolute does), and a
// static target is named as such in the snippet so the reader knows to give
// it position: relative. The card is gone: the label strip carries a small
// Copy button, and the snippet only ever reaches the clipboard.
//
// Part 1 reads the source. Part 2 drags in a real browser and checks the
// clipboard and the landing point.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const read = (p: string) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");
const VT = read("public/app/VisualTools.tsx");
const stripComments = (t: string) =>
  t
    .split("\n")
    .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join("\n");
const CODE = stripComments(VT);

describe("what the snippet describes", () => {
  test("the target is the element the area lies inside, not the one under its centre", () => {
    // The probe still starts at the centre (it does not miss when the mouse
    // is released outside the box) and then walks up.
    expect(CODE).toMatch(/const cx = finalX \+ r\.left \+ finalW \/ 2;/);
    const m = CODE.match(
      /const holds = \(el: any\) => \{[\s\S]*?\n        \};/,
    );
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/q\.left \+ ox <= drawn\.left \+ 0\.5/);
    expect(m![0]).toMatch(/q\.bottom \+ oy >= drawn\.bottom - 0\.5/);
    expect(CODE).toMatch(
      /while \(\s*targetEl &&\s*targetEl !== targetDoc\.body &&\s*targetEl\.parentElement &&\s*!holds\(targetEl\)\s*\)\s*targetEl = targetEl\.parentElement;/,
    );
  });

  test("left/top count from the padding box, and the iframe offset still applies", () => {
    expect(CODE).toMatch(
      /let trLeft = tr\.left \+ targetEl\.clientLeft,\s*trTop = tr\.top \+ targetEl\.clientTop;/,
    );
    expect(CODE).toMatch(
      /if \(frRect\) \{\s*trLeft \+= frRect\.left;\s*trTop \+= frRect\.top;\s*\}/,
    );
    expect(CODE).toMatch(
      /const relX = Math\.round\(finalX \+ r\.left - trLeft\);/,
    );
    expect(CODE).toMatch(
      /const relY = Math\.round\(finalY \+ r\.top - trTop\);/,
    );
  });

  test("a static target is named as such in the snippet", () => {
    expect(CODE).toMatch(/getComputedStyle\(targetEl\)\.position === "static"/);
    expect(CODE).toMatch(
      /data-note="target is position: static; give it position: relative"/,
    );
    expect(CODE).toMatch(
      /<div data-target="\$\{targetSelector\}"\$\{staticNote\} style="position: absolute; left: \$\{relX\}px; top: \$\{relY\}px; width: \$\{finalW\}px; height: \$\{finalH\}px;"><\/div>/,
    );
  });

  test("1px precision: no grid snap", () => {
    expect(CODE).toMatch(/const snap = \(v: any\) => Math\.round\(v\);/);
  });
});

describe("what the box shows", () => {
  test("one strip: the label and a Copy button; no card, no code block", () => {
    const m = CODE.match(/selBox\.innerHTML = `[\s\S]*?`;/);
    expect(m).not.toBeNull();
    const html = m![0];
    expect(html).toMatch(/EMPTY AREA \[X: \$\{finalX\}, Y: \$\{finalY\}\]/);
    expect(html).toMatch(/class="vd-copy-btn"/);
    expect(html).toMatch(/>\s*Copy\s*<\/button>/);
    expect(html).not.toMatch(/<code/);
    expect(html).not.toMatch(/escapedDom/);
    expect(html).not.toMatch(/Copy DOM Structure/);
    expect(html).not.toMatch(/rgba\(255, 255, 255, 0\.98\)/);
    // The strip must let its own clicks through the draw tool's blockers.
    expect(html).toMatch(/<div class="ui-panel"/);
    expect(html).toMatch(/pointer-events: auto/);
    // English on screen.
    expect(html).not.toMatch(/KOSONG/);
    // Nothing else builds the escaped copy any more.
    expect(CODE).not.toMatch(/escapedDom/);
  });

  test("the copied state fits the small button", () => {
    expect(CODE).toMatch(/<\/svg> Copied`;/);
    expect(CODE).not.toMatch(/Copied!/);
  });
});

// ── Part 2: a real drag ──
const { punyaBrowser, describeKalau } = require("./butuh.cjs");
const whenPossible = describeKalau(punyaBrowser());

whenPossible("a real drag (needs playwright)", () => {
  const { spawn } = require("child_process");
  const http = require("http");
  const PORT = 8143;
  let server: any;

  beforeAll(async () => {
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
  });

  test("label exact, snippet on the clipboard, and the snippet lands where the box was", async () => {
    const { chromium } = require("playwright");
    const b = await chromium.launch();
    try {
      const ctx = await b.newContext({
        viewport: { width: 1280, height: 800 },
        permissions: ["clipboard-read", "clipboard-write"],
      });
      await ctx.addInitScript(() => {
        localStorage.setItem("wolfspace_migrated", "1");
      });
      const p = await ctx.newPage();
      const errors: string[] = [];
      p.on("pageerror", (e: any) => errors.push("PAGEERROR " + e.message));
      p.on("console", (m: any) => {
        if (m.type() === "error") errors.push(m.text().slice(0, 200));
      });
      await p.goto("http://127.0.0.1:" + PORT + "/", {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      await p.waitForTimeout(800);
      // Past the welcome picker the way render-hidup does.
      if (await p.$(".picker-textarea")) {
        await p.click(".picker-textarea");
        await p.keyboard.insertText("hello");
        await p.keyboard.press("Enter");
        await p.waitForTimeout(2500);
      }
      await p.click('[title="Toggle Right Panel"]');
      await p.waitForSelector('[title="Panel menu"]', { timeout: 10000 });
      await p.click('[title="Panel menu"]');
      await p.click("text=Visual Draw");
      await p.waitForSelector("#vd-cwrap", { timeout: 5000 });

      const x1 = 400,
        y1 = 150,
        x2 = 520,
        y2 = 240;
      await p.mouse.move(x1, y1);
      await p.mouse.down();
      await p.mouse.move(460, 200);
      await p.mouse.move(x2, y2);
      await p.mouse.up();
      await p.waitForTimeout(300);

      const box = await p.evaluate(() => {
        const el = document.querySelector("#vd-cwrap > div > div")!;
        const r = el.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          label: el.querySelector("span")!.textContent!.trim(),
          hasCode: !!el.querySelector("code"),
          panels: el.querySelectorAll(".ui-panel").length,
        };
      });
      expect([box.x, box.y, box.w, box.h]).toEqual([x1, y1, x2 - x1, y2 - y1]);
      expect(box.label).toBe("EMPTY AREA [X: " + x1 + ", Y: " + y1 + "]");
      expect(box.hasCode).toBe(false);
      expect(box.panels).toBe(1);

      // Copy, then read what the agent would receive.
      await p.click("#vd-cwrap .vd-copy-btn");
      await p.waitForTimeout(200);
      const snippet: string = await p.evaluate(() =>
        navigator.clipboard.readText(),
      );
      expect(snippet).toMatch(
        /^<div data-target="[^"]+"( data-note="target is position: static; give it position: relative")? style="position: absolute; left: \d+px; top: \d+px; width: 120px; height: 90px;"><\/div>$/,
      );
      expect(
        await p.$eval("#vd-cwrap .vd-copy-btn", (e: any) =>
          e.textContent.trim(),
        ),
      ).toBe("Copied");

      // The target holds the box, and the snippet, inserted into it (with
      // position: relative when it says so), lands exactly where the box is.
      const landed = await p.evaluate(
        ([snip, x, y, w, h]: any) => {
          const sel = snip.match(/data-target="([^"]+)"/)![1];
          const target = document.querySelector(sel) as HTMLElement | null;
          if (!target) return { found: false };
          const tr = target.getBoundingClientRect();
          const holds =
            tr.left <= x + 0.5 &&
            tr.top <= y + 0.5 &&
            tr.right >= x + w - 0.5 &&
            tr.bottom >= y + h - 0.5;
          const wasStatic = /data-note=/.test(snip);
          const old = target.style.position;
          if (wasStatic) target.style.position = "relative";
          const tmp = document.createElement("div");
          tmp.innerHTML = snip;
          const el = tmp.firstElementChild as HTMLElement;
          target.appendChild(el);
          const rr = el.getBoundingClientRect();
          el.remove();
          target.style.position = old;
          return {
            found: true,
            holds,
            wasStatic,
            at: [Math.round(rr.x), Math.round(rr.y)],
          };
        },
        [snippet, x1, y1, x2 - x1, y2 - y1],
      );
      expect(landed.found).toBe(true);
      expect(landed.holds).toBe(true);
      expect(landed.at).toEqual([x1, y1]);
      expect(errors).toEqual([]);
    } finally {
      await b.close();
    }
  }, 120000);
});
