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

// ── BYOK (Bring Your Own Key) Helpers for Web Client Deployment ──
function getBYOKKeys() {
  try {
    const raw = localStorage.getItem("wolfspace_byok_keys");
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveBYOKKey(provider, keyObj) {
  try {
    const keys = getBYOKKeys();
    keys[provider] = typeof keyObj === "string" ? { key: keyObj } : keyObj;
    localStorage.setItem("wolfspace_byok_keys", JSON.stringify(keys));
  } catch (_) {}
}

function hasAnyBYOKKey() {
  const keys = getBYOKKeys();
  return Object.values(keys).some((k) => k && (k.key || typeof k === "string"));
}

// ── Resolusi perintah server MCP dari apa yang diketik user ────────────────
//
// SATU sumber. Logika ini dulu digandakan di Components.jsx dan Screens.jsx,
// dan sudah melenceng: salah satunya memakai sse-bridge.cjs lama (hanya bicara
// SSE, jadi server yang cuma menyediakan /mcp gagal senyap), yang lain sudah
// pindah ke mcp-http-bridge.cjs; figma hanya ada di satu berkas. "Pola dua
// permukaan" yang sama sudah berkali-kali menggigit repo ini.
//
// KENAPA CADANGANNYA BERUBAH. Versi lama menutup dengan:
//     args = ["-y", `@modelcontextprotocol/server-${cleanType}`]
// yaitu MENGARANG nama paket dari nama server. Scope itu hanya memuat segelintir
// server resmi, jadi apa pun di luar daftar itu jadi 404 — dengan pesan npm yang
// tak menyebut bahwa namanya memang dikarang.
//
// Terbukti: mengetik "n8n" menghasilkan @modelcontextprotocol/server-n8n (404),
// "n8n1" menghasilkan server-n8n1 (404). Dua entri mati di config, dan tiap kali
// ditambahkan ulang lewat UI ia lahir kembali.
//
// Sekarang cadangannya memakai apa yang diketik SEBAGAI nama paket. Itu benar
// untuk kasus paling umum (user menyebut paket npm), dan server resmi tetap
// bisa dipakai dengan mengetik nama lengkapnya — yang mengandung "/" sehingga
// ditangani cabang di atasnya.
const MCP_ALIAS = {
  notion: { command: "npx", args: ["-y", "@notionhq/notion-mcp-server"] },
  n8n: { command: "npx", args: ["-y", "n8n-mcp"] },
  figma: { command: "npx", args: ["-y", "figma-developer-mcp", "--stdio"] },
  github: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
  },
  penpot: {
    command: "node",
    args: [
      "C:\langs\node\node_modules\@penpot\mcp\packages\server\dist\index.js",
    ],
  },
};

function mcpResolvePerintah(type) {
  const teks = String(type || "").trim();
  const kecil = teks.toLowerCase();

  // Perintah lengkap diketik apa adanya -> dipakai apa adanya.
  if (kecil.startsWith("npx ") || kecil.startsWith("node ")) {
    const p = teks.split(/\s+/);
    return { command: p[0], args: p.slice(1) };
  }
  // URL remote -> lewat jembatan yang mencoba Streamable HTTP dulu, baru SSE.
  if (kecil.startsWith("http")) {
    return { command: "node", args: ["scripts/mcp-http-bridge.cjs", teks] };
  }
  // Nama paket ber-scope atau berjalur -> paket npm.
  if (teks.includes("/")) return { command: "npx", args: ["-y", teks] };

  if (MCP_ALIAS[kecil]) return MCP_ALIAS[kecil];

  // Cadangan: anggap yang diketik memang nama paket. JANGAN mengarang scope.
  return { command: "npx", args: ["-y", teks] };
}
