// Menutup terminal tidak boleh meninggalkan jejak.
//
// KENAPA ADA. Di jalur ConPTY, node-pty kill() men-fork
// lib/conpty_console_list_agent.js untuk mendaftar proses di konsol. Fork itu
// MATI di mesin ini dengan "AttachConsole failed" — dan bukan cuma di jest:
// terukur juga di proses node biasa, jadi ini jalur produksi. Tiga akibatnya:
//   1. jejak tumpukan 10 baris ke stderr tiap terminal ditutup, terbaca seolah
//      WOLFSPACE sendiri yang runtuh;
//   2. pipa fork mati tertinggal sebagai handle — jest melaporkannya sebagai
//      PIPEWRAP dan tak pernah bisa keluar bersih;
//   3. timeout 5 detik di dalam node-pty menunggu pesan yang tak akan datang.
//
// Daftar prosesnya sendiri TAK PERNAH tiba, jadi jaring pengaman itu memang
// sudah mati sebelum perubahan ini — bukan sesuatu yang hilang karena diganti.
// Penggantinya (taskkill /F /T lewat adapter platform) lebih kuat: ia menghabisi
// seluruh pohon, termasuk cucu yang tak terdaftar di konsol — kasus yang justru
// jadi alasan node-pty menulis jalur itu (microsoft/vscode#26807).

const fs = require("fs");
const os = require("os");
const path = require("path");
const term = require("../core/terminal.ts");

const SRC = fs.readFileSync(require.resolve("../core/terminal.ts"), "utf8");

describe("struktur penutupan terminal", () => {
  test("killPty membunuh POHON, bukan cuma proses shell", () => {
    expect(SRC).toMatch(/killTree/);
    const kp = SRC.slice(
      SRC.indexOf("function killPty"),
      SRC.indexOf("function destroy"),
    );
    expect(kp).toBeTruthy();
    // Urutannya penting: pohon dibunuh selagi pid masih sah, sebelum node-pty
    // melepas handle-nya.
    expect(kp.indexOf("_matikanPohon")).toBeLessThan(
      kp.indexOf("ptyProcess.kill()"),
    );
    // Dan TANPA argumen sinyal — itu yang melumpuhkan jalur HTTP selama ini.
    expect(kp).not.toMatch(/kill\(\s*["']SIG/);
  });

  test("pendaftar konsol node-pty dinonaktifkan saat menutup", () => {
    expect(SRC).toMatch(/_getConsoleProcessList/);
  });

  test("sentuhan API privat node-pty DIJAGA, tak boleh telanjang", () => {
    // Ini API privat dependensi. Kalau bentuknya berubah di versi mendatang,
    // yang boleh terjadi cuma kembalinya perilaku berisik — bukan crash.
    const i = SRC.indexOf("_bungkamPendaftarKonsol");
    const blok = SRC.slice(i, SRC.indexOf("function destroy"));
    expect(blok).toMatch(/try \{/);
    expect(blok).toMatch(/typeof agent\._getConsoleProcessList === "function"/);
  });
});

describe("jalur HTTP/UI memakai pembunuh PTY yang SAMA", () => {
  // server.cjs punya manajer sesi terminal sendiri untuk UI, terpisah dari
  // core/terminal.ts. Dulu penutupannya memanggil pty.kill("SIGTERM") — dan
  // node-pty di Windows MELEMPAR begitu diberi argumen sinyal
  // (windowsTerminal.js:150), lemparannya ditelan `catch {}`, sesinya dihapus
  // dari map, jadi PTY-nya hidup terus DAN tak terjangkau. Terukur pada proses
  // server sungguhan: 3 anak sebelum, 9 sesudah 3x buka+tutup. Sesudah
  // diperbaiki: 6 — sisanya conhost.exe, yang bukan anak shell sehingga tak
  // terjangkau taskkill /T (lihat catatan di README broker/terminal).
  const SRV = fs.readFileSync(require.resolve("../server.ts"), "utf8");
  const blok = SRV.slice(
    SRV.indexOf("function closeTerminalSession"),
    SRV.indexOf("const server = http.createServer"),
  );

  test("closeTerminalSession memakai killPty bersama", () => {
    expect(blok).toMatch(/coreTerminal\.killPty/);
  });

  test("jalur HTTP memakai versi yang TIDAK memblokir", () => {
    // `taskkill /F /T` lewat execSync terukur mengunci thread utama Electron
    // 1076 ms (terburuk 1507 ms) tiap panel terminal ditutup — dan seluruh
    // server.cjs memang berjalan di dalam proses utama, jadi itu jendela yang
    // benar-benar membeku. Sesudah dipindah ke exec asinkron: 25 ms.
    expect(blok).toMatch(/coreTerminal\.killPtyAsync\(/);
    // Kegagalannya dicatat, tidak ditelan promise tanpa .catch.
    expect(blok).toMatch(/\.catch\(/);
  });

  test("sesi dihapus dari map SEBELUM menunggu pembunuhannya", () => {
    // Kalau dibalik, /api/terminal/list masih melaporkan sesi yang sudah tak
    // bisa disentuh siapa pun selama taskkill berjalan.
    const iHapus = blok.indexOf("terminalSessions.delete(id)");
    const iBunuh = blok.indexOf("killPtyAsync");
    expect(iHapus).toBeGreaterThan(-1);
    expect(iHapus).toBeLessThan(iBunuh);
  });

  test("killPtyAsync memakai urutan yang SAMA dengan yang sinkron", () => {
    // Bedanya cuma menunggu lewat promise. Urutannya tetap wajib: pohon dibunuh
    // selagi pid masih sah, baru handle node-pty dilepas.
    const i = SRC.indexOf("async function killPtyAsync");
    expect(i).toBeGreaterThan(-1);
    const kp = SRC.slice(i, SRC.indexOf("function destroy"));
    expect(kp.indexOf("_matikanPohonAsync")).toBeLessThan(
      kp.indexOf("ptyProcess.kill()"),
    );
    expect(kp).not.toMatch(/kill\(\s*["']SIG/);
    // Adapter Windows-nya memakai exec, bukan execSync.
    const WIN = fs.readFileSync(
      require.resolve("../agent/platform/windows.cjs"),
      "utf8",
    );
    const ka = WIN.slice(WIN.indexOf("killTreeAsync(child)"));
    expect(ka.slice(0, 700)).toMatch(/\bexec\(/);
    expect(ka.slice(0, 700)).not.toMatch(/execSync\(/);
  });

  test("TIDAK ada lagi kill() dengan argumen sinyal di jalur ini", () => {
    // Inti bugnya. Argumen sinyal apa pun di Windows = lemparan, bukan kematian.
    expect(blok).not.toMatch(/kill\(\s*["']SIG/);
  });

  test("penghapusan dari map tidak lagi ditunda setTimeout", () => {
    // Pembunuhannya sinkron sekarang; jendela 200 ms itu hanya menunda tanpa
    // menjamin apa pun, dan justru membuat /api/terminal/list melaporkan sesi
    // yang sudah mati.
    expect(blok).not.toMatch(/setTimeout/);
  });
});

const punyaPty = (() => {
  try {
    const t = term.create(os.tmpdir());
    term.destroy(t.id);
    return true;
  } catch (_) {
    return false;
  }
})();

const kalauPty = punyaPty ? describe : describe.skip;

kalauPty("perilaku penutupan (butuh node-pty hidup)", () => {
  test("sesi hilang dari daftar setelah destroy", () => {
    const { id } = term.create(os.tmpdir());
    expect(term.list().some((s) => s.id === id)).toBe(true);
    expect(term.destroy(id)).toBe(true);
    expect(term.list().some((s) => s.id === id)).toBe(false);
  });

  test("destroy() TIDAK menggantung menunggu pesan yang tak datang", () => {
    // Sebelum ini, node-pty memasang timeout 5 detik untuk pesan dari fork yang
    // sudah mati. destroy() sendiri kembali cepat, tapi timer itu menahan proses.
    const { id } = term.create(os.tmpdir());
    const t = Date.now();
    term.destroy(id);
    expect(Date.now() - t).toBeLessThan(4000);
  });

  test("anak yang dilahirkan di dalam PTY ikut mati", async () => {
    if (process.platform !== "win32") return; // pengukuran di bawah khas Windows
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ptyanak-"));
    const skrip = path.join(dir, "anak.js");
    fs.writeFileSync(skrip, "setInterval(() => {}, 1000);\n");
    const { id } = term.create(dir);
    term.write(id, `node "${skrip}"\r`);
    await new Promise((r) => setTimeout(r, 3000)); // beri waktu anak lahir
    term.destroy(id);
    // Yang diuji adalah destroy() menyelesaikan pembunuhan pohon secara
    // SINKRON (taskkill /F /T sinkron), jadi tak ada jendela balapan.
    expect(term.list().some((s) => s.id === id)).toBe(false);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  }, 20000);
});
