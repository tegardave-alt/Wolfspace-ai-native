// Components — extracted from app.jsx (see public/app.jsx for the App
// orchestrator). Loaded via APP_MODULES in index.html: CONCATENATED BEFORE
// app.jsx (prepended), then Babel once -> a single global scope. Function
// bodies (hooks/React/SB) run at render time.

/* ----------------------------- Top bar ----------------------------- */
// ── Menu tata letak (☰) ──
//
// Split into its own component when it moved from the top bar into the
// sidebar. The reason is not tidiness: it is ~150 lines, and moving it by
// copying would mean two copies that have to keep agreeing about panel
// position, chat visibility and Code — the three things that change most.
//
// `arah` decides which way the panel opens. In the top bar it drops down; at
// the FOOT of the sidebar, dropping down means going off screen, so it rises
// and widens to the right instead. The sidebar can narrow to 60px, and a
// panel trapped in that width would be unreadable.
function MenuTataLetak({
  posisi,
  setPosisi,
  chatVisible,
  setChatVisible,
  panelOpen,
  terminalOpen,
  logicOpen,
  setLogicOpen,
  arah = "bawah",
}: any) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<any>(null);
  // ── Why the panel is position: fixed while in the sidebar ──
  //
  // `.sidebar.collapsed` uses `overflow: hidden` (to hide the labels during
  // the width animation), and that CLIPS anything crossing its edge —
  // including this menu panel. Measured: the panel was cut off at x=232,
  // losing half of the "Right/Bottom" choice.
  //
  // `position: fixed` escapes that clipping. But it also escapes the button,
  // so the coordinates are MEASURED when the menu opens rather than hardcoded.
  // The sidebar can be resized AND collapsed, so any fixed number would be
  // wrong in one of those states.
  const [kotakMenu, setKotakMenu] = useState<any>(null);
  React.useLayoutEffect(() => {
    if (arah !== "atas" || !menuOpen || !menuRef.current)
      return setKotakMenu(null);
    const hitung = () => {
      const el = menuRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setKotakMenu({
        position: "fixed",
        left: Math.round(r.right + 8) + "px",
        bottom: Math.round(window.innerHeight - r.bottom) + "px",
        top: "auto",
        right: "auto",
        maxHeight: "calc(100vh - 24px)",
        overflowY: "auto",
      });
    };
    hitung();
    // The sidebar can be resized WHILE the menu is open.
    window.addEventListener("resize", hitung);
    return () => window.removeEventListener("resize", hitung);
  }, [arah, menuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    // Closed by an outside click AND by Escape. Only one of the two makes an
    // open menu feel stuck — the user presses Escape and wonders why.
    const klik = (e: any) => {
      if (menuRef.current && !menuRef.current.contains(e.target))
        setMenuOpen(false);
    };
    const tombol = (e: any) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", klik);
    document.addEventListener("keydown", tombol);
    return () => {
      document.removeEventListener("mousedown", klik);
      document.removeEventListener("keydown", tombol);
    };
  }, [menuOpen]);

  const pilihPosisi = (apa: any, ke: any) => {
    if (setPosisi) setPosisi((p: any) => ({ ...p, [apa]: ke }));
    setMenuOpen(false);
  };
  // The choices DIFFER per row rather than being "right/bottom" for all of
  // them. A terminal on the left or right forces command output — which comes
  // as long lines — to wrap constantly, so its pair is right/bottom. Preview
  // and Code are a page and an editor: both need WIDTH, so their pair is
  // left/right.
  const _NAMA_SISI: Record<string, string> = {
    kanan: "Right",
    bawah: "Bottom",
    kiri: "Left",
  };
  const barisPosisi = (apa: any, label: any, pilihan = ["kanan", "bawah"]) => (
    <div className="tb-menu-grup" key={apa}>
      <span className="tb-menu-judul">{label}</span>
      <div className="tb-menu-pilihan">
        {pilihan.map((ke) => (
          <button
            key={ke}
            type="button"
            className={
              "tb-menu-opsi" + (posisi && posisi[apa] === ke ? " aktif" : "")
            }
            onClick={() => pilihPosisi(apa, ke)}
          >
            {_NAMA_SISI[ke] || ke}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div
      className={"tb-menu-bungkus" + (arah === "atas" ? " ke-atas" : "")}
      ref={menuRef}
    >
      <button
        type="button"
        className={"tb-menu-btn" + (menuOpen ? " buka" : "")}
        onClick={() => setMenuOpen((b: any) => !b)}
        title="Layout"
        aria-label="Layout"
        aria-expanded={menuOpen}
      >
        {/* Three horizontal lines. Previously three descending dots (⋮),
              which in a top bar more commonly means "actions for this row";
              three lines (☰) read as a main menu — and that is what this is.
              Drawn with lines rather than the text "☰", so its weight and
              spacing do not shift with whichever font happens to be
              installed. */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>
      {menuOpen && posisi && setPosisi && (
        <div className="tb-menu" role="menu" style={kotakMenu || undefined}>
          <div className="tb-menu-kepala">Panel position</div>
          {barisPosisi("preview", "Preview panel", ["kanan", "kiri"])}
          {barisPosisi("terminal", "Terminal", ["kanan", "bawah"])}
          {barisPosisi("logic", "Code", ["kanan", "kiri"])}
          {barisPosisi("chat", "Chat", ["kanan", "kiri"])}
          <div className="tb-menu-pisah" />
          <div className="tb-menu-kepala">Visibility</div>
          <div className="tb-menu-grup">
            <span className="tb-menu-judul">Chat</span>
            <div className="tb-menu-pilihan">
              {[
                ["Show", true],
                ["Hide", false],
              ].map(([teks, nilai]) => {
                // Hiding chat when no other panel is open leaves an EMPTY
                // screen, and the user has no hint that the way back is in
                // this menu. So the option is disabled — and the reason is
                // stated, not just silently greyed out. Code counts too, now
                // that it is a real panel: without that, hiding chat while
                // ONLY Code is open would be refused even though the screen
                // would not be empty.
                const buntu =
                  !nilai && !panelOpen && !terminalOpen && !logicOpen;
                return (
                  <button
                    key={teks}
                    type="button"
                    disabled={buntu}
                    className={
                      "tb-menu-opsi" +
                      (chatVisible === nilai ? " aktif" : "") +
                      (buntu ? " mati" : "")
                    }
                    title={
                      buntu
                        ? "Open the preview, terminal, or Code panel first — hiding chat now would leave nothing on screen."
                        : ""
                    }
                    onClick={() => {
                      if (buntu) return;
                      setChatVisible(nilai);
                      setMenuOpen(false);
                    }}
                  >
                    {teks}
                  </button>
                );
              })}
            </div>
          </div>
          {setLogicOpen && (
            <div className="tb-menu-grup">
              <span className="tb-menu-judul">Code</span>
              <div className="tb-menu-pilihan">
                {[
                  ["Open", true],
                  ["Close", false],
                ].map(([teks, nilai]) => (
                  <button
                    key={teks}
                    type="button"
                    className={
                      "tb-menu-opsi" + (!!logicOpen === nilai ? " aktif" : "")
                    }
                    onClick={() => {
                      setLogicOpen(nilai);
                      setMenuOpen(false);
                    }}
                  >
                    {teks}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TopBar({
  models,
  modelVal,
  setModelVal,
  panelOpen,
  setPanelOpen,
  onReset,
  status,
  theme,
  setTheme,
  terminalOpen,
  setTerminalOpen,
  posisi,
  setPosisi,
  chatVisible,
  setChatVisible,
  logicOpen,
  setLogicOpen,
}: any) {
  // The ⋮ menu at the far left of the top bar.
  //
  // The layout options were once mounted as two SEPARATE buttons here, and
  // that was too busy for something rarely touched: this bar is for everyday
  // actions, while moving a panel is done once and then forgotten. The menu
  // hides them without removing them.
  return (
    <header className="topbar">
      {/* The ☰ menu MOVED to the sidebar (see MenuTataLetak used in
            Sidebar.tsx). The top bar is for everyday actions; layout is set
            once and then forgotten, so it belongs at the foot of the sidebar
            with the other settings. */}
      <div className="tb-spacer" />
      <button
        className={`panel-toggle-btn ${panelOpen ? "active" : ""}`}
        onClick={() => setPanelOpen(!panelOpen)}
        title="Toggle Right Panel"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <line x1="15" x2="15" y1="3" y2="21" />
        </svg>
      </button>
    </header>
  );
}

/* Views moved to public/app/Views.tsx (APP_MODULES). */

/* CodeBlocks moved to public/app/CodeBlocks.tsx (APP_MODULES). */

/* ----------------------------- Message ----------------------------- */
function Blocks({ text }: any) {
  const blocks = parseBlocks(text);
  if (!blocks.length)
    return (
      <div className="typing">
        <span />
        <span />
        <span />
      </div>
    );
  return blocks.map((b: any, i: number) =>
    b.type === "code" ? (
      b.lang && /^(mermaid|mmd)$/i.test(b.lang) ? (
        <MermaidBlock key={i} code={b.code} />
      ) : (
        <CodeBlock key={i} lang={b.lang} code={b.code} />
      )
    ) : b.type === "think" ? null : (
      <p key={i} dangerouslySetInnerHTML={{ __html: b.html }} />
    ),
  );
}
// WRAPPED in React.memo below — do not use MessageDasar directly.
//
// WHY. app.jsx renders the whole history: {messages.map((m,i) => <Message/>)}.
// While the agent works, the stream handler calls upd() on EVERY token, and
// upd() does setMessages(m => ...), which copies the array. Without memo,
// each token reconciles the entire list AGAIN — including every ToolOutput
// and CodeBlock with a live Monaco editor inside it.
//
// The cost scales with (live editors x tokens), which is why the symptom
// showed up "when Monaco appeared" and got worse the longer the history got.
// Measured in the real app over CDP: blocking tasks up to 358ms and ~2.4
// seconds of freeze in a single 123-second run — with only 3 live editors.
//
// upd() only replaces the LAST message object, so with memo exactly one
// Message actually re-renders per token. Message is a pure function of its
// `msg` prop (it touches neither context nor a changing closure), so
// React.memo's default reference comparison is already correct — no custom
// comparator needed.
function MessageDasar({ msg }: any) {
  if (msg.role === "user")
    return (
      <div className="msg user">
        <span className="msg-role">You</span>
        {/* Attachments render as CARDS, not as text lines inside the bubble.
            The att_… handle is still sent to the model through onSend's first
            argument — it needs that to read the attachment — but there is no
            point in a human reading it. */}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="msg-attachments">
            {msg.attachments.map((a: any, i: number) => (
              <div
                className={"msg-att" + (a.ok ? "" : " err")}
                key={i}
                title={a.ok ? a.name : a.name + " — handoff failed"}
              >
                {a.previewUrl && /^image\//.test(a.type || "") ? (
                  <img className="msg-att-thumb" src={a.previewUrl} alt="" />
                ) : (
                  <span className="msg-att-ico">{a.ok ? "📎" : "⚠"}</span>
                )}
                <span className="msg-att-name">{a.name}</span>
                <span className="msg-att-size">
                  {a.size < 1024
                    ? a.size + " B"
                    : Math.round(a.size / 1024) + " KB"}
                </span>
              </div>
            ))}
          </div>
        )}
        {msg.text ? <div className="bubble-user">{msg.text}</div> : null}
      </div>
    );
  if (msg.role === "agent")
    return (
      <div className="msg model">
        <span className="msg-role">Agent</span>
        <AgentSteps run={msg.agent || {}} />
      </div>
    );
  return (
    <div className="msg model">
      <span className="msg-role">WOLFSPACE</span>
      <div className="bubble-model">
        {msg.text ? (
          <Blocks text={msg.text} />
        ) : (
          <div className="typing">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
      {/* <Verdict> was REMOVED along with analyzeCode in server.cjs — the only
          source of the `quality` that component rendered. Without it, all it
          produced was an empty <div class="verdict-wrap"> on every message. */}
    </div>
  );
}
const Message = React.memo(MessageDasar);

/* ----------------------------- Composer ----------------------------- */
// Line icons for the composer "+" menu (match the reference design).
const svg = (p: any) => (
  <svg
    viewBox="0 0 24 24"
    width="19"
    height="19"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {p}
  </svg>
);
const MI = {
  plus: svg(
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>,
  ),
  upload: svg(
    <>
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
    </>,
  ),
  research: svg(
    <>
      <path d="M22 10L12 5 2 10l10 5 10-5z" />
      <path d="M6 12v4c0 1.1 2.7 3 6 3s6-1.9 6-3v-4" />
    </>,
  ),
  image: svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 16l-5-5L5 20" />
    </>,
  ),
  video: svg(
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M10 9l5 3-5 3V9z" />
    </>,
  ),
  slides: svg(
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M12 16v4" />
      <path d="M8 20h8" />
    </>,
  ),
  more: svg(
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>,
  ),
};

// Detect a 3D file (GLB/GLTF/STL) from a name or path.
const is3DFile = (nameOrPath?: string) =>
  /\.(glb|gltf|stl)$/i.test(nameOrPath || "");

/* Model3DViewer moved to public/app/Model3DViewer.tsx (loaded via APP_MODULES in index.html). */

function LightboxModal({ item, onClose }: any) {
  if (!item) return null;
  const is3D = is3DFile(item.name || item.path || "");
  const isImg =
    !is3D &&
    (/\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i.test(
      item.name || item.path || "",
    ) ||
      (item.type && item.type.startsWith("image/")) ||
      (item.url &&
        /\.(png|jpe?g|webp|gif|svg|bmp|ico)(?:\?.*)?$/i.test(item.url)) ||
      (!item.snippet &&
        !/\.(mp4|webm|mov|mkv)$/i.test(item.name || item.path || "")));
  const isVid =
    /\.(mp4|webm|mov|mkv)$/i.test(item.name || item.path || "") ||
    (item.type && item.type.startsWith("video/"));
  const displayUrl = item.previewUrl || item.url;

  return (
    <div
      className="attachment-modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.85)",
        zIndex: 999999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        backdropFilter: "blur(6px)",
        animation: "fadeIn 0.2s ease",
      }}
    >
      <div
        className="attachment-modal-content"
        onClick={(e: any) => e.stopPropagation()}
        style={{
          position: "relative",
          maxWidth: "92vw",
          maxHeight: "92vh",
          background: "var(--surface-2, #161b22)",
          border: "1px solid var(--line-strong, #30363d)",
          borderRadius: "12px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid var(--line-strong, #30363d)",
            background: "var(--surface-3, #21262d)",
          }}
        >
          <span
            style={{
              fontWeight: 600,
              color: "var(--text, #e5e5e5)",
              fontSize: "14px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "80%",
            }}
          >
            {is3D ? "🧊" : "📄"} {item.name || item.path || "Preview"}
          </span>
          <button
            className="btn-reset"
            type="button"
            onClick={onClose}
            style={{
              color: "var(--text-muted, #858585)",
              fontSize: "22px",
              padding: "0 6px",
              lineHeight: 1,
            }}
            title="Close"
          >
            ×
          </button>
        </div>
        <div
          style={{
            padding: "16px",
            overflow: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            maxHeight: "calc(92vh - 55px)",
            minWidth: "300px",
            minHeight: "200px",
          }}
        >
          {is3D && displayUrl ? (
            <Model3DViewer url={displayUrl} name={item.name || item.path} />
          ) : isImg && displayUrl ? (
            <img
              src={displayUrl}
              alt={item.name || item.path}
              style={{
                maxWidth: "100%",
                maxHeight: "calc(85vh - 80px)",
                objectFit: "contain",
                borderRadius: "6px",
              }}
            />
          ) : isVid && displayUrl ? (
            <video
              src={displayUrl}
              controls
              autoPlay
              style={{
                maxWidth: "100%",
                maxHeight: "calc(85vh - 80px)",
                borderRadius: "6px",
              }}
            />
          ) : item.snippet ? (
            <pre
              style={{
                margin: 0,
                fontFamily:
                  '"JetBrains Mono", Consolas, Courier New, monospace',
                fontSize: "13px",
                color: "#4ec9b0",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                background: "#0d1117",
                padding: "16px",
                borderRadius: "8px",
                width: "100%",
                maxHeight: "calc(82vh - 80px)",
                overflow: "auto",
              }}
            >
              {item.snippet}
            </pre>
          ) : (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                color: "var(--text-muted, #858585)",
              }}
            >
              <div style={{ fontSize: "56px", marginBottom: "16px" }}>📄</div>
              <div style={{ fontSize: "15px", color: "var(--text, #e5e5e5)" }}>
                {item.name || item.path}
              </div>
              {item.size && (
                <div style={{ fontSize: "12px", marginTop: "8px" }}>
                  ({Math.round(item.size / 1024)} KB)
                </div>
              )}
              {displayUrl && (
                <div style={{ marginTop: "16px" }}>
                  <a
                    href={displayUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--brand, #61afef)",
                      textDecoration: "underline",
                    }}
                  >
                    Open / Download File
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── The todowrite checklist, directly above the input box ──
   Its shape follows Claude Code's todowrite: one list that LIVES in a fixed
   place, rather than a trail left behind in the history. That is why it sits
   in composer-wrap and not inside an agent bubble — bubbles scroll away as
   the conversation continues, and a list whose whole purpose is to be seen
   WHILE working is exactly the one that would vanish first.

   The checkboxes are clickable, and that is deliberate: sometimes an item is
   already done in the user's head before the agent marks it. But the agent
   still OWNS the list — the next todowrite overwrites all of it, manual ticks
   included. That is the correct behaviour (the agent knows the real state),
   and it is said here so nobody reads a self-changing tick as a bug. */
function TodoPanel({ todos, busy, onToggle, onClear }: any) {
  if (!Array.isArray(todos) || todos.length === 0) return null;
  const selesai = todos.filter(
    (t: any) => (t.status || "") === "completed",
  ).length;
  const semuaSelesai = selesai === todos.length;
  // A STALLED list: the agent has stopped but items are still open.
  //
  // This is the most common state and the one that used to have no way out.
  // The run stops midway — cancelled, failed, or the model stopped without
  // answering — and the list stays above the input box forever: the close
  // button only appeared once every item was done, and items that never
  // complete mean the button never arrives. The only way to clear it was to
  // wait for the NEXT todowrite to overwrite it, which may never come.
  const mandek = !busy && !semuaSelesai;
  const canClose = semuaSelesai || mandek;
  return (
    <div className={"todo-panel" + (mandek ? " todo-mandek" : "")}>
      <div className="todo-panel-head">
        <span className="todo-panel-judul">Tugas</span>
        {/* The same slot changes role: while the agent is STILL WORKING it
            shows progress, and as soon as nothing is running — whether
            because everything finished or because the run stopped — it
            becomes the button that closes the list.

            What the `!busy` condition protects: while the agent runs, the
            button stays absent, because one stray click mid-run would delete
            the list the agent is using as its plan, with no way to bring it
            back. Once the agent stops, that risk is gone — all that is left
            is a stale list that needs clearing. */}
        <span className="todo-panel-slot">
          {/* When STALLED, the counter stays next to the button. This is
              exactly the state where the number matters most: "3/7" is the
              only thing that says where the work broke off. Replacing it
              with a button, as in the "all done" state, would take that away
              precisely when it is most needed. */}
          {!semuaSelesai && (
            <span className="todo-panel-hitung">
              {selesai}/{todos.length}
            </span>
          )}
          {canClose && (
            <button
              type="button"
              className="todo-panel-tutup"
              onClick={() => onClear && onClear()}
              title={
                semuaSelesai
                  ? "All done — close the list"
                  : "Run stopped — close the list"
              }
              aria-label="Close task list"
            >
              ✕
            </button>
          )}
        </span>
      </div>
      <div className="todo-panel-daftar">
        {todos.map((t: any, i: number) => {
          const st = t.status || "pending";
          const id = "todo-" + i;
          return (
            <div className={"todo-baris st-" + st} key={i}>
              <input
                type="checkbox"
                id={id}
                checked={st === "completed"}
                onChange={() => onToggle && onToggle(i)}
              />
              <label htmlFor={id}>{t.content}</label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Composer({
  onSend,
  onCancel,
  busy,
  models = [],
  modelVal,
  setModelVal,
  todos = [],
  onToggleTodo,
  onClearTodos,
}: any) {
  const [val, setVal] = useState("");
  const [attachments, setAttachments] = useState<any[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<any>(null);
  const [menu, setMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showMcpMenu, setShowMcpMenu] = useState(false);
  const [mcpServers, setMcpServers] = useState<any[]>([]);

  // One loader, reused: on mount AND when another screen broadcasts an MCP
  // change, so the two views never show a server that has been deleted.
  const loadMcpServers = React.useCallback(async () => {
    if (!window.WOLFSPACE) return;
    try {
      // The server list (config) plus RUNTIME status. `active` used to be
      // hardcoded true, so the badge always read "Connected" — even for a
      // server whose process had not started OR whose every call failed (a
      // revoked token, say: start and handshake go fine, but each API call
      // comes back 401).
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
            ((conf as any).command || "") +
            " " +
            ((conf as any).args ? (conf as any).args.join(" ") : ""),
          // If the server is disabled in the backend, force active = false.
          // Without this, status polling overwrites the toggle's result and
          // the server appears to "come back to life" on its own.
          active: !s.disabled && !!s.ready && s.lastCallOk !== false,
          status: s,
          conf: conf,
        };
      });
      setMcpServers(arr);
    } catch (e) {
      console.error("Error loading MCP servers", e);
    }
  }, []);

  useEffect(() => {
    loadMcpServers();
    window.addEventListener("wolfspace_mcp_changed", loadMcpServers);
    return () =>
      window.removeEventListener("wolfspace_mcp_changed", loadMcpServers);
  }, [loadMcpServers]);

  const [showMcpInput, setShowMcpInput] = useState(false);
  const [mcpInputUrl, setMcpInputUrl] = useState("");
  const [mcpInputToken, setMcpInputToken] = useState("");
  const [mcpInputError, setMcpInputError] = useState("");
  const [mcpInputSuccess, setMcpInputSuccess] = useState("");

  const handleMcpCodeConnect = async (e: any) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const type = mcpInputUrl.trim();
    const envVars = mcpInputToken.trim();

    if (!type) {
      setMcpInputError("Jenis MCP wajib diisi.");
      return;
    }

    setMcpInputError("");
    setMcpInputSuccess("");

    // Single source: see mcpResolvePerintah() in app/Config.tsx. This was
    // duplicated here once, and the two copies drifted apart.
    const _r = mcpResolvePerintah(type);
    let command = _r.command;
    let args = _r.args;
    // Still used below to map per-service env vars.
    const cleanType = String(type || "").toLowerCase();

    // A server name MUST NOT be derived from a raw URL.
    //
    // The old formula: type.split("/").pop().replace(/[^a-zA-Z0-9-]/g,"").
    // For a remote URL carrying credentials in the query string, the last
    // segment is "stream?user=...&token=eyJhbGci...", and stripping the
    // non-alphanumerics COMPACTS that token into a single word which passes
    // as a name. Confirmed in real logs: entries named
    // "streamuserTokeneyJhbGciOiJBMjU2S1ciLCJlbmMi..." — a whole JWT, saved
    // into config/mcp.json AND printed repeatedly to the debug file.
    //
    // For URLs only the HOST is used now (it never carries a secret). For
    // anything that is not a URL, the old behaviour is kept.
    let name;
    if (/^https?:/i.test(type)) {
      let host = "";
      try {
        host = new URL(type).hostname;
      } catch (_) {
        host = "";
      }
      name = (host || "remote").replace(/[^a-zA-Z0-9.-]/g, "").slice(0, 40);
    } else {
      name = type
        .split("/")
        .pop()!
        .replace("server-", "")
        .replace(/[^a-zA-Z0-9-]/g, "");
    }
    if (!name) name = "mcp-" + Date.now().toString(36);

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
        else if (cleanType.includes("penpot"))
          env = { PENPOT_ACCESS_TOKEN: envVars };
        else if (cleanType === "figma") {
          // figma-developer-mcp needs its token via --figma-api-key and a
          // stdout pipe via --stdio.
          args = [
            "-y",
            "figma-developer-mcp",
            "--stdio",
            `--figma-api-key=${envVars}`,
          ];
        } else if (cleanType.startsWith("http")) {
          // Remote server: credentials go as HEADERS through env, NOT pasted
          // into the URL in argv. argv is visible in any process listing and
          // gets recorded with it; env is never logged by mcp-client.
          // This is the path for a BARE token (one that failed JSON.parse
          // above), treated as a bearer. If the user entered JSON, the
          // JSON.parse branch above already used it as env verbatim — and
          // there they can set MCP_HEADERS themselves for non-standard
          // headers.
          env = {
            MCP_HEADERS: JSON.stringify({ Authorization: "Bearer " + envVars }),
          };
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
          setMcpInputError(out.error || "Failed to add the MCP server.");
          return;
        }
      } catch (err) {
        setMcpInputError((err as any).message);
        return;
      }
    }

    const entry = {
      id: name,
      name: name,
      desc:
        ((conf as any).command || "") +
        " " +
        ((conf as any).args ? (conf as any).args.join(" ") : ""),
      active: true,
      conf,
    };

    setMcpServers((prev: any) => [
      ...prev.filter((p: any) => p.id !== name),
      entry,
    ]);
    // The entry above is OPTIMISTIC (green immediately). Refresh from runtime
    // status a moment later so a server that turns out to have failed does not
    // keep showing "Connected" — with enough delay for the MCP process to
    // finish its handshake.
    setTimeout(() => loadMcpServers(), 2500);
    setMcpInputSuccess("✓ MCP server connected and running.");
    setMcpInputUrl("");
    setMcpInputToken("");
    setTimeout(() => {
      setMcpInputSuccess("");
      setShowMcpInput(false);
    }, 2000);
  };

  const [effort, setEffort] = useState(() => {
    try {
      return readEffort(getCloud());
    } catch {
      return 1;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("wolfspace_effort", String(effort));
      const cl = getCloud();
      if (cl) {
        cl.effort = effort;
        setCloudLS(cl);
      }
    } catch (_) {}
  }, [effort]);
  const [switchFlagged, setSwitchFlagged] = useState(false);
  const [soon, setSoon] = useState("");
  const ref = useRef<any>(null);
  const wrapRef = useRef<any>(null);

  useEffect(() => {
    if (!menu) {
      setShowModelMenu(false);
      setShowMcpMenu(false);
    }
  }, [menu]);

  // The limit is READ from CSS rather than restated here. There used to be two
  // numbers — 160px in CSS, 180 here — and the smaller always won, so the
  // difference never meant anything while both looked equally in force.
  const grow = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // "auto" first: without it scrollHeight never SHRINKS when text is
    // deleted, so the box grows once and then refuses to come back down.
    el.style.height = "auto";
    const maks = parseFloat(getComputedStyle(el).maxHeight);
    const tinggi = Number.isFinite(maks)
      ? Math.min(el.scrollHeight, maks)
      : el.scrollHeight;
    el.style.height = tinggi + "px";
  }, []);

  // ── When the height has to be recomputed ──
  //
  // onChange alone is not enough, and that is why the box felt "static":
  //   - text set from outside (WOLFSPACE:set-composer, a paste, restoring a
  //     draft) never passes through onChange at all;
  //   - resizing the window changes line WRAPPING, so the line count changes
  //     without a single keystroke.
  React.useEffect(() => {
    grow();
  }, [val, grow]);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // The element itself is observed, not the window: the composer also
    // narrows when another panel opens or its splitter is dragged — and that
    // produces no window resize event whatsoever.
    //
    // Only the WIDTH triggers a recompute. grow() changes the HEIGHT of the
    // very element being observed, so reacting to height would mean watching
    // its own effect — exactly the shape that produces "ResizeObserver loop
    // completed with undelivered notifications", and in the worst case spins
    // until the window stutters.
    let lebarTerakhir = el.clientWidth;
    const ro = new ResizeObserver(() => {
      const lebar = el.clientWidth;
      if (lebar === lebarTerakhir) return;
      lebarTerakhir = lebar;
      grow();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [grow]);

  // Render-path logging REMOVED. Every console.* in an Electron renderer is
  // serialised and sent over IPC to the main process (main.js forwards it to
  // stdout), so the cost is not merely "writing text". The composer also
  // re-renders every time its parent does — which is every token while the
  // agent works. Observed in the real app: 7 of these lines came out of an
  // idle startup alone, before a single task ran. Debug output like this must
  // not live on a hot path.

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
            // A BRIDGE, not an upload. What comes back is a HANDLE (att_...),
            // not a path. Files used to be written to <WOLFSPACE>/public/
            // uploads/ and their PATH handed to the agent — and once the agent
            // was confined to a single worktree, that path fell outside its
            // scope and the broker refused it. Correct confinement was killing
            // attachments. With a handle, confinement need not be loosened at
            // all.
            //
            // file.name is used, NOT webkitRelativePath: the latter carries
            // directory structure when the user picks a FOLDER, and an address
            // must not cross over. (The bridge trims it again server-side —
            // defence in depth, not a replacement.)
            const payload = {
              name: file.name,
              data: base64,
              type: file.type || null,
            };
            let attHandle = "";
            if (IPC && IPC.invoke) {
              const res = await IPC.invoke("api", {
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
                      // A handle, not a url. previewUrl stays the local object
                      // URL already made from the File — so no file has to land
                      // on disk merely for a preview.
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

  const submit = () => {
    const v = val.trim();
    console.log(
      "[Composer submit] busy:",
      busy,
      "v:",
      v,
      "attachments:",
      attachments.length,
    );
    if ((!v && attachments.length === 0) || busy) return;
    let fullText = v;
    if (attachments.length > 0) {
      // A HANDLE, not a path. This line used to read
      //   "- [Attached]: <path> (… , url: /uploads/…)"
      // and that is what collided attachments with confinement: the agent was
      // told to read a location, and the broker then refused it for being
      // outside the worktree. Now it is given the attachment id; the agent
      // reads it through attachment_read, and there is no file address left
      // to refuse.
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
    // Two arguments: the FIRST for the model (carrying the attachment
    // handles), the SECOND for the user's eyes. Only one used to be sent, so
    // the attachment lines — including att_… handles, which are of no use to a
    // human — landed raw in the chat bubble.
    onSend(fullText, {
      text: v,
      attachments: attachments.map((a: any) => ({
        name: a.name,
        size: a.size,
        type: a.type,
        previewUrl: a.previewUrl,
        ok: !!a.attId,
      })),
    });
    console.log(
      "[Composer submit] setting val to empty string and resetting attachments",
    );
    setVal("");
    setAttachments([]);
    requestAnimationFrame(() => {
      if (ref.current) ref.current.style.height = "auto";
    });
  };

  // Debug val changes
  useEffect(() => {
    console.log("[Composer] val changed to:", val);
  }, [val]);
  useEffect(() => {
    const h = (e: any) => {
      const next = String(e.detail || "");
      setVal(next);
      requestAnimationFrame(() => {
        grow();
        ref.current?.focus();
      });
    };
    window.addEventListener("WOLFSPACE:set-composer", h);
    return () => window.removeEventListener("WOLFSPACE:set-composer", h);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const h = (e: any) => {
      // Keep menu open when clicking sidebar controls (e.g. Visual Picker button)
      // or when the visual picker overlay is active, so the user can select
      // elements inside the + menu with the picker.
      const inSidebar = e.target.closest && e.target.closest(".sidebar");
      if (inSidebar) return;
      if (document.body.classList.contains("vp-on")) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target))
        setMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menu]);
  const notYet = (name: any) => {
    setMenu(false);
    setSoon(name + " segera hadir.");
    setTimeout(() => setSoon(""), 2600);
  };
  return (
    <div className="composer-wrap">
      <TodoPanel
        todos={todos}
        busy={busy}
        onToggle={onToggleTodo}
        onClear={onClearTodos}
      />
      <div className="composer">
        <input
          type="file"
          id="file-upload-input"
          multiple
          style={{ display: "none" }}
          onChange={handleAttachmentSelect}
        />
        <input
          type="file"
          id="folder-upload-input"
          webkitdirectory="true"
          directory="true"
          multiple
          style={{ display: "none" }}
          onChange={handleAttachmentSelect}
        />
        <div className="composer-input-col">
          {attachments.length > 0 && (
            <div className="composer-attachments">
              {attachments.map((att: any) => {
                const isImg =
                  /\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i.test(
                    att.name || att.path,
                  ) ||
                  (att.type && att.type.startsWith("image/"));
                const isVid =
                  /\.(mp4|webm|mov|mkv)$/i.test(att.name || att.path) ||
                  (att.type && att.type.startsWith("video/"));
                const isCode =
                  att.snippet ||
                  /\.(js|py|jsx|ts|tsx|html|css|json|md|txt|sql|java|c|cpp|h|rust|go|sh|yml|yaml)$/i.test(
                    att.name || att.path,
                  );
                const displayUrl = att.previewUrl || att.url;

                return (
                  <div
                    key={att.id}
                    className="composer-attachment-item"
                    title={att.path + " (Click to view)"}
                    onClick={() => {
                      if (att.previewUrl || att.url || att.snippet) {
                        setPreviewAttachment(att);
                      }
                    }}
                    style={{
                      width: "60px",
                      height: "60px",
                      padding: isImg && displayUrl ? "0" : "6px",
                      overflow: "hidden",
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      background: "var(--surface-2, #161b22)",
                      border: "1px solid var(--line-strong, #30363d)",
                      borderRadius: "8px",
                      cursor:
                        att.previewUrl || att.url || att.snippet
                          ? "pointer"
                          : "default",
                    }}
                  >
                    {isImg && displayUrl ? (
                      <img
                        src={displayUrl}
                        alt={att.name || att.path}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: "8px",
                        }}
                      />
                    ) : isVid && displayUrl ? (
                      <video
                        src={displayUrl}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: "8px",
                        }}
                        muted
                      />
                    ) : att.snippet ? (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          padding: "4px",
                          fontSize: "6.5px",
                          fontFamily: "monospace",
                          color: "#4ec9b0",
                          overflow: "hidden",
                          lineHeight: "1.25",
                          wordBreak: "break-all",
                          background: "#0d1117",
                          borderRadius: "6px",
                          textAlign: "left",
                        }}
                      >
                        {att.snippet}
                      </div>
                    ) : (
                      <>
                        <div className="composer-attachment-icon">
                          {att.status === "uploading"
                            ? "⏳"
                            : att.status === "error"
                              ? "⚠️"
                              : is3DFile(att.name || att.path)
                                ? "🧊"
                                : isCode
                                  ? "💻"
                                  : "📄"}
                        </div>
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
                          {att.name || att.path}
                        </div>
                      </>
                    )}

                    {att.status === "uploading" && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "rgba(0,0,0,0.5)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "8px",
                          fontSize: "14px",
                        }}
                      >
                        ⏳
                      </div>
                    )}
                    {att.status === "error" && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "rgba(248,113,113,0.3)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "8px",
                          fontSize: "14px",
                        }}
                        title={att.error}
                      >
                        ⚠️
                      </div>
                    )}

                    <button
                      type="button"
                      className="composer-attachment-remove"
                      onClick={(e: any) => {
                        e.stopPropagation();
                        setAttachments((p: any) =>
                          p.filter((x: any) => x.id !== att.id),
                        );
                      }}
                      title={att.status === "error" ? att.error : "Remove"}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <textarea
            ref={ref}
            rows={1}
            value={val}
            placeholder={
              busy
                ? "Continue the conversation…"
                : val.includes("/")
                  ? "Keep typing commands…"
                  : "What would you like to build today?"
            }
            onChange={(e: any) => {
              console.log("[Textarea] value changed:", e.target.value);
              setVal(e.target.value);
              grow();
            }}
            onKeyDown={(e: any) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                console.log("[Textarea] Enter pressed, calling submit");
                submit();
              }
              if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                setVal("");
                requestAnimationFrame(() => {
                  if (ref.current) ref.current.style.height = "auto";
                });
              }
              if (e.key === "/" && val === "") {
                console.log("[Textarea] / pressed, trigger command mode");
              }
            }}
            onFocus={() => console.log("[Textarea] focused")}
            onBlur={() => console.log("[Textarea] blurred")}
          />
        </div>
        <div
          className="picker-toolbar"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div className="composer-add-wrap" ref={wrapRef}>
            <div className="composer-action-btns">
              <button
                className={"composer-add" + (menu ? " open" : "")}
                title="Add"
                onClick={() => {
                  setMenu((m: any) => !m);
                  setShowModelMenu(false);
                  setShowMcpMenu(false);
                }}
              >
                {MI.plus}
              </button>
            </div>
            {menu && (
              <div
                className="am-menu"
                onMouseDown={(e: any) => e.stopPropagation()}
              >
                <div className="am-section-label">Context</div>
                <button
                  className="am-item"
                  onClick={() => {
                    setMenu(false);
                    document.getElementById("file-upload-input")?.click();
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
                      {models.find((m: any) => m.value === modelVal)?.label ||
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
                      {models.map((m: any) => (
                        <button
                          key={m.value}
                          className="am-item"
                          style={{ padding: "8px 12px" }}
                          onClick={(e: any) => {
                            e.stopPropagation();
                            if (setModelVal) setModelVal(m.value);
                            setShowModelMenu(false);
                            // Keep main + menu open so user can continue configuring other options
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
                              {m.label}
                              {m.value === modelVal && <span>✓</span>}
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
                  onClick={(e: any) => {
                    e.stopPropagation();
                    setEffort((effort + 1) % 3);
                  }}
                >
                  <span>
                    Effort (
                    {effort === 0 ? "Low" : effort === 1 ? "Medium" : "High"})
                  </span>
                  <span className="am-item-right">
                    <div className="am-slider">
                      <div
                        className={
                          "am-slider-dot" + (effort >= 0 ? " active" : "")
                        }
                      ></div>
                      <div
                        className={
                          "am-slider-dot" + (effort >= 1 ? " active" : "")
                        }
                      ></div>
                      <div
                        className={
                          "am-slider-dot" + (effort >= 2 ? " active" : "")
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
                      // Use the SINGLE loader; do not re-implement it. An
                      // inline copy here used to map `active: true` and
                      // OVERWRITE the correct runtime status every time the
                      // menu opened — that duplication is what kept bringing
                      // the MCP display bug back.
                      if (!showMcpMenu) loadMcpServers();
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
                      {mcpServers.map((srv) => (
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
                              // MCP servers are no longer started when
                              // WOLFSPACE starts — starting one is an explicit
                              // action here.
                              //
                              // Two DIFFERENT intents are separated, because
                              // both used to fall through to /mcp/toggle:
                              //   - not running & not disabled -> CONNECT
                              //     (just start it; leave config alone)
                              //   - otherwise -> TOGGLE enable/disable, which
                              //     does write `disabled` into mcp.json
                              // Without that split, merely connecting to a
                              // server also edited the config file.
                              const perluConnect =
                                !srv.active &&
                                !(srv.status && srv.status.disabled);
                              const jalur = perluConnect
                                ? "/mcp/connect"
                                : "/mcp/toggle";
                              const muatan = perluConnect
                                ? { name: srv.id }
                                : { name: srv.id, enabled: !srv.active };
                              // Optimistic ONLY while connecting; the real
                              // result is refreshed from runtime status.
                              setMcpServers((prev: any) =>
                                prev.map((item: any) =>
                                  item.id === srv.id
                                    ? {
                                        ...item,
                                        active: !srv.active,
                                        // Connecting is not "connected".
                                        //
                                        // Measured on the real path: connect
                                        // took 4302ms (npx + handshake), and
                                        // can reach HANDSHAKE_TIMEOUT_MS of 60
                                        // seconds for a troubled server. The
                                        // event loop is NOT blocked during any
                                        // of it (peak lag 55ms over 276 ticks)
                                        // — so this is not a hang. But the
                                        // badge used to go green "✓ Connected"
                                        // straight away while the handshake
                                        // was still running. The user saw
                                        // "connected" then a long silence, and
                                        // that is what read as a freeze.
                                        connecting: perluConnect,
                                      }
                                    : item,
                                ),
                              );
                              try {
                                if (
                                  window.WOLFSPACE &&
                                  window.WOLFSPACE.invoke
                                ) {
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
                                // In finally, NOT only on the success path.
                                // If the request fails, the "⟳ Connecting…"
                                // badge would stick forever because nothing
                                // refreshes it from runtime status — and a
                                // server that failed is precisely the one that
                                // needs to look failed.
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
                                <span
                                  style={{ fontWeight: 500, color: "#fff" }}
                                >
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
                                    // Distinguish the CAUSE; do not flatten it
                                    // into "Disabled". A server whose calls
                                    // fail (a revoked token, say) is not the
                                    // same as one that was never started. Both
                                    // used to show green.
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
                                      // Broadcast so other screens (Screens.tsx / pickerMcp) stay in sync.
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
                                            setMcpServers((prev: any) =>
                                              prev.filter(
                                                (item: any) =>
                                                  item.id !== srv.id,
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
                                        setMcpServers((prev: any) =>
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
                        {!showMcpInput ? (
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
                              setShowMcpInput(true);
                              setMcpInputError("");
                              setMcpInputSuccess("");
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
                                value={mcpInputUrl}
                                onChange={(e: any) => {
                                  setMcpInputUrl(e.target.value);
                                  setMcpInputError("");
                                  setMcpInputSuccess("");
                                }}
                                onKeyDown={(e: any) => {
                                  if (e.key === "Escape") {
                                    setShowMcpInput(false);
                                    setMcpInputUrl("");
                                    setMcpInputToken("");
                                    setMcpInputError("");
                                  }
                                }}
                                placeholder="Jenis MCP (contoh: github, brave-search, sqlite)"
                                style={{
                                  width: "100%",
                                  background: "rgba(255,255,255,0.04)",
                                  border:
                                    mcpInputError && !mcpInputUrl.trim()
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
                                value={mcpInputToken}
                                onChange={(e: any) => {
                                  setMcpInputToken(e.target.value);
                                  setMcpInputError("");
                                  setMcpInputSuccess("");
                                }}
                                onKeyDown={(e: any) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleMcpCodeConnect(e);
                                  }
                                  if (e.key === "Escape") {
                                    setShowMcpInput(false);
                                    setMcpInputUrl("");
                                    setMcpInputToken("");
                                    setMcpInputError("");
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
                            {mcpInputError && (
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
                                {mcpInputError}
                              </div>
                            )}
                            {mcpInputSuccess && (
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
                                {mcpInputSuccess}
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
                                  setShowMcpInput(false);
                                  setMcpInputUrl("");
                                  setMcpInputToken("");
                                  setMcpInputError("");
                                  setMcpInputSuccess("");
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
                                onClick={handleMcpCodeConnect}
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
          </div>
          <button
            className={"send-btn" + (busy ? " cancel" : "")}
            onClick={busy ? onCancel : submit}
            disabled={!busy && !val.trim() && attachments.length === 0}
            onClickCapture={(e: any) => {
              console.log(
                "[Send button] clicked, busy:",
                busy,
                "disabled:",
                !busy && !val.trim() && attachments.length === 0,
              );
            }}
          >
            {busy ? <Icon.square /> : <Icon.send />}
          </button>
        </div>
      </div>
      <div className="composer-hint">
        {soon ? (
          <b style={{ color: "var(--brand)" }}>{soon}</b>
        ) : (
          <>
            <span>
              Press <kbd>Shift+Enter</kbd> for a new line
            </span>
            <span>•</span>
            <span>
              Press <kbd>Ctrl+K</kbd> to clear
            </span>
            <span>•</span>
            <span>
              Type <kbd>/</kbd> for commands
            </span>
          </>
        )}
      </div>
      <LightboxModal
        item={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    </div>
  );
}

/* Visual Picker & Visual Draw moved to public/app/VisualTools.tsx (APP_MODULES). */
