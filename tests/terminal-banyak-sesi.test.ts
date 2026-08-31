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
  test("instances live at MODULE scope, so they outlive the panel", () => {
    // A ref dies with the component. Closing the terminal panel unmounts it,
    // and that used to kill every PTY and dispose every xterm -- reopening
    // gave a blank shell with the history gone.
    expect(LAYAR).toMatch(/const _terminalInstans = new Map<string, any>\(\)/);
    expect(LAYAR).not.toMatch(/instansRef/);
  });

  test("closing the PANEL does not close the terminals", () => {
    const m = LAYAR.match(/hidup = false;[\s\S]*?termRef\.current = null;/);
    expect(m).toBeTruthy();
    expect(m![0]).not.toMatch(/terminal\/close/);
    expect(m![0]).not.toMatch(/dispose\(\)/);
  });

  test("reopening re-attaches the running terminals instead of respawning", () => {
    // An xterm cannot be reopened into a different element without losing its
    // screen, but its element can be appended somewhere else.
    expect(LAYAR).toMatch(/hostRef\.current\.appendChild\(inst\.el\)/);
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
      /for \(const inst of Array\.from\(_terminalInstans\.values\(\)\)\)/,
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

describe("UI tidak kaku", () => {
  const CSS = baca("public/styles.css");

  test("rows and controls use icons, not text glyphs", () => {
    // The first pass drew the controls with bare characters. They render at
    // whatever the font decides, ignore currentColor, and sit differently on
    // every machine.
    // Matched with \s rather than a literal space: prettier moves the first
    // attribute onto its own line whenever the tag is long enough, so pinning
    // a space here would make this test about formatting instead of icons.
    expect(LAYAR).toMatch(/<Icon\.terminal\s/);
    expect(LAYAR).toMatch(/<Icon\.plus\s/);
    expect(LAYAR).toMatch(/<Icon\.split\s/);
    expect(LAYAR).toMatch(/<Icon\.close\s/);
  });

  test("hover is CSS, not React state", () => {
    // Tracking hover in state re-renders the whole list on every pointer move.
    expect(CSS).toMatch(/\.term-row:hover/);
    expect(CSS).toMatch(/\.term-btn:hover/);
    expect(CSS).toMatch(/transition:/);
  });

  test("the close cross is revealed, not always on", () => {
    // Always-visible crosses turn a list of four terminals into a wall of
    // crosses. VS Code shows it on the hovered row and the active one.
    expect(CSS).toMatch(/\.term-row \.term-x\s*\{[^}]*opacity:\s*0/);
    expect(CSS).toMatch(
      /\.term-row:hover \.term-x,?\s*\n?\.term-row\.aktif \.term-x/,
    );
  });

  test("the list is resizable and the width is remembered", () => {
    expect(CSS).toMatch(/\.term-resizer/);
    expect(LAYAR).toMatch(/const mulaiGeserDaftar = \(e: any\)/);
    expect(LAYAR).toMatch(/wolfspace_lebar_daftar_terminal/);
  });

  test("the drag persists the width it ENDED at", () => {
    // The mouseup closure is created once at drag start, so reading state
    // there would save the width the drag began with.
    expect(LAYAR).toMatch(/lebarDaftarRef\.current = w;/);
    expect(LAYAR).toMatch(/String\(lebarDaftarRef\.current\)/);
  });

  test("right-click carries the row's own actions", () => {
    expect(LAYAR).toMatch(/onContextMenu=\{\(e: any\) => \{/);
    expect(LAYAR).toMatch(/setMenuBaris\(\{ key: t\.key/);
  });
});
