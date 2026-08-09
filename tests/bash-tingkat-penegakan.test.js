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
const T = require("../agent/tools/index.cjs");

const WS = path.resolve(__dirname, "..");
const ctx = { workspaceRoot: WS, sessionId: "uji-penegakan" };
const bash = (command, extra) =>
  T.runSelfTool("bash", { command, cwd: WS, ...extra }, () => {}, ctx);

describe("bash melaporkan tingkat penegakan", () => {
  test("hasil SUKSES membawa label penegakan", async () => {
    const r = await bash('node -e "console.log(42)"');
    expect(r.ok).toBe(true);
    expect(["kernel", "penasihat"]).toContain(r.penegakan);
    expect(["namespace", "regex"]).toContain(r.mekanisme);
  }, 60000);

  test("hasil DITOLAK juga membawa label yang sama", async () => {
    const r = await bash("ls ../Desktop");
    expect(r.ok).toBe(false);
    expect(["kernel", "penasihat"]).toContain(r.penegakan);
    expect(["namespace", "regex"]).toContain(r.mekanisme);
  }, 60000);

  test("label COCOK dengan mekanisme yang benar-benar dipakai", async () => {
    const jail = require("../agent/tools/bash-jail.cjs");
    const kebijakan = require("../agent/sandbox-policy.cjs");
    const pakaiJail =
      process.env.WW_BASH_NATIVE !== "1" &&
      kebijakan.shouldSandbox(
        kebijakan.configSandbox(),
        jail.tersedia(),
        "auto",
      );
    const r = await bash('node -e "console.log(1)"');
    expect(r.mekanisme).toBe(pakaiJail ? "namespace" : "regex");
    expect(r.penegakan).toBe(pakaiJail ? "kernel" : "penasihat");
    expect(r.terkurungOs).toBe(pakaiJail);
  }, 60000);
});

// Batas yang DIDOKUMENTASIKAN, bukan yang diharapkan. Uji ini hanya berjalan
// saat penegakannya "regex" — kalau suatu hari Windows dapat pengurungan nyata,
// ia melewatkan diri sendiri alih-alih jadi merah palsu.
describe("batas jalur regex (didokumentasikan, bukan diinginkan)", () => {
  test("path yang DITULIS sebagai token memang ditahan", async () => {
    const r = await bash('ls "C:/Users/dave/Desktop"');
    if (r.mekanisme !== "regex") return; // jail aktif — bukan wilayah uji ini
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
    if (r.mekanisme !== "regex") return;
    // Kalau baris ini suatu saat merah, artinya jalur regex BERHASIL menahannya —
    // kabar baik, dan uji ini yang harus diperbarui, bukan kodenya.
    expect(r.ok).toBe(true);
    expect(String(r.output)).toMatch(/N:\d+/);
  }, 60000);
});
