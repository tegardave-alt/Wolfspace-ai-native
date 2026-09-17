// The terminal's output and its handling, measured against VS Code's.
//
// Reference: microsoft/vscode, src/vs/workbench/contrib/terminal --
// common/terminalConfiguration.ts (the defaults), browser/xterm/
// xtermTerminal.ts (what is handed to xterm), browser/terminalInstance.ts
// (windowsPty, rightClickBehavior), and contrib/output (the Output view:
// a channel picker and Clear).
//
// WHAT DIFFERED, AND MATTERED.
//   - Ctrl+C with text selected went to the SHELL as ^C: copying the way
//     everyone copies interrupted the running command, and nothing reached
//     the clipboard. VS Code copies (copySelection while terminalTextSelected).
//   - Right-click did nothing. VS Code on Windows: copy the selection, else
//     paste (rightClickBehavior "copyPaste").
//   - minimumContrastRatio was 1: dark blue on the dark background stayed
//     dark blue. VS Code lifts it to 4.5.
//   - windowsPty was never set, so xterm's ConPTY workarounds were off.
//   - The OUTPUT tab had one pane for two sources; a `/terminal run` result
//     replaced the agent log for good. VS Code's Output view is channels
//     behind a picker, with Clear.

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const baca = (p: string) => fs.readFileSync(path.join(AKAR, p), "utf8");
const PORT = 8186;
const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("what xterm is given (vs terminalConfiguration.ts)", () => {
  const S = baca("public/app/Screens.tsx");
  test("contrast, glyph rescale, word separators, font size", () => {
    expect(S).toMatch(/minimumContrastRatio: 4\.5,/);
    expect(S).toMatch(/rescaleOverlappingGlyphs: true,/);
    expect(S).toMatch(/wordSeparator: " \(\)\[\]\{\}',\\"`\\u2500/);
    expect(S).toMatch(/fontSize: 14,\s*minimumContrastRatio/);
  });
  test("windowsPty is set from the build number the server reports", () => {
    expect(S).toMatch(
      /term\.options\.windowsPty = \{\s*backend: "conpty",\s*buildNumber: data\.windowsBuild,/,
    );
    expect(baca("server.ts")).toMatch(
      /return \{ id, shell, cwd, windowsBuild \};/,
    );
  });
  test("copy/paste keys and right-click follow VS Code on Windows", () => {
    expect(S).toMatch(/term\.attachCustomKeyEventHandler\(/);
    expect(S).toMatch(
      /k === "c" && \(e\.shiftKey \|\| term\.hasSelection\(\)\)/,
    );
    expect(S).toMatch(/el\.addEventListener\("contextmenu"/);
    expect(S).toMatch(
      /if \(term\.hasSelection\(\)\) \{\s*salinSeleksi\(\);\s*term\.clearSelection\(\);\s*\} else tempelDariPapan\(\);/,
    );
  });
  test("OUTPUT has a channel picker and Clear", () => {
    expect(S).toMatch(/className="output-saluran"/);
    expect(S).toMatch(/<option value="agent">Agent<\/option>/);
    expect(S).toMatch(
      /<option value="command">Command \(\/terminal run\)<\/option>/,
    );
    expect(S).toMatch(/title="Clear Output"/);
    // The command result no longer hides the agent log by precedence.
    expect(S).not.toMatch(/if \(terminalOutput\) return terminalOutput;/);
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

whenPossible("the panel (needs playwright)", () => {
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

  test("options land; Ctrl+C copies without interrupting; right-click pastes; OUTPUT channels", async () => {
    const { chromium } = require("playwright");
    const b = await chromium.launch();
    try {
      const ctx = await b.newContext({
        viewport: { width: 1400, height: 900 },
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
      await p.click(".sb-sec:has-text('Tools')");
      await p.waitForTimeout(200);
      await p.click(".sb-group :text-is('Terminal')");
      await p.waitForSelector('[data-panel="terminal"] .xterm', {
        timeout: 20000,
      });
      const isiBuffer = () =>
        p.evaluate(() => {
          const i = [
            ...(window as any).__wolfspaceTerminalInstans.values(),
          ].find((x: any) => x.el.style.display !== "none");
          const buf = i.term.buffer.active;
          const out: string[] = [];
          for (let k = 0; k < buf.length; k++) {
            const l = buf.getLine(k);
            if (l) out.push(l.translateToString(true));
          }
          return out.join(String.fromCharCode(10));
        });
      const tunggu = async (pola: RegExp, ms = 15000) => {
        const mulai = Date.now();
        while (Date.now() - mulai < ms) {
          const t = await isiBuffer();
          if (pola.test(t)) return t;
          await p.waitForTimeout(250);
        }
        return await isiBuffer();
      };
      await tunggu(/>\s*$/);
      // The typing goes to a SECOND terminal running cmd.exe. PowerShell
      // under a loaded machine prints its prompt, then loads its profiles,
      // and PSReadLine loses keys typed in that gap -- a PowerShell trait
      // that VS Code shares, not what is under test here.
      await p.click('[data-panel="terminal"] [title="Choose shell"]');
      await p.click("button:has-text('Command Prompt')");
      await p.waitForFunction(
        () => {
          const v = [
            ...(window as any).__wolfspaceTerminalInstans.values(),
          ].filter((x: any) => x.el.style.display !== "none");
          return v.length === 1 && v[0].shell === "cmd.exe";
        },
        null,
        { timeout: 15000 },
      );
      await tunggu(/[A-Za-z]:\\[^\r\n]*>\s*$/);
      await p.waitForTimeout(1500);

      const opsi = await p.evaluate(() => {
        const i = [...(window as any).__wolfspaceTerminalInstans.values()][0];
        const o = i.term.options;
        return {
          contrast: o.minimumContrastRatio,
          pty: o.windowsPty,
          fontSize: o.fontSize,
        };
      });
      expect(opsi.contrast).toBe(4.5);
      expect(opsi.fontSize).toBe(14);
      expect(opsi.pty && opsi.pty.backend).toBe("conpty");
      expect(opsi.pty.buildNumber).toBeGreaterThan(0);

      // Ctrl+C with a selection: to the clipboard, not to the shell.
      await p.keyboard.type("echo tanda-salin");
      await p.keyboard.press("Enter");
      expect(await tunggu(/^tanda-salin$/m)).toMatch(/^tanda-salin$/m);
      // And the prompt after it, so the snapshot below is of a shell at rest.
      await tunggu(/tanda-salin[^>]*>\s*$/);
      await p.evaluate(() => navigator.clipboard.writeText(""));
      await p.evaluate(() => {
        const i = [...(window as any).__wolfspaceTerminalInstans.values()].find(
          (x: any) => x.el.style.display !== "none",
        );
        const buf = i.term.buffer.active;
        for (let k = buf.length - 1; k >= 0; k--) {
          if (buf.getLine(k).translateToString(true).trim() === "tanda-salin") {
            i.term.select(0, k, 11);
            break;
          }
        }
      });
      expect(
        await p.evaluate(() =>
          [...(window as any).__wolfspaceTerminalInstans.values()]
            .find((x: any) => x.el.style.display !== "none")
            .term.getSelection(),
        ),
      ).toBe("tanda-salin");
      const sebelum = await isiBuffer();
      await p.keyboard.press("Control+c");
      await p.waitForTimeout(800);
      expect(await p.evaluate(() => navigator.clipboard.readText())).toBe(
        "tanda-salin",
      );
      // No ^C reached the shell: the buffer did not grow a prompt line.
      expect((await isiBuffer()).trimEnd()).toBe(sebelum.trimEnd());

      // Right-click with nothing selected: paste.
      await p.evaluate(() => {
        [...(window as any).__wolfspaceTerminalInstans.values()]
          .find((x: any) => x.el.style.display !== "none")
          .term.clearSelection();
        return navigator.clipboard.writeText("echo tempel-kanan");
      });
      // The VISIBLE terminal's screen -- the first instance (PowerShell) is
      // still mounted, hidden, and has no box.
      const layar = await p.evaluate(() => {
        const i = [...(window as any).__wolfspaceTerminalInstans.values()].find(
          (x: any) => x.el.style.display !== "none",
        );
        const r = i.el.querySelector(".xterm-screen").getBoundingClientRect();
        return { x: r.x, y: r.y };
      });
      await p.mouse.click(layar.x + 100, layar.y + 50, { button: "right" });
      expect(await tunggu(/echo tempel-kanan/)).toMatch(/echo tempel-kanan/);
      expect(await p.$("#menu-teks")).toBeNull();

      // OUTPUT: two channels, Clear on the one in view.
      await p.click('[data-panel="terminal"] button:has-text("OUTPUT")');
      const pilihan = await p.$$eval(
        '[data-panel="terminal"] .output-saluran option',
        (os: any[]) => os.map((o) => o.value),
      );
      expect(pilihan).toEqual(["agent", "command"]);
      // A chat message appears in the Agent channel...
      await p.evaluate(() =>
        window.dispatchEvent(
          new CustomEvent("WOLFSPACE:send-composer", {
            detail: "hello from the test",
          }),
        ),
      );
      await p.waitForSelector(".msg.model .bubble-model", { timeout: 15000 });
      await p.waitForTimeout(500);
      const isi = await p.$eval(
        '[data-panel="terminal"] .output-isi',
        (e: any) => e.textContent,
      );
      expect(isi).toMatch(/\[Main UI AI Output #1\]/);
      // ...and Clear empties that channel without touching the chat.
      await p.click('[data-panel="terminal"] [title="Clear Output"]');
      await p.waitForTimeout(200);
      expect(
        await p.$eval(
          '[data-panel="terminal"] .output-isi',
          (e: any) => e.textContent,
        ),
      ).not.toMatch(/Main UI AI Output/);
      expect(await p.$(".msg.model .bubble-model")).not.toBeNull();
    } finally {
      await b.close();
    }
  }, 120000);
});
