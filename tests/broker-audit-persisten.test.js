// Jejak audit broker harus BERTAHAN, dan tak boleh membawa muatannya.
//
// KENAPA ADA. `Broker.audit` hanya array di memori, dan agent/tools/index.cjs
// membuat Broker BARU tiap panggilan capability_exec — jadi catatan
// ALLOW/DENY/BLOCKED mati bersama panggilannya. Terlihat sekali di hasil tool,
// lalu hilang.
//
// Itu bukan sekadar kurang nyaman. Sepanjang pengembangan, zona sempat berjalan
// berjam-jam TANPA pengurungan jaringan dan baru ketahuan karena kebetulan ada
// yang menguji — bukan karena tercatat. Jejak audit yang tak bertahan bukan
// jejak audit.
//
// TIGA SIFAT YANG DIJAGA, semuanya mudah rusak diam-diam:
//   1. Catatan benar-benar sampai ke disk, termasuk DENY dan BLOCKED — justru
//      dua itu yang paling berguna saat ada yang salah.
//   2. Muatan TIDAK ikut. params.content untuk writeFile berisi isi berkas utuh;
//      menuliskannya mentah membuat log membengkak DAN menyalin data yang
//      mungkin rahasia ke berkas teks biasa.
//   3. Gagal menulis tak melumpuhkan agent, tapi juga tak boleh senyap. Audit
//      yang diam-diam berhenti mencatat sama buruknya dengan tak punya audit.

const fs = require("fs");
const os = require("os");
const path = require("path");

// jest.resetModules(), BUKAN delete require.cache: Jest punya registry modul
// sendiri, jadi menghapus require.cache tak memuat ulang apa pun. Akibatnya
// modul tetap memakai DIR dari uji PERTAMA, dan semua uji berikutnya membaca
// direktori yang salah — gagal karena alasan yang tak ada hubungannya dengan
// yang diuji.
function muatSegar(dir) {
  process.env.WOLFSPACE_AUDIT_DIR = dir;
  jest.resetModules();
  return require("../agent/broker/audit-log.cjs");
}

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-"));
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

describe("catatan bertahan ke disk", () => {
  test("ALLOW, DENY, dan BLOCKED semuanya tercatat", () => {
    const a = muatSegar(dir);
    a.catat({
      capability: "readFile",
      decision: "ALLOW",
      params: { path: "/x" },
    });
    a.catat({
      capability: "readFile",
      decision: "DENY",
      reason: "di luar cakupan",
      params: { path: "/y" },
    });
    a.catat({
      capability: "network:https",
      decision: "BLOCKED",
      params: { tujuan: "https://z" },
    });
    const l = baris();
    expect(l.map((x) => x.decision)).toEqual(["ALLOW", "DENY", "BLOCKED"]);
    expect(l[1].reason).toMatch(/cakupan/);
  });

  test("satu baris JSON per catatan, bukan satu array besar", () => {
    // Format ini bisa dibaca sambil ditulis (tail), dan satu baris cacat tak
    // merusak seluruh berkas — beda dengan array JSON yang harus utuh.
    const a = muatSegar(dir);
    a.catat({ capability: "x", decision: "ALLOW", params: {} });
    a.catat({ capability: "y", decision: "ALLOW", params: {} });
    const isi = fs.readFileSync(path.join(dir, "broker.jsonl"), "utf8");
    expect(isi.trim().split("\n")).toHaveLength(2);
    expect(() => JSON.parse(isi.trim().split("\n")[1])).not.toThrow();
  });

  test("waktu ditulis sebagai ISO, bukan angka mentah", () => {
    const a = muatSegar(dir);
    a.catat({
      capability: "x",
      decision: "ALLOW",
      params: {},
      ts: 1700000000000,
    });
    expect(baris()[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("muatan TIDAK ikut ke dalam log", () => {
  test("isi panjang dipotong, dan panjang aslinya tetap tercatat", () => {
    const a = muatSegar(dir);
    a.catat({
      capability: "writeFile",
      decision: "ALLOW",
      params: { path: "/x", content: "A".repeat(5000) },
    });
    const c = baris()[0].params.content;
    expect(c.length).toBeLessThan(300);
    expect(c).toMatch(/5000 char total/); // ukurannya tetap bisa diaudit
  });

  test("field yang namanya berbau rahasia DISUNTING seluruhnya", () => {
    // Dipotong saja tidak cukup untuk yang ini: kunci pendek akan lolos utuh.
    const a = muatSegar(dir);
    a.catat({
      capability: "fetch",
      decision: "ALLOW",
      params: {
        url: "https://x",
        apiKey: "sk-pendek",
        token: "t",
        Authorization: "Bearer b",
      },
    });
    const p = baris()[0].params;
    expect(p.url).toBe("https://x"); // yang tak rahasia tetap utuh
    for (const k of ["apiKey", "token", "Authorization"])
      expect(p[k]).toBe("<disunting>");
  });
});

describe("tidak tumbuh tanpa batas", () => {
  test("berkas dirotasi setelah melewati ambang", () => {
    // Pelajaran dari log debug yang pernah mencapai 43 MB/hari sebelum punya
    // rotasi. Audit ditulis lebih jarang, tapi umurnya jauh lebih panjang.
    const a = muatSegar(dir);
    fs.writeFileSync(
      path.join(dir, "broker.jsonl"),
      "x".repeat(2 * 1024 * 1024 + 10),
    );
    a.catat({ capability: "x", decision: "ALLOW", params: {} });
    const arsip = fs
      .readdirSync(dir)
      .filter((f) => /^broker-.*\.jsonl$/.test(f));
    expect(arsip).toHaveLength(1);
    // Berkas aktif dimulai lagi dari nol, hanya berisi catatan baru.
    expect(baris()).toHaveLength(1);
  });
});

describe("gagal menulis: tidak melumpuhkan, tidak senyap", () => {
  test("catat() tidak melempar saat direktori mustahil dibuat", () => {
    // Kalau ini melempar, satu disk penuh akan mematikan seluruh broker —
    // menukar masalah kecil dengan masalah besar.
    const berkas = path.join(dir, "bukan-direktori");
    fs.writeFileSync(berkas, "aku berkas");
    const a = muatSegar(path.join(berkas, "mustahil"));
    const asli = process.stderr.write;
    let teriak = "";
    process.stderr.write = (s) => ((teriak += s), true);
    try {
      expect(() =>
        a.catat({ capability: "x", decision: "ALLOW", params: {} }),
      ).not.toThrow();
    } finally {
      process.stderr.write = asli;
    }
    // ...tapi kegagalannya HARUS terdengar sekali.
    expect(teriak).toMatch(/PERINGATAN.*audit/is);
  });
});

describe("broker benar-benar memanggilnya", () => {
  test("host.cjs mempertahankan tiap catatan, bukan cuma menumpuk di memori", () => {
    const S = fs.readFileSync(
      require.resolve("../agent/broker/host.cjs"),
      "utf8",
    );
    const i = S.indexOf("this.audit.push(entry)");
    const j = S.indexOf("catat(entry)", i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  test("gagal memuat modul audit tidak mematikan broker", () => {
    // Audit yang mati merugikan; broker yang mati fatal. Urutan prioritasnya
    // harus terlihat di kode.
    const S = fs.readFileSync(
      require.resolve("../agent/broker/host.cjs"),
      "utf8",
    );
    expect(S).toMatch(/catch \(_\) \{\s*_al = \{ catat\(\) \{\} \};/);
  });
});
