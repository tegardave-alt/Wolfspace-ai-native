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
const T = require("../agent/tools/index.ts");

const WS = path.resolve(__dirname, "..");
const ctx = { workspaceRoot: WS, sessionId: "uji-klaim" };
const bash = (command) =>
  T.runSelfTool("bash", { command, cwd: WS }, () => {}, ctx);

describe("penolakan tidak mengklaim pengurungan yang tak ada", () => {
  // THE TEXT-SCAN PATH IS FORCED, on every platform.
  //
  // What this file is about is the refusal produced when there is NO OS
  // confinement — that is the only case where the message could overclaim. On
  // Windows AppContainer is available, so terkurungOs came back true and every
  // test below returned before asserting anything. The suite was green here and
  // red in CI for two days, and the difference was never the code: it was that
  // these assertions only ever executed on Linux.
  //
  // WOLFSPACE_BASH_AC=0 is the switch the tool itself reads (see
  // agent/tools/index.ts), so this exercises the real branch rather than a
  // simulation of it. The early returns below are kept as belt and braces for a
  // platform that confines some other way.
  const _acAsli = process.env.WOLFSPACE_BASH_AC;
  beforeAll(() => {
    process.env.WOLFSPACE_BASH_AC = "0";
  });
  afterAll(() => {
    if (_acAsli === undefined) delete process.env.WOLFSPACE_BASH_AC;
    else process.env.WOLFSPACE_BASH_AC = _acAsli;
  });

  // THESE POLAS ARE ENGLISH NOW, and that is not cosmetic — it is the bug that
  // turned CI red for two days while the suite stayed green on Windows.
  //
  // The refusal message was translated with the rest of the application strings.
  // These assertions were not, so they went on matching Indonesian text the app
  // no longer produces. Nobody noticed locally because of the early return
  // below: on Windows AppContainer IS available, terkurungOs is true, and every
  // test here returns before asserting anything at all. On Linux there is no
  // AppContainer, the assertions actually run, and they failed.
  //
  // A test that returns early on the developer's platform and only executes in
  // CI is not a slow test — it is an unrun one, and it stays unrun until
  // something else makes it speak.
  test("pesan penolakan TIDAK memakai kata yang berarti terkurung", async () => {
    const r = await bash("ls ../Desktop");
    expect(r.ok).toBe(false);
    if (r.terkurungOs) return; // jail aktif — klaim "terkurung" memang sah di sana
    const pesan = String(r.output);
    // The word this used to use, and that the agent then relayed as "blocked by
    // the security system". Both spellings are checked: the Indonesian one so a
    // revert cannot pass silently, the English one because that is what the
    // message would say today if the claim ever came back.
    expect(pesan).not.toMatch(/TERKURUNG|CONFINED/i);
    expect(pesan).not.toMatch(/sistem keamanan|security system/i);
  }, 60000);

  test("pesan MENYEBUTKAN batasnya sendiri", async () => {
    const r = await bash("ls ../Desktop");
    if (r.terkurungOs) return;
    const pesan = String(r.output);
    // Two things it must say: this is not a security boundary, and it can be
    // walked past.
    expect(pesan).toMatch(/NOT a security boundary/i);
    expect(pesan).toMatch(/assembled at run time/i);
    // And it must point at something that really does confine.
    expect(pesan).toMatch(/app:wsl|capability_exec/);
  }, 60000);

  test("deskripsi tool melarang model menyebutnya jaminan", () => {
    const def = fs.readFileSync(
      path.join(WS, "agent", "tools", "tool-definitions.ts"),
      "utf8",
    );
    const i = def.indexOf('name: "bash"');
    expect(i).toBeGreaterThan(-1);
    const blok = def.slice(i, i + 2000);
    // Model yang tak diberi tahu akan menyimpulkan sendiri dari kata "ditolak"
    // bahwa ada penjaga — persis yang terjadi.
    // Maksudnya, bukan frasanya. Larangan lama ("jangan bilang kamu
    // terkurung") cocok saat batasnya memang cuma pemindaian teks; sesudah
    // kurungan kernel terpasang ia berbalik jadi meremehkan. Yang harus tetap
    // ada: larangan MELEBIH-LEBIHKAN, dan perintah membaca medan penegakan.
    expect(blok).toMatch(/do not (say|claim|state)/i);
    expect(blok).toMatch(/terkurungOs|penegakan/);
    // Dan klaim "semuanya di luar workspace terblokir" harus DITOLAK terang-
    // terangan, karena C:\Windows memang masih terbaca.
    expect(blok).toMatch(/REMAIN READABLE/);
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
