// How one agent action reads in the timeline.
//
// WHAT WAS ON SCREEN, and why it had to go:
//
//     ▶  ...\wolfspace >  C:\Users\dave\Documents\oi
//     ▶  ...\wolfspace >  Drafting a plan...
//     ▶  ...\wolfspace >  Rencana selesai
//     ▶  ...\wolfspace >  browser
//     ▶  ...\wolfspace >  browser
//
// Four things wrong in five lines:
//
//   1. "...\wolfspace >" is a SHELL PROMPT, and none of this is a shell. It
//      names the app's own folder rather than the workspace, and it repeats on
//      every row carrying no information at all.
//   2. The content was `arg || kind`, so a tool called without an argument
//      printed its own name — two `browser` rows, identical, with no way to
//      tell one call from the other.
//   3. Nothing said whether a step succeeded except when it failed.
//   4. "Rencana selesai" sat in an English UI.
//
// AND THE ROOT CAUSE was that the timeline had TWO row designs. Single rows
// already read "Analyzed src/app.tsx" beside a coloured icon; grouped rows grew
// their own presentation because there was nothing to share. So the mapping is
// now one function, used by both — which is the property this file guards.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");

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
    if (t.startsWith("//") || t.startsWith("*")) continue;
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
const STEPS = tanpaKomentar(baca("public/app/AgentSteps.tsx"));
const BUILD = baca("public/app.build.js");

// The two pure helpers, taken from the source and run rather than restated.
globalThis.self = globalThis;
const Babel = require(path.join(AKAR, "public/vendor/babel.min.js"));
const kode = Babel.transform(baca("public/app/AgentSteps.tsx"), {
  presets: ["react", "typescript"],
  filename: "/app/AgentSteps.tsx",
}).code;
const A = new Function(
  "React",
  "AG_SVG",
  "window",
  kode + "\n; return { aksiGaya, aksiTarget };",
)(
  {
    createElement: () => ({}),
    Fragment: null,
    useState: () => [{}, () => {}],
    useRef: () => ({}),
    useEffect: () => {},
    memo: (f: any) => f,
  },
  {
    bash: "bash",
    grep: "grep",
    read: "read",
    edit: "edit",
    glob: "glob",
    list: "list",
    run: "run",
    write: "write",
  },
  { addEventListener() {} },
);

describe("the shell prompt that was never a shell", () => {
  test("it is gone from the source", () => {
    expect(STEPS).not.toMatch(/wolfspace &gt;/);
    expect(STEPS).not.toMatch(/\\\\wolfspace >/);
  });

  test("and gone from what actually ships", () => {
    // app.build.js is the file the app loads; source alone proves nothing about
    // what is on screen.
    expect(BUILD).not.toMatch(/wolfspace &gt;/);
  });

  test("the row no longer falls back to printing the tool's own name", () => {
    // `arg || kind` is what produced two identical `browser` rows.
    expect(STEPS).not.toMatch(/a\.arg \|\| a\.kind/);
  });
});

describe("one mapping, used by both row kinds", () => {
  test("the single row reads its verb and icon from it", () => {
    const i = STEPS.indexOf("function AgentActionLogRow");
    expect(i).toBeGreaterThan(-1);
    expect(STEPS.slice(i, i + 3000)).toMatch(/aksiGaya\(e\.kind\)/);
  });

  test("the grouped row reads from the SAME one", () => {
    const i = STEPS.indexOf("function GroupedActionRow");
    expect(i).toBeGreaterThan(-1);
    const blok = STEPS.slice(i, i + 4000);
    expect(blok).toMatch(/aksiGaya\(a\.kind\)/);
    expect(blok).toMatch(/aksiTarget\(a\)/);
  });

  test("neither keeps a private if/else chain of its own", () => {
    // The duplicate is what let the two designs drift apart in the first place.
    const n = (STEPS.match(/verb = "Analyzed"/g) || []).length;
    expect(n).toBe(0);
    expect((STEPS.match(/function aksiGaya/g) || []).length).toBe(1);
  });
});

describe("what a kind reads as", () => {
  test("the familiar ones keep their verbs", () => {
    expect(A.aksiGaya("read").verb).toBe("Analyzed");
    expect(A.aksiGaya("replace_file_content").verb).toBe("Edited");
    expect(A.aksiGaya("grep").verb).toBe("Searched");
    expect(A.aksiGaya("glob").verb).toBe("Explored");
    expect(A.aksiGaya("retry").verb).toBe("Retried");
  });

  test("a plan step is a PLAN, not a command", () => {
    // Its arg is a sentence about what the agent is doing, not a target. The
    // old row printed it as though it had been typed at a prompt.
    expect(A.aksiGaya("planner").verb).toBe("Planned");
  });

  test("browsing and searching are told apart", () => {
    // The two rows in the screenshot were both "browser" and read identically.
    expect(A.aksiGaya("browser").verb).toBe("Browsed");
    expect(A.aksiGaya("web_fetch").verb).toBe("Browsed");
    // web_search is a SEARCH, whatever it searches. Calling it "Browsed" to
    // group it with the other web tools would describe it less accurately than
    // the word already available — and agents-kit labels its search items the
    // same way ("Searching the web…").
    expect(A.aksiGaya("web_search").verb).toBe("Searched");
  });

  test("an unknown kind still reads as something", () => {
    expect(A.aksiGaya("sesuatu_yang_baru").verb).toBe("Ran");
    expect(A.aksiGaya("").verb).toBe("Ran");
    expect(A.aksiGaya(null).verb).toBe("Ran");
    expect(A.aksiGaya(undefined).icon).toBeTruthy();
  });
});

describe("what the row shows after the verb", () => {
  test("a string argument is the target", () => {
    expect(A.aksiTarget({ arg: "src/app.tsx" })).toBe("src/app.tsx");
  });

  test("an OBJECT argument yields its first meaningful string", () => {
    // Tools are called with objects as often as with strings, and an object
    // rendered straight out reads as "[object Object]".
    expect(A.aksiTarget({ arg: { url: "https://x.test", depth: 2 } })).toBe(
      "https://x.test",
    );
    expect(A.aksiTarget({ arg: { n: 3, path: "a.py" } })).toBe("a.py");
  });

  test("no argument yields NOTHING, not the tool's own name", () => {
    // Falling back to the kind would repeat the verb; falling back to nothing
    // is honest, and the row still says what ran.
    expect(A.aksiTarget({ kind: "browser" })).toBe("");
    expect(A.aksiTarget({ arg: null, kind: "browser" })).toBe("");
    expect(A.aksiTarget({ arg: {} })).toBe("");
    expect(A.aksiTarget(null)).toBe("");
  });

  test("a blank string is not a target either", () => {
    expect(A.aksiTarget({ arg: { a: "   ", b: "nyata" } })).toBe("nyata");
  });
});

describe("the UI speaks one language", () => {
  test("the planner's own status line is English", () => {
    // "Rencana selesai" was showing in an otherwise English timeline.
    const agent = fs.readFileSync(
      path.join(AKAR, "agent", "self_agent.ts"),
      "utf8",
    );
    expect(agent).not.toMatch(/arg: "Rencana selesai"/);
    expect(agent).toMatch(/arg: "Plan ready"/);
  });
});

describe("the columns line up, and the icons are one colour", () => {
  test("colour left the shared mapping entirely", () => {
    // Six colours in a ten-row list, beside the code that actually wants the
    // attention — and none of them said anything the verb had not already said.
    // Colour is presentation; CSS owns it.
    const i = STEPS.indexOf("function aksiGaya");
    const blok = STEPS.slice(i, i + 1600);
    expect(blok).not.toMatch(/color:/);
    expect(A.aksiGaya("read").color).toBeUndefined();
    expect(A.aksiGaya("edit").color).toBeUndefined();
  });

  test("no row paints its own icon any more", () => {
    expect(STEPS).not.toMatch(/style=\{\{ color: g\.color \}\}/);
    expect(STEPS).not.toMatch(/style=\{\{ color: color \}\}/);
  });

  test("icon and verb both have a fixed width, or nothing lines up", () => {
    // "Ran" and "Analyzed" push the next column to different places, and the
    // list comes out ragged.
    const CSS = baca("public/styles.css");
    const i = CSS.indexOf(".aal-icon {");
    expect(i).toBeGreaterThan(-1);
    expect(CSS.slice(i, i + 260)).toMatch(/width: 16px/);
    expect(CSS.slice(i, i + 260)).toMatch(/flex: none/);
    const j = CSS.indexOf(".aal-verb {");
    expect(j).toBeGreaterThan(-1);
    expect(CSS.slice(j, j + 200)).toMatch(/min-width: 66px/);
    expect(CSS.slice(j, j + 200)).toMatch(/flex: none/);
  });

  test("both renderers put the columns in the SAME order", () => {
    // The single row used to read verb-icon-target while the grouped row read
    // icon-verb-target, so a timeline holding both landed its columns in two
    // different places.
    const satu = STEPS.indexOf("function AgentActionLogRow");
    const blokSatu = STEPS.slice(satu, satu + 4000);
    const ikonSatu = blokSatu.indexOf('className="aal-icon"');
    const verbSatu = blokSatu.indexOf('className="aal-verb"');
    expect(ikonSatu).toBeGreaterThan(-1);
    expect(verbSatu).toBeGreaterThan(ikonSatu);

    const grup = STEPS.indexOf("function GroupedActionRow");
    const blokGrup = STEPS.slice(grup, grup + 4000);
    const ikonGrup = blokGrup.indexOf('className="aal-icon"');
    const verbGrup = blokGrup.indexOf('className="aal-verb"');
    expect(ikonGrup).toBeGreaterThan(-1);
    expect(verbGrup).toBeGreaterThan(ikonGrup);
  });
});

describe("type size, taken from VS Code rather than from memory", () => {
  test("the editor uses VS Code's own Windows/Linux default", () => {
    // EDITOR_FONT_DEFAULTS in src/vs/editor/common/config/fontInfo.ts: 14 on
    // Windows and Linux, 12 on macOS. This editor sat at 13.
    const cfg = baca("public/app/Config.tsx");
    const blok = cfg.slice(cfg.indexOf("function opsiEditor("));
    expect(blok).toMatch(/fontSize: 14/);
  });

  test("the UI base already matches VS Code's workbench, and stays", () => {
    // .monaco-workbench { font-size: 13px } — the app was already there, so the
    // right change was to leave it alone and move the editor.
    const CSS = baca("public/styles.css");
    const i = CSS.indexOf("font-size: 13px");
    expect(i).toBeGreaterThan(-1);
  });
});

describe("the symbol and the word beside it sit on one line", () => {
  const CSS = baca("public/styles.css");

  test("the icon no longer nudges itself down", () => {
    // .aal-icon carried margin-top: 2px, written to sit right under
    // align-items: flex-start. In any row that CENTRED its children instead,
    // that same 2px put the icon below the word next to it — which is exactly
    // the gap between the tool symbol and "Ran".
    const i = CSS.indexOf(".aal-icon {");
    expect(i).toBeGreaterThan(-1);
    expect(CSS.slice(i, i + 200)).not.toMatch(/margin-top/);
  });

  test("the row decides the alignment, once", () => {
    const i = CSS.indexOf(".aal-row {");
    expect(i).toBeGreaterThan(-1);
    // TO THE CLOSING BRACE, not a guessed number of characters. The first
    // version read 400 and the rule's own explanatory comment is ~380 long, so
    // the window stopped one property short of the thing it was checking.
    const aturan = CSS.slice(i, CSS.indexOf("}", i));
    expect(aturan).toMatch(/align-items: center/);
  });

  test("the grouped row uses the SAME class, not its own inline layout", () => {
    // It disagreed with .aal-row on four things at once — alignment, font size,
    // font family and padding — so the columns could not line up however wide
    // they were made. A 66px verb column measured one thing in a 13px UI font
    // and another in a 12px monospace one.
    const i = STEPS.indexOf("function GroupedActionRow");
    const blok = STEPS.slice(i, i + 4000);
    const j = blok.indexOf('className="aal-row"');
    expect(j).toBeGreaterThan(-1);
    // And the layout properties are gone from the inline style beside it.
    const gaya = blok.slice(j, j + 400);
    expect(gaya).not.toMatch(/fontFamily: "monospace"/);
    expect(gaya).not.toMatch(/fontSize: "12px"/);
    expect(gaya).not.toMatch(/alignItems: "center"/);
    expect(gaya).not.toMatch(/padding: "4px 12px"/);
  });

  test("only what is particular to a grouped row stays inline", () => {
    const i = STEPS.indexOf("function GroupedActionRow");
    const blok = STEPS.slice(i, i + 4000);
    const j = blok.indexOf('className="aal-row"');
    expect(blok.slice(j, j + 400)).toMatch(/background: "#21262d"/);
  });
});
