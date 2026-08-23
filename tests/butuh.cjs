// Capability probes shared by the suites that need something beyond Node.
//
// A test that fails because a browser is not installed says nothing about the
// code. But a test that SKIPS silently says nothing either — this session
// already learned that the expensive way, when the Python suites passed locally
// and failed on CI because nobody had asked whether the worker could start.
//
// So the rule these encode: skip only for a capability that is genuinely absent,
// and make CI install what it can rather than skip. .github/workflows/ci.yml
// installs the Chromium build these probes look for.

const fs = require("fs");

/**
 * Is there a real browser Playwright can launch?
 *
 * The MODULE resolving is not enough, and that difference is exactly what broke
 * CI: playwright is a devDependency so `require.resolve` succeeded, while the
 * browser binary — which `npx playwright install` downloads separately — was
 * absent. The test then failed at launch instead of skipping.
 */
function punyaBrowser() {
  try {
    const pw = require("playwright");
    const exe = pw.chromium.executablePath();
    return !!exe && fs.existsSync(exe);
  } catch (_) {
    return false;
  }
}

/** Windows-only semantics: cmd.exe variable injection, %VAR% expansion. */
function diWindows() {
  return process.platform === "win32";
}

/** `describe` when the capability is there, `describe.skip` when it is not. */
function describeKalau(ada) {
  return ada ? describe : describe.skip;
}

module.exports = { punyaBrowser, diWindows, describeKalau };
