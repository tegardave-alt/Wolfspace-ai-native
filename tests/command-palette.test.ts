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

      const bacaExplorer = () =>
        p.evaluate(() => {
          try {
            return localStorage.getItem("wolfspace_explorer_sembunyi");
          } catch (_) {
            return null;
          }
        });

      // The palette's global keydown listener is attached once App mounts; wait
      // for a stable app element (its top-bar trigger) so a fast keypress under a
      // loaded runner is not sent before the listener exists.
      await p.waitForSelector('button[title^="Command Palette"]', {
        timeout: 20000,
      });

      // 1. The shortcut opens it (retry once — a single lost keydown on a busy
      // runner should not read as "the shortcut is broken").
      const bukaViaShortcut = async () => {
        await p.keyboard.press("Control+Shift+P");
        try {
          await p.waitForSelector(".kpal-modal", { timeout: 4000 });
          return true;
        } catch (_) {
          return false;
        }
      };
      if (!(await bukaViaShortcut())) {
        expect(await bukaViaShortcut()).toBe(true);
      }

      // 2. shadcn look: the search magnifier sits in the input row.
      expect(await p.$(".kpal-modal .kpal-cari-ikon")).not.toBeNull();

      // 3. Fuzzy filter: "explorer" surfaces the Explorer view command on top...
      await p.keyboard.type("explorer");
      await p.waitForTimeout(200);
      const atas = await p.$eval(".kpal-item", (e: any) => e.textContent || "");
      expect(atas.toLowerCase()).toContain("explorer");
      // ...with its keybinding shown on the right (VS Code-style).
      const kunci = await p.$eval(
        ".kpal-item .kpal-kunci",
        (e: any) => e.textContent || "",
      );
      expect(kunci.replace(/\s/g, "").toLowerCase()).toContain("ctrl+b");

      // 4. Enter runs it; the real handler flips explorer visibility (persisted).
      await p.keyboard.press("Enter");
      await p.waitForTimeout(300);
      expect(await p.$(".kpal-modal")).toBeNull();
      const sesudahJalankan = await bacaExplorer();
      expect(sesudahJalankan === "0" || sesudahJalankan === "1").toBe(true);

      // 5. The keybinding ALSO works (not just a hint): Ctrl+B toggles it back.
      await p.keyboard.press("Control+b");
      await p.waitForTimeout(300);
      const sesudahKombo = await bacaExplorer();
      expect(sesudahKombo).not.toBe(sesudahJalankan);

      // 6. Cross-component commands register: a Web Dev command (contributed by
      // App, not the view toggles) is findable by fuzzy search.
      await p.keyboard.press("Control+Shift+P");
      await p.waitForSelector(".kpal-modal", { timeout: 10000 });
      await p.keyboard.type("reload preview");
      await p.waitForTimeout(200);
      const webdev = await p.$eval(
        ".kpal-item",
        (e: any) => e.textContent || "",
      );
      expect(webdev.toLowerCase()).toContain("reload preview");

      // 7. Esc closes without running anything.
      await p.keyboard.press("Escape");
      await p.waitForTimeout(150);
      expect(await p.$(".kpal-modal")).toBeNull();

      // 8. Add MCP Server opens a real standalone modal (the old palette entry
      // did nothing because it relied on a nested composer menu). It has the
      // name + command/URL + token fields.
      await p.evaluate(() =>
        window.dispatchEvent(new CustomEvent("wolfspace_mcp_add")),
      );
      await p.waitForSelector(".gh-modal", { timeout: 10000 });
      const judul = await p.$eval(
        ".gh-modal .gh-judul",
        (e: any) => e.textContent || "",
      );
      expect(judul.toLowerCase()).toContain("add mcp server");
      const jmlInput = await p.$$eval(
        ".gh-modal input",
        (els: any[]) => els.length,
      );
      expect(jmlInput).toBeGreaterThanOrEqual(3);
    } finally {
      await b.close();
    }
  }, 90000);
});
