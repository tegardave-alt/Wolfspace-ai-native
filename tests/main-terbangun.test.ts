// electron/main.js is GENERATED from electron/main.ts and is NOT committed —
// .gitignore excludes it, and CI builds it before packaging.
//
// So there is no committed artefact to check for staleness any more. What still
// needs guarding is the thing that mattered underneath: that the build PRODUCES
// what the application requires. These assertions run the real build and read its
// output, which is stricter than reading a file from disk — a stale artefact
// could satisfy the old test, and cannot satisfy this one.

const fs = require("fs");
const { bangun, SRC } = require("../scripts/build-main.cjs");

describe("the electron main build produces a usable main process", () => {
  const hasil = bangun();

  test("the source exists and the build succeeds", () => {
    expect(fs.existsSync(SRC)).toBe(true);
    expect(hasil.length).toBeGreaterThan(1000);
  });

  test("the output marks itself as generated", () => {
    // It lands next to main.ts in a working tree, so anyone opening it must be
    // able to tell in one line that editing it is pointless.
    expect(hasil).toMatch(/GENERATED FILE/);
    expect(hasil).toContain("npm run build:main");
  });

  test("requires stay where the source put them, rather than being bundled", () => {
    // The builder transforms without bundling on purpose: main.ts resolves
    // core.js from unpackedRoot() at run time, and keeps several requires lazy
    // for startup time. If someone switched this build to bundle: true both
    // would break — the first at run time, the second as a silent regression on
    // a budget that was cut from 1071 ms to 314 ms.
    expect(hasil).toContain('require("electron")');
    expect(hasil).toContain("unpackedRoot()");
    // A bundle would have inlined the module bodies and left no bare require of
    // a relative path behind.
    expect(hasil).toMatch(/require\(\s*(["'])\.\/probe\1\s*\)/);
  });

  test("the window the app opens is actually in there", () => {
    // Not merely "the file is non-empty": if these disappeared from the build,
    // packaging would still succeed and the app would open nothing at all.
    expect(hasil).toContain("BrowserWindow");
    expect(hasil).toContain("app.whenReady");
  });

  test("packaging points at the build output, not at the TypeScript source", () => {
    const pkg = JSON.parse(
      fs.readFileSync(require.resolve("../package.json"), "utf8"),
    );
    expect(pkg.build.extraMetadata.main).toBe("electron/main.js");
  });

  test("something builds it before packaging, since it is not committed", () => {
    // This is the guarantee that replaces the staleness check. CI packages with
    // `npx electron-builder` directly, so if that step ever loses its build the
    // package ships an app with no main process — and it builds cleanly.
    const ci = fs.readFileSync(
      require.resolve("../.github/workflows/ci.yml"),
      "utf8",
    );
    expect(ci).toContain("npm run build:main");
    expect(ci.indexOf("npm run build:main")).toBeLessThan(
      ci.indexOf("electron-builder --win --dir"),
    );
  });
});
