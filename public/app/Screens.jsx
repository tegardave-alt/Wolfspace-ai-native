// Screens — diekstrak dari app.jsx (lihat public/app.jsx untuk App orkestrator).
// Dimuat via APP_MODULES di index.html: di-CONCAT SEBELUM app.jsx (prepend) lalu
// Babel sekali -> satu scope global. Body fungsi (hooks/React/SB) jalan saat render.

function PickerFolderIcon({ size = 15 }) {
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
function PickerChevIcon({ size = 12 }) {
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
  const isWolfspace = (p) =>
    p &&
    ((p.path && p.path.toLowerCase().includes("wolfspace")) ||
      (p.name && p.name.toLowerCase().includes("wolfspace")));
  try {
    const deleted = JSON.parse(
      localStorage.getItem("wolfspace_deleted_workspaces") || "[]",
    );
    // Cocok HANYA berdasar path persis — bukan nama/suffix (lihat isPathDeleted).
    const isDel = (p) => isPathDeleted(deleted, p && p.path) || isWolfspace(p);
    const stored = JSON.parse(
      localStorage.getItem("wolfspace_projects_list") || "[]",
    );
    if (stored && stored.length > 0) {
      const filtered = stored.filter((p) => !isDel(p));
      if (filtered.length > 0) return filtered;
    }
    return defaultDefaults.filter((p) => !isDel(p));
  } catch (_) {}
  return defaultDefaults;
}

// Isi dropdown project — DIPISAH dari ProjectPickerScreen supaya "hidup" hanya
// selama dropdown terbuka: setiap kali di-mount (dropdown dibuka), ia MEMBACA
// ULANG localStorage dari nol (bukan mewarisi state induk yang di-patch). Ini
// men-decouple "tulis data" (attachFolder, sudah selalu benar — terbukti lewat
// reload) dari "tampilkan data": render di sini tidak pernah bergantung pada
// apakah patch state sebelumnya sempat ter-commit+ter-paint saat window
// kehilangan/mendapat fokus OS (dialog folder native) — ia selalu mulai fresh,
// persis seperti reload manual, tanpa reload sungguhan dan tanpa reset layar lain.
function ProjectDropdownMenu({
  currentProject,
  onSelectProject,
  onNewProject,
}) {
  const [projectsList] = useState(() => getPickerProjectsList());
  return (
    <div className="picker-ws-dropdown">
      <button className="picker-ws-item" onClick={onNewProject}>
        <PickerFolderIcon /> New Project
      </button>
      {projectsList.length > 0 && <div className="picker-ws-divider" />}
      <div className="picker-ws-scroll-area">
        {projectsList.map((p, idx) => (
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

function ProjectPickerScreen({ onStart, models = [], modelVal, setModelVal }) {
  // CATATAN: daftar project TIDAK disimpan sebagai state di sini lagi — sengaja.
  // ProjectDropdownMenu membaca localStorage sendiri, fresh, tiap kali di-mount
  // (dropdown dibuka). Ini memutus ketergantungan pada patch state yang rentan
  // gagal ter-paint saat window kehilangan/mendapat fokus OS (dialog native).
  const [project, setProject] = useState(() => {
    const list = getPickerProjectsList();
    return list.length > 0 ? list[0].name : "project";
  });
  React.useEffect(() => {
    const reloadProjects = () => {
      const list = getPickerProjectsList();
      setProject((cur) => {
        if (list.some((p) => p.name === cur)) return cur;
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
  // Rekonsiliasi disk: buang "hantu" dari wolfspace_projects_list — project yang
  // FOLDERNYA sudah tak ada di disk, DI MANA PUN lokasinya (bukan cuma di bawah root
  // ww). Verifikasi keberadaan tiap path ke backend (/ww/verify); hanya yang
  // dipastikan TIDAK ADA yang dibuang (konservatif). Membersihkan localStorage
  // permanen → picker & sidebar sama-sama bersih.
  React.useEffect(() => {
    (async () => {
      let stored;
      try {
        stored = JSON.parse(
          localStorage.getItem("wolfspace_projects_list") || "[]",
        );
      } catch {
        return;
      }
      if (!Array.isArray(stored) || !stored.length) return;
      const paths = stored.map((p) => p && p.path).filter(Boolean);
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
      const kept = stored.filter((p) => !(p && p.path && gone.has(p.path)));
      if (kept.length !== stored.length) {
        localStorage.setItem("wolfspace_projects_list", JSON.stringify(kept));
        window.dispatchEvent(new Event("wolfspace_workspaces_changed"));
      }
    })();
  }, []);
  const [dropOpen, setDropOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showMcpMenu, setShowMcpMenu] = useState(false);
  const [pickerEffort, setPickerEffort] = useState(() => {
    try {
      return readEffort(getCloud());
    } catch {
      return 1;
    }
  });
  const [pickerMcp, setPickerMcp] = useState([]);

  // Pemuat tunggal: dipakai saat mount DAN saat layar lain menyiarkan perubahan MCP.
  const loadPickerMcp = React.useCallback(async () => {
    if (!window.WOLFSPACE) return;
    try {
      // Sama dgn Components.jsx: `active` dulu di-hardcode true sehingga badge
      // selalu "Connected" walau prosesnya belum jalan atau tiap panggilannya
      // gagal (mis. token dicabut). Status runtime diambil dari /mcp/status.
      const [resCfg, resSt] = await Promise.all([
        window.WOLFSPACE.invoke("api", { method: "GET", path: "/mcp" }),
        window.WOLFSPACE.invoke("api", { method: "GET", path: "/mcp/status" }),
      ]);
      const parse = (r) => {
        if (!r || !r.body) return {};
        try {
          return typeof r.body === "string" ? JSON.parse(r.body) : r.body;
        } catch (_) {
          return {};
        }
      };
      const data = parse(resCfg);
      const st = parse(resSt);
      const arr = Object.entries(data || {}).map(([name, conf]) => {
        const s = st[name] || {};
        return {
          id: name,
          name: name,
          desc:
            (conf.command || "") + " " + (conf.args ? conf.args.join(" ") : ""),
          // Jika server di-disabled di backend, paksa active = false.
          // Tanpa ini polling status akan menimpa hasil toggle dan server
          // terkesan "hidup kembali" sendiri walaupun sudah dinonaktifkan.
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

  const handlePickerMcpCodeConnect = async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const type = pickerMcpInputUrl.trim();
    const envVars = pickerMcpInputToken.trim();

    if (!type) {
      setPickerMcpInputError("Jenis MCP wajib diisi.");
      return;
    }

    setPickerMcpInputError("");
    setPickerMcpInputSuccess("");

    let command = "npx";
    let args = [];
    let cleanType = type.toLowerCase();

    if (cleanType.startsWith("npx ")) {
      const parts = type.split(/\s+/);
      command = parts[0];
      args = parts.slice(1);
    } else if (cleanType.startsWith("http")) {
      command = "node";
      args = ["scripts/sse-bridge.cjs", type];
    } else if (cleanType.includes("/")) {
      args = ["-y", type];
    } else if (cleanType === "notion") {
      args = ["-y", "@notionhq/notion-mcp-server"];
    } else if (cleanType === "penpot") {
      command = "node";
      args = [
        "C:\\langs\\node\\node_modules\\@penpot\\mcp\\packages\\server\\dist\\index.js",
      ];
    } else if (cleanType === "figma") {
      args = ["-y", "figma-developer-mcp", "--stdio"];
    } else {
      args = ["-y", `@modelcontextprotocol/server-${cleanType}`];
    }

    let name = type
      .split("/")
      .pop()
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
        else if (cleanType.includes("penpot"))
          env = { PENPOT_ACCESS_TOKEN: envVars };
        else if (cleanType === "figma") {
          // figma-developer-mcp menerima token via --figma-api-key arg, bukan env, dan butuh --stdio
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
        setPickerMcpInputError(err.message);
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

    setPickerMcp((prev) => [...prev.filter((p) => p.id !== name), entry]);
    // Entri optimistis (lihat catatan di Components.jsx): segarkan dgn status
    // runtime supaya server yang gagal tak terus tampil "Connected".
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
  const wrapRef = useRef(null);
  const taRef = useRef(null);
  // Penjaga anti-tutup BERBASIS STATUS (bukan tebakan durasi — terbukti rapuh,
  // penutupan pernah terjadi >500ms setelah attachFolder selesai). Aktif TERUS
  // sepanjang: dialog native dibuka → attach selesai → dropdown reopen dirender.
  // Root cause TERKONFIRMASI via trace: dropdown reopen (dropOpen=true, item baru
  // ADA di daftar) tapi tertutup lagi oleh mousedown pada DIV.project-picker-screen
  // (BUKAN item spesifik) — event "sisa" saat fokus jendela kembali dari dialog OS.
  const nativeDialogActiveRef = useRef(false);
  useEffect(() => {
    const h = (e) => {
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
  const grow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };
  const handleAttachmentSelect = async (e) => {
    const files = Array.from(e.target.files || []);
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
      // File 3D butuh blob URL agar Model3DViewer bisa memuatnya (three.js loader
      // menerima URL, bukan File). Sama seperti img/vid — object URL lokal.
      let previewUrl =
        isImg || isVid || is3D ? URL.createObjectURL(file) : null;
      let snippet = null;
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
      setAttachments((prev) => [
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
            const base64 = reader.result.split(",")[1] || reader.result;
            // JEMBATAN, bukan unggahan — alasan lengkapnya di Components.jsx.
            // Permukaan KEDUA: logika attach terduplikasi di dua berkas ini,
            // dan perbaikan yang hanya menyentuh satu membuat perilaku aplikasi
            // bergantung pada layar mana yang kebetulan dipakai. Itu persis
            // yang terjadi pada daftar MCP sebelumnya.
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
              let parsed;
              try {
                parsed =
                  typeof res.body === "string" ? JSON.parse(res.body) : res;
              } catch (_) {
                parsed = res;
              }
              if (res.status >= 400 || !parsed.ok)
                throw new Error(parsed.error || "Attach gagal");
              attHandle = parsed.id;
            } else {
              const r = await fetch("/attach", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              const res = await r.json();
              if (!res.ok) throw new Error(res.error || "Attach gagal");
              attHandle = res.id;
            }
            setAttachments((prev) =>
              prev.map((a) =>
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
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === attId
                  ? { ...a, status: "error", error: err.message }
                  : a,
              ),
            );
          }
        };
        reader.onerror = () => {
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === attId
                ? { ...a, status: "error", error: "Failed reading file" }
                : a,
            ),
          );
        };
        reader.readAsDataURL(file);
      } catch (err) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === attId ? { ...a, status: "error", error: err.message } : a,
          ),
        );
      }
    }
    target.value = "";
  };
  const onRemoveAttachment = (id) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  const submit = () => {
    const v = text.trim();
    if (!v && attachments.length === 0) return;
    let fullText = v;
    if (attachments.length > 0) {
      // HANDLE, bukan path — alasan lengkapnya di Components.jsx. Bentuknya
      // harus IDENTIK di kedua permukaan; kalau berbeda, agent menerima format
      // lampiran yang berbeda tergantung layar mana yang dipakai user.
      const attSummary = attachments
        .map(
          (a) =>
            `- [Terlampir] ${a.name} (${Math.round(a.size / 1024)} KB${a.type ? `, ${a.type}` : ""})` +
            (a.attId ? ` — id: ${a.attId}` : " — GAGAL diserahkan"),
        )
        .join("\n");
      fullText = v
        ? `${v}\n\nAttachments:\n${attSummary}`
        : `Attachments:\n${attSummary}`;
    }
    // Baca fresh (bukan dari state) — path yang benar butuh nilai TERBARU, bukan
    // salinan yang mungkin belum ter-patch akibat masalah render yang sama.
    const selectedObj = getPickerProjectsList().find((p) => p.name === project);
    const chosenPath = selectedObj
      ? selectedObj.path
      : project.includes(":") || project.includes("/") || project.includes("\\")
        ? project
        : `c:\\Users\\dave\\${project}`;
    onStart(fullText, chosenPath);
  };
  // Pasang folder ke WOLFSPACE = beri worktree+branch terikat ke alamat aslinya
  // (lewat /ww/attach). Idempoten & non-destruktif. Simpan dgn path yang benar.
  // Guard anti-dobel: cegah 2 panggilan attach untuk path yang sama nyaris bersamaan
  // (mis. double-fire dari native dialog / event) — bukan berbahaya (backend
  // idempoten), tapi tak perlu 2x panggilan untuk 1 aksi user.
  const attachInFlightRef = useRef(new Set());
  const attachFolder = async (folderPath, folderName) => {
    const key = folderPath.toLowerCase();
    if (attachInFlightRef.current.has(key)) {
      return;
    }
    attachInFlightRef.current.add(key);
    let att;
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
    // Tulis LANGSUNG ke localStorage (sumber kebenaran) — tanpa lewat state React.
    // ProjectDropdownMenu akan membaca ini FRESH begitu ia mount (lihat setDropOpen
    // di bawah), jadi urutan "tulis dulu, baru render" terjamin oleh urutan
    // eksekusi JS itu sendiri, bukan oleh timing commit/paint React yang rentan.
    const rest = getPickerProjectsList().filter(
      (p) => (p.path || "") !== finalPath,
    );
    const updated = [
      { name: finalName, path: finalPath, branch: att && att.branch },
      ...rest,
    ];
    localStorage.setItem("wolfspace_projects_list", JSON.stringify(updated));
    // Memasang ulang sebuah folder = MENCORETNYA dari daftar-hapus. Tanpa ini,
    // folder yang pernah dihapus lalu ditambах lagi akan tetap tersaring isDel.
    try {
      const del = JSON.parse(
        localStorage.getItem("wolfspace_deleted_workspaces") || "[]",
      );
      const pruned = del.filter(
        (d) => normDelPath(d) !== normDelPath(finalPath),
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
    // Dropdown tertutup sejak dialog native dibuka (handleOpenFolderPicker). Set
    // true di sini MEMBANGUN ProjectDropdownMenu dari NOL (mount baru, bukan
    // patch instance lama) — ia membaca localStorage yang BARU SAJA ditulis di
    // atas, sehingga folder baru LANGSUNG terlihat tanpa bergantung pada apakah
    // render sebelumnya sempat ter-paint saat window kehilangan fokus OS.
    setDropOpen(true);
    // Lepas penjaga SESAAT setelah render (2 frame) — bukan langsung, supaya mousedown
    // "sisa" yang tiba tepat bersamaan dengan render dropdown ini juga masih tertekan.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        nativeDialogActiveRef.current = false;
      }),
    );
  };
  const handleOpenFolderPicker = async () => {
    setDropOpen(false);
    nativeDialogActiveRef.current = true; // aktif dari SEBELUM dialog dibuka
    try {
      // Electron: dialog native → path absolut ASLI (folder di C:, D:, Desktop, mana pun).
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
      // Browser: File System Access API (path tak asli — ditebak di home).
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
      nativeDialogActiveRef.current = false; // jangan macet permanen kalau error
      if (err && err.name === "AbortError") return;
      console.error("[FolderPicker]", err);
    }
    document.getElementById("picker-workspace-folder-input")?.click();
  };
  const handleWorkspaceFolderSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    let folderName = "New Project";
    let folderPath = "";
    const first = files[0];
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
    attachFolder(folderPath, folderName); // pasang = isolasi terikat ke path
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
              onMouseDown={(e) => e.stopPropagation()}
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
                  onClick={(e) => {
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
                    {models.find((m) => m.value === modelVal)?.label ||
                      "Sonnet"}
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
                      .filter((m) => !m.disabled)
                      .map((m) => (
                        <button
                          key={m.value}
                          className="am-item"
                          style={{ padding: "8px 12px" }}
                          onClick={(e) => {
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
                  </div>
                )}
              </div>
              <button
                className="am-item"
                onClick={(e) => {
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowModelMenu(false);
                    setShowMcpMenu(!showMcpMenu);
                    // Pakai pemuat TUNGGAL (lihat catatan di Components.jsx):
                    // salinan inline dulu memetakan `active: true` dan menimpa
                    // status runtime yang benar tiap kali menu dibuka.
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
                    {pickerMcp.map((srv) => (
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
                          onClick={async (e) => {
                            e.stopPropagation();
                            // Daftar MCP KEDUA. Yang pertama ada di Composer
                            // (Components.jsx) dan sudah memisahkan CONNECT
                            // dari toggle; yang ini terlewat pada perubahan itu.
                            //
                            // Terbukti dari log run nyata: klik di layar ini
                            // menghasilkan `POST /mcp/toggle`, bukan
                            // `POST /mcp/connect` — jadi sekadar menyambungkan
                            // server ikut menulis `disabled` ke mcp.json.
                            // Logikanya harus SAMA di kedua tempat, kalau tidak
                            // perilaku aplikasi bergantung pada layar mana yang
                            // kebetulan dipakai.
                            const perluConnect =
                              !srv.active &&
                              !(srv.status && srv.status.disabled);
                            const jalur = perluConnect
                              ? "/mcp/connect"
                              : "/mcp/toggle";
                            const muatan = perluConnect
                              ? { name: srv.id }
                              : { name: srv.id, enabled: !srv.active };
                            setPickerMcp((prev) =>
                              prev.map((item) =>
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
                              // finally, bukan hanya jalur sukses: kalau gagal,
                              // badge "⟳ Connecting…" menempel selamanya karena
                              // tak ada yang menyegarkannya dari status runtime.
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
                                  // Bedakan sebabnya (lihat catatan di
                                  // Components.jsx): "gagal" != "belum jalan".
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
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Daftar MCP dipegang DUA komponen dgn state terpisah
                                    // (pickerMcp di sini, mcpServers di Components.jsx).
                                    // Tanpa siaran, hapus di satu layar tak terlihat di layar
                                    // lain sampai ia memuat ulang. Siarkan supaya keduanya sinkron.
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
                                          setPickerMcp((prev) =>
                                            prev.filter(
                                              (item) => item.id !== srv.id,
                                            ),
                                          );
                                          _bcast();
                                        })
                                        .catch((err) =>
                                          alert(
                                            "Failed to remove MCP: " +
                                              err.message,
                                          ),
                                        );
                                    } else {
                                      setPickerMcp((prev) =>
                                        prev.filter(
                                          (item) => item.id !== srv.id,
                                        ),
                                      );
                                      _bcast();
                                    }
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.color = "#f85149";
                                    e.currentTarget.style.background =
                                      "rgba(248,81,73,0.15)";
                                  }}
                                  onMouseLeave={(e) => {
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
                          onClick={(e) => {
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
                          onClick={(e) => e.stopPropagation()}
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
                              onChange={(e) => {
                                setPickerMcpInputUrl(e.target.value);
                                setPickerMcpInputError("");
                                setPickerMcpInputSuccess("");
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  setShowPickerMcpInput(false);
                                  setPickerMcpInputUrl("");
                                  setPickerMcpInputToken("");
                                  setPickerMcpInputError("");
                                }
                              }}
                              placeholder="Jenis MCP (contoh: github, brave-search, sqlite)"
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
                              onChange={(e) => {
                                setPickerMcpInputToken(e.target.value);
                                setPickerMcpInputError("");
                                setPickerMcpInputSuccess("");
                              }}
                              onKeyDown={(e) => {
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
                              onClick={(e) => {
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
                              Batal
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
                {attachments.map((a) => (
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
              onChange={(e) => {
                setText(e.target.value);
                grow();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div className="picker-toolbar">
              <button
                className={"picker-plus-btn" + (menu ? " open" : "")}
                onClick={() => setMenu((m) => !m)}
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
                onClick={() => setDropOpen((o) => !o)}
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
                  onSelectProject={(name) => {
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
function VSCodeTerminal({
  selectedProject,
  onClose,
  terminalOutput,
  messages = [],
}) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const sessionIdRef = useRef(null);
  const [activeTab, setActiveTab] = useState("TERMINAL");
  const [statusText, setStatusText] = useState("Connecting PTY...");

  // Build a clean, formatted AI output log from the main UI messages + any agent/terminal output
  const mainUiAiLog = useMemo(() => {
    if (terminalOutput) return terminalOutput;

    // Filter for model / agent / assistant messages from main chat UI
    const aiMsgs = messages.filter(
      (m) =>
        m &&
        (m.role === "model" ||
          m.role === "agent" ||
          m.role === "assistant" ||
          m.role === "ai"),
    );

    if (aiMsgs.length === 0) return null;

    return aiMsgs
      .map((m, idx) => {
        if (m.role === "agent" && m.agent) {
          const ag = m.agent;
          let log = `[Main UI AI Agent Phase #${idx + 1}]`;
          if (ag.thinking) log += `\nThinking:\n${ag.thinking}`;
          if (ag.events && ag.events.length > 0) {
            log += `\nActions Executed (${ag.events.length}):`;
            ag.events.forEach((ev) => {
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

  const restartSession = async () => {
    if (sessionIdRef.current) {
      try {
        await fetch("/api/terminal/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: sessionIdRef.current }),
        });
      } catch (_) {}
      sessionIdRef.current = null;
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
        sessionIdRef.current = data.id;
        setStatusText(
          `Shell: ${data.shell || "powershell"} (${targetCwd || "default"})`,
        );
        if (termRef.current) {
          termRef.current.focus();
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
          `\r\n\x1b[31m[Error] Cannot connect to /api/terminal/open (${e.message}). Ensure server is running.\x1b[0m\r\n`,
        );
    }
  };

  useEffect(() => {
    if (!containerRef.current || !window.Terminal) return;
    const term = new window.Terminal({
      cols: 100,
      rows: 25,
      scrollback: 5000,
      fontFamily: '"JetBrains Mono", Consolas, "Cascadia Code", monospace',
      fontSize: 13,
      cursorStyle: "block",
      cursorBlink: true,
      theme: {
        background: "#181c20",
        foreground: "#e2e8f0",
        cursor: "#ffffff",
        cursorAccent: "#181c20",
        selection: "rgba(56, 139, 253, 0.4)",
      },
      allowProposedApi: true,
    });

    const FitAddonCtor =
      window.FitAddon?.FitAddon ||
      window.FitAddon ||
      window.fitAddon?.FitAddon ||
      window.xterm?.FitAddon;
    let fit = null;
    if (FitAddonCtor) {
      fit = new FitAddonCtor();
      term.loadAddon(fit);
    }

    term.open(containerRef.current);
    if (fit) {
      try {
        fit.fit();
      } catch (_) {}
    }
    termRef.current = term;
    fitRef.current = fit;
    term.focus();

    term.onData((data) => {
      if (!sessionIdRef.current) return;
      fetch("/api/terminal/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionIdRef.current, data }),
      }).catch(() => {});
    });

    term.onResize(({ cols, rows }) => {
      if (!sessionIdRef.current) return;
      fetch("/api/terminal/resize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionIdRef.current, cols, rows }),
      }).catch(() => {});
    });

    let resizeDebounce = null;
    const doFit = () => {
      clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(() => {
        if (fitRef.current) {
          try {
            fitRef.current.fit();
          } catch (_) {}
        }
      }, 100);
    };
    const ro = new ResizeObserver(() => doFit());
    ro.observe(containerRef.current);
    window.addEventListener("resize", doFit);

    restartSession();

    const readInterval = setInterval(async () => {
      if (!sessionIdRef.current || !termRef.current) return;
      try {
        const res = await fetch("/api/terminal/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: sessionIdRef.current, clear: true }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.output && termRef.current) {
            termRef.current.write(data.output);
          }
        }
      } catch (_) {}
    }, 75);

    return () => {
      clearInterval(readInterval);
      clearTimeout(resizeDebounce);
      ro.disconnect();
      window.removeEventListener("resize", doFit);
      if (sessionIdRef.current) {
        fetch("/api/terminal/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: sessionIdRef.current }),
        }).catch(() => {});
      }
      try {
        term.dispose();
      } catch (_) {}
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
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{ fontSize: "11px", color: "#6e7681", marginRight: "6px" }}
          >
            {statusText}
          </span>
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
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.08)")
            }
            onMouseLeave={(e) =>
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
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.08)")
            }
            onMouseLeave={(e) =>
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
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.08)")
            }
            onMouseLeave={(e) =>
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
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: "100%",
            padding: "6px 8px",
            display: activeTab === "TERMINAL" ? "block" : "none",
          }}
        />
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
      </div>
    </div>
  );
}
