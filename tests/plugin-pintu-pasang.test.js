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
const plugins = require("../agent/plugins.ts");

describe("pintu pemasangan bukan milik model", () => {
  const DEF = fs.readFileSync(
    require.resolve("../agent/tools/tool-definitions.ts"),
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
    expect(DEF).toMatch(/skill_install is WITHDRAWN/);
    expect(DEF).toMatch(/EXECUTION_TOOLS/);
  });

  test("implementasinya SENGAJA tetap hidup untuk UI", () => {
    // Yang dicabut pintunya ke model, bukan fungsinya. UI (dan jalur HITL nanti)
    // masih perlu memanggil ini.
    const IDX = fs.readFileSync(
      require.resolve("../agent/tools/index.ts"),
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
    // Inti bedanya dengan skills.ts, yang me-require plugin ke proses main.
    const SRC = fs.readFileSync(require.resolve("../agent/plugins.ts"), "utf8");
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
    const SRC = fs.readFileSync(require.resolve("../agent/plugins.ts"), "utf8");
    expect(SRC).toMatch(/ada\.has\(n\)/);
  });
});

describe("kapabilitas plugin masuk genesis, sekali, saat dibekukan", () => {
  const CC = fs.readFileSync(
    require.resolve("../agent/broker/commandchain.ts"),
    "utf8",
  );

  test("sesiRuleset menyertakan kapabilitas yang disetujui", () => {
    expect(CC).toMatch(/kapabilitasDisetujui\(\)/);
    expect(CC).toMatch(/KOSAKATA_DEFAULT\.concat\(kapPlugin\)/);
  });

  test("kegagalan memuat plugins.ts -> nol kapabilitas, bukan crash", () => {
    expect(CC).toMatch(/kapPlugin = \[\];/);
  });

  test("ruleset sesi tetap BEKU", () => {
    const cc = require("../agent/broker/commandchain.ts");
    const rs = cc.sesiRuleset();
    expect(Object.isFrozen(rs)).toBe(true);
    expect(Object.isFrozen(rs.kapabilitas)).toBe(true);
  });

  test("plugin yang tak disetujui DITOLAK admission", () => {
    const cc = require("../agent/broker/commandchain.ts");
    const rs = cc.buatRuleset({ kapabilitas: ["readFile"] });
    const v = cc.periksa(rs, plugins.kapabilitas("kaggle"));
    expect(v.allow).toBe(false);
    // Wording follows the source: commandchain migrated to TypeScript and its
    // messages are English now. What is guarded is unchanged — the denial must
    // say the capability is outside the frozen genesis vocabulary.
    expect(v.alasan).toMatch(/outside the genesis vocabulary/);
  });

  test("plugin yang disetujui DIIZINKAN", () => {
    const cc = require("../agent/broker/commandchain.ts");
    const rs = cc.buatRuleset({ kapabilitas: ["plugin.kaggle"] });
    expect(cc.periksa(rs, "plugin.kaggle").allow).toBe(true);
  });
});

describe("pasang & copot: pintu user, dengan penjaga jalur", () => {
  const os = require("os");
  let setujuAsli = null;
  let adaDirAsli = false;
  const N = "ujipasangtes";

  beforeAll(() => {
    adaDirAsli = fs.existsSync(plugins.DIR_PLUGIN);
    try {
      setujuAsli = fs.readFileSync(plugins.BERKAS_SETUJU, "utf8");
    } catch (_) {
      setujuAsli = null;
    }
  });
  afterEach(() => {
    fs.rmSync(path.join(plugins.DIR_PLUGIN, N), {
      recursive: true,
      force: true,
    });
  });
  afterAll(() => {
    if (setujuAsli === null) fs.rmSync(plugins.BERKAS_SETUJU, { force: true });
    else fs.writeFileSync(plugins.BERKAS_SETUJU, setujuAsli);
    if (!adaDirAsli) {
      try {
        fs.rmdirSync(plugins.DIR_PLUGIN);
      } catch (_) {}
    }
  });

  test("nama dengan pemisah path DITOLAK sebelum menyentuh disk", () => {
    // "../keluar" akan menulis di luar plugins/ dan menimpa berkas lain.
    for (const n of ["../keluar", "a/b", "..\naik", "/mutlak"]) {
      const r = plugins.pasang({ nama: n, command: "node" });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/invalid name/);
    }
  });

  test("perintah wajib — tak ada plugin tanpa cara menjalankannya", () => {
    expect(plugins.pasang({ nama: N, command: "" }).ok).toBe(false);
  });

  test("izin asing ditolak saat memasang, bukan saat memanggil", () => {
    const r = plugins.pasang({ nama: N, command: "node", izin: ["root.all"] });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/root\.all/);
  });

  test("memasang TIDAK memberi izin", () => {
    // Inti pemisahan dua pintu: memasang dan menyetujui adalah dua tindakan.
    expect(
      plugins.pasang({
        nama: N,
        command: "npx",
        args: ["-y", "@contoh/mcp"],
        izin: ["network:https"],
      }).ok,
    ).toBe(true);
    expect(plugins.disetujui()).not.toContain(N);
    expect(plugins.kapabilitasDisetujui()).not.toContain("plugin." + N);
  });

  test("tak menimpa plugin yang sudah ada", () => {
    expect(plugins.pasang({ nama: N, command: "node" }).ok).toBe(true);
    const r = plugins.pasang({ nama: N, command: "lain" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already installed/);
  });

  test("copot membuang persetujuannya juga", () => {
    // Kalau tidak, memasang ulang plugin bernama sama mewarisi izin lama
    // diam-diam — user mengira ia memasang sesuatu yang belum diberi apa-apa.
    plugins.pasang({ nama: N, command: "node", izin: ["network:https"] });
    fs.writeFileSync(
      plugins.BERKAS_SETUJU,
      JSON.stringify(plugins.disetujui().concat([N])),
    );
    expect(plugins.disetujui()).toContain(N);

    expect(plugins.copot(N).ok).toBe(true);
    expect(fs.existsSync(path.join(plugins.DIR_PLUGIN, N))).toBe(false);
    expect(plugins.disetujui()).not.toContain(N);
  });

  test("copot menolak nama berbahaya", () => {
    expect(plugins.copot("../..").ok).toBe(false);
  });

  test("pemasangan tak pernah mengunduh atau menyalin kode", () => {
    // skill_install dulu menerima URL. Jalur itu sengaja tak dihidupkan lagi:
    // yang ditulis hanya manifest, yaitu CARA MENJALANKAN sesuatu yang sudah ada.
    const SRC = fs.readFileSync(require.resolve("../agent/plugins.ts"), "utf8");
    expect(SRC).not.toMatch(/https?:\/\/|fetch\(|https\.get|copyFileSync/);
  });
});
