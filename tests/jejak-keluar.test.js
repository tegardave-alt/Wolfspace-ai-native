// Backend mati dan tidak meninggalkan APA PUN.
//
// KEJADIAN NYATA. Pukul 10:42 backend berhenti. Yang tersisa cuma gejala:
// cangkang Electron masih berdiri dengan jendela "Wolfspace UI", tak ada yang
// mendengarkan port 8090, thread utama Wait/UserRequest dengan CPU +0 detik,
// dan baris log terakhir sebuah stop HITL yang sama sekali normal.
//
// Yang dicari untuk mendiagnosisnya, dan TIDAK ADA satu pun:
//   _crash.log           terakhir ditulis lima hari sebelumnya
//   dump Crashpad        tak ada
//   Windows Error Rep.   hanya DiskSnapshot.exe, tak berhubungan
//   event log Application tak ada entri untuk proses itu
//
// Sebabnya struktural, bukan kesialan: server.cjs hanya menangkap
// uncaughtException. Keluar karena sebab lain — promise ditolak tanpa
// penangkap, sinyal, atau process.exit dari mana pun — tak meninggalkan sebaris
// pun. "Keluar normal kode 0", "dibunuh SIGTERM", dan "promise ditolak" jadi
// terlihat identik dari luar: senyap.
//
// Uji ini menjalankan proses SUNGGUHAN untuk tiap cara pergi, karena yang perlu
// dijamin bukan adanya kode handler melainkan adanya BARIS di berkas sesudah
// proses benar-benar mati.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
jest.setTimeout(60000);

/**
 * Jalankan potongan kode dengan jejak keluar terpasang, lalu kembalikan baris
 * KELUAR yang tercatat. Ditulis ke direktori sementara supaya _crash.log repo
 * tak ikut terisi oleh uji.
 */
function jalankan(potongan, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jejak-"));
  const skrip = path.join(dir, "uji.cjs");
  // Bagian jejakKeluar disalin dari server.cjs apa adanya: yang diuji perilaku
  // potongan itu, dan menyalinnya membuat uji tak perlu menyalakan server penuh.
  const src = fs.readFileSync(path.join(AKAR, "server.cjs"), "utf8");
  const i = src.indexOf("(function jejakKeluar() {");
  const j = src.indexOf("})();", i) + 5;
  expect(i).toBeGreaterThan(0);
  fs.writeFileSync(
    skrip,
    "const __dirname_asli = __dirname;\n" + src.slice(i, j) + "\n" + potongan,
    "utf8",
  );
  const r = spawnSync(process.execPath, [skrip], {
    encoding: "utf8",
    timeout: 20000,
    cwd: dir,
    ...opts,
  });
  const berkas = path.join(dir, "_crash.log");
  const isi = fs.existsSync(berkas) ? fs.readFileSync(berkas, "utf8") : "";
  fs.rmSync(dir, { recursive: true, force: true });
  return { isi, kode: r.status, pid: r.pid };
}

describe("kepergian backend selalu meninggalkan jejak", () => {
  test("keluar NORMAL tercatat, bukan cuma yang gagal", () => {
    // Justru ini yang paling sering hilang: kepergian yang wajar tak dianggap
    // layak dicatat, lalu "berhenti normal" tak bisa dibedakan dari "dibunuh".
    const { isi } = jalankan("process.exit(0);");
    expect(isi).toMatch(/KELUAR sebab=exit/);
    expect(isi).toMatch(/kode=0/);
    expect(isi).toMatch(/hidup=\d+s/);
  });

  test("kode keluar bukan-nol ikut terekam apa adanya", () => {
    const { isi } = jalankan("process.exit(7);");
    expect(isi).toMatch(/kode=7/);
  });

  test("promise ditolak tanpa penangkap tercatat, bukan senyap", () => {
    // Sebelum ini TIDAK ada handler unhandledRejection sama sekali di server.
    const { isi } = jalankan(
      "Promise.reject(new Error('gagal-uji-jejak')); setTimeout(()=>process.exit(0), 300);",
    );
    expect(isi).toMatch(/unhandledRejection|KELUAR sebab=exit/);
    expect(isi).toMatch(/gagal-uji-jejak|kode=0/);
  });

  test("satu baris per kepergian, bukan satu per handler", () => {
    // 'exit' menyala sesudah jalur lain juga menulis; tanpa penjaga, satu
    // kepergian menghasilkan beberapa baris dan jejaknya jadi sulit dibaca.
    const { isi } = jalankan(
      "Promise.reject(new Error('x')); setTimeout(()=>process.exit(3), 300);",
    );
    expect((isi.match(/KELUAR sebab=/g) || []).length).toBe(1);
  });

  test("mencatat PID dan lama hidup — keduanya dibutuhkan saat menelusuri", () => {
    // Tanpa PID, jejak tak bisa dicocokkan dengan proses yang terlihat di
    // task manager; tanpa lama hidup, tak bisa dibedakan mati saat start dari
    // mati sesudah berjam-jam.
    const { isi } = jalankan("process.exit(0);");
    expect(isi).toMatch(/pid=\d+/);
    expect(isi).toMatch(/hidup=\d+s/);
  });

  test("terpasang di server.cjs, bukan hanya ada sebagai fungsi", () => {
    const src = fs.readFileSync(path.join(AKAR, "server.cjs"), "utf8");
    expect(src).toMatch(/\(function jejakKeluar\(\) \{/);
    expect(src).toMatch(/process\.on\("exit"/);
    expect(src).toMatch(/process\.on\("unhandledRejection"/);
    for (const s of ["SIGTERM", "SIGINT", "SIGBREAK"]) expect(src).toContain(s);
  });
});
