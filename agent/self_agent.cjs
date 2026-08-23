// Install the .ts hook FIRST: modules below require TypeScript files, and
// this file can itself be an entry point — tests require it directly, and
// `node -e` subprocesses load it without ever going through server.cjs.
require("../scripts/ts-register.cjs");
// Self-agent stream implementation (extracted and modularized from server.cjs)
// Dependencies – same as original server.cjs
const { dlog } = require("./debug.cjs");
const {
  fillCloudKey,
  detectProvider,
  CLOUD,
  CLOUD_KEYS,
  loadCloudKeys,
  askCloudTools,
} = require("./cloud.cjs");
const {
  runSelfTool,
  SELF_TOOLS,
  qBackup,
  qBackupAsync,
} = require("./tools.cjs");
// runReply DIHAPUS dari chat.cjs — ia tak menjalankan apa pun, hanya
// mengembalikan {ok:true, info:"auto-run disabled"} yang dulu dipancarkan
// sebagai field `run` di event adone. Verifikasi nyata ada di tool agent.
const { getOptimized, optimizeInBackground } = require("./sysprompt_opt.cjs");
const {
  parsePseudoCalls,
  stripPseudoTags,
} = require("./pseudo-tag-filter.cjs");
const os = require("os");
// ── langgraph dimuat SAAT DIPAKAI, bukan saat modul ini dibaca ──
//
// Ia dependensi termahal di seluruh aplikasi, dan harganya dibayar di tempat
// yang paling terasa. Terukur:
//
//   require("./core.js")        1071 ms   570 modul
//     dari node_modules          533 modul (93%)
//     kode sendiri                37 modul  (7%)
//   require("@langchain/langgraph")  987 ms   <- hampir seluruhnya satu ini
//   require("zod")                   235 ms
//
// Dan itu bukan biaya sekali. electron/main.js membuang SELURUH require.cache
// proyek pada tiap hot-reload lalu memuat core lagi — di proses UTAMA Electron,
// yang berarti ~1 detik jendela membeku setiap kali agent menyentuh berkasnya
// sendiri. server.cjs juga membuang cache modul INI di setiap request
// /self-agent.
//
// Yang berubah cuma KAPAN, bukan berapa: biayanya pindah ke panggilan agent
// pertama, tempat ia tenggelam di antara panggilan cloud yang memang sedetik.
// Aplikasi yang dibuka untuk membaca kode atau melihat preview tak membayarnya
// sama sekali.
let _lg = null;
function lg() {
  return (_lg = _lg || require("@langchain/langgraph"));
}

// server.cjs me-`delete require.cache` untuk modul ini di SETIAP request /self-agent
// (hot-reload agar agent melihat perubahan source-nya sendiri). Itu me-recreate semua
// state module-level — termasuk checkpointer HITL. Kalau MemorySaver dibuat ulang tiap
// request, checkpoint dari run yang dijeda HITL hilang dan resume tak pernah menemukan
// pending tool call-nya. Simpan di globalThis supaya SATU instance bertahan lintas reload.
//
// Sekarang ia juga FUNGSI, bukan konstanta: membuat MemorySaver menuntut
// langgraph termuat, dan itu persis yang sedang ditunda. Penyimpanannya di
// globalThis tak berubah, jadi jaminan "satu instance lintas reload" tetap.
function memoriAgen() {
  return (
    globalThis.__wolfspaceAgentMemory ||
    (globalThis.__wolfspaceAgentMemory = new (lg().MemorySaver)())
  );
}
// System prompt for function-calling self-agent
const path = require("path");
const PROMPTS_CFG_PATH = path.join(__dirname, "..", "config", "prompts.json");

// ===================== SISTEM ATURAN AGENT (HARDCODED RULES) =====================
// Aturan yang dipindahkan dari prompt ke sistem untuk kepatuhan 100%
const SYSTEM_RULES = {
  // FORBIDDEN_SPECULATIVE DIHAPUS — jangan dihidupkan lagi. Lihat catatan di
  // bekas sanitizeOutput() di bawah untuk alasannya.
  //
  // Urutan tool yang wajib dicoba sebelum menyatakan "tidak ada"
  REQUIRED_TOOL_SEQUENCE: ["grep", "glob", "web_search"],
  // Minimal tools yang gagal sebelum bisa menyerah
  MIN_FAILED_TOOLS: 3,
  // Berapa kali satu ITEM checklist boleh gagal sebelum run BERHENTI dan bertanya.
  //
  // KENAPA ADA. Checklist adalah ground truth yang disuntik ulang tiap langkah —
  // tapi ia dulu tak punya status "gagal" sama sekali (_TODO_ICON hanya mengenal
  // completed/in_progress/cancelled/pending), dan kegagalan tak pernah menyentuh
  // task_checklist. Akibatnya item yang sudah dicoba dan gagal tetap tampil
  // "[→] sedang dikerjakan" selamanya. Untuk tahu ia pernah gagal, model HARUS
  // menggali riwayat percakapan — persis hal yang paling cepat memburuk saat
  // konteks memanjang. Jadi jangkarnya bocor tepat di tempat yang paling perlu.
  //
  // MAX_STEPS memang sudah membatasi, tapi ia plafon BUTA: ia membunuh run tanpa
  // memberitahu apa yang macet. Batas ini beda — ia berhenti pada item yang
  // SPESIFIK, membawa sebabnya, dan bertanya ke user alih-alih menyerah diam-diam.
  MAX_ITEM_ATTEMPTS: 3,

  // Berapa kali run boleh DIDORONG melanjutkan saat model menutup giliran dengan
  // TEKS padahal checklist masih terbuka.
  //
  // KENAPA ADA. Cabang penutup di executor memperlakukan "ada content, tak ada
  // tool_calls" sebagai jawaban akhir dan MENGAKHIRI run — tanpa sekali pun
  // melihat apakah pekerjaannya sudah tuntas. Untuk model yang gemar
  // mengumumkan rencananya dalam prosa sebelum bertindak, satu kalimat niat
  // sudah cukup untuk membunuh run di tengah jalan.
  //
  // Terekam di log run nyata (GLM-5.2, tugas landing page):
  //   step 5  toolCalls=3            <- sedang bekerja
  //   step 6  content=176 toolCalls=0 -> stop "text_response_no_tools"
  // Checklist masih 0/4, tapi run sudah ditutup dan kalimat niat itu yang
  // ditampilkan sebagai hasil akhir. Dari layar, gejalanya persis "agent
  // berhenti sendiri dan tidak mengikuti todo".
  //
  // Dibatasi supaya tak jadi loop: kalau sesudah beberapa dorongan model tetap
  // menarasikan, run ditutup seperti sebelumnya — sekarang dengan catatan jujur
  // bahwa checklist belum tuntas.
  MAX_CONTINUE_NUDGE: 3,
};

// Simpan bukti dari tool yang sudah diakses untuk validasi
const accessedEvidence = new Set();
let failedTools = new Set();

// sanitizeOutput() DIHAPUS — dulu ia menyapu kata spekulatif dari jawaban akhir
// dan menggantinya dengan penanda "[kata-spekulatif-dihapus]". Penanda itu ikut
// TAMPIL ke user, jadi jawaban yang benar pun terlihat rusak.
//
// Menghapus KATANYA saja (tanpa penanda) justru lebih berbahaya, dan itu sebabnya
// penyapu ini tidak diganti melainkan dibuang:
//
//   "File config mungkin tidak ada"  ->  "File config tidak ada"
//
// Dugaan berubah jadi pernyataan pasti. Penyapu itu tak pernah menghapus
// spekulasinya — ia hanya menghapus TANDA bahwa itu spekulasi, lalu menyajikan
// tebakan sebagai fakta. Untuk alat yang gunanya melaporkan keadaan kode
// sebenarnya, itu kegagalan yang jauh lebih mahal daripada penanda jelek.
//
// Spekulasi yang benar-benar berbahaya — model MENARASIKAN hasil eksekusi yang
// tak pernah dijalankan — sudah ditangani di tempat yang tepat oleh
// SIMULATION_CLAIMS + force_retry: modelnya DISURUH ULANG memanggil tool nyata,
// bukan kalimatnya yang diedit diam-diam sesudah jadi.

// Buang blok reasoning (<think>...</think>) dan tag think yang nyasar/tak berpasangan.
// cloud.cjs membungkus reasoning-delta dengan tag ini untuk tampilan streaming, dan
// beberapa model (DeepSeek R1 dkk.) juga mengeluarkannya sendiri — apapun sumbernya,
// isi think TIDAK BOLEH tampil sebagai jawaban ke user.
// ── Perkakas bersama: memperlakukan KODE sebagai wilayah terlarang ──
//
// Semua penyaring jawaban di bawah ini bekerja dengan regex di atas teks bebas.
// Masalahnya, jawaban model bukan teks bebas: sebagian isinya adalah kode dan
// diagram yang KEBETULAN memuat kata atau tanda yang sedang dicari penyaring.
// Tanpa pembatas, penyaring memotong kode pemakai.
//
// Kasus nyata yang memicu perkakas ini (ketiganya terukur, bukan dugaan):
//   - `const Kesimpulan: 1;` di dalam ```js kehilangan kata "Kesimpulan:"
//   - menyebut tag `</think>` di dalam backtick membuang SELURUH kalimat
//     sebelumnya, karena aturan "closer tanpa opener" berjangkar di awal teks
//   - pemotongan panjang jatuh di tengah ``` sehingga sisa jawaban terender
//     sebagai kode
//
// Polanya menangkap blok berpagar utuh, pagar yang TAK tertutup sampai akhir
// (sering terjadi saat model memotong dirinya sendiri), dan kode sebaris.
const _POLA_KODE = /```[\s\S]*?```|```[\s\S]*$|`[^`\n]*`/g;

// Ganti setiap potongan kode dengan penanda, jalankan penyaring, lalu pasang
// kembali. Dipakai untuk penyaring yang regex-nya BERJANGKAR (^ / $) sehingga
// tak bisa sekadar dijalankan per-potongan.
function _tanpaKode(text, saring) {
  const simpan = [];
  const bertanda = String(text).replace(_POLA_KODE, (m) => {
    simpan.push(m);
    return " K" + (simpan.length - 1) + " ";
  });
  const hasil = saring(bertanda);
  return hasil.replace(/ K(\d+) /g, (_, i) =>
    simpan[+i] === undefined ? "" : simpan[+i],
  );
}

// Pisah per baris kosong, TAPI blok berpagar diperlakukan UTUH.
//
// `split(/\n\s*\n/)` biasa menganggap baris kosong di dalam ``` sebagai batas
// paragraf, lalu pemanggilnya men-trim tiap potongan — indentasi kode hilang
// dan bloknya terbelah jadi pagar yang tak berpasangan.
function _paragrafSadarPagar(t) {
  const out = [];
  let buf = [],
    dalamPagar = false;
  for (const b of String(t).split("\n")) {
    if (/^\s*```/.test(b)) dalamPagar = !dalamPagar;
    if (!dalamPagar && !b.trim()) {
      if (buf.length) out.push(buf.join("\n"));
      buf = [];
      continue;
    }
    buf.push(b);
  }
  if (buf.length) out.push(buf.join("\n"));
  return out;
}

function stripThinkBlocks(text) {
  // Fast-path HARUS case-insensitive: regex di bawah pakai flag /i, jadi cek awal
  // yang case-sensitive (indexOf) akan salah early-return untuk <THINK>/</Think>
  // dan membocorkannya mentah. Toleransi spasi opsional (< think >) juga, karena
  // sebagian model mengeluarkan dialek itu.
  if (!text || !/think\s*>/i.test(text)) return text;
  // Blok berpasangan dibuang lebih dulu dan TANPA perlindungan kode: sebuah
  // <think>…</think> utuh memang reasoning, di mana pun ia berada.
  const berpasangan = text.replace(
    /<\s*think[^>]*>[\s\S]*?<\s*\/\s*think\s*>/gi,
    "",
  );
  // Dua aturan sisanya menyapu ke awal/akhir teks, jadi keduanya HARUS buta
  // terhadap kode — kalau tidak, sekadar MENYEBUT tag di dalam contoh kode
  // membuang jawaban yang mengelilinginya.
  return _tanpaKode(berpasangan, (t) =>
    t
      .replace(/^[\s\S]*?<\s*\/\s*think\s*>/i, "") // closer tanpa opener: semua sebelumnya = reasoning bocor
      .replace(/<\s*think[^>]*>[\s\S]*$/i, ""),
  ) // opener tanpa closer: sisa stream = reasoning
    .trim();
}

// Apakah sepotong teks itu CATATAN KERJA, bukan kesimpulan?
//
// Ciri catatan kerja: didominasi baris daftar/pemetaan, nyaris tanpa kalimat.
// Contoh nyata yang memicu perbaikan ini — potongan yang sampai ke layar user
// dengan label "berikut kesimpulan dari proses berpikirnya":
//
//   Language to Devicon mapping:
//   - js → devicon-javascript-plain
//   - ts → devicon-typescript-plain
//   ... (terpotong di tengah daftar)
//
// Itu tabel rujukan yang sedang disusun model, bukan jawaban. Menyebutnya
// kesimpulan membuat user membaca catatan setengah jadi sebagai hasil kerja.
function _tampakCatatanKerja(teks) {
  const baris = String(teks || "")
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean);
  if (baris.length < 3) return false;
  const daftar = baris.filter((b) =>
    /^[-*•|]|\s(?:→|->|=>)\s|^\d+[.)]\s/.test(b),
  ).length;
  // Kalimat = baris yang diakhiri titik/tanya/seru dan cukup panjang.
  const kalimat = baris.filter((b) => b.length > 40 && /[.!?]$/.test(b)).length;
  return daftar / baris.length >= 0.6 && kalimat <= 1;
}

// Ambil kesimpulan dari monolog reasoning saat model tak pernah menutup
// jawabannya di `content`.
//
// MENGEMBALIKAN JENISNYA, bukan cuma teks. Versi lama selalu mengembalikan
// string dan pemanggilnya selalu memberi label "berikut kesimpulan dari proses
// berpikirnya" — padahal hanya cabang PERTAMA yang benar-benar menemukan
// kesimpulan. Cabang kedua sekadar mengambil paragraf terakhir, dan paragraf
// terakhir sebuah monolog sering justru bagian yang belum selesai.
//
// Labelnya harus mengikuti isinya. Kalau tidak, user membaca catatan kerja
// sebagai jawaban — dan itu lebih buruk daripada tidak menampilkan apa pun,
// karena ia terlihat seperti hasil yang sah.
//
// @returns {{teks: string, jenis: "kesimpulan"|"catatan"|"kosong"}}
function salvageReasoning(reasoning) {
  let t = String(reasoning || "");
  if (!t.trim()) return { teks: "", jenis: "kosong" };
  t = stripThinkBlocks(t) || t; // buang tag think bila reasoning ikut membawanya
  t = t.trim();
  if (!t) return { teks: "", jenis: "kosong" };

  // 1) Penanda kesimpulan eksplisit — ambil dari kemunculan TERAKHIR.
  //    Hanya cabang ini yang boleh disebut "kesimpulan".
  const marker =
    /(?:^|\n)\s*(?:kesimpulan|jawaban akhir|final answer|jadi,|singkatnya|ringkasnya)\s*[:\-]?\s*/gi;
  let lastIdx = -1;
  for (const m of t.matchAll(marker)) lastIdx = m.index + m[0].length;
  if (lastIdx > -1) {
    const tail = t.slice(lastIdx).trim();
    // Ambangnya dulu 40 karakter, dan itu membuang kesimpulan PENDEK yang justru
    // paling baik: "Kesimpulan: penyebabnya port kosong." (36 char) jatuh ke
    // cabang paragraf dan tampil berlabel "catatan", padahal model sudah
    // menyatakannya sebagai kesimpulan secara eksplisit. Yang perlu ditolak
    // hanya penanda yang menggantung tanpa isi.
    if (tail.length > 12) {
      return { teks: tail.slice(0, 4000), jenis: "kesimpulan" };
    }
  }

  // 2) Tanpa penanda: paragraf terakhir. Ini BUKAN kesimpulan, dan tak boleh
  //    disebut begitu.
  //
  //    Pemisahnya sadar-pagar. `split(/\n\s*\n/)` biasa menganggap baris kosong
  //    DI DALAM ``` sebagai batas paragraf; potongan lalu diambil dari belakang
  //    sampai kuota habis, jadi sebuah blok kode bisa terbawa separuh — pagar
  //    pembuka tanpa penutup, dan indentasi barisnya hilang kena .trim().
  //    Itu persis bentuk keluaran rusak yang terlihat di layar: blok "New:"
  //    yang isinya tak lagi berupa kode.
  const paras = _paragrafSadarPagar(t).filter((p) => p.trim());
  const out = [];
  let n = 0;
  for (let i = paras.length - 1; i >= 0 && n < 1200; i--) {
    out.unshift(paras[i].trim());
    n += paras[i].length;
  }
  // `.slice(0, 4000)` masih bisa jatuh di tengah blok, dan monolog reasoning
  // sendiri kerap berhenti mendadak dengan pagar yang belum ditutup. Keduanya
  // ditutup di sini: pagar ganjil berarti UI akan merender sisa pesan — termasuk
  // teks di luar blok — sebagai kode.
  let ekor = out.join("\n\n").slice(0, 4000);
  if ((ekor.match(/```/g) || []).length % 2 === 1) ekor += "\n```";

  // Catatan kerja murni TIDAK diselamatkan sama sekali. Daftar pemetaan
  // setengah jadi tak menjawab apa pun, dan menampilkannya hanya membuat user
  // mengira ada hasil.
  if (!ekor || _tampakCatatanKerja(ekor)) return { teks: "", jenis: "kosong" };
  return { teks: ekor, jenis: "catatan" };
}

// Terjemahkan kegagalan provider jadi sebab yang BENAR.
//
// KENAPA ADA. Saat semua provider habis, run ditutup dengan satu kalimat tetap:
// "Cloud API error — coba lagi dalam beberapa detik." Pesan aslinya dibuang,
// padahal ia sudah menyebut persis apa yang salah. Yang terjadi pada run nyata:
//
//   opencode 429 FreeUsageLimitError            -> beralih ke github
//   custom   402 "Insufficient credit. Add funds at zyloo.io/…/billing."
//   puter    402 "No usage left for request."   -> berhenti
//   yang dilihat pemakai: "coba lagi dalam beberapa detik."
//
// Nasihat itu SALAH untuk 402: kredit habis tak akan pulih dengan menunggu.
// Pemakai menunggu, mencoba lagi, gagal lagi, dan tak punya satu pun petunjuk
// bahwa yang perlu dilakukan ada di dasbor penagihan providernya. Gejalanya
// terbaca sebagai "aplikasinya rusak".
//
// Jadi yang dibedakan hanyalah apakah MENUNGGU menolong atau tidak, karena cuma
// itu yang mengubah tindakan pemakai berikutnya.
function _ringkasGagalCloud(provider, err, gagal) {
  const pesan = String((err && err.message) || err || "");
  const dicoba = Array.isArray(gagal) && gagal.length ? gagal : [];
  const semua = dicoba.concat(
    provider && !dicoba.includes(provider) ? [provider] : [],
  );
  const daftar = semua.length ? " (dicoba: " + semua.join(", ") + ")" : "";
  const inti = pesan.replace(/\s+/g, " ").slice(0, 160);

  // Kredit/kuota habis, atau kunci ditolak: MENUNGGU TIDAK MENOLONG.
  if (
    /\b40[123]\b/.test(pesan) ||
    /insufficient|no usage left|quota|credit|billing|payment|unauthorized|invalid[_ ]?api[_ ]?key/i.test(
      pesan,
    )
  )
    return (
      "Semua provider cloud menolak permintaan ini" +
      daftar +
      ". Bukan gangguan sesaat — menunggu tidak akan menolong: kuota/kredit habis " +
      "atau kunci ditolak. Isi ulang kredit di dasbor providernya, atau tambahkan " +
      "kunci provider lain.\n\nBalasan terakhir: " +
      inti
    );

  // Batas laju: menunggu MEMANG menolong.
  if (/\b429\b/.test(pesan) || /rate[ _-]?limit|too many requests/i.test(pesan))
    return (
      "Semua provider cloud sedang kena batas laju" +
      daftar +
      ". Ini sementara — coba lagi sebentar lagi.\n\nBalasan terakhir: " +
      inti
    );

  return (
    "Permintaan ke provider cloud gagal" +
    daftar +
    ".\n\nBalasan terakhir: " +
    inti
  );
}

// Hapus rekapitulasi tool / daftar bukti / kalimat pengantar yang tidak perlu.
//
// DULU FUNGSI INI BISA MENGHAPUS SELURUH JAWABAN. Kedua polanya berbentuk
// `[\s\S]*?(?=…|$)` — sapuan malas yang berhenti di penanda berikutnya, dengan
// `$` sebagai alternatif terakhir. Kalau penanda itu tak pernah muncul (dan
// biasanya memang tidak: model jarang menulis "Kesimpulan:"), `$` berarti AKHIR
// SELURUH TEKS. Jawaban yang dibuka dengan "Berikut bukti dari tool yang telah
// dijalankan: …" karena itu keluar sebagai string KOSONG — terukur, bukan
// dugaan: masukan 3 paragraf, keluaran "".
//
// Sekarang penghapusan DIBATASI PARAGRAF. Rekap tool memang satu paragraf, dan
// batas itu membuat kerusakan terburuk yang mungkin terjadi hanya sebesar satu
// paragraf, bukan sisa jawaban. Blok berpagar tak pernah disentuh.
const _AWAL_REKAP =
  /^\s*(?:Berikut bukti dari tool yang telah dijalankan|Tool\s+(?:grep|read|glob|list|bash|web_search|web_fetch|disk_grep|disk_read|disk_glob|disk_list|mcp_[a-z0-9_]+)\b(?:\s+dengan pattern [^\n]*)?\s+menemukan)\b/i;
function stripToolRecap(text) {
  if (!text) return text;
  const keluar = [];
  for (const p of _paragrafSadarPagar(text)) {
    if (/^\s*```/.test(p)) {
      keluar.push(p); // blok kode/diagram: milik pemakai, jangan disentuh
      continue;
    }
    const baris = p.split("\n");
    const i = baris.findIndex((b) => _AWAL_REKAP.test(b));
    let sisa = baris;
    if (i >= 0) {
      // Rekap = baris penandanya SENDIRI plus daftar bukti yang mengekor
      // (butir, penomoran, atau baris berindentasi). Berhenti di baris prosa
      // pertama — di paragraf tanpa baris kosong, kalimat jawaban yang
      // sesungguhnya sering menempel langsung di bawah penanda, dan membuang
      // satu paragraf penuh berarti membuang jawabannya.
      let j = i + 1;
      while (j < baris.length && /^\s*(?:[-*•]|\d+[.)]\s|\s)/.test(baris[j]))
        j++;
      sisa = baris.slice(0, i).concat(baris.slice(j));
    }
    // "Kesimpulan:" hanya label pembuka baris — dibuang di situ saja, bukan di
    // mana pun ia kebetulan muncul (mis. di dalam kode).
    const bersih = sisa
      .map((b) => b.replace(/^(\s*)Kesimpulan:\s*/i, "$1"))
      .join("\n");
    if (bersih.trim()) keluar.push(bersih);
  }
  return keluar
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Potong jawaban akhir menjadi maksimal 2000 karakter PROSA sebagai safety net.
//
// Dua cacat yang diperbaiki di sini, keduanya terukur:
//
//  1. BLOK KODE TERBELAH. Cabang aman hanya jalan bila jumlah pagar genap dan
//     >= 2. Jawaban dengan pagar GANJIL — yang justru paling sering, karena
//     model kerap memotong dirinya sendiri di tengah blok — jatuh ke
//     `slice(0, 2000)` mentah. Hasilnya blok yang tak pernah ditutup, dan UI
//     merender sisa jawaban sebagai kode.
//
//  2. POTONG DIAM-DIAM. Cabang pagar-genap memotong tanpa menambah tanda apa
//     pun, jadi jawaban yang hilang separuh terlihat seperti jawaban utuh yang
//     kebetulan berhenti. Sekarang setiap pemotongan selalu berbekas.
//
// Blok berpagar tetap tak dihitung ke kuota (diagram & kode memang panjang dan
// disengaja) — tapi sekarang ia juga tak pernah dipotong di tengah: sebuah blok
// ikut UTUH atau tidak ikut sama sekali.
// Potong di batas yang wajar, bukan di tengah kata.
//
// Urutannya paragraf -> kalimat -> kata, dan batasnya hanya diterima bila masih
// di 40% terakhir jatah. Tanpa syarat itu, teks tanpa tanda baca bisa terpotong
// jauh lebih pendek dari yang diminta.
function _potongRapi(s, n) {
  if (s.length <= n) return s;
  const kepala = s.slice(0, n);
  const batasParagraf = kepala.lastIndexOf("\n\n");
  if (batasParagraf > n * 0.6) return kepala.slice(0, batasParagraf).trim();
  const kalimat = kepala.match(/[\s\S]*[.!?]/);
  if (kalimat && kalimat[0].length > n * 0.6) return kalimat[0].trim();
  const spasi = kepala.lastIndexOf(" ");
  if (spasi > n * 0.6) return kepala.slice(0, spasi).trim();
  return kepala.trim();
}
function truncateToConcise(text, maxChars = 2000) {
  if (!text) return text;

  // Pecah jadi potongan PROSA dan potongan KODE. Pagar yang tak tertutup sampai
  // akhir teks tetap dihitung sebagai kode supaya tak ada pemotongan di dalamnya.
  const bagian = [];
  let last = 0,
    m;
  const P = /```[\s\S]*?```|```[\s\S]*$/g;
  while ((m = P.exec(text)) !== null) {
    if (m.index > last)
      bagian.push({ kode: false, s: text.slice(last, m.index) });
    bagian.push({ kode: true, s: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) bagian.push({ kode: false, s: text.slice(last) });

  // Pagar ganjil ditutup BAHKAN saat tak ada pemotongan. Model yang berhenti di
  // tengah blok mengirim ``` pembuka tanpa penutup, dan UI lalu merender sisa
  // pesan sebagai kode. Menutupnya di sini tak mengubah isi apa pun — cuma
  // membuat blok yang memang sudah terlanjur terbuka berakhir di tempatnya.
  const tutupPagar = (s) =>
    (s.match(/```/g) || []).length % 2 === 1 ? s + "\n```" : s;

  const prosa = bagian.reduce((n, b) => n + (b.kode ? 0 : b.s.length), 0);
  if (prosa <= maxChars) return tutupPagar(text); // prosa muat -> utuh (diagram gratis)

  let sisa = maxChars,
    out = "",
    terpotong = false;
  for (const b of bagian) {
    if (b.kode) {
      out += b.s; // blok ikut utuh, tak memakan kuota
      continue;
    }
    if (b.s.length <= sisa) {
      out += b.s;
      sisa -= b.s.length;
      continue;
    }
    out += _potongRapi(b.s, sisa);
    terpotong = true;
    break; // sisanya dibuang
  }

  return tutupPagar(out.trim()) + (terpotong ? "\n\n…" : "");
}

// Cek apakah jawaban mengandung minimal sebagian dari bukti yang diakses
// Validasi ini memastikan jawaban didasarkan pada bukti tool, TANPA memaksa agent
// menyalin ulang output tool. Cukup sebut file path atau istilah kunci dari bukti.
function hasValidEvidence(summary, evidenceSet) {
  if (evidenceSet.size === 0) return true; // tidak ada tool yang dijalankan, skip
  const sum = summary.toLowerCase();
  for (const ev of evidenceSet) {
    const evLower = ev.toLowerCase();
    // Cek apakah summary menyebut file path yang ada di bukti
    const paths =
      evLower.match(
        /[a-z]:\\[^\s]+|(?:\.\.\/|\/|[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_.-]+/g,
      ) || [];
    for (const p of paths) {
      if (p.length > 3 && sum.includes(p)) return true;
    }
    // Cek apakah summary menyebut istilah/pattern kunci dari bukti (min 8 char)
    const terms = evLower.split(/\s+/).filter((w) => w.length >= 8);
    for (const term of terms) {
      if (sum.includes(term)) return true;
    }
  }
  return false;
}

// ==================================================================================
// HALLUCINATION GUARD — Filter multi-tahap sebelum jawaban dikirim ke user
// ==================================================================================
// Cara model bisa halusinasi:
//   1. Pattern Completion: mengisi "celah" dengan pola yang plausibel, bukan nyata
//   2. Overconfidence: menjawab yakin tanpa pernah membaca/verifikasi evidence
//   3. Context Leakage: mencampur pengetahuan training dengan konteks sesi
//
// Guard ini mendeteksi 3 pola halusinasi paling umum dari agen:
//   A. Klaim lokasi file yang TIDAK pernah di-read/grep
//   B. Klaim keberadaan fungsi/variabel yang TIDAK ditemukan di tool output
//   C. Klaim "sudah diperbaiki/selesai" tanpa bukti edit yang sukses
// ==================================================================================

/**
 * Ekstrak klaim faktual dari teks jawaban model.
 * Klaim = kalimat/frasa yang bisa diverifikasi secara objektif.
 */
function extractClaims(text) {
  const claims = [];

  // POLA A — Klaim lokasi file (misal: "ada di public/app.jsx", "terdapat di server.cjs")
  const fileClaimRegex =
    /(?:ada\s+di|terdapat\s+di|berada\s+di|ditemukan\s+di|terletak\s+di|located\s+in|found\s+in|defined\s+in|inside)\s+([^\s,;.]+\.(jsx?|cjs|css|html|json|md|ts|py))/gi;
  let m;
  while ((m = fileClaimRegex.exec(text)) !== null) {
    claims.push({ type: "file_location", value: m[1], raw: m[0] });
  }

  // POLA B — Klaim keberadaan fungsi/variabel (misal: "fungsi handleClear", "variabel MAX_STEPS").
  // Flag /i: tanpa itu, kalimat berawalan kapital ("Fungsi Xyz") lolos pemeriksaan sepenuhnya.
  const symbolClaimRegex =
    /(?:fungsi|function|const|let|var|class|komponen|component)\s+([A-Za-z_$][A-Za-z0-9_$]{2,})/gi;
  while ((m = symbolClaimRegex.exec(text)) !== null) {
    claims.push({ type: "symbol_existence", value: m[1], raw: m[0] });
  }

  // POLA C — Klaim penyelesaian/keberhasilan. Termasuk active-voice ("telah menulis",
  // "berhasil membuat") supaya klaim seperti "Saya telah menulis roadmap" tertangkap —
  // itu persis kalimat yang dulu lolos sambil file-nya berisi "undefined".
  // Toleransi kata sisipan ("sudah SAYA perbaiki") + bentuk aktif-imperatif
  // ("perbaiki", "tambahkan") selain pasif ("diperbaiki") dan active-progressive
  // ("memperbaiki") — model memakai ketiganya bergantian.
  const EDIT_VERB =
    "(?:menulis|tulis|membuat|buat|menyimpan|simpan|menambahkan|tambahkan|memperbaiki|perbaiki|mengubah|ubah|mengganti|ganti|menghapus|hapus|hilangkan|diperbaiki|diedit|diubah|dihapus|ditambahkan|ditulis|dibuat|disimpan)";
  const completionClaimRegex = new RegExp(
    "(?:sudah|telah)\\s+(?:(?:saya|kami|berhasil)\\s+){0,2}" +
      EDIT_VERB +
      "|(?:fix|edit|updat|creat|writ|sav|delet|remov|add)(?:e)?(?:ed|d)\\s+successfully" +
      "|berhasil\\s+(?:(?:saya|kami)\\s+)?" +
      EDIT_VERB,
    "gi",
  );
  while ((m = completionClaimRegex.exec(text)) !== null) {
    claims.push({ type: "completion_claim", value: m[0], raw: m[0] });
  }

  return claims;
}

/**
 * Cross-reference klaim terhadap evidence nyata dari tool.
 * Return: { grounded: [...], hallucinated: [...] }
 */
function crossReferenceWithEvidence(claims, evidenceSet, editLog) {
  const evidenceText = [...evidenceSet].join("\n").toLowerCase();
  const edits = Array.isArray(editLog) ? editLog : [];
  const successfulEdits = edits.filter((e) => e.ok); // tool edit benar-benar sukses
  const substantiveEdits = successfulEdits.filter((e) => e.bytes > 0); // DAN menulis isi nyata
  const grounded = [];
  const hallucinated = [];

  for (const claim of claims) {
    let verified = false;

    if (claim.type === "file_location") {
      // File location grounded jika file tersebut pernah dibaca/di-grep oleh tool
      const fname = claim.value.toLowerCase().replace(/\\/g, "/");
      verified =
        evidenceText.includes(fname) ||
        evidenceText.includes(claim.value.toLowerCase());
    } else if (claim.type === "symbol_existence") {
      // Symbol grounded jika muncul di output tool (grep/read)
      verified = evidenceText.includes(claim.value.toLowerCase());
    } else if (claim.type === "completion_claim") {
      // INTI PENGUATAN: "sebuah edit terjadi" != "edit itu benar & bermakna".
      // Klaim penyelesaian TIDAK cukup dibuktikan oleh editCount>0 (menulis
      // "undefined" pun dulu lolos). Sekarang:
      //   - klaim penghapusan  -> butuh minimal 1 edit yang SUKSES (isi kosong sah)
      //   - klaim menulis/buat -> butuh minimal 1 edit sukses yang MENULIS isi nyata
      const isDeletion = /hapus|hilang|remov|delet/i.test(claim.raw);
      if (isDeletion) {
        verified = successfulEdits.length > 0;
      } else {
        verified = substantiveEdits.length > 0;
      }
    }

    if (verified) {
      grounded.push(claim);
    } else {
      hallucinated.push(claim);
    }
  }

  return { grounded, hallucinated };
}

/**
 * HALLUCINATION GUARD — Entry point utama.
 *
 * Alur kerja:
 *   [TAHAP 1] Tidak ada tools dijalankan & tidak ada evidence → PASS (percakapan biasa)
 *   [TAHAP 2] Ekstrak semua klaim faktual dari jawaban model
 *   [TAHAP 3] Cross-reference setiap klaim dengan evidence tool yang nyata
 *   [TAHAP 4] Verdict:
 *             - 0 klaim halusinasi → PASS (jawaban bersih)
 *             - Ada klaim halusinasi, tapi mayoritas grounded → WARN + strip klaim palsu
 *             - Mayoritas halusinasi → BLOCK (jawaban ditolak, perlu retry)
 *
 * @returns {{ pass: boolean, verdict: 'clean'|'warn'|'block', hallucinated: Array, sanitized: string }}
 */
function hallucinationGuard(text, evidenceSet, editLog) {
  // TAHAP 1: Bypass hanya jika BENAR-BENAR tak ada aktivitas tool: tak ada evidence
  // baca/grep DAN tak ada edit. (Sebelumnya cuma cek evidenceSet — sebuah giliran
  // yang murni mengedit tanpa membaca bisa lolos tanpa verifikasi klaim "selesai".)
  const hasEdits = Array.isArray(editLog) && editLog.length > 0;
  if ((!evidenceSet || evidenceSet.size === 0) && !hasEdits) {
    return { pass: true, verdict: "clean", hallucinated: [], sanitized: text };
  }

  // TAHAP 2: Ekstrak klaim faktual
  const claims = extractClaims(text);

  // Jika tidak ada klaim faktual terdeteksi, jawaban aman (mungkin hanya narasi umum)
  if (claims.length === 0) {
    return { pass: true, verdict: "clean", hallucinated: [], sanitized: text };
  }

  // TAHAP 3: Cross-reference dengan evidence
  const { grounded, hallucinated } = crossReferenceWithEvidence(
    claims,
    evidenceSet || new Set(),
    editLog,
  );

  // TAHAP 4: Verdict
  const hallucinationRate = hallucinated.length / claims.length;

  if (hallucinated.length === 0) {
    // Semua klaim terverifikasi
    return { pass: true, verdict: "clean", hallucinated: [], sanitized: text };
  }

  if (hallucinationRate <= 0.4) {
    // Minoritas klaim halusinasi → strip klaim palsu dari teks, kirim versi bersih
    let sanitized = text;
    for (const h of hallucinated) {
      // Hapus kalimat yang mengandung klaim halusinasi
      const sentenceRegex = new RegExp(
        "[^.!?]*" +
          h.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
          "[^.!?]*[.!?]?",
        "gi",
      );
      sanitized = sanitized.replace(sentenceRegex, "").trim();
    }
    sanitized = sanitized.replace(/\n{3,}/g, "\n\n").trim();
    return { pass: true, verdict: "warn", hallucinated, sanitized };
  }

  // Mayoritas klaim tidak terverifikasi → BLOCK, perlu retry
  return {
    pass: false,
    verdict: "block",
    hallucinated,
    sanitized: null,
  };
}
// ==================================================================================

// Muat SEKALIGUS teks persona (text) dan blok prinsip/arsitektur/aturan (principles)
// dari config. Keduanya STATIS — kini keduanya hidup di config/prompts.json (single
// source of truth), bukan lagi 2/3-nya di-hardcode di file ini. Yang tetap di kode
// hanyalah injeksi DINAMIS (MODE EFFORT, pre-search, ROUTE) yang dihitung runtime.
function loadSelfAgentConfig() {
  try {
    const raw = require("fs").readFileSync(PROMPTS_CFG_PATH, "utf8");
    const clean = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    const sa = JSON.parse(clean).prompts.self_agent;
    let text = (sa.text || "").replace(
      /\[PRECISION RULES - WAJIB DIPATUHI\][\s\S]*?7\..+$/m,
      "",
    );
    return { text, principles: sa.principles || "" };
  } catch (e) {
    return {
      text: "You are WOLFSPACE's assistant. Chat normally or use tools on WOLFSPACE's source code as needed. Answer based on evidence from tools. Do not speculate.",
      principles: "",
    };
  }
}
const _selfCfg = loadSelfAgentConfig();
const SELF_FC_SYS = _selfCfg.text;
const SELF_FC_PRINCIPLES = _selfCfg.principles;

// Session state persists across HITL resumes (keyed by thread_id).
// Also on globalThis: the per-request module reload (see memoriAgen() note above)
// would otherwise wipe this Map between the paused run and its HITL resume.
const _sessionState =
  globalThis.__wolfspaceSessionState ||
  (globalThis.__wolfspaceSessionState = new Map());

// --- PHASED EXECUTION TREE HELPERS ---
// Map a tool name to its execution phase for the visual tree.
function phaseForTool(name) {
  const observe =
    /^(disk_grep|disk_read|disk_glob|disk_list|web_search|web_fetch|glob|grep|read|list|architecture_map|mcp_[a-z0-9_]+)$/i;
  const act =
    /^(edit|write|bash|exec|task|replace_file_content|write_artifact)$/i;
  if (observe.test(name)) return "observe";
  if (act.test(name)) return "act";
  return "observe";
}

// Helper to emit a phase-tree node alongside legacy events.
function makePhaseEmitter(rawEmit) {
  const start = Date.now();
  return function emitPhase(phase, node) {
    rawEmit({
      t: "phase",
      phase,
      time: Date.now() - start,
      status: node.status || "ok",
      ...node,
    });
  };
}

// parsePseudoCalls / stripPseudoTags now live in ./pseudo-tag-filter.cjs (shared with
// chat.cjs so the plain-chat path gets the same protection).

// --- LANGGRAPH STATE DEFINITION ---
// Ringkasan aktivitas untuk pesan JEDA (plafon langkah tercapai).
//
// MASALAH YANG DIPERBAIKI: pesan jedanya dulu hanya menyebut nomor langkah, dan
// catatan file hanya muncul bila edits > 0. Akibatnya dua situasi yang sangat
// berbeda menghasilkan kalimat yang IDENTIK:
//   - 14 langkah investigasi produktif, siap disimpulkan
//   - 14 langkah membaca berkas yang sama dengan cara berbeda
// User membayar keduanya, tak bisa membedakannya, lalu menekan "Lanjutkan"
// yang menambah 14 langkah lagi secara buta.
//
// Ini SENGAJA tidak menghentikan apa pun. Menghentikan lebih awal butuh menebak
// "kemajuan", dan itu semantik — versi lama pernah mencobanya dengan menghukum
// VOLUME lalu dicabut karena membunuh tugas sah (lihat catatan di guard). Yang
// ditambahkan di sini hanya PELAPORAN jujur: nol risiko false-positive, sebab
// tak ada keputusan yang bergantung padanya.
//
// Ketelitian label penting di sini:
//   callCountsByName  -> total panggilan per tool (akurat)
//   noProgressBySig   -> berapa kali panggilan identik mengembalikan hasil sama
//   failedTools       -> NAMA tool yang pernah gagal, BUKAN hitungan
//   failsByName       -> kegagalan BERUNTUN saat ini (reset saat sukses),
//                        jadi TIDAK dilaporkan sebagai total

// Ubah todos todowrite jadi baris checklist BERSTATUS.
//
// Statusnya ikut dibawa, bukan cuma teksnya: checklist yang diinjeksi ulang tanpa
// status akan terbaca sama di langkah 1 dan langkah 14, sehingga model bisa
// mengerjakan ulang item yang sudah selesai. Dibatasi 12 item supaya injeksi
// per-langkah tetap murah — todowrite tak dibatasi, hanya tampilannya.
const CHECKLIST_MAX_ITEMS = 12;
const _TODO_ICON = {
  completed: "[x]",
  in_progress: "[→]",
  cancelled: "[-]",
  pending: "[ ]",
};

function formatChecklist(todos) {
  if (!Array.isArray(todos)) return [];
  return todos
    .slice(0, CHECKLIST_MAX_ITEMS)
    .map((t) => {
      const text = String((t && t.content) || "").trim();
      if (!text) return null;
      return `${_TODO_ICON[t && t.status] || _TODO_ICON.pending} ${text}`;
    })
    .filter(Boolean);
}

// Item yang belum tuntas — dipakai di pesan jeda supaya "Lanjutkan" menyebut
// pekerjaan yang tersisa, bukan sekadar berapa langkah terpakai.
// Item yang sedang dikerjakan — penanda "[→]" dari todowrite. Kegagalan tool
// dihitung terhadap item INI, karena itulah pekerjaan yang sedang berlangsung.
// Tanpa item aktif, kegagalan tak bisa ditautkan ke apa pun dan diabaikan (agent
// mungkin sedang menjelajah, bukan mengerjakan rencana).
function itemAktif(checklist) {
  const l = (checklist || []).find((t) => String(t).startsWith("[→]"));
  return l ? String(l).slice(3).trim() : null;
}

// Tandai kegagalan pada item aktif, kembalikan peta baru (tak memutasi yang lama —
// reducer state ini "ganti total", jadi mutasi di tempat tak akan terlihat).
function catatGagalItem(fails, item, sebab) {
  if (!item) return fails || {};
  const lama = (fails || {})[item] || { n: 0, sebab: [] };
  return {
    ...(fails || {}),
    [item]: {
      n: lama.n + 1,
      // Hanya 3 sebab terakhir yang disimpan: yang dibutuhkan model adalah POLA
      // kegagalan, bukan arsip lengkap — dan checklist ini disuntik ulang tiap
      // langkah, jadi panjangnya berbanding lurus dengan ongkos token.
      sebab: [...lama.sebab, String(sebab || "").slice(0, 120)].slice(-3),
    },
  };
}

// Baris checklist + penanda kegagalan, siap disuntik ke system message.
// Item yang pernah gagal ditampilkan "[!] teks (gagal N×: sebab)" menggantikan
// "[→]", supaya model MELIHAT kemacetan alih-alih harus mengingatnya.
function checklistDenganKegagalan(checklist, fails) {
  const f = fails || {};
  return (checklist || []).map((baris) => {
    const teks = String(baris)
      .replace(/^\[[x→\- ]\]\s*/, "")
      .trim();
    const g = f[teks];
    if (!g || !g.n) return baris;
    return (
      "[!] " +
      teks +
      " (gagal " +
      g.n +
      "×" +
      (g.sebab.length ? ": " + g.sebab[g.sebab.length - 1] : "") +
      ")"
    );
  });
}

function pendingChecklist(checklist) {
  return (checklist || []).filter(
    (l) => !l.startsWith("[x]") && !l.startsWith("[-]"),
  );
}

function describePauseActivity(finalState, sess) {
  const parts = [];

  const byName = (sess && sess.callCountsByName) || {};
  const names = Object.keys(byName);
  const totalCalls = names.reduce((s, k) => s + (byName[k] || 0), 0);
  if (totalCalls) {
    const top = names
      .sort((a, b) => byName[b] - byName[a])
      .slice(0, 3)
      .map((k) => `${k}×${byName[k]}`)
      .join(", ");
    parts.push(`${totalCalls} panggilan tool (${top})`);
  }

  parts.push(`${finalState.edits || 0} file diedit`);

  const noProg = (sess && sess.noProgressBySig) || {};
  const repeats = Object.values(noProg).reduce((s, n) => s + (n || 0), 0);
  if (repeats) parts.push(`${repeats} pengulangan berhasil-sama`);

  const failed = finalState.failedTools;
  const failedNames = failed ? Array.from(failed).slice(0, 3).join(", ") : "";
  if (failedNames) parts.push(`tool bermasalah: ${failedNames}`);

  return parts.join(", ");
}

// Bentuk state graph juga dibuat SAAT DIPAKAI: Annotation.Root menuntut
// langgraph termuat, dan menjalankannya di lingkup modul akan membatalkan
// seluruh penundaan di atas. Hasilnya di-memo — bentuknya tak pernah berubah
// dalam satu proses, dan membuatnya ulang tiap run hanya membuang waktu.
let _bentukState = null;
function bentukState() {
  if (_bentukState) return _bentukState;
  const { Annotation } = lg();
  return (_bentukState = Annotation.Root({
    messages: Annotation({
      reducer: (x, y) => x.concat(y),
      default: () => [],
    }),
    step: Annotation({ reducer: (x, y) => y, default: () => 1 }),
    edits: Annotation({ reducer: (x, y) => x + y, default: () => 0 }),
    // Bukti edit yang kaya (bukan cuma hitungan): tiap entri {tool, target, ok, bytes}.
    // Dipakai hallucination guard untuk memverifikasi klaim "selesai" berdasarkan
    // edit yang BENAR-BENAR sukses & menulis isi nyata, bukan sekadar tool dipanggil.
    editLog: Annotation({ reducer: (x, y) => x.concat(y), default: () => [] }),
    failedTools: Annotation({
      reducer: (x, y) => {
        const set = new Set(x);
        y.forEach((item) => set.add(item));
        return set;
      },
      default: () => new Set(),
    }),
    accessedEvidence: Annotation({
      reducer: (x, y) => {
        const set = new Set(x);
        y.forEach((item) => set.add(item));
        return set;
      },
      default: () => new Set(),
    }),
    fallbackCount: Annotation({ reducer: (x, y) => y, default: () => 0 }),
    forceRetryCount: Annotation({ reducer: (x, y) => y, default: () => 0 }),
    finalSummary: Annotation({ reducer: (x, y) => y, default: () => "" }),
    stopReason: Annotation({ reducer: (x, y) => y, default: () => "" }),
    waitForAnswer: Annotation({ reducer: (x, y) => y, default: () => false }),
    hitlPending: Annotation({ reducer: (x, y) => y, default: () => false }),
    hitlApproved: Annotation({ reducer: (x, y) => y, default: () => false }),
    pendingToolCall: Annotation({ reducer: (x, y) => y, default: () => null }),
    pendingToolCalls: Annotation({ reducer: (x, y) => y, default: () => [] }),
    task_checklist: Annotation({ reducer: (x, y) => y, default: () => [] }),
    // Kegagalan PER-ITEM checklist: { "<teks item>": { n, sebab: [...] } }.
    // Terpisah dari failedTools (yang mencatat NAMA TOOL, bukan pekerjaan mana yang
    // macet). Ini yang membuat kegagalan ikut terbawa di jangkar ground truth.
    checklistFails: Annotation({ reducer: (x, y) => y, default: () => ({}) }),
    // Berapa kali run sudah didorong melanjutkan karena model menutup giliran
    // dengan teks padahal checklist masih terbuka. Dihitung TERPISAH dari
    // forceRetryCount: penghitung itu sudah dipakai bersama oleh tiga gerbang lain
    // (bukti tool, reasoning-tanpa-jawaban, hallucination guard), jadi menumpang
    // di sana membuat dorongan ini kehabisan jatah karena kejadian yang sama
    // sekali tak berhubungan.
    continueNudge: Annotation({ reducer: (x, y) => y, default: () => 0 }),
    // Plafon langkah untuk giliran ini. 0 = pakai MAX_STEPS default. Saat user memilih
    // "lanjutkan" setelah jeda budget, plafon diperpanjang (bukan direset), sehingga
    // langkah menjadi checkpoint "masih lanjut?" alih-alih tebing yang menggagalkan.
    stepCeiling: Annotation({ reducer: (x, y) => y, default: () => 0 }),
  }));
}

/**
 * Self‑agent loop – operates on WOLFSPACE's own source code via function‑calling tools.
 * @param {Object} opts - {history, port, cloud}
 * @param {function(Object):void} emit - event emitter (e.g. SSE writer)
 * @param {Object} ctl - {isCancelled, setCurReq, depth}
 */
async function selfAgentStream(payload, emit, ctl = {}) {
  let {
    history,
    port,
    cloud,
    thread_id,
    hitl_response,
    continue_response,
    workspace_root,
  } = payload;
  thread_id =
    thread_id ||
    "thread_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  // ── Per-workspace confinement (ww) ──
  // Bila payload menyebut folder aktif, seluruh mutasi file (broker) + bash (Docker)
  // agent dikurung ke folder itu lewat context.workspaceRoot. Divalidasi: harus
  // direktori yang benar-benar ada; kalau tidak, agent berjalan normal (tak terkurung).
  let _wsRoot = null;
  if (workspace_root) {
    try {
      const _rp = path.resolve(workspace_root);
      const _st = require("fs").statSync(_rp);
      if (_st.isDirectory()) _wsRoot = _rp;
    } catch (_) {
      _wsRoot = null;
    }
  }
  // Muat jurnal temuan sekali per run. Inilah yang membuat pengetahuan
  // menyeberangi RESTART proses — bagian yang tak diberikan checklist, karena
  // checkpoint-nya memakai MemorySaver yang mati bersama prosesnya.
  try {
    const _t = require("./temuan.cjs");
    const _n = _t.muat(_t.kunciWs(_wsRoot));
    if (_n) dlog("self", "info", "temuan dimuat", { berkas: _n });
  } catch (_) {}

  const agentCtx = { sessionId: thread_id, workspaceRoot: _wsRoot };
  if (_wsRoot)
    emit({
      t: "act",
      kind: "workspace",
      arg: _wsRoot,
      ok: true,
      output: "🔒 agent terkurung ke workspace: " + _wsRoot,
    });
  const isCancelled = ctl.isCancelled || (() => false);
  const setCurReq = ctl.setCurReq || (() => {});
  const depth = ctl.depth || 0;
  const MAX_DEPTH = 3;
  let finalSummary = "";
  const emitPhase = makePhaseEmitter(emit);
  const failedProviders = []; // Lacak provider yang sudah gagal agar fallback tidak ping-pong
  loadCloudKeys(); // ensure keys are loaded
  fillCloudKey(cloud);

  // Resolve a cloud model if none provided (pick first available key from clientKeys or CLOUD_KEYS)
  if (!(cloud && cloud.key)) {
    const availableKeys =
      cloud && cloud.clientKeys
        ? { ...CLOUD_KEYS, ...cloud.clientKeys }
        : CLOUD_KEYS;
    const prov = Object.keys(availableKeys).find(
      (p) =>
        availableKeys[p] &&
        (typeof availableKeys[p] === "string"
          ? availableKeys[p]
          : availableKeys[p].key),
    );
    if (prov) {
      const kObj = availableKeys[prov];
      cloud = {
        provider: prov,
        key: typeof kObj === "string" ? kObj : kObj.key,
        model: typeof kObj === "object" ? kObj.model : undefined,
        baseUrl: typeof kObj === "object" ? kObj.baseUrl : undefined,
        clientKeys: cloud ? cloud.clientKeys : undefined,
      };
    }
  }
  if (!(cloud && cloud.key)) {
    dlog("self", "info", "stop", { reason: "no_cloud_key", depth });
    emit({
      t: "err",
      m: "Self-agent butuh model cloud yang kuat. Simpan API key di menu API Key dulu (model lokal 3B tidak sanggup mengedit source dengan aman).",
    });
    return finalSummary;
  }

  // If using a local endpoint we just do a normal chat (no tool calls)
  if (cloud.baseUrl && /(127\.0\.0\.1|localhost)/.test(cloud.baseUrl)) {
    emit({ t: "step", n: 1 });
    let full = "";
    try {
      await askCloudStream(
        cloud,
        history || [],
        (t) => {
          full += t;
          emit({ t: "tok", c: t });
        },
        (r) => setCurReq(r),
      );
      if (!isCancelled()) {
        finalSummary = full;
        emit({ t: "adone", steps: 1, edits: 0, summary: full });
      }
    } catch (e) {
      if (!isCancelled()) emit({ t: "err", m: e.message });
    }
    dlog("self", "info", "stop", {
      reason: "local_base_fallback",
      depth,
      chars: full.length,
    });
    return finalSummary;
  }

  let sessionSnapshotId = null;
  const { rollback } = require("./snapshot.ts");
  // ASINKRON, dan itu disengaja. Di mode Electron seluruh run agent berjalan di
  // dalam proses MAIN — pemilik BrowserWindow dan pemompa antrean pesan Windows.
  // qBackup() sinkron menyalin ~112 berkas dengan copyFileSync (terukur 285-365ms
  // memblokir penuh, ~1,8 detik saat cache dingin); selama itu jendela tak
  // memompa pesan. Versi async menyalin dengan paralel terbatas dan melepas
  // event loop di antaranya.
  //
  // Kedua pemanggilnya ada di fungsi async, tepat sebelum `await runSelfTool`,
  // jadi menunggu di sini tidak mengubah urutan apa pun: backup tetap selesai
  // SEBELUM tool penyunting pertama berjalan — yang memang jaminannya.
  const ensureBackup = async () => {
    if (!sessionSnapshotId) {
      sessionSnapshotId = qBackupAsync ? await qBackupAsync() : qBackup();
      if (sessionSnapshotId) {
        emit({ t: "backup", dir: sessionSnapshotId });
        dlog("self", "info", "self-agent edit start", {
          backup: sessionSnapshotId,
        });
      }
    }
  };

  // Use DSpy-optimized system prompt if cached, else use original
  let optPrompt = getOptimized();
  if (optPrompt) {
    dlog("self", "info", "using optimized system prompt", {
      originalChars: SELF_FC_SYS.length,
      optimizedChars: optPrompt.length,
    });
  }
  const currentSysPrompt = optPrompt || SELF_FC_SYS;

  // Pemetaan batas kontext token, slicing riwayat pesan, dan instruksi sesuai mode effort yang dipilih (0=Low, 1=Medium, 2=High)
  const effortLevel =
    cloud && typeof cloud.effort !== "undefined"
      ? Number(cloud.effort)
      : typeof payload.effort !== "undefined"
        ? Number(payload.effort)
        : 1;
  const effortMaxTurns = effortLevel === 0 ? 6 : effortLevel === 2 ? 40 : 16;
  const effortTokenBudget =
    effortLevel === 0 ? 1024 : effortLevel === 2 ? 16384 : 4096;
  const effortModeName =
    effortLevel === 0 ? "LOW" : effortLevel === 2 ? "HIGH" : "MEDIUM";

  const slicedHistory =
    history && Array.isArray(history) ? history.slice(-effortMaxTurns) : [];
  const messages = [
    { role: "system", content: currentSysPrompt },
    ...slicedHistory,
  ];
  // Blok STATIS (PRINSIP/PETA/ATURAN) kini dari config (SELF_FC_PRINCIPLES) — bukan
  // hardcode. Yang ditambahkan di kode hanyalah MODE EFFORT yang DINAMIS (nilai
  // dihitung dari effortLevel runtime). Rakitan akhir byte-identik dengan versi lama.
  messages[0].content +=
    "\n\n" +
    SELF_FC_PRINCIPLES +
    `

[MODE EFFORT AKTIF: ${effortModeName} (Context Token Budget: ~${effortTokenBudget} tokens | History Limit: ${effortMaxTurns} msgs)]
${effortLevel === 0 ? "Fokus pada penyelesaian cepat dan hemat token. Jawab langsung ke inti." : effortLevel === 2 ? "Fokus pada analisis mendalam, RCA secara kritis, dan verifikasi silang semua bukti." : "Lakukan investigasi standar secara terukur."}`;
  const MAX_STEPS = effortLevel === 0 ? 6 : effortLevel === 2 ? 20 : 14;
  let edits = 0;
  // Diagram Mermaid dari architecture_map: DIAGRAM adalah jawabannya. Prompt menyuruh
  // model ringkas & jangan copy output tool, jadi ia sering tak menempel blok mermaid.
  // Kita simpan blok terakhir lalu tempelkan otomatis di finalisasi bila summary tak
  // memuatnya — supaya diagram selalu terender, tak bergantung kepatuhan model.
  let lastArchMermaid = null;
  let fallbackCount = 0;
  let forceRetryCount = 0;
  // Session state persists across HITL resumes (keyed by thread_id)
  if (!_sessionState.has(thread_id)) {
    // Bersihkan sesi basi (thread selesai/terbengkalai) — tanpa ini map tumbuh
    // tanpa batas dan counter lama bisa meracuni thread yang di-resume lama kemudian.
    try {
      const _now = Date.now();
      for (const [k, v] of _sessionState) {
        if (_now - (v.ts || 0) > 2 * 3600e3) {
          _sessionState.delete(k);
          // Bersihkan juga checkpoint LangGraph di memory.
          //
          // Dibaca dari globalThis LANGSUNG, bukan lewat memoriAgen(): kalau
          // agent belum pernah jalan di proses ini, checkpointer-nya belum ada
          // dan memang tak ada yang perlu dibersihkan. Memanggil pembuatnya di
          // sini justru akan memuat langgraph hanya untuk membersihkan sesuatu
          // yang kosong — persis biaya yang sedang dihindari.
          try {
            const mem = globalThis.__wolfspaceAgentMemory;
            if (
              mem &&
              mem.checkpoints &&
              typeof mem.checkpoints.delete === "function"
            ) {
              for (const [key] of mem.checkpoints)
                if (key.includes(k)) mem.checkpoints.delete(key);
            }
            if (
              mem &&
              mem.storage &&
              typeof mem.storage.delete === "function"
            ) {
              for (const [key] of mem.storage)
                if (key.includes(k)) mem.storage.delete(key);
            }
          } catch (e) {}
        }
      }
    } catch (_) {}
    _sessionState.set(thread_id, {
      ts: Date.now(),
      callCounts: {},
      callCountsByName: {},
      editFailCount: 0,
      grepReadSteps: 0,
      lastReadFile: null,
      readFileCount: 0,
      // Deteksi KEMANDEKAN (bukan volume): output terakhir per-signature + hitungan
      // hasil-identik, dan kegagalan beruntun per-nama tool (reset saat sukses).
      lastOutBySig: {},
      noProgressBySig: {},
      failsByName: {},
    });
  }
  const sess = _sessionState.get(thread_id);
  sess.ts = Date.now();
  if (!sess.lastOutBySig) {
    sess.lastOutBySig = {};
    sess.noProgressBySig = {};
    sess.failsByName = {};
  }
  const callCounts = sess.callCounts;
  const callCountsByName = sess.callCountsByName;
  let editFailCount = sess.editFailCount || 0;
  let grepReadSteps = sess.grepReadSteps;
  let lastReadFile = sess.lastReadFile;
  let readFileCount = sess.readFileCount;
  const _TRANSIENT_SELF =
    /ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|timeout|EAI_AGAIN|network|ECONNREFUSED|ENOTFOUND|503|404|429|403|401|RegionError|too busy|Service Unavailable|service_unavailable|Rate limit|FreeUsageLimit|insufficient_quota/i;

  // Load MCP tools dynamically
  //
  // getTools() menahan LANGKAH PERTAMA run, sebelum satu pun event lain
  // terkirim. Handshake tiap server MCP boleh sampai HANDSHAKE_TIMEOUT_MS
  // (60s di mcp-client.ts) sebelum menyerah, dan diukur langsung: satu run
  // diam 60,3 detik penuh di sini saat dua server (figma, github) timeout
  // bersamaan — tanpa satu pun tanda ke user bahwa agent masih hidup. Detak
  // di bawah ini menyamai pola model_wait yang sudah ada, supaya frontend
  // tak perlu jenis event baru untuk menampilkannya.
  const mcpClient = require("./mcp-client.ts");
  let currentTools = [...SELF_TOOLS];
  try {
    const _mcpT0 = Date.now();
    emit({ t: "model_wait", m: "Preparing MCP connection…" });
    const _mcpHb = setInterval(() => {
      emit({
        t: "model_wait",
        m:
          "Masih menyiapkan MCP (" +
          Math.round((Date.now() - _mcpT0) / 1000) +
          "s)…",
      });
    }, 10000);
    let mcpTools;
    try {
      mcpTools = await mcpClient.getTools();
    } finally {
      clearInterval(_mcpHb);
    }
    if (mcpTools.length > 0) {
      currentTools = currentTools.concat(mcpTools);
      // HARDCODE RULE: Filter web_search/web_fetch dinamis jika query berkaitan dengan MCP / Tools yang aktif
      const lastMsg =
        history && history.length > 0
          ? history[history.length - 1].content
          : "";
      const mcpToolKeywords = mcpTools
        .map((t) =>
          t.function.name.replace(/^mcp_[^_]+_/, "").replace(/_/g, "|"),
        )
        .join("|");
      const baseKeywords =
        "mcp|database|sql|query|api|data|server|github|repo|issue|commit|pull request";
      const isMcpQuery = new RegExp(
        `${baseKeywords}${mcpToolKeywords ? "|" + mcpToolKeywords : ""}`,
        "i",
      ).test(lastMsg);
      const isGeneralQuery =
        /apa itu|siapa|cara|bagaimana|contoh|cari|google|web/i.test(lastMsg);

      if (isMcpQuery && !isGeneralQuery) {
        currentTools = currentTools.filter(
          (t) =>
            t.function.name !== "web_search" && t.function.name !== "web_fetch",
        );
        dlog(
          "self",
          "info",
          "Hardcode: web_search dinonaktifkan karena tugas MCP terdeteksi.",
        );
      }

      // Injeksi kesadaran MCP ke dalam otak/Prompt Sistem AI
      messages[0].content +=
        "\n\n[CRITICAL MCP RULE]: Anda terhubung ke MCP. Prioritaskan alat 'mcp_'.";
    }
  } catch (e) {
    dlog("self", "warn", "Gagal memuat tools MCP", { error: e.message });
  }

  // --- INJEKSI CHAIN-OF-THOUGHT (CoT) ---
  // Inject rencana_tindakan for all tools: required for modifying tools, optional for read-only.
  const READ_ONLY_TOOLS = [
    "grep",
    "read",
    "glob",
    "list",
    "architecture_map",
    "web_search",
    "web_fetch",
    "question",
    "todowrite",
    "skill_list",
    "terminal_read",
  ];
  currentTools = currentTools.map((t) => {
    const newTool = JSON.parse(JSON.stringify(t));
    const isReadOnly = READ_ONLY_TOOLS.includes(t.function.name);
    if (!newTool.function.parameters)
      newTool.function.parameters = { type: "object", properties: {} };
    if (!newTool.function.parameters.properties)
      newTool.function.parameters.properties = {};
    newTool.function.parameters.properties.rencana_tindakan = {
      type: "string",
      description: isReadOnly
        ? "(OPTIONAL) Max 5 words describing this tool's intent."
        : "(REQUIRED) One SHORT sentence — what this tool does.",
    };
    if (!isReadOnly) {
      if (!newTool.function.parameters.required)
        newTool.function.parameters.required = [];
      if (!newTool.function.parameters.required.includes("rencana_tindakan")) {
        newTool.function.parameters.required.push("rencana_tindakan");
      }
    }
    return newTool;
  });

  try {
    // Di SINILAH langgraph akhirnya dimuat — di panggilan agent pertama, bukan
    // saat aplikasi dibuka. Semua simbolnya diambil sekali di satu tempat
    // supaya jalur pemuatan tetap terlihat jelas.
    const { StateGraph, START, END } = lg();
    const workflow = new StateGraph(bentukState())
      .addNode("planner", async (state) => {
        emit({ t: "step", n: state.step });
        emit({
          t: "act",
          kind: "planner",
          arg: "Menyusun rencana...",
          ok: true,
          output: "Sedang membuat checklist singkat",
        });
        const lastMsg = state.messages[state.messages.length - 1];
        const prompt = `Anda adalah AI Planner. Berdasarkan permintaan user, buat checklist SANGAT SINGKAT (maksimal 3 langkah). Tiap langkah di baris baru diawali "- ". JANGAN detail — langsung ke inti tugas. Jangan tambahkan teks lain.\n\nPermintaan: ${lastMsg.content}`;
        // Planner bukan langkah yang boleh membunuh run: checklist-nya cuma hiasan
        // (executor jalan sama saja tanpanya, lihat fallback "Jalankan tugas user."
        // di bawah). Sebelum ada fallback provider di sini, satu kunci mati di urutan
        // pertama (mis. github 401) mematikan SELURUH run 1-2 detik masuk — sebelum
        // executor bahkan sempat mencoba providernya sendiri. Diverifikasi lewat run
        // nyata: 8 dari 10 kunci di CLOUD_KEYS mati saat diukur.
        const _planTried = [];
        let _planCloud = cloud;
        let reply = null;
        for (let _t = 0; _t < 4; _t++) {
          try {
            reply = await askCloudTools(
              _planCloud,
              [{ role: "user", content: prompt }],
              [],
            );
            if (_planCloud !== cloud) {
              cloud = _planCloud; // provider yang hidup dipakai juga oleh executor
              dlog("self", "info", "planner fallback established", {
                provider: cloud.provider,
              });
            }
            break;
          } catch (e) {
            dlog("self", "warn", "planner_request_failed", {
              provider: _planCloud.provider,
              error: ((e && e.message) || "").slice(0, 120),
            });
            if (!_TRANSIENT_SELF.test((e && e.message) || "")) break;
            _planTried.push(_planCloud.provider);
            const fb = Object.keys(CLOUD_KEYS).find(
              (p) =>
                !_planTried.includes(p) && CLOUD_KEYS[p] && CLOUD_KEYS[p].key,
            );
            if (!fb) break;
            _planCloud = {
              provider: fb,
              key: CLOUD_KEYS[fb].key,
              model: CLOUD_KEYS[fb].model,
              baseUrl: CLOUD_KEYS[fb].baseUrl,
            };
            fillCloudKey(_planCloud);
          }
        }
        const lines = reply
          ? (reply.content || "")
              .split("\n")
              .filter((l) => l.trim().startsWith("-"))
              .map((l) => l.trim().replace(/^- /, ""))
          : [];
        if (lines.length === 0) lines.push("Jalankan tugas user.");
        emit({
          t: "act",
          kind: "planner",
          arg: "Rencana selesai",
          ok: true,
          output: lines.slice(0, 3).join("\n"),
        });
        return { task_checklist: lines.slice(0, 3) };
      })
      .addNode("executor", async (state) => {
        if (isCancelled()) return { stopReason: "cancelled" };

        // HITL Resume (in-graph path): if there are pending tool calls, inject them as an assistant message
        // so the tools node re-runs them with hitlApproved=true.
        const pendingInGraph =
          state.pendingToolCalls && state.pendingToolCalls.length > 0
            ? state.pendingToolCalls
            : state.pendingToolCall
              ? [state.pendingToolCall]
              : [];
        if (state.hitlApproved && pendingInGraph.length > 0) {
          emit({ t: "step", n: state.step });
          emit({
            t: "act",
            kind: "hitl_approved",
            arg: pendingInGraph.map((tc) => tc.function.name).join(", "),
            ok: true,
            output: "Diizinkan oleh user ✔",
          });
          const approvedMsg = {
            role: "assistant",
            content: null,
            tool_calls: pendingInGraph,
          };
          // Clear pending tools so it doesn't loop
          return {
            messages: [approvedMsg],
            pendingToolCall: null,
            pendingToolCalls: [],
            stopReason: "",
          };
        }

        emit({ t: "step", n: state.step });

        const activeMessages = [...state.messages];
        if (state.task_checklist && state.task_checklist.length > 0) {
          const sysMsg = { ...activeMessages[0] };
          // Baris dari todowrite sudah berstatus ("[x] ...", "[→] ..."); baris
          // dari planner masih polos. Beri prefiks "- " HANYA pada yang polos
          // supaya keduanya terbaca konsisten tanpa merusak penanda status.
          const hasStatus = state.task_checklist.some((t) =>
            /^\[[x→\- ]\] /.test(t),
          );
          // Kegagalan ikut tersuntik di sini, bukan cuma di riwayat percakapan:
          // inilah yang membuat "sudah pernah dicoba dan gagal" jadi bagian dari
          // ground truth, bukan sesuatu yang harus diingat model.
          const barisChecklist = checklistDenganKegagalan(
            state.task_checklist,
            state.checklistFails,
          );
          const adaGagal = barisChecklist.some((t) => t.startsWith("[!]"));
          sysMsg.content +=
            "\n\n[TASK CHECKLIST AKTIF]:\n" +
            barisChecklist
              .map((t) => (/^\[[x→\-! ]\] /.test(t) ? t : "- " + t))
              .join("\n") +
            (adaGagal
              ? "\nItem [!] SUDAH DICOBA dan gagal. JANGAN ulangi pendekatan yang sama — ganti cara, atau jelaskan ke user kenapa item itu tak bisa diselesaikan."
              : "") +
            (hasStatus
              ? "\nIni status TERKINI, bukan rencana awal. JANGAN kerjakan ulang item [x]. Kerjakan item [→], lalu lanjut ke [ ] berikutnya, dan perbarui lewat todowrite setiap kali status berubah."
              : "\nFokus selesaikan item di atas secara berurutan dengan menggunakan tools.");
          activeMessages[0] = sysMsg;
        }

        // TEMUAN: apa yang sudah DIKETAHUI, bukan apa yang harus dikerjakan.
        //
        // Checklist di atas menjaga agar agent ingat TUGASNYA. Blok ini menjaga
        // agar ia ingat PENGETAHUANNYA — dan itu dua hal berbeda yang selama ini
        // hanya satu yang dijaga.
        //
        // Terukur di ledger run nyata (pid 12932): 246 aksi untuk 22 perintah
        // unik, dengan index.html dibaca 13x dan app.js 12x. Pengulangan
        // beruntunnya cuma 4x, jadi itu bukan loop — melainkan history.slice(-16)
        // membuang hasil `read` (isinya paling panjang, jadi paling cepat
        // terpotong) sehingga agent tak tahu ia pernah membacanya.
        try {
          const _temuan = require("./temuan.cjs");
          const _blok = _temuan.blokPrompt(_temuan.kunciWs(_wsRoot));
          if (_blok) {
            const m = { ...activeMessages[0] };
            m.content += _blok;
            activeMessages[0] = m;
          }
        } catch (_) {
          // Kegagalan mengingat tak boleh menghentikan run: tanpa blok ini
          // agent kembali ke perilaku lama, bukan gagal.
        }

        let msg;
        // OBSERVABILITAS panggilan model. Dulu tak ada jejak APA PUN saat permintaan
        // dimulai — padahal cloud.cjs memberi timeout 600000ms (10 MENIT). Akibatnya
        // agent bisa diam belasan menit dan log hanya berisi noise renderer, membuat
        // "macet" mustahil dibedakan dari "sedang menunggu model". Ini terjadi nyata:
        // setelah menarik 4 halaman Notion, konteks membengkak dan run berhenti tanpa
        // satu pun event. Catat MULAI (dgn ukuran konteks) + SELESAI (dgn durasi),
        // dan beri tahu UI supaya user tahu ia sedang menunggu, bukan hang.
        const _askT0 = Date.now();
        const _ctxChars = activeMessages.reduce(
          (n, m) => n + String((m && m.content) || "").length,
          0,
        );
        dlog("self", "info", "model_request_start", {
          step: state.step,
          provider: cloud && cloud.provider,
          messages: activeMessages.length,
          ctxChars: _ctxChars,
          tools: currentTools.length,
        });
        emit({
          t: "model_wait",
          m: "Waiting for the model…",
          ctxChars: _ctxChars,
        });
        const _hbInterval = setInterval(() => {
          emit({
            t: "model_wait",
            m:
              "Masih menunggu jawaban model (" +
              Math.round((Date.now() - _askT0) / 1000) +
              "s)…",
            ctxChars: _ctxChars,
          });
        }, 10000);
        try {
          msg = await askCloudTools(cloud, activeMessages, currentTools);
          clearInterval(_hbInterval);
          dlog("self", "info", "model_request_done", {
            step: state.step,
            ms: Date.now() - _askT0,
            contentChars: String((msg && msg.content) || "").length,
            reasoningChars: String((msg && msg.reasoning) || "").length,
            toolCalls: (msg && msg.tool_calls && msg.tool_calls.length) || 0,
          });
        } catch (e) {
          clearInterval(_hbInterval);
          dlog("self", "error", "model_request_failed", {
            step: state.step,
            ms: Date.now() - _askT0,
            error: ((e && e.message) || "").slice(0, 120),
          });
          if (
            _TRANSIENT_SELF.test(e.message || "") &&
            state.fallbackCount < 3
          ) {
            failedProviders.push(cloud.provider);
            const fb = Object.keys(CLOUD_KEYS).find(
              (p) =>
                !failedProviders.includes(p) &&
                CLOUD_KEYS[p] &&
                CLOUD_KEYS[p].key,
            );
            if (fb) {
              dlog("self", "warn", "provider fallback", {
                from: cloud.provider,
                to: fb,
                error: e.message.slice(0, 100),
              });
              emit({
                t: "err",
                m:
                  cloud.provider +
                  " gagal: " +
                  e.message.slice(0, 80) +
                  " — beralih ke " +
                  fb,
              });
              cloud = {
                provider: fb,
                key: CLOUD_KEYS[fb].key,
                model: CLOUD_KEYS[fb].model,
                baseUrl: CLOUD_KEYS[fb].baseUrl,
              };
              fillCloudKey(cloud);
              return { fallbackCount: state.fallbackCount + 1 };
            }
          }
          dlog("self", "info", "stop", {
            reason: "askCloudTools_error",
            step: state.step,
            error: ((e && e.message) || "").slice(0, 100),
          });
          emit({ t: "err", m: e.message });
          return {
            stopReason: "error",
            finalSummary: _ringkasGagalCloud(
              cloud && cloud.provider,
              e,
              failedProviders,
            ),
          };
        }
        if (isCancelled()) return { stopReason: "cancelled_after_tools" };

        // ── Respons HAMPA = provider bermasalah, bukan model yang "selesai" ──
        //
        // Sebagian provider membalas HTTP 200 dengan badan yang sah tapi NIHIL:
        // tanpa content, tanpa reasoning, tanpa tool_calls. Karena bukan error,
        // ia tak pernah cocok dengan _TRANSIENT_SELF, jadi fallback provider yang
        // sudah ada di blok catch di atas tak pernah terpicu — padahal akibatnya
        // sama saja dengan 502: giliran itu hilang begitu saja.
        //
        // Terukur pada run nyata GLM-5.2 lewat provider opencode: 5 dari 6
        // panggilan mengembalikan 0/0/0, dan run mati di langkah 2 dengan
        // "(tidak ada respons dari model)" — pesan yang menyalahkan model,
        // padahal yang gagal adalah salurannya.
        //
        // Diperlakukan sama persis dengan kegagalan transient: pindah provider,
        // dibatasi fallbackCount yang sama, dan diberitahukan ke user.
        if (
          !msg.content &&
          !msg.reasoning &&
          !(msg.tool_calls && msg.tool_calls.length) &&
          state.fallbackCount < 3
        ) {
          failedProviders.push(cloud.provider);
          const fbHampa = Object.keys(CLOUD_KEYS).find(
            (p) =>
              !failedProviders.includes(p) &&
              CLOUD_KEYS[p] &&
              CLOUD_KEYS[p].key,
          );
          if (fbHampa) {
            dlog("self", "warn", "provider fallback (respons hampa)", {
              from: cloud.provider,
              to: fbHampa,
              step: state.step,
            });
            emit({
              t: "err",
              m:
                cloud.provider +
                " membalas kosong (tanpa teks/tool) — beralih ke " +
                fbHampa,
            });
            cloud = {
              provider: fbHampa,
              key: CLOUD_KEYS[fbHampa].key,
              model: CLOUD_KEYS[fbHampa].model,
              baseUrl: CLOUD_KEYS[fbHampa].baseUrl,
            };
            fillCloudKey(cloud);
            return { fallbackCount: state.fallbackCount + 1 };
          }
        }

        // Reasoning bisa bocor lewat dua jalur: terselip di content (tag <think> dari
        // cloud.cjs/model) atau model menghabiskan giliran HANYA berpikir (content
        // kosong, field reasoning terisi). Bersihkan yang pertama; untuk yang kedua,
        // dorong model menjawab ulang alih-alih menampilkan monolog internalnya.
        if (msg.content) msg.content = stripThinkBlocks(msg.content);
        if (
          !msg.content &&
          !(msg.tool_calls && msg.tool_calls.length) &&
          msg.reasoning
        ) {
          if (state.forceRetryCount < 3) {
            emit({
              t: "force_retry",
              m: "Model hanya berpikir tanpa jawaban final — meminta ulang...",
            });
            return {
              messages: [
                {
                  role: "user",
                  content:
                    "Kamu berhenti di tengah proses berpikir tanpa memberikan jawaban final. JANGAN menarasikan rencana atau simulasi. Langsung PANGGIL tool yang dibutuhkan (bash/read/grep/edit) atau berikan jawaban final yang singkat.",
                },
              ],
              forceRetryCount: state.forceRetryCount + 1,
            };
          }
          // SELAMATKAN isi reasoning — TAPI dengan label yang sesuai isinya.
          //
          // Alasan menyelamatkan tetap berlaku: kadang jawabannya memang ada di
          // monolog reasoning, cuma tak pernah dipindahkan ke content, dan
          // membuangnya berarti membuang kerja yang sudah dibayar.
          //
          // Yang DIPERBAIKI: dulu apa pun yang terselamatkan diberi label
          // "berikut kesimpulan dari proses berpikirnya" — termasuk saat yang
          // terambil cuma paragraf terakhir. Akibatnya catatan kerja setengah
          // jadi tampil sebagai hasil. Terlihat langsung di layar user: sebuah
          // daftar pemetaan bahasa->ikon yang terpotong di tengah, disajikan
          // seolah itu jawabannya.
          //
          // Sekarang labelnya mengikuti jenisnya, dan catatan kerja murni tidak
          // ditampilkan sama sekali — lebih baik mengaku tak ada jawaban
          // daripada menyodorkan sesuatu yang terlihat seperti jawaban.
          const salvaged = salvageReasoning(msg.reasoning);
          if (salvaged.jenis === "kesimpulan") {
            msg.content =
              "_(Model tidak menutup jawabannya; berikut kesimpulan dari proses berpikirnya.)_\n\n" +
              salvaged.teks;
          } else if (salvaged.jenis === "catatan") {
            msg.content =
              "_(Model tidak memberikan jawaban final. Berikut CATATAN TERAKHIR dari proses berpikirnya — ini bukan kesimpulan, dan mungkin belum selesai.)_\n\n" +
              salvaged.teks;
          } else {
            msg.content =
              "(Model tidak memberikan jawaban final, dan proses berpikirnya tidak memuat kesimpulan yang bisa dipakai. Coba jalankan ulang, atau persempit permintaannya.)";
          }
          dlog("self", "info", "reasoning_salvage", {
            step: state.step,
            jenis: salvaged.jenis,
            reasoningChars: String(msg.reasoning || "").length,
            salvagedChars: salvaged.teks ? salvaged.teks.length : 0,
          });
        }

        let calls =
          msg.tool_calls && msg.tool_calls.length ? msg.tool_calls : null;
        if (!calls) {
          const pseudo = parsePseudoCalls(msg.content || "");
          if (pseudo.length) {
            calls = pseudo.map((c, i) => ({
              id: "call_" + state.step + "_" + i,
              type: "function",
              function: { name: c.name, arguments: JSON.stringify(c.args) },
            }));
            msg.tool_calls = calls;
          }
        }
        // Safety net: whether or not a call parsed, never let a raw <function...> tag
        // (unclosed, unknown dialect, malformed JSON) reach the user as visible text.
        if (msg.content && !calls) {
          const safe = stripPseudoTags(msg.content);
          if (safe) emit({ t: "tok", c: safe });
        }
        return { messages: [msg] };
      })
      .addNode("tools", async (state) => {
        const msg = state.messages[state.messages.length - 1];
        const calls = msg.tool_calls || [];

        let localEdits = 0;
        const localAccessed = new Set();
        const localFailed = new Set();
        const localEditLog = [];
        // Kegagalan ditautkan ke ITEM checklist yang sedang dikerjakan, bukan ke
        // nama tool. Dikumpulkan di sini lalu dihitung sekali di akhir langkah.
        const itemSedangDikerjakan = itemAktif(state.task_checklist);
        const sebabGagalLangkahIni = [];

        const runOne = async (tc) => {
          let args = {};
          const rawArgs = tc.function.arguments || "";
          if (rawArgs.trim()) {
            try {
              args = JSON.parse(rawArgs);
            } catch (e) {
              // JSON argumen gagal parse (mis. content besar yang ter-truncate). JANGAN
              // jalankan tool dengan args kosong — itulah yang membuat write_artifact
              // menulis "undefined" lalu melapor sukses (halusinasi). Kembalikan error
              // agar model mengirim ulang JSON yang valid & ringkas.
              const out = `[ERROR: argumen untuk tool "${tc.function.name}" bukan JSON valid (kemungkinan terpotong). JANGAN anggap berhasil. Kirim ulang pemanggilan dengan JSON yang benar; untuk konten panjang, persingkat. Detail: ${(e.message || "").slice(0, 80)}]`;
              emit({
                t: "act",
                kind: tc.function.name,
                arg: "",
                ok: false,
                output: out,
              });
              return { out };
            }
          }

          // Emit thought only when this tool actually executes
          if (args.rencana_tindakan) {
            emit({
              t: "thought",
              c: args.rencana_tindakan,
              tool: tc.function.name,
              ok: true,
              ts: Date.now(),
            });
          }

          const sig = tc.function.name + "|" + (tc.function.arguments || "");
          callCounts[sig] = (callCounts[sig] || 0) + 1;
          // Per-name counter: dipakai untuk NOTICE lunak & backstop, BUKAN hard-stop.
          callCountsByName[tc.function.name] =
            (callCountsByName[tc.function.name] || 0) + 1;
          // PRINSIP GUARD: hukum KEMANDEKAN, bukan VOLUME. Dulu: >3 panggilan identik
          // atau >5 panggilan per-nama = hard stop MESKI SEMUA SUKSES — membunuh tugas
          // multi-langkah yang sah (6 perintah bash berbeda; `npm test` 4x di siklus
          // edit->test). Kini hard-stop hanya dari deteksi PASCA-eksekusi di bawah
          // (hasil identik berulang / gagal beruntun; sukses me-reset). Yang tersisa
          // di sini hanya backstop mutlak untuk loop tak berhingga yang outputnya
          // selalu berubah (mis. timestamp) sehingga lolos deteksi kemandekan.
          if (callCounts[sig] > 8) {
            dlog("hard-stop repeated_call_backstop", {
              sig: sig.slice(0, 140),
            });
            return {
              stop: true,
              stopNote:
                "tool «" +
                tc.function.name +
                "» dipanggil dengan argumen identik " +
                callCounts[sig] +
                "x (arg: " +
                (tc.function.arguments || "").slice(0, 80) +
                "…)",
            };
          }
          const isReadOnlyTool =
            /^(disk_grep|disk_read|disk_glob|disk_list|web_search|web_fetch|glob|grep|read|list|architecture_map|terminal_read|skill_list|mcp_[a-z0-9_]+)$/i.test(
              tc.function.name,
            );

          if (
            /^(edit|write|replace_file_content|write_artifact)$/i.test(
              tc.function.name,
            )
          )
            await ensureBackup();
          if (tc.function.name === "bash") {
            emit({
              t: "act",
              kind: "bash",
              arg: args.command || "",
              ok: true,
              output: "⟳ running…",
            });
          }
          const r = await runSelfTool(tc.function.name, args, emit, agentCtx);
          // Increment BOTH: localEdits feeds graph state; the outer `edits` is what
          // the catch-block's rollback guard reads — without this it stays 0 forever
          // and a crash after successful edits would always roll them back.
          if (r.edited) {
            localEdits++;
            edits++;
          }
          if (tc.function.name === "architecture_map" && r.ok) {
            const mm = (r.output || "").match(/```mermaid[\s\S]*?```/);
            if (mm) lastArchMermaid = mm[0];
          }
          // Rekam bukti edit yang kaya untuk hallucination guard: apakah tool edit
          // benar-benar SUKSES (ok) dan berapa byte isi yang ditulis. "undefined"
          // atau konten kosong -> bytes 0 -> tak bisa menopang klaim "sudah ditulis".
          if (
            /^(edit|write|replace_file_content|write_artifact)$/i.test(
              tc.function.name,
            )
          ) {
            const written =
              args.content != null
                ? String(args.content)
                : args.new_string != null
                  ? String(args.new_string)
                  : "";
            localEditLog.push({
              tool: tc.function.name,
              target: String(args.path || args.filename || args.title || ""),
              ok: !!r.ok,
              bytes: written.trim().length,
            });
          }
          if (
            r.output &&
            typeof r.output === "string" &&
            r.output.length > 1500
          ) {
            r.output =
              r.output.slice(0, 1500) +
              "\n... [TRUNCATED] (Output too long, please use specific filters if needed)";
          }
          // Hanya output tool yang SUBSTANTIF dihitung sebagai evidence. Hasil kosong /
          // "(no matching file)" / "(ok)" bukan bukti apa pun; kalau dimasukkan,
          // hasValidEvidence akan memaksa jawaban "mengutip" ketiadaan itu, dan untuk
          // pertanyaan pengetahuan umum model malah mengelak ("silakan minta saya membuat
          // file...") alih-alih menjawab dari pengetahuannya.
          const _outStr = (r.output || "").trim();
          const _nonSubstantive =
            !_outStr ||
            /^\(?\s*(ok|tidak ada|not found|no match|not found|nothing|kosong|empty|0\s+(hasil|match|file|baris))/i.test(
              _outStr,
            );
          if (r.ok && !_nonSubstantive) localAccessed.add(r.output);
          if (
            !r.ok &&
            SYSTEM_RULES.REQUIRED_TOOL_SEQUENCE.includes(tc.function.name)
          )
            localFailed.add(tc.function.name);

          // Kegagalan APA PUN dicatat terhadap item checklist yang aktif —
          // bukan hanya tool pencarian di REQUIRED_TOOL_SEQUENCE di atas. Yang
          // membuat pekerjaan macet biasanya justru edit/bash/write yang gagal
          // berulang, dan itu yang perlu terlihat di jangkar.
          if (!r.ok && itemSedangDikerjakan) {
            sebabGagalLangkahIni.push(
              tc.function.name +
                ": " +
                String(r.output || "gagal")
                  .trim()
                  .split("\n")[0],
            );
          }

          // Track consecutive edit failures
          if (tc.function.name === "edit" && !r.ok) {
            editFailCount++;
            sess.editFailCount = editFailCount;
          } else if (tc.function.name === "edit" && r.ok) {
            editFailCount = 0;
            sess.editFailCount = 0;
          }

          const extra = {};
          if (r.hunkId) {
            extra.hunkId = r.hunkId;
            extra.oldContent = r.oldContent;
            extra.newContent = r.newContent;
          }
          emit({
            t: "act",
            kind: tc.function.name,
            arg: args.path || args.pattern || args.command || "",
            ok: !!r.ok,
            output: r.output || "",
            // path final hasil resolve tool (kurungan workspace bisa me-remap ke
            // folder lain dari yang diminta) — dipakai UI utk preview yang akurat.
            path: r.path || undefined,
            ...extra,
          });

          const phase = phaseForTool(tc.function.name);
          const cleanArg = (
            args.path ||
            args.pattern ||
            args.command ||
            args.goal ||
            ""
          )
            .replace(/C:\\Users\\dave\\quantum\\/gi, "")
            .replace(/C:\\Users\\dave\\/gi, "")
            .slice(0, 60);
          emitPhase(phase, {
            tag: "tool_call",
            status: r.ok ? "ok" : "err",
            attrs: [
              { k: "name", v: tc.function.name, t: "str" },
              { k: "arg", v: cleanArg, t: "str" },
            ],
            chip: phase,
            children: [
              {
                tag: "tool_result",
                status: r.ok ? "ok" : "err",
                attrs: [
                  { k: "ok", v: String(r.ok), t: "str" },
                  {
                    k: "preview",
                    v: (r.output || "(ok)").replace(/\r?\n/g, " ").slice(0, 80),
                    t: "str",
                  },
                ],
              },
            ],
          });

          let out = r.output || "(ok)";
          // ── Deteksi kemandekan pasca-eksekusi (sumber hard-stop yang sebenarnya) ──
          // (a) Per-signature: panggilan identik yang mengembalikan OUTPUT IDENTIK
          //     berulang = nol informasi baru -> peringatkan di 2x, stop di 3x.
          //     Output berbeda = ada progres -> reset.
          const _outKey = String(out).slice(0, 2000);
          const _sameResult = sess.lastOutBySig[sig] === _outKey;
          sess.noProgressBySig[sig] = _sameResult
            ? (sess.noProgressBySig[sig] || 0) + 1
            : 0;
          sess.lastOutBySig[sig] = _outKey;
          // (b) Per-nama: KEGAGALAN beruntun (sukses me-reset). 6 kegagalan beruntun
          //     pada tool aksi = pendekatan buntu.
          if (r.ok) sess.failsByName[tc.function.name] = 0;
          else
            sess.failsByName[tc.function.name] =
              (sess.failsByName[tc.function.name] || 0) + 1;
          if (sess.noProgressBySig[sig] >= 3) {
            dlog("hard-stop no_progress", { sig: sig.slice(0, 140) });
            return {
              out,
              stop: true,
              stopNote:
                "tool «" +
                tc.function.name +
                "» dipanggil identik " +
                (sess.noProgressBySig[sig] + 1) +
                "x dengan HASIL SAMA persis (arg: " +
                (tc.function.arguments || "").slice(0, 80) +
                "…)",
            };
          }
          if (!isReadOnlyTool && sess.failsByName[tc.function.name] >= 6) {
            dlog("hard-stop consecutive_fails", {
              tool: tc.function.name,
              fails: sess.failsByName[tc.function.name],
            });
            return {
              out,
              stop: true,
              reason: "tool_name_loop",
              stopNote:
                "tool «" +
                tc.function.name +
                "» GAGAL " +
                sess.failsByName[tc.function.name] +
                "x beruntun (kegagalan terakhir: " +
                String(out).replace(/\s+/g, " ").slice(0, 100) +
                "…)",
            };
          }
          if (_sameResult && sess.noProgressBySig[sig] >= 1)
            out +=
              "\n[SYSTEM: Panggilan identik diulang dengan HASIL SAMA (" +
              (sess.noProgressBySig[sig] + 1) +
              "x). Jangan ulangi persis — ganti pendekatan, atau read dulu lalu edit SEKALI dengan old_string yang tepat.]";
          if (editFailCount >= 2)
            out +=
              "\n[SYSTEM: edit gagal " +
              editFailCount +
              "x berturut-turut. BERHENTI mencoba edit. Gunakan tool read untuk membaca baris yang tepat dari file, lalu buat 1 edit dengan old_string yang PERSIS sesuai konten file.]";
          if (callCountsByName[tc.function.name] > 3)
            out +=
              "\n[SYSTEM: Tool " +
              tc.function.name +
              " was already called " +
              callCountsByName[tc.function.name] +
              "x. Ganti pendekatan atau berikan jawaban kepada user sekarang.]";
          if (r.needsAnswer) {
            emit({ t: "ask", question: r.question, choices: r.choices });
            out =
              'You asked the user: "' +
              r.question +
              '". The user will respond. Wait for their answer before continuing.';
            return {
              out,
              stop: true,
              waitForAnswer: true,
              question: r.question,
            };
          }
          if (tc.function.name === "task") {
            if (depth >= MAX_DEPTH) {
              const outMsg =
                "(sub-agent depth limit reached — handle this sub-task directly with normal tools)";
              emit({
                t: "act",
                kind: "task",
                arg: (args.goal || "").slice(0, 70),
                ok: false,
                output: outMsg,
              });
              return { out: outMsg };
            }
            emit({
              t: "act",
              kind: "task",
              arg: (args.goal || "").slice(0, 70),
              ok: true,
              output: "↳ sub‑agent…",
            });
            let subSum = "";
            const subEmit = (e) => {
              if (e.t === "adone") subSum = e.summary || "";
              else if (e.t === "err") subSum = "[sub‑agent error: " + e.m + "]";
              else if (e.t === "act")
                emit({
                  t: "act",
                  kind: e.kind,
                  arg: "↳ " + (e.arg || ""),
                  ok: e.ok,
                  output: e.output,
                });
            };
            try {
              const ret = await selfAgentStream(
                {
                  history: [{ role: "user", content: args.goal || "" }],
                  cloud,
                  workspace_root: _wsRoot,
                },
                subEmit,
                { isCancelled, setCurReq, depth: depth + 1 },
              );
              return {
                out: subSum || ret || "(sub-agent finished without a summary)",
              };
            } catch (e) {
              return { out: "[sub‑agent gagal: " + e.message + "]" };
            }
          }
          return { out };
        };

        // Thoughts are emitted inside runOne or HITL branch — only for tools that actually execute.

        // HITL gates only the unprotected path: `bash` runs PowerShell directly on
        // the host — no broker (that's capability_exec only), no sandbox (that's
        // sandbox_run only), so it needs user approval. edit/write stay HITL-free:
        // they're covered by auto-snapshot + rollback.
        const EXECUTION_TOOLS = ["bash"];
        // Tool `git` digerbang PER OPERASI, bukan per nama.
        //
        // Sebelum tool ini ada, git hanya bisa dipanggil lewat `bash`, jadi ia
        // otomatis ikut minta persetujuan. Kalau tool baru ini dibiarkan lolos,
        // model justru mendapat jalan menjalankan `commit` — yang MENJALANKAN
        // HOOK repo di luar kurungan — tanpa satu pun persetujuan. Menambal itu
        // dengan menaruh "git" di EXECUTION_TOOLS akan menggerbang `status` dan
        // `log` juga, dan persetujuan yang diminta untuk hal sepele adalah
        // persetujuan yang berhenti dibaca orang.
        //
        // Jadi yang menentukan bukan nama toolnya, melainkan apakah operasinya
        // menulis. Argumen yang tak bisa diurai diperlakukan sebagai menulis:
        // gagal ke arah meminta izin, bukan ke arah melewatinya.
        const _perluPersetujuan = (tc) => {
          if (EXECUTION_TOOLS.includes(tc.function.name)) return true;
          if (tc.function.name !== "git") return false;
          try {
            const a = JSON.parse(tc.function.arguments || "{}");
            const op = require("./tools/git-tool.cjs").OPERASI[a.operasi];
            return !op || op.tulis === true;
          } catch (_) {
            return true;
          }
        };
        const executionCalls = calls.filter(_perluPersetujuan);
        const nonExecutionCalls = calls.filter((tc) => !_perluPersetujuan(tc));

        if (executionCalls.length > 0 && !state.hitlApproved) {
          // Execute non-execution tools (grep, read, etc.) directly so results are available
          const nonExecMessages = [];
          for (const tc of nonExecutionCalls) {
            let tcArgs = {};
            try {
              tcArgs = JSON.parse(tc.function.arguments || "{}");
            } catch (_) {}
            if (tcArgs.rencana_tindakan) {
              emit({
                t: "thought",
                c: tcArgs.rencana_tindakan,
                tool: tc.function.name,
                ok: true,
              });
            }
            const r = await runOne(tc);
            nonExecMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: r.out || "(ok)",
            });
          }
          // Emit HITL only for execution tools
          const code = executionCalls
            .map((tc) => {
              let a = {};
              try {
                a = JSON.parse(tc.function.arguments || "{}");
              } catch (_) {}
              return (
                "=== " +
                tc.function.name +
                " ===\n" +
                JSON.stringify(a, null, 2)
              );
            })
            .join("\n\n");
          emit({
            t: "hitl",
            thread_id,
            request: {
              title:
                "Eksekusi perintah (" +
                executionCalls.length +
                "): " +
                executionCalls.map((tc) => tc.function.name).join(", "),
              code,
            },
          });
          // Add placeholder tool messages for execution tools
          for (const tc of executionCalls) {
            nonExecMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: "Waiting for your approval...",
            });
          }
          return {
            messages: nonExecMessages,
            step: state.step + 1,
            edits: localEdits,
            editLog: localEditLog,
            accessedEvidence: Array.from(localAccessed),
            failedTools: Array.from(localFailed),
            stopReason: "hitl",
            // "HITL" istilah internal dan tak berarti bagi user; keadaan
            // menunggunya pun sudah tampak dari tombol setujui/tolak. Yang
            // tersisa hanya fakta yang berguna: berapa perintah.
            finalSummary:
              executionCalls.length +
              " perintah perlu persetujuan Anda sebelum dijalankan.",
            waitForAnswer: false,
            hitlPending: true,
            pendingToolCalls: executionCalls,
          };
        }

        // Sequential execution (not Promise.all) to preserve emit order and avoid race conditions
        const results = [];
        for (const tc of calls) {
          const r = await runOne(tc);
          results.push(r);
        }

        const toolMessages = [];
        let stopReason = "";
        let waitForAnswer = false;
        let localSummary = "";
        // Peta kegagalan per-item sesudah langkah ini. Dihitung setelah semua
        // tool selesai (lihat gerbang MAX_ITEM_ATTEMPTS di bawah).
        let failsBaru = state.checklistFails || {};
        // Rencana hidup dari todowrite. null = tak ada panggilan todowrite di
        // langkah ini, jadi checklist yang sudah ada TIDAK ditimpa.
        let todoUpdate = null;

        for (let i = 0; i < calls.length; i++) {
          const name = calls[i].function.name;
          const SEARCH_TOOLS = [
            "grep",
            "disk_grep",
            "read",
            "disk_read",
            "glob",
            "disk_glob",
            "list",
            "disk_list",
            "web_search",
            "web_fetch",
          ];
          const isSearch = SEARCH_TOOLS.includes(name);
          const isGrep = name === "grep" || name === "disk_grep";
          const isRead = name === "read" || name === "disk_read";
          // todowrite -> task_checklist. Dulu todowrite HANYA emit ke UI dan
          // mengembalikan string; state agent tak pernah tahu rencana itu ada,
          // sehingga hasilnya terkubur di bawah puluhan pesan output tool saat
          // langkah 14. Dengan disalin ke checklist, ia ikut kanal injeksi ulang
          // per-langkah yang SUDAH ada di node executor.
          if (name === "todowrite") {
            try {
              const a = JSON.parse(calls[i].function.arguments || "{}");
              if (Array.isArray(a.todos)) todoUpdate = formatChecklist(a.todos);
            } catch (_) {}
          }
          if (isSearch) {
            grepReadSteps++;
            if (isRead) {
              let fp = "";
              try {
                fp = JSON.parse(calls[i].function.arguments || "{}").path || "";
              } catch (_) {}
              if (fp === lastReadFile) readFileCount++;
              else {
                lastReadFile = fp;
                readFileCount = 1;
              }
            }
          }
          if (results[i] && results[i].stop) {
            if (results[i].waitForAnswer) {
              waitForAnswer = true;
              stopReason = "waiting_for_user_answer";
              // Pertanyaannya saja, TANPA awalan "Waiting for your reply: ".
              // Keadaan menunggu sudah disampaikan UI dua kali — lewat panel
              // "Question from the Agent" (j.question) dan status "Menunggu
              // jawaban Anda...". Awalan ini menempel ke teks pertanyaan lalu
              // ikut terbaca user sebagai bagian dari kalimat agent, persis
              // seperti penanda [kata-spekulatif-dihapus] dulu: label internal
              // yang bocor ke permukaan.
              localSummary = results[i].question;
            } else {
              stopReason = "repeated_tool_calls";
              localSummary =
                msg.content ||
                "Berhenti: panggilan tool berulang tanpa kemajuan" +
                  (results[i].stopNote
                    ? " — " +
                      results[i].stopNote +
                      ". Coba: instruksi lebih spesifik, atau pecah tugasnya."
                    : ".");
            }
          }
          let out = (results[i] && results[i].out) || "(ok)";
          // Force-stop notice: inform model to answer now instead of aborting the graph
          if (grepReadSteps >= 5 && isSearch) {
            out +=
              "\n\n[SYSTEM NOTICE: PENCARIAN SELESAI] Anda sudah melakukan 5 langkah pencarian. DILARANG memanggil tool pencarian lagi. Berikan jawaban/kesimpulan lengkap Anda kepada user SEKARANG berdasarkan hasil yang sudah dikumpulkan.";
          }
          if (readFileCount >= 8 && isRead) {
            out +=
              "\n\n[SYSTEM NOTICE: BACA SELESAI] File sudah dibaca cukup. DILARANG memanggil tool read lagi. Berikan jawaban/kesimpulan lengkap Anda kepada user SEKARANG berdasarkan hasil yang sudah dikumpulkan.";
          }
          // Auto-convert: bash edit rejection → auto-read file + inject edit instruction
          if (name === "bash" && out.includes("DILARANG edit file via bash")) {
            // Parse file path from bash command (common patterns)
            const cmd = calls[i].function.arguments || "";
            let cmdObj = {};
            try {
              cmdObj = JSON.parse(cmd);
            } catch (_) {}
            const cmdStr = cmdObj.command || "";
            // Extract file path from common sed/findstr/Set-Content patterns
            const pathMatch =
              cmdStr.match(
                /(?:sed|findstr|Set-Content|Out-File|Add-Content)[\s\S]*?["']?([^\s"']+?\.(?:jsx|js|cjs|css|html|json|md))["']?/i,
              ) ||
              cmdStr.match(
                /["']([^\s"']+?\.(?:jsx|js|cjs|css|html|json|md))["']/i,
              );
            if (pathMatch && pathMatch[1]) {
              const targetFile = pathMatch[1].replace(/\\\\/g, "\\");
              // Auto-read the file so agent has context for edit tool
              try {
                const fileToolsMod = require("./tools/file-tools.ts");
                const absPath = fileToolsMod.qResolve
                  ? fileToolsMod.qResolve(targetFile)
                  : null;
                if (absPath) {
                  const fileContent = fileToolsMod.qRead(absPath);
                  // Truncate to 300 lines for context
                  const lines = fileContent
                    .split("\n")
                    .slice(0, 300)
                    .join("\n");
                  out = `DITOLAK edit via bash. File sudah dibaca untuk Anda:\n\n${lines}\n\n[SYSTEM] Gunakan tool "edit" sekarang dengan:\n- path: ${targetFile}\n- old_string: (copy dari file di atas)\n- new_string: "" (kosong untuk hapus)`;
                  emit({
                    t: "act",
                    kind: "read",
                    arg: targetFile,
                    ok: true,
                    output: "Auto-read untuk edit conversion",
                  });
                } else {
                  out =
                    "DITOLAK edit via bash. Baca file dulu dengan read tool, lalu gunakan edit tool.";
                }
              } catch (e2) {
                out =
                  "DITOLAK edit via bash. Baca file dulu dengan read tool, lalu gunakan edit tool.";
              }
            } else {
              out =
                'DITOLAK edit via bash. Gunakan tool "edit" — baca file dulu dengan read tool jika perlu.';
            }
          }
          toolMessages.push({
            role: "tool",
            tool_call_id: calls[i].id,
            content: out,
          });
        }

        // ── Gerbang kemacetan per-item: berhenti dan TANYA, bukan menyerah ──
        //
        // Kegagalan langkah ini dihitung terhadap item checklist yang aktif. Saat
        // satu item gagal MAX_ITEM_ATTEMPTS kali, run DIHENTIKAN dan user ditanya.
        //
        // Kenapa bertanya, bukan otomatis melewati item itu: melewatinya membuat
        // agent tetap produktif tapi bisa menyerah diam-diam pada hal yang justru
        // paling penting — dan kegagalan yang disembunyikan persis yang harus
        // dihindari sistem ini. Berhenti-dan-tanya membuat kemacetan terlihat pada
        // orang yang bisa memutuskan.
        //
        // Jalur jeda memakai mekanisme yang SUDAH ada (t:"ask" + waitForAnswer),
        // bukan jalur baru — sehingga resume, checkpoint HITL, dan UI-nya
        // otomatis ikut bekerja.
        if (sebabGagalLangkahIni.length && itemSedangDikerjakan) {
          failsBaru = catatGagalItem(
            state.checklistFails,
            itemSedangDikerjakan,
            sebabGagalLangkahIni[0],
          );
          const n = failsBaru[itemSedangDikerjakan].n;
          if (n >= SYSTEM_RULES.MAX_ITEM_ATTEMPTS && !waitForAnswer) {
            const sebab = failsBaru[itemSedangDikerjakan].sebab;
            const pertanyaan =
              'Item "' +
              itemSedangDikerjakan +
              '" sudah gagal ' +
              n +
              "× berturut-turut.\nSebab terakhir: " +
              (sebab[sebab.length - 1] || "tidak tercatat") +
              "\n\nSaya berhenti di sini alih-alih mencoba lagi dengan cara yang sama. Bagaimana lanjutnya?";
            emit({
              t: "ask",
              question: pertanyaan,
              choices: [
                "Coba pendekatan lain",
                "Lewati item ini, lanjut ke berikutnya",
                "Hentikan run",
              ],
            });
            waitForAnswer = true;
            stopReason = "item_macet";
            // "menunggu keputusan user" dibuang karena alasan yang sama:
            // pilihannya sudah tampil sebagai tombol, jadi kalimat itu cuma
            // menarasikan mekanisme UI kepada user.
            localSummary = "Item checklist gagal " + n + "× berturut-turut.";
          }
        }

        // Persist session state for HITL resume
        sess.grepReadSteps = grepReadSteps;
        sess.lastReadFile = lastReadFile;
        sess.readFileCount = readFileCount;
        sess.callCountsByName = callCountsByName;
        sess.editFailCount = editFailCount;

        return {
          messages: toolMessages,
          step: state.step + 1,
          edits: localEdits,
          editLog: localEditLog,
          accessedEvidence: Array.from(localAccessed),
          failedTools: Array.from(localFailed),
          ...(sebabGagalLangkahIni.length ? { checklistFails: failsBaru } : {}),
          stopReason,
          waitForAnswer,
          hitlPending: stopReason === "hitl",
          hitlApproved: state.hitlApproved, // Keep approval through the session (reset only on new user message)
          finalSummary: localSummary,
          // Hanya kirim bila todowrite benar-benar dipanggil: reducer checklist
          // ini "ganti total" (x, y) => y, jadi mengirim [] tiap langkah akan
          // MENGHAPUS rencana dari planner.
          ...(todoUpdate ? { task_checklist: todoUpdate } : {}),
        };
      })
      .addNode("validate", async (state) => {
        const msg = state.messages[state.messages.length - 1];
        const cleanContent = stripThinkBlocks(msg.content || "");
        const hasContent = cleanContent && cleanContent.trim();
        const rawContent = hasContent
          ? cleanContent
          : "(tidak ada respons dari model)";

        // Anti-tutorial: model punya tool eksekusi nyata (bash/sandbox_run), jadi jawaban
        // yang MENSIMULASIKAN hasil atau menyerah dengan "sebagai AI saya tidak bisa
        // menjalankan" adalah halusinasi peran — paksa ia benar-benar memanggil tool.
        const SIMULATION_CLAIMS = new RegExp(
          [
            "sebagai AI[^.]{0,60}(tidak (bisa|dapat|punya)|akses)",
            "as an? AI[^.]{0,60}(cannot|can'?t|unable|no (access|way))",
            "tidak (punya|memiliki) akses real-?time",
            "(saya|aku)?\\s*(tidak (bisa|dapat)|(cannot|can'?t|unable to)) (menjalankan|mengeksekusi|execute|run)",
            "(saya|kita|mari kita|let'?s)\\s*(akan\\s*)?(asumsikan|anggap|bayangkan|misalkan|assume|imagine|pretend|simulate|simulasikan)",
            "seolah-?olah[^.]{0,40}(sudah|berjalan|jadi)",
            "dalam simulasi|in (a )?simulation",
            "output(nya)?\\s*(yang diharapkan\\s*)?(mungkin|kira-?kira|biasanya|misal|expected|would be|typically)",
            "(hasil|hasilnya)\\s*(kira-?kira|mungkin|misal|diperkirakan|kurang lebih)",
          ].join("|"),
          "i",
        );
        if (
          hasContent &&
          SIMULATION_CLAIMS.test(cleanContent) &&
          state.forceRetryCount < 3
        ) {
          emit({
            t: "force_retry",
            m: "[ANTI-TUTORIAL] Jawaban mensimulasikan eksekusi — memaksa pemanggilan tool nyata...",
          });
          return {
            messages: [
              {
                role: "user",
                content:
                  "PERINGATAN SISTEM: Kamu BISA mengeksekusi perintah secara nyata — kamu punya tool bash (PowerShell di host) dan sandbox_run. DILARANG mensimulasikan, mengasumsikan, atau menarasikan output. PANGGIL tool yang sesuai SEKARANG dan laporkan output aslinya.",
              },
            ],
            forceRetryCount: state.forceRetryCount + 1,
          };
        }

        const evidenceValid = hasValidEvidence(
          rawContent,
          state.accessedEvidence,
        );

        let fallback = rawContent;
        // Tak ada lagi penyapu kata spekulatif di sini — kalimat model sampai ke
        // layar apa adanya. Dua langkah di bawah hanya MEMBUANG (rekap tool,
        // kelebihan panjang), tidak menyisipkan penanda ke tengah kalimat.
        fallback = stripToolRecap(fallback);
        fallback = truncateToConcise(fallback, 2000);
        // Jaring pengaman: pastikan diagram architecture_map ikut terkirim (terender di UI)
        // walau model tak menempelnya, atau menempel PARSIAL (fence pembuka tanpa penutup —
        // sering terjadi saat model meringkas/memotong sendiri). Ditambahkan SETELAH
        // truncation agar blok utuh.
        if (lastArchMermaid && !/```mermaid[\s\S]*?```/.test(fallback)) {
          fallback = fallback.replace(/```mermaid[\s\S]*$/i, "").trim(); // buang fence parsial
          fallback =
            (fallback && fallback !== "(tidak ada respons dari model)"
              ? fallback + "\n\n"
              : "") + lastArchMermaid;
        }

        if (
          state.failedTools.size < SYSTEM_RULES.MIN_FAILED_TOOLS &&
          SYSTEM_RULES.REQUIRED_TOOL_SEQUENCE.some((t) =>
            state.failedTools.has(t),
          )
        ) {
          const nextTool = SYSTEM_RULES.REQUIRED_TOOL_SEQUENCE.find(
            (t) => !state.failedTools.has(t),
          );
          if (nextTool) {
            if (state.forceRetryCount >= 3) {
              dlog("self", "warn", "force_retry limit reached", {
                step: state.step,
              });
            } else {
              emit({
                t: "force_retry",
                m: `Belum memenuhi minimal ${SYSTEM_RULES.MIN_FAILED_TOOLS} tool gagal. Coba ${nextTool} selanjutnya...`,
              });
              return {
                messages: [
                  {
                    role: "user",
                    content: `Anda belum mencoba tool ${nextTool}. Jalankan tool tersebut untuk mencari informasi lebih lanjut sebelum menyimpulkan.`,
                  },
                ],
                forceRetryCount: state.forceRetryCount + 1,
              };
            }
          }
        }

        if (!evidenceValid) {
          if (state.forceRetryCount >= 3) {
            dlog("self", "warn", "hasValidEvidence retry limit reached", {
              step: state.step,
            });
          } else {
            emit({
              t: "force_retry",
              m: "Jawaban belum berdasarkan bukti tools, meminta ulang...",
            });
            return {
              messages: [
                {
                  role: "user",
                  content:
                    "Jawaban Anda harus didasarkan pada bukti dari tools yang sudah dijalankan, tetapi DILARANG menyalin ulang log/output tool. Berikan kesimpulan SANGAT SINGKAT (1-2 kalimat) saja, langsung ke inti.",
                },
              ],
              forceRetryCount: state.forceRetryCount + 1,
            };
          }
        }

        // ── HALLUCINATION GUARD ─────────────────────────────────────────────────────
        // Evaluasi jawaban model sebelum dikirim ke user.
        // Jangan sentuh jawaban sampai proses evaluasi selesai.
        // Jika jawaban mengandung halusinasi mayoritas → retry.
        // Jika minoritas → strip klaim palsu, kirim versi bersih.
        const hGuard = hallucinationGuard(
          fallback,
          state.accessedEvidence,
          state.editLog || [],
        );
        dlog("self", "info", "hallucination_guard", {
          verdict: hGuard.verdict,
          hallucinated: hGuard.hallucinated.length,
        });

        if (hGuard.verdict === "block") {
          if (state.forceRetryCount >= 3) {
            // Batas retry tercapai. JANGAN buang jawaban model: tampilkan apa adanya
            // di UI, dan taruh peringatan "belum terverifikasi" HANYA di output agent
            // (timeline) sebagai satu langkah — bukan menempel di teks jawaban.
            dlog(
              "self",
              "warn",
              "hallucination_guard block, retry limit reached — answer kept, note to timeline",
              { step: state.step },
            );
            const _unv = hGuard.hallucinated
              .map((h) => h.raw)
              .filter(Boolean)
              .slice(0, 6)
              .join("; ");
            emit({
              t: "act",
              kind: "verify",
              arg: "sebagian klaim belum terverifikasi",
              ok: false,
              output:
                hGuard.hallucinated.length +
                " claim does not match the evidence from this tool run" +
                (_unv ? " — " + _unv : "") +
                ". Jawaban tetap ditampilkan; mohon verifikasi mandiri.",
            });
            // fallback TETAP = jawaban asli model (rawContent yg sudah disanitasi di
            // atas). Sengaja tak diganti pesan generik.
          } else {
            const hallucinatedList = hGuard.hallucinated
              .map((h) => `"${h.raw}"`)
              .join(", ");
            emit({
              t: "force_retry",
              m: `[HALLUCINATION GUARD] ${hGuard.hallucinated.length} klaim tidak terverifikasi: ${hallucinatedList.slice(0, 120)}`,
            });
            return {
              messages: [
                {
                  role: "user",
                  content: `PERINGATAN SISTEM: Jawaban Anda mengandung klaim yang TIDAK TERBUKTI dari hasil tool:\n${hallucinatedList}\n\nKamu DILARANG menyebutkan sesuatu yang tidak ada di bukti tool. Baca ulang hasil tool yang ada, lalu berikan jawaban HANYA berdasarkan apa yang BENAR-BENAR ditemukan. Jika tidak ada buktinya, katakan "not found".`,
                },
              ],
              forceRetryCount: state.forceRetryCount + 1,
            };
          }
        } else if (hGuard.verdict === "warn") {
          // Minoritas halusinasi — pakai versi yang sudah di-strip
          dlog("self", "info", "hallucination_guard stripped claims", {
            stripped: hGuard.hallucinated.length,
          });
          fallback = hGuard.sanitized || fallback;
        }
        // verdict === 'clean': jawaban bersih, lanjut
        // ── END HALLUCINATION GUARD ─────────────────────────────────────────────────

        // ── Teks bukan tanda selesai bila checklist MASIH terbuka ──
        //
        // Di bawah ini run DITUTUP dan teks model dipakai sebagai jawaban akhir.
        // Itu benar kalau pekerjaannya memang tuntas — tapi tak ada satu pun
        // pemeriksaan bahwa ia tuntas. Model yang mengumumkan rencananya lebih
        // dulu ("Saya buat folder baru freelance-landing/ ...") menutup run-nya
        // sendiri dengan satu kalimat niat, di tengah checklist yang masih 0/4.
        //
        // Sengaja MENDORONG, bukan memaksa: dorongan dibatasi
        // MAX_CONTINUE_NUDGE, dan sesudah itu run tetap ditutup — dengan catatan
        // jujur bahwa checklist belum tuntas, bukan diam-diam seolah selesai.
        const _sisa = (state.task_checklist || []).filter((b) =>
          /^\[(?: |→|!)\]/.test(String(b)),
        );
        if (
          hasContent &&
          _sisa.length &&
          (state.continueNudge || 0) < SYSTEM_RULES.MAX_CONTINUE_NUDGE
        ) {
          dlog("self", "info", "continue_nudge", {
            step: state.step,
            sisa: _sisa.length,
            ke: (state.continueNudge || 0) + 1,
          });
          emit({
            t: "force_retry",
            m:
              "Checklist belum tuntas (" +
              _sisa.length +
              " item) — melanjutkan, bukan menutup.",
          });
          return {
            messages: [
              {
                role: "user",
                content:
                  "JANGAN menutup pekerjaan. Checklist Anda masih punya " +
                  _sisa.length +
                  " item yang belum tuntas:\n" +
                  _sisa.join("\n") +
                  "\n\nDILARANG menarasikan rencana. PANGGIL tool untuk MENGERJAKAN " +
                  "item yang bertanda [→] sekarang juga. Kalau item itu sebenarnya " +
                  "sudah selesai, panggil todowrite untuk menandainya [x] lalu " +
                  "langsung kerjakan item berikutnya.",
              },
            ],
            continueNudge: (state.continueNudge || 0) + 1,
          };
        }
        // Sudah didorong sampai batas dan model tetap menarasikan: tutup, tapi
        // JANGAN mengaku selesai. Sisa pekerjaan disebutkan supaya user tahu
        // persis apa yang tak dikerjakan.
        if (hasContent && _sisa.length) {
          dlog("self", "warn", "continue_nudge limit reached", {
            step: state.step,
            sisa: _sisa.length,
          });
          fallback =
            fallback +
            "\n\n⚠ Run berhenti dengan " +
            _sisa.length +
            " item checklist BELUM tuntas:\n" +
            _sisa.join("\n");
        }

        dlog("self", "info", "stop", {
          reason: hasContent ? "text_response_no_tools" : "no_response",
          step: state.step,
          chars: (msg.content || "").length,
          sanitized: true,
        });

        emitPhase("validate", {
          tag: "Validate",
          status: "ok",
          attrs: [{ k: "step", v: state.step, t: "num" }],
          children: [
            {
              tag: "evidence_check",
              status: "ok",
              attrs: [{ k: "claim_grounded", v: "true", t: "str" }],
              evidence: true,
            },
            {
              tag: "hallucination_guard",
              status: hGuard.verdict === "clean" ? "ok" : "warn",
              attrs: [
                { k: "verdict", v: hGuard.verdict, t: "str" },
                { k: "hallucinated", v: hGuard.hallucinated.length, t: "num" },
              ],
            },
            {
              tag: "strip_tool_recap",
              status: "ok",
              attrs: [{ k: "final_chars", v: fallback.length, t: "num" }],
            },
            {
              tag: "sandbox_audit",
              status: "ok",
              attrs: [{ k: "files_written", v: state.edits, t: "num" }],
            },
          ],
        });

        emit({
          t: "adone",
          steps: state.step,
          edits: state.edits,
          summary: fallback,
          backup: sessionSnapshotId,
        });

        emitPhase("return", {
          tag: "Return",
          status: "ok",
          attrs: [{ k: "step", v: state.step, t: "num" }],
          children: [
            {
              tag: "response",
              status: "ok",
              attrs: [
                { k: "type", v: "text", t: "str" },
                { k: "chars", v: fallback.length, t: "num" },
                { k: "preview", v: fallback.slice(0, 80), t: "str" },
              ],
            },
          ],
        });

        return { finalSummary: fallback, stopReason: "finished" };
      })
      .addConditionalEdges(START, (state) => {
        if (state.hitlApproved) return "executor";
        const lastMsg = state.messages[state.messages.length - 1];
        const TASK_KEYWORDS =
          /\b(code|coding|program|script|function|fungsi|kelas|class|algorithm|algoritma|buat(?:kan)?|tulis(?:kan)?|implement|debug|fix|perbaiki|refactor|optimi[sz]e|sort|parse|regex|api|loop|array|string|hitung|kalkulator|baca|file|folder|cari|search|hapus|edit|ubah|ganti|tambah(?:kan)?|jalankan|eksekusi|test|bantu)\b/i;
        const CODE_KEYWORDS =
          /\b(buat(?:kan)?|tulis(?:kan)?|implement|debug|fix|perbaiki|refactor|optimi[sz]e|edit|ubah|ganti|tambah(?:kan)?|jalankan|eksekusi|code|program|script)\b/i;
        if (
          state.task_checklist &&
          state.task_checklist.length === 0 &&
          lastMsg.role === "user" &&
          CODE_KEYWORDS.test(lastMsg.content)
        ) {
          return "planner";
        }
        // Skip planner for simple search/lookup — langsung executor
        return "executor";
      })
      .addEdge("planner", "executor")
      .addConditionalEdges("executor", (state) => {
        if (state.stopReason) return END;
        const msg = state.messages[state.messages.length - 1];
        if (
          msg.role === "assistant" &&
          msg.tool_calls &&
          msg.tool_calls.length > 0
        )
          return "tools";
        // If fallback provider updated but no tools were returned
        if (msg.role !== "assistant") return "executor";
        return "validate";
      })
      .addConditionalEdges("tools", (state) => {
        if (state.stopReason) return END;
        // Jeda-checkpoint (bukan tebing): kalau plafon langkah tercapai, graph berhenti
        // di sini DENGAN state tersimpan di checkpointer — final handler menandainya
        // sebagai "dijeda, bisa dilanjutkan", tanpa rollback. Jalur utama tetap natural
        // completion (validate -> finished); ini hanya rem yang memberi user pilihan.
        if (state.step >= (state.stepCeiling || MAX_STEPS)) return END;
        return "executor";
      })
      .addConditionalEdges("validate", (state) => {
        if (state.stopReason === "finished") return END;
        return "executor";
      });

    const app = workflow.compile({ checkpointer: memoriAgen() });
    // recursionLimit LangGraph menghitung SUPER-STEP (tiap eksekusi node), sedang app
    // menghitung "step" hanya di node tools. Satu app-step = executor + tools = ~2
    // super-step, plus planner/validate/retry. Default LangGraph (25) lebih kecil dari
    // super-step yang dibutuhkan untuk mencapai MAX_STEPS (14-20) -> graph dilempar
    // "Recursion limit reached" SEBELUM logika stop/pause graceful app jalan. Skalakan
    // supaya app selalu berhenti duluan (loop app sendiri sudah bounded: callCounts,
    // forceRetryCount<3, fallbackCount<3, step>=ceiling).
    const recLimit = (ceil) => Math.max(ceil || MAX_STEPS, 1) * 2 + 40;
    const config = {
      configurable: { thread_id },
      recursionLimit: recLimit(MAX_STEPS),
    };

    let finalState;
    if (hitl_response) {
      // HITL Resume: get checkpoint state, run all pending tools directly, then continue graph
      const checkpoint = await app.getState(config);
      const savedState = checkpoint.values;
      const pendingTools =
        savedState.pendingToolCalls && savedState.pendingToolCalls.length > 0
          ? savedState.pendingToolCalls
          : savedState.pendingToolCall
            ? [savedState.pendingToolCall]
            : [];

      if (pendingTools.length > 0) {
        // Execute all approved tool calls directly
        emit({ t: "step", n: (savedState.step || 0) + 1 });
        emit({
          t: "act",
          kind: "hitl_approved",
          arg: pendingTools.map((tc) => tc.function.name).join(", "),
          ok: true,
          output: "Diizinkan oleh user ✔",
        });

        const toolResults = [];
        for (const pendingTc of pendingTools) {
          let args = {};
          try {
            args = JSON.parse(pendingTc.function.arguments || "{}");
          } catch (_) {}
          if (
            /^(edit|write|replace_file_content|write_artifact)$/i.test(
              pendingTc.function.name,
            )
          )
            await ensureBackup();

          const r = await runSelfTool(
            pendingTc.function.name,
            args,
            emit,
            agentCtx,
          );
          if (r.edited) edits++; // keep the crash-rollback guard's counter honest
          const toolResult = r.output || "(ok)";

          emit({
            t: "act",
            kind: pendingTc.function.name,
            arg: args.path || args.command || "",
            ok: !!r.ok,
            output: toolResult,
          });
          toolResults.push({
            tc: pendingTc,
            output: toolResult,
            edited: !!r.edited,
          });
        }

        // Build new messages: current history + all tool results, then continue graph fresh.
        // The checkpoint's messages end with PLACEHOLDER tool responses ("Menunggu
        // persetujuan user...") that were pushed for the pending calls when HITL fired.
        // Appending the real results would leave TWO tool messages for the same
        // tool_call_id — strict providers (deepseek et al.) reject that as an invalid
        // sequence. Drop the placeholders first so each tool_call has exactly one response.
        const pendingIds = new Set(pendingTools.map((tc) => tc.id));
        const historyWithoutPlaceholders = (savedState.messages || []).filter(
          (m) => !(m.role === "tool" && pendingIds.has(m.tool_call_id)),
        );
        const continuationMessages = [
          ...historyWithoutPlaceholders,
          ...toolResults.map(({ tc, output }) => ({
            role: "tool",
            tool_call_id: tc.id,
            content: output,
          })),
        ];

        // Restart graph. hitlApproved: true means all subsequent execution tools in this turn
        // are auto-allowed. The flag resets to false when a new user message arrives (fresh invoke).
        finalState = await app.invoke(
          {
            messages: continuationMessages,
            step: (savedState.step || 0) + 1,
            edits:
              (savedState.edits || 0) +
              toolResults.filter((r) => r.edited).length,
            hitlApproved: true,
            pendingToolCall: null,
            pendingToolCalls: [],
            task_checklist: savedState.task_checklist || [],
          },
          {
            configurable: { thread_id: thread_id + "_resume_" + Date.now() },
            recursionLimit: recLimit(savedState.stepCeiling),
          },
        );
      } else {
        // No pending tool call found — just restart normally
        finalState = await app.invoke({ messages, hitlApproved: true }, config);
      }
    } else if (continue_response) {
      // Continue setelah jeda-budget: ambil checkpoint, perpanjang plafon satu window
      // lagi, lalu lanjutkan dari state yang tersimpan. Tidak ada rollback, tidak ada
      // re-plan — persis melanjutkan pekerjaan yang tadi dijeda.
      const checkpoint = await app.getState(config);
      const savedState = (checkpoint && checkpoint.values) || {};
      const prevCeiling = savedState.stepCeiling || MAX_STEPS;
      emit({ t: "step", n: savedState.step || 0 });
      emit({
        t: "act",
        kind: "continue",
        arg: "",
        ok: true,
        output: `Melanjutkan (plafon → ${prevCeiling + MAX_STEPS} langkah)`,
      });
      finalState = await app.invoke(
        {
          messages: savedState.messages || [],
          step: savedState.step || 0,
          edits: savedState.edits || 0,
          task_checklist: savedState.task_checklist || [],
          stepCeiling: prevCeiling + MAX_STEPS,
          stopReason: "",
        },
        {
          configurable: { thread_id: thread_id + "_cont_" + Date.now() },
          recursionLimit: recLimit(prevCeiling + MAX_STEPS),
        },
      );
    } else {
      // Initial run — pre-search injection + intent-based routing
      try {
        const fileToolsMod = require("./tools/file-tools.ts");
        const userMsg = messages[messages.length - 1];
        if (userMsg && userMsg.role === "user" && fileToolsMod.qGrep) {
          const content = (userMsg.content || "").toLowerCase();

          // Intent-based pre-routing: tell agent WHERE to look
          const INTENT_MAP = [
            {
              keywords: [
                "tombol",
                "button",
                "fitur",
                "menu",
                "ui",
                "sidebar",
                "composer",
                "chat",
                "modal",
                "komponen",
                "component",
                "halaman",
                "page",
                "app.jsx",
              ],
              hint: "UI/React ada di public/app.jsx",
            },
            {
              keywords: [
                "css",
                "warna",
                "color",
                "style",
                "theme",
                "tema",
                "layout",
                "border",
                "background",
                "font",
              ],
              hint: "Styling ada di public/styles.css",
            },
            {
              keywords: [
                "agent",
                "hitl",
                "tool",
                "langgraph",
                "graph",
                "executor",
                "planner",
                "validate",
                "rencana",
                "self_agent",
              ],
              hint: "Agent logic ada di agent/self_agent.cjs",
            },
            {
              keywords: [
                "tool definition",
                "tool-def",
                "daftar tool",
                "definisi tool",
              ],
              hint: "Tool definitions ada di agent/tools/tool-definitions.ts",
            },
            {
              keywords: [
                "server",
                "route",
                "api",
                "endpoint",
                "http",
                "port",
                "sse",
              ],
              hint: "Server ada di server.cjs",
            },
            {
              keywords: ["config", "konfigurasi", "mcp", "prompt"],
              hint: "Config ada di config/",
            },
          ];
          let routingHint = "";
          for (const intent of INTENT_MAP) {
            if (intent.keywords.some((k) => content.includes(k))) {
              routingHint = intent.hint;
              break;
            }
          }

          // Extract likely search keywords from user message
          const afterVerb = content.match(
            /(?:cari|hapus|temukan|edit|ganti|ubah|cari letak|di mana|where is)\s+(.{3,60})/i,
          );
          let keywords = [];
          if (afterVerb && afterVerb[1]) {
            let kw = afterVerb[1]
              .replace(
                /^(di\s+(dalam\s+)?)|(yang\s+)|(kode\s+|tombol\s+|button\s+|fitur\s+)/gi,
                "",
              )
              .trim();
            kw = kw.split(/\s+/).slice(0, 4).join(" ");
            if (kw.length >= 3) keywords.push(kw);
          }
          if (keywords.length === 0) {
            const words = (userMsg.content || "")
              .split(/\s+/)
              .filter(
                (w) =>
                  w.length >= 4 &&
                  !/^(yang|dengan|untuk|dari|pada|akan|bisa|harus|saya|tolong|silakan|mana|dimana|cara|buat|tampilkan|jelaskan|berikan|periksa|cek|lihat|karena|tetapi|namun|jika|kalau|supaya|agar|sehingga|sangat|juga|sudah|belum|masih|lebih|kurang|paling|saja|ini|itu|ada|tidak|dengan|dalam|luar|atas|bawah|kiri|kanan|depan|belakang|semua|setiap|beberapa|banyak|sedikit|cari|hapus|temukan|edit|ganti|ubah|fitur|tombol|button|kode|file|folder|project|direktori)/i.test(
                    w,
                  ),
              );
            if (words.length > 0) keywords.push(words.slice(0, 3).join(" "));
          }

          if (keywords.length > 0) {
            const grepResults = [];
            for (const kw of keywords.slice(0, 2)) {
              const result = fileToolsMod.qGrep(kw, {});
              if (result && !result.startsWith("(") && result.length > 5) {
                grepResults.push('grep "' + kw + '":\n' + result.slice(0, 500));
              }
            }
            if (grepResults.length > 0) {
              let preSearch =
                "\n\n[PRE-SEARCH — hasil sudah ada. JANGAN grep ulang. Langsung read + edit/jawab]:\n" +
                grepResults.join("\n\n");
              if (routingHint) preSearch += "\n\n[ROUTE] " + routingHint;
              messages[0].content += preSearch;
              dlog("self", "info", "pre_search_injected", {
                keywords,
                routing: routingHint,
                chars: preSearch.length,
              });
            } else if (routingHint) {
              messages[0].content +=
                "\n\n[ROUTE] " +
                routingHint +
                ". Gunakan grep/read langsung ke file ini.";
            }
          } else if (routingHint) {
            messages[0].content +=
              "\n\n[ROUTE] " +
              routingHint +
              ". Gunakan grep/read langsung ke file ini.";
          }
        }
      } catch (e) {
        dlog("self", "warn", "pre_search_failed", { error: e.message });
      }
      finalState = await app.invoke({ messages }, config);
    }

    if (
      finalState.stopReason === "repeated_tool_calls" ||
      finalState.stopReason === "waiting_for_user_answer" ||
      finalState.stopReason === "hitl"
    ) {
      if (finalState.stopReason === "hitl") {
        dlog("self", "info", "stop", { reason: "hitl", step: finalState.step });
        emit({
          t: "adone",
          steps: finalState.step,
          edits: finalState.edits,
          summary: finalState.finalSummary,
          backup: sessionSnapshotId,
          hitlPending: true,
          thread_id,
        });
      } else if (finalState.waitForAnswer) {
        dlog("self", "info", "stop", {
          reason: "waiting_for_user_answer",
          step: finalState.step,
        });
        emit({
          t: "adone",
          steps: finalState.step,
          edits: finalState.edits,
          summary: finalState.finalSummary,
          backup: sessionSnapshotId,
          waitForAnswer: true,
          thread_id,
        });
      } else {
        emit({
          t: "adone",
          steps: finalState.step,
          edits: finalState.edits,
          summary: finalState.finalSummary,
          backup: sessionSnapshotId,
        });
      }
    } else if (
      finalState.step >= (finalState.stepCeiling || MAX_STEPS) &&
      finalState.stopReason !== "finished"
    ) {
      // Plafon langkah tercapai TANPA natural completion. Ini BUKAN kegagalan —
      // agent masih bekerja produktif, cuma butuh window langkah berikutnya. Jangan
      // rollback: state tersimpan di checkpointer (thread_id), jadi tawarkan lanjut.
      // Natural completion tetap jalur selesai yang sebenarnya; ini jeda, bukan tebing.
      dlog("self", "info", "stop", {
        reason: "paused_budget",
        step: finalState.step,
      });
      // Laporkan APA yang terjadi selama langkah-langkah itu, bukan cuma
      // nomornya — tanpa ini, 14 langkah produktif dan 14 langkah berputar
      // menghasilkan kalimat yang sama persis.
      const activity = describePauseActivity(finalState, sess);
      const nextBudget = (finalState.stepCeiling || MAX_STEPS) + MAX_STEPS;
      // Sisa checklist ikut disebut: yang menentukan apakah "Lanjutkan" layak
      // ditekan adalah APA yang belum selesai, bukan berapa langkah terpakai.
      const sisa = pendingChecklist(finalState.task_checklist);
      finalSummary =
        `Dijeda di langkah ${finalState.step} — ${activity}. ` +
        (sisa.length
          ? `Belum selesai:\n${sisa.join("\n")}\n`
          : "Belum selesai; ") +
        `"Lanjutkan" menambah plafon ke ${nextBudget} langkah.`;
      emit({
        t: "adone",
        steps: finalState.step,
        edits: finalState.edits,
        summary: finalSummary,
        backup: sessionSnapshotId,
        paused: true,
        continuable: true,
        thread_id,
      });
    } else if (finalState.stopReason === "finished") {
      dlog("self", "info", "stop", {
        reason: "finished",
        step: finalState.step,
      });
      finalSummary = finalState.finalSummary || "Selesai.";
      if (!finalState.finalSummary) {
        emit({
          t: "adone",
          steps: finalState.step,
          edits: finalState.edits,
          summary: finalSummary,
          backup: sessionSnapshotId,
        });
      }
    } else {
      // Catch-all: any other stopReason (error, cancelled, or unknown) — ALWAYS emit adone
      dlog("self", "info", "stop", {
        reason: finalState.stopReason || "unknown",
        step: finalState.step,
      });
      if (finalState.stopReason === "error") {
        // Pesan yang sudah disusun di titik kegagalan menang, karena hanya ia
        // yang tahu provider mana dan gagal karena apa.
        finalSummary =
          finalState.finalSummary ||
          "Cloud API error — coba lagi dalam beberapa detik.";
      } else if (finalState.stopReason === "cancelled") {
        finalSummary = "Dibatalkan oleh user.";
      } else {
        finalSummary = finalState.finalSummary || "Selesai.";
      }
      emit({
        t: "adone",
        steps: finalState.step,
        edits: finalState.edits,
        summary: finalSummary,
        backup: sessionSnapshotId,
      });
    }

    finalSummary = finalState.finalSummary || finalSummary;
  } catch (e) {
    const msg = (e && e.message) || String(e);
    // Pertahanan berlapis: kalau recursionLimit LangGraph tetap terpicu (kasus tepi),
    // itu BUKAN crash — agent kehabisan "putaran", bukan gagal. Jangan rollback edit
    // yang sudah sukses, dan beri pesan yang bisa dilanjutkan (bukan error mentah).
    if (/recursion limit/i.test(msg)) {
      dlog("self", "info", "stop", {
        reason: "recursion_limit",
        edits: edits || 0,
      });
      finalSummary =
        (edits || 0) > 0
          ? `Dijeda: mencapai batas putaran internal (${edits} file sudah diedit). Minta "lanjutkan" untuk meneruskan.`
          : 'Dijeda: mencapai batas putaran internal sebelum selesai. Minta "lanjutkan" atau perjelas tugasnya.';
      emit({
        t: "adone",
        steps: 0,
        edits: edits || 0,
        summary: finalSummary,
        backup: sessionSnapshotId,
        paused: true,
        continuable: true,
        thread_id,
      });
      return finalSummary;
    }
    dlog("self", "info", "stop", {
      reason: "unhandled_exception",
      error: msg.slice(0, 100),
    });
    if (sessionSnapshotId && (edits || 0) === 0) {
      // Nilai balik rollback DIPERIKSA, dan panggilannya dibungkus.
      //
      // Dulu: `rollback(id)` tanpa memeriksa apa pun, lalu selalu memberi tahu
      // "Proyek dipulihkan". Dua kegagalan terbukti lewat eksekusi blok ini
      // apa adanya:
      //   - snapshot tak ada  -> rollback {ok:false}, DIABAIKAN, user tetap
      //     diberi tahu proyeknya sudah dipulihkan (padahal tidak)
      //   - metadata rusak    -> rollback MELEMPAR, dan lemparan di sini
      //     membunuh tiga emit di bawahnya termasuk adone. Hasilnya NOL pesan
      //     ke UI, dan UI menggantung selamanya karena tak pernah tahu run
      //     berakhir. Kegagalan pemulihan jadi UI beku permanen.
      //
      // Sekarang kabarnya jujur: berhasil disebut berhasil, gagal disebut gagal
      // BESERTA sebabnya — justru saat itulah user paling perlu tahu, karena
      // pekerjaannya mungkin memang belum kembali.
      let pulih = { ok: false, error: "rollback tidak dijalankan" };
      try {
        pulih = rollback(sessionSnapshotId) || pulih;
      } catch (errRb) {
        pulih = { ok: false, error: errRb.message };
      }
      emit({
        t: "err",
        m: pulih.ok
          ? `[Auto-Rollback] Agen crash internal. Proyek dipulihkan (Snapshot: ${sessionSnapshotId}).`
          : `[Auto-Rollback GAGAL] Agen crash internal dan proyek TIDAK dipulihkan: ${pulih.error} (Snapshot: ${sessionSnapshotId}). Periksa berkas Anda sebelum melanjutkan.`,
      });
    }
    if (!isCancelled()) emit({ t: "err", m: e.message });
    // ALWAYS emit adone so frontend knows the agent is done
    emit({
      t: "adone",
      steps: 0,
      edits: edits || 0,
      summary: "Error: " + (e.message || "unknown").slice(0, 100),
      backup: sessionSnapshotId,
    });
    finalSummary = "Error: " + (e.message || "").slice(0, 80);
  }
  dlog("self", "info", "stop", {
    reason: "end_of_function",
    finalSummary: (finalSummary || "").slice(0, 80),
  });
  return finalSummary;
}

// describePauseActivity diekspor UNTUK DIUJI. Ia murni (state masuk, string
// keluar) sehingga bisa diverifikasi tanpa menjalankan graph atau memanggil
// model — kalau tidak, satu-satunya cara mengujinya adalah menunggu agent
// benar-benar menyentuh plafon langkah.
module.exports = {
  selfAgentStream,
  describePauseActivity,
  // Diekspor untuk diuji: helper murni, tak menyentuh graph/IO.
  itemAktif,
  catatGagalItem,
  checklistDenganKegagalan,
  SYSTEM_RULES,
};
