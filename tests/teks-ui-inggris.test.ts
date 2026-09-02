// Teks yang DIBACA PENGGUNA di layar harus bahasa Inggris.
//
// KENAPA UJI TERPISAH. tests/migrated-code-is-english.test.ts sudah menjaga
// bahasa komentar, tapi komentarSaja() memang hanya mengekstrak KOMENTAR — ia
// tak pernah melihat satu pun string. Akibatnya public/app/Views.tsx
// duduk di daftar berkas terjaga, lulus terus, sementara layarnya penuh
// bahasa Indonesia: "Beri izin", "copot", "Saring plugin terpasang…",
// "Memuat…". Yang menemukannya mata pemakai, bukan ujinya.
//
// KENAPA HANYA BERKAS UI. Sapuan menyeluruh menemukan 26 berkas terdaftar
// punya string Indonesia, dan sebagian besar TIDAK BOLEH diterjemahkan:
// agent/self_agent.ts sendiri memuat 27, yaitu frasa yang DICOCOKKAN dengan
// balasan model berbahasa Indonesia. Menerjemahkannya mematahkan pencocokan.
// Jadi uji ini dibatasi pada berkas yang hampir seluruh stringnya memang teks
// layar, dan tidak berpura-pura menjaga seluruh repo.
//
// APA YANG DIKECUALIKAN, DAN KENAPA. Nilai wire ("sembunyi", "berkas" sebagai
// aksi IPC), nama kelas CSS, kunci localStorage, dan path rute semuanya wajib
// tetap seperti adanya — mengubahnya memutus kontrak, bukan menerjemahkan
// antarmuka. Semuanya satu kata tanpa spasi, jadi syarat "dua kata" di bawah
// menyingkirkannya tanpa perlu daftar pengecualian yang harus dirawat.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");

const BERKAS_UI = [
  "public/app.tsx",
  "public/app/AgentSteps.tsx",
  "public/app/Components.tsx",
  "public/app/Model3DViewer.tsx",
  "public/app/Screens.tsx",
  "public/app/Sidebar.tsx",
  "public/app/Views.tsx",
  "public/app/Viewport.tsx",
  "public/app/VisualTools.tsx",
  "public/app/usePreviewPanel.tsx",
];

// Sengaja lebih luas daripada daftar di migrated-code-is-english: kosakata
// TOMBOL dan PESAN tidak sama dengan kosakata prosa. "wajib diisi" lolos dari
// daftar lama karena kata-katanya memang tak pernah muncul di komentar.
const KATA_UI = [
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
  "batal",
  "simpan",
  "hapus",
  "tutup",
  "buka",
  "kirim",
  "muat",
  "memuat",
  "pasang",
  "copot",
  "ulangi",
  "lanjut",
  "kembali",
  "selesai",
  "salin",
  "jalankan",
  "berhenti",
  "tambah",
  "cari",
  "pilih",
  "ganti",
  "ubah",
  "izin",
  "gagal",
  "berhasil",
  "kosong",
  "wajib",
  "diisi",
  "sedang",
  "tunggu",
  "coba",
  "lagi",
  "sekarang",
  "pemakai",
  "pengguna",
  "contoh",
  "misal",
  "berkas",
  "riwayat",
  "pengaturan",
  "setelan",
  "hadir",
  "kunci",
  "diimpor",
  "terpasang",
  "diminta",
  "daftar",
];
const POLA = new RegExp("(^|[^a-z])(" + KATA_UI.join("|") + ")([^a-z]|$)", "i");

/** Kandidat teks layar: string literal yang berbentuk kalimat atau label. */
function tekstLayar(isi) {
  const hasil = [];
  const baris = isi.split(/\r?\n/);
  baris.forEach((b, i) => {
    const nomor = i + 1;
    // 1. String literal yang berisi DUA kata — itu ciri copy, bukan nilai wire.
    const re = /"([^"\n]{6,160})"/g;
    let m;
    while ((m = re.exec(b)) !== null) {
      const x = m[1];
      if (/^[/#]|^https?:|^wolfspace_/.test(x)) continue;
      if (!x.includes(" ")) continue;
      // Sebuah daftar kelas CSS ("aksi-btn aksi-simpan") juga berisi spasi
      // dan dua kata. Ia wajib tetap seperti adanya, dan bentuknya khas:
      // seluruhnya huruf kecil dengan tanda hubung.
      if (/^[a-z][a-z0-9-]*( [a-z][a-z0-9-]*)*$/.test(x)) continue;
      if (/[=<>{}]/.test(x) || x.indexOf(String.fromCharCode(92)) >= 0)
        continue;
      if ((x.match(/[A-Za-z]{2,}/g) || []).length < 2) continue;
      hasil.push({ nomor, teks: x });
    }
    // 2. Teks JSX yang berdiri sendiri di barisnya — di situlah label tombol
    //    satu kata seperti "Batal" hidup, dan syarat dua kata di atas buta
    //    terhadapnya.
    const t = b.trim();
    if (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ,.'’—-]*$/.test(t) && t.length >= 4) {
      hasil.push({ nomor, teks: t });
    }
  });
  return hasil;
}

describe("teks antarmuka berbahasa Inggris", () => {
  test.each(BERKAS_UI)("%s tak punya teks layar berbahasa Indonesia", (rel) => {
    const penuh = path.join(AKAR, rel);
    expect(fs.existsSync(penuh)).toBe(true);
    const temuan = tekstLayar(fs.readFileSync(penuh, "utf8")).filter((x) =>
      POLA.test(x.teks),
    );
    expect(temuan.map((x) => rel + ":" + x.nomor + "  " + x.teks)).toEqual([]);
  });

  test("penyaringnya benar-benar melihat sesuatu", () => {
    // Tanpa ini, sebuah penyaring yang kebetulan tak mengembalikan apa pun
    // membuat setiap berkas di atas lulus tanpa diperiksa.
    const contoh = tekstLayar(
      'const a = "What would you like to build today?";\n      Cancel\n',
    );
    expect(contoh.length).toBeGreaterThanOrEqual(2);
  });

  test("kata Indonesia memang tertangkap", () => {
    expect(POLA.test("Beri izin")).toBe(true);
    expect(POLA.test("Jenis MCP wajib diisi.")).toBe(true);
    expect(POLA.test("Batal")).toBe(true);
    // Dan bahasa Inggris tidak.
    expect(POLA.test("Filter installed plugins")).toBe(false);
    expect(POLA.test("Cancel")).toBe(false);
  });
});
