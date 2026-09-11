// Components.tsx — the chat surface: the message list, the composer, the top
// bar, attachments, and the GitHub panel.
//
// ROLE IN THE SYSTEM. This is where the user actually types and reads. Blocks()
// near the middle decides how each part of a reply is rendered — prose, a code
// block, or a diagram (DiagramBlock, from CodeBlocks.tsx).
//
// See public/app.tsx for how the renderer is assembled and why load order
// matters.

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
// WHY. app.tsx renders the whole history: {messages.map((m,i) => <Message/>)}.
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
            {/* The SAME chip as the composer, minus the remove button -- a sent
                attachment cannot be unsent. Two different looks for the same
                file before and after sending was the odd part. */}
            {msg.attachments.map((a: any, i: number) => (
              <AttachmentChip
                key={i}
                att={
                  a.ok ? a : { ...a, status: "error", error: "Handoff failed" }
                }
              />
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

/* --------------------------- Attachment chips --------------------------- */
//
// WHAT WAS WRONG. Every attachment was forced into the same 60x60 square, and a
// text file filled that square with the first ~200 characters of its own source
// at 6.5px with `word-break: break-all`. A staged index.html read as a grey
// tile of shredded "<!DOCTYPE html> <ht ml lang= "en"> <he ad> <met" -- no
// name, no type, no size, nothing anyone could act on. It also hardcoded
// #4ec9b0 and #0d1117, so it ignored the theme entirely.
//
// WHAT THE PATTERN ACTUALLY IS, from how this problem is solved elsewhere:
// documents are an ICON ROW -- icon, filename, and a quiet subtitle of type and
// size -- while images and video are THUMBNAILS. assistant-ui describes exactly
// that split ("images render as filled thumbnail buttons with name and size
// overlaid, while documents/files appear as icon rows"), and both it and
// ChatGPT's composer keep the same three staged states: a spinner while
// uploading, an error state, and a remove affordance.
//
// One more detail worth copying: the EXTENSION STAYS VISIBLE when the name is
// too long. A plain ellipsis eats it, and ".html" is the part that says what
// the file is. So the name is split and only the stem is allowed to truncate.

/** The icons are the material-icon-theme set already vendored for the tree. */
function ikonBerkas(nama: string) {
  const ext = String(nama || "")
    .split(".")
    .pop()!
    .toLowerCase();
  return (typeof IKON_BAHASA !== "undefined" && IKON_BAHASA[ext]) || "";
}

/** "4.2 KB". Bytes below a kilobyte stay bytes; nobody wants "0.0 KB". */
function ukuranBerkas(n?: number) {
  if (typeof n !== "number" || !isFinite(n) || n < 0) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}

/** Stem and extension, kept apart so only the stem is allowed to truncate. */
function belahNama(nama: string) {
  const n = String(nama || "file");
  const i = n.lastIndexOf(".");
  return i > 0
    ? { batang: n.slice(0, i), ekor: n.slice(i) }
    : { batang: n, ekor: "" };
}

/**
 * The file's own icon, or a generic document outline when the type is unknown.
 *
 * Used by the chip AND by the preview modal, which previously showed 📄 for
 * every file type there is.
 */
function IkonLampiran({ nama }: any) {
  const svg = ikonBerkas(nama);
  // The vendored icons are SVG source strings — the file tree renders them the
  // same way.
  if (svg) return <span dangerouslySetInnerHTML={{ __html: svg }} />;
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// ── A FILE ALREADY IN THE PROJECT, DRAGGED INTO THE CHAT ────────────────────
//
// This is NOT an attachment, and keeping the two apart is the whole point.
//
// An attachment is a file from OUTSIDE the project: it is uploaded, it gets an
// att_… handle, and the agent reads it through attachment_read because it has
// no address inside the worktree. A file dragged out of an editor tab is the
// opposite — it is already in the workspace, at a path the agent's own read and
// edit tools can reach. Routing it through the upload pipeline would copy it,
// give the agent a handle to a duplicate, and leave edits landing on the copy
// rather than on the file the user is looking at.
//
// So a reference carries a PATH and nothing else, and it travels in its own
// state alongside the attachments rather than mixed into them.
const DRAG_JENIS_BERKAS = "application/x-wolfspace-file";

/** The chip object for one referenced file. `rel` is workspace-relative. */
function fileRefDari(rel: any) {
  const p = String(rel || "").replace(/\\/g, "/");
  if (!p) return null;
  const potongan = p.split("/");
  return {
    id: "ref:" + p,
    kind: "ref",
    path: p,
    name: potongan[potongan.length - 1] || p,
    dir: potongan.slice(0, -1).join("/"),
  };
}

/**
 * Read a dropped editor tab, if that is what was dropped.
 *
 * The dedicated MIME type is what keeps this from firing on ordinary text: the
 * tab strip already drags `text/plain` for REORDERING, and accepting that here
 * would turn every tab drag into an attempt to attach something.
 */
function fileRefDariDrop(dataTransfer: any) {
  if (!dataTransfer) return null;
  const rel = dataTransfer.getData(DRAG_JENIS_BERKAS);
  return rel ? fileRefDari(rel) : null;
}

/** Add one reference, without duplicating a file that is already listed. */
function tambahFileRef(daftar: any, ref: any) {
  if (!ref) return daftar;
  return daftar.some((r: any) => r.id === ref.id) ? daftar : [...daftar, ref];
}

/**
 * The block the MODEL reads. Paths, workspace-relative, one per line.
 *
 * Deliberately not the `[Terlampir] … id: att_…` shape used for uploads: that
 * line tells the agent to use attachment_read, which is exactly wrong for a
 * file it can simply open.
 */
function blokFileRef(refs: any) {
  if (!refs || !refs.length) return "";
  return (
    "Files in context (already in the workspace, open them directly):\n" +
    refs.map((r: any) => "- " + r.path).join("\n")
  );
}

/** Join the user's text with the reference block, skipping empties. */
function gabungDenganRef(teks: any, refs: any) {
  const blok = blokFileRef(refs);
  if (!blok) return teks;
  return teks ? teks + "\n\n" + blok : blok;
}

function AttachmentChip({ att, onRemove, onOpen }: any) {
  // A REFERENCE, not an upload: no size, no progress, no preview. The subtitle
  // is the folder it lives in, which is the one thing a bare filename loses.
  if (att && att.kind === "ref") {
    return (
      // lam-berkas carries the row layout; lam-ref only marks it as a
      // reference, so the two kinds sit on one line without drifting apart.
      <div className="lam lam-berkas lam-ref" title={att.path}>
        <span className="lam-ikon">
          <IkonLampiran nama={att.name} />
        </span>
        <span className="lam-teks">
          <span className="lam-nama">{att.name}</span>
          <span className="lam-bawah">{att.dir || "in project"}</span>
        </span>
        {onRemove ? (
          <button
            type="button"
            className="lam-buang"
            title="Remove"
            aria-label={"Remove " + att.name}
            onClick={(e: any) => {
              e.stopPropagation();
              onRemove(att);
            }}
          >
            <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </button>
        ) : null}
      </div>
    );
  }
  const nama = att.name || att.path || "file";
  const isImg =
    /\.(png|jpe?g|webp|gif|svg|bmp|ico|avif)$/i.test(nama) ||
    (att.type && att.type.startsWith("image/"));
  const isVid =
    /\.(mp4|webm|mov|mkv)$/i.test(nama) ||
    (att.type && att.type.startsWith("video/"));
  const url = att.previewUrl || att.url;
  const { batang, ekor } = belahNama(nama);
  const ext = ekor.replace(".", "").toUpperCase();
  const bisaBuka = Boolean(url || att.snippet);
  const gagal = att.status === "error";
  const naik = att.status === "uploading";

  // The subtitle carries the state when there is one, because that is the line
  // the eye is already on -- a separate error badge elsewhere is missed.
  const bawah = gagal
    ? att.error || "Upload failed"
    : naik
      ? "Uploading…"
      : [ext, ukuranBerkas(att.size)].filter(Boolean).join(" · ");

  const buang = onRemove ? (
    <button
      type="button"
      className="lam-buang"
      title="Remove"
      aria-label={"Remove " + nama}
      onClick={(e: any) => {
        e.stopPropagation();
        onRemove(att);
      }}
    >
      <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
        <path
          d="M4 4l8 8M12 4l-8 8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </button>
  ) : null;

  // ── IMAGES AND VIDEO: A THUMBNAIL ──
  // The picture is the label. A filename under it would say less than the
  // picture already does, so it moves to a hover strip and the tooltip.
  if ((isImg || isVid) && url) {
    return (
      <div
        className={"lam lam-gambar" + (gagal ? " lam-error" : "")}
        title={nama}
        onClick={() => bisaBuka && onOpen && onOpen(att)}
      >
        {isVid ? <video src={url} muted /> : <img src={url} alt={nama} />}
        <span className="lam-sampul">{nama}</span>
        {naik ? <span className="lam-garis" /> : null}
        {buang}
      </div>
    );
  }

  // ── EVERYTHING ELSE: AN ICON ROW ──
  const svg = ikonBerkas(nama);
  return (
    <div
      className={
        "lam lam-berkas" +
        (gagal ? " lam-error" : "") +
        (bisaBuka ? " lam-clickable" : "")
      }
      title={nama}
      onClick={() => bisaBuka && onOpen && onOpen(att)}
    >
      <span className="lam-ikon">
        <IkonLampiran nama={nama} />
      </span>
      <span className="lam-teks">
        <span className="lam-nama">
          <span className="lam-batang">{batang}</span>
          <span className="lam-ekor">{ekor}</span>
        </span>
        <span className="lam-bawah">{bawah}</span>
      </span>
      {naik ? <span className="lam-garis" /> : null}
      {buang}
    </div>
  );
}

/**
 * The agent saying something without being asked.
 *
 * ── IT STARTS BY ITSELF; THERE IS NOTHING TO SWITCH ON ───────────────────────
 *
 * An earlier version put a "Watch this folder" toggle here. That was wrong: a
 * reactive agent you have to enable is not reactive, it is a feature with a
 * setup step. The watcher starts with the server (config.json → reaktif) and
 * this component renders NOTHING until there is an actual report — no bar, no
 * indicator, no standing control.
 *
 * ── WHY IT POLLS INSTEAD OF BEING PUSHED ─────────────────────────────────────
 *
 * A push would need a third stream channel, and that means main.ts,
 * backend-host.cjs, the preload bridge and the in-process fallback — four
 * surfaces to keep in step, for something that speaks at most twelve times an
 * hour. One small request every twenty seconds costs nothing measurable, works
 * the same in the desktop app and in a browser, and adds no contract.
 */
function ReaktifBar() {
  const [laporan, setLaporan] = useState<any[]>([]);
  const [sisa, setSisa] = useState<any>(null);

  useEffect(() => {
    let hidup = true;
    const tarik = async () => {
      try {
        const j = await (await fetch("/reaktif/status")).json();
        if (!hidup) return;
        setSisa(j);
        // The server hands each report over ONCE, so anything that arrives
        // here has to be kept — dropping it loses it for good.
        if (j.laporan && j.laporan.length) {
          setLaporan((p: any) => [...j.laporan, ...p].slice(0, 5));
        }
      } catch (_) {}
    };
    void tarik();
    const jam = setInterval(tarik, 20000);
    return () => {
      hidup = false;
      clearInterval(jam);
    };
  }, []);

  // NOTHING ON SCREEN WHEN THERE IS NOTHING TO SAY. A permanent strip saying
  // "watching…" is the kind of ambient noise that gets tuned out, and then the
  // one time it matters it is tuned out too.
  if (!laporan.length) return null;

  const berhenti = async () => {
    setLaporan([]);
    try {
      await fetch("/reaktif/aktif", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktif: false }),
      });
    } catch (_) {}
  };

  return (
    <div className="rk-bar">
      {laporan.map((l: any, i: number) => (
        <div className="rk-lapor" key={l.ts + "-" + i}>
          <span className="rk-lapor-ikon">
            <IkonTingkat jenis="info" kecil />
          </span>
          <div className="rk-lapor-isi">
            <div className="rk-lapor-teks">{l.teks}</div>
            <div className="rk-lapor-kaki">
              {(l.berkas || []).length} file
              {(l.berkas || []).length === 1 ? "" : "s"} changed ·{" "}
              {new Date(l.ts).toLocaleTimeString()} · the agent only read them
              {sisa && sisa.maksPerJam
                ? " · " + sisa.dalamJam + "/" + sisa.maksPerJam + " this hour"
                : ""}
            </div>
          </div>
          {/* The way out, offered where the interruption happened rather than
              in a settings panel this would never send anyone to. */}
          <button
            type="button"
            className="rk-tutup"
            title="Stop the agent watching this folder"
            onClick={berhenti}
          >
            stop
          </button>
          <button
            type="button"
            className="rk-tutup"
            title="Dismiss"
            onClick={() =>
              setLaporan((p: any) => p.filter((x: any) => x !== l))
            }
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

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

/**
 * Private and public, drawn — a padlock and an open book.
 *
 * These are the shapes GitHub itself uses for the two states, so the meaning is
 * already learned. Drawn rather than typed for the same reason the severity
 * icons are: a glyph arrives at whatever optical size the font decides.
 */
function IkonRepo({ pribadi }: any) {
  const b = {
    width: 15,
    height: 15,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (pribadi)
    return (
      <svg {...b}>
        <rect x="3" y="7" width="10" height="7" rx="1.5" />
        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      </svg>
    );
  return (
    <svg {...b}>
      <path d="M2.5 3.5A1.5 1.5 0 0 1 4 2h3.5v11H4a1.5 1.5 0 0 0-1.5 1.5z" />
      <path d="M13.5 3.5A1.5 1.5 0 0 0 12 2H8.5v11H12a1.5 1.5 0 0 1 1.5 1.5z" />
    </svg>
  );
}

/**
 * Connect GitHub, then pick a repository and a branch.
 *
 * READS EXISTING REPOSITORIES, and creates new ones -- nothing in between.
 * The linked repo is read through the API when the agent needs it; nothing is
 * cloned. agent/tools/git-tool.ts has no network operations at all -- its own
 * comment says "push/pull/fetch/clone/remote-set DO NOT EXIST" -- and reading
 * over HTTP leaves that decision untouched.
 *
 * The one exception is creating a repository, which is a write and is named as
 * one here rather than hidden behind "read-only". No EXISTING repository is
 * ever modified: no push, no commit, no branch, no delete.
 *
 * The token is posted once and never comes back: /github/status answers whether
 * a connection exists and who is signed in, not what the credential is.
 */
function GithubPanel({ onClose }: any) {
  const [keadaan, setKeadaan] = useState<any>(null);
  const [token, setToken] = useState("");
  // The device-flow screen: the code GitHub gave, and where to type it.
  const [masuk, setMasuk] = useState<any>(null);
  const [pakaiToken, setPakaiToken] = useState(false);
  // The browser sign-in, once started: the panel is waiting for the user to
  // come back from GitHub's own Authorize page.
  const [menungguWeb, setMenungguWeb] = useState(false);
  const [pakaiKode, setPakaiKode] = useState(false);
  // Someone who deliberately wants to sign in as their OWN OAuth App rather
  // than the one shipped with WOLFSPACE.
  const [pakaiAppSendiri, setPakaiAppSendiri] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [disalin, setDisalin] = useState(false);
  // The new-repository form, and its fields.
  const [buat, setBuat] = useState(false);
  const [namaBaru, setNamaBaru] = useState("");
  const [ketBaru, setKetBaru] = useState("");
  const [pribadiBaru, setPribadiBaru] = useState(true);
  // Prefilled with what most accounts already produce, so the common case
  // needs no rename request at all.
  const [cabangBaru, setCabangBaru] = useState("main");
  // The right-click menu: which row, and where to draw it.
  const [menu, setMenu] = useState<any>(null);
  const menuRef = useRef<any>(null);
  // Renaming happens in place on the row; deleting opens its own confirmation,
  // because the two decisions are not the same size.
  const [ubahNama, setUbahNama] = useState<any>(null);
  const [namaUbah, setNamaUbah] = useState("");
  const [hapus, setHapus] = useState<any>(null);
  const [ketikNama, setKetikNama] = useState("");
  const [repo, setRepo] = useState<any[]>([]);
  const [cabang, setCabang] = useState<string[]>([]);
  const [pilih, setPilih] = useState<any>(null);
  const [galat, setGalat] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(async () => {
    try {
      const j = await (await fetch("/github/status")).json();
      setKeadaan(j);
      // A connection made before the account was recorded has a token and no
      // name. One request backfills it, and only ever runs once.
      if (j.tersambung && !j.akun) {
        try {
          const a = await (await fetch("/github/account")).json();
          if (a.ok) setKeadaan({ ...j, akun: a.akun });
        } catch (_) {}
      }
      if (j.tersambung) {
        const r = await (await fetch("/github/repos")).json();
        if (r.ok) setRepo(r.repo || []);
        else setGalat(r.error || "");
      }
    } catch (e: any) {
      setGalat(e.message);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  // POLLED FROM HERE, not awaited on the server. Each request is short; this
  // repeats on the interval GitHub asked for. `slow_down` is not an error — it
  // is GitHub asking for a longer gap, so it widens the interval instead of
  // being reported.
  useEffect(() => {
    if (!masuk) return;
    let hidup = true;
    let jeda = (masuk.jeda || 5) * 1000;
    let jam: any;
    const tik = async () => {
      if (!hidup) return;
      try {
        const r = await (
          await fetch("/github/device/poll", { method: "POST" })
        ).json();
        if (!hidup) return;
        if (!r.ok) {
          setGalat(r.error || "sign-in failed");
          setMasuk(null);
          return;
        }
        if (r.selesai) {
          setMasuk(null);
          await muat();
          return;
        }
        if (r.jeda) jeda = r.jeda * 1000;
      } catch (_) {}
      jam = setTimeout(tik, jeda);
    };
    jam = setTimeout(tik, jeda);
    return () => {
      hidup = false;
      clearTimeout(jam);
    };
  }, [masuk]);

  // ── THE BROWSER SIGN-IN ──
  //
  // Start opens GitHub's Authorize page in the real browser and returns at
  // once; the answer arrives at a loopback callback the backend listens on for
  // this sign-in only. Polling here is what turns that into a screen.
  useEffect(() => {
    if (!menungguWeb) return;
    let hidup = true;
    let jam: any;
    const tik = async () => {
      if (!hidup) return;
      try {
        const r = await (await fetch("/github/web/poll")).json();
        if (!hidup) return;
        if (r.keadaan === "selesai") {
          setMenungguWeb(false);
          await muat();
          return;
        }
        if (r.keadaan === "gagal") {
          setGalat(r.galat || "sign-in failed");
          setMenungguWeb(false);
          return;
        }
      } catch (_) {}
      jam = setTimeout(tik, 1500);
    };
    jam = setTimeout(tik, 1500);
    return () => {
      hidup = false;
      clearTimeout(jam);
    };
  }, [menungguWeb, muat]);

  /**
   * Signing out, and everything on screen that belonged to that account.
   *
   * Clearing the React state matters as much as clearing the server's: the repo
   * list is already rendered, and leaving it there would show the previous
   * account's repositories -- private ones included -- to whoever signs in next.
   */
  const putus = async () => {
    setGalat("");
    setRepo([]);
    setPilih(null);
    setCabang([]);
    setBuat(false);
    await fetch("/github/disconnect", { method: "POST" });
    await muat();
  };

  // `ganti` asks GitHub for the account picker. Without it, signing in again
  // comes straight back with the same account and the switch looks broken.
  const mulaiWeb = async (ganti?: boolean) => {
    setSibuk(true);
    setGalat("");
    try {
      const r = await (
        await fetch("/github/web/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ganti: Boolean(ganti) }),
        })
      ).json();
      if (!r.ok) setGalat(r.error || "could not start sign-in");
      else setMenungguWeb(true);
    } catch (e: any) {
      setGalat(e.message);
    } finally {
      setSibuk(false);
    }
  };

  const mulaiMasuk = async () => {
    setSibuk(true);
    setGalat("");
    try {
      const r = await (
        await fetch("/github/device/start", { method: "POST" })
      ).json();
      if (!r.ok) setGalat(r.error || "could not start sign-in");
      else setMasuk(r);
    } catch (e: any) {
      setGalat(e.message);
    } finally {
      setSibuk(false);
    }
  };

  const simpanClientId = async () => {
    setGalat("");
    await fetch("/github/client-id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      }),
    });
    setClientId("");
    setClientSecret("");
    await muat();
  };

  const sambung = async () => {
    setSibuk(true);
    setGalat("");
    try {
      const r = await (
        await fetch("/github/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token.trim() }),
        })
      ).json();
      if (!r.ok) setGalat(r.error || "connection refused");
      else {
        setToken("");
        await muat();
      }
    } catch (e: any) {
      setGalat(e.message);
    } finally {
      setSibuk(false);
    }
  };

  /** Switching accounts is a sign-out followed by a sign-in that asks who. */
  const gantiAkun = async () => {
    await putus();
    await mulaiWeb(true);
  };

  const buatRepo = async () => {
    setSibuk(true);
    setGalat("");
    try {
      const r = await (
        await fetch("/github/repos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nama: namaBaru.trim(),
            ket: ketBaru.trim(),
            pribadi: pribadiBaru,
            cabang: cabangBaru.trim(),
          }),
        })
      ).json();
      if (!r.ok) {
        setGalat(r.error || "could not create the repository");
        return;
      }
      setBuat(false);
      setNamaBaru("");
      setKetBaru("");
      // Straight into picking a branch for it. Creating a repository and then
      // having to find it in the list is a step with no purpose.
      await muat();
      await bukaRepo(r.repo);
    } catch (e: any) {
      setGalat(e.message);
    } finally {
      setSibuk(false);
    }
  };

  // ── KEEPING THE MENU ON SCREEN ──
  //
  // Right-clicking the last row in a long list puts the cursor near the bottom
  // of the window, and a menu drawn downwards from there is cut off — the
  // Delete item, which is the one below Rename, is the first thing to go.
  //
  // MEASURED rather than estimated: the menu's real size is only known once it
  // exists, and it changes with the note about delete access. useLayoutEffect
  // runs before the browser paints, so the correction is never visible.
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    const M = 8; // breathing room, so it never touches the edge
    const kiri = Math.max(
      M,
      Math.min(menu.kiri, window.innerWidth - r.width - M),
    );
    // Flipped ABOVE the cursor when there is no room below, rather than merely
    // pushed up: a menu that overlaps the row it belongs to hides what it is
    // acting on.
    const muatBawah = menu.atas + r.height + M <= window.innerHeight;
    const atas = muatBawah ? menu.atas : Math.max(M, menu.atas - r.height);
    if (kiri !== menu.kiri || atas !== menu.atas) {
      setMenu((m: any) => (m ? { ...m, kiri, atas } : m));
    }
  }, [menu]);

  // Escape closes whichever popup is open, from anywhere. A menu that can
  // only be dismissed by clicking exactly the right place is a menu people
  // click through.
  useEffect(() => {
    if (!menu && !hapus) return;
    const h = (e: any) => {
      if (e.key !== "Escape") return;
      setMenu(null);
      setHapus(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [menu, hapus]);

  const kirimGanti = async () => {
    setSibuk(true);
    setGalat("");
    try {
      const r = await (
        await fetch("/github/repo/rename", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner: ubahNama.owner,
            repo: ubahNama.repo,
            nama: namaUbah.trim(),
          }),
        })
      ).json();
      if (!r.ok) setGalat(r.error || "could not rename it");
      else {
        setUbahNama(null);
        await muat();
      }
    } catch (e: any) {
      setGalat(e.message);
    } finally {
      setSibuk(false);
    }
  };

  const kirimHapus = async () => {
    setSibuk(true);
    setGalat("");
    try {
      const r = await (
        await fetch("/github/repo/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner: hapus.owner,
            repo: hapus.repo,
            // Sent WITH the request. A server that deleted on the strength of
            // an earlier confirmation would delete whatever is named next.
            konfirmasi: ketikNama.trim(),
          }),
        })
      ).json();
      if (!r.ok) setGalat(r.error || "could not delete it");
      else {
        setHapus(null);
        setKetikNama("");
        await muat();
      }
    } catch (e: any) {
      setGalat(e.message);
    } finally {
      setSibuk(false);
    }
  };

  const bukaRepo = async (x: any) => {
    setPilih(x);
    setCabang([]);
    setGalat("");
    try {
      const r = await (
        await fetch(
          "/github/branches?owner=" +
            encodeURIComponent(x.owner) +
            "&repo=" +
            encodeURIComponent(x.repo),
        )
      ).json();
      if (r.ok) setCabang(r.cabang || []);
      else setGalat(r.error || "");
    } catch (e: any) {
      setGalat(e.message);
    }
  };

  const taut = async (branch: string) => {
    try {
      const r = await (
        await fetch("/github/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner: pilih.owner,
            repo: pilih.repo,
            branch,
          }),
        })
      ).json();
      if (!r.ok) setGalat(r.error || "");
      else {
        await muat();
        setPilih(null);
      }
    } catch (e: any) {
      setGalat(e.message);
    }
  };

  // ── PORTALLED TO document.body ──
  //
  // The panel is rendered from deep inside the composer, and in a SPLIT view it
  // came out clipped: the left half of its text and most of its "Sign in with
  // GitHub" button were cut off at the pane boundary.
  //
  // `position: fixed` is supposed to escape all of that, and usually does — but
  // a transform, filter, backdrop-filter or will-change anywhere above it turns
  // that ancestor into the containing block, and the overlay is then measured
  // and CLIPPED against a pane instead of the window. This repo has already
  // been bitten by exactly that once, when the right-click menu landed 232px
  // from the cursor, and the cure was the same one: render somewhere with no
  // ancestors to inherit.
  //
  // Hunting the specific ancestor would fix it until the next one appears. A
  // portal removes the whole class.
  const isi = (
    <div className="gh-overlay" onClick={onClose}>
      <div className="gh-modal" onClick={(e: any) => e.stopPropagation()}>
        <div className="gh-head">
          <Icon.githubMark width={20} height={20} />
          <div>
            <div className="gh-judul">Add content from GitHub</div>
            <div className="gh-sub">
              Pick a repository and branch to read from
            </div>
          </div>
          <button className="gh-tutup" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        {galat ? <div className="gh-galat">{galat}</div> : null}

        {!keadaan ? (
          <div className="gh-kosong">Loading…</div>
        ) : menungguWeb ? (
          <div className="gh-sambung">
            <p className="gh-sub">
              GitHub is open in your browser. Authorize WOLFSPACE there, and
              this panel will continue on its own.
            </p>
            <div className="gh-sub">Waiting for you to finish on GitHub…</div>
            <button
              className="gh-kembali"
              onClick={() => setMenungguWeb(false)}
            >
              Cancel
            </button>
          </div>
        ) : masuk ? (
          <div className="gh-sambung">
            <p className="gh-sub">
              Open the page below, sign in to GitHub, and enter this code. No
              password is typed here — GitHub does the signing in, and you can
              revoke the access from your GitHub settings at any time.
            </p>
            <div className="gh-kode">{masuk.kode}</div>
            <a
              className="btn btn-primary"
              href={masuk.alamat}
              target="_blank"
              rel="noreferrer"
            >
              Open {masuk.alamat.replace(/^https?:\/\//, "")}
            </a>
            <div className="gh-sub">Waiting for you to finish on GitHub…</div>
            <button className="gh-kembali" onClick={() => setMasuk(null)}>
              Cancel
            </button>
          </div>
        ) : !keadaan.tersambung ? (
          <div className="gh-sambung">
            {/* SETUP IS THE FALLBACK, NOT THE FRONT DOOR.
                WOLFSPACE ships with its own registered OAuth App, so signing
                in normally goes straight to GitHub. This form appears only
                when there is no built-in app to sign in as, or when someone
                deliberately chooses to use their own. */}
            {!keadaan.bisaWeb || pakaiAppSendiri ? (
              <>
                <p className="gh-sub">
                  {pakaiAppSendiri
                    ? "Sign in as your own OAuth App instead of the one WOLFSPACE ships with."
                    : "This build has no OAuth App of its own, so signing in needs one of yours."}{" "}
                  Create it at Settings → Developer settings → OAuth Apps, set
                  the Authorization callback URL to the address below, then
                  paste its Client ID and a generated Client Secret.
                </p>
                <button
                  className="gh-salin"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      keadaan.alamatCallback || "",
                    );
                    setDisalin(true);
                    setTimeout(() => setDisalin(false), 1500);
                  }}
                  title="Copy"
                >
                  <code>{keadaan.alamatCallback}</code>
                  <span>{disalin ? "Copied" : "Copy"}</span>
                </button>
                <input
                  className="input"
                  value={clientId}
                  placeholder="Client ID — Ov23li…"
                  onChange={(e: any) => setClientId(e.target.value)}
                />
                <input
                  className="input"
                  type="password"
                  value={clientSecret}
                  placeholder="Client Secret"
                  onChange={(e: any) => setClientSecret(e.target.value)}
                />
                <button
                  className="btn btn-primary"
                  disabled={!clientId.trim() || !clientSecret.trim()}
                  onClick={simpanClientId}
                >
                  Save and continue
                </button>
                {keadaan.bisaWeb ? (
                  <button
                    className="gh-kembali"
                    onClick={() => setPakaiAppSendiri(false)}
                  >
                    Back
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <p className="gh-sub">
                  Sign in with your GitHub account to pick a repository. GitHub
                  does the signing in — no password is typed here — and you can
                  revoke the access from your GitHub settings at any time.
                  Existing repositories are only ever read; the one thing this
                  writes is a new repository, when you ask for one.
                </p>
                <button
                  className="btn btn-primary"
                  disabled={sibuk}
                  onClick={() => mulaiWeb()}
                >
                  {sibuk ? "Opening GitHub…" : "Sign in with GitHub"}
                </button>
                {/* The device code stays as a fallback, for the case where the
                    browser cannot come back to this machine. */}
                {keadaan.bisaMasuk ? (
                  !pakaiKode ? (
                    <button
                      className="gh-kembali"
                      onClick={() => setPakaiKode(true)}
                    >
                      Browser did not open? Use a device code
                    </button>
                  ) : (
                    <button
                      className="btn btn-ghost"
                      disabled={sibuk}
                      onClick={mulaiMasuk}
                    >
                      {sibuk ? "Starting…" : "Get a device code"}
                    </button>
                  )
                ) : null}
                {/* For anyone who would rather not sign in as the shipped app.
                    An escape hatch, deliberately not the first thing offered. */}
                {keadaan.appBawaan ? (
                  <button
                    className="gh-kembali"
                    onClick={() => setPakaiAppSendiri(true)}
                  >
                    Use your own OAuth App
                  </button>
                ) : null}
              </>
            )}

            {/* A TOKEN IS STILL ACCEPTED, but it is no longer the front door.
                Pasting one is a credential the user manages themselves, which
                is the shape MCP already offers; signing in to an account is a
                different thing and belongs first. */}
            {!pakaiToken ? (
              <button
                className="gh-kembali"
                onClick={() => setPakaiToken(true)}
              >
                Use a personal access token instead
              </button>
            ) : (
              <>
                <input
                  className="input"
                  type="password"
                  value={token}
                  placeholder="ghp_… or github_pat_…"
                  onChange={(e: any) => setToken(e.target.value)}
                />
                <button
                  className="btn btn-ghost"
                  disabled={sibuk || !token.trim()}
                  onClick={sambung}
                >
                  {sibuk ? "Checking…" : "Connect with token"}
                </button>
              </>
            )}
          </div>
        ) : pilih ? (
          <div className="gh-daftar">
            <button className="gh-kembali" onClick={() => setPilih(null)}>
              ← {pilih.penuh}
            </button>
            {cabang.length === 0 ? (
              <div className="gh-kosong">Loading branches…</div>
            ) : (
              cabang.map((b) => (
                <button key={b} className="gh-baris" onClick={() => taut(b)}>
                  {b}
                  {b === pilih.cabangUtama ? (
                    <span className="gh-tag">default</span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="gh-daftar">
            {/* WHO IS SIGNED IN, shown before anything else. Switching accounts
                was impossible to even attempt while the panel never said which
                account it was using. */}
            {keadaan.akun ? (
              <div className="gh-akun">
                {keadaan.akun.avatar ? (
                  <img src={keadaan.akun.avatar} alt="" />
                ) : null}
                <div className="gh-akun-nama">
                  <b>{keadaan.akun.login}</b>
                  {keadaan.akun.name ? <span>{keadaan.akun.name}</span> : null}
                </div>
                <button
                  className="gh-akun-aksi"
                  onClick={gantiAkun}
                  disabled={sibuk}
                >
                  Switch
                </button>
                <button className="gh-akun-aksi" onClick={putus}>
                  Sign out
                </button>
              </div>
            ) : null}

            {keadaan.taut ? (
              <div className="gh-tertaut">
                Linked: {keadaan.taut.owner}/{keadaan.taut.repo} @{" "}
                {keadaan.taut.branch}
              </div>
            ) : null}

            {/* CREATING A REPOSITORY IS THE ONE WRITE THIS PANEL DOES, so it
                says what it will do rather than just taking a name. */}
            {buat ? (
              <div className="gh-buat">
                <input
                  className="input"
                  value={namaBaru}
                  placeholder="Repository name"
                  autoFocus
                  onChange={(e: any) => setNamaBaru(e.target.value)}
                />
                <input
                  className="input"
                  value={ketBaru}
                  placeholder="Description (optional)"
                  onChange={(e: any) => setKetBaru(e.target.value)}
                />

                {/* ── VISIBILITY IS A CHOICE, NOT AN UNTICKED BOX ──
                    It was a "Private" checkbox, which means public is what you
                    get by NOT doing something — and publishing code is not a
                    default anyone should arrive at by omission. Both options
                    are stated, and each says what it actually means. */}
                <div className="gh-pilih-jenis">
                  {[
                    {
                      nilai: true,
                      judul: "Private",
                      ket: "Only you can see it",
                    },
                    {
                      nilai: false,
                      judul: "Public",
                      ket: "Anyone on the internet can see it",
                    },
                  ].map((o: any) => (
                    <button
                      key={o.judul}
                      type="button"
                      className={
                        "gh-jenis" + (pribadiBaru === o.nilai ? " aktif" : "")
                      }
                      aria-pressed={pribadiBaru === o.nilai}
                      onClick={() => setPribadiBaru(o.nilai)}
                    >
                      <span className="gh-jenis-ikon">
                        <IkonRepo pribadi={o.nilai} />
                      </span>
                      <span className="gh-jenis-teks">
                        <b>{o.judul}</b>
                        <span>{o.ket}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {/* ── THE BRANCH NAME ──
                    GitHub's create endpoint has NO parameter for this — the
                    name comes from the account's own setting, and only a
                    rename afterwards can change it. So this is prefilled with
                    what most accounts already produce, and the extra request
                    only happens when it differs. */}
                <label className="gh-label">
                  Default branch
                  <input
                    className="input"
                    value={cabangBaru}
                    placeholder="main"
                    onChange={(e: any) => setCabangBaru(e.target.value)}
                  />
                </label>

                <div className="gh-buat-aksi">
                  <button
                    className="btn btn-primary"
                    disabled={sibuk || !namaBaru.trim()}
                    onClick={buatRepo}
                  >
                    {sibuk ? "Creating…" : "Create repository"}
                  </button>
                  <button className="gh-kembali" onClick={() => setBuat(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="gh-baru" onClick={() => setBuat(true)}>
                + New repository
              </button>
            )}

            {repo.length === 0 ? (
              <div className="gh-kosong">No repositories found.</div>
            ) : (
              repo.map((x) =>
                ubahNama && ubahNama.penuh === x.penuh ? (
                  // Renaming happens ON the row. A dialog for a reversible
                  // change costs more attention than the change is worth —
                  // GitHub redirects the old name, so nothing breaks.
                  <div className="gh-baris gh-baris-ubah" key={x.penuh}>
                    <input
                      className="input"
                      value={namaUbah}
                      autoFocus
                      onChange={(e: any) => setNamaUbah(e.target.value)}
                      onKeyDown={(e: any) => {
                        if (e.key === "Enter" && namaUbah.trim()) kirimGanti();
                        if (e.key === "Escape") setUbahNama(null);
                      }}
                    />
                    <button
                      className="btn btn-primary gh-kecil"
                      disabled={sibuk || !namaUbah.trim()}
                      onClick={kirimGanti}
                    >
                      {sibuk ? "…" : "Rename"}
                    </button>
                    <button
                      className="gh-kembali gh-kecil"
                      onClick={() => setUbahNama(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    key={x.penuh}
                    className="gh-baris"
                    onClick={() => bukaRepo(x)}
                    onContextMenu={(e: any) => {
                      e.preventDefault();
                      setMenu({ x, atas: e.clientY, kiri: e.clientX });
                    }}
                  >
                    {x.penuh}
                    {x.pribadi ? <span className="gh-tag">private</span> : null}
                  </button>
                ),
              )
            )}
          </div>
        )}

        {/* ── THE RIGHT-CLICK MENU ──
            Closed by clicking anywhere else, by Escape, and by choosing
            something. A menu that outlives the click that opened it ends up
            floating over an unrelated part of the panel. */}
        {/* ── DRAWN INTO document.body, NOT WHERE IT IS WRITTEN ──
            REPORTED: the menu appeared far from the cursor, at the bottom
            right, outside the panel entirely.
            THE CAUSE, and it is not obvious from reading either file: .page
            carries `will-change: transform, opacity` (styles.css, for the page
            transition). Per the CSS spec that makes .page a CONTAINING BLOCK
            for fixed-positioned descendants — exactly as a real transform
            would. So `position: fixed` stopped meaning "relative to the
            viewport" and started meaning "relative to .page", while clientX /
            clientY are still viewport coordinates.
            MEASURED in a real browser, reproducing the app's layout: an element
            asking for top 300 / left 600 landed at 344 / 832 — thrown by
            exactly the sidebar width (232px) and the topbar height (44px).
            Without will-change it landed precisely where it asked.
            A portal to document.body puts the node OUTSIDE .page, so fixed
            means the viewport again. It also escapes .gh-modal's `overflow:
            auto`, which would otherwise clip a menu opened near an edge. */}
        {menu
          ? ReactDOM.createPortal(
              <>
                <div className="gh-menu-tirai" onClick={() => setMenu(null)} />
                <div
                  className="gh-menu"
                  ref={menuRef}
                  style={{ top: menu.atas + "px", left: menu.kiri + "px" }}
                >
                  <div className="gh-menu-judul">{menu.x.penuh}</div>
                  <button
                    type="button"
                    className="gh-menu-item"
                    onClick={() => {
                      setUbahNama(menu.x);
                      setNamaUbah(menu.x.repo);
                      setMenu(null);
                    }}
                  >
                    Rename…
                  </button>
                  <button
                    type="button"
                    className="gh-menu-item bahaya"
                    onClick={() => {
                      setHapus(menu.x);
                      setKetikNama("");
                      setMenu(null);
                    }}
                  >
                    Delete…
                  </button>
                  {/* SAID BEFORE THE CLICK, not after it. And the two causes are
                  not the same: a build that does not yet ASK for delete access
                  cannot be fixed by signing in again — measured on a real
                  token, one issued fourteen hours before the scope was added
                  came back just as narrow from a sign-in made inside the
                  still-running old build. */}
                  {keadaan && keadaan.bisaHapus === false ? (
                    <div className="gh-menu-nota">
                      {(keadaan.scopeDiminta || []).includes("delete_repo")
                        ? "Deleting needs a new sign-in — this one was granted " +
                          (keadaan.scope || []).join(", ")
                        : "This running build does not ask for delete access yet. " +
                          "Restart WOLFSPACE, then sign out and sign in again."}
                    </div>
                  ) : null}
                </div>
              </>,
              document.body,
            )
          : null}

        {/* ── DELETING ASKS FOR THE NAME, NOT FOR A YES ──
            The shape GitHub itself uses, for the reason GitHub uses it: a
            yes/no box is answered by reflex, and the reflex is yes. Typing the
            name cannot be done by accident — and cannot be done to the WRONG
            repository by accident either, which is the mistake a context menu
            makes easy, because the row under the cursor is not always the row
            that was read. */}
        {hapus ? (
          <div className="gh-hapus">
            <div className="gh-hapus-judul">
              Delete <b>{hapus.penuh}</b>?
            </div>
            <div className="gh-hapus-teks">
              This cannot be undone. Everything in it goes with it — issues,
              releases, history.
            </div>
            <div className="gh-hapus-teks">
              Type <b>{hapus.repo}</b> to confirm:
            </div>
            <input
              className="input"
              value={ketikNama}
              autoFocus
              placeholder={hapus.repo}
              onChange={(e: any) => setKetikNama(e.target.value)}
              onKeyDown={(e: any) => {
                if (e.key === "Escape") setHapus(null);
              }}
            />
            <div className="gh-buat-aksi">
              <button
                className="btn gh-btn-bahaya"
                disabled={sibuk || ketikNama.trim() !== hapus.repo}
                onClick={kirimHapus}
              >
                {sibuk ? "Deleting…" : "Delete this repository"}
              </button>
              <button className="gh-kembali" onClick={() => setHapus(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
  // document.body has no transformed ancestor to be measured against, so the
  // overlay covers the window whatever the panes are doing.
  return typeof document !== "undefined" && document.body
    ? ReactDOM.createPortal(isi, document.body)
    : isi;
}

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
            {/* The same file icon the chip uses. An emoji here said only
                "document" for every type there is. */}
            <IkonLampiran nama={item.name || item.path || ""} />
            {item.name || item.path || "Preview"}
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
            // `word-break: break-all` was here too, and on CODE it is worse
            // than on a filename: it splits identifiers mid-token, so the
            // preview no longer reads as the language it is. Code scrolls
            // sideways instead.
            <pre className="lam-pratayang">{item.snippet}</pre>
          ) : (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                color: "var(--text-muted, #858585)",
              }}
            >
              <div className="lam-kosong-ikon">
                <IkonLampiran nama={item.name || item.path || ""} />
              </div>
              <div style={{ fontSize: "15px", color: "var(--text, #e5e5e5)" }}>
                {item.name || item.path}
              </div>
              {item.size && (
                <div style={{ fontSize: "12px", marginTop: "8px" }}>
                  {ukuranBerkas(item.size)}
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
  // The SAME two states as the picker composer in Screens.tsx. Two surfaces
  // holding one behaviour is how this repo has produced drift before, so the
  // rules themselves live in one place (fileRefDari and friends above) and
  // only the wiring is repeated.
  const [fileRefs, setFileRefs] = useState<any[]>([]);
  const [seretMasuk, setSeretMasuk] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<any>(null);
  const [menu, setMenu] = useState(false);
  const [showGithub, setShowGithub] = useState(false);
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

  // Connect returns before the handshake finishes, so one refresh is not
  // enough — see useMcpMenunggu in Config.tsx.
  useMcpMenunggu(mcpServers, loadMcpServers);

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
      setMcpInputError("MCP type is required.");
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

    // Single source, exactly like the command above: see mcpResolveKredensial()
    // in app/Config.tsx. The same chain lived in Screens.tsx and the two had
    // drifted — that copy had no remote-bearer branch at all — and both ended in
    // `env = { TOKEN: ... }`, a name no MCP server reads.
    const _k = mcpResolveKredensial(type, envVars, args);
    const env = _k.env;
    args = _k.args;
    if (_k.perluNama) {
      setMcpInputError(
        "There is no known credential name for '" +
          type +
          "'. Enter it as NAME=value (for example API_KEY=abc), or as JSON.",
      );
      return;
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
    if ((!v && attachments.length === 0 && fileRefs.length === 0) || busy)
      return;
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
    fullText = gabungDenganRef(fullText, fileRefs);
    onSend(fullText, {
      text: v,
      fileRefs: fileRefs.map((r: any) => ({ name: r.name, path: r.path })),
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
    setSoon(name + " is coming soon.");
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
        <div
          className={
            "composer-input-col" + (seretMasuk ? " komposer-terima" : "")
          }
          onDragOver={(e: any) => {
            if (!e.dataTransfer.types.includes(DRAG_JENIS_BERKAS)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setSeretMasuk(true);
          }}
          onDragLeave={(e: any) => {
            if (!e.currentTarget.contains(e.relatedTarget))
              setSeretMasuk(false);
          }}
          onDrop={(e: any) => {
            const ref = fileRefDariDrop(e.dataTransfer);
            setSeretMasuk(false);
            if (!ref) return;
            e.preventDefault();
            setFileRefs((prev: any) => tambahFileRef(prev, ref));
          }}
        >
          {/* The agent's own reports, and the switch that lets it make them.
              Above the input because they are unsolicited: they must be
              readable without hunting, and dismissible without a dialog. */}
          <ReaktifBar />
          {(attachments.length > 0 || fileRefs.length > 0) && (
            <div className="composer-attachments">
              {fileRefs.map((r: any) => (
                <AttachmentChip
                  key={r.id}
                  att={r}
                  onRemove={(x: any) =>
                    setFileRefs((p: any) => p.filter((y: any) => y.id !== x.id))
                  }
                />
              ))}
              {attachments.map((att: any) => (
                <AttachmentChip
                  key={att.id}
                  att={att}
                  onOpen={setPreviewAttachment}
                  onRemove={(x: any) =>
                    setAttachments((p: any) =>
                      p.filter((y: any) => y.id !== x.id),
                    )
                  }
                />
              ))}
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
              {/* Second slot. .composer-action-btns is already a flex row with
                  gap:8px, so a 34px sibling starts at 34 + 8 = 42px -- the
                  position this was asked for, arrived at by the layout rather
                  than by a hardcoded offset. */}
              <button
                className="composer-add composer-github"
                title="GitHub"
                onClick={() => setShowGithub((v: any) => !v)}
              >
                <Icon.githubMark width={18} height={18} />
              </button>
            </div>
            {showGithub ? (
              <GithubPanel onClose={() => setShowGithub(false)} />
            ) : null}
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
                      {/* Not "Sonnet". A model name hard-coded on the
                          fallback path shows up even when nothing is
                          configured at all, and that reads as an app already
                          set up when it is not. */}
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
                      {/* The placeholder is FILTERED OUT, as it already was
                          in Screens.tsx. Without this, "No models yet" renders
                          as a model of its own, description and all — so a
                          screen with no model still shows a line describing
                          one. */}
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
                                          : srv.status && srv.status.starting
                                            ? "Handshake in progress"
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
                                          : srv.status && srv.status.starting
                                            ? "◌ Connecting…"
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
                                placeholder="MCP type (e.g. github, brave-search, sqlite)"
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
                                Cancel
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
