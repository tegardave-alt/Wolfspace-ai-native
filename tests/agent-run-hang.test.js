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
  // Modul di-reset supaya cache 30s dari suite lain tak bocor ke sini.
  let runSelfTool;
  beforeEach(() => {
    jest.resetModules();
    ({ runSelfTool } = require("../agent/tools.cjs"));
  });

  test("panggilan KEDUA dengan pola sama: fs.readFileSync TAK dipanggil lagi", async () => {
    const noop = () => {};
    const r1 = await runSelfTool(
      "grep",
      { pattern: "selfAgentStream" },
      noop,
      {},
    );
    expect(r1.ok).toBe(true);

    const fsReal = require("fs");
    const spy = jest.spyOn(fsReal, "readFileSync");
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
    const fsReal = require("fs");
    const spy = jest.spyOn(fsReal, "readFileSync");
    await runSelfTool("grep", { pattern: "qBackup" }, noop, {});
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    spy.mockRestore();
  }, 15000);
});
