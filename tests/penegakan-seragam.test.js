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

  test("label sandbox_run COCOK dengan mekanisme yang BENAR-BENAR dipakai", async () => {
    const sandbox = require("../agent/sandbox.ts");
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
    //
    // Tapi capabilities() adapter BUKAN LAGI satu-satunya sumber kebenaran.
    // Adapter menjawab untuk mekanismenya sendiri (bwrap, helper JS); ia tak
    // tahu apa-apa soal AppContainer, yang dipasang di lapisan lain dan hanya
    // pada eksekusi yang benar-benar berhasil dibungkus. Sesudah sandbox_run
    // ikut dibungkus, berpegang pada adapter saja membuat label MEREMEHKAN:
    // "penasihat" untuk proses yang sebenarnya ditolak kernel.
    const ac = require("../agent/tools/appcontainer-jail.cjs");
    const pakaiAc =
      process.platform === "win32" &&
      process.env.WOLFSPACE_BASH_AC !== "0" &&
      ac.tersedia().siap;
    const harusTerkurung =
      pakaiAc || (kap ? kap.fsIsolation === "enforced" : false);
    expect(r.terkurungOs).toBe(harusTerkurung);
    if (pakaiAc) expect(r.mekanisme).toBe("appcontainer");
  }, 90000);
});
