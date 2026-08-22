// Kontrak tipe pada jalur kritis — ratchet, bukan gerbang menyeluruh.
//
// KENAPA ADA. agent/ diperiksa TypeScript tanpa satu pun berkas .ts: kontraknya
// ditulis sebagai JSDoc dan `// @ts-check` menyalakannya per berkas. Yang dijaga
// tes ini dua hal, dan keduanya pernah gagal secara diam-diam di repo ini:
//
//   1. Berkas yang SUDAH ikut tak boleh keluar lagi. Menghapus satu baris
//      `// @ts-check` mematikan seluruh pemeriksaan berkas itu tanpa jejak —
//      tak ada yang merah, tak ada peringatan.
//   2. Pemeriksaannya harus benar-benar bersih. Nol error yang dibiarkan
//      membusuk akan berubah jadi daftar merah panjang yang lalu diabaikan.
//
// Nilai sebenarnya BUKAN pada nol error itu, melainkan pada apa yang tertangkap
// saat kontraknya dilanggar. Ketiganya sudah diuji dengan merusak sengaja:
//   izin yang membawa alasan            -> TS2322
//   penjaga jaringanTerkurung dihapus   -> TS2339 pada st.alasan
//   serahkan() sukses tanpa handle      -> TS2322

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const TSC = path.join(AKAR, "node_modules", "typescript", "bin", "tsc");
const CFG = path.join(AKAR, "agent", "jsconfig.json");

// Daftar ratchet: berkas yang sudah masuk pemeriksaan. Boleh BERTAMBAH, tak
// boleh berkurang.
const SUDAH_DIPERIKSA = ["agent/attachment-bridge.cjs"];

// Berkas yang sudah BERMIGRASI ke TypeScript. Ratchet-nya tetap berlaku, hanya
// syaratnya yang berubah: sebuah .ts SELALU diperiksa tsc, jadi yang dijaga
// bukan lagi baris `// @ts-check` melainkan bahwa berkasnya masih .ts dan belum
// diam-diam dikembalikan ke .cjs tanpa pemeriksaan.
const SUDAH_TYPESCRIPT = [
  "agent/broker/commandchain.ts",
  "agent/broker/zone-process.ts",
];

describe("kontrak tipe jalur kritis", () => {
  test.each(SUDAH_DIPERIKSA)("%s masih menyalakan // @ts-check", (rel) => {
    const isi = fs.readFileSync(path.join(AKAR, rel), "utf8");
    // Harus di kepala berkas — `// @ts-check` di tengah tak berlaku.
    const kepala = isi.split(/\r?\n/).slice(0, 60).join("\n");
    expect(kepala).toMatch(/^\/\/ @ts-check$/m);
  });

  test.each(SUDAH_TYPESCRIPT)("%s masih berupa TypeScript", (rel) => {
    // Turun ke .cjs tanpa @ts-check akan mematikan pemeriksaan berkas ini tanpa
    // jejak — kelas kegagalan yang sama persis dengan menghapus baris @ts-check.
    expect(fs.existsSync(path.join(AKAR, rel))).toBe(true);
    expect(rel.endsWith(".ts")).toBe(true);
  });

  test("fungsi vonis memakai UNION, bukan field opsional", () => {
    // Bentuk longgar `{allow:boolean, alasan?:string}` mengizinkan keadaan yang
    // tak boleh ada (izin membawa alasan, tolak tanpa sebab). Union menutupnya
    // di titik deklarasi — itu seluruh gunanya, jadi bentuknya ikut dikunci.
    const cc = fs.readFileSync(
      path.join(AKAR, "agent/broker/commandchain.ts"),
      "utf8",
    );
    // TypeScript menulis anggota union dengan titik koma dan biasanya memecahnya
    // per baris, jadi polanya dilonggarkan pada PEMISAHNYA — bukan pada
    // bentuknya. Yang tetap dikunci sama persis: allow:true berpasangan dengan
    // alasan:null, allow:false berpasangan dengan alasan bertipe string.
    expect(cc).toMatch(
      /\{ allow: true;? alasan: null \}\s*\|\s*\{ allow: false;? alasan: string \}/,
    );

    const zp = fs.readFileSync(
      path.join(AKAR, "agent/broker/zone-process.ts"),
      "utf8",
    );
    // `alasan` HANYA pada cabang tak-terkurung: itu yang membuat penjaga di
    // laporSekali() terverifikasi mesin.
    expect(zp).toMatch(
      /transport: "fork"[;,] jaringanTerkurung: false[;,] alasan: string/,
    );
    expect(zp).not.toMatch(/jaringanTerkurung: true[;,] alasan/);
  });

  // DUA konfigurasi, dan yang kedua bukan tambahan kosmetik.
  //
  // jsconfig.json hanya mencakup **/*.cjs dan **/*.js. Begitu sebuah berkas
  // bermigrasi ke .ts, ia KELUAR dari cakupan itu — dan kalau tes ini hanya
  // menjalankan jsconfig, berkas yang baru dimigrasi berhenti diperiksa tanpa
  // satu pun tanda. Itu persis kelas kegagalan yang seluruh berkas uji ini ada
  // untuk mencegahnya, hanya lewat pintu yang berbeda.
  const CFG_TS = path.join(AKAR, "agent", "tsconfig.json");

  test.each([
    ["jsconfig (berkas .cjs/.js ber-@ts-check)", CFG],
    ["tsconfig (berkas .ts hasil migrasi)", CFG_TS],
  ])(
    "tsc bersih pada agent/ — %s",
    (_label, cfg) => {
      let keluaran = "";
      let gagal = false;
      try {
        execFileSync(process.execPath, [TSC, "-p", cfg], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          cwd: AKAR,
        });
      } catch (e) {
        gagal = true;
        keluaran = String(e.stdout || "") + String(e.stderr || "");
      }
      const baris = keluaran.split(/\r?\n/).filter((b) => /error TS/.test(b));
      if (gagal) {
        // Tampilkan error aslinya, bukan sekadar "gagal" — supaya yang merah bisa
        // langsung diperbaiki tanpa menjalankan ulang perkakasnya.
        throw new Error(
          "tsc menemukan " +
            baris.length +
            " error di agent/:\n  " +
            baris.slice(0, 15).join("\n  "),
        );
      }
      expect(baris).toEqual([]);
    },
    120000,
  );
});
