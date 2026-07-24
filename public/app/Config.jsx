// Config — konstanta root workspace, DINAMIS dari preload (window.WOLFSPACE.root).
// Dimuat PERTAMA via APP_MODULES agar tersedia untuk semua modul & app.jsx.
// Menghasilkan nilai identik dengan hardcode lama saat folder masih "quantum",
// tapi otomatis ikut bila folder di-rename (mis. -> wolfspace) — tanpa ubah kode.
const _wsRaw =
  (typeof window !== "undefined" && window.WOLFSPACE && window.WOLFSPACE.root) ||
  "C:\\Users\\dave\\quantum";
// Bentuk native Windows (drive di-lowercase) — untuk pembanding path tersimpan.
const WOLFSPACE_ROOT_WIN = _wsRaw.replace(/^[A-Za-z]:/, (m) => m.toLowerCase());
// Bentuk forward-slash lowercase — dipakai saat menyusun path workspace.
const WOLFSPACE_ROOT = WOLFSPACE_ROOT_WIN.replace(/\\/g, "/").toLowerCase();
