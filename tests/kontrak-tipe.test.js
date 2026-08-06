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
const SUDAH_DIPERIKSA = [
  "agent/broker/commandchain.cjs",
  "agent/broker/zone-process.cjs",
  "agent/attachment-bridge.cjs",
];

describe("kontrak tipe jalur kritis", () => {
  test.each(SUDAH_DIPERIKSA)("%s masih menyalakan // @ts-check", (rel) => {
    const isi = fs.readFileSync(path.join(AKAR, rel), "utf8");
    // Harus di kepala berkas — `// @ts-check` di tengah tak berlaku.
    const kepala = isi.split(/\r?\n/).slice(0, 60).join("\n");
    expect(kepala).toMatch(/^\/\/ @ts-check$/m);
  });

  test("fungsi vonis memakai UNION, bukan field opsional", () => {
    // Bentuk longgar `{allow:boolean, alasan?:string}` mengizinkan keadaan yang
    // tak boleh ada (izin membawa alasan, tolak tanpa sebab). Union menutupnya
    // di titik deklarasi — itu seluruh gunanya, jadi bentuknya ikut dikunci.
    const cc = fs.readFileSync(
      path.join(AKAR, "agent/broker/commandchain.cjs"),
      "utf8",
    );
    expect(cc).toMatch(
      /\{ allow: true, alasan: null \}\s*\|\s*\{ allow: false, alasan: string \}/,
    );

    const zp = fs.readFileSync(
      path.join(AKAR, "agent/broker/zone-process.cjs"),
      "utf8",
    );
    // `alasan` HANYA pada cabang tak-terkurung: itu yang membuat penjaga di
    // laporSekali() terverifikasi mesin.
    expect(zp).toMatch(
      /transport: "fork", jaringanTerkurung: false, alasan: string/,
    );
    expect(zp).not.toMatch(/jaringanTerkurung: true, alasan/);
  });

  test("tsc bersih pada agent/", () => {
    let keluaran = "";
    let gagal = false;
    try {
      execFileSync(process.execPath, [TSC, "-p", CFG], {
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
  }, 120000);
});
