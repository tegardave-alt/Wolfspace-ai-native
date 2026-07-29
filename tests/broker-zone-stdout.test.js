// Zona kapabilitas tak boleh menggantung hanya karena kode di dalamnya
// banyak mencetak.
//
// MASALAH YANG DIPERBAIKI. zone-process.cjs membuka child dengan
// stdio: ['ignore', 'pipe', 'pipe', 'ipc'], tapi HANYA stderr yang punya
// listener — stdout di-pipe dan tak pernah dibaca. Begitu buffer pipa OS penuh
// (~64 KB), proses zona memblok selamanya di console.log lalu mati kena
// timeout. Terukur pada kode yang identik, hanya beda volume cetakan:
//     tanpa cetak    -> 42 dalam 167 ms
//     cetak ~2 KB    -> 42 dalam 185 ms
//     cetak ~200 KB  -> TIMEOUT 8 detik
// Sesudah perbaikan: ~200 KB selesai dalam ~170 ms, ~5 MB dalam ~1,2 detik.
//
// Kegagalannya SENYAP: pesannya cuma "zone timeout" tanpa petunjuk bahwa
// penyebabnya mencetak terlalu banyak, sehingga orang akan menyalahkan kodenya
// sendiri, bukan sandbox-nya. Untuk sandbox yang tugasnya menjalankan kode
// ASING, "program yang banyak mencetak akan menggantung" adalah cacat yang
// pasti ketemu di pemakaian pertama.
//
// KUNCINYA: membatasi berapa yang DISIMPAN tidak boleh berarti berhenti
// MEMBACA. Kalau listenernya dilepas setelah penuh, deadlock-nya kembali
// persis seperti semula — karena itu ada kasus 5 MB di bawah.

const fs = require("fs");
const {
  Policy,
  Broker,
  runInCapabilityZone,
} = require("../agent/broker/index.cjs");

const zona = (code, opts) =>
  runInCapabilityZone(code, new Broker(new Policy({})), {
    timeout: 8000,
    ...opts,
  });

// 100 byte per baris; 2000 baris jauh melewati kapasitas pipa (~64 KB).
const cetak = (baris) =>
  `for (let i = 0; i < ${baris}; i++) console.log("x".repeat(100)); return 42;`;

describe("keluaran zona kapabilitas", () => {
  test("kode yang mencetak MELEBIHI buffer pipa tetap selesai", async () => {
    // Inti perbaikannya — dulu ini timeout 8 detik.
    const z = await zona(cetak(2000));
    expect(z.result).toBe(42);
    expect(z.outBytes).toBeGreaterThan(200000);
  }, 20000);

  test("volume SANGAT besar tetap dikuras, bukan cuma dibatasi", async () => {
    // Kalau perbaikannya berhenti membaca saat penampung penuh, kasus ini akan
    // menggantung lagi. 5 MB >> batas simpan 256 KB.
    const z = await zona(cetak(50000), { timeout: 20000 });
    expect(z.result).toBe(42);
    expect(z.outBytes).toBeGreaterThan(5000000); // benar-benar dikonsumsi
    expect(z.truncated).toBe(true); // tapi yang disimpan dibatasi
    expect(z.stdout.length).toBeLessThanOrEqual(256 * 1024);
  }, 30000);

  test("keluaran dikembalikan ke pemanggil, tidak dibuang", async () => {
    const z = await zona('console.log("halo dari zona"); return "selesai";');
    expect(z.result).toBe("selesai");
    expect(z.stdout).toMatch(/halo dari zona/);
  }, 20000);

  test("keluaran TETAP ADA saat zona melempar", async () => {
    // Justru di sinilah ia paling dibutuhkan: saat gagal, apa yang sempat
    // dicetak sering satu-satunya petunjuk yang tersisa.
    expect.assertions(2);
    try {
      await zona(
        'console.log("jejak sebelum gagal"); throw new Error("meledak");',
      );
    } catch (e) {
      expect(e.message).toMatch(/meledak/);
      expect(e.stdout).toMatch(/jejak sebelum gagal/);
    }
  }, 20000);

  test("stdout PUNYA listener (kalau hilang, deadlock-nya kembali)", () => {
    const src = fs.readFileSync(
      require.resolve("../agent/broker/zone-process.cjs"),
      "utf8",
    );
    expect(src).toMatch(/child\.stdout\.on\(\s*['"]data['"]/);
    expect(src).toMatch(/child\.stderr\.on\(\s*['"]data['"]/);
  });
});
