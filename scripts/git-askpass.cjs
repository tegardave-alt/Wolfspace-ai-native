// Git credential bridge for WOLFSPACE: answer git's credential request with
// the token of the GitHub account connected in the app.
//
// WHY THIS EXISTS. The GitHub panel holds an OAuth token, but `git push` from
// the git panel knew nothing about it: over HTTPS git asked for a password,
// no terminal was attached, and the push either hung or failed with text
// about "access rights". This script closes the gap without ever writing the
// token into the repository, its config, or a credential store.
//
// TWO ENTRY POINTS, one file:
//
//   credential helper  --  `<this> get`, key=value lines on stdin
//     protocol=https
//     host=github.com
//   and the answer is `username=...` / `password=...` on stdout. This is the
//   one that matters. It is installed FIRST in credential.helper (see
//   core/git-vscode.ts), because helpers run in order and the Windows one
//   (Git Credential Manager) opens a GUI dialog that nobody can see from a
//   server process -- measured with GIT_TRACE: `git credential-manager get`
//   ran, and the push sat there until it was killed.
//
//   askpass  --  `<this> "Password for 'https://github.com': "`
//   Kept as the fallback path git takes when no helper answered. With
//   GIT_TERMINAL_PROMPT=0 alongside, an empty answer makes git fail fast
//   instead of waiting on a prompt.
//
// LIMITS, on purpose:
//   - github.com only. Any other host gets no answer, so the helpers after
//     this one (or askpass, or a fast failure) take over unchanged.
//   - Nothing is cached. The store file is read on every call.
//   - `store` and `erase` are accepted and ignored: the app owns the token's
//     lifetime, git must not.
"use strict";
const fs = require("fs");

const store = process.env.WOLFSPACE_GH_STORE || "";
const out = (s) => process.stdout.write(String(s || ""));

function bacaStore() {
  try {
    return JSON.parse(fs.readFileSync(store, "utf8")) || {};
  } catch (_) {
    return {};
  }
}

const mode = String(process.argv[2] || "");

if (mode === "get") {
  let stdin = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (stdin += c));
  process.stdin.on("end", () => {
    const req = {};
    for (const line of stdin.split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (i > 0) req[line.slice(0, i)] = line.slice(i + 1);
    }
    if (!/(^|\.)github\.com$/i.test(req.host || "") || !store) return;
    const s = bacaStore();
    if (!s.token) return;
    // GitHub accepts any non-empty username with an OAuth token as the
    // password; the login is used so logs and `remote -v` read sensibly.
    out("username=" + ((s.akun && s.akun.login) || "oauth2") + "\n");
    out("password=" + s.token + "\n");
  });
} else if (mode === "store" || mode === "erase") {
  // Consume stdin so git is not left with a broken pipe; do nothing.
  process.stdin.resume();
  process.stdin.on("end", () => {});
} else {
  // askpass: the prompt is the argument.
  const prompt = mode;
  if (!/github\.com/i.test(prompt) || !store) {
    out("");
  } else {
    const s = bacaStore();
    if (/^username/i.test(prompt)) out((s.akun && s.akun.login) || "oauth2");
    else if (/^password/i.test(prompt)) out(s.token || "");
    else out("");
  }
}
