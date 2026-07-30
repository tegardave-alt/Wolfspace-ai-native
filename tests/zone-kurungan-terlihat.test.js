// Turunnya jaminan pengurungan harus TERLIHAT, bukan diam.
//
// KENAPA ADA. Sebelum ini, gagalnya WSL membuat zona jatuh ke fork biasa lewat
// `catch (_) {}` — tanpa log, tanpa penanda di hasil. Karena `--permission`
// masih menahan berkas, semuanya TERLIHAT normal: kode jalan, audit terisi,
// tak ada yang merah. Yang hilang cuma pengurungan jaringan, yaitu satu-satunya
// alasan jalur WSL ini dibangun. Itu pola yang sama dengan gerbang Docker lama
// yang sudah dibuang: pengaman yang bisa mati sendiri tanpa memberi tahu.
//
// Yang diuji di sini BUKAN "pengurungannya bekerja" (itu ada di
// broker-netns.test.js dan broker-wsl-zone.test.js), melainkan "kalau tidak
// bekerja, apakah kelihatan".
//
// PROBE TAK BOLEH PERCAYA KODE KELUAR SAJA. Ditemukan saat menguji ini: dengan
// probe lama, WOLFSPACE_WSL_NODE=/bin/echo LULUS — echo mengabaikan flag tak
// dikenal dan keluar 0, jadi sistem menyatakan "terkurung" padahal binernya
// bukan Node sama sekali. Penanda yang bisa positif-palsu lebih buruk daripada
// tak ada penanda, karena orang berhenti memeriksa.

process.env.WOLFSPACE_ZONE_WSL = "0"; // suite lain: fork, supaya tak spawn wsl.exe

const fs = require("fs");
const {
  Policy,
  Broker,
  runInCapabilityZone,
} = require("../agent/broker/index.cjs");

const SRC = fs.readFileSync(
  require.resolve("../agent/broker/zone-process.cjs"),
  "utf8",
);

describe("struktur penanda pengurungan", () => {
  test("alasan kegagalan DISIMPAN, tidak dibuang catch(_)", () => {
    expect(SRC).toMatch(/_wslAlasan/);
    // Pola lama yang membuang alasan. Kalau kembali, penanda jadi tak berguna:
    // "fork" tanpa sebab tak memberi tahu apa yang harus diperbaiki.
    expect(SRC).not.toMatch(/_wslCache = null; \/\/ WSL tak siap/);
  });

  test("tiap tahap probe punya kode keluar sendiri", () => {
    // Rangkaian `a && b && c` cuma bisa bilang "gagal". "Distro tak ada" dan
    // "Node terlalu tua" menuntut tindakan yang berbeda.
    for (const kode of [11, 12, 13, 14]) {
      expect(SRC).toMatch(new RegExp("exit " + kode));
    }
  });

  test("tahap Node MEMBUKTIKAN binernya Node, bukan sekadar keluar 0", () => {
    // Penjaga terhadap positif-palsu /bin/echo.
    expect(SRC).toMatch(/process\.versions\.node/);
    expect(SRC).toMatch(/NODEV/);
    expect(SRC).toMatch(/< 23/); // versinya benar-benar dibandingkan
  });

  test("peringatan TIDAK lewat debug.cjs yang digerbang VERBOSE", () => {
    // agent/debug.cjs mati secara default. Peringatan turunnya jaminan justru
    // paling perlu terlihat pada orang yang tak menyalakan apa pun.
    expect(SRC).toMatch(/process\.stderr\.write/);
    expect(SRC).not.toMatch(/require\(["'].*debug\.cjs?["']\)/);
  });

  test("peringatan sekali jalan, bukan tiap eksekusi", () => {
    expect(SRC).toMatch(/_sudahLapor/);
  });
});

describe("perilaku penanda", () => {
  const zona = (opts) =>
    runInCapabilityZone('return "ok";', new Broker(new Policy({})), {
      timeout: 20000,
      ...opts,
    });

  test("hasil SELALU membawa status pengurungan", async () => {
    const z = await zona();
    expect(z.kurungan).toBeDefined();
    expect(typeof z.kurungan.jaringanTerkurung).toBe("boolean");
    expect(z.kurungan.transport).toBeTruthy();
  }, 30000);

  test("saat TIDAK terkurung, alasannya ikut — bukan cuma false", async () => {
    const z = await zona();
    if (z.kurungan.jaringanTerkurung) return; // di Linux ber-netns memang terkurung
    expect(String(z.kurungan.alasan || "")).not.toHaveLength(0);
  }, 30000);

  test("KEGAGALAN juga membawa status, bukan cuma keberhasilan", async () => {
    // Saat zona timeout atau melempar, pertanyaan "tadi terkurung atau tidak"
    // justru makin penting, bukan makin tak relevan.
    const e = await runInCapabilityZone(
      'throw new Error("sengaja");',
      new Broker(new Policy({})),
      { timeout: 20000 },
    ).catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e.kurungan).toBeDefined();
  }, 30000);

  test("opt-out eksplisit ditandai sebagai alasan yang berbeda", async () => {
    const z = await zona({ netns: false });
    expect(z.kurungan.jaringanTerkurung).toBe(false);
    expect(z.kurungan.alasan).toMatch(/opts\.netns=false/);
  }, 30000);
});

describe("penanda sampai ke keluaran yang DIBACA MODEL", () => {
  // Kalau penanda hanya ada di field terstruktur, model tak melihatnya dan
  // tetap menyimpulkan "kode ini berjalan terkurung" — kesimpulan salah yang
  // justru paling mahal.
  test("capability_exec menyisipkan penanda ke output saat tak terkurung", () => {
    const T = fs.readFileSync(
      require.resolve("../agent/tools/index.cjs"),
      "utf8",
    );
    expect(T).toMatch(/TANPA PENGURUNGAN JARINGAN/);
    expect(T).toMatch(/kurungan && !z\.kurungan\.jaringanTerkurung/);
  });
});
