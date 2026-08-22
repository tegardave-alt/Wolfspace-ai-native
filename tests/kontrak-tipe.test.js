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

// Files that have MIGRATED to TypeScript. The ratchet still applies; only its
// condition changes: a .ts file is ALWAYS checked by tsc, so what is guarded is
// no longer a `// @ts-check` line but that the file is still .ts and has not
// quietly been reverted to an unchecked .cjs.
const SUDAH_TYPESCRIPT = [
  "agent/broker/audit-log.ts",
  "agent/broker/commandchain.ts",
  "agent/broker/host.ts",
  "agent/broker/policy.ts",
  "agent/broker/zone-process.ts",
  "agent/mcp-client.ts",
  "agent/sandbox-policy.ts",
  "agent/sandbox.ts",
  "agent/snapshot.ts",
  "core/terminal.ts",
  "electron/preload.ts",
  "public/app/AgentSteps.tsx",
  "public/app/CodeBlocks.tsx",
  "public/app/Components.tsx",
  "public/app/Config.tsx",
  "public/app/Icons.tsx",
  "public/app/Model3DViewer.tsx",
  "public/app/PluginsView.tsx",
  "public/app/Viewport.tsx",
  "public/app/VisualTools.tsx",
  "public/app/Screens.tsx",
  "public/app/Sidebar.tsx",
  "public/app/Views.tsx",
  "public/app/usePreviewPanel.tsx",
];

describe("kontrak tipe jalur kritis", () => {
  test.each(SUDAH_DIPERIKSA)("%s masih menyalakan // @ts-check", (rel) => {
    const isi = fs.readFileSync(path.join(AKAR, rel), "utf8");
    // Harus di kepala berkas — `// @ts-check` di tengah tak berlaku.
    const kepala = isi.split(/\r?\n/).slice(0, 60).join("\n");
    expect(kepala).toMatch(/^\/\/ @ts-check$/m);
  });

  test.each(SUDAH_TYPESCRIPT)("%s masih berupa TypeScript", (rel) => {
    // Dropping back to .cjs without @ts-check would disable this file's checking
    // with no trace — the exact failure class as deleting the @ts-check line.
    expect(fs.existsSync(path.join(AKAR, rel))).toBe(true);
    expect(/\.tsx?$/.test(rel)).toBe(true);
  });

  test("fungsi vonis memakai UNION, bukan field opsional", () => {
    // Bentuk longgar `{allow:boolean, alasan?:string}` mengizinkan keadaan yang
    // tak boleh ada (izin membawa alasan, tolak tanpa sebab). Union menutupnya
    // di titik deklarasi — itu seluruh gunanya, jadi bentuknya ikut dikunci.
    const cc = fs.readFileSync(
      path.join(AKAR, "agent/broker/commandchain.ts"),
      "utf8",
    );
    // TypeScript writes union members with semicolons and usually breaks them
    // across lines, so the pattern is loosened on the SEPARATOR — never on the
    // shape. What stays pinned is identical: allow:true pairs with alasan:null,
    // allow:false pairs with alasan of type string.
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

  // TWO configs, and the second is not cosmetic.
  //
  // jsconfig.json only covers **/*.cjs and **/*.js. The moment a file migrates
  // to .ts it leaves that scope — and if this test ran jsconfig alone, a newly
  // migrated file would stop being checked with no signal at all. That is
  // precisely the failure class this whole test file exists to prevent, just
  // through a different door.
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
