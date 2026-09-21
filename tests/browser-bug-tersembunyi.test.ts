// Regressions for the Web Dev browser bugs that did not show up as errors:
// a wrong overlay, a lost page, a leaked engine. Each one is pinned to the
// line that fixes it, so a refactor that drops the line fails here first.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (name) =>
  fs.readFileSync(path.join(root, name), "utf8").replace(/\r\n/g, "\n");

describe("web-dev browser: hidden bugs", () => {
  const main = read("electron/main.ts");
  const hook = read("public/app/usePreviewPanel.tsx");
  const css = read("public/styles.css");

  test("ERR_ABORTED is not reported as a failed page", () => {
    // -3 means "superseded by another navigation" -- a redirect, a second
    // loadURL, a click while loading. Chrome shows no error page for it.
    const i = main.indexOf('"did-fail-load"');
    expect(i).toBeGreaterThan(-1);
    const blok = main.slice(i, i + 700);
    expect(blok).toMatch(/if \(kode === -3\) return;/);
    expect(blok).toMatch(/kirim\("gagal"/);
  });

  test("a heartbeat never creates an engine; only 'buka' does", () => {
    // A late "tampil" after "buang" used to rebuild the view it had just
    // disposed: a hidden WebContents nothing referenced.
    expect(main).toMatch(
      /if \(aksi !== "buka" && !_br\.has\(paneId\)\) return \{ ok: true, ada: false \};/,
    );
  });

  test("'buka' with the same address does not reload the page", () => {
    // The renderer effect re-runs on view/panel changes; each run sends
    // "buka". Same address + same key is a no-op, same address + new key is a
    // reload of the CURRENT page (the refresh button), new address navigates.
    const i = main.indexOf('if (aksi === "buka" && p.url) {');
    expect(i).toBeGreaterThan(-1);
    const blok = main.slice(i, i + 1600);
    expect(blok).toMatch(/b\.diminta\.kunci === kunci/);
    expect(blok).toMatch(/wc\.reload\(\)/);
    expect(blok).toMatch(/wc\.loadURL\(p\.url\)/);
    expect(hook).toMatch(/kunci: refreshKey,/);
  });

  test("Enter on an unchanged address reloads", () => {
    const i = hook.indexOf("const navigate = useCallback");
    expect(i).toBeGreaterThan(-1);
    expect(hook.slice(i, i + 900)).toMatch(
      /if \(cur === t\.url\) setRefreshKey\(\(k\) => k \+ 1\);/,
    );
  });

  test("a failed load takes the view off screen so the overlay shows", () => {
    // The overlay is DOM; the view floats above all DOM. Without this the
    // message was painted underneath a blank native surface.
    expect(hook).toMatch(
      /if \(!ipc \|\| !alamatLuar \|\| !halamanTampil \|\| muatGagal \|\| beku\) \{/,
    );
    expect(hook).toMatch(/halamanTampil,\s*paneId,\s*muatGagal,\s*beku,?\s*\]/);
    expect(hook).toMatch(/setMuatGagal\(true\)/);
    // ...and the next load, a refresh, or a new address puts it back.
    const n = (hook.match(/setMuatGagal\(false\)/g) || []).length;
    expect(n).toBeGreaterThanOrEqual(3);
  });

  test("the effect cleanup also stops callbacks already in flight", () => {
    const i = hook.indexOf("return () => {");
    expect(i).toBeGreaterThan(-1);
    expect(hook.slice(i, i + 200)).toMatch(/mati = true;/);
  });

  // The page is a native view: when it has focus the application never sees
  // a keystroke. A preload inside the page forwards the presses the page did
  // not handle -- modifier combos, Escape, F-keys -- and the renderer
  // re-dispatches them on the window. Chromium's own editing shortcuts are
  // never taken (that would break every text field on the web).
  test("shortcuts pressed inside the page reach the application", () => {
    const pre = read("electron/preload-browser.ts");
    expect(pre).toMatch(
      /if \(!\(event instanceof KeyboardEvent\) \|\| !event\.isTrusted\) return;/,
    );
    expect(pre).toMatch(/if \(event\.defaultPrevented\) return;/);
    expect(pre).toMatch(
      /tanpaShift: new Set\(\["a", "c", "v", "x", "z", "y"\]\)/,
    );
    expect(pre).toMatch(/ipcRenderer\.send\("WOLFSPACE:browser-keydown"/);
    expect(main).toMatch(
      /preload: path\.join\(__dirname, "preload-browser\.js"\)/,
    );
    expect(main).toMatch(/wc\.ipc\.on\("WOLFSPACE:browser-keydown"/);
    expect(main).toMatch(/wc\.on\("before-input-event"/);
    expect(hook).toMatch(/m\.t === "tombol"/);
    expect(hook).toMatch(/window\.dispatchEvent\(ev\)/);
    // The second preload is built with the first.
    const bp = read("scripts/build-preload.cjs");
    expect(bp).toMatch(/preload-browser\.ts/);
    expect(bp).toMatch(/OUT_BROWSER/);
  });

  test("a crashed page, an iframe's navigation, and beforeunload are handled", () => {
    expect(main).toMatch(/wc\.on\("render-process-gone"/);
    expect(main).toMatch(
      /wc\.on\("will-prevent-unload", \(e: any\) => e\.preventDefault\(\)\)/,
    );
    expect(main).toMatch(
      /wc\.on\("did-navigate-in-page", \(_e: any, url: any, utama: any\) => \{\s*if \(!utama\) return;/,
    );
    // Hiding a focused view gives focus back to the window.
    expect(main).toMatch(
      /if \(state\.tampil\.webContents\.isFocused\(\)\) state\.win\.webContents\.focus\(\);[\s\S]{0,80}setVisible\(false\)/,
    );
  });

  test("the right pane's error overlay covers the pane", () => {
    expect(css).toMatch(
      /\.browser-pane-error \{\s*position: absolute;\s*inset: 0;\s*z-index: 5;/,
    );
  });
});
