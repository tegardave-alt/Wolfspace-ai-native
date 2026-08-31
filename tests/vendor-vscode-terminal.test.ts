// The vendored VS Code terminal source stays OFF the build path.
//
// WHY A GUARD AT ALL. 179 files and 51,361 lines of someone else's source now
// sit in this repo. It is reference material, but nothing about a directory
// full of .ts files says so on its own -- and this project has already shipped
// an installer carrying things nobody meant to ship. These assertions are what
// keep "reference only" true rather than merely intended.
//
// WHY IT CANNOT SIMPLY BE COMPILED. Measured, not assumed: the first hop alone
// reaches 232 modules outside the copied tree, led by vs/base/common (478
// imports), vs/workbench/services (99) and vs/platform/instantiation (43) --
// the workbench dependency-injection container. Satisfying those imports means
// copying VS Code, not a terminal.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const DIR = path.join(AKAR, "vendor", "vscode-terminal");
const pkg = JSON.parse(
  fs.readFileSync(path.join(AKAR, "package.json"), "utf8"),
);

describe("sumber ter-vendor", () => {
  test("the source is actually here, at the size claimed", () => {
    const hitung = (d: string): number => {
      let n = 0;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) n += hitung(p);
        else if (e.name.endsWith(".ts")) n++;
      }
      return n;
    };
    expect(fs.existsSync(DIR)).toBe(true);
    // Not pinned to an exact count: a re-copy at a newer commit is expected to
    // move it. Pinned to an order of magnitude, so an accidental partial copy
    // or deletion is caught.
    expect(hitung(DIR)).toBeGreaterThan(100);
  });

  test("the licence travelled with the code", () => {
    // MIT requires the notice to accompany copies. A vendored tree without it
    // is a licence violation however well-intentioned the README is.
    const lic = path.join(DIR, "LICENSE.txt");
    expect(fs.existsSync(lic)).toBe(true);
    expect(fs.readFileSync(lic, "utf8")).toMatch(/Microsoft Corporation/);
  });

  test("provenance is recorded, including the exact commit", () => {
    const readme = fs.readFileSync(path.join(DIR, "README.md"), "utf8");
    expect(readme).toMatch(/microsoft\/vscode/);
    expect(readme).toMatch(/[0-9a-f]{40}/);
    const notis = fs.readFileSync(
      path.join(AKAR, "THIRD-PARTY-NOTICES.md"),
      "utf8",
    );
    expect(notis).toMatch(/vendor\/vscode-terminal/);
  });
});

describe("tetap di luar jalur build", () => {
  test("it is not in the installer allowlist", () => {
    // build.files is an ALLOWLIST, so absence is what keeps it out. Asserting
    // that absence means a later 'vendor/**' added in passing is caught here
    // rather than in a 3 MB heavier installer nobody inspected.
    const files: string[] = (pkg.build && pkg.build.files) || [];
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f).not.toMatch(/(^|\/)vendor/);
  });

  test("jest does not run VS Code's own test files", () => {
    // The copied tree carries its own .test.ts files. Without this they are
    // collected and fail, because they import a framework that is not here.
    const abai: string[] = pkg.jest.testPathIgnorePatterns || [];
    expect(abai.join("|")).toMatch(/vendor/);
  });

  test("nothing in WOLFSPACE imports from the vendored tree", () => {
    // The moment something does, this stops being reference material and
    // becomes a dependency that cannot compile.
    const lewati =
      /node_modules|[\/]\.git[\/]|dist-app|_agent_backups|\.wolfspace|[\/]vendor[\/]/;
    const buruk: string[] = [];
    const jalan = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name).split(path.sep).join("/");
        if (lewati.test(p)) continue;
        if (e.isDirectory()) jalan(p);
        else if (/\.(ts|tsx|cjs|js|mjs)$/.test(e.name)) {
          const isi = fs.readFileSync(p, "utf8");
          if (/(from|require\()\s*['"][^'"]*vendor\/vscode-terminal/.test(isi))
            buruk.push(p);
        }
      }
    };
    jalan(AKAR);
    expect(buruk).toEqual([]);
  });
});
