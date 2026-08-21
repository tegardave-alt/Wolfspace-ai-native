// ── execSync harus benar-benar TERIKAT di server.cjs ──
//
// Ia sempat dipakai di dua fungsi tanpa pernah diimpor. Setiap pemanggilan
// melempar ReferenceError, dan keduanya dikelilingi `catch` kosong — jadi tak
// ada satu pun pesan galat, hanya perilaku yang salah tanpa penjelasan:
//
//   detectShell()  memilih pwsh -> powershell -> cmd. Ketiga pemeriksaannya
//                  melempar, jadi ia SELALU jatuh ke cmd.exe, di mesin mana pun,
//                  meski PowerShell terpasang. Terukur di mesin ini: rute
//                  /api/terminal/open melaporkan cmd.exe padahal
//                  "where powershell.exe" berhasil dalam ~500 ms.
//   killPort()     tak pernah menjalankan netstat maupun taskkill, jadi tak
//                  pernah membunuh apa pun. Terbukti pada listener sungguhan:
//                  port tetap dipegang sesudah killPort() dipanggil.
//
// Sesudah diperbaiki, keduanya terukur benar: shell -> powershell.exe (dibuktikan
// dengan $PSVersionTable.PSEdition yang MELEBAR jadi "Desktop", bukan tercetak
// apa adanya), dan port yang tadinya dipegang jadi bebas.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const SRV = fs
  .readFileSync(path.join(AKAR, "server.cjs"), "utf8")
  .replace(/\r\n/g, "\n");

// Baris yang diawali komentar dibuang: berkas ini menjelaskan bentuk yang
// ditinggalkan dengan mengutipnya, jadi tanpa penyaring ini komentar yang benar
// justru menggagalkan ujinya.
const tanpaKomentar = (t) =>
  t
    .split("\n")
    .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join("\n");
const BERSIH = tanpaKomentar(SRV);

describe("execSync terikat sebelum dipakai", () => {
  test("diimpor di lingkup modul", () => {
    expect(BERSIH).toMatch(
      /const \{[^}]*\bexecSync\b[^}]*\} = require\("child_process"\)/,
    );
  });

  test("setiap pemakaian punya pengikatnya — modul atau require lokal", () => {
    // Yang dicari BUKAN "ada importnya", melainkan: apakah tiap pemanggilan
    // benar-benar berada di lingkup yang mengenal namanya. Sebuah fungsi boleh
    // punya require sendiri (mis. _pidPemegangPort) — itu sah.
    const iModul = BERSIH.search(
      /const \{[^}]*\bexecSync\b[^}]*\} = require\("child_process"\)/,
    );
    expect(iModul).toBeGreaterThan(-1);

    const baris = BERSIH.split("\n");
    const pakai = [];
    baris.forEach((b, n) => {
      if (/(^|[^.\w])execSync\s*\(/.test(b)) pakai.push(n + 1);
    });
    // Kalau nol, uji ini tak menguji apa pun — jauh lebih buruk daripada gagal.
    expect(pakai.length).toBeGreaterThan(2);

    // Impor modulnya ada di baris paling atas, jadi semua pemakaian sesudahnya
    // terjangkau. Yang perlu dipastikan: tak ada pemakaian SEBELUM impor itu.
    const barisImpor = BERSIH.slice(0, iModul).split("\n").length;
    for (const n of pakai) expect(n).toBeGreaterThan(barisImpor - 1);
  });

  test("detectShell mengutamakan PowerShell, cmd hanya jalan terakhir", () => {
    const i = SRV.indexOf("function detectShell(");
    const blok = SRV.slice(i, SRV.indexOf("\n}", i) + 2);
    expect(blok).toMatch(/\["pwsh\.exe", "powershell\.exe", "cmd\.exe"\]/);
    // Terbukti bekerja: /api/terminal/open melaporkan powershell.exe, dan
    // $PSVersionTable.PSEdition melebar jadi "Desktop" di dalam PTY-nya.
  });

  test("detectShell TIDAK melahirkan proses — itu 2 detik jendela beku", () => {
    // Begitu execSync benar-benar terikat, ongkos `where` muncul utuh: terukur
    // 2008 ms MENGUNCI thread pada satu kali /api/terminal/open, hampir
    // seluruhnya `where "pwsh.exe"` menunggu sampai batas 2000 ms karena pwsh
    // tak terpasang. Tombol Run membuka terminal, jadi bekunya terasa persis
    // saat tombol itu ditekan.
    //
    // Yang dikerjakan `where` cuma menelusuri PATH, dan itu bisa dilakukan
    // fs.existsSync tanpa proses sama sekali. Terukur sesudahnya: 213 ms,
    // sisanya pty.spawn yang memang native.
    const i = SRV.indexOf("function detectShell(");
    const blok = tanpaKomentar(SRV.slice(i, SRV.indexOf("\n}", i) + 2));
    expect(blok).not.toMatch(/execSync/);
    expect(blok).not.toMatch(/\bwhere\b/);
    expect(blok).toMatch(/_adaDiPath\(/);
    // Dan hasilnya di-cache: shell terpasang tak berubah di tengah sesi.
    expect(blok).toMatch(/_shellTerpilih/);
    const p = tanpaKomentar(
      SRV.slice(
        SRV.indexOf("function _adaDiPath("),
        SRV.indexOf("function detectShell("),
      ),
    );
    expect(p).toMatch(/process\.env\.PATH/);
    expect(p).toMatch(/fs\.existsSync/);
  });

  test("killPort memakai netstat lalu taskkill", () => {
    const i = SRV.indexOf("function killPort(");
    const blok = SRV.slice(i, SRV.indexOf("\n}", i) + 2);
    expect(blok).toMatch(/execSync\("netstat -ano"/);
    expect(blok).toMatch(/execSync\("taskkill \/F \/PID "/);
  });
});

// ── Git di jalur HTTP tidak boleh sinkron ──
//
// gitInfo dan listBranches menjalankan tiga perintah git BERUNTUN lewat
// execFileSync. Diukur di repo ini: rev-parse 56 ms, status --porcelain 220 ms,
// log -1 67 ms, for-each-ref 64 ms — jadi /ww/git membekukan thread utama
// ~291 ms dan /ww/branches ~194 ms. Sesudah dipindah ke execFile asinkron yang
// dijalankan berbarengan: 53 ms dan 39 ms.
describe("rute git tidak membekukan thread utama", () => {
  const WW = fs
    .readFileSync(path.join(AKAR, "scripts", "ww.cjs"), "utf8")
    .replace(/\r\n/g, "\n");

  test("rute memakai versi async, bukan yang sinkron", () => {
    expect(SRV).toMatch(/await ww\.gitInfoAsync\(q\)/);
    expect(SRV).toMatch(/await ww\.listBranchesAsync\(q\)/);
    const bersih = tanpaKomentar(SRV);
    expect(bersih).not.toMatch(/ww\.gitInfo\(q\)/);
    expect(bersih).not.toMatch(/ww\.listBranches\(q\)/);
  });

  test("perintahnya dijalankan BERBARENGAN, bukan beruntun", () => {
    // Ketiganya tak saling bergantung. Beruntun berarti jumlah ketiganya;
    // berbarengan berarti yang paling lambat saja.
    // Namanya kini _gitInfoTarik: gitInfoAsync jadi pembungkus yang berbagi
    // hasil dan menyimpannya sebentar (lihat uji cache di bawah).
    const i = WW.indexOf("async function _gitInfoTarik");
    const blok = WW.slice(i, WW.indexOf("async function _listBranchesTarik"));
    expect(blok).toMatch(/await Promise\.all\(\[/);
    expect(blok).toMatch(/gitTryAsync\(\["status", "--porcelain"\]/);
    expect(blok).not.toMatch(/execFileSync/);
  });

  test("satu hasil dipakai bersama, dan disimpan sebentar", () => {
    // Terukur pada server yang benar-benar berjalan: /ww/git sehat sendirian
    // (40 ms) tapi runtuh di bawah beban — 32 serentak menghasilkan p99
    // 8149 ms, melewati ambang "Not Responding". Sebabnya bukan kode sinkron
    // (rutenya sudah asinkron) melainkan kemampuan sistem melahirkan proses:
    // tiap permintaan melahirkan TIGA git, jadi 32 permintaan = 96 proses.
    // Throughput rata di 6 rps di SETIAP tingkat serentak membuktikannya.
    //
    // Sesudah berbagi + cache 1,5 detik: 32 serentak -> 1705 rps, p99 38 ms.
    // Terbukti pula 50 pemanggil bersamaan hanya melahirkan 3 proses git.
    expect(WW).toMatch(/function _bersamaGit\(jenis, dir, buat\)/);
    expect(WW).toMatch(/_bersamaGit\("info", dir/);
    expect(WW).toMatch(/_bersamaGit\("branches", dir/);
    expect(WW).toMatch(/const CACHE_MS = 1500/);
  });

  test("kegagalan TIDAK ikut disimpan", () => {
    // Satu git yang gagal karena folder sedang terkunci akan membekukan
    // jawaban salah selama 1,5 detik berikutnya.
    const i = WW.indexOf("function _bersamaGit");
    const blok = WW.slice(i, WW.indexOf("function lupakanGit"));
    const iCatch = blok.indexOf(".catch(");
    expect(iCatch).toBeGreaterThan(-1);
    expect(blok.slice(iCatch)).not.toMatch(/_cacheGit\.set/);
  });

  test("pembatalan membandingkan NILAI folder, bukan akhiran teks kunci", () => {
    // Versi pertama memakai `k.endsWith(" " + dir)`, dan satu spasi di
    // dalamnya diam-diam tertulis sebagai byte NUL. Pencocokannya jadi selalu
    // gagal — cache tak pernah dibatalkan, dan tak ada satu pun galat.
    expect(WW).toMatch(/if \(v\.dir === cari\) _cacheGit\.delete\(k\)/);
    // Komentar di ww.cjs MENGUTIP bentuk lamanya untuk menjelaskan kenapa ia
    // ditinggalkan — tanpa penyaring ini, catatan yang benar justru
    // menggagalkan ujinya.
    expect(tanpaKomentar(WW)).not.toMatch(/k\.endsWith\(/);
    // Dan tak boleh ada byte NUL di berkas sumbernya.
    expect(WW.indexOf(String.fromCharCode(0))).toBe(-1);
  });

  test("perubahan git MEMBATALKAN cache foldernya", () => {
    // Tanpa ini, pemakai melakukan commit lalu panelnya masih melaporkan
    // keadaan sebelum commit selama 1,5 detik.
    expect(SRV).toMatch(/ww\.lupakanGit\(b\.path\)/);
    const i = SRV.indexOf("ww.lupakanGit(b.path)");
    // Dipanggil di jalur yang sama dengan semua aksi pengubah, sesudah
    // hasilnya didapat — termasuk saat aksinya gagal.
    expect(SRV.slice(Math.max(0, i - 700), i)).toMatch(/ww\.commitAll\(/);
  });

  test("versi sinkron TETAP ADA — berkas ini juga dipakai sebagai CLI", () => {
    expect(WW).toMatch(/^function gitInfo\(dir\)/m);
    expect(WW).toMatch(/^function listBranches\(dir\)/m);
    expect(WW).toMatch(/if \(require\.main === module\) main\(\)/);
  });

  test("hasil async SAMA persis dengan yang sinkron", async () => {
    // Kalau berbeda, ini bukan optimasi melainkan perubahan perilaku diam-diam.
    const ww = require(path.join(AKAR, "scripts", "ww.cjs"));
    const d = AKAR;
    expect(await ww.gitInfoAsync(d)).toEqual(ww.gitInfo(d));
    expect(await ww.listBranchesAsync(d)).toEqual(ww.listBranches(d));
  }, 30000);
});
