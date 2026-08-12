// Reasoning yang diselamatkan harus diberi label sesuai isinya.
//
// KENAPA ADA. Saat model tak menutup jawabannya, WOLFSPACE menyelamatkan isi
// monolog reasoning. Niatnya benar — kadang jawabannya memang di sana, cuma tak
// pernah dipindahkan ke `content`, dan membuangnya berarti membuang kerja yang
// sudah dibayar.
//
// Yang salah adalah LABELNYA. Apa pun yang terselamatkan diberi tulisan
// "berikut kesimpulan dari proses berpikirnya", termasuk ketika yang terambil
// hanya paragraf terakhir. Kasus nyata yang sampai ke layar user:
//
//   _(Model tidak menutup jawabannya; berikut kesimpulan dari proses berpikirnya.)_
//
//   Language to Devicon mapping:
//   - js → devicon-javascript-plain
//   - ts → devicon-typescript-plain
//   ... (terpotong di tengah daftar)
//
// Itu tabel rujukan yang sedang disusun, bukan kesimpulan. Menyebutnya
// kesimpulan membuat catatan setengah jadi terbaca sebagai hasil kerja — kelas
// masalah yang sama dengan penanda "[kata-spekulatif-dihapus]": keluaran
// dibentuk agar terlihat seperti sesuatu yang bukan dirinya.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const SRC = fs
  .readFileSync(path.join(AKAR, "agent", "self_agent.cjs"), "utf8")
  .replace(/\r\n/g, "\n");

// Fungsinya DIAMBIL dari sumber lalu dieksekusi — bukan ditulis ulang menurut
// tafsiran, supaya yang diuji memang jalur produksi.
const ambil = (nama) => {
  const i = SRC.indexOf("function " + nama + "(");
  if (i < 0) throw new Error("fungsi tak ketemu: " + nama);
  const j = SRC.indexOf("\n}", i) + 2;
  return SRC.slice(i, j);
};
const salvageReasoning = eval(
  "(function(){" +
    ambil("_tanpaKode") +
    // Pemisah paragraf yang sadar blok berpagar — dipakai salvageReasoning
    // supaya baris kosong DI DALAM ``` tak dianggap batas paragraf.
    // Lihat tests/keluaran-model-utuh.test.js.
    ambil("_paragrafSadarPagar") +
    ambil("stripThinkBlocks") +
    ambil("_tampakCatatanKerja") +
    ambil("salvageReasoning") +
    "return salvageReasoning;})()",
);

// Persis bentuk yang muncul di layar user.
const CATATAN_KERJA = `Language to Devicon mapping:
- js → devicon-javascript-plain
- ts → devicon-typescript-plain
- py → devicon-python-plain
- java → devicon-java-plain
- c → devicon-c-plain
- cpp → devicon-cplusplus-plain
- go → devicon-go-plain
- rs → devicon-rust-plain
- kt → devicon-kotlin-plain
- php → devicon-php-plain`;

describe("catatan kerja tidak disebut kesimpulan", () => {
  test("daftar pemetaan TIDAK diselamatkan sama sekali", () => {
    // Lebih baik mengaku tak ada jawaban daripada menyodorkan sesuatu yang
    // terlihat seperti jawaban.
    const r = salvageReasoning(CATATAN_KERJA);
    expect(r.jenis).toBe("kosong");
    expect(r.teks).toBe("");
  });

  test("penanda kesimpulan eksplisit -> jenis 'kesimpulan'", () => {
    const r = salvageReasoning(
      "Saya periksa dulu berkasnya.\n\nKesimpulan: ikon yang dipakai adalah devicon, dan pemetaannya sudah lengkap untuk semua bahasa yang didukung proyek ini.",
    );
    expect(r.jenis).toBe("kesimpulan");
    expect(r.teks).toMatch(/devicon/);
    expect(r.teks).not.toMatch(/^Kesimpulan:/);
  });

  test("prosa tanpa penanda -> jenis 'catatan', BUKAN 'kesimpulan'", () => {
    const r = salvageReasoning(
      "Awalnya saya kira masalahnya di parser.\n\nSetelah membaca ulang, tampaknya penyebabnya ada pada urutan pemanggilan. Fungsi itu dipanggil sebelum konfigurasinya dimuat, sehingga nilainya masih kosong saat dipakai.",
    );
    expect(r.jenis).toBe("catatan");
    expect(r.teks).toMatch(/urutan pemanggilan/);
  });

  test("reasoning kosong -> jenis 'kosong'", () => {
    for (const x of ["", "   ", null, undefined]) {
      expect(salvageReasoning(x).jenis).toBe("kosong");
    }
  });

  test("daftar bercampur prosa panjang TETAP diselamatkan", () => {
    // Penjaga arah sebaliknya: deteksinya tak boleh terlalu rakus sampai
    // membuang jawaban sah yang kebetulan memuat daftar.
    const r = salvageReasoning(
      "Setelah menelusuri seluruh modul, penyebabnya adalah konfigurasi yang tak pernah dibaca ulang setelah diubah.\n" +
        "Perbaikannya ada tiga bagian yang saling bergantung dan harus dikerjakan berurutan.\n" +
        "- muat ulang konfigurasi saat berkas berubah\n" +
        "- batalkan cache lama\n" +
        "Dampaknya terasa pada seluruh jalur yang membaca nilai tersebut.",
    );
    expect(r.jenis).toBe("catatan");
  });
});

describe("pemanggil memakai label yang sesuai jenisnya", () => {
  test("tiga cabang label ada, dan hanya satu menyebut 'kesimpulan'", () => {
    const blok = SRC.slice(
      SRC.indexOf("const salvaged = salvageReasoning(msg.reasoning)"),
      SRC.indexOf("const salvaged = salvageReasoning(msg.reasoning)") + 1800,
    );
    expect(blok).toMatch(/salvaged\.jenis === "kesimpulan"/);
    expect(blok).toMatch(/salvaged\.jenis === "catatan"/);
    // Cabang catatan HARUS menyangkal dirinya kesimpulan.
    expect(blok).toMatch(/ini bukan kesimpulan/i);
    // Cabang kosong tak boleh diam-diam menampilkan apa pun.
    expect(blok).toMatch(/tidak memuat kesimpulan yang bisa dipakai/i);
  });

  test("jenis ikut tercatat di dlog, supaya bisa dilacak", () => {
    expect(SRC).toMatch(/jenis: salvaged\.jenis/);
  });
});
