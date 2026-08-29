// The Live Browser must go away when its page stops showing.
//
// WHAT WENT WRONG. The "Web Dev Live Browser" is not DOM. External sites are
// drawn by a WebContentsView created in the main process and attached with
// contentView.addChildView — it FLOATS above the window and obeys only the
// bounds it is told (electron/main.ts). A DOM panel disappears with its page;
// this one has no idea a page exists.
//
// Pages are not unmounted when you leave them: the one you left keeps its
// layout and fades to opacity 0. So opening Plugins with a site loaded left the
// browser sitting on top of the plugin list, covering its buttons. Reproduced
// and photographed from the SCREEN — Page.captureScreenshot photographs the
// main frame only and cannot see a WebContentsView at all, which is why the
// first capture of this bug looked perfectly clean.
//
// WHY THE GATE IS IN THE CONDITION. usePreviewPanel re-sends the bounds every
// 400ms, because the view does not move on its own when the panel is resized or
// the sidebar opens. Hiding the view once and leaving that heartbeat running
// puts it straight back on screen within 400ms. So "is the page showing?" has
// to be part of the effect's condition, not a one-off call.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const baca = (rel: string): string =>
  fs.readFileSync(path.join(AKAR, rel), "utf8");

const HOOK = baca("public/app/usePreviewPanel.tsx");
const APP = baca("public/app.tsx");

describe("the floating browser follows its page", () => {
  test("the hook accepts an explicit 'is this page showing' flag", () => {
    expect(HOOK).toMatch(/halamanTampil/);
  });

  test("the flag gates the effect, it is not just a one-off hide", () => {
    // The heartbeat re-shows the view every 400ms, so a hide outside the
    // condition is undone almost immediately.
    const i = HOOK.indexOf("if (!ipc || !alamatLuar");
    expect(i).toBeGreaterThan(-1);
    const baris = HOOK.slice(i, HOOK.indexOf("\n", i));
    expect(baris).toMatch(/!halamanTampil/);
  });

  test("the flag is in the dependency list", () => {
    // Without it the effect never re-runs on a view change and the gate above
    // is evaluated exactly once, at mount.
    expect(HOOK).toMatch(
      /\[ipc,\s*alamatLuar,\s*url,\s*refreshKey,\s*halamanTampil\]/,
    );
  });

  test("the effect still hides on cleanup", () => {
    // Leaving the panel entirely has to remove the view too, not only leaving
    // the page.
    const i = HOOK.indexOf("return () => {");
    expect(i).toBeGreaterThan(-1);
    expect(HOOK.slice(i, i + 400)).toMatch(/aksi:\s*"sembunyi"/);
  });

  test("app.tsx feeds it the real view state", () => {
    const i = APP.indexOf("usePreviewPanel({");
    expect(i).toBeGreaterThan(-1);
    const blok = APP.slice(i, APP.indexOf("});", i));
    expect(blok).toMatch(/halamanTampil:\s*view === "chat"/);
  });

  test("view is declared before the hook that reads it", () => {
    // A const cannot be read above its own declaration, and this one used to
    // sit 65 lines below the call.
    const iDecl = APP.indexOf('const [view, setView] = useState("chat")');
    const iPakai = APP.indexOf("usePreviewPanel({");
    expect(iDecl).toBeGreaterThan(-1);
    expect(iDecl).toBeLessThan(iPakai);
  });
});
