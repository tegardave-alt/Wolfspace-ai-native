// electron/preload.js is GENERATED from electron/preload.ts, and it is committed
// rather than gitignored — CI and electron-builder package the tree directly,
// without running an npm build step first, so a missing file would ship an app
// whose renderer has no bridge at all.
//
// A committed build artefact only stays honest if something checks it. That is
// this file: it re-runs the real build and compares. It goes red when the source
// changed without rebuilding, and equally when someone edits the generated file
// by hand — the two failures that would otherwise be silent, because the app
// keeps starting and only the behaviour quietly lags behind the source.

const fs = require("fs");
const { bangun, SRC, OUT } = require("../scripts/build-preload.cjs");

describe("electron/preload.js stays in sync with preload.ts", () => {
  test("the source exists, and so does its build output", () => {
    expect(fs.existsSync(SRC)).toBe(true);
    expect(fs.existsSync(OUT)).toBe(true);
  });

  test("preload.js matches a fresh rebuild of preload.ts", () => {
    const onDisk = fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n");
    const rebuilt = bangun().replace(/\r\n/g, "\n");
    // The message names the command, because that is the only thing anyone
    // seeing this test go red needs to do.
    if (onDisk !== rebuilt) {
      throw new Error(
        "electron/preload.js is stale or hand-edited. Run: npm run build:preload",
      );
    }
    expect(onDisk).toBe(rebuilt);
  });

  test("the build output marks itself as generated", () => {
    const content = fs.readFileSync(OUT, "utf8");
    expect(content).toMatch(/GENERATED FILE/);
    expect(content).toContain("npm run build:preload");
  });

  test("the bridge the renderer relies on is actually installed", () => {
    // Not merely "the file is non-empty": if these names disappeared from the
    // build output, window.WOLFSPACE would lack the surface app.jsx uses, and
    // the whole IPC path would die silently while the app still opens.
    const content = fs.readFileSync(OUT, "utf8");
    expect(content).toContain('exposeInMainWorld("WOLFSPACE"');
    for (const channel of [
      "WOLFSPACE:invoke",
      "WOLFSPACE:stream",
      "WOLFSPACE:chunk",
      "WOLFSPACE:cancel",
      "WOLFSPACE:browser",
      "WOLFSPACE:hmr",
      "WOLFSPACE:probe",
    ]) {
      expect(content).toContain(channel);
    }
  });
});
