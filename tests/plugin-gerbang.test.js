// Gerbang plugin: dua titik cekik, dan ARAH kegagalannya.
//
// KENAPA ADA. Versi pertama gerbang ini fail-open, dan lolos dari pembacaan
// biasa karena tiap potongannya masuk akal sendiri-sendiri:
//
//   _dariPlugin() membaca konfigurasi gabungan
//   konfigurasi gabungan hanya memuat plugin yang DISETUJUI
//   -> mencabut izin membuat _dariPlugin() menjawab "bukan plugin"
//   -> pemanggil menyimpulkan "tak perlu digerbang"
//   -> MENCABUT IZIN MEMBUKA GERBANGNYA
//
// Sebabnya satu fungsi menjawab dua pertanyaan berbeda: "apakah ia plugin" dan
// "apakah ia boleh". Tes ini mengunci pemisahan itu.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const P = require("../agent/plugins.cjs");
const SRC_MCP = fs.readFileSync(
  require.resolve("../agent/mcp-client.cjs"),
  "utf8",
);

// Plugin uji dibuat di disk lalu dibersihkan. Tak menyentuh plugin milik user:
// namanya khas, dan berkas persetujuan dipulihkan apa adanya.
// Nama harus lolos validasi manifest sendiri: diawali huruf/angka. Versi
// pertama tes ini memakai "_uji_gerbang" dan ditolak _amanNama() — aturannya
// bekerja, tesnya yang keliru.
const NAMA = "uji-gerbang";
const DIR = path.join(P.DIR_PLUGIN, NAMA);
let setujuAsli = null;
let adaDirAsli = false;

beforeAll(() => {
  adaDirAsli = fs.existsSync(P.DIR_PLUGIN);
  try {
    setujuAsli = fs.readFileSync(P.BERKAS_SETUJU, "utf8");
  } catch (_) {
    setujuAsli = null;
  }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DIR, "manifest.json"),
    JSON.stringify({
      nama: NAMA,
      versi: "0.0.1",
      command: "node",
      args: ["-e", "0"],
      izin: ["network:https"],
    }),
  );
});

afterAll(() => {
  fs.rmSync(DIR, { recursive: true, force: true });
  if (setujuAsli === null) fs.rmSync(P.BERKAS_SETUJU, { force: true });
  else fs.writeFileSync(P.BERKAS_SETUJU, setujuAsli);
  if (!adaDirAsli) {
    try {
      fs.rmdirSync(P.DIR_PLUGIN);
    } catch (_) {}
  }
});

const setujui = (ya) => {
  const kini = new Set(P.disetujui());
  if (ya) kini.add(NAMA);
  else kini.delete(NAMA);
  fs.writeFileSync(P.BERKAS_SETUJU, JSON.stringify([...kini].sort(), null, 2));
};

describe("apakah-ia-plugin TERPISAH dari apakah-ia-boleh", () => {
  test("adalahPlugin() TIDAK bergantung pada persetujuan", () => {
    setujui(true);
    expect(P.adalahPlugin(NAMA)).toBe(true);
    setujui(false);
    // Inilah baris yang menangkap bug fail-open itu: kalau adalahPlugin memakai
    // konfigMcp(), baris ini jadi false dan gerbangnya lepas.
    expect(P.adalahPlugin(NAMA)).toBe(true);
  });

  test("konfigMcp() MEMANG hanya memuat yang disetujui", () => {
    setujui(false);
    expect(Object.keys(P.konfigMcp())).not.toContain(NAMA);
    setujui(true);
    expect(Object.keys(P.konfigMcp())).toContain(NAMA);
  });

  test("mencabut izin tidak boleh membuka gerbang", () => {
    // Sifat gabungannya, dinyatakan langsung: apa pun status persetujuannya,
    // sesuatu yang plugin tetap dikenali sebagai plugin.
    for (const ya of [true, false, true, false]) {
      setujui(ya);
      expect(P.adalahPlugin(NAMA)).toBe(true);
    }
  });
});

describe("gerbang dipasang di DUA titik", () => {
  test("getTools menyembunyikan plugin yang tak diizinkan", () => {
    // Disembunyikan, bukan ditolak: model tak pernah melihat tool-nya, jadi tak
    // ada yang bisa dibujuk untuk memanggilnya.
    expect(SRC_MCP).toMatch(/_izinPlugin\(name\)/);
    expect(SRC_MCP).toMatch(/disembunyikan dari daftar tool/);
  });

  test("callTool memeriksa lagi di titik pemakaian", () => {
    // Daftar tool dibangun sekali per giliran, sementara izin bisa dicabut dan
    // nama tool bisa datang dari riwayat percakapan.
    expect(SRC_MCP).toMatch(/_izinPlugin\(serverName\)/);
  });

  test("penolakan DICATAT ke ledger", () => {
    expect(SRC_MCP).toMatch(/decision: "DENY"/);
  });

  test("_dariPlugin memakai plugins.adalahPlugin, bukan konfigurasi", () => {
    const blok = SRC_MCP.slice(
      SRC_MCP.indexOf("_dariPlugin(nama)"),
      SRC_MCP.indexOf("_izinPlugin(nama)"),
    );
    expect(blok).toMatch(/adalahPlugin\(nama\)/);
    expect(blok).not.toMatch(/_loadConfig\(\)/);
  });

  test("penjaga gagal dimuat -> TOLAK, bukan izinkan", () => {
    const blok = SRC_MCP.slice(
      SRC_MCP.indexOf("_izinPlugin(nama)"),
      SRC_MCP.indexOf("_izinPlugin(nama)") + 900,
    );
    expect(blok).toMatch(/allow: false/);
    expect(blok).toMatch(/Deny-by-default|bukan fail-open/i);
  });
});

describe("plugin menumpang mcp-client, tidak menggandakannya", () => {
  test("plugins.cjs tak punya spawn sendiri", () => {
    // "Pola dua permukaan" sudah berkali-kali menggigit repo ini: dua salinan
    // yang harus diperbaiki bersamaan, salah satunya pasti terlupa.
    const SRC = fs.readFileSync(
      require.resolve("../agent/plugins.cjs"),
      "utf8",
    );
    expect(SRC).not.toMatch(/child_process|spawn\(|fork\(/);
  });

  test("konfigurasi plugin berbentuk sama dengan config/mcp.json", () => {
    setujui(true);
    const c = P.konfigMcp()[NAMA];
    expect(c.command).toBe("node");
    expect(Array.isArray(c.args)).toBe(true);
    expect(c.cwd).toBe(AKAR); // args relatif butuh cwd tetap
    expect(c._plugin).toBe(true);
  });

  test("entri config/mcp.json menang atas plugin bernama sama", () => {
    // Supaya sebuah plugin tak bisa membajak nama server yang sudah user pakai.
    expect(SRC_MCP).toMatch(
      /\.\.\.plug,\s*\.\.\.\(dasar\.mcpServers \|\| \{\}\)/,
    );
  });
});

describe("melebarkan dibekukan, mempersempit selalu boleh", () => {
  // Asimetri ini yang membuat pencabutan berguna. Ditemukan lewat uji nyata:
  // versi pertama gerbang hanya memeriksa genesis, dan karena genesis dibekukan
  // saat sesi mulai, MENCABUT IZIN TIDAK BEREFEK selama proses plugin masih
  // hidup — tool-nya tetap terlihat dan tetap bisa dipanggil. Terukur:
  //
  //   sebelum: izin dicabut -> tool terlihat ["mcp_ujihalo_halo"], panggil ok=true
  //   sesudah: izin dicabut -> tool terlihat [],                   panggil ok=false
  //
  // Pengaman yang hanya bekerja lewat satu jalur (endpoint yang kebetulan juga
  // mematikan proses) bukan pengaman.
  test("_izinPlugin memeriksa genesis DAN berkas persetujuan", () => {
    const blok = SRC_MCP.slice(
      SRC_MCP.indexOf("_izinPlugin(nama) {"),
      SRC_MCP.indexOf("async connectServer"),
    );
    expect(blok).toMatch(/cc\.periksa\(cc\.sesiRuleset\(\)/); // genesis
    expect(blok).toMatch(/P\.disetujui\(\)\.includes/); // pencabutan
    // Urutannya penting: genesis dulu. Kalau berkas persetujuan yang menentukan
    // lebih dulu, menambah nama ke berkas akan melebarkan izin tanpa restart.
    expect(blok.indexOf("sesiRuleset")).toBeLessThan(
      blok.indexOf("disetujui()"),
    );
  });

  test("alasan pencabutan terbaca manusia", () => {
    expect(SRC_MCP).toMatch(/izin plugin dicabut user/);
  });
});

describe("menulis konfigurasi memakai isi berkas, bukan gabungan", () => {
  // KENAPA ADA. _loadConfig() mengembalikan GABUNGAN berkas + plugin. addServer()
  // dan removeServer() membacanya lalu menulis balik SELURUHNYA lewat
  // _saveConfig(). Tanpa pemisahan ini, menambah satu server MCP dari UI akan
  // memanggang setiap plugin yang disetujui ke dalam config/mcp.json — lengkap
  // dengan penanda _plugin.
  //
  // Akibatnya plugin punya dua rumah, dan yang di config/mcp.json menang
  // (lihat urutan penggabungan). Plugin dicopot dari halaman Plugins pun entri
  // bayangannya tetap tinggal di berkas, hidup, tanpa ada yang tahu asalnya.
  // Kelas kesalahan yang sama dengan skills.cjs: config mati yang bertahan.
  test("addServer & removeServer membaca _loadConfigMentah()", () => {
    for (const nama of ["addServer", "removeServer", "toggleServer"]) {
      const i = SRC_MCP.indexOf(nama + "(name");
      expect(i).toBeGreaterThan(-1);
      const blok = SRC_MCP.slice(i, i + 700);
      expect(blok).toMatch(/_loadConfigMentah\(\)/);
      // Gabungan tak boleh dipakai di jalur yang menulis.
      expect(blok).not.toMatch(/const config = this\._loadConfig\(\);/);
    }
  });

  test("toggleServer menolak plugin dengan jelas, bukan diam", () => {
    // Hidup-matinya plugin ditentukan PERSETUJUAN di halaman Plugins, bukan
    // sakelar disabled di config/mcp.json. Tanpa pesan ini, sakelarnya tampak
    // rusak.
    const i = SRC_MCP.indexOf("async toggleServer(");
    const blok = SRC_MCP.slice(i, i + 1100);
    expect(blok).toMatch(/_dariPlugin\(name\)/);
    expect(blok).toMatch(/halaman Plugins/);
  });

  test("_loadConfigMentah TIDAK menyentuh plugin", () => {
    const i = SRC_MCP.indexOf("_loadConfigMentah() {");
    const blok = SRC_MCP.slice(i, SRC_MCP.indexOf("_loadConfig() {", i));
    expect(blok).not.toMatch(/plugins\.cjs|konfigMcp/);
  });

  test("penanda _plugin tak pernah ditulis ke berkas", () => {
    // Penjaga arah: satu-satunya tempat _plugin muncul adalah hasil gabungan
    // di memori, bukan sesuatu yang bisa mendarat di disk.
    const i = SRC_MCP.indexOf("_saveConfig(");
    const blok = SRC_MCP.slice(i, i + 400);
    expect(blok).not.toMatch(/_plugin/);
  });
});
