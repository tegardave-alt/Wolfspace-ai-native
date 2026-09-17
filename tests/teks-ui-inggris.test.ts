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
  // Added after each escaped into the running app and was reported by the
  // user rather than caught here. A word list only covers what it has met.
  "perintah",
  "dieksekusi",
  "operasi",
  "dijalankan",
  "berhasil",
  "gagal",
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

/**
 * A CSS class list, which must stay exactly as written.
 *
 * REQUIRES A HYPHEN. The old shape -- all lowercase words -- also described
 * ordinary lowercase prose, so "perintah dieksekusi" was discarded as markup
 * and reached the screen in Indonesian. Class names in this codebase are
 * hyphenated ("aal-row aal-group"), and that is what tells the two apart.
 */
function _daftarKelas(x) {
  if (!/^[a-z][a-z0-9-]*( [a-z][a-z0-9-]*)*$/.test(x)) return false;
  return x.includes("-");
}

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
      if (_daftarKelas(x)) continue;
      if (/[=<>{}]/.test(x) || x.indexOf(String.fromCharCode(92)) >= 0)
        continue;
      if ((x.match(/[A-Za-z]{2,}/g) || []).length < 2) continue;
      hasil.push({ nomor, teks: x });
    }
    // 2. Teks JSX yang berdiri sendiri di barisnya — di situlah label tombol
    //    satu kata seperti "Batal" hidup, dan syarat dua kata di atas buta
    //    terhadapnya.
    const t = b.trim();
    // A LONE IDENTIFIER ENDING IN A COMMA IS CODE, not a label: that is a
    // destructured prop or a parameter, one per line. Screen copy of a single
    // word ("Cancel") does not carry a trailing comma, so the two separate
    // cleanly. Found when `perintah,` in a component's parameter list was
    // reported as Indonesian screen text.
    const kodeSatuKata = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9]*,$/.test(t);
    if (
      !kodeSatuKata &&
      /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ,.'’—-]*$/.test(t) &&
      t.length >= 4
    ) {
      hasil.push({ nomor, teks: t });
    }

    // 3. TEMPLATE LITERAL. Rule 1 only reads double quotes, so a backtick
    //    string was invisible to it -- and that is where interpolated copy
    //    lives, which is most of the sentences with a number in them.
    //    Missed in the wild: `Selesai. ${n} operasi dieksekusi.`
    const reT = /`([^`]{6,160})`/g;
    let mt;
    while ((mt = reT.exec(b)) !== null) {
      const x = mt[1];
      if (/^[/#]|^https?:|^wolfspace_/.test(x)) continue;
      // The interpolations themselves are code, not copy.
      const polos = x.replace(/\$\{[^}]*\}/g, " ").trim();
      if (!polos.includes(" ")) continue;
      if ((polos.match(/[A-Za-z]{2,}/g) || []).length < 2) continue;
      hasil.push({ nomor, teks: polos });
    }

    // 4. TEKS JSX YANG BERBAGI BARIS DENGAN {…}. Rule 2 requires the whole
    //    trimmed line to be prose, so anything beside a tag or an
    //    interpolation escaped it entirely.
    //    Missed in the wild: <span>{acts.length} perintah dieksekusi</span>
    if (b.includes(">") && b.includes("<")) {
      const tanpaEkspr = b.replace(/\{[^{}]*\}/g, " ");
      const reJ = />([^<>]{4,160})</g;
      let mj;
      while ((mj = reJ.exec(tanpaEkspr)) !== null) {
        const x = mj[1].trim();
        if (!x || !/[A-Za-zÀ-ÿ]/.test(x)) continue;
        if (_daftarKelas(x)) continue;
        if ((x.match(/[A-Za-z]{2,}/g) || []).length < 2) continue;
        hasil.push({ nomor, teks: x });
      }
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

  test("bentuk yang DULU lolos kini tertangkap", () => {
    // TWO REAL ESCAPES, both reported by the user rather than caught here.
    //
    // The filter read double-quoted strings, and JSX text only when the whole
    // trimmed line was prose. Neither shape below fits that, so both walked
    // straight past it into the running app.
    const jsx = tekstLayar(
      "        <span>{acts.length} perintah dieksekusi</span>",
    );
    expect(jsx.some((x) => POLA.test(x.teks))).toBe(true);

    const templat = tekstLayar(
      "          ? `Selesai. ${evlist.length} operasi dieksekusi.`",
    );
    expect(templat.some((x) => POLA.test(x.teks))).toBe(true);
  });

  test("bentuk baru itu tidak menyeret kode ikut tertangkap", () => {
    // A wider net that flags class names, props or expressions would be worn
    // down by exceptions until it stopped meaning anything.
    const bersih = [
      '        <div className="aal-row aal-group">',
      "        <span>{count} commands run</span>",
      "          ? `Done. ${n} operations performed.`",
      "        <Icon.check />",
    ];
    for (const baris of bersih) {
      for (const x of tekstLayar(baris)) {
        expect([baris, x.teks, POLA.test(x.teks)]).toEqual([
          baris,
          x.teks,
          false,
        ]);
      }
    }
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
