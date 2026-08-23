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
const i = SRC.indexOf("function _ringkasGagalCloud(");
if (i < 0) throw new Error("_ringkasGagalCloud tak ketemu");
const ringkas = eval(
  "(function(){" +
    SRC.slice(i, SRC.indexOf("\n}", i) + 2) +
    "\nreturn _ringkasGagalCloud;})()",
);

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
    expect(t).toMatch(/menunggu tidak akan menolong/i);
    expect(t).not.toMatch(/coba lagi (sebentar|dalam beberapa detik)/i);
  });

  test("menyebut apa yang harus dilakukan, bukan cuma menolak", () => {
    const t = ringkas("puter", new Error(GALAT_402_KREDIT), ["custom"]);
    expect(t).toMatch(/kredit|dasbor/i);
  });
});

describe("batas laju MEMANG sementara", () => {
  test("429 -> menyuruh mencoba lagi", () => {
    const t = ringkas("opencode", new Error(GALAT_429), ["opencode"]);
    expect(t).toMatch(/sementara/i);
    expect(t).toMatch(/coba lagi/i);
    expect(t).not.toMatch(/menunggu tidak akan menolong/i);
  });
});

describe("pesan asli provider tidak pernah hilang", () => {
  test.each([
    ["402", GALAT_402_PUTER, "No usage left for request."],
    ["429", GALAT_429, "FreeUsageLimitError"],
    ["500", "github 500: internal server error", "internal server error"],
  ])("%s membawa balasan aslinya", (_n, galat, jejak) => {
    const t = ringkas("x", new Error(galat), []);
    expect(t).toContain("Balasan terakhir:");
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
    expect(t).toContain("Balasan terakhir:");
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
