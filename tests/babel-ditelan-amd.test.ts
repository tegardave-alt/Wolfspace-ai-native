// Babel disappearing into Monaco's AMD loader.
//
// THE SYMPTOM WAS A LIE. The console printed a clean "VENDOR-LAZY babel 52ms"
// and then "ReferenceError: Babel is not defined", followed by Auto-Rollback.
// A vendor file that loads in 52ms and is then undefined reads like a corrupt
// bundle; the bundle was fine.
//
// THE CAUSE. Monaco ships an AMD loader, so `define.amd` is truthy in this
// page. The vendored Babel bundle is UMD and tests AMD BEFORE the global
// branch, so it registered itself as an anonymous module that nothing ever
// requires. It really did load, and it really did nothing.
//
// Measured in a running window: with `define` visible, window.Babel is
// undefined; with `define` hidden for the load, it is 7.29.0.
//
// THE SECOND BUG THIS EXPOSED. HMR routed `app.build.js` -- the file that IS
// the compiled renderer -- down the .js "soft refresh" branch, which recompiles
// from SOURCE with Babel. So every `npm run build:app` while the app was
// running threw it onto a path it never needed, and that path was broken.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const HTML = fs
  .readFileSync(path.join(AKAR, "public", "index.html"), "utf8")
  .replace(/\r\n/g, "\n");

// Never assert against a comment that merely names the thing being asserted.
const tanpaKomentar = HTML.split("\n")
  .filter((b: string) => !/^\s*\/\//.test(b))
  .join("\n");

describe("Babel vs the AMD loader", () => {
  test("define is hidden while the bundle loads", () => {
    const m = tanpaKomentar.match(
      /window\.__muatBabel = function \(\)[\s\S]*?\n      \};/,
    );
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/var d = window\.define/);
    expect(m![0]).toMatch(/if \(d\) window\.define = undefined/);
  });

  test("define is restored on success AND on failure", () => {
    // `sesudah` runs on load only. A failed fetch must not leave Monaco's
    // loader hidden for the rest of the session.
    const m = tanpaKomentar.match(
      /window\.__muatBabel = function \(\)[\s\S]*?\n      \};/,
    );
    expect(m![0]).toMatch(
      /\.catch\(function \(e\) \{\s*pulihkan\(\);\s*throw e;/,
    );
    // `pulihkan` is also passed as the loader's `sesudah`, which covers the
    // success path. Prettier may break the call across lines, so the argument
    // is matched on its own rather than against a fixed layout.
    expect(m![0]).toMatch(/"\/vendor\/babel\.min\.js",\s*pulihkan\s*\)/);
  });

  test("the vendored bundle really does prefer AMD", () => {
    // If this bundle is ever replaced with one that has no AMD branch, the
    // workaround above becomes dead weight and this test says so.
    const babel = fs.readFileSync(
      path.join(AKAR, "public", "vendor", "babel.min.js"),
      "utf8",
    );
    expect(babel.slice(0, 300)).toMatch(/define\.amd\?define\(\["exports"\]/);
  });
});

describe("HMR and the prebuilt renderer", () => {
  test("app.build.js is handled BEFORE the generic .js branch", () => {
    const iBuild = tanpaKomentar.indexOf('filename.endsWith("app.build.js")');
    const iJs = tanpaKomentar.indexOf('filename.endsWith(".jsx")');
    expect(iBuild).toBeGreaterThan(-1);
    expect(iJs).toBeGreaterThan(-1);
    // Order is the whole fix: the generic branch would swallow it otherwise.
    expect(iBuild).toBeLessThan(iJs);
  });

  test("a rebuilt renderer is re-injected, not recompiled", () => {
    // loadApp() with no argument takes the prebuilt path and never touches
    // Babel; loadApp({segar:true}) is the source-compile path.
    const m = tanpaKomentar.match(
      /filename\.endsWith\("app\.build\.js"\)[\s\S]*?\n          \} else if/,
    );
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/window\.loadApp\(\);/);
    expect(m![0]).not.toMatch(/segar/);
  });
});
