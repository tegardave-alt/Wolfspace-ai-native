// The agent edits files constantly, and every one of those edits runs inside
// Electron's MAIN process — the owner of the window. So a synchronous
// millisecond on the edit path is a millisecond of "Not Responding", and the
// symptom arrives as "it hangs while it works", pointing nowhere in particular.
//
// Two costs were measured on that path and removed. Both have an obvious way to
// come back: someone reaches for the familiar tool (`node --check`,
// `listSnapshots()`) without knowing what it costs here.

const fs = require("fs");
const os = require("os");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const SAFE = fs.readFileSync(path.join(AKAR, "agent", "safe-edit.ts"), "utf8");
const SNAP = fs.readFileSync(path.join(AKAR, "agent", "snapshot.ts"), "utf8");

// These assertions are about CODE, not prose. The comment explaining each fix
// naturally names the thing that was removed (`execSync`, `_meta.json`), so
// matching raw source would trip over the explanation for the fix itself.
function tanpaKomentar(teks) {
  return teks
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((baris) => !baris.trim().startsWith("//"))
    .join("\n");
}

/**
 * The source of one function, from its declaration to its closing brace.
 *
 * The end is the first `}` in column 0, NOT the next `function` keyword: the
 * declaration that follows _pruneOldSnapshots is an `async function`, so
 * searching for the keyword ran clean past it and swept in half the file —
 * including a `_meta.json` write that belongs to somebody else.
 */
function fungsi(sumber, nama) {
  const i = sumber.indexOf("function " + nama);
  if (i < 0) throw new Error("fungsi tak ketemu: " + nama);
  const j = sumber.indexOf("\n}", i);
  if (j < 0) throw new Error("penutup tak ketemu: " + nama);
  return sumber.slice(i, j + 2);
}

describe("jalur edit tidak membekukan jendela", () => {
  test("cek sintaks JS TIDAK melahirkan proses", () => {
    // `execSync("node --check")` spawns a whole Node just to parse one file:
    // measured at 124 ms of fully blocked main thread per edit, so ten edits in
    // a run cost 1.2 seconds of frozen window. esbuild parses the same source
    // in process at ~2 ms.
    const blok = tanpaKomentar(
      SAFE.slice(
        SAFE.indexOf('if (lang === "javascript")'),
        SAFE.indexOf('if (lang === "jsx")'),
      ),
    );
    expect(blok).not.toContain("execSync");
    expect(blok).not.toContain("node --check");
    expect(blok).toContain("transformSync");
  });

  test("cek sintaks JS tetap MENOLAK yang rusak", () => {
    // Speed is worthless if the guard stopped guarding. esbuild's strictness was
    // compared against `node --check` across nine cases before the swap; these
    // keep the two ends of that honest.
    const esbuild = require("esbuild");
    expect(() =>
      esbuild.transformSync("const a=1; function f(){return a}", {
        loader: "js",
      }),
    ).not.toThrow();
    expect(() =>
      esbuild.transformSync("function f({return 1}", { loader: "js" }),
    ).toThrow();
  });

  test("pemangkas snapshot TIDAK membaca metadata tiap snapshot", () => {
    // _pruneOldSnapshots runs on EVERY snapshot, and a snapshot is taken on
    // every edit. Through listSnapshots() it opened and JSON.parsed every
    // snapshot's metadata — four syscalls each, measured at 22 ms over 50
    // snapshots, and growing with however many are kept.
    const blok = tanpaKomentar(fungsi(SNAP, "_pruneOldSnapshots"));
    expect(blok).not.toContain("listSnapshots()");
    expect(blok).not.toContain("_meta.json");
    expect(blok).toContain("readdirSync");
  });

  test("pemangkas masih memangkas: umur DAN jumlah, dari nama saja", () => {
    // Nothing is lost by reading names alone: an id already IS its timestamp,
    // because createSnapshot mints `${Date.now()}_${hex}`.
    const blok = fungsi(SNAP, "_pruneOldSnapshots");
    expect(blok).toMatch(/now - snap\.ts > MAX_AGE_MS/);
    expect(blok).toMatch(/idx >= MAX_SNAPS/);
    expect(blok).toMatch(/Number\(id\.split\("_"\)\[0\]\)/);
  });

  test("nama direktori asing TIDAK dihapus", () => {
    // This function deletes directories. A name it cannot parse has to be left
    // alone rather than guessed at.
    const blok = fungsi(SNAP, "_pruneOldSnapshots");
    expect(blok).toMatch(/Number\.isFinite\(ts\) && ts > 0/);
  });

  test("snapshot lalu rollback masih memulihkan isi aslinya", () => {
    // The point of the whole path. A speed change is worthless if the file
    // cannot be brought back afterwards.
    require("../scripts/ts-register.cjs");
    const s = require("../agent/snapshot.ts");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snap-uji-"));
    const f = path.join(dir, "berkas.txt");
    fs.writeFileSync(f, "ASLI\n");
    const snap = s.createSnapshot([f], "uji-rollback");
    fs.writeFileSync(f, "DITIMPA\n");
    const r = s.rollback(snap.id);
    expect(r && r.ok).toBe(true);
    expect(fs.readFileSync(f, "utf8").trim()).toBe("ASLI");
  });
});
