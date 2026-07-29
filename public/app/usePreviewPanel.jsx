// usePreviewPanel — state + perilaku "Web Dev Live Browser", diekstrak dari App().
// Dimuat via APP_MODULES di index.html (CONCAT sebelum app.jsx, satu scope global).
//
// KENAPA HOOK, BUKAN KOMPONEN.
// Memindahkan JSX preview jadi komponen akan menuntut App() mengoper url,
// inputUrl, refreshKey, ref, dan empat setter — lima-enam prop hanya untuk
// mengembalikan apa yang baru saja dipindahkan. Yang menumpuk di App() bukan
// markup-nya, melainkan STATE-nya. Hook memindahkan state itu keluar tanpa
// menambah satu pun prop: App() memanggil satu baris dan memakai hasilnya
// langsung di JSX yang sudah ada.
//
// SATU KOPLING DIBUAT EKSPLISIT.
// Effect auto-preview dulu memanggil setPanelOpen(true) langsung — hook ini tak
// boleh tahu soal panel kanan. Jadi ia menerima `onAutoOpen` dan memanggilnya.
// Ketergantungan yang sama, tapi kini terlihat di tanda tangan fungsi alih-alih
// tersembunyi di tengah effect.

function usePreviewPanel({ selectedProject, onAutoOpen }) {
  const [url, setUrl] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Ref ke iframe, agar Visual Picker bisa menjangkau dokumen DI DALAM
  // render-nya (bukan cuma elemen <iframe> itu sendiri).
  const iframeRef = useRef(null);

  // onAutoOpen disimpan di ref supaya effect di bawah TIDAK berlangganan ulang
  // tiap render. Effect aslinya hanya bergantung pada [selectedProject]; kalau
  // callback ikut masuk dependency array, listener akan dilepas-pasang tiap
  // render dan perilakunya berubah diam-diam.
  const autoOpenRef = useRef(onAutoOpen);
  autoOpenRef.current = onAutoOpen;

  const getDoc = useCallback(() => {
    const f = iframeRef.current;
    return (f && f.contentDocument) || null;
  }, []);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const navigate = useCallback((urlOrPath) => {
    if (!urlOrPath || !urlOrPath.trim()) return;
    const val = urlOrPath.trim();
    const isHttp =
      val.startsWith("http://") ||
      val.startsWith("https://") ||
      val.startsWith("app://");
    setUrl(isHttp ? val : `/preview-file?path=${encodeURIComponent(val)}`);
    setInputUrl(val);
  }, []);

  // Auto-lempar: saat agent MENULIS/MENGUBAH file .html, langsung render di
  // panel preview; bila file yang sama ditulis ulang, cukup refresh iframe.
  // Sumber kebenaran path adalah d.path (hasil resolve tool — akurat walau
  // kurungan workspace me-remap tulisan ke folder lain); fallback: parse d.arg,
  // path relatif diresolve ke folder kerja aktif atau root WOLFSPACE.
  useEffect(() => {
    const onActPreview = (e) => {
      const d = (e && e.detail) || {};
      if (!/write|edit|create|apply|save/i.test(String(d.kind || ""))) return;
      if (d.ok === false) return; // tulisan gagal — jangan preview

      const p = resolveHtmlPath(d, selectedProject);
      if (!p) return;

      const target = "/preview-file?path=" + encodeURIComponent(p);
      setUrl((cur) => {
        if (cur === target) {
          setRefreshKey((k) => k + 1);
          return cur;
        }
        setInputUrl(p);
        return target;
      });
      if (autoOpenRef.current) autoOpenRef.current();
    };
    window.addEventListener("wolfspace_agent_act", onActPreview);
    return () =>
      window.removeEventListener("wolfspace_agent_act", onActPreview);
  }, [selectedProject]);

  return {
    url,
    inputUrl,
    setInputUrl,
    refreshKey,
    iframeRef,
    getDoc,
    navigate,
    refresh,
  };
}

// Tentukan path .html absolut dari event act agent. Dipisah dari effect di atas
// supaya blok percabangannya tak menambah dua level indentasi di dalam listener
// — pola yang diwajibkan gerbang di agent/code-quality.cjs.
function resolveHtmlPath(d, selectedProject) {
  if (/\.html?$/i.test(String(d.path || ""))) return String(d.path);

  const m = String(d.arg || "").match(/([^\s"'`]+\.html?)(?=[\s"'`]|$)/i);
  if (!m) return "";

  const p = m[1];
  const isAbsolute = /^[a-zA-Z]:[\\\/]|^\\\\|^\//.test(p);
  if (isAbsolute) return p;

  const root = resolveWorkspaceRoot(selectedProject) || WOLFSPACE_ROOT;
  return (
    String(root).replace(/[\\\/]+$/, "") + "/" + p.replace(/^[.\/\\]+/, "")
  );
}
