// Thread utama Electron tidak boleh dibekukan oleh jalur panas.
//
// KENAPA INI PENTING DI SINI, BUKAN DI TEMPAT LAIN. Agent WOLFSPACE tidak
// berjalan di proses terpisah: electron/main.js me-require core.js (yang
// me-require server.cjs) lalu memanggil handler-nya langsung lewat
// core().server.emit("request", req, res) dengan req/res TIRUAN. Jadi setiap
// milidetik SINKRON di server.cjs maupun di tool agent adalah milidetik jendela
// membeku — itulah yang muncul sebagai "not responding" di Windows.
//
// Dua akar yang terukur lewat profil CPU (node --cpu-prof) + pemantau detak
// event loop, keduanya dikunci di berkas ini:
//
//   1. appcontainer-jail.tersedia() dan sid() memakai execFileSync. Keduanya
//      menyalakan AcLaunch.exe + PowerShell. Jejak pemanggilnya dari profil:
//
//        spawnSync            node:internal/child_process:1128   2025 ms
//        execFileSync         node:child_process:950
//        tersedia             agent/tools/appcontainer-jail.cjs
//        siapUntuk            agent/tools/appcontainer-jail.cjs
//        runSelfTool          agent/tools/index.cjs
//
//      Blok sinkron terpanjang saat perintah bash PERTAMA: 2178 ms. Sesudah
//      keduanya dipindah ke execFile asinkron: 47 ms. Menunggu proses anak tak
//      pernah perlu membekukan apa pun — hanya bentuk panggilannya yang salah.
//
//   2. res.writableEnded pada res tiruan di electron/main.js SELALU false.
//      `writableEnded`/`writableFinished` adalah accessor hanya-baca di
//      prototipe Writable; menugaskannya dari kode non-strict diabaikan dalam
//      diam. Seluruh penjaga `if (!res.writableEnded)` di server.cjs karena itu
//      mati di jalur desktop — termasuk satu-satunya rem yang menghentikan
//      kerja sesudah pemakai membatalkan.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const baca = (p) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");

const AC = baca("agent/tools/appcontainer-jail.cjs");
const MAIN = baca("electron/main.js");
// Komentar dibuang untuk pemeriksaan "tak ada penugasan langsung": komentar
// penjelas di main.js justru MENGUTIP bentuk yang salah sebagai contoh.
const MAIN_KODE = MAIN.split("\n")
  .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
  .join("\n");
const SERVER = baca("server.cjs");

// Isi sebuah fungsi, dari tanda tangannya sampai kurung tutup di kolom 0.
const tubuh = (src, tanda) => {
  const i = src.indexOf(tanda);
  if (i < 0) throw new Error("tak ketemu: " + tanda);
  const j = src.indexOf("\n}", i);
  return src.slice(i, j < 0 ? src.length : j);
};

describe("penyelidik AppContainer tidak memblokir event loop", () => {
  test("versi asinkron ada dan diekspor", () => {
    expect(AC).toMatch(/function tersediaAsync\(\)/);
    expect(AC).toMatch(/function sidAsync\(\)/);
    expect(AC).toMatch(/^\s*tersediaAsync,$/m);
    expect(AC).toMatch(/^\s*sidAsync,$/m);
  });

  test("keduanya memakai execFile, bukan execFileSync", () => {
    for (const nama of ["function tersediaAsync()", "function sidAsync()"]) {
      const t = tubuh(AC, nama);
      expect(t).toMatch(/\bexecFile\(/);
      expect(t).not.toMatch(/execFileSync/);
    }
  });

  // Inti perbaikannya. Kalau salah satu fungsi asinkron ini memanggil balik
  // versi sinkronnya, 2 detik pembekuan itu kembali tanpa ada yang menyadari:
  // hasilnya tetap benar, cuma jendelanya mati sebentar.
  test.each([
    ["async function siapUntuk(root)", "siapUntuk"],
    ["async function beriSementara(dir)", "beriSementara"],
    ["async function cabutSemuaKecuali(aktif)", "cabutSemuaKecuali"],
    ["async function jalankan(perintah, opts)", "jalankan"],
  ])("%s memakai penyelidik asinkron", (tanda) => {
    const t = tubuh(AC, tanda);
    expect(t).not.toMatch(/(?<!Async)\btersedia\(\)/);
    expect(t).not.toMatch(/(?<!Async)\bsid\(\)/);
  });

  test("versi sinkron TETAP ada — dipakai daftarAkses() dan berkas uji", () => {
    // Sengaja dipertahankan: di konteks sinkron harganya dibayar sekali, di
    // luar jalur yang dilihat pemakai. Keduanya berbagi _G.cache.
    expect(AC).toMatch(/^function tersedia\(\) \{$/m);
    expect(AC).toMatch(/^function sid\(\) \{$/m);
    expect(tubuh(AC, "function daftarAkses()")).toMatch(/sid: sid\(\)/);
  });

  test("penilaian sinkron dan asinkron memakai kode yang SAMA", () => {
    // Tanpa ini keduanya bisa menyimpang: satu menyebut container siap, satu
    // lagi tidak, dan gejalanya bergantung pada siapa yang kebetulan jalan
    // duluan.
    for (const nama of ["function tersedia()", "function tersediaAsync()"]) {
      const t = tubuh(AC, nama);
      expect(t).toMatch(/_tersediaMurah\(\)/);
      expect(t).toMatch(/_nilaiUji\(/);
    }
  });
});

describe("penjaga writableEnded hidup di jalur Electron", () => {
  test("res tiruan memasang accessor, bukan menugaskan properti", () => {
    expect(MAIN).toMatch(/function _pasangTandaSelesai\(res\)/);
    const t = tubuh(MAIN, "function _pasangTandaSelesai(res)");
    expect(t).toMatch(/Object\.defineProperty\(res, "writableEnded"/);
    expect(t).toMatch(/Object\.defineProperty\(res, "writableFinished"/);
  });

  test("tak ada lagi penugasan langsung yang diabaikan diam-diam", () => {
    // `res.writableEnded = ...` tak melempar dan tak berefek; ia hanya membuat
    // kode TERLIHAT benar. Itu sebabnya bertahan lama tanpa ketahuan.
    expect(MAIN_KODE).not.toMatch(/res\.writableEnded\s*=/);
    expect(MAIN_KODE).not.toMatch(/res\.writableFinished\s*=/);
  });

  test("kedua pembungkus (apiCall dan apiStream) memakainya", () => {
    const n = (MAIN.match(/_pasangTandaSelesai\(res\);/g) || []).length;
    expect(n).toBe(2);
  });

  test("end() kedua kali tidak menjawab dua kali", () => {
    const akhiran = MAIN.match(
      /res\.end = \(chunk\) => \{\n\s*if \(res\._selesai\) return;/g,
    );
    expect(akhiran).toHaveLength(2);
  });

  test("penjaga di server.cjs memang ADA — kalau tidak, perbaikan ini sia-sia", () => {
    // Nilainya justru bergantung pada ini: accessor-nya dipasang supaya
    // pemeriksaan di sisi handler punya arti.
    //
    // The threshold dropped from 10 to 9 when local-model support was removed:
    // the /complete ghost-text endpoint held one of these checks and went away
    // with askFIM(). What this guards is that handler-side checks still exist in
    // numbers, not that any particular endpoint does — so the count follows the
    // handlers that remain rather than pinning a number the code has outgrown.
    const n = (SERVER.match(/res\.writableEnded|res\.writableFinished/g) || [])
      .length;
    expect(n).toBeGreaterThanOrEqual(9);
  });
});

describe("perilaku accessor yang mendasari temuan ini", () => {
  test("penugasan ke writableEnded memang DIABAIKAN pada Writable telanjang", () => {
    // Bukti yang membuat temuan ini bisa dipercaya, dijalankan bukan diklaim.
    const { Writable } = require("stream");
    const res = new Writable();
    res.writableEnded = true;
    expect(res.writableEnded).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(res, "writableEnded")).toBe(
      false,
    );
    const d = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(res),
      "writableEnded",
    );
    expect(typeof d.get).toBe("function");
    expect(d.set).toBeUndefined();
  });

  test("accessor pengganti benar-benar berubah saat end()", () => {
    const { Writable } = require("stream");
    const res = new Writable();
    res._selesai = false;
    const b = () => res._selesai;
    Object.defineProperty(res, "writableEnded", { get: b, configurable: true });
    expect(res.writableEnded).toBe(false);
    res._selesai = true;
    expect(res.writableEnded).toBe(true);
  });
});
