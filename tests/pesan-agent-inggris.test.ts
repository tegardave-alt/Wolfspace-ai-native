// Pesan agent yang dibaca manusia harus bahasa Inggris.
//
// KENAPA ADA. Pemakai menemukan "🔒 agent terkurung ke workspace: " dengan
// matanya sendiri, setelah dua sapuan saya menyatakan agent sudah bersih.
// Sapuan itu memeriksa KOMENTAR; string tak pernah dilihat. Emoji di depan
// kalimatnya bahkan membuatnya lolos dari pencarian saya berikutnya.
//
// APA YANG SENGAJA TIDAK DIJAGA, DAN KENAPA:
//
//   1. agent/self_agent.ts — memuat puluhan frasa Indonesia yang DICOCOKKAN
//      dengan balasan model berbahasa Indonesia ("sudah SAYA perbaiki",
//      "berhasil membuat"). Menerjemahkannya mematahkan pencocokan, bukan
//      memperbaiki bahasa. Berkas itu dikecualikan seluruhnya, bukan
//      ditambal per baris, supaya alasannya tetap terbaca.
//
//   2. Kosakata penegakan: "penasihat", "tak diketahui", "tak-tersedia",
//      "wsl-tak-siap". Itu NILAI ENUM, bukan kalimat — `penegakan` dan
//      `mekanisme` dibandingkan langsung di 4 berkas uji dan 6 berkas kode.
//      Mengubahnya adalah perubahan kontrak yang menyamar sebagai terjemahan.
//
// Jadi yang dijaga hanya PROSA: string yang berisi kalimat untuk dibaca.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");

const BERKAS_AGENT = [
  "agent/rag.ts",
  "agent/sandbox-policy.ts",
  "agent/pemantau-blokir.ts",
  "agent/pemadatan.ts",
  "agent/anggaran.ts",
  "agent/tools/index.ts",
  "agent/tools/gen3d-tools.ts",
  "agent/tools/git-tool.ts",
  "agent/tools/net-diag.ts",
  "agent/tools/file-tools.ts",
  "agent/tools/appcontainer-jail.ts",
  "agent/mcp-client.ts",
  "agent/cloud.ts",
  "agent/chat.ts",
];

const KATA_ID = [
  "yang",
  "untuk",
  "tidak",
  "tak",
  "belum",
  "sudah",
  "hanya",
  "bukan",
  "akan",
  "bisa",
  "harus",
  "masih",
  "setiap",
  "tiap",
  "semua",
  "anda",
  "dengan",
  "dari",
  "pada",
  "karena",
  "supaya",
  "agar",
  "jika",
  "kalau",
  "atau",
  "dan",
  "adalah",
  "dalam",
  "oleh",
  "ini",
  "itu",
  "jadi",
  "lalu",
  "terkurung",
  "kurungan",
  "alasan",
  "berkas",
  "gagal",
  "berhasil",
  "ditolak",
  "diizinkan",
  "dipakai",
  "dibuat",
  "memakai",
  "membaca",
  "menulis",
  "menjalankan",
  "dijalankan",
  "periksa",
  "pastikan",
  "wajib",
  "boleh",
  "silakan",
  "coba",
  "ulangi",
  "lanjut",
  "kembali",
  "butuh",
  "dibatalkan",
  "diaudit",
  "tersedia",
  "ditemukan",
  "dilarang",
  "teknis",
];
// Batas kata dieja manual. Menulisnya sebagai "\b" lewat rantai alat ini
// kehilangan satu backslash, dan "\b" dalam string JS adalah karakter
// BACKSPACE — polanya lalu tak mencocokkan apa pun dan SEMUA berkas lulus
// tanpa diperiksa. Itu benar-benar terjadi pada uji teks UI.
const POLA = new RegExp(
  "(^|[^a-zA-Z])(" + KATA_ID.join("|") + ")([^a-zA-Z]|$)",
  "i",
);

/** String yang berbentuk KALIMAT untuk dibaca, bukan nilai atau kunci. */
function prosa(isi) {
  const hasil = [];
  isi.split(/\r?\n/).forEach((b, i) => {
    const re = /"((?:[^"\n]){8,300})"/g;
    let m;
    while ((m = re.exec(b)) !== null) {
      const x = m[1];
      if (!x.includes(" ")) continue;
      if (/^[/#]|^https?:/.test(x)) continue;
      // Nilai enum dan nama kelas: seluruhnya huruf kecil, tanpa tanda baca.
      if (/^[a-z][a-z0-9 _-]*$/.test(x)) continue;
      // Sebuah kalimat punya huruf kapital atau tanda baca akhir.
      if (!/[A-Z]/.test(x) && !/[.!?]/.test(x)) continue;
      hasil.push({ nomor: i + 1, teks: x });
    }
  });
  return hasil;
}

describe("pesan agent berbahasa Inggris", () => {
  test.each(BERKAS_AGENT)("%s tak punya prosa Indonesia", (rel) => {
    const penuh = path.join(AKAR, rel);
    expect(fs.existsSync(penuh)).toBe(true);
    const temuan = prosa(fs.readFileSync(penuh, "utf8")).filter((x) =>
      POLA.test(x.teks),
    );
    expect(temuan.map((x) => rel + ":" + x.nomor + "  " + x.teks)).toEqual([]);
  });

  test("polanya benar-benar mencocokkan", () => {
    // Uji-diri, karena versi pertama uji teks UI lulus bulat-bulat dengan
    // pola yang mati.
    expect(POLA.test("agent terkurung ke workspace: ")).toBe(true);
    expect(POLA.test("Butuh 'prompt' (teks) atau 'image'.")).toBe(true);
    expect(POLA.test("Alasan teknis: ")).toBe(true);
    expect(POLA.test("confined to the workspace and audited")).toBe(false);
    expect(POLA.test("Technical reason: ")).toBe(false);
  });

  test("penyaringnya melihat kalimat dan melewatkan nilai enum", () => {
    const p = prosa('const a = "Needs a prompt."; const b = "wsl-tak-siap";');
    expect(p.map((x) => x.teks)).toEqual(["Needs a prompt."]);
  });
});
