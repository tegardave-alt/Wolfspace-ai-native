// Importing into the tree, and the split control that could not be undone.
//
// THREE THINGS, all of them the same complaint: a control that exists but does
// not respond, or does not exist at all.
//
//   - the file tree could CREATE a file or folder but not bring one in, so
//     anything already on disk had to be copied in outside the app
//   - dropdown and context-menu rows were flat: no reaction to the pointer, so
//     the only way to know which row a click would hit was to aim carefully
//   - the split button vanished once the area was split, which left no way
//     back: closing a split meant closing tabs one at a time until the second
//     half emptied itself
//
// NOT VERIFIED IN A RUNNING WINDOW. Source assertions.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const baca = (p: string) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");

const tanpaKomentar = (t: string) =>
  t
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((b: string) => !/^\s*\/\//.test(b))
    .join("\n");

const APP = tanpaKomentar(baca("public/app.tsx"));
const SERVER = tanpaKomentar(baca("server.ts"));
const MAIN = tanpaKomentar(baca("electron/main.ts"));
const CSS = baca("public/styles.css");

describe("impor berkas dan folder", () => {
  test("there is a native picker for FILES, separate from the folder one", () => {
    // The two return different shapes -- one path against many -- and every
    // existing caller of selectFolder expects one.
    expect(MAIN).toMatch(/channel === "selectFiles"/);
    expect(MAIN).toMatch(/properties: \["openFile", "multiSelections"\]/);
    expect(MAIN).toMatch(/return \{ paths: r\.filePaths \}/);
  });

  test("the backend route exists and answers POST", () => {
    expect(SERVER).toMatch(/req\.url === "\/ww\/impor"/);
  });

  test("the destination is pinned inside the root by basename", () => {
    // Whatever the source path was, only its last segment is used, so nothing
    // can be written outside the workspace.
    const m = SERVER.match(/req\.url === "\/ww\/impor"[\s\S]*?\n  \}\n/);
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/namaBebas\(akar, path\.basename\(asal\)\)/);
    expect(m![0]).toMatch(/_kurungDiAkar\(akar, tujuan\)/);
  });

  test("dependency trees and secrets never come in", () => {
    const m = SERVER.match(/req\.url === "\/ww\/impor"[\s\S]*?\n  \}\n/);
    expect(m![0]).toMatch(/"node_modules"/);
    expect(m![0]).toMatch(/"\.git"/);
    expect(m![0]).toMatch(/Q_RAHASIA\.test\(nama\)/);
  });

  test("an existing name is suffixed, never overwritten", () => {
    // Silently replacing a file someone is working on is not an import.
    const m = SERVER.match(/const namaBebas = [\s\S]*?\n      \};/);
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/if \(!fs\.existsSync\(calon\)\) return calon/);
  });

  test("cancelling the dialog is silent, not an error", () => {
    const m = APP.match(
      /const imporDari = async \(jenis: any\)[\s\S]*?\n  \};/,
    );
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/if \(!sumber\.length\) return;/);
  });

  test("import is FOLDED INTO the two existing buttons, not a third and fourth", () => {
    // The first attempt put four controls side by side. Two of them acted on
    // folders and two on files, so the row said "four kinds of thing" when
    // there are two. Each button now opens its own two-row menu instead.
    expect(APP).toMatch(/imporDari\("berkas"\)/);
    expect(APP).toMatch(/imporDari\("folder"\)/);
    expect(APP).toMatch(/onImpor=\{\(rels: any\[\]\)/);
    // Exactly two toolbar buttons remain.
    const tombol = APP.match(/className="btn-reset alat-btn"/g) || [];
    expect(tombol.length).toBe(2);
  });

  test("each button offers New and Import for its own kind", () => {
    const m = APP.match(
      /menuAlat === "folder"[\s\S]*?\n              \)\.map\(/,
    );
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/mulaiBuat\("folder"\)/);
    expect(m![0]).toMatch(/imporDari\("folder"\)/);
    expect(m![0]).toMatch(/mulaiBuat\("berkas"\)/);
    expect(m![0]).toMatch(/imporDari\("berkas"\)/);
  });

  test("the menu rows are the same live rows as everywhere else", () => {
    // Reusing .menu-item rather than restyling: two menus that behave
    // differently under the pointer is how a UI starts feeling arbitrary.
    expect(APP).toMatch(/className="btn-reset menu-item"/);
  });

  test("imported paths are merged, not appended blindly", () => {
    // Importing the same folder twice would otherwise double every row.
    expect(APP).toMatch(/rels\.filter\(\(r: any\) => prev\.indexOf\(r\) < 0\)/);
  });
});

describe("menu tidak lagi datar", () => {
  test("menu rows react to the pointer and to focus", () => {
    expect(CSS).toMatch(/\.menu-item:hover/);
    expect(CSS).toMatch(/\.menu-item:focus-visible/);
    expect(CSS).toMatch(/\.menu-item:active/);
  });

  test("a destructive row warms instead of turning white", () => {
    expect(CSS).toMatch(/\.menu-item\.bahaya:hover/);
  });

  test("toolbar hover lives in CSS, not inline handlers", () => {
    // Inline onMouseLeave forced the background back to transparent, which
    // beat the class rule and killed the transition with it.
    expect(CSS).toMatch(/\.alat-btn:not\(:disabled\):hover/);
    // Anchored on the CLASS rather than on a title. The titles moved into the
    // dropdown rows when the four buttons were folded back into two, and an
    // assertion pinned to wording breaks on every rename while proving nothing
    // about hover.
    const tombol = APP.match(
      /className="btn-reset alat-btn"[\s\S]{0,2500}?<\/button>/g,
    );
    expect(tombol).toBeTruthy();
    expect(tombol!.length).toBe(2);
    for (const t of tombol!) expect(t).not.toMatch(/onMouseEnter/);
  });
});

describe("split editor bisa dibuka DAN ditutup", () => {
  test("the control stays visible once the area is split", () => {
    expect(APP).toMatch(/\{\(bisaPecah \|\| sudahPecah\) && \(/);
  });

  test("it reverses itself rather than repeating", () => {
    expect(APP).toMatch(/sudahPecah\s*\?\s*onTutupPecah && onTutupPecah\(\)/);
    expect(APP).toMatch(/aria-pressed=\{sudahPecah \? true : undefined\}/);
  });

  test("the keyboard shortcut toggles too", () => {
    // Otherwise Ctrl+\ could only ever open a split.
    expect(APP).toMatch(/if \(sudahPecah && onTutupPecah\) onTutupPecah\(\);/);
  });

  test("closing a split MOVES its tabs, it does not drop them", () => {
    // Losing half the open files would make the button dangerous to press,
    // which is the reason it was hidden in the first place.
    const m = APP.match(/const tutupGrup = useCallback[\s\S]*?\n  \}, \[\]\);/);
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/tinggal\.tabs\.concat\(/);
    expect(m![0]).toMatch(/setGrupFokus\(0\)/);
  });

  test("the lit state is styled, so it reads as a state not an action", () => {
    expect(CSS).toMatch(/\.tab-pecah\.aktif/);
  });
});
