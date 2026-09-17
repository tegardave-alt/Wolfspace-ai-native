// Four terminal bugs that never showed as errors, found by asking the real
// thing -- a PTY behind server.cjs, the panel in headless Chromium.
//
//   1. OUTPUT WAS CUT. The server kept 4 KB of output between two polls;
//      anything longer (npm install, dir /s, a file through `type`) reached
//      the screen as its last 4 KB, cut mid escape sequence. Measured:
//      20,000 characters written, 1,784 shown.
//   2. AN EXITED SHELL LOOKED ALIVE. `exit` deleted the session at once, so
//      the panel's poll met 404 thirteen times a second, showed nothing,
//      and typing went nowhere. The agent's terminal_read answered "(no
//      output yet)" for the same dead shell, forever.
//   3. A SHELL THAT FAILED TO SPAWN LEFT AN ORPHAN. The row was added only on
//      success, so "pwsh" on a machine without pwsh produced an xterm with no
//      row: visible, unlistable, unclosable, and its message blamed the
//      server ("Ensure server is running") for a missing program.
//   4. CTRL+F WAS CAUGHT ON THE WINDOW. Any field that does not stop the
//      event (the chat box, an input) opened the terminal's search when
//      the panel was on its TERMINAL tab. The code editor was already safe:
//      Monaco stops the keystroke itself.

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const PORT = 8184;
const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Polls until fn() is truthy (returning it), or ms have passed. Fixed
 * sleeps fit an idle machine and fail a loaded one (four suites, shells
 * and browsers at once). */
async function sampai<T>(fn: () => Promise<T>, ms = 45000): Promise<T> {
  const mulai = Date.now();
  let terakhir: any;
  while (Date.now() - mulai < ms) {
    terakhir = await fn();
    if (terakhir) return terakhir;
    await tidur(250);
  }
  return terakhir;
}

function post(p: string, body: any): Promise<{ status: number; body: any }> {
  return new Promise((res, rej) => {
    const data = JSON.stringify(body || {});
    const r = http.request(
      {
        host: "127.0.0.1",
        port: PORT,
        path: p,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (x: any) => {
        let b = "";
        x.on("data", (c: any) => (b += c));
        x.on("end", () => {
          let j: any = b;
          try {
            j = JSON.parse(b);
          } catch (_) {}
          res({ status: x.statusCode, body: j });
        });
      },
    );
    r.on("error", rej);
    r.end(data);
  });
}

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

const punyaPty = (() => {
  try {
    require("node-pty");
    return process.platform === "win32";
  } catch (_) {
    return false;
  }
})();
const kalauPty = punyaPty ? describe : describe.skip;

kalauPty("the server's session (HTTP)", () => {
  test("20,000 characters between two polls arrive whole", async () => {
    const o = await post("/api/terminal/open", { shell: "cmd.exe" });
    expect(o.status).toBe(200);
    const id = o.body.id;
    // The prompt first: cmd.exe is up when it has printed one.
    await sampai(async () => {
      const r = await post("/api/terminal/read", { id, clear: false });
      return />\s*$/.test(String(r.body.output || ""));
    });
    await post("/api/terminal/read", { id, clear: true });
    await post("/api/terminal/write", {
      id,
      data: "node -e \"process.stdout.write('x'.repeat(20000)+'END')\"\r",
    });
    // Accumulate across polls until the x's and END have arrived; a single
    // poll would race the process. The 4 KB cap of old would have lost the
    // rest between polls either way -- that is what the count proves.
    let out = "";
    // 20,000 x's fill exactly 200 rows of 100 columns, so END starts a row
    // of its own; the rows are joined before the check.
    const rata = () =>
      out
        .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
        .replace(/\x1b\][^\x07]*\x07/g, "")
        .replace(/[\r\n]/g, "");
    await sampai(async () => {
      const r = await post("/api/terminal/read", { id, clear: true });
      out += String(r.body.output || "");
      return (out.match(/x/g) || []).length >= 20000 && /END/.test(rata());
    });
    // The whole 20,000 arrived -- the old 4 KB cap would have left ~1,800.
    expect((out.match(/x/g) || []).length).toBeGreaterThanOrEqual(20000);
    expect(rata()).toContain("END");
    await post("/api/terminal/close", { id });
  }, 90000);

  test("after `exit` the poller is told, once, and a write is refused with a reason", async () => {
    const o = await post("/api/terminal/open", { shell: "cmd.exe" });
    const id = o.body.id;
    await sampai(async () => {
      const r = await post("/api/terminal/read", { id, clear: false });
      return />\s*$/.test(String(r.body.output || ""));
    });
    await post("/api/terminal/write", { id, data: "exit\r" });
    // Without clear: the entry is still there, marked.
    const lihat = await sampai(async () => {
      const r = await post("/api/terminal/read", { id, clear: false });
      return r.body && r.body.exited ? r : null;
    });
    expect(lihat.status).toBe(200);
    expect(lihat.body.exited).toBe(true);
    expect(lihat.body.output).toMatch(/\[WOLFSPACE\] Process exited/);
    const w = await post("/api/terminal/write", { id, data: "dir\r" });
    expect(w.status).toBe(400);
    expect(String(w.body.error)).toMatch(/has exited/);
    // Draining it (clear) is what removes the entry.
    const ambil = await post("/api/terminal/read", { id, clear: true });
    expect(ambil.body.exited).toBe(true);
    const lagi = await post("/api/terminal/read", { id, clear: true });
    expect(lagi.status).toBe(404);
  }, 90000);

  test("a shell that does not exist answers 400 with git's own reason, and leaves no session", async () => {
    const o = await post("/api/terminal/open", {
      shell: "tidak-ada-shell.exe",
    });
    expect(o.status).toBe(400);
    expect(String(o.body.error)).toMatch(/not found/i);
    const l: any = await new Promise((res) =>
      http.get(
        { host: "127.0.0.1", port: PORT, path: "/api/terminal/list" },
        (x: any) => {
          let b = "";
          x.on("data", (c: any) => (b += c));
          x.on("end", () => res(JSON.parse(b)));
        },
      ),
    );
    expect(l.filter((s: any) => /tidak-ada/.test(s.shell))).toEqual([]);
  }, 15000);
});

kalauPty("the agent's terminal_read", () => {
  const { runSelfTool } = require("../agent/tools.ts");
  const noop = () => {};

  test("a missing session is an error, not '(no output yet)'", async () => {
    const r = await runSelfTool(
      "terminal_read",
      { id: "term_tidak_ada" },
      noop,
    );
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/session not found/);
  });

  test("an exited shell is reported as ended, with its last output", async () => {
    const open = await runSelfTool(
      "terminal_open",
      { cwd: AKAR, shell: "cmd.exe" },
      noop,
    );
    expect(open.ok).toBe(true);
    const id = String(open.output).match(/terminal opened:\s*(\S+)/)![1];
    await sampai(async () => {
      const r = await runSelfTool("terminal_read", { id, clear: false }, noop);
      return />\s*$/.test(String(r.output || ""));
    });
    await runSelfTool("terminal_read", { id, clear: true }, noop);
    await runSelfTool("terminal_write", { id, data: "exit\r" }, noop);
    // terminal_read itself waits up to 2 s; under load the exit takes
    // longer, so it is asked again until the exit line is in the answer.
    let keluaran = "";
    const r = await sampai(async () => {
      const x = await runSelfTool("terminal_read", { id, clear: true }, noop);
      keluaran += String(x.output || "");
      return /Process exited/.test(keluaran) ? x : null;
    });
    expect(r.ok).toBe(true);
    expect(keluaran).toMatch(/Process exited/);
    expect(keluaran).toMatch(/\[session ended/);
    const lagi = await runSelfTool("terminal_read", { id }, noop);
    expect(lagi.ok).toBe(false);
  }, 90000);
});

describe("wiring", () => {
  test("Ctrl+F is scoped to the panel", () => {
    const s = fs.readFileSync(
      path.join(AKAR, "public", "app", "Screens.tsx"),
      "utf8",
    );
    expect(s).toMatch(/const diPanel =\s*\(host && t && host\.contains\(t\)\)/);
  });
  test("the row is added before the session opens, so a failed shell is closable", () => {
    const s = fs.readFileSync(
      path.join(AKAR, "public", "app", "Screens.tsx"),
      "utf8",
    );
    const iRow = s.indexOf(
      "prev.concat([{ key, shell: inst.shell, nama: inst.nama }])",
    );
    const iOpen = s.indexOf("await bukaSesi(inst, shellPilihan);");
    expect(iRow).toBeGreaterThan(-1);
    expect(iOpen).toBeGreaterThan(iRow);
  });
});

// ── In a browser: the panel itself ──
const { punyaBrowser, describeKalau } = require("./butuh.cjs");
const whenPossible = describeKalau(punyaBrowser() && punyaPty);

whenPossible("the panel (needs playwright)", () => {
  test("big output shows whole; exit is announced and Enter respawns; a failed shell has a closable row; Ctrl+F in the chat box stays out of the terminal", async () => {
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
      let baca404 = 0;
      p.on("response", (r: any) => {
        if (r.url().includes("/api/terminal/read") && r.status() === 404)
          baca404++;
      });
      await p.goto("http://127.0.0.1:" + PORT + "/", {
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
      await p.waitForTimeout(2500);
      const isiBuffer = () =>
        p.evaluate(() => {
          const m = (window as any).__wolfspaceTerminalInstans;
          const inst = [...m.values()].find(
            (i: any) => i.el.style.display !== "none",
          );
          const buf = inst.term.buffer.active;
          const out: string[] = [];
          for (let i = 0; i < buf.length; i++) {
            const l = buf.getLine(i);
            if (l) out.push(l.translateToString(true));
          }
          return out.join(String.fromCharCode(10));
        });

      // Waits on the buffer rather than on a fixed delay: a shell under a
      // loaded machine (seven suites, PTYs and browsers at once) takes its
      // time, and a delay that fits an idle one fails there.
      const tungguBuffer = async (
        pola: RegExp | ((b: string) => boolean),
        ms = 45000,
      ) => {
        const cocok =
          typeof pola === "function" ? pola : (b: string) => pola.test(b);
        const mulai = Date.now();
        while (Date.now() - mulai < ms) {
          const b = await isiBuffer();
          if (cocok(b)) return b;
          await p.waitForTimeout(250);
        }
        return await isiBuffer();
      };

      // 1. Whole output.
      await p.keyboard.type(
        "node -e \"process.stdout.write('x'.repeat(20000)+'END')\"",
      );
      await p.keyboard.press("Enter");
      // The whole 20,000 arrived (the old 4 KB cap left ~1,800). END marks
      // the tail; row-wrapping makes strict adjacency unreliable, so the x
      // count is the proof.
      const t1 = await tungguBuffer(
        (b) => (b.match(/x/g) || []).length >= 20000 && /END/.test(b),
      );
      expect((t1.match(/x/g) || []).length).toBeGreaterThanOrEqual(20000);

      // The DEFAULT shell varies by machine — pwsh (PowerShell 7) where it is
      // installed, powershell (Windows PowerShell 5.1) otherwise — so read the
      // running row's own name instead of hardcoding one, or this fails on any
      // box whose default differs from the author's.
      const shellNama = (
        await p.$$eval('[data-panel="terminal"] .term-row', (es: any[]) =>
          es.map((e) => e.textContent.trim()),
        )
      )[0];

      // 2. Exit: announced, row marked, no 404 storm; Enter brings a shell back.
      await p.keyboard.type("exit");
      await p.keyboard.press("Enter");
      expect(await tungguBuffer(/Process exited/)).toMatch(/Process exited/);
      baca404 = 0;
      await p.waitForTimeout(1000);
      expect(baca404).toBe(0);
      expect(
        await p.$$eval('[data-panel="terminal"] .term-row', (es: any[]) =>
          es.map((e) => e.textContent.trim()),
        ),
      ).toEqual([`${shellNama} (exited)`]);
      await p.keyboard.press("Enter");
      await p.waitForFunction(
        (nama: string) =>
          [...document.querySelectorAll('[data-panel="terminal"] .term-row')]
            .map((e: any) => e.textContent.trim())
            .join() === nama,
        shellNama,
        { timeout: 20000 },
      );
      await p.waitForTimeout(2500);
      await p.keyboard.type("echo hidup-lagi");
      await p.keyboard.press("Enter");
      expect(await tungguBuffer(/hidup-lagi/)).toMatch(/hidup-lagi/);

      // 3. A shell that fails to spawn.
      await p.route("**/api/terminal/open", async (route: any) => {
        const body = route.request().postDataJSON() || {};
        if (body.shell === "pwsh.exe")
          return route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ error: "File not found: pwsh.exe" }),
          });
        return route.continue();
      });
      await p.click('[data-panel="terminal"] [title="Choose shell"]');
      await p.click("button:has-text('pwsh')");
      await tungguBuffer(/Could not open/);
      const baris = await p.$$eval(
        '[data-panel="terminal"] .term-row',
        (es: any[]) => es.map((e) => e.textContent.trim()),
      );
      expect(baris).toEqual([shellNama, "pwsh (failed)"]);
      expect(await isiBuffer()).toMatch(
        /Could not open pwsh\.exe: File not found/,
      );
      expect(
        await p.$$eval(
          '[data-panel="terminal"] .xterm',
          (es: any[]) => es.length,
        ),
      ).toBe(2);

      // 4. Ctrl+F in the chat box does not open the terminal's search.
      await p.click(".composer textarea");
      await p.keyboard.press("Control+f");
      await p.waitForTimeout(300);
      expect(
        await p.$('[data-panel="terminal"] input[placeholder="Find"]'),
      ).toBeNull();
    } finally {
      await b.close();
    }
  }, 240000);
});
