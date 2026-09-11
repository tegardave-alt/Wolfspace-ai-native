// The severity rail in the INFO panel.
//
// ── WHAT IT LOOKED LIKE ──────────────────────────────────────────────────────
//
// A 56px column holding three stacks of a text glyph over a bare number:
//
//     ⊗        ⚠        ⓘ
//     0        0        0
//
// Nothing on screen said which count was which — the names lived only in a
// title attribute — and a zero was drawn exactly like a real count, so the eye
// had to check each one to learn there was nothing to check. The glyphs came
// from the font, so the three arrived at different optical sizes and the row
// read as ragged before anyone tried to compare the numbers.
//
// Each row now carries an icon, the count and its own name; the number is the
// largest thing in it, because the number is what the panel exists to show; and
// an empty row fades rather than competing with the ones that matter.
//
// Rendered with the app's real styles.css to check the two things a rail like
// this actually gets wrong: 132px clipped "Warnings" to "Warni…", so it is
// 158px, verified against a four-digit count.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const LAYAR = fs.readFileSync(
  path.join(AKAR, "public", "app", "Screens.tsx"),
  "utf8",
);
const CSS = fs.readFileSync(path.join(AKAR, "public", "styles.css"), "utf8");
/** One CSS rule body, by selector. */
const aturan = (sel: string) => {
  const i = CSS.indexOf("\n" + sel + " {");
  if (i < 0) return "";
  return CSS.slice(i, CSS.indexOf("\n}", i));
};

describe("tiap baris menamai dirinya", () => {
  test("the name is rendered, not left in a tooltip", () => {
    expect(LAYAR).toContain("info-rail-nama");
    expect(LAYAR).toContain("{t.judul}");
  });

  test("there is an All row, so 'no filter' is a place you can click", () => {
    // The old rail toggled back to "all" by clicking the active row again —
    // a state with no control of its own.
    const blok = LAYAR.slice(LAYAR.indexOf('className="info-rail"'));
    expect(blok.slice(0, 1600)).toMatch(/kunci: "all", judul: "All"/);
  });

  test("the count is the biggest thing in the row", () => {
    const jml = aturan(".info-rail-jml");
    expect(jml).toMatch(/font-size: 15px/);
    expect(aturan(".info-rail-nama")).toMatch(/font-size: 11\.5px/);
  });

  test("digits are tabular, so the labels do not shift", () => {
    // Without it "1" and "7" move the word beside them and a column of counts
    // stops reading as a column.
    expect(aturan(".info-rail-jml")).toMatch(
      /font-variant-numeric: tabular-nums/,
    );
  });
});

describe("baris kosong terlihat kosong", () => {
  test("a zero row is marked and faded", () => {
    expect(LAYAR).toMatch(/\(jml \? "" : " nol"\)/);
    expect(aturan(".info-rail-baris.nol .info-rail-jml")).toMatch(
      /color: var\(--text-faint\)/,
    );
    expect(aturan(".info-rail-baris.nol .info-rail-ikon")).toMatch(/opacity/);
  });

  test("it does not invite a click it cannot answer", () => {
    expect(aturan(".info-rail-baris.nol")).toMatch(/cursor: default/);
  });
});

describe("keadaan aktif terbaca", () => {
  test("the active row is tinted and marked, not only underlined", () => {
    const a = aturan(".info-rail-baris.aktif");
    expect(a).toMatch(/background:/);
    expect(a).toMatch(/box-shadow: inset/);
  });

  test("it is reachable and visible from the keyboard", () => {
    expect(LAYAR).toMatch(/aria-pressed=\{aktif\}/);
    expect(aturan(".info-rail-baris:focus-visible")).toMatch(/outline/);
  });
});

describe("ikon digambar, bukan diketik", () => {
  test("the glyphs are gone", () => {
    // ⊗ ⚠ ⓘ rendered at whatever size the font chose.
    const blok = LAYAR.slice(
      LAYAR.indexOf("const TINGKAT_INFO"),
      LAYAR.indexOf("function IkonTingkat"),
    );
    expect(blok).not.toMatch(/ikon: "⊗"/);
  });

  test("all four severities have a drawn icon", () => {
    const blok = LAYAR.slice(LAYAR.indexOf("function IkonTingkat"));
    const satu = blok.slice(0, blok.indexOf("\n}\n"));
    for (const j of ["error", "warning", "info"]) {
      expect(satu).toContain('jenis === "' + j + '"');
    }
    // The fall-through is the "All" row, so every key has something to draw.
    expect(satu).toMatch(/<svg \{\.\.\.bersama\}>/);
    expect(satu).toMatch(/strokeWidth: 1\.5/);
  });
});

describe("lebarnya cukup untuk isinya", () => {
  test("the rail is wide enough for a word beside a four-digit count", () => {
    // MEASURED: at 132px the label clipped to "Warni…" on a real render.
    const r = aturan(".info-rail");
    expect(r).toMatch(/width: 158px/);
    expect(aturan(".info-rail-baris")).toMatch(
      /grid-template-columns: 16px 2\.9em 1fr/,
    );
  });

  test("a long name truncates instead of breaking the row", () => {
    expect(aturan(".info-rail-nama")).toMatch(/text-overflow: ellipsis/);
    expect(aturan(".info-rail-nama")).toMatch(/white-space: nowrap/);
  });
});
