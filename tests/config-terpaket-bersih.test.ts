// config.json IKUT TERPAKET — jadi ia tak boleh memuat apa pun milik satu mesin.
//
// APA YANG TERJADI. build.files di package.json menyebut "config.json", jadi
// berkas itu masuk ke installer apa adanya. Isinya waktu itu:
//
//     ww.root     "C:/Users/<pembuat>/Desktop/project"
//     runners.c   "C:/langs/<toolchain>/bin/gcc.exe"      (dan tujuh lainnya)
//
// Artinya setiap orang yang memasang installer mendapat jalur mesin PEMBUAT
// sebagai bawaannya. Pemakai yang menemukannya: "saya instal versi terbarunya,
// semuanya sudah terpasang".
//
// Tak ada kunci API di dalamnya — eraser.apiKey memang kosong, dan pemindai
// kredensial di workflow rilis memang bersih. Yang bocor bukan rahasia,
// melainkan KEADAAN: konfigurasi satu mesin yang menyamar sebagai bawaan
// aplikasi.
//
// KENAPA UJI INI ADA. Pemindai di release.yml mencari POLA NAMA BERKAS
// (cloud-keys.json, .env, .pem, .key). config.json bukan salah satunya, dan
// memang tak seharusnya — ia berkas konfigurasi yang sah. Yang salah adalah
// ISINYA. Jadi yang diperiksa di sini isinya, bukan namanya.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const CFG = JSON.parse(fs.readFileSync(path.join(AKAR, "config.json"), "utf8"));
const PKG = JSON.parse(
  fs.readFileSync(path.join(AKAR, "package.json"), "utf8"),
);

/** Setiap nilai string di dalam objek, beserta jalurnya. */
function semuaNilai(o, jalur = "") {
  const hasil = [];
  if (typeof o === "string") return [{ jalur, nilai: o }];
  if (o && typeof o === "object") {
    for (const k of Object.keys(o)) {
      hasil.push(...semuaNilai(o[k], jalur ? jalur + "." + k : k));
    }
  }
  return hasil;
}

describe("config.json yang dikirim tidak membawa keadaan satu mesin", () => {
  test("ia memang ikut terpaket — itu yang membuat isinya penting", () => {
    // Kalau suatu saat ia dikeluarkan dari paket, uji ini boleh dilonggarkan.
    // Selama masih di sini, isinya sampai ke setiap pemasang.
    expect(PKG.build.files).toContain("config.json");
  });

  test("tak ada jalur absolut milik siapa pun", () => {
    // Diperiksa dengan pemeriksaan string biasa, bukan regex: setiap usaha
    // menulis kelas karakter berisi backslash lewat rantai alat ini kehilangan
    // satu level escape, dan backslash sendirian di dalam [ ] menelan kurung
    // penutupnya.
    const BS = String.fromCharCode(92);
    const absolut = (x) =>
      /^[A-Za-z]:/.test(x) ||
      x.includes(":" + BS) ||
      x.includes(":/") ||
      x.startsWith("/home/") ||
      x.startsWith("/Users/");
    const buruk = semuaNilai(CFG).filter(
      // _note adalah dokumentasi dan boleh menyebut contoh.
      (x) => !x.jalur.endsWith("_note") && absolut(x.nilai),
    );
    expect(buruk.map((x) => x.jalur + " = " + x.nilai)).toEqual([]);
  });

  test("direktori unggahan pemakai TIDAK ikut terpaket", () => {
    // public/** ada di allowlist, dan public/uploads adalah tempat unggahan
    // BERJALAN — tangkapan layar, diagram, model 3D. Ia digitignore justru
    // karena bukan sumber, tapi electron-builder mengemas direktori kerja,
    // bukan pohon git: build lokal mengirim 12 berkas milik pemakai ke dalam
    // installer. Rilis dari runner tak terkena (runner cuma punya isi git),
    // tapi installer yang dibangun di mesin sendiri terkena.
    //
    // Aman dibuang: server.ts membuat direktorinya lewat mkdirSync recursive
    // pada unggahan pertama.
    expect(PKG.build.files).toContain("!public/uploads/**");
  });

  test("tak ada blok runners", () => {
    // Delapan jalur toolchain yang TAK DIBACA SIAPA PUN sejak compileRun
    // dihapus (lihat server.ts). Ia hanya ikut terkirim.
    expect(CFG.runners).toBeUndefined();
  });

  test("tak ada rahasia berisi", () => {
    const isi = semuaNilai(CFG).filter(
      (x) => /key|token|secret|password/i.test(x.jalur) && x.nilai !== "",
    );
    expect(isi.map((x) => x.jalur)).toEqual([]);
  });

  test("root kosong, dan kodenya memang punya cadangan", () => {
    // Bukan sekadar dikosongkan: pembacanya harus benar-benar jatuh ke
    // DEFAULT_ROOT, atau mengosongkannya justru mematahkan fitur.
    expect(CFG.ww.root).toBe("");
    const SRV = fs.readFileSync(path.join(AKAR, "server.ts"), "utf8");
    expect(SRV).toMatch(/CONFIG\.ww\.root \|\| ww\.DEFAULT_ROOT/);
  });
});

describe("pemeriksa paket mencari rahasia, bukan cuma nama berkas", () => {
  const SKRIP = fs.readFileSync(
    path.join(AKAR, "scripts/periksa-paket.cjs"),
    "utf8",
  );

  test("ia dipanggil sebelum penerbitan, bukan sesudah", () => {
    // Kalau ia berjalan setelah rilis terbit, ia bukan penjaga — ia laporan.
    const WF = fs.readFileSync(
      path.join(AKAR, ".github/workflows/release.yml"),
      "utf8",
    );
    const iPeriksa = WF.indexOf("scripts/periksa-paket.cjs");
    const iTerbit = WF.indexOf("gh release create");
    expect(iPeriksa).toBeGreaterThan(-1);
    expect(iTerbit).toBeGreaterThan(-1);
    expect(iPeriksa).toBeLessThan(iTerbit);
  });

  test("memindai SEMUA berkas, bukan hanya JSON", () => {
    // Diuji dan terbukti perlu: kunci ditanam di agent/rag.ts lolos dari versi
    // yang hanya membaca JSON, dan agent ini menulis kode ke repo pemakainya.
    expect(SKRIP).toMatch(/POLA_RAHASIA/);
    expect(SKRIP).toMatch(/berkas dipindai pola/);
  });

  test("mengenali bentuk kunci yang lazim", () => {
    for (const p of ["sk-", "gh[pousr]_", "AIza", "AKIA", "tvly-"]) {
      expect(SKRIP).toContain(p);
    }
  });

  test("mencocokkan NILAI kunci nyata bila mesinnya punya", () => {
    // Pencocokan nilai tak bisa salah tuduh, jadi ia mencakup node_modules
    // sekalian — dan ia menjaga jalur kebocoran yang ASLI: installer yang
    // dibangun di mesin sendiri, bukan di runner.
    expect(SKRIP).toMatch(/cloud-keys\.json/);
    expect(SKRIP).toMatch(/kunci NYATA dari mesin ini/);
  });

  test("node_modules dilewati untuk POLA, dan alasannya ditulis", () => {
    // Penjaga yang selalu merah adalah penjaga yang akan dimatikan orang.
    expect(SKRIP).toMatch(/node_modules DILEWATI untuk pola/);
  });
});
