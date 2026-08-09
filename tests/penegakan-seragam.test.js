// Ketiga jalur eksekusi menjawab pertanyaan yang SAMA dengan kosakata yang sama.
//
// SEBELUMNYA tiap jalur tumbuh sendiri:
//   bash         -> "namespace" / "regex"
//   zona         -> "bwrap" / "unshare"
//   sandbox_run  -> tak melaporkan apa pun
//
// Tiga kosakata untuk satu pertanyaan berarti pemanggil harus tahu ia sedang
// bicara dengan jalur yang mana — persis yang seharusnya tidak perlu diketahui,
// dan persis yang membuat deskriptor TPC mustahil ditulis.
//
// sandbox_run yang paling parah: deskripsinya sendiri sudah mengaku "the spawned
// process itself has normal OS-level filesystem and network access, so this is
// NOT a security boundary" — tapi pengakuan itu hanya ada di teks untuk model,
// tak ada di hasil, tempat ia bisa diperiksa mesin.

const path = require("path");
const T = require("../agent/tools/index.cjs");
const P = require("../agent/penegakan.cjs");

const WS = path.resolve(__dirname, "..");
const ctx = { workspaceRoot: WS, sessionId: "uji-seragam" };
const PENEGAK = ["kernel", "runtime", "penasihat"];

describe("kosakata penegakan seragam", () => {
  test("label() menurunkan terkurungOs, bukan menerimanya", () => {
    expect(P.label("kernel", "bwrap").terkurungOs).toBe(true);
    expect(P.label("runtime", "--permission").terkurungOs).toBe(false);
    expect(P.label("penasihat", "regex").terkurungOs).toBe(false);
    // Tak ada jalan menyuntik terkurungOs yang bertentangan dengan penegakannya.
    expect(Object.keys(P.label("kernel", "x")).sort()).toEqual([
      "mekanisme",
      "penegakan",
      "terkurungOs",
    ]);
  });

  test("dariAdapter menerjemahkan capabilities() apa adanya", () => {
    expect(P.dariAdapter({ fsIsolation: "enforced" }, "bwrap")).toEqual({
      penegakan: "kernel",
      mekanisme: "bwrap",
      terkurungOs: true,
    });
    expect(P.dariAdapter({ fsIsolation: "advisory" }).penegakan).toBe(
      "penasihat",
    );
    expect(P.dariAdapter({ fsIsolation: "none" }).penegakan).toBe("penasihat");
    // Tak diketahui HARUS jatuh ke arah yang lebih lemah. Salah menebak ke arah
    // lebih kuat menghasilkan jaminan palsu — kegagalan yang jauh lebih mahal.
    expect(P.dariAdapter(null).penegakan).toBe("penasihat");
    expect(P.dariAdapter(null).terkurungOs).toBe(false);
  });

  test("bash melaporkan label lengkap pada sukses DAN penolakan", async () => {
    for (const cmd of ['node -e "console.log(1)"', "ls ../Desktop"]) {
      const r = await T.runSelfTool(
        "bash",
        { command: cmd, cwd: WS },
        () => {},
        ctx,
      );
      expect(PENEGAK).toContain(r.penegakan);
      expect(typeof r.mekanisme).toBe("string");
      expect(r.terkurungOs).toBe(r.penegakan === "kernel");
    }
  }, 90000);

  test("sandbox_run melaporkan label yang sama", async () => {
    const r = await T.runSelfTool(
      "sandbox_run",
      { command: 'node -e "console.log(2)"' },
      () => {},
      ctx,
    );
    expect(PENEGAK).toContain(r.penegakan);
    expect(typeof r.mekanisme).toBe("string");
    expect(r.terkurungOs).toBe(r.penegakan === "kernel");
  }, 90000);

  test("label sandbox_run COCOK dengan capabilities() adapter", async () => {
    const sandbox = require("../agent/sandbox.cjs");
    const kap = sandbox.adapterCapabilities();
    const r = await T.runSelfTool(
      "sandbox_run",
      { command: 'node -e "console.log(3)"' },
      () => {},
      ctx,
    );
    // Bukan tebakan dari process.platform — tebakan itu akan salah persis di
    // kasus yang paling penting: Linux TANPA bwrap terbaca sama dengan Linux
    // DENGAN bwrap.
    expect(r.terkurungOs).toBe(kap ? kap.fsIsolation === "enforced" : false);
  }, 90000);
});
