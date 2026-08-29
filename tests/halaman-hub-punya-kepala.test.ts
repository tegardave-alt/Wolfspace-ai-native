// Every hub page must carry the shared header, because two invisible things
// ride on it.
//
// WHAT WENT WRONG. `.page.hub-page` is the wrapper for full-page views, and
// SettingsView renders the `.hub-header` that belongs with it. PluginsView and
// HistoryView did not — they opened straight into their own body div. Nothing
// looked broken, and two behaviours were quietly absent:
//
//   1. `.app.sb-sembunyi .hub-header { padding-left: 58px }` is what reserves
//      the top-left corner for the floating sidebar toggle. That rule names the
//      header classes ONE BY ONE, so a page without one is never padded.
//   2. `.tb-spacer` inside the header IS the window's drag handle — the only
//      element in the entire stylesheet carrying -webkit-app-region: drag. With
//      no header there was no drag region at all, so the window could not be
//      moved while those pages were open.
//
// WHY IT IS WRITTEN THIS WAY. The check WALKS the hub pages it finds in
// app.tsx rather than listing the three that exist today. The comment in
// styles.css already predicted that a newly added page would miss this — and a
// newly added page did, twice. A test naming the current three would miss the
// next one in exactly the same way.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const baca = (rel: string): string =>
  fs.readFileSync(path.join(AKAR, rel), "utf8");

const APP = baca("public/app.tsx");
const CSS = baca("public/styles.css");
const SUMBER = ["public/app/Views.tsx", "public/app/PluginsView.tsx"];

/** Components rendered inside a `.page hub-page` wrapper, in app.tsx. */
function komponenHalamanHub(): string[] {
  const nama: string[] = [];
  // Split so each segment ends where the next hub page begins: a page that
  // renders nothing must not borrow the component of the page after it.
  for (const seg of APP.split('"page hub-page "').slice(1)) {
    const m = seg.match(/<([A-Z][A-Za-z0-9]*)[\s/>]/);
    if (m) nama.push(m[1]);
  }
  return Array.from(new Set(nama));
}

function badanKomponen(nama: string): string {
  for (const rel of SUMBER) {
    const src = baca(rel);
    const i = src.indexOf("function " + nama + "(");
    if (i < 0) continue;
    const j = src.indexOf("\nfunction ", i + 1);
    return src.slice(i, j > i ? j : src.length);
  }
  throw new Error("component not found in any known source file: " + nama);
}

const HALAMAN = komponenHalamanHub();

describe("hub pages carry the shared header", () => {
  test("there are hub pages to check at all", () => {
    // Guards the walker itself. If the markup in app.tsx changes shape and
    // this finds nothing, every test below would pass on an empty list.
    expect(HALAMAN.length).toBeGreaterThanOrEqual(3);
  });

  test.each(HALAMAN)("%s renders a .hub-header", (nama) => {
    expect(badanKomponen(nama)).toMatch(/className="hub-header"/);
  });

  test.each(HALAMAN)("%s carries the window drag handle", (nama) => {
    // The header is only half of it: .tb-spacer is the element that actually
    // drags the window, and a header without one moves nothing.
    expect(badanKomponen(nama)).toMatch(/className="tb-spacer"/);
  });

  test("the sidebar-hidden rule still pads .hub-header", () => {
    // The compensation the pages above inherit. If this selector is renamed or
    // dropped, the headers stay but the corner stops being reserved.
    const i = CSS.indexOf(".app.sb-sembunyi");
    expect(i).toBeGreaterThan(-1);
    const blok = CSS.slice(i, CSS.indexOf("}", i));
    expect(blok).toMatch(/\.hub-header/);
    expect(blok).toMatch(/padding-left:\s*58px/);
  });

  test(".tb-spacer is what makes a window draggable", () => {
    const i = CSS.indexOf(".tb-spacer {");
    expect(i).toBeGreaterThan(-1);
    const blok = CSS.slice(i, CSS.indexOf("\n}", i));
    expect(blok).toMatch(/-webkit-app-region:\s*drag/);
    // Without a height the region has zero area — measured, and already
    // documented in styles.css.
    expect(blok).toMatch(/align-self:\s*stretch/);
  });
});
