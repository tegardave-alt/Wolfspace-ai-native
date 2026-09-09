// The browser tools must survive packaging.
//
// WHAT WAS BROKEN. web_extract tells the model it drives "a real browser
// (Playwright)", and that tool definition ships. The engine behind it did not:
//
//   1. `playwright` was a devDependency, and electron-builder prunes those when
//      it packages. Verified against a real build: node_modules inside the
//      package had no playwright at all.
//   2. Playwright's Chromium is downloaded into a user-profile cache, outside
//      the repo, so it was never in build.files either — and it is absent on
//      any machine that has not run `playwright install`.
//
// Either one alone is fatal. Together they meant every browser call in an
// installed WOLFSPACE threw "playwright unavailable" while the model had been
// promised otherwise. It worked perfectly in a dev checkout, which is why it
// went unnoticed.
//
// THE FIX. playwright-core is a real dependency (small, no browser download),
// and it drives a browser the machine ALREADY has through a Playwright
// `channel`. Measured here: msedge 1276 ms, chrome 2333 ms, nothing fetched.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const PKG = JSON.parse(
  fs.readFileSync(path.join(AKAR, "package.json"), "utf8"),
);
const WEB = fs.readFileSync(path.join(AKAR, "agent", "web.ts"), "utf8");

describe("mesin browser ikut terkirim", () => {
  test("playwright-core is a real dependency, not a dev one", () => {
    // devDependencies are pruned at package time. A browser tool that ships its
    // description but not its engine is worse than one that does not ship.
    expect(PKG.dependencies["playwright-core"]).toBeTruthy();
    expect((PKG.devDependencies || {})["playwright-core"]).toBeUndefined();
  });

  test("the runtime requires playwright-core, not playwright", () => {
    expect(WEB).toMatch(/require\("playwright-core"\)/);
    expect(WEB).not.toMatch(/require\("playwright"\)/);
  });

  test("it is reachable in the packaged tree", () => {
    // build.files carries node_modules/**, so a production dependency lands
    // there. This asserts the rule that makes that true rather than the build
    // output, which is not present on a clean checkout.
    const izin = (PKG.build.files || []).filter(
      (f: string) => !f.startsWith("!"),
    );
    expect(izin).toContain("node_modules/**");
  });
});

describe("tak ada biner yang perlu diunduh", () => {
  test("a system browser is preferred, by channel", () => {
    // A `channel` points at an installed browser. Without this, Playwright
    // reaches for its own Chromium in a user-profile cache that no installer
    // ever puts there.
    expect(WEB).toMatch(/const _SALURAN = \["msedge", "chrome"\]/);
    expect(WEB).toMatch(/pw\.chromium\.launch\(\{ \.\.\.opsi, channel \}\)/);
  });

  test("the bundled Chromium stays as the last resort", () => {
    // A dev checkout that HAS run `playwright install` should keep using its
    // own browser rather than the one the user browses with.
    const i = WEB.indexOf("async function _luncurkanBrowser");
    const blok = WEB.slice(i, WEB.indexOf("no usable browser", i));
    expect(blok.indexOf("channel }")).toBeLessThan(
      blok.indexOf("pw.chromium.launch(opsi)"),
    );
  });

  test("failure names every channel it tried", () => {
    // "browser unavailable" with nothing else said is what let the packaging
    // bug sit undiagnosed. Each attempt reports its own reason.
    expect(WEB).toMatch(/salah\.push\(channel \+ ": "/);
    expect(WEB).toMatch(/no usable browser — " \+ salah\.join\(" \| "\)/);
  });

  test("the shared browser goes through the picker", () => {
    // _getBrowser is what web_extract actually calls; a direct launch there
    // would bypass all of the above.
    const i = WEB.indexOf("async function _getBrowser");
    const blok = WEB.slice(i, i + 900);
    expect(blok).toMatch(/_luncurkanBrowser\(pw, \{ headless: true \}\)/);
  });
});
