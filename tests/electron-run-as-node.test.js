// runInWorkspace() menjalankan JavaScript dengan process.execPath. Di
// `npm run app` backend berjalan IN-PROCESS di dalam Electron, jadi nilainya
// electron.exe — bukan node.exe.
//
// MASALAH ASLI. `electron.exe skrip.js` memperlakukan skrip sebagai entri
// APLIKASI. Ia mencetak stdout dengan benar lalu TIDAK PERNAH KELUAR, karena
// Electron menunggu event aplikasi yang tak akan datang. exec() menunggu sampai
// EXEC_TIMEOUT (120 detik) habis lalu menolak dengan SIGTERM. Terukur di dalam
// proses utama Electron sungguhan:
//
//     lama   : 120046 ms
//     ok     : false
//     output : "halo dari javascript"     <- keluarannya BENAR
//     error  : "proses dihentikan (SIGTERM) — kemungkinan timeout"
//
// Hasil yang benar, vonis yang salah. Dan karena gerbang anti-halu di loop
// /agent hanya menaikkan hasRunOk saat result.ok, verifikasi JavaScript tak
// pernah bisa lulus di mode desktop.
//
// Sesudah ELECTRON_RUN_AS_NODE="1": 431 ms, ok:true.
//
// KENAPA UJI INI MENJALANKAN ELECTRON SUNGGUHAN. Pelajaran dari temuan
// sebelumnya di repo ini: uji yang hanya membaca teks sumber LULUS sementara
// kaitnya terpasang di cabang mati. Perilaku ini hanya muncul saat
// process.execPath benar-benar electron.exe, jadi uji harus menjalankannya.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ELECTRON = path.join(
  ROOT,
  "node_modules",
  "electron",
  "dist",
  process.platform === "win32" ? "electron.exe" : "electron",
);

const adaElectron = fs.existsSync(ELECTRON);
const jalankan = adaElectron ? describe : describe.skip;

jalankan("eksekusi JS di dalam Electron (mode desktop)", () => {
  test("runInWorkspace selesai CEPAT dan ok:true, bukan timeout 120 detik", () => {
    const skrip = path.join(os.tmpdir(), "_uji_eran_" + Date.now() + ".js");
    fs.writeFileSync(
      skrip,
      [
        "const { app } = require('electron');",
        "app.on('ready', async () => {",
        "  const hasil = { execPath: process.execPath };",
        "  try {",
        "    const srv = require(" +
          JSON.stringify(ROOT + "/server.cjs") +
          ");",
        "    const t0 = Date.now();",
        "    const r = await srv.runInWorkspace('javascript', 'console.log(\"HALO_UJI\")');",
        "    hasil.ms = Date.now() - t0;",
        "    hasil.ok = r.ok;",
        "    hasil.output = String(r.output || '');",
        "  } catch (e) { hasil.gagal = e.message; }",
        "  process.stdout.write('\\n<<UJI>>' + JSON.stringify(hasil) + '<</UJI>>\\n');",
        "  app.exit(0);",
        "});",
      ].join("\n"),
      "utf8",
    );

    let keluaran = "";
    try {
      const env = { ...process.env, PORT: "8113" };
      delete env.ELECTRON_RUN_AS_NODE; // justru inilah yang sedang diuji
      keluaran = execFileSync(ELECTRON, [skrip], {
        encoding: "utf8",
        timeout: 180000,
        env,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch (e) {
      keluaran = (e.stdout || "").toString();
    } finally {
      try {
        fs.rmSync(skrip, { force: true });
      } catch (_) {}
    }

    const m = keluaran.match(/<<UJI>>([\s\S]*?)<<\/UJI>>/);
    expect(m).toBeTruthy(); // Electron harus keluar dan melapor, bukan menggantung
    const h = JSON.parse(m[1]);

    expect(h.gagal).toBeUndefined();
    // Konteksnya memang Electron — kalau bukan, uji ini tak menguji apa pun.
    expect(/electron/i.test(h.execPath)).toBe(true);
    expect(h.output).toContain("HALO_UJI");
    expect(h.ok).toBe(true);
    // Sebelum perbaikan angkanya 120.046 ms. Ambang longgar supaya mesin lambat
    // tak bikin merah, tapi tetap jauh di bawah EXEC_TIMEOUT.
    expect(h.ms).toBeLessThan(30000);
  }, 200000);
});
