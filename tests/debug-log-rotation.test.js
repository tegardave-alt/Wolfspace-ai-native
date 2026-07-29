// Rotasi berkas log debug.
//
// KENAPA ADA. LOG_RING dibatasi 800 entri sejak awal, tapi BERKASNYA tidak
// dibatasi sama sekali. Terukur di mesin pengembang: 0,99 GB dalam 23,8 hari
// (~4 juta event, ~43 MB/hari) — tumbuh sampai disk penuh, dan di container ia
// memakan volume /data yang sama dengan cloud-keys.json.
//
// Ukurannya juga membebani penulisannya sendiri: append ke berkas kosong
// 0,476 ms, ke berkas 0,99 GB 0,787 ms (+65%), dan appendFileSync itu SINKRON
// di jalur yang dipanggil tiap langkah agent.
//
// Tes dijalankan di proses `node` polos lewat child process, bukan di dalam
// Jest: modul debug membaca ukuran berkas SEKALI saat dimuat, dan LOG_FILE-nya
// tetap. Menjalankannya terisolasi membuat tiap kasus punya berkas sendiri
// tanpa saling mencemari lewat registry modul Jest.

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEBUG = path.join(ROOT, "agent", "debug.cjs").replace(/\\/g, "/");
const LOG = path.join(os.tmpdir(), "WOLFSPACE-debug.log");
const PREV = LOG + ".1";

function runProbe(code) {
  const out = execFileSync(process.execPath, ["-e", code], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 30000,
  });
  return JSON.parse(out.trim());
}

describe("rotasi log debug", () => {
  test("berkas dirotasi setelah melewati ambang, bukan tumbuh tanpa batas", () => {
    // Sisihkan log nyata supaya tes tak menghapus jejak pengembangan.
    const stash = LOG + ".testbackup";
    const hadLog = fs.existsSync(LOG);
    if (hadLog) fs.renameSync(LOG, stash);
    try {
      fs.unlinkSync(PREV);
    } catch (_) {}

    try {
      const r = runProbe(`
        const fs = require("fs");
        const d = require(${JSON.stringify(DEBUG)});
        // config.verbose aktif di repo ini, jadi dlog menulis SETIAP event ke
        // stdout. Dengan 900 x 64KB itu membanjiri buffer proses anak (ENOBUFS)
        // dan tesnya gagal sebelum sempat menguji apa pun. Bungkam selama
        // pengisian, pulihkan untuk melaporkan hasil.
        const realWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = () => true;
        const blob = "x".repeat(64 * 1024);
        let writes = 0;
        for (let i = 0; i < 900; i++) { d.dlog("test", "info", "isi", { blob }); writes++; }
        process.stdout.write = realWrite;

        const cur = fs.existsSync(d.LOG_FILE) ? fs.statSync(d.LOG_FILE).size : 0;
        const prev = fs.existsSync(d.LOG_PREV) ? fs.statSync(d.LOG_PREV).size : 0;
        process.stdout.write(JSON.stringify({
          writes, cur, prev, limit: d.LOG_MAX_BYTES,
          rotated: prev > 0,
          curUnderLimit: cur < d.LOG_MAX_BYTES,
        }));
      `);

      // Total yang ditulis MELEBIHI ambang -> rotasi harus terjadi.
      expect(r.rotated).toBe(true);
      // Berkas aktif harus kembali kecil, bukan menumpuk.
      expect(r.curUnderLimit).toBe(true);
      // Batas atas total = berkas aktif + satu berkas lama.
      expect(r.cur + r.prev).toBeLessThan(r.limit * 2.2);
    } finally {
      try {
        fs.unlinkSync(LOG);
      } catch (_) {}
      try {
        fs.unlinkSync(PREV);
      } catch (_) {}
      if (hadLog) fs.renameSync(stash, LOG);
    }
  }, 120000);

  test("penulisan berkas menghormati config.debug (dulu tidak)", () => {
    // Dulu appendFileSync berjalan TANPA SYARAT, sehingga `debug: false` hanya
    // membungkam konsol sementara berkasnya tetap tumbuh 43 MB/hari.
    const src = fs.readFileSync(path.join(ROOT, "agent", "debug.cjs"), "utf8");
    // Cari pemanggilan NYATA (`fs.appendFileSync`), bukan penyebutannya di
    // komentar — versi pertama tes ini mencocokkan teks komentar dan gagal
    // memeriksa apa pun.
    const i = src.indexOf("fs.appendFileSync");
    expect(i).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, i - 300), i);
    expect(before).toMatch(/if\s*\(\s*DEBUG_ON\s*\)/);
  });

  test("hanya SATU module.exports (dulu ada dua, yang kedua menimpa)", () => {
    const src = fs.readFileSync(path.join(ROOT, "agent", "debug.cjs"), "utf8");
    const n = (src.match(/^module\.exports\s*=/gm) || []).length;
    expect(n).toBe(1);
    // VERBOSE dulu tercantum di ekspor pertama lalu hilang tertimpa.
    expect(require("../agent/debug.cjs")).toHaveProperty("VERBOSE");
  });
});
