// electron/preload.js is GENERATED from electron/preload.ts and is NOT committed
// — .gitignore excludes it, and CI builds it before packaging.
//
// So there is no committed artefact to check for staleness any more. What still
// needs guarding is the thing that mattered underneath: that the build PRODUCES
// the bridge the renderer relies on. These assertions run the real build and read
// its output, which is stricter than reading a file from disk — a stale artefact
// could satisfy the old test, and cannot satisfy this one.

const fs = require("fs");
const { bangun, SRC } = require("../scripts/build-preload.cjs");

describe("the preload build produces the bridge the renderer needs", () => {
  const hasil = bangun();

  test("the source exists and the build succeeds", () => {
    expect(fs.existsSync(SRC)).toBe(true);
    expect(hasil.length).toBeGreaterThan(500);
  });

  test("the output marks itself as generated", () => {
    expect(hasil).toMatch(/GENERATED FILE/);
    expect(hasil).toContain("npm run build:preload");
  });

  test("the bridge the renderer relies on is actually installed", () => {
    // Not merely "the file is non-empty": if these names disappeared from the
    // build output, window.WOLFSPACE would lack the surface app.tsx uses, and
    // the whole IPC path would die silently while the app still opens.
    expect(hasil).toContain('exposeInMainWorld("WOLFSPACE"');
    for (const channel of [
      "WOLFSPACE:invoke",
      "WOLFSPACE:stream",
      "WOLFSPACE:chunk",
      "WOLFSPACE:cancel",
      "WOLFSPACE:browser",
      "WOLFSPACE:hmr",
      "WOLFSPACE:probe",
    ]) {
      expect(hasil).toContain(channel);
    }
  });

  test("something builds it before packaging, since it is not committed", () => {
    // This is the guarantee that replaces the staleness check. CI packages with
    // `npx electron-builder` directly, so if that step ever loses its build the
    // package ships a renderer with no bridge at all — and it builds cleanly.
    const ci = fs.readFileSync(
      require.resolve("../.github/workflows/ci.yml"),
      "utf8",
    );
    expect(ci).toContain("npm run build:preload");
    expect(ci.indexOf("npm run build:preload")).toBeLessThan(
      ci.indexOf("electron-builder --win --dir"),
    );
  });
});
