// Bug-bug yang membuat run agent DIAM atau MATI, ditemukan lewat run NYATA
// (bukan tebakan) — sesi agent sungguhan dijalankan dengan sampler event-loop
// 10ms dan detektor jeda antar-event.
//
// KENAPA BERKAS INI ADA. Empat bug berbeda, semua menghasilkan gejala yang
// sama dari sudut pandang user: "agent hang" / "semuanya terasa lebih berat".
//
//   1. planner (self_agent.ts) memanggil model TANPA try/catch dan tanpa
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
    .readFileSync(require.resolve("../agent/self_agent.ts"), "utf8")
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
    .readFileSync(require.resolve("../agent/self_agent.ts"), "utf8")
    .replace(/\r\n/g, "\n");

  test("detak dikirim SEBELUM dan SELAMA menunggu getTools()", () => {
    const i = SRC.indexOf("mcpClient.getTools()");
    const before = SRC.slice(Math.max(0, i - 500), i);
    expect(before).toMatch(
      /emit\(\{\s*t: "model_wait", m: "Preparing MCP connection…" \}\)/,
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
    // Batas EKSPLISIT, bukan bawaan 5 detik jest.
    //
    // Uji ini men-spawn proses OS sungguhan, dan sejak bash terkurung
    // AppContainer panggilan PERTAMA di tiap worker menanggung probe
    // ketersediaan: terukur 976 ms lawan 148 ms tanpa container (perintah
    // berikutnya cuma +80 ms). Di bawah jest paralel, 5 detik jadi terlalu
    // ketat dan uji ini gagal ACAK — bukan karena guard-nya salah, melainkan
    // karena waktunya habis. Uji yang merah secara acak lebih buruk daripada
    // uji yang tak ada: orang berhenti mempercayai warnanya.
    30000,
  );

  const KASUS_TOLAK = [
    ["sed -i — in-place, benar-benar menulis", "sed -i 's/a/b/' foo.txt"],
    ["Set-Content — PowerShell write", "Set-Content -Path foo.txt -Value x"],
  ];
  test.each(KASUS_TOLAK)(
    "%s: TETAP ditolak",
    async (_label, cmd) => {
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
    },
    30000,
  );
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
    // cancelCheck (index.ts) mengecek isCancelled() tiap 1s; nyalakan sesudah
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
  //   profil  : 3271ms RegExp glob + ~11,5 detik readdir + walk disk-tools.ts
  //   sesudah : satu kejadian 1378ms, dan itu saat STARTUP, bukan saat agent bekerja
  const fs = require("fs");
  const SRC_DISK = fs
    .readFileSync(require.resolve("../agent/tools/disk-tools.ts"), "utf8")
    .replace(/\r\n/g, "\n");
  const SRC_IDX = fs
    .readFileSync(require.resolve("../agent/tools/index.ts"), "utf8")
    .replace(/\r\n/g, "\n");
  const SRC_FILE = fs
    .readFileSync(require.resolve("../agent/tools/file-tools.ts"), "utf8")
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
      .readFileSync(require.resolve("../agent/self_agent.ts"), "utf8")
      .replace(/\r\n/g, "\n");
    expect(SRC_AGENT).toMatch(/const ensureBackup = async \(\) =>/);
    expect((SRC_AGENT.match(/await ensureBackup\(\)/g) || []).length).toBe(2);
    expect(SRC_AGENT).not.toMatch(/[^t] ensureBackup\(\);/);
  });

  test("hasil asinkron IDENTIK dengan sinkron — kalau tidak, agent lihat dunia berbeda", async () => {
    const d = require("../agent/tools/disk-tools.ts");
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
    const { globToRe } = require("../agent/tools/file-tools.ts");

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

describe("run tak lagi ditutup oleh KALIMAT NIAT saat checklist masih terbuka", () => {
  // KENAPA ADA. Cabang penutup executor memperlakukan "ada content, tak ada
  // tool_calls" sebagai jawaban final dan MENGAKHIRI run — tanpa memeriksa
  // apakah pekerjaannya tuntas. Untuk model yang mengumumkan rencananya dalam
  // prosa sebelum bertindak, satu kalimat niat membunuh run di tengah jalan.
  //
  // Terekam di log run NYATA user (GLM-5.2 via opencode, tugas landing page):
  //   step 5  toolCalls=3                       <- sedang bekerja
  //   step 6  content=176 toolCalls=0  -> stop "text_response_no_tools"
  //   finalSummary: "Saya akan membuat landing page freelance dengan Tailwind…"
  // Checklist masih 0/4. Dua run berbeda berhenti dengan pola yang sama, dan
  // dari layar gejalanya persis "agent berhenti sendiri, todo tak diikuti".
  const fs = require("fs");
  const SRC = fs
    .readFileSync(require.resolve("../agent/self_agent.ts"), "utf8")
    .replace(/\r\n/g, "\n");
  const a = require("../agent/self_agent.ts");

  test("batas dorongan ada, terpisah, dan masuk akal", () => {
    expect(a.SYSTEM_RULES.MAX_CONTINUE_NUDGE).toBeGreaterThanOrEqual(2);
    expect(a.SYSTEM_RULES.MAX_CONTINUE_NUDGE).toBeLessThanOrEqual(5);
    // Penghitungnya HARUS terpisah dari forceRetryCount: penghitung itu sudah
    // dipakai bersama tiga gerbang lain, jadi menumpang di sana membuat dorongan
    // ini kehabisan jatah karena sebab yang tak berhubungan.
    expect(SRC).toMatch(/continueNudge: Annotation\(/);
    expect(SRC).toMatch(/continueNudge: \(state\.continueNudge \|\| 0\) \+ 1/);
  });

  test("gerbang berada SEBELUM cabang yang menutup run", () => {
    const iGate = SRC.indexOf("MAX_CONTINUE_NUDGE\n");
    const iGateUse = SRC.indexOf("SYSTEM_RULES.MAX_CONTINUE_NUDGE");
    const iStop = SRC.indexOf('reason: hasContent ? "text_response_no_tools"');
    expect(iGateUse).toBeGreaterThan(-1);
    expect(iStop).toBeGreaterThan(iGateUse);
  });

  test("hanya untuk jawaban BERISI TEKS — respons hampa punya jalurnya sendiri", () => {
    const i = SRC.indexOf("SYSTEM_RULES.MAX_CONTINUE_NUDGE");
    const blok = SRC.slice(Math.max(0, i - 400), i + 200);
    expect(blok).toMatch(/hasContent &&/);
  });

  test("item TERBUKA dikenali, item selesai/batal tidak", () => {
    // Pola yang dipakai gerbang. [x] tuntas dan [-] dibatalkan bukan pekerjaan
    // tersisa; [!] (gagal berulang) TETAP terbuka — kalau tidak, item yang macet
    // justru jadi alasan menutup run.
    const re = /^\[(?: |→|!)\]/;
    expect(SRC).toMatch(/(state.task_checklist || []).filter/);
    for (const [teks, terbuka] of [
      ["[x] selesai", false],
      ["[-] dibatalkan", false],
      ["[→] sedang dikerjakan", true],
      ["[ ] belum", true],
      ["[!] gagal 3×", true],
    ])
      expect(re.test(teks)).toBe(terbuka);
  });

  test("sesudah batas dorongan, run ditutup TAPI tidak mengaku selesai", () => {
    const i = SRC.indexOf("continue_nudge limit reached");
    expect(i).toBeGreaterThan(-1);
    const blok = SRC.slice(i, i + 500);
    expect(blok).toMatch(/item checklist BELUM tuntas/);
  });
});

describe("respons HAMPA diperlakukan sebagai provider gagal, bukan 'model selesai'", () => {
  // Sebagian provider membalas HTTP 200 dengan badan sah tapi nihil: tanpa
  // content, reasoning, maupun tool_calls. Karena bukan error, ia tak pernah
  // cocok dengan _TRANSIENT_SELF, jadi fallback provider yang sudah ada tak
  // pernah terpicu — padahal akibatnya sama dengan 502.
  //
  // Terukur: GLM-5.2 via opencode mengembalikan 0/0/0 pada 5 dari 6 panggilan
  // dalam satu run, dan run mati dengan "(tidak ada respons dari model)" —
  // menyalahkan model, padahal salurannya yang gagal.
  const fs = require("fs");
  const SRC = fs
    .readFileSync(require.resolve("../agent/self_agent.ts"), "utf8")
    .replace(/\r\n/g, "\n");

  test("ketiganya kosong -> pindah provider", () => {
    const i = SRC.indexOf("An EMPTY response means a broken provider");
    expect(i).toBeGreaterThan(-1);
    const blok = SRC.slice(i, i + 2800);
    expect(blok).toMatch(/!msg\.content &&\s*\n\s*!msg\.reasoning &&/);
    expect(blok).toMatch(/!\(msg\.tool_calls && msg\.tool_calls\.length\)/);
    expect(blok).toMatch(/fillCloudKey\(cloud\)/);
    expect(blok).toMatch(/fallbackCount: state\.fallbackCount \+ 1/);
  });

  test("memakai batas fallback yang SAMA, tak menambah jatah sendiri", () => {
    const i = SRC.indexOf("An EMPTY response means a broken provider");
    const blok = SRC.slice(i, i + 2800);
    expect(blok).toMatch(/state\.fallbackCount < 3/);
  });

  test("provider yang sudah gagal tidak dicoba ulang", () => {
    const i = SRC.indexOf("An EMPTY response means a broken provider");
    const blok = SRC.slice(i, i + 2800);
    expect(blok).toMatch(/failedProviders\.push\(cloud\.provider\)/);
    expect(blok).toMatch(/!failedProviders\.includes\(p\)/);
  });

  test("user DIBERI TAHU, bukan diam-diam berpindah", () => {
    const i = SRC.indexOf("An EMPTY response means a broken provider");
    const blok = SRC.slice(i, i + 2800);
    expect(blok).toMatch(/emit\(\{\s*\n?\s*t: "err"/);
    expect(blok).toMatch(/membalas kosong/);
  });
});
