// The terminal's colours, taken from VS Code.
//
// WHAT WAS WRONG. The terminal handed xterm five colours: a background, a
// foreground, a cursor pair and a selection. Everything a program prints IN
// COLOUR therefore fell through to xterm's own defaults -- ls, git diff, stack
// traces, compiler output. That is most of what a terminal displays, so the
// panel could never look like VS Code however closely the chrome was matched.
//
// A SECOND BUG THIS UNCOVERED. The old theme set `selection`. xterm 5 renamed
// that option to `selectionBackground`, and an unknown key is ignored in
// silence -- so the selection colour was falling back to a default too. The
// vendored xterm 5.3 bundle knows selectionBackground / selectionForeground /
// selectionInactiveBackground and has no plain `selection` at all.
//
// WHAT WAS NOT TAKEN. Only the colour VALUES. VS Code's terminal is 179 files
// whose first hop alone reaches 232 modules outside itself, so nothing else was
// portable. The licence obligation is recorded in THIRD-PARTY-NOTICES.md.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const baca = (p: string) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");

const TEMA = baca("public/app/TemaTerminalVSCode.ts");
const LAYAR = baca("public/app/Screens.tsx");
const HTML = baca("public/index.html");
const NOTIS = baca("THIRD-PARTY-NOTICES.md");

// The 16 ANSI slots xterm reads. Order is not the test; presence is.
const SLOT = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
];

describe("palet ANSI", () => {
  test("all sixteen slots are defined", () => {
    for (const s of SLOT) {
      expect(TEMA).toMatch(new RegExp("\\b" + s + ':\\s*"#[0-9a-fA-F]{6}"'));
    }
  });

  test("bright and normal are distinct where VS Code makes them distinct", () => {
    // A palette that repeats the normal colour in the bright slot loses the
    // distinction programs rely on for emphasis. VS Code's white is the one
    // deliberate exception, so it is not asserted here.
    const ambil = (k: string) => {
      const m = TEMA.match(new RegExp("\\b" + k + ':\\s*"(#[0-9a-fA-F]{6})"'));
      return m ? m[1]!.toLowerCase() : null;
    };
    for (const w of ["Red", "Green", "Yellow", "Blue", "Magenta", "Cyan"]) {
      const normal = ambil(w.toLowerCase());
      const terang = ambil("bright" + w);
      expect(normal).toBeTruthy();
      expect(terang).toBeTruthy();
      expect(terang).not.toBe(normal);
    }
  });

  test("the values are the ones VS Code ships", () => {
    // Spot-checked against terminalColorRegistry.ts at the recorded commit. If
    // these drift, the palette is no longer the thing it claims to be.
    expect(TEMA).toMatch(/green:\s*"#0DBC79"/);
    expect(TEMA).toMatch(/brightGreen:\s*"#23d18b"/);
    expect(TEMA).toMatch(/blue:\s*"#2472c8"/);
    expect(TEMA).toMatch(/brightBlue:\s*"#3b8eea"/);
    expect(TEMA).toMatch(/red:\s*"#cd3131"/);
    expect(TEMA).toMatch(/foreground:\s*"#CCCCCC"/);
  });
});

describe("terminal memakainya", () => {
  test("the terminal takes the palette, not a five-colour literal", () => {
    expect(LAYAR).toMatch(/theme: TEMA_TERMINAL_VSCODE/);
  });

  test("no stray inline palette is left behind", () => {
    // Two sources of truth for a colour table is how one of them goes stale.
    const m = LAYAR.match(/new window\.Terminal\(\{[\s\S]*?\n    \}\);/);
    expect(m).toBeTruthy();
    expect(m![0]).not.toMatch(/foreground:\s*"#/);
    expect(m![0]).not.toMatch(/background:\s*"#/);
  });

  test("the xterm 5 key is used, not the removed one", () => {
    expect(TEMA).toMatch(/selectionBackground:/);
    expect(TEMA).not.toMatch(/\bselection:/);
  });

  test("the vendored xterm really has no plain `selection` key", () => {
    // If a future xterm accepts it again, this test says so rather than
    // leaving the comment above as folklore.
    const x = fs.readFileSync(
      path.join(AKAR, "public", "vendor", "xterm", "xterm.js"),
      "utf8",
    );
    expect(x).toMatch(/selectionBackground/);
  });

  test("the module is loaded BEFORE the screen that uses it", () => {
    // APP_MODULES is concatenated in order into one scope; a later entry would
    // not be defined when Screens runs.
    const iTema = HTML.indexOf('"/app/TemaTerminalVSCode.ts"');
    const iLayar = HTML.indexOf('"/app/Screens.tsx"');
    expect(iTema).toBeGreaterThan(-1);
    expect(iLayar).toBeGreaterThan(-1);
    expect(iTema).toBeLessThan(iLayar);
  });
});

describe("kewajiban lisensi", () => {
  test("the file names its source, licence and commit", () => {
    expect(TEMA).toMatch(/microsoft\/vscode/);
    expect(TEMA).toMatch(/MIT/);
    expect(TEMA).toMatch(/Microsoft Corporation/);
    expect(TEMA).toMatch(/[0-9a-f]{40}/);
  });

  test("the notice file records the same thing", () => {
    expect(NOTIS).toMatch(/microsoft\/vscode/);
    expect(NOTIS).toMatch(
      /Copyright \(c\) 2015 - present Microsoft Corporation/,
    );
    expect(NOTIS).toMatch(/TemaTerminalVSCode\.ts/);
  });

  test("the notice separates the MIT repo from the proprietary product", () => {
    // The installed VS Code build ships under Microsoft's own licence, and
    // nothing here came from it. Recording that stops a later reader assuming
    // the install is a usable source.
    expect(NOTIS).toMatch(/proprietary/i);
  });
});
