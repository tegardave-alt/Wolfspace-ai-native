// net_diag: kapabilitas bernama, bukan shell.
//
// KENAPA BENTUKNYA BEGINI. Sepanjang sesi ini terbukti berulang bahwa penjaga
// yang MEMINDAI TEKS PERINTAH selalu bisa dilewati — path yang dirakit saat
// jalan tak punya token untuk dipindai, dan menambah regex hanya memindahkan
// garis kalahnya.
//
// Tool ini membalik bentuknya: ia tak menerima perintah sama sekali. Pemanggil
// memilih OPERASI dari daftar tetap dan memberi parameter yang divalidasi;
// argv-nya dibangun tool ini sendiri, lalu dilewatkan sebagai ARRAY ke
// execFile — tak ada shell yang menguraikannya di jalan.
//
// Akibatnya batas itu bukan tebakan atas string, melainkan sifat dari bentuk
// data yang diterima. Tak ada yang bisa dirakit, karena tak ada tempat untuk
// merakitnya.

const N = require("../agent/tools/net-diag.ts");
const T = require("../agent/tools/index.ts");
const { SELF_TOOLS } = require("../agent/tools/tool-definitions.ts");

const adaWsl = process.platform === "win32";
const kalauWsl = adaWsl ? test : test.skip;

describe("net_diag: bentuknya menutup, bukan penjaganya", () => {
  test("operasi di luar daftar DITOLAK", async () => {
    for (const jahat of ["rm -rf /", "ping; ls", "", "Ping", "../ping"]) {
      const r = await N.jalankan({ operasi: jahat, host: "1.1.1.1" });
      expect(r.ok).toBe(false);
      expect(String(r.output)).toMatch(/not recognised/);
    }
  });

  test("host yang mengandung apa pun selain domain/IP DITOLAK", async () => {
    // Tak satu pun dari ini boleh sampai ke argv. Kalaupun sampai, execFile
    // dengan array tak akan menguraikannya — tapi menolak lebih awal membuat
    // pesannya berguna, bukan kegagalan misterius di lapisan bawah.
    const jahat = [
      "1.1.1.1; rm -rf /",
      "1.1.1.1 && whoami",
      "$(whoami)",
      "`id`",
      "a b",
      "http://1.1.1.1",
      "1.1.1.1/../etc",
      "-oProxyCommand=x",
      "'; DROP--",
    ];
    for (const h of jahat) {
      const r = await N.jalankan({ operasi: "ping", host: h });
      expect(r.ok).toBe(false);
      expect(String(r.output)).toMatch(/invalid host/);
    }
  });

  test("port di luar 1-65535 DITOLAK", async () => {
    // "80" TIDAK ada di daftar ini dan itu disengaja: model sering mengirim
    // angka sebagai teks, dan Number("80") -> 80 lolos validasi rentang yang
    // sama. Menolaknya akan menghasilkan kegagalan yang membingungkan tanpa
    // menambah satu pun jaminan — nilainya tetap harus bilangan bulat dalam
    // rentang sebelum masuk argv.
    for (const p of [0, -1, 70000, 1.5, null, "abc", "1; ls"]) {
      const r = await N.jalankan({ operasi: "port", host: "1.1.1.1", port: p });
      expect(r.ok).toBe(false);
      expect(String(r.output)).toMatch(/invalid port/);
    }
  });

  test('port berbentuk teks angka ("80") DITERIMA sebagai 80', () => {
    // Bukan kelonggaran keamanan: yang masuk argv tetap String(80).
    const argv = N.OPERASI.port.argv({ host: "1.1.1.1", port: Number("80") });
    expect(argv).toEqual(["nc", "-z", "-w", "4", "1.1.1.1", "80"]);
  });

  test("argv dibangun tool, bukan disumbang pemanggil", () => {
    // Inti rancangannya. Kalau suatu saat ada operasi yang meneruskan teks
    // pemanggil apa adanya ke argv, baris ini yang merah.
    for (const [nama, spek] of Object.entries(N.OPERASI)) {
      const argv = spek.argv({ host: "contoh.test", port: 443 });
      expect(Array.isArray(argv)).toBe(true);
      // Tak boleh ada argumen yang berisi metakarakter shell — kalau ada,
      // berarti sesuatu digabung sebagai string, bukan dibangun sebagai array.
      for (const a of argv) {
        expect(typeof a).toBe("string");
        expect(a).not.toMatch(/[;&|`$><]/);
      }
      expect(argv[0]).toBeTruthy();
      expect(nama).toBeTruthy();
    }
  });

  test("terdaftar sebagai tool, dengan enum operasi", () => {
    const t = SELF_TOOLS.find(
      (x) => x.function && x.function.name === "net_diag",
    );
    expect(t).toBeTruthy();
    const p = t.function.parameters.properties;
    // enum penting: model tak perlu menebak, dan nilai di luar daftar ditolak
    // sebelum sampai ke kode.
    expect(Array.isArray(p.operasi.enum)).toBe(true);
    expect(p.operasi.enum).toEqual(
      expect.arrayContaining(["ping", "rute", "port"]),
    );
    expect(t.function.parameters.required).toContain("operasi");
  });

  kalauWsl(
    "jalan NYATA lewat runSelfTool dan melaporkan penegakan",
    async () => {
      const r = await T.runSelfTool("net_diag", { operasi: "rute" }, () => {}, {
        sessionId: "uji-netdiag",
      });
      expect(r.penegakan).toBe("kernel");
      expect(r.terkurungOs).toBe(true);
      if (r.ok) expect(String(r.output).length).toBeGreaterThan(0);
    },
    60000,
  );

  kalauWsl(
    "port tertutup dijawab, bukan didiamkan",
    async () => {
      // `nc -z` tak mencetak apa pun; jawabannya hanya di kode keluar.
      // Mengembalikan "(tak ada keluaran)" akan membuat tool tampak bekerja
      // sambil tak menjawab pertanyaannya.
      const r = await N.jalankan({ operasi: "port", host: "1.1.1.1", port: 9 });
      expect(String(r.output)).toMatch(/OPEN|closed/);
    },
    60000,
  );
});
