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
function git(): Promise<Git> {
  if (_git) return _git;
  _git = (async () => {
    // Hints first: WOLFSPACE's own ww.ts already trusts `git` on PATH, so
    // nothing more specific is known here. findGit falls back to PATH itself.
    const found = await findGit([], () => true, logChannel);
    return new Git({
      gitPath: found.path,
      version: found.version,
      userAgent: "WOLFSPACE",
      env: {},
    });
  })();
  return _git;
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
