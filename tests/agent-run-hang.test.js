// Bug-bug yang membuat run agent DIAM atau MATI, ditemukan lewat run NYATA
// (bukan tebakan) — sesi agent sungguhan dijalankan dengan sampler event-loop
// 10ms dan detektor jeda antar-event.
//
// KENAPA BERKAS INI ADA. Empat bug berbeda, semua menghasilkan gejala yang
// sama dari sudut pandang user: "agent hang" / "semuanya terasa lebih berat".
//
//   1. planner (self_agent.cjs) memanggil model TANPA try/catch dan tanpa
//      fallback provider — beda dengan executor yang punya keduanya. Satu
//      kunci mati di urutan pertama (github 401, terverifikasi lewat run
//      nyata) mematikan SELURUH run 1,2 detik masuk, sebelum executor
//      sempat mencoba.
//   2. mcpClient.getTools() menahan LANGKAH PERTAMA run tanpa satu pun
//      event — diukur 60,3 detik diam penuh saat dua server MCP timeout
//      bersamaan. Tak ada tanda apa pun ke user bahwa agent masih hidup.
//   3. daftar hitam "tolak edit lewat bash" salah-tembak `findstr` (grep
//      Windows, tak pernah menulis), `sed` tanpa -i (juga tak menulis), dan
//      `node -e` APA PUN isinya — termasuk perintah verifikasi paling wajar,
//      `node -e "console.log(1)"`. Dan penolakannya sendiri ber-`ok:true`,
//      jadi lolos sebagai "bukti" ke hallucination guard.
//   4. timeout bash dilaporkan sebagai "DIBATALKAN: dihentikan oleh user" —
//      child.on("error") dengan AbortError selalu menang lebih dulu
//      daripada child.on("close"), untuk KEDUA sumber abort (timeout ATAU
//      pembatalan user), dan dulu tak dibedakan.
//
// Plus satu bug cache yang ditemukan saat menelusuri kenapa `grep` terasa
// berat berulang kali dalam satu sesi (lihat describe cache di bawah).

const fs = require("fs");

describe("planner tahan-gagal, tak lagi satu titik kegagalan untuk seluruh run", () => {
  const SRC = fs
    .readFileSync(require.resolve("../agent/self_agent.cjs"), "utf8")
    .replace(/\r\n/g, "\n");

  // Anchor pertama "kind: \"planner\"" adalah emit AWAL node planner; blok
  // kerjanya (loop fallback + fallback ke checklist default) menyusul persis
  // sesudahnya sampai emit KEDUA "Rencana selesai". Diambil lebar supaya
  // tahan terhadap komentar di sekitarnya, sampai penanda akhir yang pasti.
  const PLANNER = SRC.slice(
    SRC.indexOf('kind: "planner"'),
    SRC.indexOf('arg: "Rencana selesai"'),
  );

  test("panggilan model planner dibungkus try/catch, bukan telanjang", () => {
    expect(PLANNER).toMatch(/for \(let _t = 0; _t < 4; _t\+\+\) \{/);
    expect(PLANNER).toMatch(/try \{/);
    expect(PLANNER).toMatch(/catch \(e\) \{/);
  });

  test("provider gagal berikutnya dicoba, bukan langsung menyerah", () => {
    expect(PLANNER).toMatch(/_planTried\.push\(_planCloud\.provider\)/);
    expect(PLANNER).toMatch(/Object\.keys\(CLOUD_KEYS\)\.find\(/);
    expect(PLANNER).toMatch(/fillCloudKey\(_planCloud\)/);
  });

  test("provider yang BERHASIL dipakai lagi oleh executor (cloud diperbarui)", () => {
    expect(PLANNER).toMatch(
      /if \(_planCloud !== cloud\) \{\s*\n\s*cloud = _planCloud;/,
    );
  });

  test("error non-transient TIDAK memicu percobaan provider lain sia-sia", () => {
    expect(PLANNER).toMatch(
      /if \(!_TRANSIENT_SELF\.test\(\(e && e\.message\) \|\| ""\)\) break;/,
    );
  });

  test("kegagalan TOTAL (semua provider mati) tak melempar — jatuh ke checklist default", () => {
    // reply tetap null kalau loop 4x habis tanpa sukses; lines tetap terisi
    // fallback, planner node tetap RETURN, bukan throw ke luar graph.
    expect(PLANNER).toMatch(/const lines = reply\s*\n?\s*\?/);
    expect(PLANNER).toMatch(
      /if \(lines\.length === 0\) lines\.push\("Jalankan tugas user\."\);/,
    );
  });
});

describe("MCP getTools() tak lagi diam tanpa tanda selama sampai 60 detik", () => {
  const SRC = fs
    .readFileSync(require.resolve("../agent/self_agent.cjs"), "utf8")
    .replace(/\r\n/g, "\n");

  test("detak dikirim SEBELUM dan SELAMA menunggu getTools()", () => {
    const i = SRC.indexOf("mcpClient.getTools()");
    const before = SRC.slice(Math.max(0, i - 500), i);
    expect(before).toMatch(
      /emit\(\{\s*t: "model_wait", m: "Menyiapkan koneksi MCP…" \}\)/,
    );
    expect(before).toMatch(/setInterval\(\(\) => \{/);
  });

  test("interval detak SELALU dibersihkan, sukses maupun gagal (finally)", () => {
    const i = SRC.indexOf("mcpClient.getTools()");
    const around = SRC.slice(Math.max(0, i - 300), i + 100);
    expect(around).toMatch(/\} finally \{\s*\n\s*clearInterval\(_mcpHb\);/);
  });
});

describe("guard bash 'tolak edit' — sempit, bukan cocok nama perintah", () => {
  const { runSelfTool } = require("../agent/tools.cjs");
  const noop = () => {};

  const KASUS_LOLOS = [
    ["node -e verifikasi wajar", 'node -e "console.log(1)"'],
    [
      "findstr — grep Windows, tak pernah menulis",
      "findstr /n foo package.json",
    ],
    ["sed tanpa -i — tak menulis", "echo hai | sed -n '1p'"],
  ];
  test.each(KASUS_LOLOS)(
    "%s: TIDAK ditolak sebagai edit",
    async (_label, cmd) => {
      const r = await runSelfTool(
        "bash",
        { command: cmd, timeout: 5000 },
        noop,
        {},
      );
      expect(r.output || "").not.toMatch(/DILARANG edit file via bash/);
    },
  );

  const KASUS_TOLAK = [
    ["sed -i — in-place, benar-benar menulis", "sed -i 's/a/b/' foo.txt"],
    ["Set-Content — PowerShell write", "Set-Content -Path foo.txt -Value x"],
  ];
  test.each(KASUS_TOLAK)("%s: TETAP ditolak", async (_label, cmd) => {
    const r = await runSelfTool(
      "bash",
      { command: cmd, timeout: 5000 },
      noop,
      {},
    );
    expect(r.output || "").toMatch(/DILARANG edit file via bash/);
    // Dulu ok:true untuk penolakan ini — bug tersendiri: lolos sebagai "bukti"
    // ke hallucination guard dan tak terhitung gagal oleh gerbang item-macet.
    expect(r.ok).toBe(false);
  });
}, 30000);

describe("timeout bash dibedakan dari pembatalan user", () => {
  const { runSelfTool } = require("../agent/tools.cjs");
  const noop = () => {};

  test("perintah yang kelamaan: TIMEOUT, bukan DIBATALKAN", async () => {
    const cmd =
      process.platform === "win32"
        ? 'node -e "setTimeout(function(){}, 8000)"'
        : 'node -e "setTimeout(function(){}, 8000)"';
    const r = await runSelfTool(
      "bash",
      { command: cmd, timeout: 1500 },
      noop,
      {},
    );
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/^TIMEOUT \(1\.5s\):/);
    expect(r.output).not.toMatch(/DIBATALKAN/);
  }, 15000);

  test("pembatalan user SUNGGUHAN: tetap DIBATALKAN, bukan TIMEOUT", async () => {
    const cmd = 'node -e "setTimeout(function(){}, 8000)"';
    let dibatalkan = false;
    const p = runSelfTool(
      "bash",
      { command: cmd, timeout: 20000 }, // timeout SENGAJA jauh — supaya yang
      noop, // menang harus pembatalan, bukan timer timeout
      { isCancelled: () => dibatalkan },
    );
    // cancelCheck (index.cjs) mengecek isCancelled() tiap 1s; nyalakan sesudah
    // start supaya proses sungguhan berjalan dulu, lalu tunggu pengecekan itu.
    await new Promise((r) => setTimeout(r, 1200));
    dibatalkan = true;
    const r = await p;
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/DIBATALKAN/);
    expect(r.output).not.toMatch(/^TIMEOUT/);
  }, 15000);
}, 40000);

describe("cache grep benar-benar mencegah pemindaian ulang, bukan cuma menyimpan hasil", () => {
  // Yang dimata-matai adalah fs.promises.readFile, BUKAN fs.readFileSync.
  // Jalur grep agent sengaja dibuat asinkron (lihat describe berikutnya):
  // di mode Electron ia berjalan di proses pemilik jendela, jadi pembacaan
  // sinkron di sana membekukan UI. Mengintip readFileSync di sini akan selalu
  // menghasilkan nol dan tesnya lulus tanpa membuktikan apa pun.
  let runSelfTool;
  beforeEach(() => {
    jest.resetModules();
    ({ runSelfTool } = require("../agent/tools.cjs"));
  });

  const intipBaca = () => jest.spyOn(require("fs").promises, "readFile");

  test("panggilan KEDUA dengan pola sama: berkas TAK dibaca lagi", async () => {
    const noop = () => {};
    const r1 = await runSelfTool(
      "grep",
      { pattern: "selfAgentStream" },
      noop,
      {},
    );
    expect(r1.ok).toBe(true);

    const spy = intipBaca();
    const r2 = await runSelfTool(
      "grep",
      { pattern: "selfAgentStream" },
      noop,
      {},
    );
    expect(r2.ok).toBe(true);
    expect(r2.output).toBe(r1.output);
    // Dulu qGrep() dipanggil DI LUAR _cachedResult — cache-nya menyimpan hasil
    // tapi tak pernah mencegah kerja mahal terjadi ulang. Sekarang harus 0.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  }, 15000);

  test("pola BERBEDA tetap memindai (bukan cache yang salah-hit)", async () => {
    const noop = () => {};
    await runSelfTool("grep", { pattern: "selfAgentStream" }, noop, {});
    const spy = intipBaca();
    await runSelfTool("grep", { pattern: "qBackup" }, noop, {});
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    spy.mockRestore();
  }, 15000);
});

describe("UI membeku karena PROSES MAIN, bukan renderer", () => {
  // KENAPA ADA. Di mode Electron backend WOLFSPACE tak punya proses sendiri:
  // main.js me-require core.js in-process dan ipcMain "WOLFSPACE:stream"
  // memanggil selfAgentStream() langsung. Proses main itu juga pemilik
  // BrowserWindow dan pemompa antrean pesan Windows — jadi setiap pemindaian
  // SINKRON di tool agent membuat jendela berhenti memompa pesan, dan Windows
  // menandainya "Not Responding".
  //
  // Diukur pada run agent SUNGGUHAN (sampler lag di proses main + CPU profiler):
  //   sebelum : beku 10282ms, 6777ms, 13036ms — renderer sehat (longtask maks 319ms)
  //   profil  : 3271ms RegExp glob + ~11,5 detik readdir + walk disk-tools.cjs
  //   sesudah : satu kejadian 1378ms, dan itu saat STARTUP, bukan saat agent bekerja
  const fs = require("fs");
  const SRC_DISK = fs
    .readFileSync(require.resolve("../agent/tools/disk-tools.cjs"), "utf8")
    .replace(/\r\n/g, "\n");
  const SRC_IDX = fs
    .readFileSync(require.resolve("../agent/tools/index.cjs"), "utf8")
    .replace(/\r\n/g, "\n");
  const SRC_FILE = fs
    .readFileSync(require.resolve("../agent/tools/file-tools.cjs"), "utf8")
    .replace(/\r\n/g, "\n");

  test("penjelajah disk punya varian asinkron", () => {
    for (const f of [
      "diskWalkAsync",
      "diskListAsync",
      "diskGlobAsync",
      "diskGrepAsync",
    ])
      expect(SRC_DISK).toContain("async function " + f);
  });

  test("varian asinkron TIDAK memakai satu pun panggilan *Sync", () => {
    const i = SRC_DISK.indexOf("async function diskWalkAsync");
    expect(i).toBeGreaterThan(-1);
    expect(SRC_DISK.slice(i)).not.toMatch(
      /\b(readdirSync|readFileSync|statSync)\b/,
    );
  });

  test("tool disk yang dipakai agent memanggil varian asinkron", () => {
    for (const p of [
      /await diskListA\(/,
      /await diskGlobA\(/,
      /await diskGrepA\(/,
    ])
      expect(SRC_IDX).toMatch(p);
  });

  test("backup sesi ditunggu, bukan dijalankan sinkron", () => {
    const SRC_AGENT = fs
      .readFileSync(require.resolve("../agent/self_agent.cjs"), "utf8")
      .replace(/\r\n/g, "\n");
    expect(SRC_AGENT).toMatch(/const ensureBackup = async \(\) =>/);
    expect((SRC_AGENT.match(/await ensureBackup\(\)/g) || []).length).toBe(2);
    expect(SRC_AGENT).not.toMatch(/[^t] ensureBackup\(\);/);
  });

  test("hasil asinkron IDENTIK dengan sinkron — kalau tidak, agent lihat dunia berbeda", async () => {
    const d = require("../agent/tools/disk-tools.cjs");
    const dir = require("path").join(__dirname, "..", "agent");
    expect(await d.diskListAsync(dir)).toBe(d.diskList(dir));
    expect(await d.diskGlobAsync(dir, "**/*.cjs")).toBe(
      d.diskGlob(dir, "**/*.cjs"),
    );
    expect(await d.diskGrepAsync(dir, "createSnapshot")).toBe(
      d.diskGrep(dir, "createSnapshot"),
    );
  }, 60000);

  describe("globToRe: pola brace tak lagi gagal diam-diam", () => {
    const { globToRe } = require("../agent/tools/file-tools.cjs");

    test("brace DIPERLUAS, bukan dicocokkan harfiah", () => {
      // Bug lama: {} ikut di-escape, jadi pola ini mencari nama berkas yang
      // benar-benar berisi "{cjs,js}". Hasilnya SELALU nol — dan nol yang
      // salah jauh lebih mahal daripada error, karena agent menyimpulkan
      // foldernya kosong lalu mencoba pola lain berulang kali.
      expect(globToRe("**/*.{cjs,js}").test("agent/tools/index.cjs")).toBe(
        true,
      );
      expect(globToRe("**/*.{cjs,js}").test("a/b.js")).toBe(true);
      expect(globToRe("**/*.{cjs,js}").test("a/b.py")).toBe(false);
    });

    test("`**/` cocok dengan NOL direktori juga", () => {
      expect(globToRe("**/agent/**/*.cjs").test("agent/tools/index.cjs")).toBe(
        true,
      );
      expect(
        globToRe("**/agent/**/*.cjs").test("x/agent/tools/index.cjs"),
      ).toBe(true);
    });

    test("tak ada lagi `.*.*` — sumber backtracking katastrofik", () => {
      expect(globToRe("**/x/**/*.js").source).not.toContain(".*.*");
      const t0 = Date.now();
      globToRe("**/agent/**/*.{cjs,js}").test("a/".repeat(80) + "b.txt");
      expect(Date.now() - t0).toBeLessThan(300);
    });

    test("pola biasa tak berubah perilakunya", () => {
      expect(globToRe("agent/*.cjs").test("agent/self_agent.cjs")).toBe(true);
      expect(globToRe("agent/*.cjs").test("agent/self_agent.py")).toBe(false);
      expect(globToRe("file?.js").test("file1.js")).toBe(true);
      expect(globToRe("file?.js").test("file12.js")).toBe(false);
      expect(globToRe("*.md").test("README.md")).toBe(true);
    });

    test("`{` tanpa pasangan tetap harfiah, tidak melempar", () => {
      expect(() => globToRe("a{b.js")).not.toThrow();
      expect(globToRe("a{b.js").test("a{b.js")).toBe(true);
    });
  });

  test("file-tools juga punya jalur asinkron untuk pemindai pohon source", () => {
    for (const f of [
      "qWalkAsync",
      "qListAsync",
      "qGlobAsync",
      "qGrepAsync",
      "qBackupAsync",
    ])
      expect(SRC_FILE).toContain("async function " + f);
  });
});
