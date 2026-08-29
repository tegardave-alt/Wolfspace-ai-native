// A page that is not showing must not contribute a window drag region.
//
// WHAT WENT WRONG. Pages stay mounted; only their class changes. The page you
// left keeps `transform: translateX(-8%)` with opacity 0 and pointer-events:
// none — invisible, and inert to the mouse. But Chromium builds the window's
// draggable region from the LAYOUT tree. Opacity does not remove an element
// from it, pointer-events does not remove it, and the transform does not
// remove it either — it MOVES it.
//
// So on every page except chat, the chat page's own drag spacer was still
// live, shifted left by 8% of the container:
//
//     .page.chat-page.exit .tb-spacer   x = -38..1050, y = 0..45, drag
//
// which covered the floating sidebar toggle at x=10..46, y=8..39. Measured
// with WM_NCHITTEST on the running window, on the Plugins page:
//
//     before   y=8..39  ->  HTCAPTION   (every column)
//     after    y=8..39  ->  HTCLIENT    (every column)
//
// HTCAPTION means the OS consumed the input before the renderer saw it: no
// hover, no click, and a press dragged the window — or resized it, when the
// press landed in the 8px band above. The button looked dead and the app
// changed size instead.
//
// Verified three ways on the live window: removing the exited page turned the
// rectangle HTCLIENT, the rule below did the same with the page left in place,
// and it still held after a minimize/restore — which matters, because
// app-region has failed to survive one before on a position:fixed element.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const CSS = fs.readFileSync(path.join(AKAR, "public/styles.css"), "utf8");

function aturan(pemilih: string): string {
  const i = CSS.indexOf(pemilih + " {");
  expect(i).toBeGreaterThan(-1);
  return CSS.slice(i, CSS.indexOf("\n}", i));
}

describe("inactive pages give up the window drag region", () => {
  test("the guard exists and switches the region off", () => {
    const blok = aturan(".page:not(.active) .tb-spacer");
    expect(blok).toMatch(/-webkit-app-region:\s*no-drag/);
  });

  test("it is written by state, not by listing the state classes", () => {
    // `.exit` and `.enter` are the two today. A page added later gets neither
    // reviewed nor remembered, which is exactly how this reached a release.
    // Exactly one page carries `.active`, so :not(.active) stays correct.
    expect(CSS).toMatch(/\.page:not\(\.active\)\s+\.tb-spacer/);
  });

  test("the active page keeps its drag region", () => {
    // Half a fix is worse than none here: switching every spacer off would
    // leave the window with no way to be moved at all.
    const blok = aturan(".tb-spacer");
    expect(blok).toMatch(/-webkit-app-region:\s*drag/);
  });

  test("the condition that caused it is still present", () => {
    // The rule is only needed because the exited page is TRANSFORMED rather
    // than removed. If that ever changes the rule becomes harmless, but while
    // it is true the rule is load-bearing — so it is asserted rather than
    // assumed.
    const blok = aturan(".page.hub-page.enter,\n.page.hub-page.exit");
    expect(blok).toMatch(/transform:\s*translateX/);
    expect(blok).toMatch(/pointer-events:\s*none/);
  });

  test("nothing else in the stylesheet claims a drag region", () => {
    // A new draggable element would reintroduce the bug through a different
    // door, and this rule only covers .tb-spacer. Failing here is the prompt
    // to think about the inactive-page case for whatever was just added.
    const baris = CSS.split("\n")
      .map((b, i) => [i + 1, b.trim()] as [number, string])
      .filter(([, b]) => /^-webkit-app-region:\s*drag/.test(b));
    expect(baris.length).toBe(1);
  });
});
