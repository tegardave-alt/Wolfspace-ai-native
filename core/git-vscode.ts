// git-vscode.ts — WOLFSPACE's door into the VS Code git layer.
//
// ROLE IN THE SYSTEM. scripts/ww.ts is WOLFSPACE's own git: branch list,
// switch, commit-all. It has no push, pull, fetch, stash list, log, diff or
// merge -- an inventory taken by grepping the backend for those commands found
// none. Rather than write each of them again, vendor/vscode-git carries the
// command layer of the VS Code git extension, compiled as-is. This file is the
// only place that layer is constructed, so everything above it (routes, the
// panel) asks WOLFSPACE, not VS Code.
//
// CONNECTS TO
//   imports  ../vendor/vscode-git/src/git (the Git and Repository classes)
//   used by  server.ts routes under /ww/remote/* and /ww/stash/*
//
// ONE Git PER PROCESS, ONE Repository PER FOLDER. Finding the git binary and
// reading its version costs a spawn; opening a repository costs another to
// resolve .git. Both are cached. lupakan() drops a repository entry -- called
// when a workspace is removed, and by tests.

"use strict";

import * as path from "path";
import { Git, findGit } from "../vendor/vscode-git/src/git";
import type { Repository } from "../vendor/vscode-git/src/git";
import { logChannel, Uri } from "../vendor/vscode-git/src/vscode";

let _git: Promise<Git> | null = null;
const _repo = new Map<string, Promise<Repository>>();

/** The git binary VS Code's finder locates, wrapped once. */
export function git(): Promise<Git> {
  if (_git) return _git;
  _git = (async () => {
    // Hints first: WOLFSPACE's own ww.ts already trusts `git` on PATH, so
    // nothing more specific is known here. findGit falls back to PATH itself.
    const found = await findGit([], () => true, logChannel);
    return new Git({
      gitPath: found.path,
      version: found.version,
      userAgent: "WOLFSPACE",
      env: await envKredensial(found.path),
    });
  })();
  return _git;
}

/**
 * The environment that lets `git push`/`pull`/`fetch` authenticate with the
 * GitHub account connected in the app.
 *
 * Two mechanisms, because git consults them in a fixed order:
 *
 *   1. credential.helper -- run FIRST, before anything the machine has
 *      configured. Necessary, not decorative: on Windows the configured helper
 *      is Git Credential Manager, which opens a GUI dialog; from a server
 *      process nobody sees it and the push hangs. Measured with GIT_TRACE
 *      before this existed. The machine's own helpers are re-appended after
 *      ours, so a user who never connects GitHub in the app keeps exactly
 *      what they had.
 *   2. GIT_ASKPASS -- the fallback git takes when no helper answered, with
 *      GIT_TERMINAL_PROMPT=0 so an unanswered prompt fails fast rather than
 *      waiting on a terminal that is not there.
 *
 * Both are served by scripts/git-askpass.cjs, which answers from the same
 * store agent/github.ts writes and for github.com only. The token is never
 * placed in this environment -- only the store's path, read at the moment
 * git asks. Config is injected through GIT_CONFIG_{COUNT,KEY_n,VALUE_n}
 * (git >= 2.31), which reaches every spawn the vendored layer makes without
 * touching any .git/config.
 */
async function envKredensial(
  gitPath: string,
): Promise<{ [k: string]: string }> {
  const { keysDir } = require("../agent/keys-path.ts");
  const { execFile } = require("child_process");
  const naskah = path.join(__dirname, "..", "scripts", "git-askpass.cjs");
  const bungkus = path.join(__dirname, "..", "scripts", "git-askpass.sh");

  // Whatever helpers the machine already has, in order, so they stay behind
  // ours instead of being lost.
  const sudahAda: string[] = await new Promise((res) => {
    execFile(
      gitPath,
      ["config", "--get-all", "credential.helper"],
      { encoding: "utf8" },
      (_e: any, stdout: string) =>
        res(
          String(stdout || "")
            .split(/\r?\n/)
            .map((x) => x.trim())
            .filter(Boolean),
        ),
    );
  });

  // The helper string is run by sh; the env vars are expanded there, which
  // keeps paths with spaces (Program Files, Electron) intact.
  const milikKita = '!"$WOLFSPACE_ASKPASS_NODE" "$WOLFSPACE_ASKPASS_MAIN"';
  // An empty value RESETS the helper list; the entries after it rebuild it.
  const helpers = ["", milikKita, ...sudahAda];

  const env: { [k: string]: string } = {
    GIT_ASKPASS: bungkus,
    GIT_TERMINAL_PROMPT: "0",
    WOLFSPACE_ASKPASS_NODE: process.execPath.replace(/\\/g, "/"),
    WOLFSPACE_ASKPASS_MAIN: naskah.replace(/\\/g, "/"),
    WOLFSPACE_GH_STORE: path.join(keysDir(), "github.json"),
    // The askpass wrapper and the helper both run node; when the server runs
    // under electron.exe this is what makes it act as node.
    ELECTRON_RUN_AS_NODE: "1",
    GIT_CONFIG_COUNT: String(helpers.length),
  };
  helpers.forEach((v, i) => {
    env["GIT_CONFIG_KEY_" + i] = "credential.helper";
    env["GIT_CONFIG_VALUE_" + i] = v;
  });
  return env;
}

/** A Repository for the folder, resolving .git the way VS Code does. */
export function repo(dir: string): Promise<Repository> {
  const kunci = path.resolve(dir).toLowerCase();
  const ada = _repo.get(kunci);
  if (ada) return ada;
  const p = (async () => {
    const g = await git();
    const akar = await g.getRepositoryRoot(dir);
    const dotGit = await g.getRepositoryDotGit(akar);
    return g.open(akar, undefined, dotGit, logChannel);
  })();
  _repo.set(kunci, p);
  // A failed open is not cached: the folder may become a repository later.
  p.catch(() => _repo.delete(kunci));
  return p;
}

export function lupakan(dir?: string): void {
  if (dir == null) _repo.clear();
  else _repo.delete(path.resolve(dir).toLowerCase());
}

export { Uri };

/**
 * The credential environment, for tests only. A test that re-typed these
 * variables would prove the test, not the module; this hands out the real
 * thing so `git credential fill` can be run under it.
 */
export async function _envUntukUji(): Promise<{ [k: string]: string }> {
  const found = await findGit([], () => true, logChannel);
  return envKredensial(found.path);
}
