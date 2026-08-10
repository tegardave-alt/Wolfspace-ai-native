// Shell mentah MATI secara bawaan. Menyalakannya harus jadi pilihan sadar.
//
// KENAPA DIBALIK. Tugas utama pengurungan adalah "agent tidak keluar dari
// workspace". Di Windows itu tak bisa dijamin selama shell mentah ada:
//
//   bash + path ditulis langsung     ditahan
//   bash + path dirakit saat jalan   MENEMBUS — folder dibuat di Desktop
//   sandbox_run + path dirakit       MENEMBUS
//
// Penjaganya memindai TEKS perintah, dan teks tak pernah tahu apa yang dirakit
// saat jalan. Memperketat pemindainya hanya memindahkan garis kalahnya.
//
// Yang TERBUKTI mengurung ke workspace di Windows hanya capability_exec:
//   tulis di DALAM workspace lewat request()   berhasil
//   tulis di LUAR lewat request()              ditolak Policy
//   fs langsung di luar                        ERR_ACCESS_DENIED
//   spawn proses                               ERR_ACCESS_DENIED
//
// Uji ini menjalankan proses ANAK dengan env-nya sendiri, karena ruleset
// dibekukan sekali per proses — menyetel env di tengah jest tak berpengaruh.
// (Suite ini sendiri berjalan dengan WOLFSPACE_SHELL=1 lewat tests/_setup-shell.cjs,
// karena uji lain memang perlu menguji perilaku bash.)

const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

const PROBE = `
  const T = require(${JSON.stringify(path.join(ROOT, "agent/tools/index.cjs"))});
  (async () => {
    const ctx = { workspaceRoot: ${JSON.stringify(ROOT)}, sessionId: "uji" };
    const out = {};
    const coba = async (nama, tool, args) => {
      try {
        const r = await T.runSelfTool(tool, args, () => {}, ctx);
        out[nama] = { ok: !!(r && r.ok), pesan: String((r && r.output) || "").slice(0, 300) };
      } catch (_) { out[nama] = { ok: false, pesan: "lempar" }; }
    };
    await coba("bash", "bash", { command: 'node -e "console.log(1)"', cwd: ${JSON.stringify(ROOT)} });
    await coba("sandbox_run", "sandbox_run", { command: 'node -e "console.log(2)"' });
    await coba("capability_exec", "capability_exec", { code: "return 6*7;" });
    process.stdout.write("<<J>>" + JSON.stringify(out) + "<</J>>");
    process.exit(0);
  })();
`;

function jalankan(env) {
  let keluar = "";
  try {
    keluar = execFileSync(process.execPath, ["-e", PROBE], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 180000,
      env: {
        ...process.env,
        WOLFSPACE_SHELL: "",
        WOLFSPACE_CC_TANPA: "",
        ...env,
      },
    });
  } catch (e) {
    keluar = (e.stdout || "").toString();
  }
  const m = keluar.match(/<<J>>([\s\S]*?)<<\/J>>/);
  if (!m) throw new Error("probe tak melapor: " + keluar.slice(-200));
  return JSON.parse(m[1]);
}

describe("shell mentah mati secara bawaan", () => {
  test("TANPA env apa pun: bash dan sandbox_run DITOLAK", () => {
    const r = jalankan({});
    expect(r.bash.ok).toBe(false);
    expect(r.sandbox_run.ok).toBe(false);
  }, 200000);

  test("capability_exec TETAP hidup — bawaan ini bukan mematikan agent", () => {
    // Kalau jalur terkurung ikut mati, bawaan ini akan dimatikan pemakainya
    // dalam sehari, dan pengurungannya kembali nol.
    const r = jalankan({});
    expect(r.capability_exec.ok).toBe(true);
  }, 200000);

  test("pesan penolakan MENYEBUTKAN cara menyalakannya", () => {
    // Tanpa ini, agent dan user cuma melihat "ditolak" tanpa jalan keluar —
    // dan larangan yang tak bisa dibuka akan dibuka paksa dengan cara lain.
    const r = jalankan({});
    expect(r.bash.pesan).toMatch(/WOLFSPACE_SHELL=1/);
    expect(r.bash.pesan).toMatch(/capability_exec/);
    expect(r.sandbox_run.pesan).toMatch(/WOLFSPACE_SHELL=1/);
  }, 200000);

  test("WOLFSPACE_SHELL=1 mengembalikannya — pilihan sadar, bukan bawaan", () => {
    const r = jalankan({ WOLFSPACE_SHELL: "1" });
    expect(r.bash.ok).toBe(true);
    expect(r.sandbox_run.ok).toBe(true);
  }, 200000);

  test("WOLFSPACE_CC_TANPA=proc.raw tetap menang atas WOLFSPACE_SHELL=1", () => {
    // Pencabutan eksplisit harus lebih kuat daripada penyalaan. Kalau tidak,
    // lockdown yang diminta operator bisa dibatalkan variabel lain.
    const r = jalankan({
      WOLFSPACE_SHELL: "1",
      WOLFSPACE_CC_TANPA: "proc.raw",
    });
    expect(r.bash.ok).toBe(false);
    expect(r.sandbox_run.ok).toBe(false);
  }, 200000);
});
