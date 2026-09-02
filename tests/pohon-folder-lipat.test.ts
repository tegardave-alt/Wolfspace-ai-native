// Folders that fold, so a project does not arrive as one long pile.
//
// WHAT WAS THERE. The tree rendered every level at once. A folder row drew a
// chevron -- rotated 90 degrees, as if open -- and clicking it did nothing:
// the row's onClick was guarded by `n.type !== "folder"` and its cursor was
// "default". So the control existed, looked live, and was inert. With any real
// number of files that is a wall of rows with no way to put any of it away.
//
// WHY PREFIX AND NOT DEPTH. buildDevTree returns a FLAT list of
// { name, depth, type, rel }. Depth says how deep a row sits but not whose
// child it is, so hiding by depth would close unrelated siblings at the same
// level. The `rel` path is what actually names the ancestor.
//
// NOT VERIFIED IN A RUNNING WINDOW. Source assertions.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const APP = fs
  .readFileSync(path.join(AKAR, "public", "app.tsx"), "utf8")
  .replace(/\r\n/g, "\n");

// Assertions must never read a comment that merely names the thing asserted.
const bersih = APP.split("\n")
  .filter((b: string) => !/^\s*(\/\/|\*)/.test(b))
  .join("\n");

describe("folder bisa dilipat", () => {
  test("closed folders are held as state", () => {
    expect(bersih).toMatch(/const \[terlipat, setTerlipat\] = React\.useState/);
    expect(bersih).toMatch(/const lipatToggle = \(rel: string\)/);
  });

  test("CLOSED is the state held, not open", () => {
    // A fresh tree shows everything, which is what someone opening a project
    // expects; the set stays empty until something is actually folded.
    const m = bersih.match(
      /const \[terlipat, setTerlipat\] = React\.useState<Set<string>>\([\s\S]{0,120}?\);/,
    );
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/new Set<string>\(\)/);
  });

  test("a folder row folds instead of doing nothing", () => {
    expect(bersih).toMatch(
      /n\.type === "folder"\s*\n?\s*\?\s*lipatToggle\(n\.rel \|\| n\.name\)/,
    );
  });

  test("the row no longer claims to be unclickable", () => {
    // cursor:"default" on a folder was half of why the chevron read as
    // decoration.
    expect(bersih).not.toMatch(/cursor: n\.type === "folder" \? "default"/);
  });

  test("rows are hidden by ANCESTOR PATH, not by depth", () => {
    const m = bersih.match(
      /const treeTampil = tree\.filter\([\s\S]*?\n  \}\);/,
    );
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/rel\.startsWith\(f \+ "\/"\)/);
    // The folder itself stays visible; only what is under it goes.
    expect(m![0]).toMatch(/rel !== f/);
  });

  test("the filtered list is what renders", () => {
    // Rendering `tree` while filtering into `treeTampil` would compute the
    // answer and then ignore it.
    expect(bersih).toMatch(/\{treeTampil\.map\(\(n: any, i: number\) => \{/);
    expect(bersih).not.toMatch(/\{tree\.map\(\(n: any, i: number\) => \{/);
  });

  test("the chevron reports the state it controls", () => {
    // Fixed at rotate(90deg), it said "open" even when the folder was shut.
    expect(bersih).toMatch(/terlipat\.has\(n\.rel \|\| n\.name\)/);
    expect(bersih).toMatch(/"rotate\(0deg\)"/);
    expect(bersih).toMatch(/"rotate\(90deg\)"/);
  });

  test("toggling copies the set rather than mutating it", () => {
    // Mutating state in place leaves React with the same reference and no
    // reason to re-render -- the fold would happen and nothing would move.
    const m = bersih.match(
      /const lipatToggle = \(rel: string\)[\s\S]*?\n    \}\);/,
    );
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/const next = new Set\(prev\)/);
  });
});
