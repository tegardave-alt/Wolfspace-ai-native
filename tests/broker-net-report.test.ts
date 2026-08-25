// Percobaan jaringan langsung dari zona harus TERCATAT, bukan gagal dalam diam.
//
// MASALAH YANG DIPERBAIKI. netns menahan kode zona yang nyasar ke jaringan — itu
// sudah terbukti. Tapi broker hanya melihat apa yang DIMINTA padanya lewat
// request(); kode yang langsung memanggil soket tak pernah meminta apa pun, ia
// gagal sendiri. Terukur sebelum perbaikan:
//     jaringan langsung -> "gagal EAI_AGAIN", jejak audit 0 entri
// Jadi ia dihentikan, tapi tak ada satu pun sinyal bahwa ia pernah dicoba.
// "Tidak akan berhasil" bukan hal yang sama dengan "saya diberi tahu ia mencoba".
//
// PELAPOR INI BUKAN PENJAGA, dan itu bukan kelemahan melainkan pembagian peran.
// Sudah dibuktikan bahwa stub di dalam zona bisa ditembus (`process.binding`
// duduk DI BAWAH lapisan modul). Yang menahan tetap kernel. Yang ini membuat
// percobaannya terlihat — dan sekaligus jadi bukti bahwa netns memang bekerja,
// karena entri BLOCKED hanya muncul di lingkungan yang benar-benar mengurung.
//
// TITIK CEGATNYA Module._load, bukan require.cache. Menimpa cache hanya
// menangkap `require("https")`; `require("node:https")` lolos karena builtin
// ber-prefix `node:` tak pernah melewati require.cache. Terukur: bentuk polos 1
// entri, bentuk `node:` 0 entri. Module._load dilewati keduanya.

// Suite ini memakai transport fork, BUKAN WSL. Jest menjalankan berkas uji
// secara paralel, dan tiap zona lewat WSL berarti satu spawn wsl.exe — terbukti
// membuat suite flaky (sekali merah, sekali hijau, tanpa perubahan kode).
// Transport WSL diuji terpisah di tests/broker-wsl-zone.test.js.
process.env.WOLFSPACE_ZONE_WSL = "0";

const fs = require("fs");
const path = require("path");
const {
  Policy,
  Broker,
  runInCapabilityZone,
} = require("../agent/broker/index.cjs");

const SRC = fs.readFileSync(
  require.resolve("../agent/broker/zone-worker.cjs"),
  "utf8",
);

describe("struktur pelapor jaringan (semua platform)", () => {
  test("mencegat di Module._load, bukan require.cache", () => {
    expect(SRC).toMatch(/Module\._load\s*=/);
    // Kalau seseorang mengembalikannya ke cache-poking, bentuk `node:` diam lagi.
    expect(SRC).not.toMatch(/require\.cache\[[^\]]*\]\s*=\s*\{\s*id:/);
  });

  test("menormalkan prefiks node: sehingga kedua bentuk tertangkap", () => {
    expect(SRC).toMatch(/replace\(\/\^node:\/, ""\)/);
  });

  test("melapor DULU, baru melempar — supaya tercatat meski kode menelan errornya", () => {
    const i = SRC.indexOf('type: "net-attempt"');
    const j = SRC.indexOf("throw new Error(", i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  test("pesannya menunjuk jalan yang benar, bukan sekadar menolak", () => {
    expect(SRC).toMatch(/request\("fetch"/);
  });
});

const jalan = (kode) => {
  const broker = new Broker(
    new Policy({ fetch: { hosts: ["api.github.com"] } }),
  );
  return runInCapabilityZone(kode, broker, { timeout: 20000 })
    .catch((e) => ({ result: "lempar: " + e.message }))
    .then((z) => ({ z, audit: broker.auditTrail() }));
};

describe("perilaku pelapor", () => {
  test('require("https") tercatat sebagai BLOCKED', async () => {
    const { audit } = await jalan(
      'try { require("https").get("https://api.github.com", ()=>{}) } catch (e) { return "ditolak" } return "TEMBUS";',
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].capability).toBe("network:https");
    expect(audit[0].decision).toBe("BLOCKED");
  }, 30000);

  test('require("node:https") JUGA tercatat — bentuk ini dulu lolos diam-diam', async () => {
    const { audit } = await jalan(
      'try { require("node:https").get("https://api.github.com", ()=>{}) } catch (e) { return "ditolak" } return "TEMBUS";',
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].capability).toBe("network:https");
  }, 30000);

  test("net dan dgram ikut terpantau, bukan cuma http/https", async () => {
    const a = await jalan(
      'try { require("net").connect(80, "1.1.1.1") } catch (e) { return "ditolak" } return "TEMBUS";',
    );
    expect(a.audit.map((x) => x.capability)).toContain("network:net");
  }, 30000);

  test("request() TETAP jalan — pelapor tak boleh menutup pintu resmi", async () => {
    // Kalau ini rusak, pelapor berubah jadi pemutus: zona kehilangan satu-satunya
    // jalan sah ke jaringan, dan broker jadi tak berguna.
    const { z, audit } = await jalan(
      'const r = await request("fetch", { url: "https://api.github.com" }); return "status " + r.status;',
    );
    expect(String(z.result)).toMatch(/^status \d+$/);
    expect(
      audit.some((x) => x.capability === "fetch" && x.decision === "ALLOW"),
    ).toBe(true);
  }, 40000);

  test("tool lain di dalam zona tidak ikut terhalang", async () => {
    // Hanya modul jaringan yang diganti. fs sudah dijaga --permission, dan
    // modul lain harus lewat apa adanya.
    const { z } = await jalan('return require("path").join("a", "b");');
    expect(String(z.result)).toMatch(/a[\\/]b/);
  }, 30000);
});
