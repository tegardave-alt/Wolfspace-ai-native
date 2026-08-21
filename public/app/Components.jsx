// Components — diekstrak dari app.jsx (lihat public/app.jsx untuk App orkestrator).
// Dimuat via APP_MODULES di index.html: di-CONCAT SEBELUM app.jsx (prepend) lalu
// Babel sekali -> satu scope global. Body fungsi (hooks/React/SB) jalan saat render.

/* ----------------------------- Top bar ----------------------------- */
// ── Menu tata letak (☰) ──
//
// Dipisah jadi komponennya sendiri saat ia dipindah dari bilah atas ke sidebar.
// Alasannya bukan kerapian: isinya ~150 baris, dan memindahkannya dengan cara
// menyalin berarti dua salinan yang harus tetap sepakat soal posisi panel,
// tampilan chat, dan Code — tiga hal yang justru paling sering berubah.
//
// `arah` menentukan ke mana panelnya membuka. Di bilah atas ia turun; di KAKI
// sidebar, turun berarti keluar layar — jadi ia naik dan melebar ke kanan.
// Sidebar bisa menyempit sampai 60px, dan panel yang terkurung di lebar itu
// tak akan terbaca.
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
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  // ── Kenapa panelnya position: fixed saat di sidebar ──
  //
  // `.sidebar.collapsed` memakai `overflow: hidden` (untuk menyembunyikan label
  // selama animasi lebar), dan itu MEMOTONG apa pun yang keluar dari tepinya —
  // termasuk panel menu ini. Terukur: panelnya terpangkas di x=232, separuh
  // pilihan "Right/Bottom" hilang.
  //
  // `position: fixed` lolos dari pemotongan itu. Tapi ia juga lepas dari
  // tombolnya, jadi koordinatnya DIUKUR saat menu dibuka — bukan dipatok.
  // Sidebar bisa diubah lebarnya DAN dilipat, jadi angka tetap apa pun akan
  // salah di salah satu keadaan.
  const [kotakMenu, setKotakMenu] = useState(null);
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
    // Sidebar bisa digeser lebarnya SELAGI menu terbuka.
    window.addEventListener("resize", hitung);
    return () => window.removeEventListener("resize", hitung);
  }, [arah, menuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    // Ditutup oleh klik di luar DAN oleh Escape. Hanya salah satunya membuat
    // menu yang terbuka terasa macet — pemakai menekan Escape lalu heran.
    const klik = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target))
        setMenuOpen(false);
    };
    const tombol = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", klik);
    document.addEventListener("keydown", tombol);
    return () => {
      document.removeEventListener("mousedown", klik);
      document.removeEventListener("keydown", tombol);
    };
  }, [menuOpen]);

  const pilihPosisi = (apa, ke) => {
    if (setPosisi) setPosisi((p) => ({ ...p, [apa]: ke }));
    setMenuOpen(false);
  };
  // Pilihannya BEDA per baris, bukan "kanan/bawah" untuk semuanya. Terminal di
  // kiri/kanan memaksa keluaran perintah — yang berbentuk baris panjang —
  // membungkus terus, jadi pasangannya kanan/bawah. Preview dan Code adalah
  // halaman dan editor: keduanya butuh LEBAR, jadi pasangannya kiri/kanan.
  const _NAMA_SISI = { kanan: "Right", bawah: "Bottom", kiri: "Left" };
  const barisPosisi = (apa, label, pilihan = ["kanan", "bawah"]) => (
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
        onClick={() => setMenuOpen((b) => !b)}
        title="Layout"
        aria-label="Layout"
        aria-expanded={menuOpen}
      >
        {/* Tiga garis mendatar. Sebelumnya tiga titik menurun (⋮), yang di
              bilah atas lebih lazim berarti "aksi untuk baris ini"; tiga garis
              (☰) dibaca orang sebagai menu utama — dan itu memang isinya.
              Digambar dengan garis, bukan teks "☰", supaya tebal dan jaraknya
              tak berubah mengikuti font yang kebetulan terpasang. */}
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
                // Menyembunyikan chat saat tak ada panel lain menghasilkan
                // layar KOSONG, dan pemakai tak punya petunjuk bahwa jalan
                // kembalinya ada di menu ini. Jadi pilihannya dimatikan —
                // dan alasannya dikatakan, bukan cuma diredupkan diam-diam.
                // Code ikut dihitung sejak ia jadi panel sungguhan: kalau
                // tidak, menyembunyikan chat saat HANYA Code yang terbuka
                // akan ditolak padahal layarnya tidak akan kosong.
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
}) {
  // Menu ⋮ di ujung kiri bilah atas.
  //
  // Opsi tata letak sempat dipasang sebagai dua tombol TERPISAH di sini, dan
  // itu terlalu ramai untuk sesuatu yang jarang disentuh: bilah ini tempat
  // tindakan sehari-hari, sementara memindahkan panel dilakukan sekali lalu
  // dilupakan. Menu menyembunyikannya tanpa menghilangkannya.
  return (
    <header className="topbar">
      {/* Menu ☰ PINDAH ke sidebar (lihat MenuTataLetak dipakai di
            Sidebar.jsx). Bilah atas tempat tindakan sehari-hari; tata
            letak diatur sekali lalu dilupakan, jadi tempatnya di kaki
            sidebar bersama pengaturan lain. */}
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

/* ----------------------------- HuggingFace models ----------------------------- */
function fmtSize(b) {
  if (!b) return "";
  const gb = b / 1073741824;
  return gb >= 1 ? gb.toFixed(2) + " GB" : (b / 1048576).toFixed(0) + " MB";
}
function HFModels({ onSaved }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [sel, setSel] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null);
  const [msg, setMsg] = useState("");
  const search = async () => {
    const t = q.trim();
    if (!t) return;
    setMsg("Mencari model...");
    setResults([]);
    setSel("");
    setFiles([]);
    try {
      const r = await (
        await fetch("/hf/search?q=" + encodeURIComponent(t))
      ).json();
      if (r.error) throw new Error(r.error);
      setResults(r);
      setMsg(r.length ? "" : "No matching results.");
    } catch (e) {
      setMsg("Search failed: " + e.message);
    }
  };
  const pick = async (id) => {
    setSel(id);
    setFiles([]);
    setMsg("Loading file list…");
    try {
      const r = await (
        await fetch("/hf/files?id=" + encodeURIComponent(id))
      ).json();
      if (r.error) throw new Error(r.error);
      setFiles(r);
      setMsg(r.length ? "" : "No .gguf files in this repository.");
    } catch (e) {
      setMsg("Failed to load file: " + e.message);
    }
  };
  const download = async (file) => {
    if (busy) return;
    setBusy(true);
    setProg(0);
    setMsg("Mengunduh " + file.split("/").pop() + "...");
    try {
      const res = await fetch("/hf/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sel, file }),
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          const m = line.match(/^data:\s*(.*)$/);
          if (!m) continue;
          let j;
          try {
            j = JSON.parse(m[1]);
          } catch (e) {
            continue;
          }
          if (j.t === "progress") setProg(j.pct);
          else if (j.t === "done") {
            setMsg(
              "Done: " +
                j.model.name +
                " has been downloaded and started on port " +
                j.model.port +
                ". Wait about 30 seconds, then pick it from the Model menu.",
            );
            onSaved && onSaved();
          } else if (j.t === "err") setMsg("Download failed: " + j.m);
        }
      }
    } catch (e) {
      setMsg("Download failed: " + e.message);
    }
    setBusy(false);
    setProg(null);
  };
  return (
    <div className="hf">
      <label className="field-label">Model HuggingFace</label>
      <div className="hf-search">
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search GGUF, e.g. qwen coder"
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
        />
        <button className="btn btn-primary" onClick={search}>
          Search
        </button>
      </div>
      {results.length > 0 && (
        <div className="hf-res">
          {results.map((m) => (
            <button
              key={m.id}
              className={"hf-item" + (sel === m.id ? " sel" : "")}
              onClick={() => pick(m.id)}
            >
              {m.id}
              <br />
              <span className="meta">
                Unduhan {m.downloads.toLocaleString()} � Suka {m.likes}
              </span>
            </button>
          ))}
        </div>
      )}
      {sel &&
        files.map((f) => {
          const heavy = f.size > 4 * 1073741824;
          return (
            <div className="hf-file" key={f.path}>
              <span className="nm">{f.path.split("/").pop()}</span>
              <span className={"sz" + (heavy ? " heavy" : "")}>
                {fmtSize(f.size)}
                {heavy ? " ?" : ""}
              </span>
              <button
                className="hf-dl"
                disabled={busy}
                onClick={() => download(f.path)}
              >
                Unduh
              </button>
            </div>
          );
        })}
      {prog !== null && (
        <div className="hf-bar">
          <div style={{ width: prog + "%" }} />
        </div>
      )}
      {msg && <div className="hf-msg">{msg}</div>}
    </div>
  );
}

/* Views dipindah ke public/app/Views.jsx (APP_MODULES). */

/* CodeBlocks dipindah ke public/app/CodeBlocks.jsx (APP_MODULES). */

/* ----------------------------- Message ----------------------------- */
function Blocks({ text }) {
  const blocks = parseBlocks(text);
  if (!blocks.length)
    return (
      <div className="typing">
        <span />
        <span />
        <span />
      </div>
    );
  return blocks.map((b, i) =>
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
// DIBUNGKUS React.memo di bawah — jangan pakai MessageDasar langsung.
//
// KENAPA. app.jsx merender riwayat utuh: {messages.map((m,i) => <Message .../>)}.
// Selama agent bekerja, handler stream memanggil upd() pada SETIAP token, dan
// upd() melakukan setMessages(m => ...) yang menyalin array. Tanpa memo, tiap
// token merekonsiliasi ULANG seluruh daftar — termasuk setiap ToolOutput dan
// CodeBlock yang punya editor Monaco hidup di dalamnya.
//
// Biayanya berbanding lurus dengan (jumlah editor hidup x jumlah token), dan
// itulah kenapa gejalanya muncul "saat Monaco muncul" dan makin parah makin
// panjang riwayatnya. Diukur di aplikasi nyata lewat CDP: tugas pemblokir
// sampai 358ms dan total ~2,4 detik beku dalam satu run 123 detik — padahal
// baru 3 editor hidup.
//
// upd() hanya mengganti objek pesan TERAKHIR, jadi dengan memo hanya satu
// Message yang benar-benar dirender ulang per token. Message murni fungsi dari
// prop `msg` (tak menyentuh context maupun closure yang berubah), sehingga
// pembandingan referensi bawaan React.memo sudah tepat — tak perlu komparator.
function MessageDasar({ msg }) {
  if (msg.role === "user")
    return (
      <div className="msg user">
        <span className="msg-role">You</span>
        {/* Lampiran dirender sebagai KARTU, bukan baris teks di dalam
            gelembung. Handle att_… tetap dikirim ke model lewat argumen
            pertama onSend — ia perlu itu untuk membaca lampiran — tapi tak
            ada gunanya dibaca manusia. */}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="msg-attachments">
            {msg.attachments.map((a, i) => (
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
      {/* <Verdict> DIHAPUS bersama analyzeCode di server.cjs — satu-satunya
          sumber `quality` yang dirender komponen itu. Tanpanya ia hanya
          menghasilkan <div class="verdict-wrap"> kosong pada setiap pesan. */}
    </div>
  );
}
const Message = React.memo(MessageDasar);

/* ----------------------------- Composer ----------------------------- */
// Line icons for the composer "+" menu (match the reference design).
const svg = (p) => (
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

// Deteksi file 3D (GLB/GLTF/STL) dari nama/path.
const is3DFile = (nameOrPath) => /\.(glb|gltf|stl)$/i.test(nameOrPath || "");

/* Model3DViewer dipindah ke public/app/Model3DViewer.jsx (dimuat via APP_MODULES di index.html). */

function LightboxModal({ item, onClose }) {
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
        onClick={(e) => e.stopPropagation()}
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

/* ── Checklist todowrite, tepat di atas kotak ketik ──
   Bentuknya mengikuti todowrite Claude Code: satu daftar yang HIDUP di satu
   tempat tetap, bukan jejak yang tertinggal di riwayat. Itu sebabnya ia duduk
   di composer-wrap dan bukan di dalam gelembung agent — gelembung tergulung
   naik begitu percakapan berlanjut, dan daftar yang gunanya untuk dilihat
   SELAMA bekerja justru paling cepat hilang dari layar.

   Kotak centangnya bisa diklik, dan itu disengaja: kadang sebuah item sudah
   beres di kepala pemakai sebelum agent sempat menandainya. Tapi agent tetap
   PEMILIKNYA — todowrite berikutnya menimpa seluruh daftar, termasuk centang
   manual. Itu perilaku yang benar (agent yang tahu keadaan sebenarnya), dan
   disebut di sini supaya tak dikira bug saat centangnya berubah sendiri. */
function TodoPanel({ todos, busy, onToggle, onClear }) {
  if (!Array.isArray(todos) || todos.length === 0) return null;
  const selesai = todos.filter((t) => (t.status || "") === "completed").length;
  const semuaSelesai = selesai === todos.length;
  // Daftar yang MANDEK: agent sudah berhenti tapi masih ada item terbuka.
  //
  // Ini keadaan yang paling sering terjadi dan justru dulu tak punya jalan
  // keluar. Proses berhenti di tengah — dibatalkan, gagal, atau model berhenti
  // tanpa jawaban — dan daftarnya tertinggal di atas kotak ketik selamanya:
  // tombol tutup cuma muncul kalau semua item selesai, dan item yang tak pernah
  // selesai berarti tombolnya tak pernah datang. Satu-satunya cara membersihkan
  // adalah menunggu todowrite BERIKUTNYA menimpanya, yang belum tentu ada.
  const mandek = !busy && !semuaSelesai;
  const canClose = semuaSelesai || mandek;
  return (
    <div className={"todo-panel" + (mandek ? " todo-mandek" : "")}>
      <div className="todo-panel-head">
        <span className="todo-panel-judul">Tugas</span>
        {/* Slot yang sama berganti peran: selama agent MASIH BEKERJA ia
            menunjukkan kemajuan, dan begitu tak ada lagi yang berjalan — entah
            karena semua beres atau karena prosesnya terhenti — ia jadi tombol
            untuk menutup daftarnya.

            Yang dijaga syarat `!busy`: selama agent jalan, tombolnya tetap
            tidak ada, karena satu klik keliru di tengah kerja menghapus daftar
            yang sedang dipakai agent sebagai rencana dan tak ada cara
            mengembalikannya. Sesudah agent berhenti, risiko itu hilang —
            yang tersisa cuma daftar basi yang perlu dibuang. */}
        <span className="todo-panel-slot">
          {/* Saat MANDEK penghitung tetap ditampilkan di samping tombolnya.
              Justru di keadaan inilah angkanya paling berarti: "3/7" adalah
              satu-satunya yang memberi tahu di mana kerjanya putus. Kalau ia
              diganti tombol seperti pada keadaan "semua selesai", pemakai
              kehilangan itu tepat ketika ia paling dibutuhkan. */}
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
        {todos.map((t, i) => {
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
}) {
  const [val, setVal] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [menu, setMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showMcpMenu, setShowMcpMenu] = useState(false);
  const [mcpServers, setMcpServers] = useState([]);

  // Satu pemuat dipakai ulang: saat mount DAN saat ada siaran perubahan MCP dari
  // layar lain, supaya kedua tampilan tak pernah menampilkan server yang sudah dihapus.
  const loadMcpServers = React.useCallback(async () => {
    if (!window.WOLFSPACE) return;
    try {
      // Daftar server (config) + status RUNTIME. Dulu `active` di-hardcode true,
      // sehingga badge selalu "Connected" — bahkan untuk server yang prosesnya
      // belum jalan ATAU yang panggilannya selalu gagal (mis. token dicabut:
      // proses start & handshake mulus, tapi tiap panggilan API ditolak 401).
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

  const handleMcpCodeConnect = async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const type = mcpInputUrl.trim();
    const envVars = mcpInputToken.trim();

    if (!type) {
      setMcpInputError("Jenis MCP wajib diisi.");
      return;
    }

    setMcpInputError("");
    setMcpInputSuccess("");

    // Satu sumber: lihat mcpResolvePerintah() di app/Config.jsx. Digandakan
    // di sini dulu, dan dua salinannya sempat melenceng.
    const _r = mcpResolvePerintah(type);
    let command = _r.command;
    let args = _r.args;
    // Masih dipakai di bawah untuk memetakan env var per layanan.
    const cleanType = String(type || "").toLowerCase();

    // Nama server TIDAK BOLEH diturunkan dari URL mentah.
    //
    // Rumus lama: type.split("/").pop().replace(/[^a-zA-Z0-9-]/g,"").
    // Untuk URL remote yang membawa kredensial di query string, potongan
    // terakhirnya adalah "stream?user=...&token=eyJhbGci...", dan pembuangan
    // karakter non-alfanumerik justru MERAPATKAN token itu menjadi satu kata
    // yang lolos sebagai nama. Terbukti di log nyata: beberapa entri bernama
    // "streamuserTokeneyJhbGciOiJBMjU2S1ciLCJlbmMi..." — JWT utuh, tersimpan
    // ke config/mcp.json DAN tercetak berulang kali ke berkas debug.
    //
    // Untuk URL, yang dipakai sekarang hanya HOST-nya (tak pernah membawa
    // rahasia). Untuk selain URL, perilaku lama dipertahankan.
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
        .pop()
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
          // figma-developer-mcp butuh token via --figma-api-key dan stdout pipe via --stdio
          args = [
            "-y",
            "figma-developer-mcp",
            "--stdio",
            `--figma-api-key=${envVars}`,
          ];
        } else if (cleanType.startsWith("http")) {
          // Server remote: kredensial dikirim sebagai HEADER lewat env, BUKAN
          // ditempel ke URL di argv. argv terlihat di daftar proses mana pun
          // dan ikut tercatat; env tidak pernah dicatat oleh mcp-client.
          // Ini jalur untuk token TELANJANG (gagal di-JSON.parse di atas), yang
          // diperlakukan sebagai bearer. Kalau user memasukkan JSON, cabang
          // JSON.parse di atas sudah memakainya sebagai env apa adanya — di
          // situ ia bisa menulis MCP_HEADERS sendiri untuk header non-standar.
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
        setMcpInputError(err.message);
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

    setMcpServers((prev) => [...prev.filter((p) => p.id !== name), entry]);
    // Entri di atas OPTIMISTIS (langsung hijau). Segarkan dari status runtime
    // sesaat kemudian supaya server yang ternyata gagal tidak terus tampil
    // "Connected" — beri jeda agar proses MCP sempat handshake.
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
  const ref = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!menu) {
      setShowModelMenu(false);
      setShowMcpMenu(false);
    }
  }, [menu]);

  // Batasnya DIBACA dari CSS, bukan ditulis ulang di sini. Dulu angkanya ada
  // dua — 160px di CSS, 180 di sini — dan yang lebih kecil selalu menang, jadi
  // selisihnya tak pernah berarti apa-apa sementara keduanya terlihat seperti
  // sama-sama berlaku.
  const grow = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // "auto" dulu: tanpa itu scrollHeight tak pernah MENGECIL saat teks
    // dihapus, jadi kotaknya tumbuh sekali lalu tak mau menyusut lagi.
    el.style.height = "auto";
    const maks = parseFloat(getComputedStyle(el).maxHeight);
    const tinggi = Number.isFinite(maks)
      ? Math.min(el.scrollHeight, maks)
      : el.scrollHeight;
    el.style.height = tinggi + "px";
  }, []);

  // ── Kapan tinggi harus dihitung ulang ──
  //
  // onChange saja tidak cukup, dan itu sebabnya kotaknya terasa "statis":
  //   - teks yang disetel dari luar (WOLFSPACE:set-composer, tempel, isi ulang
  //     draf) tak melewati onChange sama sekali;
  //   - jendela yang diubah lebarnya mengubah PEMBUNGKUSAN baris, jadi jumlah
  //     baris berubah tanpa satu pun ketikan.
  React.useEffect(() => {
    grow();
  }, [val, grow]);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // Diamati elemennya sendiri, bukan window: composer ikut menyempit saat
    // panel lain dibuka atau pembaginya digeser — dan itu tak menghasilkan
    // event resize jendela sama sekali.
    //
    // HANYA LEBAR yang memicu hitung ulang. grow() mengubah TINGGI elemen yang
    // sedang diamati, jadi bereaksi pada tinggi berarti mengamati akibat dari
    // diri sendiri — persis bentuk yang menghasilkan "ResizeObserver loop
    // completed with undelivered notifications", dan pada kasus terburuk
    // memutar terus sampai jendela tersendat.
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

  // Log jalur render DIBUANG. Tiap console.* di renderer Electron diserialisasi
  // dan dikirim lewat IPC ke proses main (main.js meneruskannya ke stdout), jadi
  // ongkosnya bukan cuma "nulis teks". Composer ikut dirender ulang setiap kali
  // induknya render — yaitu setiap token selama agent bekerja. Terpantau di app
  // nyata: 7 baris ini keluar hanya dari startup diam, sebelum satu tugas pun
  // dijalankan. Debug seperti ini tak boleh tinggal di jalur yang panas.

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
            // JEMBATAN, bukan unggahan. Yang kembali HANDLE (att_...), bukan
            // path. Dulu berkas ditulis ke <WOLFSPACE>/public/uploads/ lalu
            // PATH-nya diserahkan ke agent — dan saat agent dikurung ke satu
            // worktree, path itu di luar cakupan sehingga broker menolaknya.
            // Pengurungan yang benar justru mematikan attach. Dengan handle,
            // pengurungan tak perlu dilonggarkan sedikit pun.
            //
            // file.name dipakai, BUKAN webkitRelativePath: yang terakhir
            // membawa struktur direktori saat user memilih FOLDER, dan alamat
            // tak boleh ikut menyeberang. (Jembatan tetap memotongnya lagi di
            // sisi server — pertahanan berlapis, bukan pengganti.)
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
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === attId
                  ? {
                      ...a,
                      status: "ready",
                      // Handle, bukan url. previewUrl tetap object URL lokal
                      // yang sudah dibuat dari File — jadi tak ada berkas yang
                      // perlu mendarat di disk hanya demi pratinjau.
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
      // HANDLE, bukan path. Baris ini dulu berbunyi
      //   "- [Attached]: <path> (… , url: /uploads/…)"
      // dan itulah yang membenturkan attach ke pengurungan: agent disuruh
      // membaca sebuah lokasi, lalu broker menolaknya karena di luar worktree.
      // Sekarang yang diberikan id lampiran; agent membacanya lewat
      // attachment_read, dan alamat berkasnya tak pernah ada untuk ditolak.
      const attSummary = attachments
        .map(
          (a) =>
            `- [Terlampir] ${a.name} (${Math.round(a.size / 1024)} KB${a.type ? `, ${a.type}` : ""})` +
            (a.attId ? ` — id: ${a.attId}` : " — handoff FAILED"),
        )
        .join("\n");
      fullText = v
        ? `${v}\n\nAttachments:\n${attSummary}`
        : `Attachments:\n${attSummary}`;
    }
    // Dua argumen: yang PERTAMA untuk model (memuat handle lampiran), yang
    // KEDUA untuk mata user. Dulu hanya satu yang dikirim, sehingga baris
    // lampiran — termasuk handle att_… yang tak ada gunanya dibaca manusia —
    // mendarat mentah di gelembung chat.
    onSend(fullText, {
      text: v,
      attachments: attachments.map((a) => ({
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
    const h = (e) => {
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
    const h = (e) => {
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
  const notYet = (name) => {
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
              {attachments.map((att) => {
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
                      onClick={(e) => {
                        e.stopPropagation();
                        setAttachments((p) => p.filter((x) => x.id !== att.id));
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
            onChange={(e) => {
              console.log("[Textarea] value changed:", e.target.value);
              setVal(e.target.value);
              grow();
            }}
            onKeyDown={(e) => {
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
                  setMenu((m) => !m);
                  setShowModelMenu(false);
                  setShowMcpMenu(false);
                }}
              >
                {MI.plus}
              </button>
            </div>
            {menu && (
              <div className="am-menu" onMouseDown={(e) => e.stopPropagation()}>
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
                      {models.map((m) => (
                        <button
                          key={m.value}
                          className="am-item"
                          style={{ padding: "8px 12px" }}
                          onClick={(e) => {
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
                  onClick={(e) => {
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
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowModelMenu(false);
                      setShowMcpMenu(!showMcpMenu);
                      // Pakai pemuat TUNGGAL, jangan menyalin ulang logikanya.
                      // Salinan inline di sini dulu memetakan `active: true` dan
                      // MENIMPA status runtime yang benar setiap kali menu dibuka —
                      // duplikasi itulah yang membuat bug tampilan MCP terus kembali.
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
                            onClick={async (e) => {
                              e.stopPropagation();
                              // Server MCP tidak lagi dinyalakan saat WOLFSPACE
                              // start — penyalaannya tindakan eksplisit di sini.
                              //
                              // Dua maksud yang BERBEDA dibedakan, karena dulu
                              // keduanya jatuh ke /mcp/toggle:
                              //   - belum jalan & tidak di-disable -> CONNECT
                              //     (nyalakan saja; jangan sentuh konfigurasi)
                              //   - selain itu -> TOGGLE enable/disable, yang
                              //     memang menulis `disabled` ke mcp.json
                              // Tanpa pemisahan ini, sekadar menyambungkan
                              // server ikut mengubah berkas konfigurasi.
                              const perluConnect =
                                !srv.active &&
                                !(srv.status && srv.status.disabled);
                              const jalur = perluConnect
                                ? "/mcp/connect"
                                : "/mcp/toggle";
                              const muatan = perluConnect
                                ? { name: srv.id }
                                : { name: srv.id, enabled: !srv.active };
                              // Optimistis HANYA saat menyambung; hasil
                              // sebenarnya disegarkan dari status runtime.
                              setMcpServers((prev) =>
                                prev.map((item) =>
                                  item.id === srv.id
                                    ? {
                                        ...item,
                                        active: !srv.active,
                                        // Menyambung BUKAN "sudah tersambung".
                                        //
                                        // Diukur di jalur nyata: connect makan
                                        // 4302ms (npx + handshake), dan bisa
                                        // sampai HANDSHAKE_TIMEOUT_MS 60 detik
                                        // untuk server bermasalah. Selama itu
                                        // event loop TIDAK terblokir sama
                                        // sekali (lag-puncak 55ms, 276 tick) —
                                        // jadi ini bukan hang, tapi dulu badge
                                        // langsung hijau "✓ Connected" padahal
                                        // handshake belum selesai. User melihat
                                        // "tersambung" lalu diam lama, dan itu
                                        // yang terbaca sebagai macet.
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
                                // Di finally, BUKAN di jalur sukses saja.
                                // Kalau permintaannya gagal, badge "⟳
                                // Connecting…" akan menempel selamanya karena
                                // tak ada yang menyegarkannya dari status
                                // runtime — dan server yang gagal justru
                                // paling perlu terlihat gagal.
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
                                    // Bedakan SEBABNYA, jangan samaratakan jadi
                                    // "Disabled": server yang panggilannya gagal
                                    // (mis. token dicabut) beda dari yang belum
                                    // dijalankan. Dulu keduanya tampil hijau.
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
                                      // Siarkan agar layar lain (Screens.jsx/pickerMcp) ikut sinkron.
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
                                            setMcpServers((prev) =>
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
                                        setMcpServers((prev) =>
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
                        {!showMcpInput ? (
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
                                value={mcpInputUrl}
                                onChange={(e) => {
                                  setMcpInputUrl(e.target.value);
                                  setMcpInputError("");
                                  setMcpInputSuccess("");
                                }}
                                onKeyDown={(e) => {
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
                                onChange={(e) => {
                                  setMcpInputToken(e.target.value);
                                  setMcpInputError("");
                                  setMcpInputSuccess("");
                                }}
                                onKeyDown={(e) => {
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
                                onClick={(e) => {
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
            onClickCapture={(e) => {
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

/* Visual Picker & Visual Draw dipindah ke public/app/VisualTools.jsx (APP_MODULES). */
