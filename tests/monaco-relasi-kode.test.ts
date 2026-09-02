// Hover, go-to-definition and find-references in the code editor.
//
// WHY NONE OF IT WORKED. Monaco's TypeScript worker was vendored from the start
// (public/vendor/monaco/vs/language/typescript) and never switched on. Two
// things were missing, and either alone is enough to make the whole family of
// features inert:
//
//   1. Models were created as createModel(value, language) -- no URI. Monaco
//      then invents a name like inmemory://model/1, and the worker indexes
//      files BY URI. Every file was an island under a made-up name, so
//      `import "./utils"` resolved against nothing.
//   2. No compiler options were ever set, so module resolution and jsx had no
//      configuration to resolve an import with even once the names were real.
//
// It was never a matter of Monaco being an old version.
//
// NOT VERIFIED IN A RUNNING WINDOW. Source assertions.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const baca = (p: string) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");

const APP = baca("public/app.tsx");
const HTML = baca("public/index.html");

describe("model membawa identitas berkas", () => {
  test("createModel is given a real file URI", () => {
    expect(APP).toMatch(/const uri = window\.monaco\.Uri\.file\(abs\)/);
    expect(APP).toMatch(
      /window\.monaco\.editor\.createModel\(teks, bahasaMonaco\(rel\), uri\)/,
    );
  });

  test("an existing URI is reused, not re-created", () => {
    // createModel THROWS when a URI is already taken, and the same path can be
    // opened into both editor groups at once.
    expect(APP).toMatch(/window\.monaco\.editor\.getModel\(uri\) \|\|/);
  });

  test("no anonymous model is left behind", () => {
    // A two-argument call anywhere would put an island back into the worker.
    expect(APP).not.toMatch(/createModel\(\s*teks,\s*bahasaMonaco\(rel\)\s*\)/);
  });
});

describe("worker TypeScript disetel", () => {
  test("compiler options are set for BOTH ts and js", () => {
    // The editor opens .js and .jsx as often as .ts; configuring only the
    // typescript defaults would leave half the tree without resolution.
    expect(HTML).toMatch(
      /ts\.typescriptDefaults\.setCompilerOptions\(opsiTs\)/,
    );
    expect(HTML).toMatch(
      /ts\.javascriptDefaults\.setCompilerOptions\(opsiTs\)/,
    );
  });

  test("imports can actually be resolved", () => {
    expect(HTML).toMatch(/moduleResolution: ts\.ModuleResolutionKind\.NodeJs/);
    expect(HTML).toMatch(/allowJs: true/);
    expect(HTML).toMatch(/jsx: ts\.JsxEmit\.React/);
    // The tree holds .tsx read through a loader, not a tsc build.
    expect(HTML).toMatch(/allowNonTsExtensions: true/);
  });

  test("SEMANTIC validation stays off, syntax stays on", () => {
    // The worker only knows files whose model is open, so it would underline a
    // perfectly good import as missing simply because its target has not been
    // opened yet. INFO already runs tsc over the WHOLE workspace and knows
    // about every file -- two sources of truth, and this one is wrong more
    // often. Syntax validation needs only the file in front of it, and there it
    // is always right.
    expect(HTML).toMatch(/noSemanticValidation: true/);
    expect(HTML).toMatch(/noSyntaxValidation: false/);
  });

  test("it is configured where Monaco becomes available", () => {
    // Setting defaults before the loader has run would throw; setting them
    // after the first model is created would leave that model unresolved.
    const i = HTML.indexOf('require(["vs/editor/editor.main"]');
    const j = HTML.indexOf("setCompilerOptions");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  test("the worker it configures is actually vendored", () => {
    // If the language folder ever stops shipping, these options configure
    // nothing and the features go quiet again with no error anywhere.
    expect(
      fs.existsSync(
        path.join(
          AKAR,
          "public",
          "vendor",
          "monaco",
          "vs",
          "language",
          "typescript",
        ),
      ),
    ).toBe(true);
  });
});
