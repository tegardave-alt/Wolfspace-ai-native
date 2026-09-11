// Dragging an editor tab into the chat.
//
// WHAT THIS IS NOT, and the distinction is the whole design. An ATTACHMENT is a
// file from outside the project: it is uploaded, it gets an att_… handle, and
// the agent reads it through attachment_read because it has no address inside
// the worktree. A file dragged out of an editor tab is the opposite — it is
// already in the workspace, at a path the agent's own read and edit tools can
// reach. Routing it through the upload pipeline would copy it, hand the agent a
// handle to the duplicate, and leave every edit landing on the copy rather than
// on the file the user is looking at.
//
// THE SECOND TRAP is that the tab strip ALREADY drags. `text/plain` carries the
// tab's path so tabs can be reordered, and a composer that accepted that would
// turn every sideways tab drag into an attempt to attach something. So the two
// gestures are told apart by the payload — a dedicated MIME type — rather than
// by guessing from coordinates.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");

globalThis.self = globalThis;
const Babel = require(path.join(AKAR, "public/vendor/babel.min.js"));

/** Strip comments LINE-WISE. A "/*" inside a line comment opens a phantom
 *  block comment for the naive regex version and eats the code under test. */
function tanpaKomentar(src: string) {
  const out: string[] = [];
  let dalam = false;
  for (const baris of src.split("\n")) {
    const t = baris.trim();
    const tutup = t.endsWith("*/") || t.endsWith("*/}");
    if (dalam) {
      if (tutup) dalam = false;
      continue;
    }
    if (t.startsWith("//")) continue;
    if (t.startsWith("/*") || t.startsWith("{/*")) {
      if (!tutup) dalam = true;
      continue;
    }
    out.push(baris);
  }
  return out.join("\n");
}

const baca = (rel: string) =>
  fs.readFileSync(path.join(AKAR, rel), "utf8").replace(/\r\n/g, "\n");

// The rules are taken FROM THE SOURCE and run, not restated here according to
// my reading of them.
const React: any = {
  createElement: () => ({}),
  Fragment: null,
  memo: (f: any) => f,
  forwardRef: (f: any) => f,
  useState: () => [],
  useRef: () => ({}),
  useEffect: () => {},
  useMemo: (f: any) => f(),
  useCallback: (f: any) => f,
  useLayoutEffect: () => {},
  createContext: () => ({}),
  useContext: () => ({}),
};
const kode = Babel.transform(baca("public/app/Components.tsx"), {
  presets: ["react", "typescript"],
  filename: "/app/Components.tsx",
}).code;
const C = new Function(
  "React",
  "window",
  "document",
  "localStorage",
  "wwApi",
  kode +
    "\n; return { fileRefDari, fileRefDariDrop, tambahFileRef, blokFileRef," +
    " gabungDenganRef, DRAG_JENIS_BERKAS };",
)(
  React,
  { addEventListener() {}, removeEventListener() {} },
  { addEventListener() {}, createElement: () => ({ style: {} }) },
  { getItem: () => null, setItem: () => {} },
  async () => null,
);

describe("what a dragged tab becomes", () => {
  test("a path splits into a name and the folder it lives in", () => {
    // The folder is the one thing a bare filename loses, and two files called
    // main.py in different packages are otherwise indistinguishable in the chip.
    expect(C.fileRefDari("src/pkg/main.py")).toEqual({
      id: "ref:src/pkg/main.py",
      kind: "ref",
      path: "src/pkg/main.py",
      name: "main.py",
      dir: "src/pkg",
    });
  });

  test("Windows separators are normalised", () => {
    // The tab strip holds whatever the file tree gave it, and on this platform
    // that is a backslash path. The agent is told forward slashes.
    const r = C.fileRefDari("src\\pkg\\main.py");
    expect(r.path).toBe("src/pkg/main.py");
    expect(r.name).toBe("main.py");
  });

  test("a file at the top has no folder, not the string 'undefined'", () => {
    expect(C.fileRefDari("sd.py").dir).toBe("");
    expect(C.fileRefDari("sd.py").name).toBe("sd.py");
  });

  test("nothing at all is nothing", () => {
    expect(C.fileRefDari("")).toBe(null);
    expect(C.fileRefDari(null)).toBe(null);
  });

  test("the id is the path, so the same file cannot be added twice", () => {
    const a = C.fileRefDari("a.py");
    const b = C.fileRefDari("a.py");
    expect(a.id).toBe(b.id);
    expect(C.tambahFileRef([a], b)).toHaveLength(1);
    expect(C.tambahFileRef([a], C.fileRefDari("b.py"))).toHaveLength(2);
    expect(C.tambahFileRef([a], null)).toEqual([a]);
  });
});

describe("telling a tab REORDER from a tab DROPPED INTO CHAT", () => {
  const dt = (types: any) => ({
    getData: (t: string) => types[t] || "",
    types: Object.keys(types),
  });

  test("the dedicated type is accepted", () => {
    const r = C.fileRefDariDrop(
      dt({ "text/plain": "a.py", [C.DRAG_JENIS_BERKAS]: "a.py" }),
    );
    expect(r && r.path).toBe("a.py");
  });

  test("text/plain ALONE is refused — that is a tab being reordered", () => {
    // The bug this prevents: dragging a tab two places to the left would also
    // attach it to the chat.
    expect(C.fileRefDariDrop(dt({ "text/plain": "a.py" }))).toBe(null);
  });

  test("a drop carrying nothing is refused", () => {
    expect(C.fileRefDariDrop(dt({}))).toBe(null);
    expect(C.fileRefDariDrop(null)).toBe(null);
  });
});

describe("what the model is told", () => {
  const refs = [C.fileRefDari("src/a.py"), C.fileRefDari("b.ts")];

  test("paths, and an instruction to open them directly", () => {
    const blok = C.blokFileRef(refs);
    expect(blok).toMatch(/already in the workspace/);
    expect(blok).toContain("- src/a.py");
    expect(blok).toContain("- b.ts");
  });

  test("it is NOT the attachment shape", () => {
    // `[Terlampir] … id: att_…` tells the agent to use attachment_read, which
    // is exactly wrong for a file it can simply open.
    const blok = C.blokFileRef(refs);
    expect(blok).not.toMatch(/Terlampir|att_|attachment_read/);
  });

  test("no references means no block, not an empty heading", () => {
    expect(C.blokFileRef([])).toBe("");
    expect(C.blokFileRef(null)).toBe("");
    expect(C.gabungDenganRef("halo", [])).toBe("halo");
  });

  test("the block is appended to the user's text, never replacing it", () => {
    const out = C.gabungDenganRef("perbaiki ini", refs);
    expect(out.startsWith("perbaiki ini")).toBe(true);
    expect(out).toContain("- src/a.py");
  });

  test("a drop with no typed message still says something", () => {
    // Dragging a file in and pressing send is a complete request on its own.
    expect(C.gabungDenganRef("", refs)).toContain("- src/a.py");
  });
});

describe("both surfaces, and the tab that feeds them", () => {
  const TAB = tanpaKomentar(baca("public/app.tsx"));
  const PICKER = tanpaKomentar(baca("public/app/Screens.tsx"));
  const COMPOSER = tanpaKomentar(baca("public/app/Components.tsx"));

  test("the tab carries BOTH types, so reordering still works", () => {
    const i = TAB.indexOf("onDragStart=");
    expect(i).toBeGreaterThan(-1);
    const blok = TAB.slice(i, i + 600);
    expect(blok).toMatch(/setData\("text\/plain", t\)/);
    expect(blok).toMatch(/setData\(DRAG_JENIS_BERKAS, t\)/);
    // "move" alone forbids the copy that a drop into the chat is.
    expect(blok).toMatch(/effectAllowed = "copyMove"/);
  });

  for (const [nama, src] of [
    ["the picker composer", PICKER],
    ["the main composer", COMPOSER],
  ] as [string, string][]) {
    test(nama + " accepts the drop", () => {
      expect(src).toMatch(/types\.includes\(DRAG_JENIS_BERKAS\)/);
      expect(src).toMatch(/fileRefDariDrop\(e\.dataTransfer\)/);
      expect(src).toMatch(/tambahFileRef\(prev, ref\)/);
    });

    test(nama + " sends the references to the model", () => {
      expect(src).toMatch(/gabungDenganRef\(fullText, fileRefs\)/);
    });

    test(nama + " can send with a reference and no typed text", () => {
      // Dragging a file in and pressing send must not be refused as "empty".
      expect(src).toMatch(/fileRefs\.length === 0/);
    });
  }

  test("the chip for a reference is not the chip for an upload", () => {
    const i = COMPOSER.indexOf('att.kind === "ref"');
    expect(i).toBeGreaterThan(-1);
    const blok = COMPOSER.slice(i, i + 900);
    // No size, no progress bar, no failure state: nothing was uploaded, so
    // none of those can happen.
    expect(blok).not.toMatch(/ukuranBerkas|lam-garis|Uploading/);
    expect(blok).toMatch(/lam-ref/);
  });

  test("the reference chip has styling of its own", () => {
    const css = baca("public/styles.css");
    expect(css).toMatch(/\.lam-ref\s*\{/);
    // And the composer shows a target while a tab is over it: without one the
    // gesture is a guess.
    expect(css).toMatch(/\.komposer-terima\s*\{/);
  });
});
