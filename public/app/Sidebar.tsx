// Sidebar — extracted from app.tsx (see public/app.tsx for the App
// orchestrator). Loaded via APP_MODULES in index.html: CONCATENATED BEFORE
// app.tsx (prepended), then Babel once -> a single global scope. Function
// bodies (hooks/React/SB) run at render time.

/* ----------------------------- Sidebar (Claude-style) ----------------------------- */
const SB = {
  panel: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <line
        x1="9"
        y1="4"
        x2="9"
        y2="20"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  ),
  plus: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <line
        x1="12"
        y1="5"
        x2="12"
        y2="19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <line
        x1="5"
        y1="12"
        x2="19"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  ),
  history: (p: any) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  ),
  chat: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M4 5h16v11H8l-4 4V5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  ),
  dev: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M8 9l3 3-3 3M13 15h3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  ),
  hub: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect
        x="4"
        y="4"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="13"
        y="4"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="4"
        y="13"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="13"
        y="13"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  ),
  key: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M11 11l8 8M16 16l2-2M18 18l2-2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  code: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M8 7l-5 5 5 5M16 7l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  target: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 2v4M12 18v4M2 12h4M18 12h4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  ),
  palette: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M12 3a9 9 0 100 18c1.7 0 2-1.3 1.2-2.2-.8-.9-.3-2.3 1-2.3H17a4 4 0 004-4 9 9 0 00-9-9.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="11" r="1" fill="currentColor" />
      <circle cx="11" cy="7.5" r="1" fill="currentColor" />
      <circle cx="15" cy="8.5" r="1" fill="currentColor" />
    </svg>
  ),
  runner: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M5 5h14v10H5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9 9l2 3-2 3M13 9l2 3-2 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 19h8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  ),
  // -- Agent-specific logos --
  wolfspaceAgent: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.3" />
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <circle cx="12" cy="3" r="1.8" fill="currentColor" />
      <circle cx="12" cy="21" r="1.8" fill="currentColor" />
      <circle cx="3" cy="12" r="1.8" fill="currentColor" />
      <circle cx="21" cy="12" r="1.8" fill="currentColor" />
      <line
        x1="12"
        y1="9"
        x2="12"
        y2="3"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.6"
      />
      <line
        x1="12"
        y1="15"
        x2="12"
        y2="21"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.6"
      />
      <line
        x1="9"
        y1="12"
        x2="3"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.6"
      />
      <line
        x1="15"
        y1="12"
        x2="21"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.6"
      />
    </svg>
  ),
  opencode: (p: any) => (
    <svg viewBox="0 0 12 15" {...p}>
      <rect width="12" height="15" fill="#131010" />
      <path d="M0 0H12V15H0Z M3 3H9V12H3Z" fill="#FFFFFF" fillRule="evenodd" />
      <rect x="3" y="6" width="6" height="6" fill="#5A5858" />
    </svg>
  ),
  claude: (p: any) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  ),
  workflow: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect
        x="3"
        y="4"
        width="6"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x="15"
        y="4"
        width="6"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x="9"
        y="15"
        width="6"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M6 10v2c0 1.5 1.5 3 3 3h3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 10v2c0 1.5-1.5 3-3 3h-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="15" r="1.5" fill="currentColor" />
    </svg>
  ),
};

// A workspace's identity is its EXACT path, not its name. Windows is
// case-insensitive and mixes "/" with "\", so normalise before comparing.
function normDelPath(s: any) {
  return String(s || "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
}
// Is this path on the delete list? Matched ONLY by exact (normalised) path —
// never by bare name or suffix. That closes an old bug: deleting a folder
// named "x" must not block a different folder "x" elsewhere forever.
function isPathDeleted(deletedArr: any, p: any) {
  if (!p) return false;
  const np = normDelPath(p);
  for (const d of deletedArr || []) if (normDelPath(d) === np) return true;
  return false;
}
// One-shot: strip the "poison" out of an old delete list — BARE NAME entries
// (rather than absolute paths) which, under the old name-matching, blocked any
// folder that happened to share a name. After this the blacklist holds only
// paths (the new invariant).
function sanitizeDeletedWorkspaces() {
  try {
    const raw = localStorage.getItem("wolfspace_deleted_workspaces");
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    const isAbsPath = (s: any) =>
      /^[a-zA-Z]:[\\/]/.test(String(s || "")) ||
      String(s || "").startsWith("/");
    const cleaned = arr.filter(isAbsPath);
    if (cleaned.length !== arr.length) {
      localStorage.setItem(
        "wolfspace_deleted_workspaces",
        JSON.stringify(cleaned),
      );
    }
  } catch (_) {}
}

// Clean the old blacklist poison once, as app.tsx loads (safe and idempotent).
try {
  sanitizeDeletedWorkspaces();
} catch (_) {}

// Turn the selected project into the folder PATH sent as workspace_root to the
// agent (confining the agent plus its file/bash operations to that folder).
// null means leave it unconfined: either the WOLFSPACE root (self-edit mode, as
// now) or unresolvable.
function resolveWorkspaceRoot(sel: any) {
  if (!sel) return null;
  let p = /[:\\/]/.test(sel) ? sel : null;
  if (!p) {
    try {
      const list = JSON.parse(
        localStorage.getItem("wolfspace_projects_list") || "[]",
      );
      const hit = list.find(
        (x: any) =>
          x &&
          (x.name === sel ||
            (x.path &&
              (x.path.endsWith("\\" + sel) || x.path.endsWith("/" + sel)))),
      );
      if (hit && hit.path) p = hit.path;
    } catch (_) {}
  }
  if (!p) return null;
  const norm = String(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  if (norm === WOLFSPACE_ROOT) return null; // WOLFSPACE sendiri → jangan kurung (self-edit)
  return p;
}

function deleteWorkspaceGlobal(wsToDelete: any) {
  try {
    if (!wsToDelete) return;
    const stored = JSON.parse(
      localStorage.getItem("wolfspace_projects_list") || "[]",
    );
    // Find this folder's PHYSICAL path BEFORE localStorage changes — it is what
    // the real on-disk delete uses. wsToDelete is sometimes a name and sometimes
    // a path, so look for the matching entry (the same logic as the filter
    // below) to get the correct p.path.
    const match = stored.find(
      (p: any) =>
        p.path === wsToDelete ||
        p.name === wsToDelete ||
        (p.path &&
          (p.path.endsWith(`\\${wsToDelete}`) ||
            p.path.endsWith(`/${wsToDelete}`))) ||
        wsToDelete.endsWith(`\\${p.name}`) ||
        wsToDelete.endsWith(`/${p.name}`),
    );
    const realPath =
      (match && match.path) ||
      (wsToDelete.includes(":") ||
      wsToDelete.includes("/") ||
      wsToDelete.includes("\\")
        ? wsToDelete
        : null);

    const updated = stored.filter((p: any) => {
      if (p.path === wsToDelete || p.name === wsToDelete) return false;
      if (
        wsToDelete.endsWith(`\\${p.name}`) ||
        wsToDelete.endsWith(`/${p.name}`)
      )
        return false;
      if (
        p.path &&
        (p.path.endsWith(`\\${wsToDelete}`) ||
          p.path.endsWith(`/${wsToDelete}`))
      )
        return false;
      return true;
    });
    localStorage.setItem("wolfspace_projects_list", JSON.stringify(updated));

    // The blacklist stores full paths ONLY (identity). Storing a bare name, as
    // it once did (p.name / wsToDelete-as-name), poisoned the list: a new folder
    // with the same name was filtered out forever. If the path cannot be
    // resolved the entry was already dropped from projects_list above — that is
    // enough, and no by-name blacklisting is needed.
    const deleted = JSON.parse(
      localStorage.getItem("wolfspace_deleted_workspaces") || "[]",
    );
    if (realPath && !isPathDeleted(deleted, realPath)) {
      deleted.push(realPath);
      localStorage.setItem(
        "wolfspace_deleted_workspaces",
        JSON.stringify(deleted),
      );
    }
    window.dispatchEvent(new Event("wolfspace_workspaces_changed"));

    // PHYSICALLY delete the folder and repo from disk (the backend refuses if it
    // is not a legitimate ww workspace — see POST /ww/delete). The UI above is
    // already clean regardless of the outcome.
    if (realPath) {
      wwApi("/ww/delete", { method: "POST", body: { path: realPath } }).catch(
        () => {},
      );
    }
  } catch (_) {}
}

// Fetch a READ-ONLY git summary for one workspace folder. The decoupling
// pattern: fetch fresh on mount and never store it in parent state — so every
// time a row or popover mounts, the data is current rather than a frozen
// snapshot.
function useWwGit(path: any, refreshKey?: any) {
  const [info, setInfo] = React.useState<any>(null);
  React.useEffect(() => {
    let alive = true;
    // Only an absolute path means anything as a repo on disk; bare names are
    // skipped.
    const looksAbsolute =
      typeof path === "string" && /^[a-zA-Z]:[\\/]|^\//.test(path);
    if (!looksAbsolute) {
      setInfo({ repo: false });
      return;
    }
    wwApi("/ww/git?path=" + encodeURIComponent(path)).then((r: any) => {
      if (alive) setInfo(r || { repo: false });
    });
    return () => {
      alive = false;
    };
  }, [path, refreshKey]);
  return info;
}

// Perbarui localStorage setelah FOLDER di-rename di disk: ganti path+name di
// projects_list, then announce the change so the sidebar and picker rebuild.
function applyFolderRenameLS(oldPath: any, newPath: any, newName: any) {
  try {
    const norm = (s: any) =>
      String(s || "")
        .replace(/\\/g, "/")
        .replace(/\/+$/, "")
        .toLowerCase();
    const list = JSON.parse(
      localStorage.getItem("wolfspace_projects_list") || "[]",
    );
    let changed = false;
    const upd = list.map((p: any) => {
      if (p && norm(p.path) === norm(oldPath)) {
        changed = true;
        return { ...p, path: newPath, name: newName };
      }
      return p;
    });
    if (changed)
      localStorage.setItem("wolfspace_projects_list", JSON.stringify(upd));
    window.dispatchEvent(new Event("wolfspace_workspaces_changed"));
  } catch (_) {}
}

// Pill branch + titik status di baris sidebar (selalu terlihat, "sekilas").
// The dot: yellow means uncommitted changes, grey-green means clean.
function WorkspaceGitPill({ path }: any) {
  return null;
}

// Panel detail git di dalam popover "Folder options". Mount = fetch fresh.
// Normalise input into a valid git branch name (mirrors toBranch in
// scripts/ww.cjs).
function toBranchName(name: any) {
  let b = String(name || "")
    .trim()
    .replace(/[^\w.\-/]+/g, "-")
    .replace(/\.\.+/g, ".")
    .replace(/^[-/.]+|[-/.]+$/g, "")
    .replace(/-{2,}/g, "-");
  return b || "work";
}
const gitBranchIcon = (sz: any) => (
  <svg
    width={sz}
    height={sz}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <line x1="6" y1="3" x2="6" y2="15"></line>
    <circle cx="18" cy="6" r="3"></circle>
    <circle cx="6" cy="18" r="3"></circle>
    <path d="M18 9a9 9 0 0 1-9 9"></path>
  </svg>
);

// Panel git INTERAKTIF di popover "Folder options": rename folder (disk), ganti/
// create / rename / delete a branch — all through the real /ww/* endpoints
// (actual git). The button and commit-field styles sit at module level rather
// than inline in JSX: the quality gate (agent/code-quality.cjs) watches this
// file's indentation depth, and style objects nested inside render would add to
// it while giving nothing back.
const commitInputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: "#1c2128",
  border: "1px solid #2f81f7",
  borderRadius: "5px",
  color: "#e6edf3",
  fontSize: "11.5px",
  padding: "3px 7px",
  outline: "none",
};
function commitBtnStyle(busy: any) {
  return {
    marginLeft: "auto",
    padding: "1px 8px",
    borderRadius: "5px",
    fontSize: "11px",
    color: busy ? "#6b7280" : "#e6edf3",
    background: "rgba(255,255,255,0.09)",
    cursor: busy ? "default" : "pointer",
    flexShrink: 0,
  };
}

function WorkspaceGitPanel({ path, onClose }: any) {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const g = useWwGit(path, refreshKey);
  const [br, setBr] = React.useState<any>(null); // { repo, current, branches:[] }
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [renamingBranch, setRenamingBranch] = React.useState<any>(null);
  const [editingFolder, setEditingFolder] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<any>(null); // { ok, text }

  React.useEffect(() => {
    let alive = true;
    const abs = typeof path === "string" && /^[a-zA-Z]:[\\/]|^\//.test(path);
    if (!abs) {
      setBr({ repo: false, current: null, branches: [] });
      return;
    }
    wwApi("/ww/branches?path=" + encodeURIComponent(path)).then((r: any) => {
      if (alive) setBr(r || { repo: false, current: null, branches: [] });
    });
    return () => {
      alive = false;
    };
  }, [path, refreshKey]);

  const flash = (ok: any, text: any) => {
    setMsg({ ok, text });
    setTimeout(
      () => setMsg((m: any) => (m && m.text === text ? null : m)),
      2800,
    );
  };
  const refresh = () => setRefreshKey((k: any) => k + 1);
  const run = async (url: any, body: any, okText: any, after?: any) => {
    setBusy(true);
    const r = await wwApi(url, { method: "POST", body });
    setBusy(false);
    if (r && r.ok) {
      flash(true, typeof okText === "function" ? okText(r) : okText);
      if (after) after(r);
      refresh();
      return true;
    }
    flash(false, (r && r.err) || "failed");
    return false;
  };

  const doSwitch = (b: any) =>
    run("/ww/branch/switch", { path, branch: b }, "switched to " + b, () =>
      setPickerOpen(false),
    );
  const doCreate = (name: any) => {
    const nm = toBranchName(name);
    run(
      "/ww/branch/create",
      { path, branch: nm },
      (r: any) => "branch created: " + (r.name || nm),
      () => {
        setPickerOpen(false);
        setQuery("");
      },
    );
  };
  const doRenameBranch = (oldN: any, newN: any) => {
    setRenamingBranch(null);
    const nn = toBranchName(newN);
    if (nn === oldN) return;
    run(
      "/ww/branch/rename",
      { path, oldName: oldN, newName: nn },
      (r: any) => "branch → " + (r.name || nn),
    );
  };
  const doDeleteBranch = (b: any) =>
    run("/ww/branch/delete", { path, branch: b }, "branch deleted: " + b);
  // Commit the ENTIRE working tree. Deliberately matching the "N uncommitted
  // changes" figure shown right beside it — a button that commits less than the
  // number displays would mislead.
  const doCommit = (message: any) => {
    const m = String(message || "").trim();
    setCommitting(false);
    if (!m) return; // cancel: empty means never mind, not an empty-message commit
    run(
      "/ww/commit",
      { path, message: m },
      (r: any) => "commit " + (r.hash || "") + " · " + (r.subject || m),
    );
  };
  const doRenameFolder = (newName: any) => {
    const nm = String(newName || "").trim();
    setEditingFolder(false);
    if (!nm || nm === basename) return;
    run(
      "/ww/rename",
      { path, newName: nm },
      (r: any) => "folder → " + (r.name || nm),
      (r: any) => {
        applyFolderRenameLS(path, r.path || path, r.name || nm);
        if (onClose) setTimeout(onClose, 500);
      },
    );
  };

  const basename =
    String(path || "")
      .split(/[\\/]/)
      .filter(Boolean)
      .pop() || String(path || "");
  if (g === null || br === null) {
    return (
      <div style={{ padding: "8px 14px", color: "#6b7280", fontSize: "12px" }}>
        loading git…
      </div>
    );
  }
  if (!g.repo) {
    return (
      <div style={{ padding: "8px 14px", color: "#6b7280", fontSize: "12px" }}>
        not a git repo
      </div>
    );
  }
  const dot = g.dirty ? "#d29922" : "#3fb950";
  const cur = (br && br.current) || g.branch;
  const branches = (br && br.branches) || [];
  const q = query.trim();
  const norm = q ? toBranchName(q) : "";
  const filtered = branches.filter((b: any) =>
    b.toLowerCase().includes(q.toLowerCase()),
  );
  const typedNew = q && !branches.some((b: any) => b === norm);

  const miniBtn = (onClick: any, title: any, color: any, children: any) => (
    <button
      className="btn-reset"
      onClick={(e: any) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      style={{
        width: "22px",
        height: "22px",
        borderRadius: "5px",
        color: color || "#6b7280",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
      onMouseEnter={(e: any) =>
        (e.currentTarget.style.background = "rgba(255,255,255,0.09)")
      }
      onMouseLeave={(e: any) =>
        (e.currentTarget.style.background = "transparent")
      }
    >
      {children}
    </button>
  );
  const pencil = (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9"></path>
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
    </svg>
  );
  const trash = (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
    </svg>
  );

  return (
    <div
      style={{
        padding: "8px 12px",
        borderBottom: "1px solid #21262d",
        display: "flex",
        flexDirection: "column",
        gap: "7px",
        opacity: busy ? 0.7 : 1,
        pointerEvents: busy ? "none" : "auto",
      }}
    >
      {/* folder name + rename */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8b949e"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        {editingFolder ? (
          <input
            autoFocus
            defaultValue={basename}
            onKeyDown={(e: any) => {
              if (e.key === "Enter") doRenameFolder(e.currentTarget.value);
              else if (e.key === "Escape") setEditingFolder(false);
            }}
            onBlur={(e: any) => doRenameFolder(e.currentTarget.value)}
            style={{
              flex: 1,
              minWidth: 0,
              background: "#1c2128",
              border: "1px solid #2f81f7",
              borderRadius: "5px",
              color: "#e6edf3",
              fontFamily: "inherit",
              fontSize: "12.5px",
              fontWeight: 600,
              padding: "2px 6px",
              outline: "none",
            }}
          />
        ) : (
          <React.Fragment>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "#e6edf3",
                fontSize: "12.5px",
                fontWeight: 600,
              }}
            >
              {basename}
            </span>
            {miniBtn(
              () => setEditingFolder(true),
              "Rename folder (on disk)",
              "#6b7280",
              pencil,
            )}
          </React.Fragment>
        )}
      </div>

      {/* active branch → picker */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setPickerOpen((o: any) => !o)}
          title="Manage branches"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            width: "100%",
            textAlign: "left",
            background: "#1c2128",
            border: "1px solid #30363d",
            color: "#e6edf3",
            borderRadius: "6px",
            padding: "5px 8px",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "12px",
          }}
        >
          <span style={{ color: "#8b949e", display: "inline-flex" }}>
            {gitBranchIcon(13)}
          </span>
          <span
            style={{
              flex: 1,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {cur}
          </span>
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6b7280"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: pickerOpen ? "rotate(180deg)" : "none",
              transition: "transform .15s",
            }}
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>

        {pickerOpen && (
          <div
            style={{
              marginTop: "5px",
              background: "#0d1117",
              border: "1px solid #30363d",
              borderRadius: "7px",
              overflow: "hidden",
            }}
          >
            <input
              autoFocus
              value={query}
              onChange={(e: any) => setQuery(e.target.value)}
              onKeyDown={(e: any) => {
                if (e.key === "Enter" && typedNew) doCreate(q);
                else if (e.key === "Escape") setPickerOpen(false);
              }}
              placeholder="Pick a branch / type to create…"
              style={{
                margin: "7px",
                width: "calc(100% - 14px)",
                background: "#161b22",
                border: "1px solid #30363d",
                borderRadius: "5px",
                color: "#e6edf3",
                fontFamily: "inherit",
                fontSize: "12px",
                padding: "5px 8px",
                outline: "none",
              }}
            />
            <div
              style={{
                maxHeight: "190px",
                overflowY: "auto",
                padding: "0 5px 7px",
              }}
            >
              {typedNew && (
                <div
                  onClick={() => doCreate(q)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "7px",
                    padding: "6px 7px",
                    borderRadius: "5px",
                    cursor: "pointer",
                    color: "#2f81f7",
                    fontSize: "12px",
                  }}
                  onMouseEnter={(e: any) =>
                    (e.currentTarget.style.background = "#21262d")
                  }
                  onMouseLeave={(e: any) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Buat branch “{norm}”
                  </span>
                </div>
              )}
              {filtered.length === 0 && !typedNew && (
                <div
                  style={{
                    padding: "8px 7px",
                    fontSize: "11.5px",
                    color: "#6b7280",
                  }}
                >
                  No matching branch.
                </div>
              )}
              {filtered.map((b: any) => {
                const isCur = b === cur;
                if (renamingBranch === b) {
                  return (
                    <div
                      key={b}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "5px 7px",
                      }}
                    >
                      <span style={{ width: "15px" }}></span>
                      <input
                        autoFocus
                        defaultValue={b}
                        onKeyDown={(e: any) => {
                          if (e.key === "Enter")
                            doRenameBranch(b, e.currentTarget.value);
                          else if (e.key === "Escape") setRenamingBranch(null);
                        }}
                        onBlur={(e: any) =>
                          doRenameBranch(b, e.currentTarget.value)
                        }
                        style={{
                          flex: 1,
                          minWidth: 0,
                          background: "#1c2128",
                          border: "1px solid #2f81f7",
                          borderRadius: "5px",
                          color: "#e6edf3",
                          fontFamily: "ui-monospace, monospace",
                          fontSize: "12px",
                          padding: "2px 6px",
                          outline: "none",
                        }}
                      />
                    </div>
                  );
                }
                return (
                  <div
                    key={b}
                    onClick={() => !isCur && doSwitch(b)}
                    title={isCur ? "active branch" : "switched to " + b}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                      padding: "6px 7px",
                      borderRadius: "5px",
                      cursor: isCur ? "default" : "pointer",
                      background: isCur ? "#21262d" : "transparent",
                      fontSize: "12px",
                      color: "#e6edf3",
                    }}
                    onMouseEnter={(e: any) => {
                      if (!isCur) e.currentTarget.style.background = "#21262d";
                    }}
                    onMouseLeave={(e: any) => {
                      if (!isCur)
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span
                      style={{
                        width: "15px",
                        display: "inline-flex",
                        justifyContent: "center",
                        color: "#3fb950",
                        flexShrink: 0,
                      }}
                    >
                      {isCur && (
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      )}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontFamily: "ui-monospace, monospace",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {b}
                    </span>
                    <span
                      style={{ display: "flex", gap: "1px", flexShrink: 0 }}
                      onClick={(e: any) => e.stopPropagation()}
                    >
                      {miniBtn(
                        () => setRenamingBranch(b),
                        "Rename branch",
                        "#6b7280",
                        pencil,
                      )}
                      {miniBtn(
                        () => {
                          if (!isCur) doDeleteBranch(b);
                        },
                        isCur
                          ? "the active branch cannot be deleted"
                          : "Delete branch",
                        isCur ? "#3a3f46" : "#f85149",
                        trash,
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* status + commit */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "11.5px",
          color: "#8b949e",
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: dot,
            flexShrink: 0,
          }}
        ></span>
        <span>
          {g.dirty
            ? g.dirtyCount + " uncommitted changes"
            : "clean — no changes"}
        </span>
        {g.dirty && !committing && (
          <button
            className="btn-reset vp-hover"
            title="Commit all changes"
            disabled={busy}
            onClick={() => setCommitting(true)}
            style={commitBtnStyle(busy)}
          >
            Commit
          </button>
        )}
      </div>
      {/* The message field appears ONLY after the button is pressed, following
          the branch-rename pattern in the same panel: Enter submits,
          Escape or empty cancels. A commit with no message is deliberately not
          offered — a git history full of identical messages cannot be read back
          when it is needed. */}
      {committing && (
        <input
          autoFocus
          placeholder="commit message — Enter to save, Esc to cancel"
          onKeyDown={(e: any) => {
            if (e.key === "Enter") doCommit(e.currentTarget.value);
            else if (e.key === "Escape") setCommitting(false);
          }}
          onBlur={(e: any) => doCommit(e.currentTarget.value)}
          style={commitInputStyle}
        />
      )}
      {g.lastCommit && (
        <div
          style={{
            fontSize: "11px",
            color: "#6b7280",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={g.lastCommit.hash + " " + g.lastCommit.subject}
        >
          {g.lastCommit.hash} · {g.lastCommit.subject} · {g.lastCommit.when}
        </div>
      )}
      {msg && (
        <div
          style={{
            fontSize: "11px",
            color: msg.ok ? "#3fb950" : "#f85149",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}

function Sidebar({
  mode = "penuh",
  putarMode,
  view,
  setView,
  onNewChat,
  theme,
  setTheme,
  terminalOpen,
  setTerminalOpen,
  terminal,
  savedChats,
  showHistory,
  setShowHistory,
  restoreChat,
  deleteChat,
  renameChat,
  loadSavedChats,
  selectedProject,
  onOpenPicker,
  posisi,
  setPosisi,
  chatVisible,
  setChatVisible,
  panelOpen,
  logicOpen,
  setLogicOpen,
}: any) {
  // Derived from mode rather than a separate prop: "collapsed" and "hidden"
  // both hide the labels, so all the older code that asks "are we collapsed?"
  // stays correct without being changed one by one.
  const collapsed = mode !== "penuh";
  const setCollapsed = putarMode;
  const [showTools, setShowTools] = useState(false);
  const [showView, setShowView] = useState(false);
  const [showConversation, setShowConversation] = useState(false);
  const [showWorkspaces, setShowWorkspaces] = useState(true);
  const [hoveredChatId, setHoveredChatId] = useState<any>(null);
  const [openMenuChatId, setOpenMenuChatId] = useState<any>(null);
  const [editingChatId, setEditingChatId] = useState<any>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [filterGroupBy, setFilterGroupBy] = useState("Environment");
  const [filterSortBy, setFilterSortBy] = useState("Last Updated");
  const [filterSubtitle, setFilterSubtitle] = useState("Project + Worktree");
  const [filterScheduled, setFilterScheduled] = useState(false);
  const [openFolderMenuWs, setOpenFolderMenuWs] = useState<any>(null);
  const [wsRefreshKey, setWsRefreshKey] = useState(0);
  // ww folders from DISK (the truth) — not localStorage. Filled from GET /ww/list.
  const [wwLive, setWwLive] = useState<any>(null); // null = not loaded yet; {root, paths:[]}
  React.useEffect(() => {
    let alive = true;
    const load = () =>
      wwListFetch()
        .then((d: any) => {
          if (alive && d && Array.isArray(d.workspaces))
            setWwLive({
              root: d.root,
              paths: d.workspaces.map((w: any) => w.path),
            });
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 6000);
    window.addEventListener("wolfspace_workspaces_changed", load);
    return () => {
      alive = false;
      clearInterval(iv);
      window.removeEventListener("wolfspace_workspaces_changed", load);
    };
  }, []);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const w = parseInt(
        localStorage.getItem("wolfspace_sidebar_width") || "232",
        10,
      );
      return isNaN(w) ? 232 : Math.max(160, Math.min(600, w));
    } catch (_) {
      return 232;
    }
  });
  const [isResizing, setIsResizing] = useState(false);

  const handleResizerMouseDown = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: any) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(160, Math.min(600, startWidth + deltaX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = (upEvent: any) => {
      const deltaX = upEvent.clientX - startX;
      const finalWidth = Math.max(160, Math.min(600, startWidth + deltaX));
      setIsResizing(false);
      try {
        localStorage.setItem("wolfspace_sidebar_width", String(finalWidth));
      } catch (_) {}
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  React.useEffect(() => {
    const handleWindowClick = () => {
      setOpenMenuChatId(null);
      setFilterMenuOpen(false);
      setOpenFolderMenuWs(null);
    };
    const handleWsChanged = () => {
      setWsRefreshKey((prev: any) => prev + 1);
    };
    window.addEventListener("click", handleWindowClick);
    window.addEventListener("wolfspace_workspaces_changed", handleWsChanged);
    return () => {
      window.removeEventListener("click", handleWindowClick);
      window.removeEventListener(
        "wolfspace_workspaces_changed",
        handleWsChanged,
      );
    };
  }, []);

  const handleDeleteFolder = (wsToDelete: any) => {
    deleteWorkspaceGlobal(wsToDelete);
  };

  const workspacesList = React.useMemo(() => {
    const set = new Set();
    let deleted: any[] = [];
    try {
      deleted = JSON.parse(
        localStorage.getItem("wolfspace_deleted_workspaces") || "[]",
      );
    } catch (_) {}
    const isDel = (x: any) => isPathDeleted(deleted, x); // path-exact, not name/suffix

    if (selectedProject && !isDel(selectedProject)) set.add(selectedProject);
    else if (!isDel(WOLFSPACE_ROOT_WIN)) set.add(WOLFSPACE_ROOT_WIN);
    try {
      const stored = JSON.parse(
        localStorage.getItem("wolfspace_projects_list") || "[]",
      );
      stored.forEach((p: any) => {
        if (p.path && !isDel(p.path)) set.add(p.path);
        else if (p.name && !isDel(p.name)) set.add(p.name);
      });
    } catch (_) {}
    if (savedChats && savedChats.length > 0) {
      savedChats.forEach((c: any) => {
        if (c.project && !isDel(c.project)) set.add(c.project);
      });
    }
    // ── ww is the disk truth ── Add ww folders that REALLY exist; drop "ghosts"
    // (entries under the ww root that are no longer on disk, deleted in Explorer
    // for instance).
    if (wwLive && wwLive.root && Array.isArray(wwLive.paths)) {
      // Normalise separators (\\ vs /) and lowercase so the prefix check is
      // consistent.
      // apa pun gaya path (config pakai /, path.join pakai \\ di Windows).
      const norm = (s: any) =>
        String(s).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
      const rootN = norm(wwLive.root);
      const liveN = new Set(wwLive.paths.map(norm));
      for (const p of Array.from(set)) {
        const pn = norm(p);
        if (pn === rootN || pn.startsWith(rootN + "/")) {
          if (!liveN.has(pn)) set.delete(p); // ghost: under the ww root but not on disk
        }
      }
      wwLive.paths.forEach((p: any) => {
        if (!isDel(p)) set.add(p);
      });
    }
    return Array.from(set);
  }, [savedChats, selectedProject, wsRefreshKey, wwLive]);

  const formatWsTimeAgo = (ts: any) => {
    if (!ts) return "8h";
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return "now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
    return `${Math.floor(diff / 2592000)}mo`;
  };

  const Item = ({ icon, label, active, onClick, badge }: any) => (
    <button
      className={"sb-item" + (active ? " active" : "")}
      onClick={onClick}
      title={collapsed ? label : undefined}
    >
      <i className="sb-ico">{icon}</i>
      <span className="sb-label">{label}</span>
      {badge && <span className="sb-badge">{badge}</span>}
    </button>
  );
  return (
    <aside
      className={
        "sidebar" +
        (collapsed ? " collapsed" : "") +
        (mode === "sembunyi" ? " sembunyi" : "") +
        (isResizing ? " resizing" : "")
      }
      style={{ width: collapsed ? undefined : `${sidebarWidth}px` }}
      onClickCapture={(e: any) => {
        const btn = e.target.closest(".sb-item");
        // If the click landed on the Visual Draw, Picker or Terminal button, let
        // their own onClick do the toggling.
        if (
          btn &&
          (btn.textContent.includes("Visual Picker") ||
            btn.textContent.includes("Visual Draw") ||
            btn.textContent.includes("Terminal"))
        ) {
          return;
        }
        // A click anywhere else in the sidebar (Chat, Settings, the logo, …)
        // force-stops every mode.
        if (typeof VP_STOP === "function" && VP_STOP !== null) VP_STOP();
        if (typeof VD_STOP === "function" && VD_STOP !== null) VD_STOP();
      }}
    >
      {!collapsed && (
        <div
          className="sb-resizer"
          onMouseDown={handleResizerMouseDown}
          title="Drag to resize the sidebar"
        />
      )}

      <div className="sb-head">
        <span className="sb-brand">
          <BrandMark />
          <b>WOLFSPACE</b>
        </span>
        <button
          className="sb-toggle"
          title={
            mode === "penuh"
              ? "Compact — icons only"
              : mode === "ringkas"
                ? "Hide sidebar"
                : "Show sidebar"
          }
          aria-label={"Sidebar: " + mode}
          onClick={putarMode}
        >
          {SB.panel({ width: 19, height: 19 })}
        </button>
      </div>
      <div
        className="sb-sec"
        style={{ cursor: "pointer" }}
        onClick={() => setShowConversation(!showConversation)}
      >
        Conversation
      </div>
      {showConversation && (
        <div className="sb-group">
          <Item
            icon={SB.plus({ width: 19, height: 19 })}
            label="New Conversation"
            onClick={onNewChat}
          />
          <Item
            icon={SB.history({ width: 19, height: 19 })}
            label="Conversation History"
            active={view === "history"}
            onClick={() => {
              setView("history");
              loadSavedChats();
            }}
          />
        </div>
      )}
      <div
        className="sb-sec"
        style={{
          display: collapsed ? "none" : "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "12px",
          color: "#8b98a9",
          position: "relative",
        }}
        onClick={() => setShowWorkspaces(!showWorkspaces)}
      >
        <span>Workspaces</span>
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            color: "#6b7280",
          }}
        >
          <span
            title="Add Workspace"
            style={{ cursor: "pointer", display: "flex", alignItems: "center" }}
            onClick={(e: any) => {
              e.stopPropagation();
              if (onOpenPicker) onOpenPicker();
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              <line x1="12" y1="11" x2="12" y2="17"></line>
              <line x1="9" y1="14" x2="15" y2="14"></line>
            </svg>
          </span>
        </div>
        {filterMenuOpen && (
          <div
            className="filter-sort-menu"
            onClick={(e: any) => e.stopPropagation()}
          >
            {/* Section 1: Group By */}
            <div className="filter-sort-header">Group By</div>
            {["Project", "Environment", "Status", "None"].map((opt: any) => (
              <button
                key={opt}
                className={
                  "filter-sort-item" + (filterGroupBy === opt ? " active" : "")
                }
                onClick={() => {
                  setFilterGroupBy(opt);
                  setFilterMenuOpen(false);
                }}
              >
                {opt}
              </button>
            ))}

            <div className="filter-sort-divider" />

            {/* Section 2: Sort Conversations */}
            <div className="filter-sort-header">Sort Conversations</div>
            {["Last Updated", "Alphabetical (A-Z)", "Date Added"].map(
              (opt: any) => (
                <button
                  key={opt}
                  className={
                    "filter-sort-item" + (filterSortBy === opt ? " active" : "")
                  }
                  onClick={() => {
                    setFilterSortBy(opt);
                    setFilterMenuOpen(false);
                  }}
                >
                  {opt}
                </button>
              ),
            )}

            <div className="filter-sort-divider" />

            {/* Section 3: Subtitles */}
            <div className="filter-sort-header">Subtitles</div>
            {["Project + Worktree", "No Subtitle"].map((opt: any) => (
              <button
                key={opt}
                className={
                  "filter-sort-item" + (filterSubtitle === opt ? " active" : "")
                }
                onClick={() => {
                  setFilterSubtitle(opt);
                  setFilterMenuOpen(false);
                }}
              >
                {opt}
              </button>
            ))}

            <div className="filter-sort-divider" />

            {/* Section 4: Filter */}
            <div className="filter-sort-header">Filter</div>
            <button
              className={
                "filter-sort-item" + (filterScheduled ? " active" : "")
              }
              onClick={() => {
                setFilterScheduled(!filterScheduled);
                setFilterMenuOpen(false);
              }}
            >
              Scheduled
            </button>
          </div>
        )}
      </div>
      {showWorkspaces &&
        (collapsed ? (
          <div className="sb-group">
            <Item
              icon={
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              }
              label="Workspaces"
              onClick={() => setCollapsed(false)}
            />
          </div>
        ) : (
          <div
            className="sb-group"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              marginBottom: "8px",
            }}
          >
            {workspacesList
              .filter(
                (ws: any) =>
                  ws !== WOLFSPACE_ROOT_WIN &&
                  !ws.toLowerCase().endsWith("wolfspace"),
              )
              .map((ws: any) => {
                const wsChats = savedChats
                  .slice()
                  .reverse()
                  .filter((c: any) => {
                    if (c.project)
                      return (
                        c.project === ws ||
                        ws.endsWith(`\\${c.project}`) ||
                        ws.endsWith(`/${c.project}`)
                      );
                    return ws === selectedProject || ws === WOLFSPACE_ROOT_WIN;
                  });

                return (
                  <div
                    key={ws}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                        padding: "6px 12px",
                        color: "#a1aab8",
                        fontSize: "13px",
                        fontWeight: 500,
                        cursor: "pointer",
                        borderRadius: "6px",
                      }}
                      onMouseEnter={(e: any) =>
                        (e.currentTarget.style.background =
                          "rgba(255, 255, 255, 0.03)")
                      }
                      onMouseLeave={(e: any) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          minWidth: 0,
                          overflow: "hidden",
                        }}
                      >
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ flexShrink: 0 }}
                        >
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {ws === WOLFSPACE_ROOT_WIN ? "WOLFSPACE" : ws}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          flexShrink: 0,
                        }}
                      >
                        <WorkspaceGitPill path={ws} />
                        <span
                          title="Folder options"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "2px",
                            marginRight: "-2px",
                            borderRadius: "4px",
                            color: "#6b7280",
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                          onClick={(e: any) => {
                            e.stopPropagation();
                            setOpenFolderMenuWs(
                              openFolderMenuWs === ws ? null : ws,
                            );
                          }}
                          onMouseEnter={(e: any) => {
                            e.currentTarget.style.background =
                              "rgba(255, 255, 255, 0.08)";
                            e.currentTarget.style.color = "#f8fafc";
                          }}
                          onMouseLeave={(e: any) => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = "#6b7280";
                          }}
                        >
                          <svg
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="vp-hover"
                          >
                            <line x1="4" y1="6" x2="20" y2="6"></line>
                            <line x1="7" y1="12" x2="17" y2="12"></line>
                            <line x1="10" y1="18" x2="14" y2="18"></line>
                          </svg>
                        </span>
                      </div>
                    </div>
                    {openFolderMenuWs === ws && (
                      <div
                        onClick={(e: any) => e.stopPropagation()}
                        style={{
                          position: "absolute",
                          top: "-4px",
                          left: "calc(100% + 14px)",
                          right: "auto",
                          background: "#161b22",
                          border: "1px solid #30363d",
                          borderRadius: "8px",
                          boxShadow: "0 12px 36px rgba(0,0,0,0.65)",
                          padding: "4px 0",
                          zIndex: 2000,
                          minWidth: "250px",
                        }}
                      >
                        <WorkspaceGitPanel
                          path={ws}
                          onClose={() => setOpenFolderMenuWs(null)}
                        />
                        <button
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            width: "100%",
                            padding: "8px 14px",
                            color: "#f85149",
                            fontSize: "13px",
                            border: "none",
                            background: "none",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            textAlign: "left",
                          }}
                          onMouseEnter={(e: any) =>
                            (e.currentTarget.style.background =
                              "rgba(248, 81, 73, 0.12)")
                          }
                          onMouseLeave={(e: any) =>
                            (e.currentTarget.style.background = "transparent")
                          }
                          onClick={() => {
                            handleDeleteFolder(ws);
                            setOpenFolderMenuWs(null);
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                          </svg>
                          <span>Delete folder</span>
                        </button>
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        paddingLeft: "20px",
                        gap: "2px",
                      }}
                    >
                      {wsChats.map((chat: any, idx: number) => {
                        const showActions =
                          hoveredChatId === chat.id ||
                          openMenuChatId === chat.id ||
                          (idx === 0 &&
                            hoveredChatId === null &&
                            openMenuChatId === null);
                        return (
                          <div
                            key={chat.id}
                            onClick={() => restoreChat?.(chat)}
                            onMouseEnter={(e: any) => {
                              setHoveredChatId(chat.id);
                              e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.04)";
                            }}
                            onMouseLeave={(e: any) => {
                              setHoveredChatId(null);
                              e.currentTarget.style.background = "transparent";
                            }}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "6px 10px",
                              color: "#cbd5e1",
                              fontSize: "13px",
                              cursor: "pointer",
                              borderRadius: "6px",
                              transition: "background 0.15s",
                              position: "relative",
                            }}
                          >
                            {editingChatId === chat.id ? (
                              <input
                                autoFocus
                                type="text"
                                value={editingTitle}
                                onChange={(e: any) =>
                                  setEditingTitle(e.target.value)
                                }
                                onKeyDown={(e: any) => {
                                  if (e.key === "Enter") {
                                    renameChat?.(chat.id, editingTitle);
                                    setEditingChatId(null);
                                  } else if (e.key === "Escape") {
                                    setEditingChatId(null);
                                  }
                                }}
                                onBlur={() => {
                                  renameChat?.(chat.id, editingTitle);
                                  setEditingChatId(null);
                                }}
                                onClick={(e: any) => e.stopPropagation()}
                                style={{
                                  background: "rgba(0, 0, 0, 0.4)",
                                  border: "1px solid rgba(255, 255, 255, 0.2)",
                                  borderRadius: "4px",
                                  color: "#fff",
                                  padding: "2px 6px",
                                  fontSize: "13px",
                                  flex: 1,
                                  outline: "none",
                                  marginRight: "8px",
                                }}
                              />
                            ) : (
                              <span
                                style={{
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  flex: 1,
                                  paddingRight: "8px",
                                }}
                              >
                                {chat.title || "Chat"}
                              </span>
                            )}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                color: "#6b7280",
                                fontSize: "12px",
                                flexShrink: 0,
                              }}
                            >
                              {showActions ? (
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                >
                                  <span
                                    title="More options"
                                    style={{
                                      cursor: "pointer",
                                      padding: "2px",
                                      display: "flex",
                                    }}
                                    onClick={(e: any) => {
                                      e.stopPropagation();
                                      setOpenMenuChatId(
                                        openMenuChatId === chat.id
                                          ? null
                                          : chat.id,
                                      );
                                    }}
                                  >
                                    <svg
                                      width="14"
                                      height="14"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <circle cx="12" cy="12" r="1"></circle>
                                      <circle cx="12" cy="5" r="1"></circle>
                                      <circle cx="12" cy="19" r="1"></circle>
                                    </svg>
                                  </span>
                                  <span
                                    title="Pin"
                                    style={{
                                      cursor: "pointer",
                                      padding: "2px",
                                      display: "flex",
                                    }}
                                    onClick={(e: any) => e.stopPropagation()}
                                  >
                                    <svg
                                      width="14"
                                      height="14"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <line
                                        x1="12"
                                        y1="17"
                                        x2="12"
                                        y2="22"
                                      ></line>
                                      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                                    </svg>
                                  </span>
                                </div>
                              ) : (
                                <span>{formatWsTimeAgo(chat.savedAt)}</span>
                              )}
                            </div>
                            {openMenuChatId === chat.id && (
                              <div
                                onClick={(e: any) => e.stopPropagation()}
                                style={{
                                  position: "absolute",
                                  top: "100%",
                                  right: "8px",
                                  zIndex: 99999,
                                  background: "#181a1f",
                                  border: "1px solid rgba(255, 255, 255, 0.08)",
                                  borderRadius: "8px",
                                  padding: "6px 0",
                                  boxShadow:
                                    "0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.4)",
                                  minWidth: "170px",
                                  display: "flex",
                                  flexDirection: "column",
                                }}
                              >
                                <div
                                  onClick={(e: any) => {
                                    e.stopPropagation();
                                    setOpenMenuChatId(null);
                                    setEditingChatId(chat.id);
                                    setEditingTitle(chat.title || "Chat");
                                  }}
                                  onMouseEnter={(e: any) => {
                                    e.currentTarget.style.background =
                                      "rgba(255, 255, 255, 0.06)";
                                    e.currentTarget.style.color = "#f8fafc";
                                  }}
                                  onMouseLeave={(e: any) => {
                                    e.currentTarget.style.background =
                                      "transparent";
                                    e.currentTarget.style.color = "#cbd5e1";
                                  }}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    padding: "8px 14px",
                                    color: "#cbd5e1",
                                    fontSize: "13px",
                                    fontWeight: 500,
                                    cursor: "pointer",
                                    transition: "background 0.15s, color 0.15s",
                                  }}
                                >
                                  <svg
                                    width="15"
                                    height="15"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                                  </svg>
                                  <span>Rename</span>
                                </div>
                                <div
                                  onClick={(e: any) => {
                                    e.stopPropagation();
                                    setOpenMenuChatId(null);
                                    deleteChat?.(chat.id);
                                  }}
                                  onMouseEnter={(e: any) => {
                                    e.currentTarget.style.background =
                                      "rgba(255, 255, 255, 0.06)";
                                    e.currentTarget.style.color = "#f8fafc";
                                  }}
                                  onMouseLeave={(e: any) => {
                                    e.currentTarget.style.background =
                                      "transparent";
                                    e.currentTarget.style.color = "#cbd5e1";
                                  }}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    padding: "8px 14px",
                                    color: "#cbd5e1",
                                    fontSize: "13px",
                                    fontWeight: 500,
                                    cursor: "pointer",
                                    transition: "background 0.15s, color 0.15s",
                                  }}
                                >
                                  <svg
                                    width="15"
                                    height="15"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    <line
                                      x1="10"
                                      y1="11"
                                      x2="10"
                                      y2="17"
                                    ></line>
                                    <line
                                      x1="14"
                                      y1="11"
                                      x2="14"
                                      y2="17"
                                    ></line>
                                  </svg>
                                  <span>Delete Conversation</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        ))}
      <div
        className="sb-sec"
        style={{ cursor: "pointer" }}
        onClick={() => setShowView(!showView)}
      >
        View
      </div>
      {showView && (
        <div className="sb-group">
          <Item
            icon={SB.key({ width: 19, height: 19 })}
            label="API Key"
            active={view === "settings"}
            onClick={() => setView("settings")}
          />
        </div>
      )}
      <div
        className="sb-sec"
        style={{ cursor: "pointer" }}
        onClick={() => setShowTools(!showTools)}
      >
        Tools
      </div>
      {showTools && (
        <div className="sb-group">
          {/* Visual Picker & Visual Draw moved to the panel menu button (⋮)
              in the "Web Dev Live Browser" header — no longer in the sidebar. */}
          <Item
            icon={
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="4 17 10 11 4 5"></polyline>
                <line x1="12" y1="19" x2="20" y2="19"></line>
              </svg>
            }
            label="Terminal"
            active={terminalOpen}
            onClick={() => setTerminalOpen(!terminalOpen)}
          />
          {/* Plugins — a full page (like Extensions in VS Code), not a
              dropdown. The word means what it says: things plugged in from
              outside, not modules required inward. */}
          <Item
            icon={
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22v-5"></path>
                <path d="M9 8V2"></path>
                <path d="M15 8V2"></path>
                <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"></path>
              </svg>
            }
            label="Plugins"
            active={view === "plugins"}
            onClick={() => setView("plugins")}
          />
        </div>
      )}
      {/* ── Menu tata letak, di KAKI sidebar ──
          `margin-top: auto` pushes it to the bottom whatever sits above it,
          so its place stays the same whether the Conversation/View/Tools
          sections are open or closed. It stays visible when the sidebar is
          collapsed: collapsing hides the label, not the button. */}
      <div className="sb-menu-kaki">
        <MenuTataLetak
          posisi={posisi}
          setPosisi={setPosisi}
          chatVisible={chatVisible}
          setChatVisible={setChatVisible}
          panelOpen={panelOpen}
          terminalOpen={terminalOpen}
          logicOpen={logicOpen}
          setLogicOpen={setLogicOpen}
          arah="atas"
        />
        {!collapsed && <span className="sb-menu-kaki-label">Layout</span>}
      </div>
    </aside>
  );
}

// Live agent process � animated bubbles showing each file/folder being worked on.
// ─── Agent Step UI v2 ── SVG icons per tool ────────────────────────────────
const AG_SVG = {
  list: (p: any) => (
    <svg viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M2 3h3v3H2zM2 7h3v3H2zM2 11h3v3H2z"
        fill="currentColor"
        opacity=".4"
      />
      <path
        d="M7 4h7M7 8h7M7 12h7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  glob: (p: any) => (
    <svg viewBox="0 0 16 16" fill="none" {...p}>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 2.5C6 5 6 11 8 13.5M8 2.5C10 5 10 11 8 13.5M2.5 8h11"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  ),
  read: (p: any) => (
    <svg viewBox="0 0 16 16" fill="none" {...p}>
      <rect
        x="3"
        y="1.5"
        width="10"
        height="13"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M5.5 5h5M5.5 7.5h5M5.5 10h3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  ),
  grep: (p: any) => (
    <svg viewBox="0 0 16 16" fill="none" {...p}>
      <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10 10l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M5 6.5h3M6.5 5v3"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  ),
  edit: (p: any) => (
    <svg viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M10.5 2.5l3 3L5 14H2v-3L10.5 2.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8.5 4.5l3 3" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  write: (p: any) => (
    <svg viewBox="0 0 16 16" fill="none" {...p}>
      <rect
        x="2"
        y="2"
        width="12"
        height="12"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M8 5v6M5 8h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
  run: (p: any) => (
    <svg viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M4 2.5l10 5.5-10 5.5V2.5z" fill="currentColor" opacity=".9" />
    </svg>
  ),
  bash: (p: any) => (
    <svg viewBox="0 0 16 16" fill="none" {...p}>
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M4 6l2.5 2.5L4 11M8.5 11h3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  err: (p: any) => (
    <svg viewBox="0 0 16 16" fill="none" {...p}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 5v4M8 11v.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
};
const AG_META = {
  list: {
    label: "List",
    color: "var(--text-muted, #94a3b8)",
    bg: "transparent",
  },
  glob: {
    label: "Glob",
    color: "var(--text-muted, #94a3b8)",
    bg: "transparent",
  },
  read: {
    label: "Read",
    color: "var(--text-muted, #94a3b8)",
    bg: "transparent",
  },
  grep: {
    label: "Grep",
    color: "var(--text-muted, #94a3b8)",
    bg: "transparent",
  },
  edit: {
    label: "Edit",
    color: "var(--text-muted, #94a3b8)",
    bg: "transparent",
  },
  write: {
    label: "Write",
    color: "var(--text-muted, #94a3b8)",
    bg: "transparent",
  },
  run: { label: "Run", color: "var(--text-muted, #94a3b8)", bg: "transparent" },
  bash: {
    label: "Bash",
    color: "var(--text-muted, #94a3b8)",
    bg: "transparent",
  },
  err: { label: "Error", color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};
// Strip the DONE protocol marker so the agent's answer reads clean.
function cleanAgentText(s: any) {
  return (s || "")
    .replace(/^\s*```+\s*done\b[^\n]*\n?/i, "") // leading ```DONE fence (old protocol)
    .replace(/^\s*done\b[:\s]*/i, "") // leading "DONE" / "DONE:"
    .replace(/\n*\s*\bdone\b\s*$/i, "") // trailing standalone DONE
    .trim();
}

/* Agent-steps (ToolOutput..HitlModal) moved to public/app/AgentSteps.tsx (APP_MODULES). */
