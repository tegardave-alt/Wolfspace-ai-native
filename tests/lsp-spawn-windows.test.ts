// Starting a language server that npm installed, on Windows.
//
// THE BUG THIS FILE EXISTS FOR was measured, not imagined:
//
//     spawn EINVAL
//
// Since the fix for CVE-2024-27980 Node refuses to spawn .cmd/.bat without a
// shell — and on Windows `typescript-language-server`, `pyright-langserver`,
// `yaml-language-server`, `bash-language-server` and `intelephense` are all
// .cmd shims. Five of the nine servers in the registry, unreachable, on the
// platform this app is developed on.
//
// THE SECOND HALF IS ABOUT DRIFT. agent/mcp-client.ts solved the same problem
// first and its version is pinned by tests against exact source patterns, so it
// was left untouched rather than refactored. Two copies of a quoting rule is
// how a repo grows a bug that only appears in one of them, so the two are
// driven over the same inputs here and must agree — every time, on every input.

const fs = require("fs");
const os = require("os");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const W = require("../core/win-spawn.ts");
const mcp = require("../agent/mcp-client.ts");

jest.setTimeout(30000);

describe("quoting one token for cmd.exe", () => {
  test("a plain token is left alone", () => {
    expect(W.quoteForCmd("--stdio")).toBe("--stdio");
    expect(W.quoteForCmd("gopls")).toBe("gopls");
  });

  test("an empty token still occupies a place on the line", () => {
    // Otherwise the argument silently disappears and every one after it shifts.
    expect(W.quoteForCmd("")).toBe('""');
  });

  test("a space is what breaks an unquoted line", () => {
    // "C:\\Program Files\\..." is the everyday version of this.
    expect(W.quoteForCmd("hugging face")).toBe('"hugging face"');
    expect(W.quoteForCmd("C:\\Program Files\\x\\srv.cmd")).toBe(
      '"C:\\Program Files\\x\\srv.cmd"',
    );
  });

  test("cmd's own operators are quoted", () => {
    for (const ch of ["&", "|", "<", ">", "^", "(", ")"])
      expect(W.quoteForCmd("a" + ch + "b")).toBe('"a' + ch + 'b"');
  });

  test("backslashes double only where they could escape a quote", () => {
    expect(W.quoteForCmd('a\\"b')).toBe('"a\\\\\\"b"');
    expect(W.quoteForCmd("a b\\")).toBe('"a b\\\\"');
  });
});

describe("the two implementations must never disagree", () => {
  const KASUS = [
    "",
    "gopls",
    "--stdio",
    "hugging face",
    "C:\\Program Files\\node\\npx.cmd",
    'a"b',
    'a\\"b',
    "a b\\",
    "a\\\\b",
    "x&y",
    "x|y",
    "x^y",
    "x<y>z",
    "(paren)",
    "tab\there",
    "trailing ",
    " leading",
    "日本語 argumen",
    "a\\\\\\",
    'quote"at"both"ends',
  ];

  test("quoteForCmd matches mcp._kutipCmd on every input", () => {
    expect(typeof mcp._kutipCmd).toBe("function");
    for (const k of KASUS)
      expect([k, W.quoteForCmd(k)]).toEqual([k, mcp._kutipCmd(k)]);
  });
});

describe("choosing the shell", () => {
  const win = process.platform === "win32";

  test("only .cmd and .bat need it, and only on Windows", () => {
    expect(W.needsShell("C:\\x\\srv.cmd")).toBe(win);
    expect(W.needsShell("C:\\x\\srv.BAT")).toBe(win);
    // A real binary is always spawned directly — the safe path, argv vector and
    // all. gopls, rust-analyzer and clangd all ship one.
    expect(W.needsShell("C:\\x\\gopls.exe")).toBe(false);
    expect(W.needsShell("/usr/bin/gopls")).toBe(false);
    expect(W.needsShell("")).toBe(false);
  });
});

describe("a real .cmd actually starts", () => {
  // The end-to-end proof. On Windows this fails with EINVAL without the fix; on
  // other platforms the same script runs as a plain shell script, so the test
  // asserts the same thing everywhere: the child ran and its arguments arrived
  // whole.
  test("arguments with spaces arrive as ONE argument", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uji-spawn-"));
    const probe = path.join(dir, "probe.cjs");
    fs.writeFileSync(
      probe,
      "process.stdout.write(JSON.stringify(process.argv.slice(2)));",
    );
    let cmd: string;
    if (process.platform === "win32") {
      cmd = path.join(dir, "srv.cmd");
      fs.writeFileSync(cmd, '@echo off\r\nnode "' + probe + '" %*\r\n');
    } else {
      cmd = path.join(dir, "srv.sh");
      fs.writeFileSync(cmd, '#!/bin/sh\nexec node "' + probe + '" "$@"\n');
      fs.chmodSync(cmd, 0o755);
    }
    const out: string = await new Promise((done: any) => {
      const p = W.spawnPortable(cmd, ["--stdio", "hugging face"], { cwd: dir });
      let s = "";
      p.stdout.on("data", (b: any) => (s += b.toString()));
      p.on("error", (e: any) => done("ERROR " + e.message));
      p.on("exit", () => done(s));
    });
    expect(out).not.toMatch(/^ERROR/);
    // The measured failure was ["--stdio","hugging","face"]. Three arguments,
    // not two, and nothing in the resulting error points at the cause.
    expect(JSON.parse(out)).toEqual(["--stdio", "hugging face"]);
  });
});
