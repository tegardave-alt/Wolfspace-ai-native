// The shell picker offers only the shells this machine has -- like VS Code's
// terminal profile detection.
//
// WHAT WENT WRONG. The picker listed a fixed set (PowerShell, pwsh, cmd, Git
// Bash, WSL). On a machine with Windows PowerShell but not PowerShell 7,
// choosing "pwsh" failed with "[Error] Could not open pwsh.exe: File not
// found" -- only AFTER it was picked. VS Code detects its profiles and shows
// what is actually installed; /api/terminal/shells now answers the same, and
// a missing shell is shown disabled with how to install it.

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const baca = (p: string) => fs.readFileSync(path.join(AKAR, p), "utf8");
const PORT = 8188;
const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("the endpoint", () => {
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
      await tidur(500);
    }
  }, 60000);
  afterAll(() => {
    try {
      server.kill();
    } catch (_) {}
  });

  test("/api/terminal/shells reports each candidate with an `ada` flag", async () => {
    const daftar: any[] = await new Promise((res) =>
      http.get(
        { host: "127.0.0.1", port: PORT, path: "/api/terminal/shells" },
        (x: any) => {
          let b = "";
          x.on("data", (c: any) => (b += c));
          x.on("end", () => res(JSON.parse(b)));
        },
      ),
    );
    expect(Array.isArray(daftar)).toBe(true);
    for (const s of daftar) {
      expect(typeof s.nama).toBe("string");
      expect(typeof s.nilai).toBe("string");
      expect(typeof s.ada).toBe("boolean");
    }
    if (process.platform === "win32") {
      const nama = daftar.map((s) => s.nama);
      expect(nama).toEqual(
        expect.arrayContaining([
          "PowerShell",
          "PowerShell 7 (pwsh)",
          "Command Prompt",
        ]),
      );
      // cmd.exe is present on every Windows machine.
      const cmd = daftar.find((s) => s.nilai === "cmd.exe");
      expect(cmd.ada).toBe(true);
      // A shell reported missing carries how to get it.
      for (const s of daftar)
        if (!s.ada) expect(typeof s.pasang).toBe("string");
    }
    // At least one shell is always available -- else the terminal is useless.
    expect(daftar.some((s) => s.ada)).toBe(true);
  });
});

describe("the picker", () => {
  test("renders detected shells; a missing one is disabled with an install hint", () => {
    const S = baca("public/app/Screens.tsx");
    // Fetches the machine's shells when the picker opens.
    expect(S).toMatch(/fetch\("\/api\/terminal\/shells"\)/);
    // A shell that is not installed is disabled, not silently openable.
    expect(S).toMatch(/const ada = s\.ada !== false;/);
    expect(S).toMatch(/disabled=\{!ada\}/);
    expect(S).toMatch(/Not installed — " \+ s\.pasang/);
    // Choosing a missing shell does nothing (no failed open).
    expect(S).toMatch(/if \(!ada\) return;/);
  });
});

// ── In a browser ──
const { punyaBrowser, describeKalau } = require("./butuh.cjs");
const punyaPty = (() => {
  try {
    require("node-pty");
    return process.platform === "win32";
  } catch (_) {
    return false;
  }
})();
const whenPossible = describeKalau(punyaBrowser() && punyaPty);

whenPossible("the picker in the panel (needs playwright)", () => {
  let server: any;
  beforeAll(async () => {
    server = spawn(process.execPath, [path.join(AKAR, "server.cjs")], {
      cwd: AKAR,
      env: { ...process.env, PORT: String(PORT + 1) },
      stdio: "ignore",
    });
    for (let i = 0; i < 60; i++) {
      const ok = await new Promise((res) => {
        const r = http.get(
          {
            host: "127.0.0.1",
            port: PORT + 1,
            path: "/healthz",
            timeout: 1000,
          },
          (x: any) => res(x.statusCode === 200),
        );
        r.on("error", () => res(false));
        r.on("timeout", () => {
          r.destroy();
          res(false);
        });
      });
      if (ok) break;
      await tidur(500);
    }
  }, 60000);
  afterAll(() => {
    try {
      server.kill();
    } catch (_) {}
  });

  test("a shell that is not installed cannot be chosen", async () => {
    const { chromium } = require("playwright");
    const b = await chromium.launch();
    try {
      const ctx = await b.newContext({
        viewport: { width: 1400, height: 900 },
      });
      await ctx.addInitScript(() =>
        localStorage.setItem("wolfspace_migrated", "1"),
      );
      const p = await ctx.newPage();
      // Force one shell missing regardless of the test machine, so the
      // disabled path is always exercised.
      await p.route("**/api/terminal/shells", (route: any) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            { nama: "Command Prompt", nilai: "cmd.exe", ada: true },
            {
              nama: "PowerShell 7 (pwsh)",
              nilai: "pwsh.exe",
              ada: false,
              pasang: "winget install Microsoft.PowerShell",
            },
          ]),
        }),
      );
      await p.goto("http://127.0.0.1:" + (PORT + 1) + "/", {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      await p.waitForTimeout(800);
      await p.addStyleTag({
        content: ".project-picker-screen{display:none !important}",
      });
      await p.click(".sb-sec:has-text('Tools')");
      await p.waitForTimeout(200);
      await p.click(".sb-group :text-is('Terminal')");
      await p.waitForSelector('[data-panel="terminal"] .xterm', {
        timeout: 20000,
      });
      await p.waitForTimeout(1500);
      await p.click('[data-panel="terminal"] [title="Choose shell"]');
      await p.waitForTimeout(500);
      const rows = await p.$$eval(
        '[data-panel="terminal"] .menu-item',
        (bs: any[]) =>
          bs.map((x) => ({ t: x.textContent, disabled: (x as any).disabled })),
      );
      const pwsh = rows.find((r: any) => /pwsh/.test(r.t));
      expect(pwsh.disabled).toBe(true);
      expect(pwsh.t).toMatch(/not installed/);
      const cmd = rows.find((r: any) => /Command Prompt/.test(r.t));
      expect(cmd.disabled).toBe(false);
      // Clicking the disabled one opens no terminal and leaves the menu.
      const sebelum = await p.$$eval(
        '[data-panel="terminal"] .term-row',
        (es: any[]) => es.length,
      );
      await p
        .locator('[data-panel="terminal"] .menu-item', { hasText: "pwsh" })
        .click({ force: true });
      await p.waitForTimeout(600);
      const sesudah = await p.$$eval(
        '[data-panel="terminal"] .term-row',
        (es: any[]) => es.length,
      );
      expect(sesudah).toBe(sebelum);
      // No "File not found" error was written to any terminal.
      const teks = await p.evaluate(() => {
        const m = (window as any).__wolfspaceTerminalInstans;
        let out = "";
        for (const i of m.values()) {
          const buf = i.term.buffer.active;
          for (let k = 0; k < buf.length; k++) {
            const l = buf.getLine(k);
            if (l) out += l.translateToString(true) + "\n";
          }
        }
        return out;
      });
      expect(teks).not.toMatch(/Could not open|File not found/);
    } finally {
      await b.close();
    }
  }, 120000);
});
