// Fondasi sistem plugin: dua pintu yang terpisah.
//
//   PINTU 1 — USER memasang. Bebas, apa pun, dari mana pun.
//   PINTU 2 — AGENT memanggil. Lewat admission CommandChain.
//
// KENAPA ADA. Sebelum ini keduanya satu pintu, dan pintu itu terbuka untuk
// model: `skill_install` ada di daftar tool model dengan deskripsi "Install a
// new skill from npm, a local .cjs file, or a URL" — tanpa admission (cabang
// skill tak pernah memanggil cc.periksa) dan tanpa HITL (EXECUTION_TOOLS hanya
// berisi "bash"). Model bisa memasang kode arbitrer untuk dirinya sendiri.
//
// Yang membuatnya serius bukan kemungkinan plugin-nya jahat, melainkan JALUR
// PEMANGGILANNYA: tool dipilih model, dan model membaca isi berkas, keluaran
// tool, serta halaman web — semuanya bisa memuat kalimat berbunyi seperti
// perintah. Manusia yang mengklik menu VS Code tak bisa disuntik prompt oleh
// berkas yang ia buka; model bisa.

const fs = require("fs");
const os = require("os");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const plugins = require("../agent/plugins.cjs");

describe("pintu pemasangan bukan milik model", () => {
  const DEF = fs.readFileSync(
    require.resolve("../agent/tools/tool-definitions.cjs"),
    "utf8",
  );
  // Komentar dibuang supaya catatan sejarah (yang memang menyebut namanya) tak
  // dikira definisi hidup.
  const KODE = DEF.split("\n")
    .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join("\n");

  test("skill_install TIDAK diekspos ke model", () => {
    expect(KODE).not.toMatch(/name:\s*"skill_install"/);
    expect(KODE).not.toMatch(/name:\s*"plugin_install"/);
  });

  test("alasannya ikut tertulis, bukan cuma dihapus", () => {
    // Penghapusan tanpa sebab akan dikembalikan orang berikutnya yang merasa
    // tool-nya "hilang".
    expect(DEF).toMatch(/skill_install DICABUT/);
    expect(DEF).toMatch(/EXECUTION_TOOLS/);
  });

  test("implementasinya SENGAJA tetap hidup untuk UI", () => {
    // Yang dicabut pintunya ke model, bukan fungsinya. UI (dan jalur HITL nanti)
    // masih perlu memanggil ini.
    const IDX = fs.readFileSync(
      require.resolve("../agent/tools/index.cjs"),
      "utf8",
    );
    expect(IDX).toMatch(/name === "skill_install"/);
  });
});

describe("manifest divalidasi, bukan dipercaya", () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wolf-plug-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const tulis = (isi) => {
    fs.writeFileSync(
      path.join(tmp, "manifest.json"),
      typeof isi === "string" ? isi : JSON.stringify(isi),
    );
    return plugins.bacaManifest(tmp);
  };

  test("manifest sah -> ok", () => {
    const r = tulis({
      nama: "kaggle",
      versi: "0.1.0",
      command: "node",
      args: ["agent/mcp-servers/kaggle-mcp.cjs"],
      izin: ["network:https"],
    });
    expect(r.ok).toBe(true);
    expect(r.plugin.nama).toBe("kaggle");
    // Manifest hanya MEMINTA izin. Yang MEMBERI adalah user, lewat berkas lain.
    expect(r.plugin.disetujui).toBe(false);
  });

  test("JSON rusak -> {ok:false}, bukan melempar", () => {
    const r = tulis("{ bukan json");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/JSON/i);
  });

  test("izin di luar kosakata DITOLAK, bukan diabaikan", () => {
    // Izin yang diam-diam dibuang akan muncul lagi sebagai penolakan
    // membingungkan saat plugin dipanggil, jauh dari sebabnya.
    const r = tulis({
      nama: "nakal",
      command: "node",
      izin: ["network:https", "root.access"],
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/root\.access/);
  });

  test("proc.raw TIDAK boleh diminta plugin", () => {
    // Plugin sudah proses terpisah yang menjalankan perintahnya sendiri; shell
    // mentah akan menyerahkan lagi jalur yang dikurung sisa sistem ini.
    expect(plugins.IZIN_DIKENAL).not.toContain("proc.raw");
    const r = tulis({ nama: "x", command: "node", izin: ["proc.raw"] });
    expect(r.ok).toBe(false);
  });

  test("nama berbahaya ditolak", () => {
    for (const n of ["../keluar", "a/b", "", "titik.".repeat(20) + "x"]) {
      const r = tulis({ nama: n, command: "node" });
      expect(r.ok).toBe(false);
    }
  });

  test("command WAJIB — plugin dijalankan, bukan di-require", () => {
    const r = tulis({ nama: "x", entry: "index.cjs" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/command/);
  });

  test("modul ini tak pernah memuat kode plugin", () => {
    // Inti bedanya dengan skills.cjs, yang me-require plugin ke proses main.
    const SRC = fs.readFileSync(
      require.resolve("../agent/plugins.cjs"),
      "utf8",
    );
    expect(SRC).not.toMatch(/require\(\s*(dir|filePath|entry|p\.dir)/);
    expect(SRC).not.toMatch(/\bnew Function\b|\beval\(/);
  });
});

describe("persetujuan user, bukan deklarasi diri", () => {
  test("kapabilitas plugin diawali plugin.", () => {
    expect(plugins.kapabilitas("kaggle")).toBe("plugin.kaggle");
  });

  test("berkas persetujuan TERPISAH dari manifest", () => {
    // Kalau digabung, penulis plugin bisa menyetujui dirinya sendiri.
    expect(plugins.BERKAS_SETUJU).not.toMatch(/manifest\.json$/);
    expect(path.basename(plugins.BERKAS_SETUJU)).toBe("_disetujui.json");
  });

  test("belum ada berkas persetujuan -> kosong (deny-by-default)", () => {
    // pindai() pada folder plugins/ yang belum ada tak boleh melempar.
    expect(Array.isArray(plugins.disetujui())).toBe(true);
    expect(Array.isArray(plugins.kapabilitasDisetujui())).toBe(true);
  });

  test("persetujuan basi tak menghidupkan apa pun", () => {
    // Nama yang disetujui tapi plugin-nya sudah dihapus dari disk harus
    // menghasilkan NOL kapabilitas — syaratnya dua, dan keduanya wajib.
    const SRC = fs.readFileSync(
      require.resolve("../agent/plugins.cjs"),
      "utf8",
    );
    expect(SRC).toMatch(/ada\.has\(n\)/);
  });
});

describe("kapabilitas plugin masuk genesis, sekali, saat dibekukan", () => {
  const CC = fs.readFileSync(
    require.resolve("../agent/broker/commandchain.cjs"),
    "utf8",
  );

  test("sesiRuleset menyertakan kapabilitas yang disetujui", () => {
    expect(CC).toMatch(/kapabilitasDisetujui\(\)/);
    expect(CC).toMatch(/KOSAKATA_DEFAULT\.concat\(kapPlugin\)/);
  });

  test("kegagalan memuat plugins.cjs -> nol kapabilitas, bukan crash", () => {
    expect(CC).toMatch(/kapPlugin = \[\];/);
  });

  test("ruleset sesi tetap BEKU", () => {
    const cc = require("../agent/broker/commandchain.cjs");
    const rs = cc.sesiRuleset();
    expect(Object.isFrozen(rs)).toBe(true);
    expect(Object.isFrozen(rs.kapabilitas)).toBe(true);
  });

  test("plugin yang tak disetujui DITOLAK admission", () => {
    const cc = require("../agent/broker/commandchain.cjs");
    const rs = cc.buatRuleset({ kapabilitas: ["readFile"] });
    const v = cc.periksa(rs, plugins.kapabilitas("kaggle"));
    expect(v.allow).toBe(false);
    expect(v.alasan).toMatch(/di luar kosakata genesis/);
  });

  test("plugin yang disetujui DIIZINKAN", () => {
    const cc = require("../agent/broker/commandchain.cjs");
    const rs = cc.buatRuleset({ kapabilitas: ["plugin.kaggle"] });
    expect(cc.periksa(rs, "plugin.kaggle").allow).toBe(true);
  });
});
