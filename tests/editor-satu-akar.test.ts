// The explorer, the code pane and diagnostics share ONE root: the workspace
// the agent writes into. And a path the tree cannot place under that root is
// kept whole, never mangled into something that opens to a 404.
//
// WHAT WENT WRONG. The agent wrote a file; the explorer listed it; a click
// showed "HTTP 404" and an empty editor. The explorer is fed by the agent's
// write events (absolute paths), but its root was the DIRECTORY OF THE FILE
// THE LIVE BROWSER WAS PREVIEWING -- or the bare project name -- while the
// agent's root was resolveWorkspaceRoot(). Two roots. Every write landed
// outside the tree's root, buildDevTree "dropped the drive" so the path
// would look relative, and the editor asked the server for
// <root>/Users/dave/proj/src/x.ts: nowhere.

const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(
  path.join(__dirname, "..", "public", "app.tsx"),
  "utf8",
);

/** A top-level function's source, TS annotations stripped, as a callable. */
function ambil(nama: string): Function {
  const i = APP.indexOf("function " + nama + "(");
  expect(i).toBeGreaterThan(-1);
  const m = /\r?\n\}\r?\n/.exec(APP.slice(i));
  const src = APP.slice(i, i + m!.index + m![0].length)
    // Casts first: stripping ": any" would otherwise leave "Record<string>".
    .replace(/ as Record<[^>]*>/g, "")
    .replace(/: (any|number|string|boolean)(\[\])?(?=[\s,)=;])/g, "");
  // buildDevTree labels entries through tsjFileType; a stub is enough here,
  // the labels are not what is under test.
  return new Function(
    'const tsjFileType = () => "file";\n' + src + "\nreturn " + nama + ";",
  )();
}

describe("one root", () => {
  test("explorer, code pane and diagnostics read the same resolved root", () => {
    expect(APP).toMatch(
      /const akarEditor =\s*resolveWorkspaceRoot\(selectedProject\) \|\|\s*webProjectRoot\(preview\.url, selectedProject\);/,
    );
    expect(APP).toMatch(/const akarDiag = akarEditor;/);
    // Both panes take it; nothing takes the preview-directory root directly.
    expect((APP.match(/root=\{akarEditor\}/g) || []).length).toBe(2);
    expect(APP).not.toMatch(/root=\{webProjectRoot\(/);
  });

  test("every <root>/<rel> join goes through one helper", () => {
    expect((APP.match(/const abs = absDari\(root, rel\);/g) || []).length).toBe(
      3,
    );
    expect(APP).not.toMatch(/replace\(\/\[\\\/\]\+\$\/, ""\) \+ "\/" \+ rel;/);
  });
});

describe("paths outside the root", () => {
  const buildDevTree = ambil("buildDevTree");
  const absDari = ambil("absDari");

  // buildDevTree returns the flat, ordered list the explorer renders; `rel`
  // is what a click hands to the editor.
  const rels = (t: any[]) => t.map((e) => e.rel);

  test("inside the root: relative, as before", () => {
    const t = buildDevTree(["C:/proj/src/a.ts"], "C:/proj", []);
    expect(rels(t)).toEqual(["src", "src/a.ts"]);
  });

  test("outside the root: the drive is KEPT, not dropped", () => {
    // This is the exact input that produced the 404: an absolute write path
    // under a different root than the tree's. It used to come out as
    // "Users/dave/other/src/a.ts" -- relative-looking, and nowhere.
    const t = buildDevTree(["C:/other/src/a.ts"], "C:/proj", []);
    expect(rels(t)).toEqual([
      "C:",
      "C:/other",
      "C:/other/src",
      "C:/other/src/a.ts",
    ]);
    // And that rel opens by its real name.
    expect(absDari("C:/proj", "C:/other/src/a.ts")).toBe("C:/other/src/a.ts");
  });

  test("absDari joins a relative path and passes an absolute one through", () => {
    expect(absDari("C:/proj/", "src/a.ts")).toBe("C:/proj/src/a.ts");
    expect(absDari("C:/proj", "C:/other/src/a.ts")).toBe("C:/other/src/a.ts");
    expect(absDari("C:/proj", "/tmp/x")).toBe("/tmp/x");
  });

  test("the editor's error names the path it asked for", () => {
    expect(APP).toMatch(/new Error\("HTTP " \+ r\.status \+ " — " \+ abs\)/);
  });
});
