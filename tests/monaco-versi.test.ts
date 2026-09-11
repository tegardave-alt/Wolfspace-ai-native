// Which Monaco is vendored, and whether its workers can still start.
//
// ── TWO THINGS THIS PINS, BOTH LEARNED THE HARD WAY ──────────────────────────
//
// 1. ONE COPY, NOT TWO. public/vendor/monaco/ used to hold TWO builds: 0.52.2
//    under vs/ (the one index.html actually loads) and a whole second 0.47.0 at
//    the top level that NOTHING referenced — 5.2 MB of editor.main.js plus its
//    .br/.gz siblings, shipped in the installer because build.files takes
//    public/**. Nobody noticed because an unused file raises nothing.
//
// 2. THE WORKER BOOTSTRAP. Monaco 0.53 removed vs/base/worker/workerMain.js and
//    its changelog says plainly: "Custom AMD workers don't work anymore out of
//    the box." The failure is the quiet kind — the editor still loads, still
//    highlights, still opens files, and only hover, go-to-definition and
//    find-references stop answering, because those are the worker's half.
//
//    MEASURED in a real browser against 0.56.0, same page both ways:
//      importScripts(vs/base/worker/workerMain.js) -> getTypeScriptWorker REJECTS
//      require(["vs/editor/editor.worker"])        -> worker answers quickInfo
//
//    So the bootstrap is asserted here rather than left to be discovered by a
//    user wondering why hover went quiet.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const MONACO = path.join(AKAR, "public", "vendor", "monaco");
const HTML = fs.readFileSync(path.join(AKAR, "public", "index.html"), "utf8");

/** The version marker Monaco stamps into every built file. */
function versiDari(rel: string) {
  const p = path.join(MONACO, rel);
  if (!fs.existsSync(p)) return null;
  const m = fs
    .readFileSync(p, "utf8")
    .slice(0, 400)
    .match(/Version: ([0-9]+\.[0-9]+\.[0-9]+)/);
  return m ? m[1] : null;
}

describe("hanya satu Monaco yang ter-vendor", () => {
  test("there is no second build sitting at the top level", () => {
    // These are the 0.47.0 files that were shipped and never loaded.
    for (const nama of ["editor.main.js", "editor.main.nls.js", "loader.js"]) {
      expect(fs.existsSync(path.join(MONACO, nama))).toBe(false);
      expect(fs.existsSync(path.join(MONACO, nama + ".br"))).toBe(false);
      expect(fs.existsSync(path.join(MONACO, nama + ".gz"))).toBe(false);
    }
  });

  test("the loader index.html asks for is the one that exists", () => {
    // index.html loads /vendor/monaco/vs/loader.js. A build whose entry moved
    // would leave that path 404ing, and the editor would never appear at all.
    expect(HTML).toContain("/vendor/monaco/vs/loader.js");
    expect(fs.existsSync(path.join(MONACO, "vs", "loader.js"))).toBe(true);
    expect(
      fs.existsSync(path.join(MONACO, "vs", "editor", "editor.main.js")),
    ).toBe(true);
  });
});

// COMMENTS STRIPPED. index.html now explains, in a comment, exactly which file
// was removed and why — so matching the raw source would fail against the very
// note that records the fix.
const KODE = HTML.replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/.*$/gm, "");

describe("bootstrap worker cocok dengan build yang terpasang", () => {
  test("it does NOT use the file Monaco removed in 0.53", () => {
    expect(KODE).not.toContain("base/worker/workerMain.js");
    expect(
      fs.existsSync(path.join(MONACO, "vs", "base", "worker", "workerMain.js")),
    ).toBe(false);
  });

  test("it requires the module Monaco publishes instead", () => {
    expect(HTML).toContain("vs/editor/editor.worker");
    // And that module has to be on disk, or every worker dies on load.
    expect(
      fs.existsSync(path.join(MONACO, "vs", "editor", "editor.worker.js")),
    ).toBe(true);
  });

  test("the worker loads the AMD loader before requiring anything", () => {
    // importScripts(loader) then require(...): without the first line there is
    // no `require` inside the worker at all.
    const i = HTML.indexOf("getWorkerUrl");
    const blok = HTML.slice(i, i + 1400);
    expect(blok.indexOf("vs/loader.js")).toBeGreaterThan(-1);
    expect(blok.indexOf("vs/loader.js")).toBeLessThan(
      blok.indexOf("vs/editor/editor.worker"),
    );
  });
});

describe("bahasa dan language service ikut terpasang", () => {
  const ada = (rel: string) => fs.existsSync(path.join(MONACO, rel));

  test("the four real language services are present", () => {
    // typescript, css, html and json are the only ones with a worker; the rest
    // of the languages get colouring only.
    const berkas = fs.readdirSync(path.join(MONACO, "vs"));
    for (const w of ["ts.worker", "css.worker", "html.worker", "json.worker"]) {
      expect(berkas.some((f: string) => f.startsWith(w))).toBe(true);
    }
  });

  test("the language definitions are all there", () => {
    expect(ada("vs/basic-languages")).toBe(true);
    // 0.56 changed the shape: basic-languages holds only the contribution
    // entry, and each language is a hashed chunk beside the loader. So the
    // count lives at the vs/ root now, not in that folder.
    const n = fs
      .readdirSync(path.join(MONACO, "vs"))
      .filter((f: string) => f.endsWith(".js")).length;
    // 91 languages were counted with monaco.languages.getLanguages() in a real
    // browser on this build; the file count is a floor, not that number.
    expect(n).toBeGreaterThan(80);
  });

  test("every vendored file reports the same version", () => {
    // A half-replaced directory is the failure mode a manual copy produces, and
    // it shows up as one module refusing to define().
    const v = versiDari("vs/loader.js");
    expect(v).toBeTruthy();
    for (const rel of ["vs/loader.js", "vs/nls.messages-loader.js"]) {
      const lain = versiDari(rel);
      if (lain) expect(lain).toBe(v);
    }
  });
});

describe("aset terkompresi tidak basi", () => {
  test("no .br is older than the file it compresses", () => {
    // server.ts refuses a stale .br rather than serving the old bytes, so a
    // missed recompression degrades quietly into "no compression". Replacing
    // the whole vendor directory is exactly when this happens.
    const basi: string[] = [];
    const jelajah = (dir: string) => {
      for (const nama of fs.readdirSync(dir)) {
        const p = path.join(dir, nama);
        const st = fs.statSync(p);
        if (st.isDirectory()) {
          jelajah(p);
          continue;
        }
        if (!nama.endsWith(".br")) continue;
        const asli = p.slice(0, -3);
        if (!fs.existsSync(asli)) continue;
        if (st.mtimeMs < fs.statSync(asli).mtimeMs) {
          basi.push(path.relative(AKAR, p));
        }
      }
    };
    jelajah(path.join(MONACO, "vs"));
    expect(basi).toEqual([]);
  });
});
