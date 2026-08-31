// Several terminals at once, as VS Code has them.
//
// THE BACKEND WAS ALREADY THERE. server/routes/terminal.ts has open / write /
// read / resize / close / list, and `terminalSessions` is a Map that mints a
// new id on every open. Nothing about one-terminal-only lived in the server;
// the whole limit was the component, which held one containerRef, one xterm,
// one fitAddon and one sessionIdRef.
//
// WHAT MADE THE CHANGE CONTAINED. termRef / fitRef / sessionIdRef were kept and
// turned into POINTERS at the active terminal. The queued-command path, the
// debug prompt watcher, restartSession and the Run button all read those, and
// none of them had to learn that a list now exists.
//
// NOT VERIFIED BY THESE TESTS: the appearance. These are source assertions.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const baca = (p: string) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");

// Never assert against a comment that merely names the thing being asserted.
const tanpaKomentar = (t: string) =>
  t
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((b: string) => !/^\s*\/\//.test(b))
    .join("\n");

const LAYAR = tanpaKomentar(baca("public/app/Screens.tsx"));
const RUTE = baca("server/routes/terminal.ts");

describe("backend sudah mendukung banyak sesi", () => {
  test("every route the UI needs is already there", () => {
    for (const r of ["open", "write", "read", "resize", "close", "list"]) {
      expect(RUTE).toMatch(new RegExp('"/api/terminal/' + r + '"'));
    }
  });
});

describe("beberapa terminal", () => {
  test("instances are held in a map, not a single ref", () => {
    expect(LAYAR).toMatch(
      /instansRef = useRef<Map<string, any>>\(new Map\(\)\)/,
    );
  });

  test("switching does NOT dispose the instance", () => {
    // A disposed xterm has lost its scrollback, which is most of what a
    // terminal is for. Only closing disposes.
    const m = LAYAR.match(/const pilihTerminal = \([\s\S]*?\n  \};/);
    expect(m).toBeTruthy();
    expect(m![0]).not.toMatch(/dispose\(\)/);
    const t = LAYAR.match(/const tutupTerminal = async \([\s\S]*?\n  \};/);
    expect(t![0]).toMatch(/dispose\(\)/);
  });

  test("input is bound to ITS OWN session, not the active pointer", () => {
    // Reading sessionIdRef inside onData would send what someone types into
    // the visible terminal to whichever session is active when the callback
    // runs -- which is not necessarily the one they typed into.
    const m = LAYAR.match(
      /term\.onData\(\(data: any\) => \{[\s\S]*?\n    \}\);/,
    );
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/inst\.sessionId/);
    expect(m![0]).not.toMatch(/sessionIdRef/);
  });

  test("resize is bound the same way", () => {
    const m = LAYAR.match(
      /term\.onResize\(\(\{ cols, rows \}: any\) => \{[\s\S]*?\n    \}\);/,
    );
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/inst\.sessionId/);
    expect(m![0]).not.toMatch(/sessionIdRef/);
  });

  test("ONE poll loop serves every terminal", () => {
    // A 75 ms interval per terminal would multiply timers by however many are
    // open. The loop walks the map instead.
    const jumlah = (LAYAR.match(/setInterval\(/g) || []).length;
    expect(jumlah).toBe(1);
    expect(LAYAR).toMatch(
      /for \(const inst of Array\.from\(instansRef\.current\.values\(\)\)\)/,
    );
  });

  test("a background session does not trip the debug watcher", () => {
    expect(LAYAR).toMatch(
      /if \(inst\.term === termRef\.current\) periksaAkhirDebug/,
    );
  });

  test("restart updates the instance, not only the pointer", () => {
    // Setting sessionIdRef alone would leave the poll loop reading, and
    // onData writing to, a session that had just been closed.
    expect(LAYAR).toMatch(/const pasangSesi = \(id: any\) => \{/);
    expect(LAYAR).toMatch(/if \(instAktif\) instAktif\.sessionId = id/);
  });

  test("closing the last terminal leaves none, not a dead pane", () => {
    // A pane with no session accepts typing that goes nowhere.
    const m = LAYAR.match(/const tutupTerminal = async \([\s\S]*?\n  \};/);
    expect(m![0]).toMatch(/sessionIdRef\.current = null/);
  });

  test("closing calls the backend, not just the UI", () => {
    const m = LAYAR.match(/const tutupTerminal = async \([\s\S]*?\n  \};/);
    expect(m![0]).toMatch(/"\/api\/terminal\/close"/);
  });
});

describe("kendali di UI", () => {
  test("the session list renders one row per terminal", () => {
    expect(LAYAR).toMatch(/terminals\.map\(\(t: any\) => \{/);
    expect(LAYAR).toMatch(/onClick=\{\(\) => pilihTerminal\(t\.key\)\}/);
  });

  test("the close button does not also select the row it removes", () => {
    const m = LAYAR.match(/tutupTerminal\(t\.key\)/);
    expect(m).toBeTruthy();
    expect(LAYAR).toMatch(
      /e\.stopPropagation\(\);\s*\n\s*tutupTerminal\(t\.key\)/,
    );
  });

  test("there is a new-terminal button and a shell picker", () => {
    expect(LAYAR).toMatch(/title="New Terminal"/);
    expect(LAYAR).toMatch(/title="Choose shell"/);
    expect(LAYAR).toMatch(/SHELL_PILIHAN\.map/);
  });

  test("there is a split control", () => {
    expect(LAYAR).toMatch(/title="Split Terminal"/);
    expect(LAYAR).toMatch(/const pecahTerminal = async \(\)/);
  });

  test("shells are offered without probing the machine first", () => {
    // /api/terminal/open already reports what it could not spawn, and that
    // error lands in the new terminal where it is readable. Filtering here
    // would be a second picture of the machine to keep in step.
    const m = LAYAR.match(/const SHELL_PILIHAN = \[[\s\S]*?\n\];/);
    expect(m).toBeTruthy();
    expect(m![0]).not.toMatch(/existsSync|fetch|probe/i);
  });
});
