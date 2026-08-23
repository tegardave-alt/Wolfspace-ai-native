// Tool `bash` melaporkan SIAPA yang menegakkan batasnya, bukan hanya bahwa ada
// batas.
//
// MASALAHNYA. Kedua jalur memakai kalimat yang sama-sama meyakinkan:
//
//   TERKURUNG WORKSPACE                    <- jail namespace, batas kernel
//   TERKURUNG WORKSPACE (regex fallback)   <- pemindai teks, bisa dilewati
//
// dan pada perintah yang BERHASIL, tak ada tanda apa pun. Padahal justru di
// situ selisihnya paling penting: penolakan sudah jelas ditahan sesuatu,
// keberhasilan tidak.
//
// KENAPA regex tak bisa jadi jaminan, terukur di mesin ini:
//
//   ls "C:/Users/dave/Desktop"                      -> ditahan
//   ls ../Desktop                                   -> ditahan
//   node -e "...String.fromCharCode(67,58,47,...)"  -> LOLOS, direktori terbaca
//
// Percobaan ketiga merakit path SAAT JALAN, jadi tak ada token berbentuk path
// untuk dipindai. Ini bukan regex yang kurang pintar — memindai teks tak akan
// pernah tahu apa yang dirakit saat jalan. Adapter platform repo ini sudah
// menyebutnya sejak awal: fsIsolation 'advisory' = "gates our JS helpers only;
// a spawned process still has full FS access".
//
// Jadi yang diperbaiki bukan regexnya, melainkan KLAIMNYA.

const path = require("path");
const T = require("../agent/tools/index.ts");

const WS = path.resolve(__dirname, "..");
const ctx = { workspaceRoot: WS, sessionId: "uji-penegakan" };
const bash = (command, extra) =>
  T.runSelfTool("bash", { command, cwd: WS, ...extra }, () => {}, ctx);

// "appcontainer" ikut sejak bash di Windows punya pengurungan kernel sungguhan.
// Ia SETARA dengan "namespace" di Linux, bukan tingkat ketiga: keduanya
// ditegakkan kernel, keduanya menolak path yang dirakit saat jalan.
const MEKANISME = ["namespace", "appcontainer", "heuristik-teks"];

describe("bash melaporkan tingkat penegakan", () => {
  test("hasil SUKSES membawa label penegakan", async () => {
    const r = await bash('node -e "console.log(42)"');
    expect(r.ok).toBe(true);
    expect(["kernel", "penasihat"]).toContain(r.penegakan);
    expect(MEKANISME).toContain(r.mekanisme);
  }, 60000);

  test("hasil DITOLAK juga membawa label yang sama", async () => {
    const r = await bash("ls ../Desktop");
    expect(r.ok).toBe(false);
    expect(["kernel", "penasihat"]).toContain(r.penegakan);
    expect(MEKANISME).toContain(r.mekanisme);
  }, 60000);

  test("label COCOK dengan mekanisme yang benar-benar dipakai", async () => {
    const jail = require("../agent/tools/bash-jail.ts");
    const kebijakan = require("../agent/sandbox-policy.ts");
    const pakaiJail =
      process.env.WW_BASH_NATIVE !== "1" &&
      kebijakan.shouldSandbox(
        kebijakan.configSandbox(),
        jail.tersedia(),
        "auto",
      );
    // Di Windows jalur bawaannya AppContainer, kalau container itu memang siap
    // untuk workspace ini. Diperiksa dengan menanyakan modulnya, bukan dengan
    // menebak dari platform — uji ini harus tetap benar di mesin yang belum
    // memasang profilnya.
    const ac = require("../agent/tools/appcontainer-jail.ts");
    const pakaiAc =
      !pakaiJail &&
      process.platform === "win32" &&
      process.env.WOLFSPACE_BASH_AC !== "0" &&
      (await ac.siapUntuk(WS)).siap;
    const harap = pakaiJail
      ? "namespace"
      : pakaiAc
        ? "appcontainer"
        : "heuristik-teks";
    const r = await bash('node -e "console.log(1)"');
    expect(r.mekanisme).toBe(harap);
    expect(r.penegakan).toBe(
      harap === "heuristik-teks" ? "penasihat" : "kernel",
    );
    expect(r.terkurungOs).toBe(harap !== "heuristik-teks");
  }, 60000);
});

// Batas yang DIDOKUMENTASIKAN, bukan yang diharapkan.
//
// DUA penjaga, dan keduanya menolak alasan yang berbeda untuk merah palsu:
//
//   WINDOWS saja — masukan ujinya "C:/Users/dave/Desktop", dan itu path host
//     hanya di Windows. Di Linux ia cuma nama berkas aneh yang tak ada, jadi
//     `ls` GAGAL alih-alih DITAHAN. Keduanya menghasilkan ok:false dan tes ini
//     tak bisa membedakannya — ia akan hijau tanpa penjaga yang diuji pernah
//     berbunyi. Lulus karena alasan yang salah lebih buruk daripada di-skip.
//
//   heuristik-teks saja — di dalam tiap tes. Kalau suatu hari jalur ini dapat
//     pengurungan kernel sungguhan, ia melewatkan diri sendiri alih-alih
//     menuntut kelemahan yang sudah tak ada.
const { diWindows, describeKalau } = require("./butuh.cjs");

describeKalau(diWindows())(
  "batas jalur regex (didokumentasikan, bukan diinginkan)",
  () => {
    test("path yang DITULIS sebagai token memang ditahan", async () => {
      const r = await bash('ls "C:/Users/dave/Desktop"');
      if (r.mekanisme !== "heuristik-teks") return; // jail aktif — bukan wilayah uji ini
      expect(r.ok).toBe(false);
      expect(String(r.output)).toMatch(/menembus keluar workspace|dilarang/);
    }, 60000);

    test("path yang DIRAKIT saat jalan TIDAK tertahan — inilah alasan labelnya ada", async () => {
      // Hanya menghitung jumlah entri: membuktikan batasnya lewat, tanpa membaca
      // isi apa pun.
      const kode =
        "const f=require('fs');" +
        "const p=String.fromCharCode(67,58,47,85,115,101,114,115);" +
        "console.log('N:'+f.readdirSync(p).length)";
      const r = await bash('node -e "' + kode + '"');
      if (r.mekanisme !== "heuristik-teks") return;
      // Kalau baris ini suatu saat merah, artinya jalur regex BERHASIL menahannya —
      // kabar baik, dan uji ini yang harus diperbarui, bukan kodenya.
      expect(r.ok).toBe(true);
      expect(String(r.output)).toMatch(/N:\d+/);
    }, 60000);
  },
);
