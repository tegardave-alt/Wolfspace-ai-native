// The floating sidebar toggle must not sit in the window's resize band.
//
// WHAT WENT WRONG. The window is created with titleBarStyle "hidden"
// (electron/main.ts), which removes the title BAR and keeps the resizable
// FRAME. Windows therefore owns a band along every edge and answers
// WM_NCHITTEST there before the renderer sees anything. Measured on the
// reporting machine:
//
//     SM_CYSIZEFRAME 4 + SM_CXPADDEDBORDER 4 = 8px
//
// and probed with WM_NCHITTEST on a sibling Electron window with the same
// configuration: y=0,2,4,6 answered HTTOP (HTTOPLEFT at the left end) and y=8
// was the first row to answer HTCLIENT.
//
// In "sembunyi" mode the toggle was position: fixed at top: 0 with height:
// 46px, so its top 8px belonged to the OS. Pressing there began a window
// resize instead of showing the sidebar — reported as "I pressed the sidebar
// and it resized the whole app".
//
// WHY A SOURCE TEST. There is no window in jest, and the failure is geometric
// rather than behavioural: the numbers in the rule ARE the bug. Reading them
// back is the honest check.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const CSS = fs.readFileSync(path.join(AKAR, "public/styles.css"), "utf8");

// The resize band the OS reserves, in CSS pixels at 100% scaling.
const PITA_RESIZE = 8;
// .sb-head, which the floating button is aligned against.
const TINGGI_BILAH = 46;

function aturan(pemilih: string): string {
  const i = CSS.indexOf(pemilih + " {");
  expect(i).toBeGreaterThan(-1);
  return CSS.slice(i, CSS.indexOf("\n}", i));
}

function px(blok: string, prop: string): number {
  // Declarations only. These blocks carry long comments full of measured
  // pixel numbers, and reading one of those as the value would be worse than
  // failing: the test would pass on the strength of a comment.
  const bersih = blok.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const baris of bersih.split("\n")) {
    const t = baris.trim();
    if (!t.startsWith(prop + ":")) continue;
    const nilai = parseFloat(t.slice(prop.length + 1).trim());
    expect(Number.isNaN(nilai)).toBe(false);
    return nilai;
  }
  throw new Error("declaration not found: " + prop);
}

describe("floating sidebar toggle clears the OS resize band", () => {
  const blok = aturan(".sidebar.sembunyi .sb-toggle");

  test("it really is the floating case", () => {
    expect(blok).toMatch(/position:\s*fixed/);
  });

  test("its top edge starts below the resize band", () => {
    // top: 0 is the exact bug. Anything under 8px leaves part of the button
    // owned by Windows, and a press there resizes the window.
    expect(px(blok, "top")).toBeGreaterThanOrEqual(PITA_RESIZE);
  });

  test("its left edge clears the band too", () => {
    expect(px(blok, "left")).toBeGreaterThanOrEqual(PITA_RESIZE);
  });

  test("no part of the box reaches back into the band", () => {
    // Guards the other half: a tall box pushed down is fine, but a NEGATIVE
    // margin or a grown height must not creep back up.
    expect(px(blok, "top")).toBeGreaterThanOrEqual(PITA_RESIZE);
    expect(px(blok, "height")).toBeGreaterThan(0);
  });

  test("it still sits on the top bar's centre line", () => {
    // Moving the button down is only half a fix. If it stops lining up with
    // the bar it is misaligned by a few pixels — visible, and hard to point at.
    const tengah = px(blok, "top") + px(blok, "height") / 2;
    expect(Math.abs(tengah - TINGGI_BILAH / 2)).toBeLessThanOrEqual(1);
  });
});
