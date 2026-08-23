// electron/main.js is GENERATED from electron/main.ts, and it is committed
// rather than gitignored — CI and electron-builder package the tree directly,
// without running an npm build step first, so a missing file would ship an app
// with no main process at all.
//
// A committed build artefact only stays honest if something checks it. That is
// this file: it re-runs the real build and compares. It goes red when the source
// changed without rebuilding, and equally when someone edits the generated file
// by hand — the two failures that would otherwise be silent, because the app
// keeps starting and only the behaviour quietly lags behind the source.

const fs = require("fs");
const { bangun, SRC, OUT } = require("../scripts/build-main.cjs");

describe("electron/main.js stays in sync with main.ts", () => {
  test("the source exists, and so does its build output", () => {
    expect(fs.existsSync(SRC)).toBe(true);
    expect(fs.existsSync(OUT)).toBe(true);
  });

  test("main.js matches a fresh rebuild of main.ts", () => {
    const onDisk = fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n");
    const rebuilt = bangun().replace(/\r\n/g, "\n");
    // The message names the command, because that is the only thing anyone
    // seeing this test go red needs to do.
    if (onDisk !== rebuilt) {
      throw new Error(
        "electron/main.js is stale or hand-edited. Run: npm run build:main",
      );
    }
    expect(onDisk).toBe(rebuilt);
  });

  test("the build output marks itself as generated", () => {
    const content = fs.readFileSync(OUT, "utf8");
    expect(content).toMatch(/GENERATED FILE/);
    expect(content).toContain("npm run build:main");
  });

  test("requires stay where the source put them, rather than being bundled", () => {
    // The builder transforms without bundling on purpose: main.ts resolves
    // core.js from unpackedRoot() at run time, and keeps several requires lazy
    // for startup time. If someone switched this build to bundle: true both
    // would break — the first at run time, the second as a silent regression on
    // a budget that was cut from 1071 ms to 314 ms.
    const content = fs.readFileSync(OUT, "utf8");
    expect(content).toContain('require("electron")');
    expect(content).toContain("unpackedRoot()");
    // A bundle would have inlined the module bodies and left no bare require of
    // a relative path behind.
    expect(content).toMatch(/require\(\s*(["'])\.\/probe\1\s*\)/);
  });

  test("packaging points at the build output, not at the TypeScript source", () => {
    const pkg = JSON.parse(
      fs.readFileSync(require.resolve("../package.json"), "utf8"),
    );
    expect(pkg.build.extraMetadata.main).toBe("electron/main.js");
  });
});
