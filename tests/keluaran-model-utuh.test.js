// Penyaring jawaban akhir tidak boleh MERUSAK jawaban modelnya sendiri.
//
// KENAPA ADA. Sebelum sampai ke layar, teks model melewati empat penyaring:
// stripThinkBlocks -> stripToolRecap -> truncateToConcise (+ salvageReasoning
// kalau model tak menutup jawabannya). Keempatnya bekerja dengan regex di atas
// teks bebas — padahal jawaban model BUKAN teks bebas: sebagian isinya kode dan
// diagram yang kebetulan memuat kata atau tanda yang sedang dicari penyaring.
//
// Yang benar-benar terjadi, semuanya terukur dengan menjalankan fungsi aslinya:
//
//   stripToolRecap("Berikut bukti dari tool ... \n\n<jawaban 2 paragraf>")
//     -> ""                       (SELURUH jawaban lenyap)
//
// Sapuan `[\s\S]*?(?=Kesimpulan:|$)` berhenti di penanda berikutnya, dan `$`
// sebagai alternatif terakhir berarti AKHIR SELURUH TEKS. Model jarang menulis
// "Kesimpulan:", jadi cabang `$` itulah yang biasanya kena.
//
// Berkas ini mengunci keempatnya: penyaring boleh membuang apa yang memang
// sampah, tapi tak boleh memakan jawaban, tak boleh menyentuh isi blok berpagar,
// dan tak boleh meninggalkan pagar yang tak berpasangan (UI akan merender sisa
// pesan sebagai kode).

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const SRC = fs
  .readFileSync(path.join(AKAR, "agent", "self_agent.cjs"), "utf8")
  .replace(/\r\n/g, "\n");

// Fungsinya DIAMBIL dari sumber lalu dieksekusi — bukan ditulis ulang menurut
// tafsiran, supaya yang diuji memang jalur produksi.
const ambilFungsi = (nama) => {
  const i = SRC.indexOf("function " + nama + "(");
  if (i < 0) throw new Error("fungsi tak ketemu: " + nama);
  return SRC.slice(i, SRC.indexOf("\n}", i) + 2);
};
const ambilConst = (nama) => {
  const i = SRC.indexOf("const " + nama + " =");
  if (i < 0) throw new Error("const tak ketemu: " + nama);
  return SRC.slice(i, SRC.indexOf(";\n", i) + 1);
};

const NAMA = [
  "_tanpaKode",
  "_paragrafSadarPagar",
  "stripThinkBlocks",
  "_tampakCatatanKerja",
  "salvageReasoning",
  "stripToolRecap",
  "_potongRapi",
  "truncateToConcise",
];
const {
  stripThinkBlocks,
  salvageReasoning,
  stripToolRecap,
  truncateToConcise,
} = eval(
  "(function(){" +
    ambilConst("_POLA_KODE") +
    ambilConst("_AWAL_REKAP") +
    NAMA.map(ambilFungsi).join("\n") +
    "return {" +
    NAMA.join(",") +
    "};})()",
);

const pagarSeimbang = (s) => (String(s).match(/```/g) || []).length % 2 === 0;

describe("stripToolRecap tidak memakan jawaban", () => {
  test("pembuka 'Berikut bukti dari tool' tidak menghapus sisa jawaban", () => {
    const t =
      "Berikut bukti dari tool yang telah dijalankan: read server.cjs.\n\n" +
      "Penyebabnya ada di baris 42: variabel `port` tak pernah di-set.\n\n" +
      "Perbaikannya: beri nilai bawaan 3000.";
    const r = stripToolRecap(t);
    expect(r).toContain("baris 42");
    expect(r).toContain("beri nilai bawaan 3000");
    expect(r).not.toContain("Berikut bukti dari tool");
  });

  test("rekap yang menempel di paragraf yang sama hanya membuang barisnya", () => {
    // Tanpa baris kosong pemisah. Versi lama membuang seluruh paragraf —
    // termasuk dua kalimat jawaban di bawahnya.
    const t =
      "Tool read menemukan: konfigurasi port.\n" +
      "Penyebabnya variabel `port` kosong di baris 42.\n" +
      "Perbaikannya beri nilai bawaan.";
    const r = stripToolRecap(t);
    expect(r).toContain("baris 42");
    expect(r).toContain("Perbaikannya");
    expect(r).not.toContain("Tool read menemukan");
  });

  test("daftar bukti yang mengekor penanda ikut terbuang", () => {
    const t =
      "Tool grep menemukan:\n- server.cjs:42\n- server.cjs:88\nPenyebabnya port kosong.";
    const r = stripToolRecap(t);
    expect(r).toBe("Penyebabnya port kosong.");
  });

  test("'Kesimpulan:' di DALAM blok kode tidak disentuh", () => {
    const t = "Ada tiga hal.\n\n```js\nconst Kesimpulan: 1;\n```\n\nSelesai.";
    expect(stripToolRecap(t)).toContain("const Kesimpulan: 1;");
  });

  test("'Kesimpulan:' sebagai label pembuka baris tetap dibuang", () => {
    expect(stripToolRecap("Kesimpulan: port kosong.")).toBe("port kosong.");
  });
});

describe("truncateToConcise tidak merusak blok kode", () => {
  test("pemotongan tidak pernah meninggalkan pagar tak berpasangan", () => {
    const t = "Penjelasan.\n\n```js\nconst a = 1;\n" + "X".repeat(2500);
    expect(pagarSeimbang(truncateToConcise(t, 2000))).toBe(true);
  });

  test("prosa yang terpotong selalu diberi tanda", () => {
    const t = "```js\nconst a = 1;\n```\n\n" + "B".repeat(2100);
    const r = truncateToConcise(t, 2000);
    expect(r.length).toBeLessThan(t.length);
    expect(r.endsWith("…")).toBe(true);
  });

  test("pemotongan jatuh di batas kata, bukan di tengah kata", () => {
    const t = Array.from(
      { length: 60 },
      (_, i) =>
        "Poin ke-" + (i + 1) + ": penjelasan yang cukup panjang di sini.",
    ).join("\n\n");
    const r = truncateToConcise(t, 2000);
    // Buang penanda potong dulu, lalu pastikan ujungnya bukan kata terbelah.
    const isi = r.replace(/\n*…$/, "").trim();
    expect(isi).toMatch(/[.!?]$/);
  });

  test("jawaban yang muat dikirim apa adanya", () => {
    const t = "Singkat saja.\n\n```js\nconst a = 1;\n```";
    expect(truncateToConcise(t, 2000)).toBe(t);
  });

  test("blok berpagar tidak memakan kuota prosa", () => {
    const t = "Pendek.\n\n```\n" + "D".repeat(5000) + "\n```\n\nPenutup.";
    expect(truncateToConcise(t, 2000)).toBe(t);
  });
});

describe("salvageReasoning menjaga bentuk kode", () => {
  test("baris kosong DI DALAM ``` bukan batas paragraf", () => {
    const t =
      "Saya perlu ubah renderJadwal.\n\n" +
      "Old:\n```js\nfunction renderJadwal(){\n\n  const a = 1;\n\n  return a;\n}\n```\n\n" +
      "New:\n```js\nfunction renderJadwal(){\n  return 2;\n}\n```";
    const r = salvageReasoning(t);
    expect(pagarSeimbang(r.teks)).toBe(true);
    // Indentasi di dalam blok utuh — dulu hilang karena tiap "paragraf" di-trim.
    expect(r.teks).toContain("  const a = 1;");
  });

  test("hasil selamatan tak pernah berpagar ganjil", () => {
    const t = "Analisis.\n\nSaya coba tulis:\n```js\nconst a = 1;";
    expect(pagarSeimbang(salvageReasoning(t).teks)).toBe(true);
  });

  test("kesimpulan eksplisit yang pendek tetap disebut kesimpulan", () => {
    const r = salvageReasoning(
      "Panjang sekali analisisnya.\n\nKesimpulan: penyebabnya port kosong.",
    );
    expect(r.jenis).toBe("kesimpulan");
    expect(r.teks).toBe("penyebabnya port kosong.");
  });

  test("penanda menggantung tanpa isi tidak dianggap kesimpulan", () => {
    const r = salvageReasoning("Analisis panjang di sini.\n\nKesimpulan:");
    expect(r.jenis).not.toBe("kesimpulan");
  });
});

describe("stripThinkBlocks tidak memakan jawaban di sekitar contoh kode", () => {
  test("menyebut </think> di dalam backtick tidak membuang kalimat sebelumnya", () => {
    const t =
      "Jawaban penting di sini.\n\nContoh tag: `</think>` dipakai model reasoning.";
    const r = stripThinkBlocks(t);
    expect(r).toContain("Jawaban penting di sini.");
    expect(r).toContain("`</think>`");
  });

  test("<think> di dalam blok kode tidak membuang sisa jawaban", () => {
    const t =
      "Hasilnya begini.\n\n```html\n<think>contoh</think>\n```\n\nSelesai.";
    const r = stripThinkBlocks(t);
    expect(r).toContain("Hasilnya begini.");
    expect(r).toContain("Selesai.");
  });

  test("blok <think> asli TETAP dibuang", () => {
    const r = stripThinkBlocks("<think>monolog panjang</think>Jawabannya A.");
    expect(r).toBe("Jawabannya A.");
    expect(r).not.toContain("monolog");
  });

  test("opener tanpa closer di teks biasa tetap dibuang", () => {
    const r = stripThinkBlocks("Jawabannya A.\n<think>sisa stream bocor");
    expect(r).toContain("Jawabannya A.");
    expect(r).not.toContain("sisa stream bocor");
  });
});
