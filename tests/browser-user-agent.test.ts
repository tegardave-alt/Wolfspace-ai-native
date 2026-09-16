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
