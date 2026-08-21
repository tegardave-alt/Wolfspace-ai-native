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
  // Wadah KOSONG yang cuma menandai DI MANA browser harus digambar. Isinya
  // bukan DOM: WebContentsView hidup di proses main dan mengambang di atas
  // jendela, jadi yang dikirim ke sana adalah persegi panjang wadah ini.
  const slotRef = useRef(null);
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

  // Alamat luar (http/https) -> WebContentsView; sisanya (berkas) -> <iframe>.
  const alamatLuar = /^https?:\/\//i.test(url);

  const ipc =
    typeof window !== "undefined" && window.WOLFSPACE && window.WOLFSPACE.ipc
      ? window.WOLFSPACE
      : null;

  // Posisi view disuapi dari sini, dan HARUS terus disuapi: ia mengambang di
  // atas jendela, jadi ia tak ikut bergerak saat panel di-resize, sidebar
  // dibuka, atau jendela diubah ukurannya. Satu pengamat menutup ketiganya.
  useEffect(() => {
    if (!ipc || !alamatLuar) {
      if (ipc) ipc.invoke("browser", { aksi: "sembunyi" }).catch(() => {});
      return;
    }
    const el = slotRef.current;
    if (!el) return;
    let terakhir = "";
    let mati = false; // proses main belum punya kanal ini -> berhenti mencoba
    const suapi = (aksi) => {
      if (mati) return;
      const r = el.getBoundingClientRect();
      const kunci = [r.x, r.y, r.width, r.height].join(",");
      if (aksi === "tampil" && kunci === terakhir) return;
      terakhir = kunci;
      // Kegagalan HARUS ditangkap. Denyut di bawah memanggil ini 2,5x per detik;
      // tanpa .catch, satu proses main yang belum diperbarui membanjiri konsol
      // dengan "unknown invoke channel: browser" tanpa henti — dan pemakai tetap
      // tak diberi tahu apa yang sebenarnya harus dilakukan.
      //
      // WebContentsView dibuat oleh proses MAIN, dan hot-reload tak menjangkau
      // proses itu. Jadi sesudah pembaruan ini, aplikasi memang harus ditutup
      // dan dibuka lagi — dan itulah yang dikatakan di sini, sekali saja.
      ipc
        .invoke("browser", {
          aksi,
          url,
          bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
        })
        .then((r) => {
          // Sisi RENDERER mencatat apa yang dijawab sisi MAIN. Electron dua
          // mesin, dan saat panel putih pertanyaannya selalu "yang mana yang
          // gagal" — jawabannya cuma bisa dilihat kalau kedua sisi bicara.
          // console.log renderer diteruskan ke WOLFSPACE-debug.log.
          if (aksi === "buka") console.warn("[browser:renderer] open ->", r);
          if (r && r.ok === false)
            setGagalLuar("Proses utama menolak: " + r.error);
          else if (r && r.bounds && (!r.bounds.width || !r.bounds.height))
            setGagalLuar(
              "Panel has zero size (" +
                r.bounds.width +
                "x" +
                r.bounds.height +
                ") — the browser has nowhere to draw.",
            );
        })
        .catch((e) => {
          mati = true;
          setGagalLuar(
            /unknown invoke channel/i.test(String((e && e.message) || e))
              ? "Quit and reopen WOLFSPACE — the browser panel is run by the " +
                  "main process, which hot-reload does not reach."
              : "Could not set up the browser panel: " +
                  ((e && e.message) || e),
          );
        });
    };
    suapi("buka");
    const ro = new ResizeObserver(() => suapi("tampil"));
    ro.observe(el);
    const onResize = () => suapi("tampil");
    window.addEventListener("resize", onResize);
    // Panel bisa bergeser tanpa berubah ukuran (sidebar dibuka/ditutup), dan
    // ResizeObserver tak melihat itu. Denyut pelan menutup celahnya tanpa
    // membebani apa pun.
    const nadi = setInterval(() => suapi("tampil"), 400);
    return () => {
      clearInterval(nadi);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      ipc.invoke("browser", { aksi: "sembunyi" }).catch(() => {});
    };
  }, [ipc, alamatLuar, url, refreshKey]);

  // Keadaan datang lewat IPC, bukan dari DOM: viewnya hidup di proses lain.
  useEffect(() => {
    if (!ipc || !ipc.onBrowser) return;
    return ipc.onBrowser((m) => {
      // Semua peristiwa dicatat, bukan hanya yang dipakai UI. Saat panel putih,
      // urutan peristiwa inilah yang membedakan "tak pernah mulai memuat" dari
      // "memuat lalu gagal" dari "selesai memuat tapi tak terlihat" — tiga sebab
      // yang di layar tampak persis sama.
      console.warn("[browser:peristiwa]", m.t, m);
      if (m.t === "muat") setGagalLuar("");
      else if (m.t === "gagal")
        setGagalLuar((m.desc || "failed to load") + " (" + m.kode + ")");
      else if (m.t === "pindah" && m.url) setInputUrl(m.url);
    });
  }, [ipc]);

  return {
    url,
    inputUrl,
    setInputUrl,
    refreshKey,
    iframeRef,
    slotRef,
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
