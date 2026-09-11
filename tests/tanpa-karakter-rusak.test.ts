// No replacement characters anywhere in the source.
//
// WHAT WENT WRONG. Nine U+FFFD characters were sitting in four renderer files,
// several of them in text the user reads:
//
//   the provider hint on the settings screen, twice in one line
//   the "Saved in the browser" confirmation, between key and model
//
// U+FFFD is what a decoder emits when a byte sequence is not valid in the
// encoding it was read as. It is never authored on purpose: every one of these
// was a real character — an em dash, a middle dot, an arrow — destroyed in a
// round trip through the wrong encoding.
//
// WHY A TEST AND NOT JUST A FIX. Nothing else catches it. It compiles, it
// passes every other check, prettier reformats around it happily, and it is
// invisible in review unless someone happens to read that exact string in the
// running app. It reached shipped UI text and stayed there.
//
// THE `?` COUSIN. The same corruption maps some characters to a plain question
// mark instead, which no scan can distinguish from a legitimate one. Two were
// found beside the U+FFFD ones and repaired by inference: `? error` sat next to
// `<Icon.check /> ran (exit 0)` so it had been a cross, and `key ? model` had
// been an arrow. Those cannot be guarded automatically — this test only pins
// the half that is unambiguous.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
// Built from its code point, not written literally: a test that embeds
// the character it hunts for reports itself as a defect.
const GANTI = String.fromCharCode(0xfffd);

/** Source files worth scanning: what ships, not what is vendored. */
function berkasSumber() {
  const keluar: string[] = [];
  const lewati = new Set([
    "node_modules",
    "dist-app",
    "vendor",
    ".git",
    ".wolfspace",
    "_agent_backups",
    "coverage",
    // Authored documents, not code. A mangled glyph in a diagram is for
    // its author to correct -- this guard covers what ships as source.
    "artifacts",
  ]);
  const telusuri = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (lewati.has(e.name)) continue;
      const jalur = path.join(dir, e.name);
      if (e.isDirectory()) {
        telusuri(jalur);
        continue;
      }
      if (!/\.(ts|tsx|cjs|js|css|html|json|md|py)$/.test(e.name)) continue;
      // The build output is generated from the sources this test already
      // checks, so flagging it too would just report the same defect twice.
      if (e.name === "app.build.js" || e.name === "package-lock.json") continue;
      keluar.push(path.relative(AKAR, jalur));
    }
  };
  telusuri(AKAR);
  return keluar;
}

const BERKAS = berkasSumber();

describe("tak ada karakter pengganti di sumber", () => {
  test("the walker actually found source files", () => {
    // Guards the scan itself: if the filter ever stops matching anything, every
    // assertion below would pass on an empty list.
    expect(BERKAS.length).toBeGreaterThan(100);
    expect(BERKAS).toContain(path.join("public", "app", "Views.tsx"));
  });

  test("no file contains U+FFFD", () => {
    const kotor: string[] = [];
    for (const rel of BERKAS) {
      const isi = fs.readFileSync(path.join(AKAR, rel), "utf8");
      if (!isi.includes(GANTI)) continue;
      const baris = isi.split(/\r?\n/);
      for (let i = 0; i < baris.length; i++) {
        if (baris[i].includes(GANTI)) {
          kotor.push(rel + ":" + (i + 1) + "  " + baris[i].trim().slice(0, 80));
        }
      }
    }
    // Named individually rather than counted: a bare number tells whoever hits
    // this nothing about where to look.
    expect(kotor).toEqual([]);
  });
});
