// Shell terkurung kernel di Windows: WSL + CIFS + bwrap.
//
// KENAPA ADA. Di Windows, tool `bash` hanya bisa MEMINDAI TEKS perintah, dan
// itu terbukti bisa ditembus: perintah yang merakit path saat jalan berhasil
// membuat folder di C:\Users\dave\Desktop dari dalam workspace yang "terkurung".
// Menambah regex hanya memindahkan garis kalahnya.
//
// Jalur ini memberi batas sungguhan tanpa memindahkan berkas: folder TETAP di
// Windows, dibagikan lewat SMB, di-mount ke distro sebagai /work, lalu perintah
// dijalankan di dalam bwrap yang hanya mengikat /work.
//
// Terukur sesudah terpasang:
//   pelarian yang dulu berhasil   -> ENOENT
//   tulis /etc                    -> diblokir
//   jaringan                      -> diblokir
//   200 berkas kecil              -> 3 detik (CIFS) vs 1 detik (lokal)
//
// TIGA JEBAKAN yang dibayar mahal saat membangunnya, dan ketiganya dijaga di
// sini supaya tak kembali:
//   1. `credentials=` TIDAK dibaca klien CIFS distro ini — ditolak tanpa
//      menghasilkan satu pun event logon di Windows. Yang bekerja: user=/pass=.
//   2. wsl.exe MERUSAK baris baru DAN kutip tunggal di dalam argumen, sehingga
//      skrip yang dikirim sebagai argumen sampai dalam keadaan rusak. Skrip
//      harus dikirim lewat stdin sebagai berkas.
//   3. MOUNT HILANG saat distro menganggur, jadi ia harus dipastikan sebelum
//      SETIAP eksekusi — bukan sekali di awal.

const W = require("../agent/tools/wsl-jail.ts");
const T = require("../agent/tools/index.cjs");

const siap = process.platform === "win32" && W.tersedia().siap;
const kalauSiap = siap ? test : test.skip;

describe("wsl-jail: bentuk dan kontraknya", () => {
  test("skrip mount memakai user=/pass=, BUKAN credentials=", () => {
    const src = require("fs").readFileSync(
      require.resolve("../agent/tools/wsl-jail.ts"),
      "utf8",
    );
    const kode = src
      .split("\n")
      .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
      .join("\n");
    // credentials= gagal senyap: ditolak tanpa jejak di log Windows, sehingga
    // penyebabnya mustahil didiagnosis dari sisi mana pun.
    expect(kode).not.toMatch(/credentials=/);
    expect(kode).toMatch(/user=\$U/);
    expect(kode).toMatch(/pass=\$P/);
  });

  test("skrip dikirim lewat stdin, bukan sebagai argumen", () => {
    const src = require("fs").readFileSync(
      require.resolve("../agent/tools/wsl-jail.ts"),
      "utf8",
    );
    // input: SKRIP_MOUNT lewat stdin. Kalau seseorang mengembalikannya jadi
    // argumen, baris baru dan kutipnya rusak lagi dan gejalanya menyesatkan.
    expect(src).toMatch(/input:\s*SKRIP_MOUNT/);
  });

  test("mount dipastikan pada SETIAP eksekusi", () => {
    const src = require("fs").readFileSync(
      require.resolve("../agent/tools/wsl-jail.ts"),
      "utf8",
    );
    const i = src.indexOf("async function jalankan");
    expect(i).toBeGreaterThan(-1);
    // Distro mati saat menganggur dan mount ikut hilang; memasangnya sekali di
    // awal menghasilkan /work kosong yang membingungkan.
    expect(src.slice(i)).toMatch(/pastikanMount\(\)/);
  });

  test("tersedia() melaporkan ALASAN saat tak siap", () => {
    const t = W.tersedia();
    expect(typeof t.siap).toBe("boolean");
    if (!t.siap) expect(String(t.alasan).length).toBeGreaterThan(0);
  });
});

describe("wsl-jail: perilaku nyata", () => {
  kalauSiap(
    "berjalan di /work dan melaporkan penegakan kernel",
    async () => {
      const r = await W.jalankan("pwd");
      expect(r.penegakan).toBe("kernel");
      expect(r.terkurungOs).toBe(true);
      expect(String(r.output).trim()).toBe("/work");
    },
    120000,
  );

  kalauSiap(
    "API berkas BIASA bekerja — bukan lewat request()",
    async () => {
      const r = await W.jalankan(
        "echo isi-uji > _uji_wj.txt && cat _uji_wj.txt && rm -f _uji_wj.txt",
      );
      expect(r.ok).toBe(true);
      expect(String(r.output)).toContain("isi-uji");
    },
    120000,
  );

  kalauSiap(
    "PELARIAN yang terbukti kini diblokir",
    async () => {
      // Persis teknik yang dulu membuat folder di C:\Users\dave\Desktop: path
      // dirakit saat jalan, jadi tak ada token untuk dipindai penjaga teks.
      const kode =
        'node -e "const f=require(String.fromCharCode(102,115));' +
        "try{f.mkdirSync(String.fromCharCode(47,114,111,111,116)+'/X');" +
        "console.log('TEMBUS')}catch(e){console.log('diblokir '+e.code)}\"";
      const r = await W.jalankan(kode);
      expect(String(r.output)).not.toMatch(/TEMBUS/);
    },
    120000,
  );

  kalauSiap(
    "rootfs baca-saja dan jaringan terputus",
    async () => {
      const r = await W.jalankan(
        "touch /etc/_x 2>/dev/null && echo TULIS-TEMBUS || echo tulis-diblokir; " +
          "timeout 4 nc -z -w 3 1.1.1.1 443 2>/dev/null && echo NET-TEMBUS || echo net-diblokir",
      );
      expect(String(r.output)).toMatch(/tulis-diblokir/);
      expect(String(r.output)).toMatch(/net-diblokir/);
    },
    120000,
  );
});

describe("integrasi ke tool bash", () => {
  test("TANPA opt-in, jalur Windows yang dipakai", async () => {
    const WS = require("path").resolve(__dirname, "..");
    const r = await T.runSelfTool(
      "bash",
      { command: 'node -e "console.log(1)"', cwd: WS },
      () => {},
      { workspaceRoot: WS, sessionId: "uji-wsl" },
    );
    // Bawaan tak berubah: memindahkan eksekusi ke sh Linux akan mematahkan
    // setiap perintah PowerShell yang sudah ditulis model.
    expect(r.mekanisme).not.toBe("wsl-bwrap");
  }, 90000);

  test("opt-in dibaca dari WOLFSPACE_BASH_WSL", () => {
    const src = require("fs").readFileSync(
      require.resolve("../agent/tools/index.cjs"),
      "utf8",
    );
    expect(src).toMatch(/WOLFSPACE_BASH_WSL/);
    // Dan penolakannya menyebut sebabnya, bukan sekadar "tak siap".
    expect(src).toMatch(/siap\.alasan/);
  });
});

// Jalan buntu yang sudah diukur, dicatat supaya tak diulang dari nol.
describe("hubungannya dengan AppContainer", () => {
  const src = require("fs").readFileSync(
    require.resolve("../agent/tools/wsl-jail.ts"),
    "utf8",
  );

  test("tercatat bahwa keduanya TIDAK bisa ditumpuk", () => {
    // wsl.exe ditolak di dalam AppContainer (Access is denied), termasuk
    // `wsl --list`. Keduanya dua jalur yang saling meniadakan, bukan dua
    // lapisan yang bisa dipasang bersamaan.
    expect(src).toMatch(/CANNOT BE COMBINED/);
    expect(src).toMatch(/Access is denied/);
  });

  test("tercatat bahwa nilainya BUKAN jaringan, melainkan kernel terpisah", () => {
    // Klaim "wsl-jail satu-satunya yang mengurung jaringan" sudah terbantah:
    // AppContainer menutup jaringan keluar tanpa tambahan apa pun.
    expect(src).toMatch(/A SEPARATE KERNEL/);
    expect(src).toMatch(/NO LONGER ABOUT THE NETWORK/);
  });

  test("tercatat kenapa ia tetap opt-in, bukan bawaan", () => {
    // Alasannya bukan kehati-hatian: ia mengganti BAHASA perintahnya.
    expect(src).toMatch(/POSIX `sh`|POSIX sh/);
    expect(src).toMatch(/WHY IT STAYS OPT-IN/);
  });
});
