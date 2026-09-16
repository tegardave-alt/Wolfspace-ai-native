// One click copies a whole chat message.
//
// WHAT WAS WRONG. Copying a reply meant dragging a selection across the
// bubble first; a long reply scrolls, so that became a scroll-and-drag, and
// then a right-click for Copy. Every chat surface in use puts a copy control
// on the message itself (ChatGPT, Claude, Copilot Chat). It is now in the
// header row of each message -- beside "You" / "WOLFSPACE" -- and in the
// agent's answer bubble beside the token badge, shown on hover.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const baca = (p: string) => fs.readFileSync(path.join(AKAR, p), "utf8");

describe("wiring", () => {
  test("user and WOLFSPACE messages carry the control in their header row", () => {
    const c = baca("public/app/Components.tsx");
    expect(c).toMatch(/function TombolSalin\(\{ teks, judul \}: any\)/);
    expect((c.match(/<TombolSalin teks=\{msg\.text\} \/>/g) || []).length).toBe(
      2,
    );
    expect((c.match(/className="msg-kepala"/g) || []).length).toBe(2);
  });

  test("the agent's answer bubble has it beside the token badge", () => {
    const a = baca("public/app/AgentSteps.tsx");
    expect(a).toMatch(
      /<TombolSalin teks=\{summary\} judul="Copy the answer" \/>\s*<LencanaToken/,
    );
  });

  test("hidden until hover, but never on a touch screen", () => {
    const css = baca("public/styles.css");
    expect(css).toMatch(/\.msg:hover \.msg-salin,/);
    expect(css).toMatch(
      /@media \(hover: none\) \{\s*\.msg-salin \{\s*opacity: 1;/,
    );
  });
});

// ── In a browser: the real thing ──
const { punyaBrowser, describeKalau } = require("./butuh.cjs");
const whenPossible = describeKalau(punyaBrowser());

whenPossible("in the chat (needs playwright)", () => {
  const { spawn } = require("child_process");
  const http = require("http");
  const PORT = 8182;
  let server: any;

  beforeAll(async () => {
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
  });

  test("hover a message, click Copy: the clipboard holds the whole text", async () => {
    const { chromium } = require("playwright");
    const b = await chromium.launch();
    try {
      const ctx = await b.newContext({
        viewport: { width: 1200, height: 800 },
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
      // A message with two lines and a fence: what is copied must be the
      // SOURCE, fence and all, not the rendered text.
      const teks = "first line\n\n```js\nconsole.log(1)\n```\n\nlast line";
      await p.evaluate(
        (t: string) =>
          window.dispatchEvent(
            new CustomEvent("WOLFSPACE:send-composer", { detail: t }),
          ),
        teks,
      );
      await p.waitForSelector(".msg.user .bubble-user", { timeout: 10000 });
      // Hidden until the pointer is over the message.
      const tombol = await p.$(".msg.user .msg-salin");
      expect(tombol).toBeTruthy();
      expect(
        await tombol.evaluate((e: any) => getComputedStyle(e).opacity),
      ).toBe("0");
      await p.hover(".msg.user .bubble-user");
      await p.waitForTimeout(250);
      expect(
        await tombol.evaluate((e: any) => getComputedStyle(e).opacity),
      ).toBe("1");
      await tombol.click();
      await p.waitForTimeout(200);
      // The Windows clipboard hands text back with CRLF line ends.
      const papan: string = await p.evaluate(() =>
        navigator.clipboard.readText(),
      );
      expect(papan.split(String.fromCharCode(13)).join("")).toBe(teks);
      expect(await tombol.evaluate((e: any) => e.textContent)).toBe("Copied");
      // And the reply's own control (WOLFSPACE answered, with an error --
      // no key in this environment -- which is still a message to copy).
      await p.waitForSelector(".msg.model .msg-salin", { timeout: 15000 });
      const balasan = await p.$(".msg.model .msg-salin");
      await p.hover(".msg.model .bubble-model");
      await balasan.click();
      await p.waitForTimeout(200);
      const isi = await p.evaluate(() => navigator.clipboard.readText());
      expect(isi.length).toBeGreaterThan(10);
      expect(isi).not.toBe(teks);
    } finally {
      await b.close();
    }
  }, 90000);
});
