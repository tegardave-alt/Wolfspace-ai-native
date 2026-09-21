// The findings journal keeps the CONTENT of read files, so the model works
// from it instead of re-reading.
//
// The recognizer block ("you read these files") answered "did I read this?",
// not "what was in it" -- so for a task that needs the whole file, the model
// re-read. Popular agents keep one authoritative copy of each read file's
// content in context (Aider's files-in-the-chat, Cline/Claude Code's read
// results). blokKonteks() is that: full content per path, newest first, within
// a char budget.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const temuan = require(path.join(AKAR, "agent", "temuan.ts"));

const WS = "C:/uji-temuan-konteks";

afterEach(() => temuan.bersihkan(WS));

describe("blokKonteks: the content, not just a sketch", () => {
  test("returns the full content of a read file, marked do-not-re-read", () => {
    temuan.catat(WS, "code.html", "<h1>Hello</h1>\n<p>World</p>", {
      alat: "read",
    });
    const blok = temuan.blokKonteks(WS);
    expect(blok).toContain("code.html");
    expect(blok).toContain("<h1>Hello</h1>");
    expect(blok).toContain("<p>World</p>");
    expect(blok).toMatch(/do not read it again/i);
  });

  test("one copy per path — the latest read wins", () => {
    temuan.catat(WS, "a.js", "const x = 1;", { alat: "read" });
    temuan.catat(WS, "a.js", "const x = 2; // changed", { alat: "read" });
    const blok = temuan.blokKonteks(WS);
    expect(blok).toContain("const x = 2; // changed");
    expect(blok).not.toContain("const x = 1;");
    // Exactly one section for a.js.
    expect((blok.match(/--- a\.js /g) || []).length).toBe(1);
  });

  test("newest file first", () => {
    temuan.catat(WS, "old.txt", "OLD_CONTENT", { alat: "read" });
    temuan.catat(WS, "new.txt", "NEW_CONTENT", { alat: "read" });
    const blok = temuan.blokKonteks(WS);
    expect(blok.indexOf("new.txt")).toBeLessThan(blok.indexOf("old.txt"));
  });

  test("respects a total budget and truncates rather than blowing it", () => {
    const big = "X".repeat(50_000);
    temuan.catat(WS, "big.txt", big, { alat: "read" });
    const blok = temuan.blokKonteks(WS, 8_000);
    expect(blok.length).toBeLessThan(9_000);
    expect(blok).toMatch(/truncated/i);
  });

  test("a failed read is not kept as content", () => {
    temuan.catat(WS, "missing.txt", "[ERROR: file not found]", {
      alat: "read",
    });
    expect(temuan.blokKonteks(WS)).toBe("");
  });

  test("bersihkan clears the content cache too", () => {
    temuan.catat(WS, "x.txt", "data", { alat: "read" });
    expect(temuan.blokKonteks(WS)).not.toBe("");
    temuan.bersihkan(WS);
    expect(temuan.blokKonteks(WS)).toBe("");
  });
});

describe("wiring", () => {
  test("the read tool feeds full content to the journal", () => {
    const src = fs.readFileSync(
      path.join(AKAR, "agent", "tools", "index.ts"),
      "utf8",
    );
    expect(src).toMatch(
      /_t\.catat\(_t\.kunciWs\(wsRoot\), args\.path, content, \{ alat: "read" \}\)/,
    );
  });

  test("self_agent injects the content block alongside the recognizer", () => {
    const src = fs.readFileSync(
      path.join(AKAR, "agent", "self_agent.ts"),
      "utf8",
    );
    expect(src).toMatch(/_temuan\.blokKonteks\(_wsKunci\)/);
    expect(src).toMatch(
      /m\.content \+= \(_blok \|\| ""\) \+ \(_blokIsi \|\| ""\)/,
    );
  });
});
