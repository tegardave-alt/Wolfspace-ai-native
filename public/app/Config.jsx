// Config — konstanta root workspace, DINAMIS dari preload (window.WOLFSPACE.root).
// Dimuat PERTAMA via APP_MODULES agar tersedia untuk semua modul & app.jsx.
// Menghasilkan nilai identik dengan hardcode lama saat folder masih "quantum",
// tapi otomatis ikut bila folder di-rename (mis. -> wolfspace) — tanpa ubah kode.
const _wsRaw =
  (typeof window !== "undefined" &&
    window.WOLFSPACE &&
    window.WOLFSPACE.root) ||
  "C:\\Users\\dave\\quantum";
// Bentuk native Windows (drive di-lowercase) — untuk pembanding path tersimpan.
const WOLFSPACE_ROOT_WIN = _wsRaw.replace(/^[A-Za-z]:/, (m) => m.toLowerCase());
// Bentuk forward-slash lowercase — dipakai saat menyusun path workspace.
const WOLFSPACE_ROOT = WOLFSPACE_ROOT_WIN.replace(/\\/g, "/").toLowerCase();

// Level effort agent (0=Low, 1=Medium, 2=High) — SATU sumber kebenaran.
//
// Dulu nilai ini dibaca di tiga tempat dengan logika berbeda, dan dua di
// antaranya salah: `parseInt(...) || 1` mengubah 0 menjadi 1, karena `||`
// memperlakukan 0 sebagai falsy. Akibatnya saat pengguna memilih Low DAN belum
// ada config cloud, UI menampilkan "Low" sementara permintaan mengirim Medium —
// diam-diam, tanpa tanda apa pun. Effort Low memotong riwayat ke 6 pesan dan
// membatasi agent ke 6 langkah, jadi selisihnya nyata, bukan kosmetik.
//
// Config cloud menang atas localStorage: di situlah UI menyimpannya begitu ada
// cloud, dan nilainya ikut berpindah antar perangkat bersama config.
function readEffort(cloudCfg) {
  if (cloudCfg && typeof cloudCfg.effort !== "undefined") {
    const n = Number(cloudCfg.effort);
    if (Number.isFinite(n)) return n;
  }
  try {
    const n = parseInt(localStorage.getItem("wolfspace_effort"), 10);
    // Number.isFinite, BUKAN `|| 1` — inilah yang dulu menelan nilai 0.
    if (Number.isFinite(n)) return n;
  } catch (_) {}
  return 1; // Medium bila belum pernah disetel
}
