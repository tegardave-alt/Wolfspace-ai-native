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

  const refresh = useCallback(() => {
    setGagalLuar(false);
    setRefreshKey((k) => k + 1);
  }, []);

  // ── Situs luar dimuat lewat <webview>, bukan <iframe> ──
  //
  // <iframe> di renderer ini TIDAK BISA memuat situs luar sama sekali. Diukur
  // sampai tuntas: permintaan subFrame dikirim lalu net::ERR_ABORTED sebelum
  // satu pun header respons kembali. Yang sudah disingkirkan sebagai penyebab,
  // masing-masing diuji terpisah: atribut sandbox iframe, CSP <meta> produksi,
  // X-Frame-Options situsnya, User-Agent Electron, dan jaringan (net.fetch dari
  // proses main mengembalikan 200, 473 KB dari Bing).
  //
  // Yang memutuskan adalah uji pemakai: wikipedia.org pun kosong, padahal
  // Wikipedia TERBUKTI bisa di-frame — 3600 karakter ter-render di Chromium
  // bersih dengan CSP yang sama persis. Jadi ini bukan kebijakan per-situs.
  //
  // <webview> bukan subframe: ia WebContents tamu yang bernavigasi sendiri.
  // Berkas lokal TETAP lewat <iframe>, karena Visual Picker menjangkau
  // contentDocument dan webview tak mengizinkan itu.
  const webviewRef = useRef(null);
  const [gagalLuar, setGagalLuar] = useState("");

  const navigate = useCallback((urlOrPath) => {
    const t = tafsirkanAlamat(urlOrPath);
    if (!t) return;
    setGagalLuar(false);
    setUrl(t.url);
    // Yang ditampilkan di bilah adalah HASIL resolusinya, sama seperti browser:
    // mengetik "github.com" lalu melihatnya berubah jadi "https://github.com"
    // adalah umpan balik bahwa tebakannya benar. Untuk berkas, path aslinya yang
    // dipertahankan — itu yang berguna, bukan /preview-file?path=…
    setInputUrl(t.tampil);
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

  // Alamat luar (http/https) -> <webview>; sisanya (berkas via app://) -> <iframe>.
  const alamatLuar = /^https?:\/\//i.test(url);

  // Kegagalan webview DILAPORKAN, tak seperti iframe yang diam saja. Pesannya
  // diambil dari peristiwanya sendiri supaya yang tampil adalah sebab yang
  // sebenarnya — bukan tebakan "situsnya menolak" yang, saat diuji dengan
  // wikipedia.org, ternyata keliru menyalahkan situs.
  useEffect(() => {
    const w = webviewRef.current;
    if (!w || !alamatLuar) return;
    const gagal = (e) => {
      // -3 = ERR_ABORTED, yang juga muncul pada navigasi yang DIBATALKAN oleh
      // pengalihan biasa. Melaporkannya akan menandai halaman sehat sebagai
      // gagal, jadi ia sengaja dilewati.
      if (e.errorCode === -3 || !e.isMainFrame) return;
      setGagalLuar(e.errorDescription + " (" + e.errorCode + ")");
    };
    const mulai = () => setGagalLuar("");
    w.addEventListener("did-fail-load", gagal);
    w.addEventListener("did-start-loading", mulai);
    return () => {
      w.removeEventListener("did-fail-load", gagal);
      w.removeEventListener("did-start-loading", mulai);
    };
  }, [alamatLuar, url, refreshKey]);

  return {
    url,
    inputUrl,
    setInputUrl,
    refreshKey,
    iframeRef,
    webviewRef,
    luar: alamatLuar,
    getDoc,
    navigate,
    refresh,
    gagalLuar,
  };
}

// ── Bilah alamat sebagai OMNIBOX, bukan cuma kotak path ──
//
// Dulu cabangnya cuma dua: kalau diawali http/https/app anggap URL, selain itu
// anggap path berkas. Akibatnya panel ini hanya berguna untuk melihat hasil
// generate agent — mengetik "github.com" mencoba membuka berkas bernama
// "github.com" dan gagal, dan mengetik pertanyaan tak melakukan apa pun.
//
// Sekarang isinya ditafsirkan seperti bilah alamat browser. Urutannya penting,
// dan yang paling menentukan adalah EKSTENSI BERKAS DIPERIKSA SEBELUM NAMA
// DOMAIN: "index.html" harus jadi berkas, padahal ia juga cocok dengan bentuk
// domain. Sebaliknya "example.com" bukan berkas karena ".com" bukan ekstensi
// yang kita kenali. Tanpa urutan itu, kasus paling umum di aplikasi ini —
// membuka berkas .html hasil agent — justru yang rusak.
//
// Perhatikan juga ".md" dan ".sh": keduanya TLD sungguhan (Moldova, Saint
// Helena), tapi di aplikasi ini nyaris selalu berarti berkas. Ambiguitas itu
// diputus ke arah berkas dengan sengaja.
const _EKSTENSI_BERKAS =
  /\.(html?|md|markdown|txt|json|jsx?|tsx?|css|svg|xml|ya?ml|csv|log|sh|ps1|py|rb|go|rs|java|c|h|cpp|cs|php|toml|ini|pdf|png|jpe?g|gif|webp)$/i;

// Host tanpa skema: "github.com", "sub.domain.co.uk/path", "localhost:3000".
const _BENTUK_HOST =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#].*)?$/i;
const _BENTUK_LOKAL =
  /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|(?:\d{1,3}\.){3}\d{1,3})(?::\d{1,5})?(?:[/?#].*)?$/i;

// Mesin pencari BAWAAN: Bing.
//
// Pilihannya ditentukan pengukuran, bukan selera. Panel ini sebuah <iframe>,
// dan sebagian besar mesin pencari menolak ditampilkan di dalam frame lewat
// header mereka sendiri — yang tak bisa dilawan dari sisi kita. Terukur:
//
//   Google      X-Frame-Options: SAMEORIGIN     -> TIDAK bisa
//   Brave       X-Frame-Options: SAMEORIGIN     -> TIDAK bisa
//   Startpage   X-Frame-Options: SAMEORIGIN     -> TIDAK bisa
//   Mojeek      frame-ancestors 'none'          -> TIDAK bisa
//   Bing        (tak ada header pembatas)       -> BISA, hasil nyata ter-render
//
// Bisa diganti lewat localStorage `wolfspace_mesin_cari` (pakai %s untuk kueri)
// bagi yang punya SearXNG sendiri atau menerima hasilnya dibuka di browser luar
// lewat tombol "Open in an external tab/browser" yang sudah ada di sebelahnya.
const _MESIN_BAWAAN = "https://www.bing.com/search?q=%s";
function _mesinCari() {
  try {
    const m = localStorage.getItem("wolfspace_mesin_cari");
    if (m && m.includes("%s")) return m;
  } catch (_) {}
  return _MESIN_BAWAAN;
}

/**
 * Tafsirkan isi bilah alamat.
 * @returns {{jenis: "url"|"berkas"|"cari", url: string, tampil: string}|null}
 */
function tafsirkanAlamat(teks) {
  const val = String(teks == null ? "" : teks).trim();
  if (!val) return null;

  const berkas = (p) => ({
    jenis: "berkas",
    url: "/preview-file?path=" + encodeURIComponent(p),
    tampil: p,
  });
  const langsung = (u) => ({ jenis: "url", url: u, tampil: u });

  // 1) Skema eksplisit — pemakai sudah menyatakan maksudnya, jangan ditebak lagi.
  if (/^(https?|app|file|data|about):/i.test(val)) return langsung(val);

  // 2) Path absolut: "C:\...", "\\server\share", "/usr/...".
  if (/^[a-zA-Z]:[\\/]/.test(val) || /^\\\\/.test(val) || /^\//.test(val))
    return berkas(val);

  // 3) Path relatif yang jelas: mengandung pemisah ATAU berekstensi yang dikenal.
  //    HARUS sebelum pemeriksaan domain (lihat catatan di atas).
  if (
    /^\.{1,2}[\\/]/.test(val) ||
    (/[\\/]/.test(val) && _EKSTENSI_BERKAS.test(val))
  )
    return berkas(val);
  if (_EKSTENSI_BERKAS.test(val) && !/\s/.test(val)) return berkas(val);

  // 4) Host lokal -> http (bukan https: server dev jarang punya sertifikat, dan
  //    https ke port lokal gagal dengan galat sertifikat yang membingungkan).
  if (_BENTUK_LOKAL.test(val)) return langsung("http://" + val);

  // 5) Nama domain -> https.
  if (_BENTUK_HOST.test(val)) return langsung("https://" + val);

  // 6) Sisanya: perlakukan sebagai kueri pencarian.
  return {
    jenis: "cari",
    url: _mesinCari().replace("%s", encodeURIComponent(val)),
    tampil: val,
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
