// Kegagalan provider cloud harus menyebut SEBABNYA, bukan menyuruh menunggu.
//
// KENAPA ADA. Saat semua provider habis, run ditutup dengan satu kalimat tetap:
// "Cloud API error — coba lagi dalam beberapa detik." Pesan asli provider
// dibuang di titik kegagalan (`return { stopReason: "error" }` tanpa membawa
// apa pun), padahal pesan itulah yang menyebut persis apa yang salah.
//
// Run nyata dari log pemakai:
//
//   opencode 429 FreeUsageLimitError                    -> beralih ke github
//   custom   402 "Insufficient credit. Add funds at zyloo.io/…/billing."
//   puter    402 "No usage left for request."           -> berhenti
//   yang dilihat pemakai: "coba lagi dalam beberapa detik."
//
// Nasihat itu SALAH untuk 402. Kredit habis tak pulih dengan menunggu, jadi
// pemakai menunggu, mencoba lagi, gagal lagi, dan tak pernah tahu bahwa yang
// perlu dilakukan ada di dasbor penagihan providernya. Gejalanya terbaca
// sebagai "aplikasinya rusak" — itu persis laporan yang masuk.
//
// Yang dikunci di sini cuma satu pembedaan, karena hanya itu yang mengubah
// tindakan pemakai berikutnya: apakah MENUNGGU menolong atau tidak.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const SRC = fs
  .readFileSync(path.join(AKAR, "agent", "self_agent.ts"), "utf8")
  .replace(/\r\n/g, "\n");

// Fungsinya DIAMBIL dari sumber lalu dijalankan — bukan ditulis ulang menurut
// tafsiran, supaya yang diuji memang jalur produksi.
// KETIGANYA diambil, bukan cuma yang terakhir. _ringkasGagalCloud sekarang
// memanggil _klasifikasiGagal dan _rincianGagal — dan mengambil satu fungsi
// tanpa yang dipanggilnya menghasilkan ReferenceError saat dijalankan, bukan
// kegagalan yang menjelaskan apa pun. Ketiganya bersebelahan di sumber, jadi
// satu irisan memuat semuanya.
const awal = SRC.indexOf("function _klasifikasiGagal(");
const i = SRC.indexOf("function _ringkasGagalCloud(");
if (awal < 0) throw new Error("_klasifikasiGagal tak ketemu");
if (i < 0) throw new Error("_ringkasGagalCloud tak ketemu");
if (awal > i) throw new Error("urutan fungsi berubah — irisan tak lagi utuh");
const potongan = SRC.slice(awal, SRC.indexOf("\n}", i) + 2);
const diambil = eval(
  "(function(){" +
    potongan +
    "\nreturn { _ringkasGagalCloud, _klasifikasiGagal, _rincianGagal };})()",
);
const ringkas = diambil._ringkasGagalCloud;
const klasifikasi = diambil._klasifikasiGagal;

// Persis bunyi galat yang tercatat di log pemakai.
const GALAT_402_PUTER =
  'puter 402: {"error":"No usage left for request.","message":"No usage left for request.","code":"insufficient"}';
const GALAT_402_KREDIT =
  'custom 402: {"error":{"message":"Insufficient credit. Add funds at zyloo.io/dashboard/billing."}}';
const GALAT_429 =
  'opencode 429: {"type":"error","error":{"type":"FreeUsageLimitError","message":"Error from provider (Console): Rate limit"}}';

describe("kuota/kredit habis TIDAK disuruh menunggu", () => {
  test.each([
    ["402 tanpa sisa pemakaian", GALAT_402_PUTER],
    ["402 kredit kurang", GALAT_402_KREDIT],
    ["401 kunci ditolak", "openai 401: invalid_api_key"],
    ["403 terlarang", "gemini 403: PERMISSION_DENIED"],
  ])("%s -> bilang menunggu tidak menolong", (_n, galat) => {
    const t = ringkas("puter", new Error(galat), ["opencode", "github"]);
    expect(t).toMatch(/waiting will not help/i);
    expect(t).not.toMatch(/coba lagi (sebentar|dalam beberapa detik)/i);
  });

  test("menyebut apa yang harus dilakukan, bukan cuma menolak", () => {
    const t = ringkas("puter", new Error(GALAT_402_KREDIT), ["custom"]);
    expect(t).toMatch(/credit|dashboard/i);
  });
});

describe("batas laju MEMANG sementara", () => {
  test("429 -> menyuruh mencoba lagi", () => {
    const t = ringkas("opencode", new Error(GALAT_429), ["opencode"]);
    expect(t).toMatch(/temporary/i);
    expect(t).toMatch(/try again/i);
    expect(t).not.toMatch(/waiting will not help/i);
  });
});

describe("pesan asli provider tidak pernah hilang", () => {
  test.each([
    ["402", GALAT_402_PUTER, "No usage left for request."],
    ["429", GALAT_429, "FreeUsageLimitError"],
    ["500", "github 500: internal server error", "internal server error"],
  ])("%s membawa balasan aslinya", (_n, galat, jejak) => {
    const t = ringkas("x", new Error(galat), []);
    expect(t).toContain("Last reply:");
    expect(t).toContain(jejak);
  });

  test("provider yang sudah dicoba ikut disebut", () => {
    // Tanpa ini pemakai tak tahu bahwa fallback sudah berjalan dan HABIS —
    // ia mengira cuma satu provider yang gagal.
    const t = ringkas("puter", new Error(GALAT_402_PUTER), [
      "opencode",
      "github",
      "custom",
    ]);
    for (const p of ["opencode", "github", "custom", "puter"])
      expect(t).toContain(p);
  });

  test("tanpa daftar provider pun tetap terbaca", () => {
    const t = ringkas(null, new Error("boom"), []);
    expect(t).toContain("Last reply:");
    expect(t).not.toContain("(dicoba: )");
  });
});

describe("ringkasan itu benar-benar dipakai saat run ditutup", () => {
  test("titik kegagalan MEMBAWA sebabnya, tidak membuangnya", () => {
    // `return { stopReason: "error" }` polos adalah bentuk lama: pesannya
    // hilang di situ, dan tak ada yang bisa memulihkannya di hilir.
    expect(SRC).toMatch(
      /stopReason: "error",\s*\n\s*finalSummary: _ringkasGagalCloud\(/,
    );
  });

  test("penutup memakai ringkasan itu, bukan kalimat tetap", () => {
    expect(SRC).toMatch(
      /finalSummary =\s*\n?\s*finalState\.finalSummary \|\|\s*\n?\s*"Cloud API error/,
    );
  });
});

// ── Tiga kegagalan, tiga sebab, satu laporan ────────────────────────────────
//
// DARI RUN SUNGGUHAN. Tiga provider gagal karena tiga hal yang tak berhubungan:
//
//   opencode  401 AuthError: Invalid API key.
//   github    getaddrinfo ENOTFOUND models.inference.ai.azure.com
//   custom    write EPROTO ... SSLV3_ALERT_HANDSHAKE_FAILURE
//
// dan ringkasannya hanya menampilkan yang TERAKHIR — sehingga terbaca seolah
// TLS menghentikan segalanya. Kesimpulan pemakainya: modelnya yang gagal.
// Padahal tak satu pun permintaan sampai ke model: satu kunci tidak valid, dan
// satu host sudah tidak ada.
describe("setiap provider melaporkan sebabnya sendiri", () => {
  const ALASAN = [
    {
      provider: "opencode",
      error: '401: {"type":"AuthError","message":"Invalid API key."}',
    },
    {
      provider: "github",
      error: "getaddrinfo ENOTFOUND models.inference.ai.azure.com",
    },
    {
      provider: "custom",
      error:
        "write EPROTO 275200:error:10000410:SSL routines:SSLV3_ALERT_HANDSHAKE_FAILURE",
    },
  ];

  test("ketiganya muncul, bukan cuma yang terakhir", () => {
    const out = ringkas(
      "custom",
      new Error(ALASAN[2].error),
      ["opencode", "github"],
      ALASAN,
    );
    expect(out).toContain("opencode");
    expect(out).toContain("github");
    expect(out).toContain("custom");
  });

  test("masing-masing membawa sebab aslinya", () => {
    const out = ringkas("custom", new Error(ALASAN[2].error), [], ALASAN);
    expect(out).toContain("Invalid API key");
    expect(out).toContain("ENOTFOUND");
    expect(out).toMatch(/EPROTO|SSL/);
  });

  test("masing-masing diberi kategori dan tindakan", () => {
    const out = ringkas("custom", new Error(ALASAN[2].error), [], ALASAN);
    expect(out).toMatch(/\[auth\]/);
    expect(out).toMatch(/\[address\]/);
    expect(out).toMatch(/\[tls\]/);
    expect(out).toMatch(/replace it in settings/);
    expect(out).toMatch(/does not resolve/);
  });

  test("tanpa daftar alasan, ringkasannya tetap seperti dulu", () => {
    // Pemanggil lama meneruskan tiga argumen saja; ia tak boleh berubah.
    const out = ringkas("puter", new Error("puter 429: rate limit"), ["a"]);
    expect(out).toContain("rate limiting");
    expect(out).not.toContain("What happened with each");
  });
});

describe("klasifikasi memilih menurut yang harus DILAKUKAN pembaca", () => {
  const jenis = (m: string) => klasifikasi(m).jenis;

  test("nama host mati bukan masalah jaringan pemakai", () => {
    // Ini yang paling menyesatkan: terbaca seperti internet pemakai yang rusak.
    expect(jenis("getaddrinfo ENOTFOUND models.inference.ai.azure.com")).toBe(
      "address",
    );
    expect(jenis("getaddrinfo EAI_AGAIN api.contoh.test")).toBe("address");
  });

  test("jabat tangan TLS ditolak", () => {
    expect(jenis("write EPROTO ... SSLV3_ALERT_HANDSHAKE_FAILURE")).toBe("tls");
    expect(jenis("unable to verify the first certificate CERT_UNTRUSTED")).toBe(
      "tls",
    );
  });

  test("kunci ditolak, dan itu bukan sesuatu yang membaik dengan menunggu", () => {
    expect(jenis('401: {"type":"AuthError"}')).toBe("auth");
    expect(jenis("403 Forbidden")).toBe("auth");
    expect(klasifikasi("401 unauthorized").saran).toMatch(/replace it/);
  });

  test("kuota, rate limit, dan galat server dibedakan", () => {
    // Ketiganya "gagal", tapi hanya dua yang membaik dengan menunggu.
    expect(jenis("402 insufficient credit")).toBe("quota");
    expect(jenis("429 Too Many Requests")).toBe("rate");
    expect(jenis("503 Service Unavailable")).toBe("server");
    expect(klasifikasi("402 quota").saran).toMatch(/will not help/);
    expect(klasifikasi("429 rate limit").saran).toMatch(/try again/);
  });

  test("layanan yang dipensiunkan punya kategorinya sendiri", () => {
    // GitHub Models menjawab persis ini sekarang.
    expect(jenis('410 {"code":"github_models_retirement_brownout"}')).toBe(
      "retired",
    );
    expect(klasifikasi("410 retirement").saran).toMatch(/needs replacing/);
  });

  test("yang tak dikenali tidak dikarang kategorinya", () => {
    const k = klasifikasi("sesuatu yang belum pernah terjadi");
    expect(k.jenis).toBe("unknown");
    expect(k.saran).toBe("");
  });

  test("tanpa pesan sama sekali pun tidak melempar", () => {
    for (const m of [null, undefined, "", 0])
      expect(klasifikasi(m as any).jenis).toBe("unknown");
  });
});
