// CommandChain Fase 1 — genesis immutable + rantai tamper-evident + admission.
//
// KENAPA ADA. Tiap operasi broker kini diperlakukan sebagai transaksi: dicek
// terhadap RULESET yang dibekukan saat sesi mulai (genesis), lalu dirantai ke
// ledger. Dua sifat yang membuatnya berharga, dan keduanya diuji sebagai
// PERILAKU, bukan sekadar struktur:
//   1. Genesis tak bisa dilonggarkan di tengah sesi — dasar tahan prompt-injection.
//   2. Riwayat tamper-evident — memalsukan satu catatan menuntut menulis ulang
//      SELURUH rantai sesudahnya, dan itu ketahuan.
//
// BATAS JUJUR yang ikut dijaga: "deterministik" hanya pada KEPUTUSAN admission,
// bukan eksekusi; hash-chain tamper-EVIDENT, bukan tamper-PROOF. Lihat
// docs/COMMANDCHAIN.md.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

function muatSegar(dir) {
  process.env.WOLFSPACE_AUDIT_DIR = dir;
  jest.resetModules(); // Jest punya registry sendiri — delete require.cache tak cukup
  return {
    cc: require("../agent/broker/commandchain.cjs"),
    audit: require("../agent/broker/audit-log.cjs"),
  };
}

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-"));
});
afterEach(() => {
  delete process.env.WOLFSPACE_AUDIT_DIR;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
});

const baris = () =>
  fs
    .readFileSync(path.join(dir, "broker.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

describe("genesis: ruleset immutable per-sesi", () => {
  test("ruleset dibekukan SAMPAI KE DALAM — tak bisa dilonggarkan", () => {
    const { cc } = muatSegar(dir);
    const rs = cc.buatRuleset({ sesi: "x" });
    expect(Object.isFrozen(rs)).toBe(true);
    expect(Object.isFrozen(rs.kapabilitas)).toBe(true);
    // Upaya melonggarkan diam-diam tak berpengaruh (freeze dalam).
    try {
      rs.kapabilitas.push("proc.raw");
    } catch (_) {}
    expect(rs.kapabilitas).not.toContain("proc.raw");
  });

  test("genesis adalah entri-0, dengan hash ruleset", () => {
    const { cc } = muatSegar(dir);
    cc.mulaiSesi({ sesi: "x" });
    const g = baris()[0];
    expect(g.seq).toBe(0);
    expect(g.capability).toBe("__genesis__");
    expect(g.rulesetHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("genesis TIDAK bisa disisipkan ulang bila ledger sudah berisi", () => {
    const { cc, audit } = muatSegar(dir);
    cc.mulaiSesi({ sesi: "x" });
    audit.catat({ capability: "readFile", decision: "ALLOW", params: {} });
    // Panggilan kedua tak boleh menambah genesis baru di kepala.
    cc.mulaiSesi({ sesi: "y" });
    const genesis = baris().filter((b) => b.capability === "__genesis__");
    expect(genesis).toHaveLength(1);
  });
});

describe("admission: deny-by-default terhadap kosakata genesis", () => {
  test("kapabilitas dalam kosakata DIIZINKAN", () => {
    const { cc } = muatSegar(dir);
    const rs = cc.buatRuleset();
    expect(cc.periksa(rs, "readFile").allow).toBe(true);
  });

  test("di luar kosakata DITOLAK (mis. proc.raw)", () => {
    const { cc } = muatSegar(dir);
    const rs = cc.buatRuleset();
    const r = cc.periksa(rs, "proc.raw");
    expect(r.allow).toBe(false);
    expect(r.alasan).toMatch(/proc\.raw/);
  });

  test("tanpa ruleset = deny (fail-closed, bukan fail-open)", () => {
    const { cc } = muatSegar(dir);
    expect(cc.periksa(null, "readFile").allow).toBe(false);
    expect(cc.periksa({}, "readFile").allow).toBe(false);
  });

  test("keputusan DETERMINISTIK — input sama, hasil sama", () => {
    const { cc } = muatSegar(dir);
    const rs = cc.buatRuleset();
    const a = cc.periksa(rs, "fetch");
    const b = cc.periksa(rs, "fetch");
    expect(a).toEqual(b);
  });
});

describe("rantai: tautan + integritas", () => {
  test("seq berurutan dan verifikasi lulus untuk rantai bersih", () => {
    const { cc, audit } = muatSegar(dir);
    cc.mulaiSesi();
    audit.catat({ capability: "readFile", decision: "ALLOW", params: {} });
    audit.catat({ capability: "fetch", decision: "DENY", params: {} });
    expect(baris().map((b) => b.seq)).toEqual([0, 1, 2]);
    expect(cc.verifikasiRantai()).toEqual({
      ok: true,
      panjang: 3,
      putusDi: null,
    });
  });

  test("mengubah isi TANPA memperbarui hash → ketahuan", () => {
    const { cc, audit } = muatSegar(dir);
    cc.mulaiSesi();
    audit.catat({
      capability: "readFile",
      decision: "DENY",
      params: { path: "/a" },
    });
    audit.catat({ capability: "writeFile", decision: "ALLOW", params: {} });

    const f = path.join(dir, "broker.jsonl");
    const b = fs.readFileSync(f, "utf8").trim().split("\n");
    const j = JSON.parse(b[1]);
    j.decision = "ALLOW"; // memalsukan keputusan
    b[1] = JSON.stringify(j); // hash lama dibiarkan
    fs.writeFileSync(f, b.join("\n") + "\n");

    const v = cc.verifikasiRantai();
    expect(v.ok).toBe(false);
    expect(v.putusDi).toBe(1);
  });

  test("memperbaiki hash satu baris MEMUTUS tautan baris berikutnya", () => {
    // Inti tamper-evidence: kau tak bisa menambal satu catatan tanpa menulis
    // ulang seluruh rantai sesudahnya.
    const { cc, audit } = muatSegar(dir);
    cc.mulaiSesi();
    audit.catat({ capability: "readFile", decision: "DENY", params: {} });
    audit.catat({ capability: "writeFile", decision: "ALLOW", params: {} });

    const f = path.join(dir, "broker.jsonl");
    let b = fs.readFileSync(f, "utf8").trim().split("\n");
    const k = JSON.parse(b[1]);
    k.decision = "ALLOW";
    const { hash, ...tanpa } = k;
    k.hash = crypto
      .createHash("sha256")
      .update((k.prevHash || "") + JSON.stringify(tanpa))
      .digest("hex"); // hash baris itu diperbaiki...
    b[1] = JSON.stringify(k);
    fs.writeFileSync(f, b.join("\n") + "\n");

    const v = cc.verifikasiRantai();
    expect(v.ok).toBe(false);
    // ...tapi baris berikutnya prevHash-nya tak lagi cocok.
    expect(v.putusDi).toBe(2);
    expect(v.alasan).toMatch(/tautan/);
  });
});

describe("terpasang di broker", () => {
  test("request() menolak kapabilitas di luar kosakata SEBELUM policy", async () => {
    const { audit } = muatSegar(dir);
    const { Policy, Broker } = require("../agent/broker/index.cjs");
    const b = new Broker(new Policy({ readFile: { roots: ["/x"] } }));
    await expect(b.request("proc.raw", { command: "whoami" })).rejects.toThrow(
      /CommandChain denied/,
    );
    // Dan penolakannya tercatat di rantai.
    expect(
      baris().some((x) => x.capability === "proc.raw" && x.decision === "DENY"),
    ).toBe(true);
  });
});
