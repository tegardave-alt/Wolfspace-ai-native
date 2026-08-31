// INFO — problems across the whole workspace.
//
// WHAT IT ADDS. A fourth tab beside TERMINAL / DEBUG / OUTPUT holding the
// project's TypeScript diagnostics, with a VERTICAL severity rail as its second
// layer: the tab strip says which panel you are in, the rail says which
// severity you are filtered to.
//
// WHY tsc AND NOT MONACO MARKERS. Monaco only has markers for models it has
// open, so a file nobody opened reports clean however broken it is. A panel
// that answers "no problems" on an unopened tree is worse than no panel, so the
// scan runs the compiler over the whole project instead.
//
// NOT VERIFIED IN A RUNNING WINDOW. The UI assertions below read source. The
// parser tests are real: they run the shipped function over real tsc output.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const baca = (p) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");

// Assertions must never read a comment that merely NAMES the thing being
// asserted — that has passed against absent code in this repo before.
const tanpaKomentar = (t) =>
  t
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((b) => !/^\s*\/\//.test(b))
    .join("\n");

const LAYAR = tanpaKomentar(baca("public/app/Screens.tsx"));
const SERVER = tanpaKomentar(baca("server.ts"));
const { uraiTsc: _uraiTsc } = require("../scripts/urai-tsc.ts");

describe("INFO diagnostics parser", () => {
  const akar = path.resolve("/proyek");

  test("reads file, position, severity, code and message out of one line", () => {
    const baris =
      path.join(akar, "src", "a.ts") +
      "(12,5): error TS2322: Type 'string' is not assignable to type 'number'.";
    const [d] = _uraiTsc(baris, akar);
    expect(d.file).toBe("src/a.ts");
    expect(d.line).toBe(12);
    expect(d.col).toBe(5);
    expect(d.severity).toBe("error");
    expect(d.code).toBe("TS2322");
    expect(d.message).toBe("Type 'string' is not assignable to type 'number'.");
  });

  test("warnings are kept as warnings, not folded into errors", () => {
    // The rail files them on separate rows, so the severity word is read from
    // the output rather than assumed to be "error".
    const baris = path.join(akar, "b.ts") + "(1,1): warning TS6133: unused.";
    expect(_uraiTsc(baris, akar)[0].severity).toBe("warning");
  });

  test("paths come back workspace-relative with forward slashes", () => {
    // The panel prints these; a backslash path and an absolute path are both
    // unreadable in a narrow docked column.
    const baris =
      path.join(akar, "deep", "nested", "c.tsx") +
      "(3,9): error TS1005: ';' expected.";
    expect(_uraiTsc(baris, akar)[0].file).toBe("deep/nested/c.tsx");
    expect(_uraiTsc(baris, akar)[0].file).not.toContain("\\");
  });

  test("non-diagnostic output is dropped, not turned into empty rows", () => {
    const keluaran = [
      "",
      "Found 2 errors in 1 file.",
      "  src/a.ts:12",
      path.join(akar, "a.ts") + "(1,1): error TS1: real.",
    ].join("\n");
    const hasil = _uraiTsc(keluaran, akar);
    expect(hasil).toHaveLength(1);
    expect(hasil[0].message).toBe("real.");
  });

  test("empty and null input yield an empty list, never a throw", () => {
    expect(_uraiTsc("", akar)).toEqual([]);
    expect(_uraiTsc(null, akar)).toEqual([]);
  });
});

describe("INFO endpoint", () => {
  test("the route exists and answers POST", () => {
    expect(SERVER).toMatch(
      /_path === "\/info\/diagnostics" && req\.method === "POST"/,
    );
  });

  test("tsc runs as NODE, not as a second app window", () => {
    // process.execPath is electron.exe in this process. Without the flag the
    // spawn opens another Electron instance instead of running the compiler.
    expect(SERVER).toMatch(/ELECTRON_RUN_AS_NODE: "1"/);
  });

  test("only one scan runs at a time", () => {
    expect(SERVER).toMatch(/if \(_infoBerjalan\)/);
    expect(SERVER).toMatch(/_infoBerjalan = true/);
    expect(SERVER).toMatch(/_infoBerjalan = false/);
  });

  test("a non-zero exit is not treated as failure", () => {
    // tsc exits non-zero whenever it found anything at all, which is the
    // ordinary case for this panel. Only a kill is an error.
    expect(SERVER).toMatch(/err && err\.killed/);
  });

  test("a missing tsconfig answers with a note instead of an error", () => {
    expect(SERVER).toMatch(/no tsconfig\.json in this workspace/);
  });
});

describe("INFO panel", () => {
  test("INFO is a fourth tab in the terminal tab group", () => {
    expect(LAYAR).toMatch(/setActiveTab\("INFO"\)/);
    expect(LAYAR).toMatch(/<span>INFO<\/span>/);
  });

  test("severity tiers are ordered worst first", () => {
    const m = LAYAR.match(/const TINGKAT_INFO = \[([\s\S]*?)\];/);
    expect(m).toBeTruthy();
    const urutan = [...m[1].matchAll(/kunci: "(\w+)"/g)].map((x) => x[1]);
    expect(urutan).toEqual(["error", "warning", "info"]);
  });

  test("the rail is the second layer and it is vertical", () => {
    const m = LAYAR.match(
      /display: activeTab === "INFO" \? "flex" : "none",[\s\S]*?TINGKAT_INFO\.map/,
    );
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/flexDirection: "column"/);
    expect(m[0]).toMatch(/borderRight/);
  });

  test("clicking the lit tier clears the filter rather than stranding it", () => {
    expect(LAYAR).toMatch(/setInfoSaring\(aktif \? "all" : t\.kunci\)/);
  });

  test("an unscanned panel never claims the workspace is clean", () => {
    expect(LAYAR).toMatch(/infoPernah && !infoSibuk && infoDiag\.length === 0/);
  });

  test("the scan is not continuous", () => {
    // Once on first open, then on request. tsc on every keystroke is how a
    // problems panel becomes the reason the app stutters.
    expect(LAYAR).toMatch(/activeTab === "INFO" && !infoPernah && !infoSibuk/);
    const blok = LAYAR.match(/async function pindaiInfo\(\)[\s\S]*?\n  \}/);
    expect(blok).toBeTruthy();
    expect(blok[0]).not.toMatch(/setInterval/);
  });

  test("the workspace root is derived in ONE place", () => {
    // The MCP command resolution drifted between Components and Screens by
    // being written twice; this rule is written once.
    expect(LAYAR).toMatch(/function akarProyek\(proyek: any\)/);
    expect(LAYAR).toMatch(/akarProyek\(selectedProject\)/);
  });
});
