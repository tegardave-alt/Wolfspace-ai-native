// capability_exec harus mengikuti workspace yang SEDANG AKTIF.
//
// KENAPA ADA. Policy-nya dulu dibangun dari WORKSPACE global — satu folder tetap
// di dalam pohon WOLFSPACE sendiri (QROOT/workspace) — bukan dari
// context.workspaceRoot yang dipakai read/write/edit/bash tepat di atasnya.
// Salah di DUA arah sekaligus, dan terukur begitu:
//     sebelum: baca berkas proyek sendiri     -> DITOLAK
//              baca workspace WOLFSPACE       -> BISA (bocor)
//     sesudah: baca berkas proyek sendiri     -> BISA
//              baca workspace WOLFSPACE       -> DITOLAK
// Jadi bukan cuma kebocoran: di mode ww, capability_exec praktis tak bisa
// dipakai pada berkas yang justru menjadi tugasnya.
//
// Kebocorannya penting karena arahnya masuk ke pohon WOLFSPACE — agent yang
// dikurung ke proyek orang lain tetap bisa menyentuh folder kerja WOLFSPACE.

process.env.WOLFSPACE_ZONE_WSL = "0"; // fork, supaya tak spawn wsl.exe per zona

const fs = require("fs");
const os = require("os");
const path = require("path");
const { runSelfTool } = require("../agent/tools/index.ts");

const QROOT = path.resolve(__dirname, "..");
const WS_GLOBAL = path.join(QROOT, "workspace");

describe("cakupan capability_exec mengikuti workspace aktif", () => {
  let PROYEK, DI_PROYEK, DI_GLOBAL;

  beforeAll(() => {
    PROYEK = fs.mkdtempSync(path.join(os.tmpdir(), "cakupan-ww-"));
    DI_PROYEK = path.join(PROYEK, "punya-proyek.txt");
    DI_GLOBAL = path.join(WS_GLOBAL, "_uji_cakupan_bocor.txt");
    fs.writeFileSync(DI_PROYEK, "ISI-PROYEK");
    fs.mkdirSync(WS_GLOBAL, { recursive: true });
    fs.writeFileSync(DI_GLOBAL, "ISI-WOLFSPACE");
  });

  afterAll(() => {
    try {
      fs.rmSync(DI_GLOBAL, { force: true });
    } catch (_) {}
    try {
      fs.rmSync(PROYEK, { recursive: true, force: true });
    } catch (_) {}
  });

  const baca = (target, context) =>
    runSelfTool(
      "capability_exec",
      {
        code: `try { return "BISA:" + (await request("readFile", { path: ${JSON.stringify(target)} })) } catch (e) { return "DITOLAK" }`,
        timeout: 25000,
      },
      () => {},
      context,
      // Baris nilai dicari EKSPLISIT, bukan diambil dari ujung. Keluaran
      // capability_exec bisa membawa baris lain di belakang — mis. penanda
      // "[TANPA PENGURUNGAN JARINGAN]" saat zona jalan tanpa netns, yang di
      // Windows tanpa WSL memang selalu muncul. Mengambil baris terakhir
      // membuat uji ini merah karena alasan yang tak ada hubungannya.
    ).then(
      (r) =>
        String(r.output)
          .split("\n")
          .filter((l) => /^(BISA:|DITOLAK$)/.test(l.trim()))
          .pop() || "(tak ada baris nilai) " + r.output,
    );

  test("BISA membaca berkas di dalam workspace yang dikurung", async () => {
    const h = await baca(DI_PROYEK, { workspaceRoot: PROYEK });
    expect(h).toMatch(/BISA:ISI-PROYEK/);
  }, 40000);

  test("DITOLAK membaca pohon WOLFSPACE dari agent yang dikurung", async () => {
    // Inti kebocoran lamanya. Kalau ini merah, pengurungan ww bisa dilewati
    // hanya dengan memakai capability_exec alih-alih read/write.
    const h = await baca(DI_GLOBAL, { workspaceRoot: PROYEK });
    expect(h).toBe("DITOLAK");
  }, 40000);

  test("WW_WORKSPACE_ROOT dihormati juga, bukan cuma context", async () => {
    // Jalur kedua yang dipakai tool lain di berkas ini; kalau hanya context
    // yang dibaca, pemanggil lewat env akan diam-diam memakai cakupan global.
    const lama = process.env.WW_WORKSPACE_ROOT;
    process.env.WW_WORKSPACE_ROOT = PROYEK;
    try {
      const h = await baca(DI_PROYEK, {});
      expect(h).toMatch(/BISA:ISI-PROYEK/);
    } finally {
      if (lama === undefined) delete process.env.WW_WORKSPACE_ROOT;
      else process.env.WW_WORKSPACE_ROOT = lama;
    }
  }, 40000);

  test("tanpa pengurungan, perilaku lama dipertahankan", async () => {
    // Mode default (tak ada ww) tak boleh berubah — di sana WORKSPACE global
    // memang cakupan yang benar.
    const h = await baca(DI_GLOBAL, {});
    expect(h).toMatch(/BISA:ISI-WOLFSPACE/);
  }, 40000);

  test("urutan sumber cakupan sama dengan tool lain di berkas ini", () => {
    // Penjaga struktural: kalau nanti ada yang menyalin blok ini, urutannya
    // harus tetap context -> env -> global.
    const SRC = fs.readFileSync(
      require.resolve("../agent/tools/index.ts"),
      "utf8",
    );
    const i = SRC.indexOf('name === "capability_exec"');
    expect(i).toBeGreaterThan(-1);
    const blok = SRC.slice(i, i + 1600);
    expect(blok).toMatch(/context && context\.workspaceRoot/);
    expect(blok).toMatch(/WW_WORKSPACE_ROOT/);
    expect(
      blok.indexOf("context.workspaceRoot") < blok.indexOf("WW_WORKSPACE_ROOT"),
    ).toBe(true);
  });
});
