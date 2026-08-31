// Screens — extracted from app.tsx (see public/app.tsx for the App
// orchestrator). Loaded via APP_MODULES in index.html: CONCATENATED BEFORE
// app.tsx (prepended), then Babel once -> a single global scope. Function
// bodies (hooks/React/SB) run at render time.

function PickerFolderIcon({ size = 15 }: any) {
  return React.createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.5",
    },
    React.createElement("path", {
      d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
    }),
  );
}
function PickerChevIcon({ size = 12 }: any) {
  return React.createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
    },
    React.createElement("polyline", { points: "6 9 12 15 18 9" }),
  );
}
function PickerPlusIcon() {
  return React.createElement(
    "svg",
    {
      width: 16,
      height: 16,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.5",
    },
    React.createElement("line", { x1: "12", y1: "5", x2: "12", y2: "19" }),
    React.createElement("line", { x1: "5", y1: "12", x2: "19", y2: "12" }),
  );
}
function PickerSendIcon() {
  return React.createElement(
    "svg",
    {
      width: 16,
      height: 16,
      viewBox: "0 0 24 24",
      fill: "#9bb1d1",
      stroke: "none",
    },
    React.createElement("path", {
      d: "M2 21L23 12 2 3v7l15 2-15 2z",
      transform: "rotate(-45 12 12)",
    }),
  );
}
function getPickerProjectsList() {
  const defaultDefaults = [
    { name: "project", path: "c:\\Users\\dave\\project" },
  ];
  const isWolfspace = (p: any) =>
    p &&
    ((p.path && p.path.toLowerCase().includes("wolfspace")) ||
      (p.name && p.name.toLowerCase().includes("wolfspace")));
  try {
    const deleted = JSON.parse(
      localStorage.getItem("wolfspace_deleted_workspaces") || "[]",
    );
    // Matched ONLY on exact path — not name or suffix (see isPathDeleted).
    const isDel = (p: any) =>
      isPathDeleted(deleted, p && p.path) || isWolfspace(p);
    const stored = JSON.parse(
      localStorage.getItem("wolfspace_projects_list") || "[]",
    );
    if (stored && stored.length > 0) {
      const filtered = stored.filter((p: any) => !isDel(p));
      if (filtered.length > 0) return filtered;
    }
    return defaultDefaults.filter((p: any) => !isDel(p));
  } catch (_) {}
  return defaultDefaults;
}

// The project dropdown's contents — SPLIT OUT of ProjectPickerScreen so it is
// only "alive" while the dropdown is open: every time it mounts (the dropdown
// opens) it RE-READS localStorage from scratch, rather than inheriting patched
// parent state. That decouples "writing the data" (attachFolder, which has
// always been correct — proven by reloading) from "displaying the data":
// rendering here never depends on whether an earlier state patch managed to
// commit and paint while the window lost or regained OS focus (the native
// folder dialog). It always starts fresh, exactly like a manual reload, with
// no actual reload and without resetting any other screen.
function ProjectDropdownMenu({
  currentProject,
  onSelectProject,
  onNewProject,
}: any) {
  const [projectsList] = useState(() => getPickerProjectsList());
  return (
    <div className="picker-ws-dropdown">
      <button className="picker-ws-item" onClick={onNewProject}>
        <PickerFolderIcon /> New Project
      </button>
      {projectsList.length > 0 && <div className="picker-ws-divider" />}
      <div className="picker-ws-scroll-area">
        {projectsList.map((p: any, idx: number) => (
          <button
            key={idx}
            className={
              "picker-ws-item" + (currentProject === p.name ? " active" : "")
            }
            onClick={() => onSelectProject(p.name)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontWeight: 600,
                color: "#f8fafc",
              }}
            >
              <PickerFolderIcon />
              <span>{p.name}</span>
            </span>
            {p.path && (
              <span
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  opacity: 0.85,
                  whiteSpace: "nowrap",
                }}
              >
                {p.path}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProjectPickerScreen({
  onStart,
  models = [],
  modelVal,
  setModelVal,
}: any) {
  // NOTE: the project list is deliberately NO LONGER held as state here.
  // ProjectDropdownMenu reads localStorage itself, fresh, each time it mounts
  // (when the dropdown opens). That breaks the dependency on a state patch
  // which can fail to paint when the window loses or regains OS focus (a
  // native dialog).
  const [project, setProject] = useState(() => {
    const list = getPickerProjectsList();
    return list.length > 0 ? list[0].name : "project";
  });
  React.useEffect(() => {
    const reloadProjects = () => {
      const list = getPickerProjectsList();
      setProject((cur: any) => {
        if (list.some((p: any) => p.name === cur)) return cur;
        return list.length > 0 ? list[0].name : "";
      });
    };
    window.addEventListener("wolfspace_workspaces_changed", reloadProjects);
    return () =>
      window.removeEventListener(
        "wolfspace_workspaces_changed",
        reloadProjects,
      );
  }, []);
  // Disk reconciliation: drop "ghosts" from wolfspace_projects_list — projects
  // whose FOLDER is gone from disk, WHEREVER it lived (not only under the ww
  // root). Each path's existence is verified against the backend (/ww/verify);
  // only those confirmed ABSENT are dropped (deliberately conservative).
  // Cleaning localStorage permanently leaves both picker and sidebar clean.
  React.useEffect(() => {
    (async () => {
      let stored: any;
      try {
        stored = JSON.parse(
          localStorage.getItem("wolfspace_projects_list") || "[]",
        );
      } catch {
        return;
      }
      if (!Array.isArray(stored) || !stored.length) return;
      const paths = stored.map((p: any) => p && p.path).filter(Boolean);
      if (!paths.length) return;
      const res = await wwApi("/ww/verify", {
        method: "POST",
        body: { paths },
      });
      if (!res || !res.exists) return; // gagal cek → jangan buang apa-apa
      const gone = new Set(
        Object.entries(res.exists)
          .filter(([, ok]) => ok === false)
          .map(([p]) => p),
      );
      if (!gone.size) return;
      const kept = stored.filter(
        (p: any) => !(p && p.path && gone.has(p.path)),
      );
      if (kept.length !== stored.length) {
        localStorage.setItem("wolfspace_projects_list", JSON.stringify(kept));
        window.dispatchEvent(new Event("wolfspace_workspaces_changed"));
      }
    })();
  }, []);
  const [dropOpen, setDropOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<any[]>([]);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showMcpMenu, setShowMcpMenu] = useState(false);
  const [pickerEffort, setPickerEffort] = useState(() => {
    try {
      return readEffort(getCloud());
    } catch {
      return 1;
    }
  });
  const [pickerMcp, setPickerMcp] = useState<any[]>([]);

  // One loader: used on mount AND when another screen broadcasts an MCP change.
  const loadPickerMcp = React.useCallback(async () => {
    if (!window.WOLFSPACE) return;
    try {
      // Same as Components.tsx: `active` used to be hardcoded true, so the
      // badge always read "Connected" even when the process had not started or
      // every call failed (a revoked token, say). Runtime status now comes from
      // /mcp/status.
      const [resCfg, resSt] = await Promise.all([
        window.WOLFSPACE.invoke("api", { method: "GET", path: "/mcp" }),
        window.WOLFSPACE.invoke("api", { method: "GET", path: "/mcp/status" }),
      ]);
      const parse = (r: any) => {
        if (!r || !r.body) return {};
        try {
          return typeof r.body === "string" ? JSON.parse(r.body) : r.body;
        } catch (_) {
          return {};
        }
      };
      const data = parse(resCfg);
      const st = parse(resSt);
      const arr = Object.entries<any>(data || {}).map(([name, conf]) => {
        const s = st[name] || {};
        return {
          id: name,
          name: name,
          desc:
            (conf.command || "") + " " + (conf.args ? conf.args.join(" ") : ""),
          // If the server is disabled in the backend, force active = false.
          // Without this, status polling overwrites the toggle's result and
          // the server appears to "come back to life" on its own.
          active: !s.disabled && !!s.ready && s.lastCallOk !== false,
          status: s,
          conf: conf,
        };
      });
      setPickerMcp(arr);
    } catch (e) {
      console.error("Error loading MCP servers", e);
    }
  }, []);

  useEffect(() => {
    loadPickerMcp();
    window.addEventListener("wolfspace_mcp_changed", loadPickerMcp);
    return () =>
      window.removeEventListener("wolfspace_mcp_changed", loadPickerMcp);
  }, [loadPickerMcp]);

  const [showPickerMcpInput, setShowPickerMcpInput] = useState(false);
  const [pickerMcpInputUrl, setPickerMcpInputUrl] = useState("");
  const [pickerMcpInputToken, setPickerMcpInputToken] = useState("");
  const [pickerMcpInputError, setPickerMcpInputError] = useState("");
  const [pickerMcpInputSuccess, setPickerMcpInputSuccess] = useState("");

  const handlePickerMcpCodeConnect = async (e: any) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const type = pickerMcpInputUrl.trim();
    const envVars = pickerMcpInputToken.trim();

    if (!type) {
      setPickerMcpInputError("MCP type is required.");
      return;
    }

    setPickerMcpInputError("");
    setPickerMcpInputSuccess("");

    // Single source: see mcpResolvePerintah() in app/Config.tsx. This was
    // duplicated here once, and the two copies drifted apart.
    const _r = mcpResolvePerintah(type);
    let command = _r.command;
    let args = _r.args;
    // Still used below to map per-service env vars.
    const cleanType = String(type || "").toLowerCase();

    let name = type!
      .split("/")
      .pop()!
      .replace("server-", "")
      .replace(/[^a-zA-Z0-9-]/g, "");

    let env = {};
    if (envVars) {
      try {
        env = JSON.parse(envVars);
      } catch (err) {
        if (cleanType.includes("github"))
          env = { GITHUB_PERSONAL_ACCESS_TOKEN: envVars };
        else if (cleanType.includes("brave")) env = { BRAVE_API_KEY: envVars };
        else if (cleanType.includes("postgres"))
          env = { POSTGRES_URL: envVars };
        else if (cleanType.includes("slack"))
          env = { SLACK_BOT_TOKEN: envVars };
        else if (cleanType.includes("notion")) env = { NOTION_TOKEN: envVars };
        else if (cleanType === "figma") {
          // figma-developer-mcp takes its token via the --figma-api-key arg
          // rather than env, and needs --stdio.
          args = [
            "-y",
            "figma-developer-mcp",
            "--stdio",
            `--figma-api-key=${envVars}`,
          ];
        } else env = { TOKEN: envVars };
      }
    }

    const conf = { command, args, env };

    if (window.WOLFSPACE) {
      try {
        const res = await window.WOLFSPACE.invoke("api", {
          method: "POST",
          path: "/mcp",
          body: { name, conf },
        });
        const out = res.body
          ? typeof res.body === "string"
            ? JSON.parse(res.body)
            : res.body
          : {};
        if (!out.ok) {
          setPickerMcpInputError(out.error || "Failed to add the MCP server.");
          return;
        }
      } catch (err) {
        setPickerMcpInputError((err as any).message);
        return;
      }
    }

    const entry = {
      id: name,
      name: name,
      desc: (conf.command || "") + " " + (conf.args ? conf.args.join(" ") : ""),
      active: true,
      conf,
    };

    setPickerMcp((prev: any) => [
      ...prev.filter((p: any) => p.id !== name),
      entry,
    ]);
    // An optimistic entry (see the note in Components.tsx): refresh from runtime
    // status so a failed server does not keep showing "Connected".
    setTimeout(() => loadPickerMcp(), 2500);
    setPickerMcpInputSuccess("✓ MCP server added.");
    setPickerMcpInputUrl("");
    setPickerMcpInputToken("");
    setTimeout(() => {
      setPickerMcpInputSuccess("");
      setShowPickerMcpInput(false);
    }, 2000);
  };

  useEffect(() => {
    try {
      localStorage.setItem("wolfspace_effort", String(pickerEffort));
      const cl = getCloud();
      if (cl) {
        cl.effort = pickerEffort;
        setCloudLS(cl);
      }
    } catch (_) {}
  }, [pickerEffort]);
  const wrapRef = useRef<any>(null);
  const taRef = useRef<any>(null);
  // A STATUS-BASED anti-close guard, not a duration guess — that proved
  // fragile, with closes happening >500ms after attachFolder finished. It stays
  // active throughout: native dialog opens -> attach completes -> the dropdown
  // reopen renders. Root cause CONFIRMED by trace: the dropdown reopened
  // (dropOpen=true, the new item present in the list) but was closed again by a
  // mousedown on DIV.project-picker-screen — NOT on any specific item — a
  // "leftover" event as window focus returned from the OS dialog.
  const nativeDialogActiveRef = useRef(false);
  useEffect(() => {
    const h = (e: any) => {
      const outside = wrapRef.current && !wrapRef.current.contains(e.target);
      if (!outside) return;
      if (nativeDialogActiveRef.current) {
        return;
      }
      setDropOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  // The limit is READ from CSS rather than restated here — one source of truth,
  // the same as the composer in Components.tsx.
  const grow = React.useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    // "auto" first: without it scrollHeight never SHRINKS when text is
    // deleted, so the box grows once and then refuses to come back down.
    el.style.height = "auto";
    const maks = parseFloat(getComputedStyle(el).maxHeight);
    el.style.height =
      (Number.isFinite(maks)
        ? Math.min(el.scrollHeight, maks)
        : el.scrollHeight) + "px";
  }, []);
  // onChange alone is not enough: pasted or externally set text never passes
  // through it, and resizing the window changes line wrapping without a single
  // keystroke.
  React.useEffect(() => {
    grow();
  }, [text, grow]);
  React.useEffect(() => {
    const el = taRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // Only the WIDTH triggers a recompute — grow() changes the HEIGHT of the
    // very element being observed, so reacting to height would mean watching
    // its own effect, and that spins without end.
    let lebarTerakhir = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === lebarTerakhir) return;
      lebarTerakhir = el.clientWidth;
      grow();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [grow]);
  const handleAttachmentSelect = async (e: any) => {
    const files = Array.from<any>(e.target.files || []);
    if (!files.length) return;
    const target = e.target;
    for (const file of files) {
      const relPath = file.webkitRelativePath || file.name;
      const attId = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      const isImg =
        /\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i.test(file.name) ||
        (file.type && file.type.startsWith("image/"));
      const isVid =
        /\.(mp4|webm|mov|mkv)$/i.test(file.name) ||
        (file.type && file.type.startsWith("video/"));
      const is3D = is3DFile(file.name);
      // A 3D file needs a blob URL for Model3DViewer to load it (three.js
      // loaders take a URL, not a File). Same as img/vid — a local object URL.
      let previewUrl =
        isImg || isVid || is3D ? URL.createObjectURL(file) : null;
      let snippet: any = null;
      if (
        !isImg &&
        !isVid &&
        file.size < 100 * 1024 &&
        /\.(js|py|jsx|ts|tsx|html|css|json|md|txt|sql|java|c|cpp|h|rust|go|sh|yml|yaml)$/i.test(
          file.name,
        )
      ) {
        try {
          snippet = await file.slice(0, 300).text();
        } catch (_) {}
      }
      setAttachments((prev: any) => [
        ...prev,
        {
          id: attId,
          name: file.name,
          path: relPath,
          size: file.size,
          type: file.type,
          previewUrl,
          snippet,
          status: "uploading",
        },
      ]);
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 =
              String(reader.result || "").split(",")[1] || reader.result;
            // A BRIDGE, not an upload — the full reasoning is in Components.tsx.
            // The SECOND surface: the attach logic is duplicated across these
            // two files, and a fix that touches only one makes the app's
            // behaviour depend on which screen you happen to be using. That is
            // exactly what happened to the MCP list before.
            const payload = {
              name: file.name,
              data: base64,
              type: file.type || null,
            };
            let attHandle = "";
            if (window.IPC && window.IPC.invoke) {
              const res = await window.IPC.invoke("api", {
                method: "POST",
                path: "/attach",
                body: payload,
              });
              let parsed: any;
              try {
                parsed =
                  typeof res.body === "string" ? JSON.parse(res.body) : res;
              } catch (_) {
                parsed = res;
              }
              if (res.status >= 400 || !parsed.ok)
                throw new Error(parsed.error || "Attach failed");
              attHandle = parsed.id;
            } else {
              const r = await fetch("/attach", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              const res = await r.json();
              if (!res.ok) throw new Error(res.error || "Attach failed");
              attHandle = res.id;
            }
            setAttachments((prev: any) =>
              prev.map((a: any) =>
                a.id === attId
                  ? {
                      ...a,
                      status: "ready",
                      attId: attHandle,
                    }
                  : a,
              ),
            );
          } catch (err) {
            console.error("[Attachment upload error]", err);
            setAttachments((prev: any) =>
              prev.map((a: any) =>
                a.id === attId
                  ? { ...a, status: "error", error: (err as any).message }
                  : a,
              ),
            );
          }
        };
        reader.onerror = () => {
          setAttachments((prev: any) =>
            prev.map((a: any) =>
              a.id === attId
                ? { ...a, status: "error", error: "Failed reading file" }
                : a,
            ),
          );
        };
        reader.readAsDataURL(file);
      } catch (err) {
        setAttachments((prev: any) =>
          prev.map((a: any) =>
            a.id === attId
              ? { ...a, status: "error", error: (err as any).message }
              : a,
          ),
        );
      }
    }
    target.value = "";
  };
  const onRemoveAttachment = (id: any) =>
    setAttachments((prev: any) => prev.filter((a: any) => a.id !== id));
  const submit = () => {
    const v = text.trim();
    if (!v && attachments.length === 0) return;
    let fullText = v;
    if (attachments.length > 0) {
      // A HANDLE, not a path — the full reasoning is in Components.tsx. The
      // shape must be IDENTICAL on both surfaces; if it differs, the agent gets
      // a different attachment format depending on which screen was used.
      const attSummary = attachments
        .map(
          (a: any) =>
            `- [Terlampir] ${a.name} (${Math.round(a.size / 1024)} KB${a.type ? `, ${a.type}` : ""})` +
            (a.attId ? ` — id: ${a.attId}` : " — handoff FAILED"),
        )
        .join("\n");
      fullText = v
        ? `${v}\n\nAttachments:\n${attSummary}`
        : `Attachments:\n${attSummary}`;
    }
    // Read fresh rather than from state — the correct path needs the LATEST
    // value, not a copy that may not have been patched yet for the same render
    // reason.
    const selectedObj = getPickerProjectsList().find(
      (p: any) => p.name === project,
    );
    const chosenPath = selectedObj
      ? selectedObj.path
      : project.includes(":") || project.includes("/") || project.includes("\\")
        ? project
        : `c:\\Users\\dave\\${project}`;
    // The THIRD argument separates what the user sees from what is sent to the
    // model — the same as Composer. Without it, the attachment lines and their
    // att_… handles land raw in the first chat bubble.
    onStart(fullText, chosenPath, {
      text: v,
      attachments: attachments.map((a: any) => ({
        name: a.name,
        size: a.size,
        type: a.type,
        previewUrl: a.previewUrl,
        ok: !!a.attId,
      })),
    });
  };
  // Attaching a folder to WOLFSPACE gives it a worktree and branch bound to its
  // original address (via /ww/attach). Idempotent and non-destructive, stored
  // with the correct path. The anti-double guard stops two attach calls for the
  // same path arriving almost together (a double-fire from the native dialog or
  // an event) — not dangerous, since the backend is idempotent, but there is no
  // reason to make two calls for one user action.
  const attachInFlightRef = useRef(new Set());
  const attachFolder = async (folderPath: any, folderName?: any) => {
    const key = folderPath.toLowerCase();
    if (attachInFlightRef.current.has(key)) {
      return;
    }
    attachInFlightRef.current.add(key);
    let att: any;
    try {
      att = await wwApi("/ww/attach", {
        method: "POST",
        body: { path: folderPath },
      });
    } finally {
      attachInFlightRef.current.delete(key);
    }
    const finalPath = (att && att.path) || folderPath;
    const finalName = (att && att.name) || folderName;
    // Write DIRECTLY to localStorage (the source of truth), bypassing React
    // state. ProjectDropdownMenu reads this FRESH as soon as it mounts (see
    // setDropOpen below), so the "write first, then render" order is guaranteed
    // by JS execution order itself rather than by React's fragile commit/paint
    // timing.
    const rest = getPickerProjectsList().filter(
      (p: any) => (p.path || "") !== finalPath,
    );
    const updated = [
      { name: finalName, path: finalPath, branch: att && att.branch },
      ...rest,
    ];
    localStorage.setItem("wolfspace_projects_list", JSON.stringify(updated));
    // Re-attaching a folder REMOVES it from the delete list. Without this, a
    // folder once deleted and then added again stays filtered out by isDel.
    try {
      const del = JSON.parse(
        localStorage.getItem("wolfspace_deleted_workspaces") || "[]",
      );
      const pruned = del.filter(
        (d: any) => normDelPath(d) !== normDelPath(finalPath),
      );
      if (pruned.length !== del.length) {
        localStorage.setItem(
          "wolfspace_deleted_workspaces",
          JSON.stringify(pruned),
        );
      }
    } catch (_) {}
    setProject(finalName);
    window.dispatchEvent(new Event("wolfspace_workspaces_changed"));
    // The dropdown has been closed since the native dialog opened
    // (handleOpenFolderPicker). Setting true here BUILDS ProjectDropdownMenu
    // FROM SCRATCH (a fresh mount, not a patch of the old instance) — it reads
    // the localStorage just written above, so the new folder appears IMMEDIATELY
    // without depending on whether the previous render managed to paint while
    // the window had lost OS focus.
    setDropOpen(true);
    // Release the guard SHORTLY after the render (2 frames) rather than at once,
    // so a "leftover" mousedown arriving exactly as this dropdown renders is
    // still suppressed.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        nativeDialogActiveRef.current = false;
      }),
    );
  };
  const handleOpenFolderPicker = async () => {
    setDropOpen(false);
    nativeDialogActiveRef.current = true; // active from BEFORE the dialog opens
    try {
      // Electron: a native dialog -> the REAL absolute path (a folder on C:, D:,
      // the Desktop, anywhere).
      if (IPC && IPC.invoke) {
        const r = await IPC.invoke("selectFolder");
        if (!r || r.canceled || !r.path) {
          nativeDialogActiveRef.current = false;
          return;
        }
        const name = r.path
          .replace(/[\\/]+$/, "")
          .split(/[\\/]/)
          .pop();
        await attachFolder(r.path, name);
        return;
      }
      nativeDialogActiveRef.current = false;
      // Browser: the File System Access API (the path is not real — guessed
      // under home).
      if (window.showDirectoryPicker) {
        const dirHandle = await window.showDirectoryPicker();
        if (dirHandle && dirHandle.name) {
          await attachFolder(
            `c:\\Users\\dave\\${dirHandle.name}`,
            dirHandle.name,
          );
          return;
        }
      }
    } catch (err) {
      nativeDialogActiveRef.current = false; // do not stay stuck on an error
      if (err && (err as any).name === "AbortError") return;
      console.error("[FolderPicker]", err);
    }
    document.getElementById("picker-workspace-folder-input")?.click();
  };
  const handleWorkspaceFolderSelect = (e: any) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    let folderName = "New Project";
    let folderPath = "";
    const first: any = files[0];
    const relPath = first.webkitRelativePath || first.name || "";
    if (relPath.includes("/")) {
      folderName = relPath.split("/")[0];
    } else if (first.path) {
      const parts = first.path.replace(/\\/g, "/").split("/");
      const idx = parts.indexOf(relPath);
      if (idx > 0) {
        folderName = parts[idx - 1];
        folderPath = parts.slice(0, idx).join("\\");
      } else if (parts.length > 1) {
        folderName = parts[parts.length - 2];
        folderPath = parts.slice(0, parts.length - 1).join("\\");
      } else {
        folderName = relPath;
      }
    } else {
      folderName = relPath;
    }
    if (!folderPath) folderPath = `c:\\Users\\dave\\${folderName}`;
    e.target.value = "";
    attachFolder(folderPath, folderName); // attaching = isolation bound to the path
  };
  return (
    <div
      className="project-picker-screen"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
      }}
    >
      <input
        type="file"
        id="picker-file-upload"
        multiple
        style={{ display: "none" }}
        onChange={handleAttachmentSelect}
      />
      <input
        type="file"
        id="picker-folder-upload"
        webkitdirectory="true"
        directory="true"
        multiple
        style={{ display: "none" }}
        onChange={handleAttachmentSelect}
      />
      <input
        type="file"
        id="picker-workspace-folder-input"
        webkitdirectory="true"
        directory="true"
        multiple
        style={{ display: "none" }}
        onChange={handleWorkspaceFolderSelect}
      />
      <div className="project-picker-inner">
        <div className="picker-brand-mark">
          <Icon.wolf />
          <span className="picker-brand-name">WOLFSPACE</span>
        </div>
        <div className="picker-input-box" style={{ position: "relative" }}>
          {menu && (
            <div
              className="am-menu"
              style={{
                position: "absolute",
                bottom: "calc(100% + 8px)",
                left: 0,
                right: 0,
                zIndex: 200,
              }}
              onMouseDown={(e: any) => e.stopPropagation()}
            >
              <div className="am-section-label">Context</div>
              <button
                className="am-item"
                onClick={() => {
                  setMenu(false);
                  document.getElementById("picker-file-upload")?.click();
                }}
              >
                <span>Attach file...</span>
              </button>

              <div className="am-section-label" style={{ marginTop: "8px" }}>
                Model
              </div>
              <div style={{ position: "relative" }}>
                <button
                  className={"am-item" + (showModelMenu ? " active" : "")}
                  onClick={(e: any) => {
                    e.stopPropagation();
                    setShowMcpMenu(false);
                    setShowModelMenu(!showModelMenu);
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    Switch model...
                  </span>
                  <span className="am-item-right">
                    {/* Not "Sonnet". A model name hard-coded on the fallback
                        path shows up even when nothing is configured at all,
                        and that reads as an app already set up when it is
                        not. */}
                    {models.find((m: any) => m.value === modelVal)?.label ||
                      "No model"}
                  </span>
                </button>
                {showModelMenu && (
                  <div className="am-submenu">
                    <div
                      className="am-section-label"
                      style={{ marginBottom: "4px" }}
                    >
                      Select a model
                    </div>
                    {models
                      .filter((m: any) => !m.disabled)
                      .map((m: any) => (
                        <button
                          key={m.value}
                          className="am-item"
                          style={{ padding: "8px 12px" }}
                          onClick={(e: any) => {
                            e.stopPropagation();
                            if (setModelVal) setModelVal(m.value);
                            setShowModelMenu(false);
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "4px",
                              width: "100%",
                            }}
                          >
                            <span
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                              }}
                            >
                              {m.label} {m.value === modelVal && <span>✓</span>}
                            </span>
                            <span className="am-item-desc">
                              Efficient for routine tasks
                            </span>
                          </div>
                        </button>
                      ))}
                    {!models.some((m: any) => !m.disabled) && (
                      <div
                        className="am-item-desc"
                        style={{ padding: "8px 12px" }}
                      >
                        No model configured yet — add an API key in Settings.
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                className="am-item"
                onClick={(e: any) => {
                  e.stopPropagation();
                  setPickerEffort((pickerEffort + 1) % 3);
                }}
              >
                <span>
                  Effort (
                  {pickerEffort === 0
                    ? "Low"
                    : pickerEffort === 1
                      ? "Medium"
                      : "High"}
                  )
                </span>
                <span className="am-item-right">
                  <div className="am-slider">
                    <div
                      className={
                        "am-slider-dot" + (pickerEffort >= 0 ? " active" : "")
                      }
                    ></div>
                    <div
                      className={
                        "am-slider-dot" + (pickerEffort >= 1 ? " active" : "")
                      }
                    ></div>
                    <div
                      className={
                        "am-slider-dot" + (pickerEffort >= 2 ? " active" : "")
                      }
                    ></div>
                  </div>
                </span>
              </button>

              <div className="am-section-label" style={{ marginTop: "8px" }}>
                Connection
              </div>
              <div style={{ position: "relative" }}>
                <button
                  className={"am-item" + (showMcpMenu ? " active" : "")}
                  onClick={(e: any) => {
                    e.stopPropagation();
                    setShowModelMenu(false);
                    setShowMcpMenu(!showMcpMenu);
                    // Use the SINGLE loader (see the note in Components.tsx):
                    // an inline copy used to map `active: true` and overwrite
                    // the correct runtime status every time the menu opened.
                    if (!showMcpMenu) loadPickerMcp();
                  }}
                >
                  <span>MCP</span>
                  <span className="am-item-right">
                    <span>Manage servers</span>
                    <span style={{ fontSize: "10px" }}>▶</span>
                  </span>
                </button>
                {showMcpMenu && (
                  <div className="am-submenu">
                    <div
                      className="am-section-label"
                      style={{ marginBottom: "4px" }}
                    >
                      Select an MCP connection
                    </div>
                    {pickerMcp.map((srv: any) => (
                      <div
                        key={srv.id}
                        style={{
                          position: "relative",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <button
                          className="am-item"
                          style={{ padding: "8px 12px", flex: 1 }}
                          onClick={async (e: any) => {
                            e.stopPropagation();
                            // The SECOND MCP list. The first is in Composer
                            // (Components.tsx) and already separates CONNECT
                            // from toggle; this one was missed by that change.
                            //
                            // Proven from a real run log: clicking on this
                            // screen produced `POST /mcp/toggle` rather than
                            // `POST /mcp/connect` — so merely connecting a
                            // server also wrote `disabled` into mcp.json.
                            // The logic must be THE SAME in both places, or the
                            // app's behaviour depends on which screen you
                            // happen to be using.
                            const perluConnect =
                              !srv.active &&
                              !(srv.status && srv.status.disabled);
                            const jalur = perluConnect
                              ? "/mcp/connect"
                              : "/mcp/toggle";
                            const muatan = perluConnect
                              ? { name: srv.id }
                              : { name: srv.id, enabled: !srv.active };
                            setPickerMcp((prev: any) =>
                              prev.map((item: any) =>
                                item.id === srv.id
                                  ? {
                                      ...item,
                                      active: !srv.active,
                                      connecting: perluConnect,
                                    }
                                  : item,
                              ),
                            );
                            try {
                              if (window.WOLFSPACE && window.WOLFSPACE.invoke) {
                                await window.WOLFSPACE.invoke("api", {
                                  method: "POST",
                                  path: jalur,
                                  body: muatan,
                                });
                              } else {
                                await fetch(jalur, {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify(muatan),
                                });
                              }
                            } catch (err) {
                              console.error("Error toggling MCP server", err);
                            } finally {
                              // In finally, not only on success: on failure the
                              // "⟳ Connecting…" badge would stick forever
                              // because nothing refreshes it from runtime status.
                              window.dispatchEvent(
                                new CustomEvent("wolfspace_mcp_changed"),
                              );
                            }
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "4px",
                              width: "100%",
                            }}
                          >
                            <span
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <span style={{ fontWeight: 500, color: "#fff" }}>
                                {srv.name}
                              </span>
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                {srv.connecting ? (
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: 500,
                                      padding: "2px 6px",
                                      borderRadius: "10px",
                                      color: "#d7ba7d",
                                      background: "rgba(215, 186, 125, 0.12)",
                                    }}
                                  >
                                    ⟳ Connecting…
                                  </span>
                                ) : srv.active ? (
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: 500,
                                      padding: "2px 6px",
                                      borderRadius: "10px",
                                      color: "#4ec9b0",
                                      background: "rgba(78, 201, 176, 0.12)",
                                    }}
                                  >
                                    ✓ Connected
                                  </span>
                                ) : (
                                  // Distinguish the cause (see the note in
                                  // Components.tsx): "failed" is not "not started".
                                  <span
                                    title={
                                      (srv.status && srv.status.lastError) ||
                                      (srv.status && !srv.status.running
                                        ? "MCP process is not running"
                                        : "Not ready")
                                    }
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: 500,
                                      padding: "2px 6px",
                                      borderRadius: "10px",
                                      color:
                                        srv.status &&
                                        srv.status.lastCallOk === false
                                          ? "#f85149"
                                          : "#858585",
                                      background:
                                        srv.status &&
                                        srv.status.lastCallOk === false
                                          ? "rgba(248, 81, 73, 0.12)"
                                          : "rgba(133, 133, 133, 0.12)",
                                    }}
                                  >
                                    {srv.status &&
                                    srv.status.lastCallOk === false
                                      ? "✕ Failed"
                                      : srv.status && !srv.status.running
                                        ? "○ Berhenti"
                                        : "○ Not ready"}
                                  </span>
                                )}
                                <span
                                  title="Remove MCP server"
                                  style={{
                                    cursor: "pointer",
                                    padding: "2px 4px",
                                    borderRadius: "4px",
                                    color: "#858585",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                  onClick={(e: any) => {
                                    e.stopPropagation();
                                    // TWO components hold the MCP list with
                                    // separate state (pickerMcp here,
                                    // mcpServers in Components.tsx). Without a
                                    // broadcast, a delete on one screen stays
                                    // invisible on the other until it reloads.
                                    // Broadcast so both stay in sync.
                                    const _bcast = () => {
                                      try {
                                        window.dispatchEvent(
                                          new CustomEvent(
                                            "wolfspace_mcp_changed",
                                          ),
                                        );
                                      } catch (_) {}
                                    };
                                    if (window.WOLFSPACE) {
                                      window.WOLFSPACE.invoke("api", {
                                        method: "DELETE",
                                        path: "/mcp",
                                        body: { name: srv.id },
                                      })
                                        .then(() => {
                                          setPickerMcp((prev: any) =>
                                            prev.filter(
                                              (item: any) => item.id !== srv.id,
                                            ),
                                          );
                                          _bcast();
                                        })
                                        .catch((err: any) =>
                                          alert(
                                            "Failed to remove MCP: " +
                                              (err as any).message,
                                          ),
                                        );
                                    } else {
                                      setPickerMcp((prev: any) =>
                                        prev.filter(
                                          (item: any) => item.id !== srv.id,
                                        ),
                                      );
                                      _bcast();
                                    }
                                  }}
                                  onMouseEnter={(e: any) => {
                                    e.currentTarget.style.color = "#f85149";
                                    e.currentTarget.style.background =
                                      "rgba(248,81,73,0.15)";
                                  }}
                                  onMouseLeave={(e: any) => {
                                    e.currentTarget.style.color = "#858585";
                                    e.currentTarget.style.background =
                                      "transparent";
                                  }}
                                >
                                  ×
                                </span>
                              </span>
                            </span>
                            <span className="am-item-desc">{srv.desc}</span>
                          </div>
                        </button>
                      </div>
                    ))}
                    <div
                      style={{
                        borderTop: "1px solid #3e3e42",
                        marginTop: "4px",
                      }}
                    >
                      {!showPickerMcpInput ? (
                        <div
                          style={{
                            padding: "8px 12px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                          onClick={(e: any) => {
                            e.stopPropagation();
                            setShowPickerMcpInput(true);
                            setPickerMcpInputError("");
                            setPickerMcpInputSuccess("");
                          }}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#b594f5"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                          </svg>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "#b594f5",
                              fontWeight: 500,
                            }}
                          >
                            Hubungkan MCP server...
                          </span>
                        </div>
                      ) : (
                        <div
                          style={{
                            padding: "10px 12px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "7px",
                          }}
                          onClick={(e: any) => e.stopPropagation()}
                        >
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#8b98a9",
                              fontWeight: 600,
                              marginBottom: "2px",
                            }}
                          >
                            Sambungkan ke MCP Server
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "5px",
                            }}
                          >
                            <input
                              autoFocus
                              type="text"
                              value={pickerMcpInputUrl}
                              onChange={(e: any) => {
                                setPickerMcpInputUrl(e.target.value);
                                setPickerMcpInputError("");
                                setPickerMcpInputSuccess("");
                              }}
                              onKeyDown={(e: any) => {
                                if (e.key === "Escape") {
                                  setShowPickerMcpInput(false);
                                  setPickerMcpInputUrl("");
                                  setPickerMcpInputToken("");
                                  setPickerMcpInputError("");
                                }
                              }}
                              placeholder="MCP type (e.g. github, brave-search, sqlite)"
                              style={{
                                width: "100%",
                                background: "rgba(255,255,255,0.04)",
                                border:
                                  pickerMcpInputError &&
                                  !pickerMcpInputUrl.trim()
                                    ? "1px solid rgba(248,81,73,0.5)"
                                    : "1px solid rgba(255,255,255,0.1)",
                                borderRadius: "6px",
                                color: "#e2e8f0",
                                fontSize: "11px",
                                fontFamily: "inherit",
                                padding: "6px 9px",
                                outline: "none",
                                boxSizing: "border-box",
                              }}
                            />
                            <input
                              type="password"
                              value={pickerMcpInputToken}
                              onChange={(e: any) => {
                                setPickerMcpInputToken(e.target.value);
                                setPickerMcpInputError("");
                                setPickerMcpInputSuccess("");
                              }}
                              onKeyDown={(e: any) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handlePickerMcpCodeConnect(e);
                                }
                                if (e.key === "Escape") {
                                  setShowPickerMcpInput(false);
                                  setPickerMcpInputUrl("");
                                  setPickerMcpInputToken("");
                                  setPickerMcpInputError("");
                                }
                              }}
                              placeholder="API Key / Konfigurasi (JSON opsional)"
                              style={{
                                width: "100%",
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: "6px",
                                color: "#e2e8f0",
                                fontSize: "11px",
                                fontFamily: "inherit",
                                padding: "6px 9px",
                                outline: "none",
                                boxSizing: "border-box",
                              }}
                            />
                          </div>
                          {pickerMcpInputError && (
                            <div
                              style={{
                                fontSize: "10.5px",
                                color: "#f85149",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <svg
                                width="11"
                                height="11"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                              {pickerMcpInputError}
                            </div>
                          )}
                          {pickerMcpInputSuccess && (
                            <div
                              style={{
                                fontSize: "10.5px",
                                color: "#4ec9b0",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <svg
                                width="11"
                                height="11"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              {pickerMcpInputSuccess}
                            </div>
                          )}
                          <div
                            style={{
                              display: "flex",
                              gap: "6px",
                              justifyContent: "flex-end",
                            }}
                          >
                            <button
                              onClick={(e: any) => {
                                e.stopPropagation();
                                setShowPickerMcpInput(false);
                                setPickerMcpInputUrl("");
                                setPickerMcpInputToken("");
                                setPickerMcpInputError("");
                                setPickerMcpInputSuccess("");
                              }}
                              style={{
                                padding: "4px 10px",
                                fontSize: "11px",
                                borderRadius: "5px",
                                border: "1px solid rgba(255,255,255,0.1)",
                                background: "transparent",
                                color: "#8b98a9",
                                cursor: "pointer",
                                fontFamily: "inherit",
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handlePickerMcpCodeConnect}
                              style={{
                                padding: "4px 12px",
                                fontSize: "11px",
                                borderRadius: "5px",
                                border: "none",
                                background:
                                  "linear-gradient(135deg, #7c3aed, #6d28d9)",
                                color: "#fff",
                                cursor: "pointer",
                                fontFamily: "inherit",
                                fontWeight: 600,
                              }}
                            >
                              Hubungkan
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="picker-input-area">
            {attachments.length > 0 && (
              <div
                className="composer-attachments"
                style={{ paddingBottom: "10px" }}
              >
                {attachments.map((a: any) => (
                  <div key={a.id} className="composer-attachment-item">
                    {a.previewUrl ? (
                      <img
                        src={a.previewUrl}
                        className="composer-attachment-icon"
                        alt=""
                      />
                    ) : (
                      <div className="composer-attachment-icon">
                        {a.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div
                      className="composer-attachment-name"
                      style={{
                        fontSize: "9px",
                        width: "100%",
                        textAlign: "center",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.name}
                    </div>
                    <button
                      className="composer-attachment-remove"
                      onClick={() => onRemoveAttachment(a.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={taRef}
              className="picker-textarea"
              rows={1}
              placeholder="What would you like to build today?"
              value={text}
              onChange={(e: any) => {
                setText(e.target.value);
                grow();
              }}
              onKeyDown={(e: any) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div className="picker-toolbar">
              <button
                className={"picker-plus-btn" + (menu ? " open" : "")}
                onClick={() => setMenu((m: any) => !m)}
              >
                <PickerPlusIcon />
              </button>
              <button
                className="picker-send-btn"
                onClick={submit}
                disabled={!text.trim() && attachments.length === 0}
              >
                <PickerSendIcon />
              </button>
            </div>
          </div>
          <div className="picker-divider" />
          <div className="picker-bottom-row">
            <div className="picker-ws-wrap" ref={wrapRef}>
              <button
                className="picker-workspace-btn"
                onClick={() => setDropOpen((o: any) => !o)}
              >
                {project === "Quick Start" ? (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <polyline points="15 3 21 3 21 9" />
                    <path d="M10 14L21 3" />
                    <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                  </svg>
                ) : (
                  <PickerFolderIcon />
                )}
                <span>{project}</span>
                <PickerChevIcon />
              </button>
              {dropOpen && (
                <ProjectDropdownMenu
                  currentProject={project}
                  onNewProject={handleOpenFolderPicker}
                  onSelectProject={(name: any) => {
                    setProject(name);
                    setDropOpen(false);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- VS Code Style Terminal ----------------------------- */
// -- Terminals outlive the panel --
//
// Held at MODULE scope, not in a ref. Closing the terminal panel unmounts
// VSCodeTerminal, and anything in a ref dies with it -- which killed every PTY
// and disposed every xterm, so reopening the panel gave a blank shell in the
// wrong directory with the history gone. VS Code keeps its terminals running
// when the panel is hidden, and so does this now.
//
// The same pattern the editor already uses for Monaco models (_modelBerkas in
// app.tsx), and for the same reason: the buffer must outlive the view.
//
// On remount the existing DOM nodes are MOVED into the new host rather than
// recreated. An xterm instance cannot be reopened into a different element
// without losing its screen, but its element can simply be appended somewhere
// else and the instance never notices.
const _terminalInstans = new Map<string, any>();
let _terminalUrut = 0;
let _terminalAktif = "";
let _terminalPecah = "";

// Shells offered by the "+" dropdown.
//
// NOT probed for availability first. /api/terminal/open already takes a shell
// and already reports what it could not spawn, and that error arrives inside
// the new terminal where it is readable. Filtering the list here would mean
// this component keeping a picture of the machine in step with the machine,
// which is a second source of truth for no gain.
const SHELL_PILIHAN = [
  { nama: "PowerShell", nilai: "powershell.exe" },
  { nama: "pwsh", nilai: "pwsh.exe" },
  { nama: "Command Prompt", nilai: "cmd.exe" },
  { nama: "Git Bash", nilai: "bash.exe" },
  { nama: "WSL", nilai: "wsl.exe" },
];

// -- INFO severity tiers --
//
// Ordered worst-first, which is the order the rail stacks them in: an error is
// what someone opens this panel to find, so it must not sit below a count of
// style hints. `kunci` matches the severity word tsc prints, so the rows filter
// without a translation table in between.
const TINGKAT_INFO = [
  { kunci: "error", ikon: "⊗", judul: "Errors", warna: "#f85149" },
  { kunci: "warning", ikon: "⚠", judul: "Warnings", warna: "#e3b341" },
  { kunci: "info", ikon: "ⓘ", judul: "Info", warna: "#58a6ff" },
];

/**
 * The workspace root, from whichever shape the caller holds it in.
 *
 * The terminal derived this inline to pick a cwd, and INFO needs the same
 * answer. Two copies of the rule is how the MCP command resolution drifted
 * between Components and Screens, so this one is written once.
 */
function akarProyek(proyek: any): string | undefined {
  if (typeof proyek === "object" && proyek !== null)
    return proyek.path || proyek.dir || undefined;
  if (typeof proyek === "string" && proyek.trim() !== "") return proyek.trim();
  return undefined;
}

function VSCodeTerminal({
  selectedProject,
  onClose,
  terminalOutput,
  messages = [],
  perintah,
  debugAktif,
  onAksiDebug,
  pemicuDebug,
  onDebugSelesai,
  dapKeadaan,
  onAksiDap,
}: any) {
  // termRef / fitRef / sessionIdRef POINT AT THE ACTIVE TERMINAL.
  //
  // They were the only terminal. Keeping them as pointers instead of replacing
  // them is what made multiple terminals a contained change: the queued-command
  // path, the debug prompt watcher, restartSession and the Run button all read
  // these and none of them had to learn that a list now exists.
  const termRef = useRef<any>(null);
  const fitRef = useRef<any>(null);
  const sessionIdRef = useRef<any>(null);
  // The instance store is at MODULE scope (_terminalInstans) so terminals
  // survive the panel being closed. Only the host element is per-mount.
  const hostRef = useRef<any>(null);
  // State is SEEDED from the store rather than from empty, so reopening the
  // panel redraws the list that is still running instead of claiming there is
  // nothing there.
  const [terminals, setTerminals] = useState<any[]>(() =>
    Array.from(_terminalInstans.values()).map((i: any) => ({
      key: i.key,
      shell: i.shell,
      nama: i.nama,
    })),
  );
  const [aktifKey, setAktifKey] = useState(_terminalAktif);
  const [pecahKey, setPecahKey] = useState(_terminalPecah);
  const [menuBaris, setMenuBaris] = useState<any>(null);
  const [geserDaftar, setGeserDaftar] = useState(false);
  // The width is mirrored in a ref because the mouseup closure is created once
  // at drag start: reading the state there would persist the width the drag
  // BEGAN with, so every resize would be forgotten.
  const lebarDaftarRef = useRef(160);
  // Width is remembered, like the other resizable panels in this app. A list
  // that snaps back to a default every time the panel reopens is the kind of
  // small rigidity that makes a UI feel like it is not listening.
  const [lebarDaftar, setLebarDaftar] = useState(() => {
    try {
      const n = Number(localStorage.getItem("wolfspace_lebar_daftar_terminal"));
      if (n >= 110 && n <= 360) return n;
    } catch (_) {}
    return 160;
  });
  const mulaiGeserDaftar = (e: any) => {
    e.preventDefault();
    setGeserDaftar(true);
    const x0 = e.clientX;
    const w0 = lebarDaftar;
    const gerak = (ev: any) => {
      // Dragging LEFT widens the list: it is pinned to the right edge, so the
      // delta is inverted.
      const w = Math.min(360, Math.max(110, w0 + (x0 - ev.clientX)));
      lebarDaftarRef.current = w;
      setLebarDaftar(w);
    };
    const lepas = () => {
      setGeserDaftar(false);
      window.removeEventListener("mousemove", gerak);
      window.removeEventListener("mouseup", lepas);
      try {
        localStorage.setItem(
          "wolfspace_lebar_daftar_terminal",
          String(lebarDaftarRef.current),
        );
      } catch (_) {}
    };
    window.addEventListener("mousemove", gerak);
    window.addEventListener("mouseup", lepas);
  };
  const [menuShell, setMenuShell] = useState(false);
  // ── Commands that arrive before the PTY is ready ──
  //
  // Pressing Run while the terminal is closed opens the terminal AND sends the
  // command in the same render. The PTY session is opened over fetch, so when
  // the command arrives sessionIdRef is still null — and without this queue the
  // command vanishes without a trace: the button looks like it worked, the
  // terminal opens, and nothing happens.
  const tertundaRef = useRef<any>(null);
  const nonceRef = useRef<any>(null);
  // ── Noticing that a debug session has ENDED ──
  //
  // Debug state used to be cleared only by the Stop button. So if the user
  // typed `.exit`/`q` straight into the terminal, or the program stopped by
  // itself, the DEBUG tab stayed lit and its buttons typed debugger command
  // words into an ORDINARY SHELL — the app reporting a state that did not
  // match reality.
  //
  // What is watched is the prompt at the end of the output: while a debugger
  // prompt is still there the session is alive; once a shell prompt appears
  // again it has finished. A debugger prompt must deliberately be seen FIRST
  // (sudahLihatRef) — without that, a shell prompt appearing moments before
  // the debugger starts would immediately read as "already finished".
  const ekorRef = useRef("");
  const sudahLihatRef = useRef(false);
  const [activeTab, setActiveTab] = useState("TERMINAL");
  // INFO panel state. `infoSaring` is "all" or one severity key; the rail
  // toggles it rather than holding a separate selection, so clicking the lit
  // tier again clears the filter instead of stranding the user in one tier.
  const [infoDiag, setInfoDiag] = useState<any[]>([]);
  const [infoSibuk, setInfoSibuk] = useState(false);
  const [infoNota, setInfoNota] = useState("");
  const [infoSaring, setInfoSaring] = useState("all");
  const [infoPernah, setInfoPernah] = useState(false);

  // Scanning is MANUAL plus once when the panel is first opened, never
  // continuous. tsc over a real project costs seconds of CPU, and a problems
  // panel that re-runs it on every keystroke becomes the reason the app
  // stutters -- the exact failure this app has been chasing elsewhere.
  async function pindaiInfo() {
    const akar = akarProyek(selectedProject);
    if (!akar) {
      setInfoDiag([]);
      setInfoNota("No workspace is selected.");
      setInfoPernah(true);
      return;
    }
    setInfoSibuk(true);
    setInfoNota("");
    try {
      const r = await fetch("/info/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root: akar }),
      });
      const d = await r.json();
      setInfoDiag(Array.isArray(d.diagnostics) ? d.diagnostics : []);
      setInfoNota(d.note || d.error || "");
    } catch (e: any) {
      setInfoDiag([]);
      setInfoNota("Scan failed: " + (e && e.message ? e.message : String(e)));
    } finally {
      setInfoSibuk(false);
      setInfoPernah(true);
    }
  }

  // An unscanned panel must not render as "no problems found" -- that is a
  // claim it has no basis for. It scans once on first open instead.
  useEffect(() => {
    if (activeTab === "INFO" && !infoPernah && !infoSibuk) pindaiInfo();
  }, [activeTab]);
  const [statusText, setStatusText] = useState("Connecting PTY...");

  // Build a clean, formatted AI output log from the main UI messages + any agent/terminal output
  const mainUiAiLog = useMemo(() => {
    if (terminalOutput) return terminalOutput;

    // Filter for model / agent / assistant messages from main chat UI
    const aiMsgs = messages.filter(
      (m: any) =>
        m &&
        (m.role === "model" ||
          m.role === "agent" ||
          m.role === "assistant" ||
          m.role === "ai"),
    );

    if (aiMsgs.length === 0) return null;

    return aiMsgs
      .map((m: any, idx: number) => {
        if (m.role === "agent" && m.agent) {
          const ag = m.agent;
          let log = `[Main UI AI Agent Phase #${idx + 1}]`;
          if (ag.thinking) log += `\nThinking:\n${ag.thinking}`;
          if (ag.events && ag.events.length > 0) {
            log += `\nActions Executed (${ag.events.length}):`;
            ag.events.forEach((ev: any) => {
              if (ev.type === "thought")
                log += `\n  - Tool ${ev.kind || ""}: ${ev.arg || ev.output || ""}`;
              else if (ev.type === "act")
                log += `\n  - Executed ${ev.kind || ""}: ${ev.arg || ""} => ${ev.ok ? "OK" : "ERR"} ${ev.output || ""}`;
              else if (ev.type === "err") log += `\n  - Error: ${ev.m || ""}`;
            });
          }
          if (ag.summary) log += `\nSummary: ${ag.summary}`;
          return log;
        } else {
          return `[Main UI AI Output #${idx + 1}]\n${m.text || m.content || ""}`;
        }
      })
      .join(
        "\n\n------------------------------------------------------------\n\n",
      );
  }, [terminalOutput, messages]);

  // Each debugger's prompt, plus the shell prompt. Matched at the END of the
  // output — the same word can appear mid-text (a line of code containing
  // "debug>", say), but at the end it really is a prompt that is waiting.
  const POLA_PROMPT_DEBUG = {
    node: /debug>\s*$/,
    pdb: /\(Pdb\)\s*$/,
    rdbg: /\(rdbg\)\s*$/,
    dlv: /\(dlv\)\s*$/,
  };
  // PowerShell "PS C:\x>", cmd "C:\x>", and sh "$ " / "# ".
  const POLA_PROMPT_SHELL = /(?:PS )?[A-Za-z]:\\[^\r\n]*>\s*$|[$#]\s*$/;
  const periksaAkhirDebug = (potongan: any) => {
    if (!debugAktif || !onDebugSelesai) return;
    // ANSI is stripped: colours and title setters insert escapes RIGHT before
    // the prompt, so an "at the end" match on raw text always misses.
    const bersih = String(potongan)
      .replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, "")
      .replace(/\u001b\][^\u0007]*(\u0007|\u001b\\)/g, "");
    // A short tail is enough — only the very end decides.
    ekorRef.current = (ekorRef.current + bersih).slice(-400);
    const ekor = ekorRef.current.replace(/[ \t\r\n]+$/, "");
    const polaDebug = (POLA_PROMPT_DEBUG as Record<string, any>)[debugAktif];
    if (polaDebug && polaDebug.test(ekor)) {
      sudahLihatRef.current = true;
      return;
    }
    if (sudahLihatRef.current && POLA_PROMPT_SHELL.test(ekor)) {
      sudahLihatRef.current = false;
      ekorRef.current = "";
      onDebugSelesai();
    }
  };

  // Written to the PTY as if the user typed it and pressed Enter. "\r", not
  // "\n": a PTY reads a carriage return as an Enter keypress, while "\n" only
  // inserts a newline and leaves the command hanging, unexecuted.
  const kirimPerintah = (cmd: any) => {
    if (!sessionIdRef.current) {
      tertundaRef.current = cmd;
      return;
    }
    fetch("/api/terminal/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionIdRef.current, data: cmd + "\r" }),
    }).catch(() => {});
  };

  // A command from the Code panel. The nonce is compared rather than the text:
  // running the SAME file twice must genuinely run twice.
  useEffect(() => {
    if (!perintah || !perintah.cmd) return;
    if (nonceRef.current === perintah.n) return;
    nonceRef.current = perintah.n;
    // The markers reset on each new command: a leftover tail from the previous
    // session could make a session that just started read as already finished.
    ekorRef.current = "";
    sudahLihatRef.current = false;
    // TERMINAL, not DEBUG: what someone needs to see the moment a command is
    // sent is its OUTPUT. The DEBUG tab holds only controls, and jumping there
    // would hide the very line the debugger stopped on.
    setActiveTab("TERMINAL");
    kirimPerintah(perintah.cmd);
  }, [perintah]);

  const restartSession = async () => {
    // Restart replaces the session UNDER THE ACTIVE TERMINAL, so the instance
    // has to learn the new id too. Setting only sessionIdRef would leave the
    // poll loop reading, and onData writing to, a session that was just
    // closed -- the terminal would look alive and do nothing.
    const instAktif = _terminalInstans.get(aktifKey);
    const pasangSesi = (id: any) => {
      sessionIdRef.current = id;
      if (instAktif) instAktif.sessionId = id;
    };
    if (sessionIdRef.current) {
      try {
        await fetch("/api/terminal/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: sessionIdRef.current }),
        });
      } catch (_) {}
      pasangSesi(null);
    }
    if (termRef.current) {
      termRef.current.clear();
    }
    const targetCwd =
      typeof selectedProject === "object" && selectedProject !== null
        ? selectedProject.path || selectedProject.dir || undefined
        : typeof selectedProject === "string" && selectedProject.trim() !== ""
          ? selectedProject.trim()
          : undefined;
    try {
      const res = await fetch("/api/terminal/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: targetCwd }),
      });
      if (res.ok) {
        const data = await res.json();
        pasangSesi(data.id);
        setStatusText(
          `Shell: ${data.shell || "powershell"} (${targetCwd || "default"})`,
        );
        if (termRef.current) {
          termRef.current.focus();
        }
        // A command waiting on this session is released now, not discarded.
        if (tertundaRef.current) {
          const menunggu = tertundaRef.current;
          tertundaRef.current = null;
          kirimPerintah(menunggu);
        }
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        setStatusText("Error spawning terminal");
        if (termRef.current)
          termRef.current.write(
            `\r\n\x1b[31m[Error] Failed to open PTY session: ${err.error || "Unknown error"}\x1b[0m\r\n`,
          );
      }
    } catch (e) {
      setStatusText("Offline / No PTY");
      if (termRef.current)
        termRef.current.write(
          `\r\n\x1b[31m[Error] Cannot connect to /api/terminal/open (${(e as any).message}). Ensure server is running.\x1b[0m\r\n`,
        );
    }
  };

  // Options are shared by every terminal, so a second one cannot drift from
  // the first by being constructed somewhere else.
  const opsiTerminal = () => ({
    cols: 100,
    rows: 25,
    scrollback: 5000,
    fontFamily: '"JetBrains Mono", Consolas, "Cascadia Code", monospace',
    fontSize: 13,
    cursorStyle: "block" as any,
    cursorBlink: true,
    // The full VS Code palette. Before this the terminal handed xterm five
    // colours, so everything a program printed IN COLOUR fell through to
    // xterm's defaults. See public/app/TemaTerminalVSCode.ts for the source
    // and its licence.
    theme: TEMA_TERMINAL_VSCODE,
    allowProposedApi: true,
  });

  // The label beside each row, as VS Code names them: the shell, not the path.
  const namaShell = (shell: any) => {
    const b = String(shell || "")
      .split(/[\\/]/)
      .pop();
    return String(b || "shell").replace(/\.exe$/i, "");
  };

  const pasangAktif = (key: string) => {
    const inst = _terminalInstans.get(key);
    if (!inst) return;
    termRef.current = inst.term;
    fitRef.current = inst.fit;
    sessionIdRef.current = inst.sessionId;
  };

  // Only the active terminal is shown -- and the split partner beside it. The
  // others stay MOUNTED but hidden, which is what preserves their scrollback.
  const susunTampilan = (aktif: string, pecah: string) => {
    for (const [k, inst] of _terminalInstans) {
      const tampil = k === aktif || (pecah && k === pecah);
      inst.el.style.display = tampil ? "block" : "none";
      if (!tampil) continue;
      if (pecah && k === aktif) {
        inst.el.style.left = "0";
        inst.el.style.width = "50%";
      } else if (pecah && k === pecah) {
        inst.el.style.left = "50%";
        inst.el.style.width = "50%";
      } else {
        inst.el.style.left = "0";
        inst.el.style.width = "100%";
      }
      try {
        inst.fit?.fit();
      } catch (_) {}
    }
  };

  const buatTerminal = async (shellPilihan?: any) => {
    const host = hostRef.current;
    if (!host || !window.Terminal) return null;
    _terminalUrut += 1;
    const key = "t" + _terminalUrut;

    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.top = "0";
    el.style.bottom = "0";
    el.style.left = "0";
    el.style.width = "100%";
    el.style.display = "none";
    host.appendChild(el);

    const term = new window.Terminal(opsiTerminal());
    const FitAddonCtor =
      window.FitAddon?.FitAddon ||
      window.FitAddon ||
      window.fitAddon?.FitAddon ||
      window.xterm?.FitAddon;
    let fit: any = null;
    if (FitAddonCtor) {
      fit = new FitAddonCtor();
      term.loadAddon(fit);
    }
    term.open(el);

    const inst: any = { key, term, fit, el, sessionId: null, shell: "" };
    _terminalInstans.set(key, inst);

    // Input and resize are bound to THIS instance's session, read off `inst`
    // rather than the active pointer. Reading the pointer would send what
    // someone types into the visible terminal to whichever session happens to
    // be active by the time the callback runs.
    term.onData((data: any) => {
      if (!inst.sessionId) return;
      fetch("/api/terminal/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inst.sessionId, data }),
      }).catch(() => {});
    });
    term.onResize(({ cols, rows }: any) => {
      if (!inst.sessionId) return;
      fetch("/api/terminal/resize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inst.sessionId, cols, rows }),
      }).catch(() => {});
    });

    const targetCwd = akarProyek(selectedProject);
    try {
      const res = await fetch("/api/terminal/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: targetCwd, shell: shellPilihan }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      inst.sessionId = data.id;
      inst.shell = data.shell || shellPilihan || "shell";
      inst.nama = namaShell(inst.shell);
      setTerminals((prev: any[]) =>
        prev.concat([{ key, shell: inst.shell, nama: namaShell(inst.shell) }]),
      );
      setStatusText(
        "Shell: " +
          namaShell(inst.shell) +
          " (" +
          (targetCwd || "default") +
          ")",
      );
      // A command queued while the PTY was still opening is released now
      // rather than discarded -- the button looked like it worked otherwise.
      if (tertundaRef.current) {
        const antre = tertundaRef.current;
        tertundaRef.current = null;
        fetch("/api/terminal/write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: inst.sessionId, data: antre }),
        }).catch(() => {});
      }
    } catch (e: any) {
      term.write(
        "\r\n\x1b[31m[Error] Cannot connect to /api/terminal/open (" +
          (e && e.message ? e.message : String(e)) +
          "). Ensure server is running.\x1b[0m\r\n",
      );
    }
    return key;
  };

  const pilihTerminal = (key: string) => {
    setAktifKey(key);
    _terminalAktif = key;
    pasangAktif(key);
    setTimeout(() => {
      susunTampilan(key, pecahKey === key ? "" : pecahKey);
      _terminalInstans.get(key)?.term?.focus();
    }, 0);
  };

  const tutupTerminal = async (key: string) => {
    const inst = _terminalInstans.get(key);
    if (!inst) return;
    _terminalInstans.delete(key);
    if (inst.sessionId) {
      fetch("/api/terminal/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inst.sessionId }),
      }).catch(() => {});
    }
    try {
      inst.term.dispose();
    } catch (_) {}
    try {
      inst.el.remove();
    } catch (_) {}
    const sisa = Array.from(_terminalInstans.keys());
    setTerminals((prev: any[]) => prev.filter((t) => t.key !== key));
    if (pecahKey === key) setPecahKey("");
    if (aktifKey === key) {
      // Closing the last one leaves NO terminal rather than a dead pane: a
      // pane with no session accepts typing that goes nowhere.
      const berikut = sisa[sisa.length - 1] || "";
      setAktifKey(berikut);
      if (berikut) pasangAktif(berikut);
      else {
        termRef.current = null;
        fitRef.current = null;
        sessionIdRef.current = null;
      }
      setTimeout(() => susunTampilan(berikut, ""), 0);
    } else {
      setTimeout(
        () => susunTampilan(aktifKey, pecahKey === key ? "" : pecahKey),
        0,
      );
    }
  };

  const pecahTerminal = async () => {
    const key = await buatTerminal();
    if (!key) return;
    setPecahKey(key);
    _terminalPecah = key;
    setTimeout(() => susunTampilan(aktifKey, key), 0);
  };

  // ONE terminal is created on mount, and one poll loop serves them all.
  //
  // A read interval per terminal would multiply a 75 ms poll by however many
  // are open; the loop below walks the instance map instead, so the cost of a
  // second terminal is one more request per tick rather than a second timer.
  useEffect(() => {
    if (!hostRef.current || !window.Terminal) return;
    let hidup = true;
    (async () => {
      // REOPENING: the terminals are still running from last time, so their
      // elements are moved back into this mount's host and nothing is
      // respawned. Creating fresh ones here is what used to lose the history.
      if (_terminalInstans.size) {
        for (const inst of _terminalInstans.values())
          hostRef.current.appendChild(inst.el);
        const kunci = Array.from(_terminalInstans.keys());
        const key = _terminalInstans.has(_terminalAktif)
          ? _terminalAktif
          : kunci[0] || "";
        if (!key) return;
        setAktifKey(key);
        _terminalAktif = key;
        pasangAktif(key);
        susunTampilan(key, _terminalPecah);
        _terminalInstans.get(key)?.term?.focus();
        return;
      }
      const key = await buatTerminal();
      if (!hidup || !key) return;
      setAktifKey(key);
      _terminalAktif = key;
      pasangAktif(key);
      susunTampilan(key, "");
      _terminalInstans.get(key)?.term?.focus();
    })();

    let resizeDebounce: any = null;
    const doFit = () => {
      clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(() => {
        for (const inst of _terminalInstans.values()) {
          if (inst.el.style.display === "none") continue;
          try {
            inst.fit?.fit();
          } catch (_) {}
        }
      }, 100);
    };
    const ro = new ResizeObserver(() => doFit());
    ro.observe(hostRef.current);
    window.addEventListener("resize", doFit);

    const readInterval = setInterval(async () => {
      for (const inst of Array.from(_terminalInstans.values())) {
        if (!inst.sessionId) continue;
        try {
          const res = await fetch("/api/terminal/read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: inst.sessionId, clear: true }),
          });
          if (!res.ok) continue;
          const data = await res.json();
          if (data.output) {
            inst.term.write(data.output);
            // The debug prompt watcher only cares about the terminal being
            // looked at; a background session must not trip it.
            if (inst.term === termRef.current) periksaAkhirDebug(data.output);
          }
        } catch (_) {}
      }
    }, 75);

    return () => {
      hidup = false;
      clearInterval(readInterval);
      clearTimeout(resizeDebounce);
      ro.disconnect();
      window.removeEventListener("resize", doFit);
      // The sessions are DELIBERATELY left running and the xterms undisposed.
      // Closing the panel is not closing the terminals -- the cross on each
      // row is what closes one. Only this mount's timers and observer stop,
      // and the PTY output that arrives meanwhile is held in the server's
      // per-session buffer until the panel comes back and reads it.
      termRef.current = null;
    };
  }, [selectedProject]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        background: "#181c20",
        borderTop: "1px solid var(--line, #1f2733)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "36px",
          padding: "0 12px",
          background: "var(--surface-1, #0f1318)",
          borderBottom: "1px solid var(--line, #1f2733)",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "18px",
            height: "100%",
          }}
        >
          <button
            className="btn-reset"
            onClick={() => {
              setActiveTab("TERMINAL");
              setTimeout(() => {
                fitRef.current?.fit();
                termRef.current?.focus();
              }, 10);
            }}
            style={{
              borderBottom:
                activeTab === "TERMINAL"
                  ? "2px solid var(--brand, #5eead4)"
                  : "2px solid transparent",
              color: activeTab === "TERMINAL" ? "#ffffff" : "#8b949e",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.5px",
              height: "100%",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "0 4px",
              fontFamily: "inherit",
            }}
          >
            <span>TERMINAL</span>
            <span
              style={{
                fontSize: "10px",
                background: "rgba(255,255,255,0.08)",
                padding: "1px 5px",
                borderRadius: "8px",
                color: "#8b949e",
              }}
            >
              local
            </span>
          </button>
          {/* DEBUG sits in this tab group rather than in the editor header.
              Debug is a SESSION that lives in the terminal — it belongs beside
              the output it produces, not next to the Save button. */}
          <button
            className="btn-reset"
            onClick={() => setActiveTab("DEBUG")}
            style={{
              borderBottom:
                activeTab === "DEBUG"
                  ? "2px solid #e3b341"
                  : "2px solid transparent",
              color: activeTab === "DEBUG" ? "#ffffff" : "#8b949e",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.5px",
              height: "100%",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "0 4px",
              fontFamily: "inherit",
            }}
          >
            <span>DEBUG</span>
            {/* A yellow dot means a debugger session is alive. Without it, the
                only way to know is to open the tab. */}
            {debugAktif && (
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#e3b341",
                  boxShadow: "0 0 6px #e3b341",
                }}
              />
            )}
          </button>
          <button
            className="btn-reset"
            onClick={() => setActiveTab("OUTPUT")}
            style={{
              borderBottom:
                activeTab === "OUTPUT"
                  ? "2px solid var(--brand, #5eead4)"
                  : "2px solid transparent",
              color: activeTab === "OUTPUT" ? "#ffffff" : "#8b949e",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.5px",
              height: "100%",
              display: "flex",
              alignItems: "center",
              padding: "0 4px",
              fontFamily: "inherit",
            }}
          >
            OUTPUT
          </button>
          {/* INFO carries its counts on the tab itself: the point of a problems
              panel is to be glanceable without being opened. */}
          <button
            className="btn-reset"
            onClick={() => setActiveTab("INFO")}
            style={{
              borderBottom:
                activeTab === "INFO"
                  ? "2px solid var(--brand, #5eead4)"
                  : "2px solid transparent",
              color: activeTab === "INFO" ? "#ffffff" : "#8b949e",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.5px",
              height: "100%",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "0 4px",
              fontFamily: "inherit",
            }}
          >
            <span>INFO</span>
            {infoPernah &&
              TINGKAT_INFO.filter(
                (t) =>
                  infoDiag.filter((d: any) => d.severity === t.kunci).length,
              ).map((t) => (
                <span
                  key={t.kunci}
                  style={{ fontSize: "10px", color: t.warna }}
                >
                  {t.ikon}{" "}
                  {infoDiag.filter((d: any) => d.severity === t.kunci).length}
                </span>
              ))}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{ fontSize: "11px", color: "#6e7681", marginRight: "6px" }}
          >
            {statusText}
          </span>
          {activeTab === "TERMINAL" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "2px",
                position: "relative",
              }}
            >
              <button
                className="btn-reset term-btn"
                title="New Terminal"
                aria-label="New Terminal"
                onClick={async () => {
                  const k = await buatTerminal();
                  if (k) pilihTerminal(k);
                }}
                style={{
                  color: "#c9d1d9",
                  display: "flex",
                  alignItems: "center",
                  padding: "4px",
                  fontFamily: "inherit",
                }}
              >
                <Icon.plus width="14" height="14" />
              </button>
              <button
                className="btn-reset term-btn"
                title="Choose shell"
                aria-label="Choose shell"
                onClick={() => setMenuShell((v: boolean) => !v)}
                style={{
                  color: "#8b949e",
                  display: "flex",
                  alignItems: "center",
                  padding: "4px 2px",
                  fontFamily: "inherit",
                }}
              >
                <Icon.chev width="11" height="11" />
              </button>
              <button
                className="btn-reset term-btn"
                title="Split Terminal"
                aria-label="Split Terminal"
                onClick={() => pecahTerminal()}
                style={{
                  color: "#c9d1d9",
                  display: "flex",
                  alignItems: "center",
                  padding: "4px",
                  fontFamily: "inherit",
                }}
              >
                <Icon.split width="14" height="14" />
              </button>
              {menuShell && (
                <div
                  style={{
                    position: "absolute",
                    top: "26px",
                    right: 0,
                    zIndex: 50,
                    minWidth: "150px",
                    background: "#161b22",
                    border: "1px solid #30363d",
                    borderRadius: "6px",
                    padding: "4px 0",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
                  }}
                >
                  {/* The shell is passed straight to /api/terminal/open, which
                      already accepts one. Anything not installed fails there
                      and the error lands in the new terminal, where it is
                      readable -- rather than being pre-filtered by a list this
                      component would have to keep in step with the machine. */}
                  {SHELL_PILIHAN.map((s) => (
                    <button
                      key={s.nilai}
                      className="btn-reset"
                      onClick={async () => {
                        setMenuShell(false);
                        const k = await buatTerminal(s.nilai);
                        if (k) pilihTerminal(k);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "6px 12px",
                        fontSize: "12px",
                        color: "#c9d1d9",
                        fontFamily: "inherit",
                      }}
                    >
                      {s.nama}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            className="btn-reset"
            onClick={restartSession}
            title="New / Restart Terminal Session"
            style={{
              color: "#c9d1d9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "4px",
              borderRadius: "4px",
            }}
            onMouseEnter={(e: any) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.08)")
            }
            onMouseLeave={(e: any) =>
              (e.currentTarget.style.background = "transparent")
            }
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
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button
            className="btn-reset"
            onClick={() => {
              if (termRef.current) termRef.current.clear();
            }}
            title="Clear Terminal"
            style={{
              color: "#c9d1d9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "4px",
              borderRadius: "4px",
            }}
            onMouseEnter={(e: any) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.08)")
            }
            onMouseLeave={(e: any) =>
              (e.currentTarget.style.background = "transparent")
            }
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
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            </svg>
          </button>
          <button
            className="btn-reset"
            onClick={onClose}
            title="Close Terminal Panel"
            style={{
              color: "#c9d1d9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "4px",
              borderRadius: "4px",
            }}
            onMouseEnter={(e: any) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.08)")
            }
            onMouseLeave={(e: any) =>
              (e.currentTarget.style.background = "transparent")
            }
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
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* TERMINAL: the panes on the left, the session list on the right.

            Each terminal owns a DOM node created imperatively inside `hostRef`
            and kept mounted while another one is shown. Rendering them from
            React state instead would remount on every switch, and a remounted
            xterm has lost its scrollback -- which is most of what a terminal
            is for. */}
        <div
          style={{
            width: "100%",
            height: "100%",
            display: activeTab === "TERMINAL" ? "flex" : "none",
          }}
        >
          <div
            ref={hostRef}
            style={{
              flex: 1,
              minWidth: 0,
              height: "100%",
              padding: "6px 8px",
              position: "relative",
            }}
          />
          {terminals.length > 0 && (
            <div
              className={"term-resizer" + (geserDaftar ? " geser" : "")}
              onMouseDown={mulaiGeserDaftar}
              title="Resize"
            />
          )}
          {terminals.length > 0 && (
            <div
              style={{
                width: lebarDaftar + "px",
                flexShrink: 0,
                borderLeft: "1px solid var(--line, #1f2733)",
                background: "var(--surface-1, #0f1318)",
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
                paddingTop: "4px",
              }}
            >
              {terminals.map((t: any) => {
                const aktif = t.key === aktifKey;
                const terpecah = t.key === pecahKey;
                return (
                  <div
                    key={t.key}
                    className={"term-row" + (aktif ? " aktif" : "")}
                    onClick={() => pilihTerminal(t.key)}
                    onContextMenu={(e: any) => {
                      // Right-click carries the row's own actions, as VS Code
                      // does. Without it, Split always makes a terminal from
                      // the ACTIVE one, so acting on a row means selecting it
                      // first -- two steps for one intent.
                      e.preventDefault();
                      setMenuBaris({ key: t.key, x: e.clientX, y: e.clientY });
                    }}
                    title={t.shell}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      height: "26px",
                      padding: "0 6px 0 7px",
                      cursor: "pointer",
                      fontSize: "12px",
                      whiteSpace: "nowrap",
                      color: aktif ? "#ffffff" : "#8b949e",
                      background: aktif
                        ? "rgba(255,255,255,0.07)"
                        : "transparent",
                      borderLeft: aktif
                        ? "2px solid var(--brand, #5eead4)"
                        : "2px solid transparent",
                    }}
                  >
                    <Icon.terminal
                      width="13"
                      height="13"
                      style={{ flexShrink: 0, opacity: aktif ? 0.95 : 0.65 }}
                    />
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {t.nama}
                    </span>
                    {terpecah && (
                      <Icon.split
                        width="11"
                        height="11"
                        style={{ flexShrink: 0, opacity: 0.55 }}
                      />
                    )}
                    <button
                      className="btn-reset term-x"
                      title={"Kill " + t.nama}
                      aria-label={"Close " + t.nama}
                      onClick={(e: any) => {
                        // Without this the click also selects the row that is
                        // being removed.
                        e.stopPropagation();
                        tutupTerminal(t.key);
                      }}
                      style={{
                        flexShrink: 0,
                        color: "inherit",
                        display: "flex",
                        alignItems: "center",
                        padding: "2px",
                        fontFamily: "inherit",
                      }}
                    >
                      <Icon.close width="11" height="11" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {menuBaris && (
            <div
              onMouseLeave={() => setMenuBaris(null)}
              style={{
                position: "fixed",
                left: menuBaris.x + "px",
                top: menuBaris.y + "px",
                zIndex: 3000,
                minWidth: "140px",
                background: "#161b22",
                border: "1px solid #30363d",
                borderRadius: "6px",
                padding: "4px 0",
                boxShadow: "0 12px 34px rgba(0,0,0,0.65)",
              }}
            >
              {[
                {
                  label: "Split",
                  jalan: () => {
                    pilihTerminal(menuBaris.key);
                    pecahTerminal();
                  },
                },
                {
                  label: "Kill",
                  jalan: () => tutupTerminal(menuBaris.key),
                  merah: true,
                },
              ].map((m: any) => (
                <button
                  key={m.label}
                  className="btn-reset"
                  onClick={() => {
                    setMenuBaris(null);
                    m.jalan();
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 12px",
                    fontSize: "12px",
                    color: m.merah ? "#f85149" : "#c9d1d9",
                    fontFamily: "inherit",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* ── The DEBUG tab ──
            Its controls live here while its output stays in the TERMINAL tab —
            a debugger session really is one process with its shell, so
            separating the output would hide part of the answer. */}
        <div
          style={{
            display: activeTab === "DEBUG" ? "flex" : "none",
            flexDirection: "column",
            gap: "14px",
            padding: "16px",
            height: "100%",
            boxSizing: "border-box",
            color: "#c9d1d9",
            fontSize: "12px",
          }}
        >
          {!debugAktif ? (
            <>
              <div
                style={{ color: "#6b7280", lineHeight: 1.7, maxWidth: "460px" }}
              >
                {!pemicuDebug ? (
                  <>
                    Open a file in the <b style={{ color: "#adbac7" }}>Code</b>{" "}
                    panel first.
                  </>
                ) : pemicuDebug.mulai ? (
                  <>
                    Ready to debug{" "}
                    <b style={{ color: "#adbac7" }}>{pemicuDebug.berkas}</b>.
                    The file is saved first, then run under the debugger.
                  </>
                ) : (
                  <>
                    <b style={{ color: "#adbac7" }}>{pemicuDebug.berkas}</b> —{" "}
                    {pemicuDebug.alasan}
                  </>
                )}
              </div>
              <div className="dbg-bar">
                <button
                  type="button"
                  className="dbg-btn dbg-mulai"
                  disabled={!(pemicuDebug && pemicuDebug.mulai)}
                  onClick={() =>
                    pemicuDebug && pemicuDebug.mulai && pemicuDebug.mulai()
                  }
                  title={
                    pemicuDebug && pemicuDebug.mulai
                      ? "Save, then run under the debugger"
                      : (pemicuDebug && pemicuDebug.alasan) ||
                        "No debuggable file"
                  }
                >
                  {/* A bug — the same debug symbol as in any other editor. */}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <rect x="8" y="7" width="8" height="13" rx="4" />
                    <path d="M9 5.5 11 8M15 5.5 13 8M8 11H4M20 11h-4M8 16H4.5M20 16h-3.5" />
                  </svg>
                  <span>Start debugging</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "#e3b341",
                }}
              >
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    background: "#e3b341",
                    boxShadow: "0 0 8px #e3b341",
                  }}
                />
                <span style={{ letterSpacing: "0.06em" }}>
                  Session live · {debugAktif}
                </span>
              </div>
              {/* A DAP session exposes state as DATA; a PTY one does not. So the
                  panel below is rendered only for DAP — showing empty boxes for
                  a PTY session would read like a debugger that found nothing. */}
              {dapKeadaan && (
                <div style={{ display: "grid", gap: "12px", minWidth: 0 }}>
                  {dapKeadaan.galat && (
                    <div style={{ color: "#f85149" }}>{dapKeadaan.galat}</div>
                  )}
                  {dapKeadaan.berhenti ? (
                    <>
                      <div style={{ color: "#adbac7" }}>
                        Stopped at line{" "}
                        <b style={{ color: "#e3b341" }}>
                          {dapKeadaan.berhenti.baris}
                        </b>{" "}
                        ({dapKeadaan.berhenti.alasan})
                      </div>
                      <div className="dbg-kotak">
                        <div className="dbg-kotak-judul">Variables</div>
                        <div className="dbg-kotak-isi">
                          {dapKeadaan.berhenti.variabel.length === 0 ? (
                            <div
                              className="dbg-baris"
                              style={{ color: "#6b7280" }}
                            >
                              (no local variables)
                            </div>
                          ) : (
                            dapKeadaan.berhenti.variabel.map((v: any) => (
                              <div className="dbg-baris" key={v.nama}>
                                <span className="dbg-nama">{v.nama}</span>
                                {v.tipe && (
                                  <span className="dbg-tipe">{v.tipe}</span>
                                )}
                                <span className="dbg-nilai">{v.nilai}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="dbg-kotak">
                        <div className="dbg-kotak-judul">Call stack</div>
                        <div className="dbg-kotak-isi">
                          {dapKeadaan.berhenti.tumpukan.map(
                            (f: any, i: number) => (
                              <div
                                key={f.id}
                                className={
                                  "dbg-bingkai" + (i === 0 ? " atas" : "")
                                }
                              >
                                {f.nama} — baris {f.baris}
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    </>
                  ) : !dapKeadaan.selesai ? (
                    <div style={{ color: "#6b7280" }}>Program running…</div>
                  ) : (
                    <div style={{ color: "#6b7280" }}>Session finished.</div>
                  )}
                  {dapKeadaan.semuaKeluaran &&
                    dapKeadaan.semuaKeluaran.length > 0 && (
                      <div className="dbg-kotak">
                        <div className="dbg-kotak-judul">Program output</div>
                        <div className="dbg-kotak-isi">
                          <pre
                            style={{
                              margin: 0,
                              padding: "6px 10px",
                              whiteSpace: "pre-wrap",
                              color: "#c9d1d9",
                            }}
                          >
                            {dapKeadaan.semuaKeluaran.join("")}
                          </pre>
                        </div>
                      </div>
                    )}
                </div>
              )}
              <div className="dbg-bar">
                {[
                  ["lanjut", "Continue", "M4 3l10 7-10 7zM16 3h2v14h-2z"],
                  [
                    "lewati",
                    "Step over",
                    "M3 10a8 8 0 0 1 14-5M17 3v4h-4M10 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
                  ],
                  [
                    "masuk",
                    "Step into",
                    "M10 2v9M6.5 8L10 11.5 13.5 8M10 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
                  ],
                  [
                    "keluar",
                    "Step out",
                    "M10 11V2M6.5 5.5L10 2l3.5 3.5M10 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
                  ],
                  ["berhenti", "Stop", "M5 5h10v10H5z"],
                ].map(([aksi, label, d]) => (
                  <button
                    key={aksi}
                    type="button"
                    title={label}
                    aria-label={label}
                    onClick={() =>
                      dapKeadaan
                        ? onAksiDap && onAksiDap(aksi)
                        : onAksiDebug && onAksiDebug(aksi)
                    }
                    className={
                      "dbg-btn" + (aksi === "berhenti" ? " dbg-stop" : "")
                    }
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 20 20"
                      fill={
                        aksi === "lanjut" || aksi === "berhenti"
                          ? "currentColor"
                          : "none"
                      }
                      stroke="currentColor"
                      strokeWidth={
                        aksi === "lanjut" || aksi === "berhenti" ? 0 : 1.6
                      }
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d={d} />
                    </svg>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <div style={{ color: "#6b7280", lineHeight: 1.7 }}>
                Debugger output is in the{" "}
                <b style={{ color: "#adbac7" }}>TERMINAL</b> tab — this session
                shares a process with its shell.
              </div>
            </>
          )}
        </div>
        <div
          style={{
            display: activeTab === "OUTPUT" ? "block" : "none",
            padding: "12px",
            color: "#c9d1d9",
            fontSize: "12px",
            fontFamily:
              '"JetBrains Mono", Consolas, "Cascadia Code", monospace',
            overflowY: "auto",
            height: "100%",
            whiteSpace: "pre-wrap",
            lineHeight: "1.5",
          }}
        >
          {mainUiAiLog ? (
            <div>{mainUiAiLog}</div>
          ) : (
            <div style={{ color: "#8b949e" }}>
              <div
                style={{
                  color: "#5eead4",
                  fontWeight: 600,
                  marginBottom: "6px",
                }}
              >
                [WOLFSPACE AI & System Output Stream]
              </div>
              No activity log or AI output from the main UI yet.
              <br />
              When you chat with the AI in the main UI or run a command, all
              process logs and AI response results will automatically flow into
              this panel.
            </div>
          )}
        </div>
        {/* INFO -- problems across the whole workspace.
            
            TWO LAYERS, deliberately. The tab strip above is the first: it names
            which panel you are in. The rail below is the second: it names the
            severity, and it runs VERTICALLY so the counts stay readable when
            the terminal is docked narrow, where a horizontal filter row would
            wrap or clip the very numbers it exists to show. */}
        <div
          style={{
            display: activeTab === "INFO" ? "flex" : "none",
            height: "100%",
            minHeight: 0,
          }}
        >
          <div
            style={{
              width: "56px",
              flexShrink: 0,
              borderRight: "1px solid var(--line, #1f2733)",
              display: "flex",
              flexDirection: "column",
              padding: "6px 0",
              gap: "2px",
              background: "var(--surface-1, #0f1318)",
            }}
          >
            {TINGKAT_INFO.map((t) => {
              const jml = infoDiag.filter(
                (d: any) => d.severity === t.kunci,
              ).length;
              const aktif = infoSaring === t.kunci;
              return (
                <button
                  key={t.kunci}
                  className="btn-reset"
                  title={t.judul + " (" + jml + ")"}
                  onClick={() => setInfoSaring(aktif ? "all" : t.kunci)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "1px",
                    padding: "6px 0",
                    borderLeft: aktif
                      ? "2px solid " + t.warna
                      : "2px solid transparent",
                    background: aktif ? "rgba(255,255,255,0.05)" : "none",
                    fontFamily: "inherit",
                  }}
                >
                  <span style={{ fontSize: "14px", color: t.warna }}>
                    {t.ikon}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: jml ? "#c9d1d9" : "#6e7681",
                    }}
                  >
                    {jml}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "6px 10px",
                borderBottom: "1px solid var(--line, #1f2733)",
                flexShrink: 0,
              }}
            >
              <button
                className="btn-reset"
                onClick={() => pindaiInfo()}
                disabled={infoSibuk}
                style={{
                  fontSize: "11px",
                  color: infoSibuk ? "#6e7681" : "#5eead4",
                  fontFamily: "inherit",
                  fontWeight: 600,
                }}
              >
                {infoSibuk ? "Scanning..." : "Rescan"}
              </button>
              <span style={{ fontSize: "11px", color: "#6e7681" }}>
                {infoNota ||
                  (infoPernah
                    ? infoDiag.length + " problem(s)"
                    : "not scanned yet")}
              </span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {infoDiag
                .filter(
                  (d: any) => infoSaring === "all" || d.severity === infoSaring,
                )
                .map((d: any, i: any) => {
                  const t = TINGKAT_INFO.find((x) => x.kunci === d.severity);
                  const warna = t ? t.warna : "#58a6ff";
                  const ikon = t ? t.ikon : "ⓘ";
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: "8px",
                        padding: "5px 10px",
                        fontSize: "12px",
                        fontFamily:
                          '"JetBrains Mono", Consolas, "Cascadia Code", monospace',
                        borderBottom: "1px solid rgba(255,255,255,0.03)",
                      }}
                    >
                      <span style={{ color: warna, flexShrink: 0 }}>
                        {ikon}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ color: "#58a6ff" }}>
                          {d.file}:{d.line}:{d.col}
                        </span>
                        <span style={{ color: "#6e7681" }}> {d.code}</span>
                        <div style={{ color: "#c9d1d9", lineHeight: 1.5 }}>
                          {d.message}
                        </div>
                      </span>
                    </div>
                  );
                })}
              {infoPernah && !infoSibuk && infoDiag.length === 0 && (
                <div
                  style={{
                    padding: "12px",
                    fontSize: "12px",
                    color: "#8b949e",
                  }}
                >
                  No problems have been detected in the workspace.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
