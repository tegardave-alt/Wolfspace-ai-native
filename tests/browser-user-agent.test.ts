// The in-app browser presents as plain Chrome, not Electron.
//
// WHY. The default user agent carries "Electron/<ver>" and "WOLFSPACE/<ver>".
// Google's web apps (Stitch, and anything behind a Google sign-in) serve a
// blank / "unsupported browser" page to an Electron UA, and Google's OAuth
// rejects embedded/Electron user agents outright -- so the page opened blank
// in the Web Dev browser while it loaded fine in a real browser. The engine is
// the same Chromium, so the view now strips those two tokens and presents as
// Chrome. (This is the EXTERNAL-site path -- a WebContentsView in the main
// process -- which is separate from the local /preview-file path.)

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const MAIN = fs.readFileSync(path.join(AKAR, "electron", "main.ts"), "utf8");

describe("window.open opens a real popup (so sign-in / OAuth can complete)", () => {
  test("popups are allowed as real windows; only tab-style opens navigate the panel", () => {
    // A real browser opens window.open() in its own window. OAuth/sign-in
    // flows postMessage the result back to window.opener, so the opener must
    // survive -- the old handler replaced the panel with the popup URL and
    // broke every sign-in. Allow real popups; keep panel navigation only for
    // plain foreground/background tabs.
    expect(MAIN).toMatch(
      /disposition === "foreground-tab" \|\| disposition === "background-tab"/,
    );
    expect(MAIN).toMatch(/return \{\s*action: "allow"/);
  });

  test("the popup window shares the session and the clean Chrome UA", () => {
    // did-create-window: the popup is a real browser window; the provider's
    // sign-in page checks the UA too, so it must be Chrome, not Electron.
    expect(MAIN).toMatch(/wc\.on\("did-create-window"/);
    expect(MAIN).toMatch(/if \(uaBersih\) cwc\.setUserAgent\(uaBersih\)/);
    // And the popup can open further popups (multi-step sign-in).
    expect(MAIN).toMatch(/cwc\.setWindowOpenHandler\(/);
  });
});

describe("the browser view's user agent", () => {
  test("setUserAgent strips the Electron and WOLFSPACE tokens, on the view's webContents", () => {
    expect(MAIN).toMatch(
      /wc\s*\n?\s*\.getUserAgent\(\)\s*\.replace\(\/ \(\?:WOLFSPACE\|Electron\)\\\/\[\^ \]\+\/g, ""\)/,
    );
    expect(MAIN).toMatch(/wc\.setUserAgent\(uaBersih\)/);
  });

  test("it is set before the first navigation (loadURL happens later)", () => {
    const iUA = MAIN.indexOf("setUserAgent(uaBersih)");
    const iLoad = MAIN.indexOf('_brLog("loadURL"');
    expect(iUA).toBeGreaterThan(-1);
    expect(iLoad).toBeGreaterThan(iUA);
  });

  test("the strip regex yields a clean Chrome UA (applied to a real Electron UA)", () => {
    // The exact replacement the source performs.
    const strip = (ua: string) =>
      ua.replace(/ (?:WOLFSPACE|Electron)\/[^ ]+/g, "");
    const before =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) WOLFSPACE/0.3.0 Chrome/126.0.0.0 Electron/31.0.0 " +
      "Safari/537.36";
    const after = strip(before);
    expect(after).not.toMatch(/Electron/);
    expect(after).not.toMatch(/WOLFSPACE/);
    expect(after).toMatch(/Chrome\/\d+/);
    expect(after).toMatch(/Safari\/537\.36/);
    // No doubled spaces left where the tokens were removed.
    expect(after).not.toMatch(/ {2,}/);
  });
});
