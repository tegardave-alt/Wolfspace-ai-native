// Jalur AppContainer: batas yang benar-benar ditegakkan kernel, dan empat
// jebakan yang membuatnya nyaris tak jadi.
//
// KENAPA BERKAS INI ADA. Membangun peluncurnya menghabiskan enam versi yang
// gagal, dan tiap kegagalannya PUNYA GEJALA YANG MENYESATKAN — bukan pesan
// galat yang menunjuk penyebabnya:
//
//   stdin NULL          -> node crash TANPA PESAN di InitializeOncePerProcess,
//                          dan git bilang "could not open /dev/null". Dua gejala
//                          yang sama sekali berbeda, satu penyebab.
//   keluaran ke BERKAS  -> keluaran PowerShell tertangkap, keluaran proses
//                          ANAKNYA hilang. Tampak seperti anak tak jalan,
//                          padahal ia jalan dan menulis berkas.
//   tanpa hak traverse  -> cwd diam-diam jatuh ke drive lain. Perintah "gagal"
//                          menulis ke workspace padahal workspace bisa ditulis.
//   peluncur skrip      -> error 87 dari marshaling ANSI, dan penugasan ke medan
//                          struct bersarang yang tak menempel.
//
// Tiap gejala itu mengarahkan orang ke tempat yang salah selama berjam-jam.
// Karena itu yang dikunci di sini bukan cuma perilakunya, tapi juga BENTUK
// sumber peluncurnya — supaya perbaikannya tidak lenyap tanpa ada yang tahu.

const fs = require("fs");
const path = require("path");
const AC = require("../agent/tools/appcontainer-jail.cjs");

const AKAR = path.resolve(__dirname, "..");
const SUMBER = path.join(AKAR, "scripts", "appcontainer", "AcLaunch.cs");

jest.setTimeout(120000);

describe("bentuk sumber peluncur", () => {
  const src = fs.existsSync(SUMBER) ? fs.readFileSync(SUMBER, "utf8") : "";

  test("sumber peluncur ada", () => {
    expect(src.length).toBeGreaterThan(0);
  });

  test("stdin dibuka sebagai NUL, tidak dibiarkan NULL", () => {
    // Tanpa ini node mati tanpa pesan apa pun. Gejalanya nyaris tak bisa
    // dilacak balik ke stdin, jadi jangan sampai hilang diam-diam.
    expect(src).toMatch(/CreateFileW\(\s*"NUL"/);
    expect(src).toMatch(/hStdInput\s*=\s*hIn/);
  });

  test("keluaran lewat pipa, dan ujung baca TIDAK diwariskan", () => {
    // Ujung baca yang ikut diwariskan tak pernah tertutup, jadi pembacaan
    // menggantung selamanya -- kegagalan yang tampak persis seperti hang.
    expect(src).toMatch(/CreatePipe\(/);
    expect(src).toMatch(
      /SetHandleInformation\(\s*outRd,\s*HANDLE_FLAG_INHERIT,\s*0\s*\)/,
    );
  });

  test("ujung tulis ditutup induk setelah CreateProcess", () => {
    // Selama induk memegangnya, pipa tak pernah menandakan EOF.
    const i = src.indexOf("CreateProcessW(exe");
    expect(i).toBeGreaterThan(0);
    expect(src.slice(i)).toMatch(/CloseHandle\(outWr\)/);
  });

  test("cb memakai ukuran STARTUPINFOEX, bukan STARTUPINFO", () => {
    expect(src).toMatch(/cb\s*=\s*Marshal\.SizeOf\(typeof\(STARTUPINFOEX\)\)/);
  });

  test("struct di-marshal Unicode", () => {
    // CreateProcessW menolak struct yang di-marshal ANSI dengan error 87.
    expect(src).toMatch(
      /CharSet\s*=\s*CharSet\.Unicode[\s\S]{0,80}struct STARTUPINFO\b/,
    );
  });

  test("atribut kapabilitas keamanan dipasang", () => {
    // 0x00020009 = PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES. Tanpa ini
    // prosesnya jalan normal tanpa kurungan sama sekali.
    expect(src).toMatch(/0x00020009/);
    expect(src).toMatch(/EXTENDED_STARTUPINFO_PRESENT/);
  });
});

describe("pesan modul", () => {
  test("kegagalan NUL milik git dijelaskan, bukan dibiarkan menyesatkan", () => {
    // Pesan git sendiri menunjuk "Permission denied", yang mengarahkan orang ke
    // hak berkas repo -- padahal penyebabnya perangkat NUL yang tertutup untuk
    // AppContainer, dan itu tak bisa diperbaiki dengan mengubah hak berkas.
    const isi = fs.readFileSync(
      path.join(AKAR, "agent", "tools", "appcontainer-jail.cjs"),
      "utf8",
    );
    expect(isi).toMatch(/could not open/);
    expect(isi).toMatch(/BUKAN soal izin berkas repo/);
  });

  test("dipasang sebagai bawaan di Windows, bukan opt-in", () => {
    const idx = fs.readFileSync(
      path.join(AKAR, "agent", "tools", "index.cjs"),
      "utf8",
    );
    // Jalur lain memakai '=== "1"' (harus dinyalakan). Jalur ini kebalikannya:
    // aktif kecuali dimatikan. Perbedaan itu yang dikunci di sini.
    expect(idx).toMatch(/WOLFSPACE_BASH_AC\s*!==\s*"0"/);
    expect(idx).not.toMatch(/WOLFSPACE_BASH_AC\s*===\s*"1"/);
    // Dan ia harus dicoba SEBELUM dua jalur opt-in, kalau tidak ia tak pernah
    // jadi bawaan yang sebenarnya.
    expect(idx.indexOf("WOLFSPACE_BASH_AC")).toBeLessThan(
      idx.indexOf("WOLFSPACE_BASH_ACL ==="),
    );
  });
});

describe("jebakan yang gejalanya menyesatkan", () => {
  const isi = fs.readFileSync(
    path.join(AKAR, "agent", "tools", "appcontainer-jail.cjs"),
    "utf8",
  );

  test("LOCALAPPDATA disediakan, dan alasannya tercatat", () => {
    // CreateProcessW menolak membuat proses AppContainer tanpa LOCALAPPDATA,
    // dengan kode 203 (ERROR_ENVVAR_NOT_FOUND) yang tidak menyebut variabel
    // apa pun. Hilangkan baris ini dan SETIAP perintah bash gagal dengan pesan
    // yang menunjuk ke mana-mana kecuali ke sebabnya.
    expect(isi).toMatch(/function envTambahan/);
    expect(isi).toMatch(/LOCALAPPDATA/);
    expect(isi).toMatch(/203/);
  });

  test("nilai LOCALAPPDATA tidak membocorkan nama akun", () => {
    // Yang dituntut hanya kehadirannya, jadi ia diarahkan ke dalam workspace.
    // Nilai aslinya memuat nama akun asli, yang justru sedang disembunyikan
    // oleh pengerasan env di sekitarnya.
    const AC = require("../agent/tools/appcontainer-jail.cjs");
    const v = AC.envTambahan("C:\\ada\\workspace").LOCALAPPDATA;
    expect(v.toLowerCase()).toContain("c:\\ada\\workspace");
    expect(v).not.toContain(process.env.USERNAME || "\u0000");
  });

  test("kegagalan SENYAP 0xC0000142 dijelaskan, bukan lolos sebagai sukses", () => {
    // Program yang exe-nya terjangkau tapi DLL-nya tidak akan mati saat memuat
    // pustaka: exit 0xC0000142, stdout DAN stderr kosong. Tanpa penanganan
    // khusus itu terbaca sebagai "perintah selesai, hasilnya memang kosong" —
    // kesimpulan salah yang tak terbantah oleh apa pun di keluaran.
    const AC = require("../agent/tools/appcontainer-jail.cjs");
    expect(AC.jelaskanKode(0xc0000142)).toMatch(/STATUS_DLL_INIT_FAILED/);
    expect(AC.jelaskanKode(0xc0000142)).toMatch(
      /BUKAN berarti hasilnya kosong/,
    );
    expect(AC.jelaskanKode(0)).toBeNull();
    expect(AC.jelaskanKode(1)).toBeNull();
  });

  test("kegagalan dir/vol dijelaskan sebagai info volume, bukan izin folder", () => {
    const AC = require("../agent/tools/appcontainer-jail.cjs");
    expect(AC.jelaskan("Access is denied.", "dir /b")).toMatch(/Get-ChildItem/);
    expect(AC.jelaskan("Access is denied.", "vol")).toMatch(/info volume/);
    // Tidak boleh menempel di perintah lain yang kebetulan ditolak.
    expect(AC.jelaskan("Access is denied.", "type rahasia.txt")).toBe(
      "Access is denied.",
    );
  });

  test("bash MEMBUNGKUS shell, tidak bercabang ke eksekusi sendiri", () => {
    // Cabang terpisah dengan execFileSync tampak bekerja lalu mematahkan dua
    // hal yang tak terlihat dari hasilnya: ia memblokir event loop (UI Electron
    // membeku tiap perintah) dan melewati AbortController, sehingga pembatalan
    // user dan pembedaan TIMEOUT vs DIBATALKAN ikut hilang.
    const idx = fs.readFileSync(
      path.join(AKAR, "agent", "tools", "index.cjs"),
      "utf8",
    );
    expect(idx).toMatch(/_bungkusAc\.bungkus\(cwd, shBin, shArgs\)/);
    expect(idx).not.toMatch(/_ac\.jalankan\(/);
  });

  test("berkas skrip perintah diarahkan ke dalam jangkauan container", () => {
    // Perintah dijalankan LEWAT berkas .cmd. Bawaannya temp sistem, yang
    // tertutup untuk container — akibatnya setiap perintah gagal sebelum mulai.
    const idx = fs.readFileSync(
      path.join(AKAR, "agent", "tools", "index.cjs"),
      "utf8",
    );
    expect(idx).toMatch(/scriptDir: _dirSkripAc\(cwd\)/);
    const win = fs.readFileSync(
      path.join(AKAR, "agent", "platform", "windows.cjs"),
      "utf8",
    );
    expect(win).toMatch(/opts\.scriptDir \|\| os\.tmpdir\(\)/);
  });
});

describe("satu workspace pada satu waktu", () => {
  // Lubang yang ditutup di sini tidak terlihat dari perintah mana pun: hibah
  // untuk workspace lama TETAP menempel sesudah agent pindah folder. Sehari
  // dipakai, "terkurung di satu direktori" diam-diam berubah jadi "terkurung
  // di gabungan semua direktori yang pernah dibuka", dan satu-satunya cara
  // menemukannya adalah memeriksa ACL folder demi folder.
  const AC = require("../agent/tools/appcontainer-jail.cjs");

  test("hibah dicatat di luar proses, karena ACL tak punya indeks per-subjek", () => {
    // Windows menyimpan ACL PER OBJEK. Tak ada API "folder mana saja yang
    // terbuka untuk SID ini", jadi tanpa catatan ini hibah lama menjadi tak
    // terlihat sekaligus tak mungkin dicabut.
    const d = AC.daftarAkses();
    expect(Array.isArray(d.kerja)).toBe(true);
    expect(d.berkas).toMatch(/ac-hibah\.json$/);
  });

  test("runtime bersama tidak ikut dicabut", () => {
    // Mencabut ini akan mematikan setiap perintah, dan tak ada gunanya:
    // keduanya baca+jalankan saja dan tak memuat data pengguna.
    const d = AC.daftarAkses();
    expect(d.tetap).toEqual(expect.arrayContaining(["c:\\langs"]));
    expect(d.tetap.some((x) => x.includes("git"))).toBe(true);
  });

  test("pencabutan bisa dimatikan SADAR, dan harganya tercatat", () => {
    const isi = fs.readFileSync(
      path.join(AKAR, "agent", "tools", "appcontainer-jail.cjs"),
      "utf8",
    );
    expect(isi).toMatch(/WOLFSPACE_AC_CABUT/);
    // Harganya nyata (±20 detik untuk workspace 46 ribu berkas) dan tertulis,
    // supaya yang mematikannya tahu persis apa yang sedang ditukar.
    expect(isi).toMatch(/0,24 ms per/);
  });

  test("siapUntuk ASINKRON, tidak memblokir event loop", () => {
    // Versi sinkronnya menahan seluruh proses ~20 detik saat berpindah
    // workspace besar. Di Electron itu UI yang membeku, bukan sekadar lambat.
    expect(AC.siapUntuk(process.cwd())).toBeInstanceOf(Promise);
    const idx = fs.readFileSync(
      path.join(AKAR, "agent", "tools", "index.cjs"),
      "utf8",
    );
    expect(idx).toMatch(/await _ac\.siapUntuk\(_confineRoot\)/);
  });
});

// Uji perilaku hanya bermakna kalau container memang terpasang di mesin ini.
// Di mesin lain profilnya tidak ada, dan melewatkan uji lebih jujur daripada
// menyatakan lulus.
const siap = process.platform === "win32" && AC.tersedia().siap;
const bila = siap ? describe : describe.skip;

bila("perilaku nyata di dalam container", () => {
  const jalankan = (c) => AC.jalankan(c, { cwd: AKAR, timeout: 90000 });

  test("workspace bisa dibaca", async () => {
    const r = await jalankan("(Get-ChildItem '" + AKAR + "').Count");
    expect(r.penegakan).toBe("kernel");
    expect(r.mekanisme).toBe("appcontainer");
    expect(Number(String(r.output).trim())).toBeGreaterThan(0);
  });

  test("workspace bisa ditulis lalu dibersihkan", async () => {
    const f = path.join(AKAR, "_uji_ac_tulis.txt");
    const r = await jalankan(
      "Set-Content -LiteralPath '" +
        f +
        "' -Value 'ok'; " +
        "Get-Content -LiteralPath '" +
        f +
        "'; " +
        "Remove-Item -LiteralPath '" +
        f +
        "' -Force",
    );
    expect(String(r.output)).toContain("ok");
    expect(fs.existsSync(f)).toBe(false);
  });

  test("penulisan di luar workspace ditolak", async () => {
    const r = await jalankan(
      "try { 'x' | Out-File 'C:\\Users\\dave\\Desktop\\_uji_ac.txt' -EA Stop; 'TEMBUS' } " +
        "catch { 'ditolak' }",
    );
    expect(String(r.output)).toContain("ditolak");
    expect(String(r.output)).not.toContain("TEMBUS");
  });

  test("path yang DIRAKIT saat jalan tetap ditolak", async () => {
    // Inilah yang membedakan batas kernel dari pemindai teks. Tak ada token
    // 'Desktop' di perintah ini untuk dipindai siapa pun; yang menolak hanya
    // bisa kernel.
    const r = await jalankan(
      "$p = [string]::Join('', ([int[]](67,58,92,85,115,101,114,115,92,100,97,118,101,92,68,101,115,107,116,111,112) | ForEach-Object { [char]$_ })); " +
        "try { New-Item -ItemType Directory -Path ($p + '\\_uji_ac_rakit') -EA Stop | Out-Null; 'TEMBUS' } " +
        "catch { 'ditolak' }",
    );
    expect(String(r.output)).toContain("ditolak");
    expect(String(r.output)).not.toContain("TEMBUS");
  });

  test("rahasia di luar workspace tak terbaca", async () => {
    const r = await jalankan(
      "try { Get-Content 'C:\\Users\\dave\\.wolfspace\\cloud-keys.json' -EA Stop | Out-Null; 'TEMBUS' } " +
        "catch { 'ditolak' }",
    );
    expect(String(r.output)).toContain("ditolak");
  });

  test("node tetap bisa dijalankan di dalam kurungan", async () => {
    // Kalau ini patah, kurungannya benar tapi tak berguna: agent tak bisa
    // menjalankan apa pun.
    const r = await jalankan("& (Get-Command node).Source --version");
    expect(String(r.output)).toMatch(/^v?\d+\./m);
  });
});
