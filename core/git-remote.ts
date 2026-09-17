// git-remote.ts — the network side of git, in one place.
//
// ROLE IN THE SYSTEM. Three callers need fetch/pull/push/sync/publish/clone:
// the sidebar's git panel (server.ts routes), the agent's `git` tool, and the
// GitHub panel's Clone. They used to be written once, inside server.ts, where
// the tool could not reach them -- so the tool simply had "NO network
// operations". This module is that code lifted out, so every caller runs the
// SAME implementation: the vendored VS Code layer (core/git-vscode.ts), whose
// environment carries the credential helper for the connected GitHub account.
//
// Every function returns { ok, ... } and never throws; git's own refusal
// (stderr) is passed through as `err`, with the classified `kode` when the
// vendored layer has one.
//
// CONNECTS TO
//   imports  core/git-vscode.ts (repo, git), agent/github.ts (linked repo)
//   used by  server.ts (/ww/remote/*, /ww/clone), agent/tools/git-tool.ts,
//            tests/git-sinkron-vscode.test.ts

import * as fs from "fs";
import * as path from "path";

const gv = () => require("./git-vscode.ts");

/** git's stderr, if it left one; else the message. */
function _galat(e: any): { ok: false; err: string; kode?: string } {
  return {
    ok: false,
    err:
      (e && e.stderr && String(e.stderr).trim()) ||
      (e && e.message) ||
      String(e),
    kode: e && e.gitErrorCode,
  };
}

async function _ada(dir: string, remote: string): Promise<boolean> {
  const r = await gv().repo(dir);
  return (await r.getRemotes()).some((x: any) => x.name === remote);
}

/** No remote configured: said before git is asked, in the panel's words. */
function _tanpaRemote(remote: string) {
  return {
    ok: false as const,
    kode: "NoRemote",
    remote,
    err: 'This folder has no remote "' + remote + '" yet.',
  };
}

/** The remotes of a folder. */
export async function remotes(dir: string) {
  try {
    const r = await gv().repo(dir);
    const daftar = await r.getRemotes();
    return {
      ok: true as const,
      remotes: daftar.map((x: any) => ({
        name: x.name,
        fetchUrl: x.fetchUrl || null,
        pushUrl: x.pushUrl || null,
      })),
    };
  } catch (e) {
    return _galat(e);
  }
}

/**
 * HEAD's upstream and ahead/behind -- the numbers VS Code's sync control
 * shows. ahead/behind come from the vendored getBranch(), the same
 * rev-list --left-right --count VS Code reads.
 */
export async function status(dir: string) {
  try {
    const r = await gv().repo(dir);
    let head: any = null;
    try {
      const h = await r.getHEAD();
      if (h && h.name) {
        const cabang = await r.getBranch(h.name);
        head = {
          name: h.name,
          // getHEAD() answers a SYMBOLIC ref with no commit; the branch
          // record carries it. Without it the control fell back to
          // "Publish Branch" on a branch that already had an upstream.
          commit: cabang.commit || h.commit || null,
          upstream: cabang.upstream
            ? { remote: cabang.upstream.remote, name: cabang.upstream.name }
            : null,
          ahead: cabang.ahead || 0,
          behind: cabang.behind || 0,
        };
      }
    } catch (_) {
      head = null;
    }
    const rm = await remotes(dir);
    return { ok: true as const, head, remotes: rm.ok ? rm.remotes : [] };
  } catch (e) {
    return _galat(e);
  }
}

export async function fetch(dir: string, remote = "origin", prune = false) {
  try {
    if (!(await _ada(dir, remote))) return _tanpaRemote(remote);
    const r = await gv().repo(dir);
    await r.fetch({ remote, prune });
    return { ok: true as const, remote };
  } catch (e) {
    return _galat(e);
  }
}

export async function pull(
  dir: string,
  remote = "origin",
  branch?: string,
  rebase = false,
) {
  try {
    if (!(await _ada(dir, remote))) return _tanpaRemote(remote);
    const r = await gv().repo(dir);
    await r.pull(rebase, remote, branch || undefined);
    return { ok: true as const, remote };
  } catch (e) {
    return _galat(e);
  }
}

export async function push(
  dir: string,
  remote = "origin",
  branch?: string,
  setUpstream = true,
) {
  try {
    if (!(await _ada(dir, remote))) return _tanpaRemote(remote);
    const r = await gv().repo(dir);
    await r.push(remote, branch || undefined, setUpstream);
    return { ok: true as const, remote, branch: branch || null };
  } catch (e) {
    return _galat(e);
  }
}

/** VS Code's _sync(): pull, then push ONLY when there is something to push. */
export async function sync(dir: string, rebase = false) {
  try {
    const r = await gv().repo(dir);
    const h = await r.getHEAD();
    const cabang = h && h.name ? await r.getBranch(h.name) : null;
    if (!cabang || !cabang.upstream) {
      return {
        ok: false as const,
        kode: "NoUpstream",
        err: "This branch has no upstream yet - publish it first.",
      };
    }
    await r.pull(rebase, cabang.upstream.remote, cabang.upstream.name);
    let didorong = 0;
    const sesudah = await r.getBranch(cabang.name!);
    if ((sesudah.ahead || 0) > 0) {
      await r.push(cabang.upstream.remote, cabang.name || undefined, false);
      didorong = sesudah.ahead || 0;
    }
    return {
      ok: true as const,
      remote: cabang.upstream.remote,
      ditarik: cabang.behind || 0,
      didorong,
    };
  } catch (e) {
    return _galat(e);
  }
}

/** git.publish: the first push of a branch, with the upstream set. */
export async function publish(dir: string, remote = "origin") {
  try {
    if (!(await _ada(dir, remote))) return _tanpaRemote(remote);
    const r = await gv().repo(dir);
    const h = await r.getHEAD();
    if (!h || !h.name) return { ok: false as const, err: "not on a branch" };
    await r.push(remote, h.name, true);
    return { ok: true as const, remote, branch: h.name };
  } catch (e) {
    return _galat(e);
  }
}

/** The URL of the repository linked in the GitHub panel, or null. */
export function urlGithubTertaut(): string | null {
  try {
    const gh = require("../agent/github.ts");
    const t = gh.taut();
    return t ? "https://github.com/" + t.owner + "/" + t.repo + ".git" : null;
  } catch (_) {
    return null;
  }
}

// A remote is named by a URL, never a bare path: https, ssh, or an explicit
// file:// (a repository on this machine, as tests and local mirrors use).
const URL_REMOTE = /^(https?:\/\/|git@|ssh:\/\/|file:\/\/)/;

/** Add a remote; `github: true` takes the URL from the linked repository. */
export async function addRemote(
  dir: string,
  url: string | undefined,
  github: boolean,
  remote = "origin",
) {
  try {
    let target = String(url || "").trim();
    if (!target && github) {
      const u = urlGithubTertaut();
      if (!u) {
        return {
          ok: false as const,
          kode: "NoGithubLink",
          err: "No GitHub repository is linked yet - link one in the GitHub panel first.",
        };
      }
      target = u;
    }
    if (!target) return { ok: false as const, err: "url is required" };
    if (!URL_REMOTE.test(target))
      return { ok: false as const, err: "not a remote URL: " + target };
    if (await _ada(dir, remote)) {
      return {
        ok: false as const,
        kode: "RemoteExists",
        err: 'remote "' + remote + '" already exists',
      };
    }
    const r = await gv().repo(dir);
    await r.addRemote(remote, target);
    return { ok: true as const, remote, url: target };
  } catch (e) {
    return _galat(e);
  }
}

/**
 * Clone a repository into parentPath/<name>. The folder must not already
 * exist: clone never overwrites. Authenticates through the same credential
 * helper as push, so a private repository of the connected account works.
 */
export async function clone(
  url: string,
  parentPath: string,
  targetName?: string,
) {
  try {
    const u = String(url || "").trim();
    if (!URL_REMOTE.test(u))
      return { ok: false as const, err: "not a repository URL: " + u };
    const parent = path.resolve(String(parentPath || ""));
    if (
      !parent ||
      !fs.existsSync(parent) ||
      !fs.statSync(parent).isDirectory()
    ) {
      return {
        ok: false as const,
        err: "destination folder does not exist: " + parent,
      };
    }
    const nama =
      String(targetName || "").trim() ||
      decodeURI(u)
        .replace(/[\/]+$/, "")
        .replace(/^.*[\/\\]/, "")
        .replace(/\.git$/, "") ||
      "repository";
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(nama))
      return { ok: false as const, err: "not a folder name: " + nama };
    const tujuan = path.join(parent, nama);
    if (fs.existsSync(tujuan)) {
      return {
        ok: false as const,
        kode: "Exists",
        err: "already exists: " + tujuan,
      };
    }
    const g = await gv().git();
    // The vendored clone picks a free folder name itself and reports the
    // path it used; targetName pins it to the one checked above.
    const dir = await g.clone(u, {
      parentPath: parent,
      targetName: nama,
      progress: { report() {} },
    });
    return { ok: true as const, path: dir, name: nama };
  } catch (e) {
    return _galat(e);
  }
}

module.exports = {
  remotes,
  status,
  fetch,
  pull,
  push,
  sync,
  publish,
  addRemote,
  clone,
  urlGithubTertaut,
};
