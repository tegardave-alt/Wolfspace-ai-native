// Penolakan tak boleh berbunyi seperti jaminan yang tak dimilikinya.
//
// KEJADIAN NYATA yang memicu berkas ini. Pesan penolakan dulu berbunyi:
//
//   TERKURUNG WORKSPACE (regex fallback): path 'C:\Users\dave\Desktop\menembus'
//   menembus keluar workspace C:\Users\dave\Documents\oi
//
// Agent meneruskannya ke user sebagai "percobaan pindah ke C:\Users\dave\Desktop
// diblokir oleh sistem keamanan". Kalimat itu BENAR untuk perintah itu. Tapi
// perintah berikutnya — path yang sama, dirakit saat jalan lewat
// String.fromCharCode — berhasil MEMBUAT folder di Desktop.
//
// Jadi cacatnya bukan kebocorannya. Cacatnya adalah menahan sebagian sambil
// terdengar seperti menahan semuanya: orang berhenti waspada karena percaya ada
// batas. Laporan yang terlalu kuat lebih berbahaya daripada tak ada laporan.
//
// Yang dibuang adalah KLAIMNYA, bukan pemeriksaannya. Pemindai teks masih
// berguna untuk menangkap salah ketik — dan hanya untuk itu.

const path = require("path");
const fs = require("fs");
const T = require("../agent/tools/index.cjs");

const WS = path.resolve(__dirname, "..");
const ctx = { workspaceRoot: WS, sessionId: "uji-klaim" };
const bash = (command) =>
  T.runSelfTool("bash", { command, cwd: WS }, () => {}, ctx);

describe("penolakan tidak mengklaim pengurungan yang tak ada", () => {
  test("pesan penolakan TIDAK memakai kata yang berarti terkurung", async () => {
    const r = await bash("ls ../Desktop");
    expect(r.ok).toBe(false);
    if (r.terkurungOs) return; // jail aktif — klaim "terkurung" memang sah di sana
    const pesan = String(r.output);
    // "TERKURUNG" adalah kata yang dulu dipakai dan yang diteruskan agent
    // sebagai "diblokir oleh sistem keamanan".
    expect(pesan).not.toMatch(/TERKURUNG/i);
    expect(pesan).not.toMatch(/sistem keamanan/i);
  }, 60000);

  test("pesan MENYEBUTKAN batasnya sendiri", async () => {
    const r = await bash("ls ../Desktop");
    if (r.terkurungOs) return;
    const pesan = String(r.output);
    // Harus mengatakan dua hal: ini bukan batas keamanan, dan ia bisa dilewati.
    expect(pesan).toMatch(/BUKAN batas keamanan/i);
    expect(pesan).toMatch(/dirakit saat jalan/i);
    // Dan menunjuk ke jalan yang benar-benar mengurung.
    expect(pesan).toMatch(/app:wsl|capability_exec/);
  }, 60000);

  test("deskripsi tool melarang model menyebutnya jaminan", () => {
    const def = fs.readFileSync(
      path.join(WS, "agent", "tools", "tool-definitions.cjs"),
      "utf8",
    );
    const i = def.indexOf('name: "bash"');
    expect(i).toBeGreaterThan(-1);
    const blok = def.slice(i, i + 2000);
    // Model yang tak diberi tahu akan menyimpulkan sendiri dari kata "ditolak"
    // bahwa ada penjaga — persis yang terjadi.
    expect(blok).toMatch(/JANGAN katakan/i);
    expect(blok).toMatch(/terkurungOs|penegakan/);
  });

  test("label tetap konsisten dengan pesannya", async () => {
    const r = await bash("ls ../Desktop");
    if (r.terkurungOs) return;
    expect(r.penegakan).toBe("penasihat");
    expect(r.mekanisme).toBe("heuristik-teks");
    // Kalau suatu saat ini jadi "kernel", pesannya BOLEH kembali tegas — dan uji
    // di atas melewatkan diri sendiri lewat penjaga r.terkurungOs.
    expect(r.terkurungOs).toBe(false);
  }, 60000);
});
