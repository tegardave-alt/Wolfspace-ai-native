// WOLFSPACE_CC_TANPA=proc.raw harus menutup SEMUA pintu spawn proses, bukan satu.
//
// KENAPA ADA. Pencabutan proc.raw sudah lama tersedia dan bekerja untuk bash —
// tapi sandbox_run tak pernah melewati CommandChain sama sekali. Terukur:
//
//   WOLFSPACE_CC_TANPA=proc.raw
//     bash biasa                 DITOLAK
//     bash + pelarian terbukti   DITOLAK
//     sandbox_run                ok        <- dan berhasil membuat folder
//                                             di C:\Users\dave\Desktop
//
// Lockdown yang menutup satu pintu sambil meninggalkan pintu sebelahnya terbuka
// bukan lockdown; ia memindahkan jalannya. Dan itu LEBIH BURUK daripada tak ada
// lockdown, karena orang mengira sesi sudah dikunci lalu berhenti waspada — pola
// yang sama dengan "TERKURUNG WORKSPACE" yang ternyata bisa ditembus.
//
// Uji ini menjalankan proses ANAK dengan env yang disetel, karena ruleset
// dibekukan sekali per proses: menyetel env di tengah jest tak akan berpengaruh.

const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

// Dijalankan di proses anak; mencetak satu baris JSON.
const PROBE = `
  const T = require(${JSON.stringify(path.join(ROOT, "agent/tools/index.cjs"))});
  (async () => {
    const ctx = { workspaceRoot: ${JSON.stringify(ROOT)}, sessionId: "uji" };
    const out = {};
    const coba = async (nama, tool, args) => {
      try {
        const r = await T.runSelfTool(tool, args, () => {}, ctx);
        out[nama] = !!(r && r.ok);
      } catch (_) { out[nama] = false; }
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
      env: { ...process.env, ...env },
    });
  } catch (e) {
    keluar = (e.stdout || "").toString();
  }
  const m = keluar.match(/<<J>>([\s\S]*?)<<\/J>>/);
  if (!m) throw new Error("probe tak melapor: " + keluar.slice(-200));
  return JSON.parse(m[1]);
}

describe("lockdown proc.raw menutup SEMUA pintu spawn", () => {
  test("tanpa pencabutan: bash dan sandbox_run hidup", () => {
    const r = jalankan({ WOLFSPACE_CC_TANPA: "" });
    expect(r.bash).toBe(true);
    expect(r.sandbox_run).toBe(true);
  }, 200000);

  test("dengan pencabutan: KEDUANYA mati", () => {
    const r = jalankan({ WOLFSPACE_CC_TANPA: "proc.raw" });
    expect(r.bash).toBe(false);
    // Inti berkas ini. Sebelum perbaikan, baris ini yang merah.
    expect(r.sandbox_run).toBe(false);
  }, 200000);

  test("capability_exec TETAP hidup — lockdown bukan mematikan agent", () => {
    const r = jalankan({ WOLFSPACE_CC_TANPA: "proc.raw" });
    // Kalau ini ikut mati, pencabutannya tak bisa dipakai siapa pun dan akan
    // dimatikan lagi — jalur terkurung HARUS tetap tersedia sebagai gantinya.
    expect(r.capability_exec).toBe(true);
  }, 200000);
});
