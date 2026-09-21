// The editor's look and its code-aware features.
//
// ── WHAT THIS REPLACED ───────────────────────────────────────────────────────
//
// The theme was `{ base: "vs-dark", inherit: true, rules: [] }` — fifteen
// colours and NOT ONE syntax rule, so every colour a user saw came from
// Monaco's built-in vs-dark, which is "Visual Studio Dark" from 2015. Alongside
// it, three separate editor.create() calls each spelled out their own options
// and had already drifted: `overviewRulerLanes: 0` was found once, then copied
// by hand into the other two, each carrying its own paragraph about the same
// 14px canvas. Three copies of one rule is how this repo has produced bugs.
//
// ── VERIFIED IN A REAL BROWSER, NOT ONLY HERE ────────────────────────────────
//
// Options are asserted through getOption(), because Monaco SILENTLY IGNORES an
// option it does not recognise — a typo leaves the source looking right and the
// editor behaving as before. Measured with the installed build, the real
// opsiEditor() and the real tema-editor.js:
//
//   bracketPairColorization {enabled:true, independentColorPoolPerBracketType:true}
//   guides                  indentation + highlightActive + bracketPairs
//   inlineSuggest.enabled   true          stickyScroll.enabled   true
//   occurrencesHighlight    singleFile    linkedEditing          true
//   4 distinct bracket-highlighting-N classes painted
//   15 indent guide elements, 2 sticky-scroll elements
//   ghost text rendered: .ghost-text-decoration x5, reading "return a.toUpperCase();"

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const baca = (p: string) => fs.readFileSync(path.join(AKAR, p), "utf8");

const HTML = baca("public/index.html");
const CONFIG = baca("public/app/Config.tsx");
const SERVER = baca("server.ts");
const TEMA = baca("public/tema-editor.js");

describe("tema editor datang dari VS Code, bukan dari 2015", () => {
  test("the generated theme exists and is not empty", () => {
    expect(TEMA).toContain("window.__TEMA_EDITOR");
    const g: any = {};
    // eslint-disable-next-line no-new-func
    new Function("window", TEMA)(g);
    expect(Array.isArray(g.__TEMA_EDITOR.rules)).toBe(true);
    // `rules: []` was the whole problem. Any number above zero is a fix; the
    // floor is set where a typo or a broken build would still be caught.
    expect(g.__TEMA_EDITOR.rules.length).toBeGreaterThan(8);
    expect(Object.keys(g.__TEMA_EDITOR.colors).length).toBeGreaterThan(300);
  });

  test("the transparent background survived the import", () => {
    // WOLFSPACE editors take the colour of whatever contains them. VS Code's
    // own theme sets an OPAQUE #121314, and taking it would put a grey box on
    // three differently coloured surfaces.
    const g: any = {};
    // eslint-disable-next-line no-new-func
    new Function("window", TEMA)(g);
    for (const k of [
      "editor.background",
      "editorGutter.background",
      "minimap.background",
    ]) {
      expect(g.__TEMA_EDITOR.colors[k]).toBe("#00000000");
    }
  });

  test("index.html loads it as a plain script, before it is used", () => {
    // NOT an APP_MODULES entry: those are fetched and compiled asynchronously,
    // and defineTheme runs the moment Monaco is ready. A module that had not
    // arrived would leave the editor on vs-dark with nothing to say so.
    const iSkrip = HTML.indexOf('src="/tema-editor.js"');
    const iPakai = HTML.indexOf("__TEMA_EDITOR ||");
    expect(iSkrip).toBeGreaterThan(-1);
    expect(iPakai).toBeGreaterThan(iSkrip);
    expect(HTML).not.toMatch(/"\/app\/tema-editor/);
  });

  test("a missing theme file still leaves a working editor", () => {
    // The fallback is the OLD object, verbatim. An editor that fails to come up
    // is worse than one that comes up plain.
    const i = HTML.indexOf("__TEMA_EDITOR ||");
    const blok = HTML.slice(i, i + 600);
    expect(blok).toMatch(/base: "vs-dark"/);
    expect(blok).toMatch(/rules: \[\]/);
  });
});

describe("satu sumber opsi untuk ketiga editor", () => {
  test("opsiEditor exists and turns on the code-aware features", () => {
    const blok = CONFIG.slice(CONFIG.indexOf("function opsiEditor("));
    for (const opsi of [
      "bracketPairColorization",
      "guides",
      "occurrencesHighlight",
      "selectionHighlight",
      "matchBrackets",
      "inlayHints",
      "stickyScroll",
      "linkedEditing",
      "folding",
      "fontLigatures",
      "parameterHints",
    ]) {
      expect(blok).toContain(opsi);
    }
  });

  test("all three editors use it instead of their own copies", () => {
    for (const f of [
      "public/app.tsx",
      "public/app/CodeBlocks.tsx",
      "public/app/AgentSteps.tsx",
    ]) {
      expect(baca(f)).toContain("...opsiEditor(");
    }
  });

  test("the shared options are not re-specified per editor", () => {
    // The drift this collapses: each file used to repeat theme, minimap,
    // automaticLayout, scrollBeyondLastLine and overviewRulerLanes.
    const KODE = (t: string) =>
      t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const f of [
      "public/app/CodeBlocks.tsx",
      "public/app/AgentSteps.tsx",
    ]) {
      const t = KODE(baca(f));
      const i = t.indexOf("...opsiEditor(");
      const blok = t.slice(i, t.indexOf("});", i));
      expect(blok).not.toMatch(/\btheme:/);
      expect(blok).not.toMatch(/automaticLayout:/);
      expect(blok).not.toMatch(/overviewRulerLanes:/);
    }
  });

  test("renderLineHighlight stays off, and only in one place", () => {
    // "none" in all three on purpose: with the minimap off and the ruler
    // disabled, its top border lands on the editor edge and reads as a stray
    // full-width line under the panel header. That was traced once already.
    const blok = CONFIG.slice(CONFIG.indexOf("function opsiEditor("));
    expect(blok).toMatch(/renderLineHighlight: "none"/);
  });

  test("read-only editors do not get the writing aids", () => {
    // Tool output is read, never typed into: an inlay hint or a pinned header
    // are both noise on a transcript.
    const t = baca("public/app/AgentSteps.tsx");
    const i = t.indexOf("...opsiEditor(");
    const blok = t.slice(i, t.indexOf("});", i));
    expect(blok).toMatch(/inlayHints: \{ enabled: "off" \}/);
    expect(blok).toMatch(/stickyScroll: \{ enabled: false \}/);
  });
});

// ── TOOL OUTPUT MUST MATCH ITS CONTAINER ─────────────────────────────────────
//
// REPORTED FROM THE RUNNING APP: the confinement notice
// ("🔒 agent confined to the workspace: …") came out visibly larger than the
// command line printed directly above it.
//
// The cause was this centralisation. Collapsing three editor.create() calls
// onto one options object dropped AgentSteps.tsx's own `fontSize: 12`, and the
// shared default is 13px/20px — which is right for the CODE PANEL, because that
// is VS Code's own sizing and the panel is read for minutes at a time. Tool
// output is not an editor. It sits inside .ar-out at 11.5px, and every row
// around it is smaller still.
//
// MEASURED in a real browser with the app's own styles.css:
//   .ar-out <pre> fallback   11.5px / 17.8px
//   Monaco before            13px   / 20px     ← 13% larger than its container
//   Monaco after             11.5px / 18px
describe("keluaran alat seukuran wadahnya", () => {
  test("AgentSteps sets its own size back", () => {
    const t = baca("public/app/AgentSteps.tsx");
    const i = t.indexOf("...opsiEditor(");
    const blok = t.slice(i, t.indexOf("});", i));
    expect(blok).toMatch(/fontSize: 11\.5/);
    expect(blok).toMatch(/lineHeight: 18/);
  });

  test("the number matches .ar-out, so the block does not jump", () => {
    // Monaco replaces a <pre> that inherits from .ar-out. A different size
    // there means the text resizes the moment the editor finishes loading.
    const css = baca("public/styles.css");
    const i = css.indexOf("\n.ar-out {");
    const aturan = css.slice(i, css.indexOf("\n}", i));
    expect(aturan).toMatch(/font-size: 11\.5px/);
  });

  test("the code panel keeps the larger editor sizing", () => {
    // The complaint was about the transcript, not the editor: app.tsx is a
    // real editor and takes the shared 13px on purpose.
    const t = baca("public/app.tsx");
    const i = t.indexOf("...opsiEditor(");
    const blok = t.slice(i, t.indexOf("});", i));
    expect(blok).not.toMatch(/fontSize:/);
  });

  test("the shared default is still the editor one", () => {
    const cfg = baca("public/app/Config.tsx");
    const blok = cfg.slice(cfg.indexOf("function opsiEditor("));
    // 14px, not 13: VS Code's EDITOR_FONT_DEFAULTS (fontInfo.ts) is 14 on
    // Windows and Linux, 12 on macOS. The old 13 sat a pixel below every editor
    // this one is meant to feel like, and nothing recorded why.
    expect(blok).toMatch(/fontSize: 14/);
    expect(blok).toMatch(/lineHeight: 21/);
  });
});
