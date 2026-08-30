// public/app.build.js is the renderer compiled ahead of time. It is GENERATED
// and NOT committed — CI builds it before packaging, and index.html falls back
// to compiling from source when it is absent.
//
// What needs guarding is not a file on disk but the properties the fast path
// depends on. Each of these has a specific way of going wrong silently: the app
// still opens, and only the behaviour quietly differs.

const fs = require("fs");
const path = require("path");
const { bangun, daftarModul } = require("../scripts/build-app.cjs");

const AKAR = path.resolve(__dirname, "..");
const HTML = fs.readFileSync(path.join(AKAR, "public", "index.html"), "utf8");

describe("the renderer build produces what index.html would have compiled", () => {
  const hasil = bangun();
  const modul = daftarModul();

  test("the build succeeds and marks itself as generated", () => {
    expect(hasil).toMatch(/GENERATED FILE/);
    expect(hasil).toContain("npm run build:app");
    expect(hasil.length).toBeGreaterThan(100000);
  });

  test("the load order comes FROM index.html, not a second copy of the list", () => {
    // Two surfaces holding the same list is how this repo has produced bugs
    // before. The builder parses index.html, so adding a component stays a
    // one-line change — this test pins that it really is parsed.
    for (const m of modul.slice(0, -1)) expect(HTML).toContain('"' + m + '"');
    expect(modul[modul.length - 1]).toBe("/app.tsx");
  });

  test("every renderer source is in the list — none silently left out", () => {
    // A component added to public/app/ but forgotten in APP_MODULES is not a
    // build error: it is simply absent at run time, and whatever referenced it
    // throws on first render.
    const nyata = fs
      .readdirSync(path.join(AKAR, "public", "app"))
      // .ts ikut sejak IkonBahasa berhenti berpura-pura JSX — isinya tabel
      // string SVG, tak ada satu pun elemen di dalamnya. Berkas .d.ts
      // DIKECUALIKAN: itu deklarasi tipe, bukan modul yang dimuat saat jalan,
      // dan memasukkannya ke APP_MODULES akan menambah permintaan jaringan
      // untuk berkas yang tak menghasilkan apa pun.
      .filter((f) => /\.(tsx|jsx|ts)$/.test(f) && !/\.d\.ts$/.test(f))
      .map((f) => "/app/" + f)
      .sort();
    expect(modul.filter((m) => m.startsWith("/app/")).sort()).toEqual(nyata);
  });

  test("ONE global scope: concatenated, never bundled", () => {
    // index.html relies on every file sharing one scope — components defined in
    // later files are referenced by earlier ones through hoisting. A bundler
    // would give each its own scope and the app would break at first render.
    expect(hasil.startsWith("// GENERATED FILE")).toBe(true);
    expect(hasil).toContain("(() => {");
    // No module wrapper of any kind reached the output.
    expect(hasil).not.toMatch(/^\s*(import|export)\s/m);
    expect(hasil).not.toContain("__toCommonJS");
  });

  test("JSX really was transformed, and TypeScript really was stripped", () => {
    expect(hasil).toContain("React.createElement");
    // A type annotation surviving into the output would be a syntax error in the
    // browser, and the page would show the Auto-Rollback path instead of the app.
    expect(() => new Function(hasil)).not.toThrow();
  });

  test("index.html prefers the build but can still compile from source", () => {
    // Both halves matter. Without the first, the cost never moves off startup;
    // without the second, a fresh clone and every HMR edit break.
    expect(HTML).toContain("/app.build.js");
    expect(HTML).toContain("Babel.transform");
    expect(HTML).toContain("loadApp({ segar: true })");
  });

  test("something builds it before packaging, since it is not committed", () => {
    const ci = fs.readFileSync(
      path.join(AKAR, ".github", "workflows", "ci.yml"),
      "utf8",
    );
    expect(ci).toContain("npm run build:app");
    expect(ci.indexOf("npm run build:app")).toBeLessThan(
      ci.indexOf("electron-builder --win --dir"),
    );
  });
});
