// ── Aset pra-kompres ──
//
// Dikompres SEKALI oleh scripts/kompres-aset.cjs, bukan per permintaan. Bedanya
// menentukan, dan membalik pilihan levelnya dari yang lazim: brotli kualitas 11
// terukur mengunci thread 913 ms untuk satu berkas 213 KB — mustahil diterima
// saat melayani permintaan, sama sekali tak berarti saat dijalankan sekali dari
// baris perintah.
//
// Terukur pada soket sungguhan (node server.cjs, port 8097):
//   Monaco tanpa Accept-Encoding : 3.569.622 B
//   Monaco dengan brotli         :   697.289 B   (80,5% lebih kecil)
//   di bawah beban 8 serentak    : 57 rps -> 213 rps, p50 132 ms -> 37 ms
// Seluruh public/: 26,35 MB -> 4,75 MB brotli (82%), 6,23 MB gzip (76%).

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const SRV = fs
  .readFileSync(path.join(AKAR, "server.ts"), "utf8")
  .replace(/\r\n/g, "\n");
const SKRIP = fs.readFileSync(
  path.join(AKAR, "scripts", "kompres-aset.cjs"),
  "utf8",
);
const tanpaKomentar = (t) =>
  t
    .split("\n")
    .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join("\n");

describe("skrip pra-kompresi", () => {
  test("memakai kualitas MAKSIMAL — ongkosnya dibayar sekali", () => {
    expect(SKRIP).toMatch(/BROTLI_PARAM_QUALITY\]: 11/);
    expect(SKRIP).toMatch(/gzipSync\(buf, \{ level: 9 \}\)/);
  });

  test("melewati berkas yang hasilnya sudah segar", () => {
    // Tanpa ini, tiap kali dijalankan berarti memampatkan ulang 3,5 MB Monaco
    // untuk hasil yang sudah ada di sebelahnya.
    expect(SKRIP).toMatch(/mtimeMs >= st\.mtimeMs/);
  });

  test("yang sudah terkompresi di dalamnya TIDAK dikompres lagi", () => {
    // Gambar dan font modern hanya bertambah berkas tanpa mengecil.
    const pola = eval(
      SKRIP.slice(SKRIP.indexOf("const BISA ="))
        .split("\n")[0]
        .replace("const BISA =", "")
        .replace(/;$/, ""),
    );
    for (const n of ["a.js", "a.css", "a.html", "a.json", "a.svg"])
      expect(pola.test(n)).toBe(true);
    for (const n of ["a.png", "a.woff2", "a.ico", "a.jpg"])
      expect(pola.test(n)).toBe(false);
  });
});

describe("penyajian aset terkompres", () => {
  const B = tanpaKomentar(SRV);
  const i = SRV.indexOf("function _pilihKompresi(");
  const FN = SRV.slice(i, SRV.indexOf("\n}", i) + 2);

  test("server TIDAK memampatkan saat melayani", () => {
    // Memampatkan per permintaan berarti CPU di proses utama Electron tiap kali
    // aset diminta.
    const iRute = B.indexOf("const pilih = _pilihKompresi(req, filePath)");
    expect(iRute).toBeGreaterThan(0);
    expect(B.slice(iRute, iRute + 900)).not.toMatch(/zlib|gzipSync|brotli/);
  });

  test("brotli didahulukan, gzip cadangan", () => {
    expect(FN.indexOf('["br"')).toBeLessThan(FN.indexOf('["gzip"'));
  });

  test("kesegaran DIPERIKSA, bukan diasumsikan", () => {
    // Berkas .br yang lebih tua dari sumbernya berarti pemakai menerima versi
    // LAMA tanpa satu pun tanda — bentuk kegagalan paling membingungkan yang
    // bisa dibuat lapisan ini.
    expect(FN).toMatch(/st\.mtimeMs < stAsli\.mtimeMs\) continue/);
  });

  test("klien yang tak menyanggupi tetap dapat berkas mentah", () => {
    expect(FN).toMatch(/if \(!terima\) return null/);
    expect(FN).toMatch(/terima\.indexOf\(encoding\) < 0\) continue/);
  });

  test("Vary dikirim bersama Content-Encoding", () => {
    // Tanpa Vary, perantara mana pun boleh menyajikan balasan ber-brotli kepada
    // klien yang tak menyanggupinya.
    const iR = B.indexOf("const pilih = _pilihKompresi(req, filePath)");
    const blok = B.slice(iR, iR + 900);
    expect(blok).toMatch(/"Content-Encoding": pilih\.encoding/);
    expect(blok).toMatch(/Vary: "Accept-Encoding"/);
  });
});
