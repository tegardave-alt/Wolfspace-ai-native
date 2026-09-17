// Command palette (Ctrl/Cmd+Shift+P), driven in the real rendered app.
//
// The palette is a VS Code-style overlay: open with the shortcut, fuzzy-filter,
// run a command by Enter. It is decoupled — features register commands into a
// registry (usePerintah) and the palette only lists/runs them. This drives the
// whole path against a real server + headless Chromium: open, filter to a View
// command, run it, and confirm the app state actually changed.

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const { punyaBrowser, describeKalau } = require("./butuh.cjs");
const whenPossible = describeKalau(punyaBrowser());

const PORT = 8179;

whenPossible("command palette (needs playwright)", () => {
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

  test("opens on Ctrl+Shift+P, fuzzy-filters, and runs a command that changes the app", async () => {
    const { chromium } = require("playwright");
    const b = await chromium.launch();
    try {
      const ctx = await b.newContext({ viewport: { width: 1400, height: 800 } });
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem("wolfspace_migrated", "1");
          localStorage.setItem("wolfspace_theme", "dark");
        } catch (_) {}
      });
      const p = await ctx.newPage();
      await p.goto("http://127.0.0.1:" + PORT + "/", {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      await p.waitForTimeout(800);
      // The project picker is an overlay; hide it so it cannot intercept keys.
      await p.addStyleTag({
        content: ".project-picker-screen{display:none !important}",
      });

      // 1. The shortcut opens it.
      await p.keyboard.press("Control+Shift+P");
      await p.waitForSelector(".kpal-modal", { timeout: 10000 });

      // 2. Fuzzy filter: "theme" surfaces the Toggle Theme command near the top.
      await p.keyboard.type("theme");
      await p.waitForTimeout(200);
      const teksAtas = await p.$eval(
        ".kpal-item",
        (e: any) => e.textContent || "",
      );
      expect(teksAtas.toLowerCase()).toContain("theme");

      // 3. Enter runs it. The View command flips the theme dark -> light.
      await p.keyboard.press("Enter");
      await p.waitForTimeout(300);
      // The palette closed...
      expect(await p.$(".kpal-modal")).toBeNull();
      // ...and the theme actually changed (persisted by the real handler).
      const tema = await p.evaluate(() => {
        try {
          return localStorage.getItem("wolfspace_theme");
        } catch (_) {
          return null;
        }
      });
      expect(tema).toBe("light");

      // 4. Esc closes without running anything.
      await p.keyboard.press("Control+Shift+P");
      await p.waitForSelector(".kpal-modal", { timeout: 10000 });
      await p.keyboard.press("Escape");
      await p.waitForTimeout(150);
      expect(await p.$(".kpal-modal")).toBeNull();
    } finally {
      await b.close();
    }
  }, 90000);
});
