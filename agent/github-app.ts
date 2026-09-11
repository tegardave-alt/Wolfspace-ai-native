import * as fs from "fs";
import * as path from "path";
// The OAuth App that WOLFSPACE signs in AS.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
//
// Signing in to GitHub always happens on behalf of a registered OAuth App, and
// SOMEBODY has to register it. The first version of this feature asked the
// person using the app to do it, which is why signing in opened a form instead
// of GitHub. That was the wrong party: the app is registered ONCE by whoever
// ships WOLFSPACE, and from then on everyone who installs it just clicks.
//
// That is how comparable tools do it. GitHub's own MCP server states it
// plainly: "Official released binaries ... ship with a registered GitHub OAuth
// application baked in, so on github.com you can start the server with no token
// and no client ID at all." GitHub Desktop's own notes say the same: it "needs
// to be bundled with a Client ID and Secret".
//
// ── ABOUT THE SECRET ─────────────────────────────────────────────────────────
//
// GitHub requires a client_secret at the token endpoint even with PKCE — its
// docs are explicit that it "does not distinguish between public and
// confidential clients". So a distributed desktop app has no way to avoid
// carrying one, and everyone who ships one carries it the same way.
//
// It is therefore NOT a confidential secret, and nothing here should be built
// as if it were. PKCE is what actually secures this flow: the authorization
// code is bound to one login attempt by a verifier that never leaves the
// machine, so a code intercepted on the loopback redirect cannot be redeemed by
// anyone holding this file. GitHub's MCP server draws the same line: "that
// secret is baked into the binary and is not truly confidential — PKCE is what
// secures the flow".
//
// What it DOES still deserve: if it ever leaks in a way that matters, rotate it
// in the OAuth App's settings and ship a new build. It identifies the app, not
// any user, and it grants nothing on its own.
//
// ── FILLING IT IN (once, by whoever ships this) ──────────────────────────────
//
//   1. github.com → Settings → Developer settings → OAuth Apps → New OAuth App
//   2. Authorization callback URL — EXACTLY, character for character:
//        http://127.0.0.1:8121/github/callback
//   3. Generate a client secret, then put both in github-app.local.json (see
//      below) — or, if this repository is private, straight into BAWAAN.
//
// Left empty, the panel falls back to asking the user for their own OAuth App.
// That fallback is a safety net, not the intended path.
const BAWAAN = {
  clientId: "",
  clientSecret: "",
};

/**
 * An untracked file beside this one: agent/github-app.local.json
 *
 * ── WHY A FILE AND NOT AN ENVIRONMENT VARIABLE ───────────────────────────────
 *
 * This was very nearly done with WOLFSPACE_GITHUB_CLIENT_ID set at build time,
 * which does not work and would have failed only once installed: `agent/**` is
 * shipped as SOURCE and read by ts-register on the user's machine, so this
 * function runs there, not on the build machine. A build-time variable is gone
 * by then, and every install would have quietly fallen back to the setup form.
 *
 * A file does work, because build.files ships `agent/**` and the .json is not
 * one of the excluded extensions. It is gitignored, so the secret stays out of
 * the repository while still reaching the installer.
 */
function _berkasLokal() {
  try {
    const j = JSON.parse(
      fs.readFileSync(path.join(__dirname, "github-app.local.json"), "utf8"),
    );
    return j && typeof j === "object" ? j : {};
  } catch (_) {
    return {};
  }
}

/**
 * Precedence: the environment, then the untracked file, then the constants.
 *
 * The environment comes first so a developer can run against their own OAuth
 * App for an afternoon without editing anything.
 */
function appBawaan() {
  const lokal: any = _berkasLokal();
  return {
    clientId: String(
      process.env.WOLFSPACE_GITHUB_CLIENT_ID ||
        lokal.clientId ||
        BAWAAN.clientId ||
        "",
    ),
    clientSecret: String(
      process.env.WOLFSPACE_GITHUB_CLIENT_SECRET ||
        lokal.clientSecret ||
        BAWAAN.clientSecret ||
        "",
    ),
  };
}

module.exports = { appBawaan, _BAWAAN: BAWAAN };
export {};
