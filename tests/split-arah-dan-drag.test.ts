// The split: files land on the side they were asked for, and the divider
// follows the cursor for the whole drag.
//
// TWO BUGS, ONE REPORT: "the split sometimes does not match -- it should go
// left and goes right instead." Both are real, and they have different causes.
//
// 1. "OPEN TO THE SIDE" READ FOCUS FROM THE PAST. The handler decided the other
//    pane from `grupFokus` captured in its closure -- the value of the LAST
//    render. Click the right pane, then Alt+click a file before React has
//    re-rendered, and "the other side" was computed from where focus used to
//    be: the file opened on the right again. A ref written the moment focus
//    changes is what every decision reads now.
//
// 2. THE DIVIDER LOST THE CURSOR. Each pane is a Monaco editor with its own
//    mouse handling. A drag that crossed one had its mousemove events taken by
//    it; the divider froze, then leapt to wherever the cursor came back out.
//    That leap is what a "wrong direction" looks like. Pointer events on the
//    panes are now off for as long as the button is down, and the row's box is
//    re-measured on every move so a layout shift mid-drag cannot skew it.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const APP = fs
  .readFileSync(path.join(AKAR, "public", "app.tsx"), "utf8")
  .replace(/\r\n/g, "\n");
const CSS = fs
  .readFileSync(path.join(AKAR, "public", "styles.css"), "utf8")
  .replace(/\r\n/g, "\n");

/** From a signature to the closing brace at that indentation. */
const tubuh = (tanda: string, panjang = 2200) => {
  const i = APP.indexOf(tanda);
  expect(i).toBeGreaterThan(-1);
  return APP.slice(i, i + panjang);
};

describe("keputusan split membaca fokus yang SEKARANG", () => {
  test("ada ref fokus, dan ia ditulis di saat yang sama dengan state", () => {
    expect(APP).toContain("const grupFokusRef = React.useRef(0);");
    const f = tubuh("const fokuskanGrup = useCallback(", 300);
    expect(f).toContain("grupFokusRef.current = i;");
    expect(f).toContain("setGrupFokus(i);");
  });

  test("'open to the side' memilih sisi lain dari REF, bukan closure", () => {
    const b = tubuh("const bukaDiSamping = useCallback(");
    expect(b).toContain("grupFokusRef.current === 0 ? 1 : 0");
    // The stale read is gone from this handler entirely.
    expect(b).not.toContain("grupFokus === 0 ? 1 : 0");
  });

  test("membuka tab dan memecah grup juga membaca ref", () => {
    expect(tubuh("const bukaTab = useCallback(")).toContain(
      "grupFokusRef.current",
    );
    expect(tubuh("const pecahGrup = useCallback(")).toContain(
      "grupFokusRef.current",
    );
  });

  test("setiap pemindah fokus lewat pembungkusnya, tak ada setGrupFokus liar", () => {
    // A direct setGrupFocus anywhere in the split handlers would leave the ref
    // behind again, and the bug would be back through a different door.
    for (const nama of [
      "const bukaTab = useCallback(",
      "const bukaDiSamping = useCallback(",
      "const pecahGrup = useCallback(",
      "const tutupGrup = useCallback(",
    ]) {
      expect(tubuh(nama)).not.toMatch(/\bsetGrupFokus\(/);
    }
    expect(APP).toContain("onFokus={() => fokuskanGrup(i)}");
  });
});

describe("divider mengikuti kursor sepanjang drag", () => {
  const d = tubuh("const mulaiGeserPecah = useCallback(", 2600);

  test("kotak diukur ulang pada SETIAP gerakan, bukan sekali di mousedown", () => {
    const gerak = d.slice(d.indexOf("const gerak ="));
    expect(gerak).toContain("baris.getBoundingClientRect()");
    // And the pre-drag measurement is no longer what the moves compute from.
    const sebelumGerak = d.slice(0, d.indexOf("const gerak ="));
    expect(sebelumGerak).not.toMatch(
      /const kotak = baris\.getBoundingClientRect/,
    );
  });

  test("pane berhenti menerima mouse selama tombol ditekan", () => {
    expect(d).toContain('baris.classList.add("pecah-geser")');
    expect(d).toContain('baris.classList.remove("pecah-geser")');
    const i = CSS.indexOf(
      ".editor-grup-baris.pecah-geser > :not(.editor-split-resizer)",
    );
    expect(i).toBeGreaterThan(-1);
    expect(CSS.slice(i, i + 200)).toContain("pointer-events: none");
  });

  test("kehilangan fokus jendela mengakhiri drag — listener tak boleh hidup terus", () => {
    // Alt-tab mid-drag never delivers the mouseup. A surviving listener would
    // resize the split on the next mouse movement anywhere, against a box from
    // a layout that no longer exists.
    expect(d).toContain('window.addEventListener("blur", lepas)');
    expect(d).toContain('window.removeEventListener("blur", lepas)');
  });
});
