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
    // The existence check went async when the route was cleared of every
    // synchronous fs call. The rule it guards is unchanged: a free name is
    // returned as-is, and a taken one gets a suffix.
    expect(m![0]).toMatch(/if \(!\(await ada\(calon\)\)\) return calon/);
    expect(m![0]).toMatch(/dasar \+ "-" \+ i \+ ext/);
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

describe("impor tidak boleh membekukan jendela", () => {
  // FOUND IN THE RUNNING APP, not by these tests. Importing a folder left the
  // main process pegged on one core with Responding=False, and the debug log's
  // last line from that process was "POST /ww/impor" -- nothing after it.
  //
  // TWO causes, both mine:
  //   1. the copy was SYNCHRONOUS. /ww/impor is served through apiCall in
  //      electron/main.ts, which runs in the MAIN process, so cpSync there
  //      freezes the window outright.
  //   2. a source that CONTAINS the workspace copies into itself forever:
  //      importing C:/Users/dave while the workspace is C:/Users/dave/WOLFSPACE
  //      puts the destination inside the source.
  const blok = SERVER.match(/req\.url === "\/ww\/impor"[\s\S]*?\n  \}\n/);

  test("the copy never blocks the thread it runs on", () => {
    expect(blok).toBeTruthy();
    expect(blok![0]).toMatch(/await fs\.promises\.cp\(/);
    expect(blok![0]).toMatch(/await fs\.promises\.copyFile\(/);
    expect(blok![0]).not.toMatch(/fs\.cpSync|fs\.copyFileSync/);
  });

  test("the handler can actually await", () => {
    // Making the copy async while the handler stays sync would fire it and
    // return, answering before a single byte had been written.
    expect(blok![0]).toMatch(/req\.on\("end", async \(\) => \{/);
  });

  test("a folder that contains the workspace is refused", () => {
    expect(blok![0]).toMatch(/const kedalam = path\.relative\(asal, akar\)/);
    expect(blok![0]).toMatch(/contains this workspace/);
  });

  test("there is a ceiling even on an honest import", () => {
    expect(blok![0]).toMatch(/BATAS_IMPOR/);
  });
});

describe("impor tidak menahan thread sama sekali", () => {
  // FOUND IN THE RUNNING APP. After the copy was made async the window stopped
  // freezing, but the probe still reported:
  //
  //   BLOKIR blokir maks 113 ms (naik) p99 36 ms, jendela 15 dtk — (untracked)
  //
  // 113 ms is far under the 5000 ms that earns "Not Responding", so nothing
  // said Not Responding -- it was simply felt. The cause was the piece left
  // behind: the walk that collects what was copied still used readdirSync and
  // statSync, over every file just written, in the MAIN process.
  //
  // "(untracked)" is not a second bug. ukur() times SYNCHRONOUS calls, and
  // this route carried no instrument, so the monitor could say a block
  // happened but not whose it was.
  const blok = SERVER.match(/req\.url === "\/ww\/impor"[\s\S]*?\n  \}\n/);

  test("the route contains NO synchronous fs call at all", () => {
    expect(blok).toBeTruthy();
    const kode = blok![0]
      .split("\n")
      .filter((b: string) => !/^\s*\/\//.test(b))
      .join("\n");
    expect(kode).not.toMatch(
      /fs\.(existsSync|statSync|readdirSync|cpSync|copyFileSync)/,
    );
  });

  test("the collect walk awaits, one entry at a time", () => {
    expect(blok![0]).toMatch(/const kumpulkan = async \(abs: string\)/);
    expect(blok![0]).toMatch(/await fs\.promises\.readdir\(abs\)/);
    expect(blok![0]).toMatch(/await kumpulkan\(path\.join\(abs, e\)\)/);
  });

  test("its callers await it, or the answer would race the walk", () => {
    expect(blok![0]).toMatch(/await kumpulkan\(tujuan\)/);
    expect(blok![0]).toMatch(/await namaBebas\(akar, path\.basename\(asal\)\)/);
  });
});
