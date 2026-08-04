// %VAR% tak lagi jadi jalan memutar penjaga path bash.
//
// KENAPA ADA. Penjaga path (_HOST_PATH_RE) memeriksa STRING perintah sebelum
// dijalankan, mencari pola seperti "C:\". Tapi %VAR% baru diperluas DI DALAM
// cmd.exe — sesudah pemeriksaan selesai. Penjaga melihat "%TEMP%", shell
// melihat "C:\Users\dave\AppData\Local\Temp". Dua string berbeda, dan yang
// menyentuh disk adalah yang kedua.
//
// Terukur sebelum perbaikan, dengan worktree DI LUAR TEMP supaya tak bisa
// dibantah sebagai "cuma naik satu tingkat":
//     type C:\...\rahasia.txt   -> DITAHAN
//     type %TEMP%\rahasia.txt   -> BOCOR
//     type %TMP%\rahasia.txt    -> BOCOR
//     type %USERPROFILE%\...    -> BOCOR
// Dan bukan hipotesis: dari 44 perintah bash di berkas debug nyata, 4 memakai
// %USERPROFILE%\Desktop — agent memang sudah keluar lewat jalan ini.
//
// Menambal regex tak menyelesaikannya (jumlah variabel tak terbatas, plus
// %CD%, substring expansion %TEMP:~0,3%, dan penyambungan lewat `set`). Yang
// ditutup SUMBERNYA: kalau variabelnya tak menunjuk ke luar, ia tak bisa
// diperluas jadi jalan keluar.

const fs = require("fs");
const path = require("path");
const { runSelfTool } = require("../agent/tools.cjs");

const noop = () => {};
const AKAR = process.env.LOCALAPPDATA || require("os").tmpdir();

function siapkanWorktree(nama) {
  // Worktree sengaja DI LUAR TEMP: kalau ia anak TEMP, %TEMP% kebetulan
  // menunjuk ke induknya dan hasilnya bisa dibantah.
  const ws = path.join(AKAR, nama);
  fs.rmSync(ws, { recursive: true, force: true });
  fs.mkdirSync(ws, { recursive: true });
  return ws;
}

describe("%VAR% tak lagi menembus penjaga path", () => {
  const NAMA = "rahasia-uji-env.txt";
  const ISI = "INI-RAHASIA-DI-LUAR";
  const RAHASIA = path.join(require("os").tmpdir(), NAMA);
  let WS;

  beforeAll(() => {
    fs.writeFileSync(RAHASIA, ISI);
    WS = siapkanWorktree("wolf-test-env-kurung");
  });
  afterAll(() => {
    fs.rmSync(RAHASIA, { force: true });
    fs.rmSync(WS, { recursive: true, force: true });
  });

  const jalan = (cmd) =>
    runSelfTool("bash", { command: cmd, timeout: 20000 }, noop, {
      workspaceRoot: WS,
    });

  test("path host yang ditulis TERANG tetap ditahan penjaga", async () => {
    const r = await jalan("type " + RAHASIA);
    expect(String(r.output || "")).not.toContain(ISI);
    expect(r.output).toMatch(/TERKURUNG WORKSPACE/);
  }, 30000);

  test.each([
    ["%TEMP%", "type %TEMP%\\" + NAMA],
    ["%TMP%", "type %TMP%\\" + NAMA],
    ["%USERPROFILE%", "type %USERPROFILE%\\AppData\\Local\\Temp\\" + NAMA],
    ["%HOMEPATH%", "type %HOMEDRIVE%%HOMEPATH%\\AppData\\Local\\Temp\\" + NAMA],
  ])(
    "%s tidak lagi mengantar ke luar worktree",
    async (_l, cmd) => {
      const r = await jalan(cmd);
      expect(String(r.output || "")).not.toContain(ISI);
    },
    30000,
  );

  test("cmd.exe MENYUNTIK variabel identitas — jadi ditimpa, bukan dihapus", async () => {
    // Menyaring saja tidak cukup di Windows: cmd.exe memasok HOMEDRIVE,
    // HOMEPATH, USERPROFILE, USERNAME dsb dari token proses, terlepas dari blok
    // environment yang diberikan. Terukur: sesudah allowlist dipasang,
    // %USERPROFILE% MASIH menembus — satu-satunya dari empat kasus.
    const r = await jalan("echo %USERPROFILE%");
    expect(r.output).toContain(WS);
    expect(r.output).not.toMatch(/Users\\dave$/m);
  }, 30000);

  test("TEMP diarahkan ke DALAM worktree, bukan dihapus", async () => {
    // Dihapus akan mematikan alat yang menulis berkas sementara (npm, python,
    // kompilator). Diarahkan membuat berkasnya mendarat di dalam cakupan.
    const r = await jalan("echo uji > %TEMP%\\sementara.txt");
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(WS, "sementara.txt"))).toBe(true);
  }, 30000);
});

describe("pekerjaan SAH tidak ikut mati", () => {
  // Sisi yang paling mudah rusak dan paling mahal kalau terlewat: penjaga yang
  // mematikan pemakaian wajar lebih buruk daripada tak ada penjaga, karena
  // agent jadi buntu tanpa sebab yang terlihat. Perintahnya diambil dari
  // pemakaian NYATA di berkas debug (44 perintah tercatat).
  let WS;
  beforeAll(() => {
    WS = siapkanWorktree("wolf-test-env-sah");
    fs.writeFileSync(path.join(WS, "ada.txt"), "isi berkas\n");
  });
  afterAll(() => fs.rmSync(WS, { recursive: true, force: true }));

  test.each([
    ["node lewat PATH", 'node -e "console.log(2+3)"', "5"],
    ["dir di worktree", "dir", "ada.txt"],
    ["type berkas dalam worktree", "type ada.txt", "isi berkas"],
    ["mkdir lalu cd", "mkdir baru && cd baru && echo di-dalam", "di-dalam"],
    ["echo", "echo halo dunia", "halo dunia"],
  ])(
    "%s tetap jalan",
    async (_l, cmd, harap) => {
      const r = await runSelfTool(
        "bash",
        { command: cmd, timeout: 20000 },
        noop,
        {
          workspaceRoot: WS,
        },
      );
      expect(r.output).toContain(harap);
    },
    30000,
  );
});

describe("struktur: allowlist ada, dan jujur soal batasnya", () => {
  const SRC = fs
    .readFileSync(require.resolve("../agent/tools/index.cjs"), "utf8")
    .replace(/\r\n/g, "\n");

  test("bash TIDAK lagi mewarisi process.env utuh", () => {
    const i = SRC.indexOf("getPlatformAdapter().shellFor(cmd)");
    const blok = SRC.slice(i, i + 400);
    expect(blok).toMatch(/env: _envBash\(cwd\)/);
    expect(blok).not.toMatch(/env: \{ \.\.\.process\.env/);
  });

  test("variabel yang disuntik cmd.exe DITIMPA, bukan sekadar tak di-allowlist", () => {
    const i = SRC.indexOf("function _envBash");
    const blok = SRC.slice(i, i + 2200);
    for (const v of ["USERPROFILE", "HOMEDRIVE", "HOMEPATH", "USERNAME"])
      expect(blok).toMatch(new RegExp("out\\." + v + " ="));
    // Dan justru TIDAK boleh ada di allowlist: kalau di-allowlist, nilai
    // host-nya yang diteruskan — persis kebocoran yang ditutup. Yang diperiksa
    // isi ARRAY-nya, bukan blok fungsi, karena _envBash merujuk array itu
    // sehingga pencarian lintas-baris cocok secara sepele.
    const arr = SRC.slice(
      SRC.indexOf("const _ENV_BASH_IZIN = ["),
      SRC.indexOf("];", SRC.indexOf("const _ENV_BASH_IZIN = [")),
    );
    for (const v of ["USERPROFILE", "HOMEPATH", "HOMEDRIVE", "APPDATA", "TEMP"])
      expect(arr).not.toContain(v);
  });

  test("ada jalan keluar darurat, dan hanya untuk yang MELUNCURKAN aplikasi", () => {
    // Agent tak bisa menyentuh env proses backend, jadi opt-out ini aman —
    // tapi ia harus ada, supaya user tak buntu bila ada alat yang benar-benar
    // butuh env penuh.
    const i = SRC.indexOf("function _envBash");
    expect(SRC.slice(i, i + 600)).toMatch(/WOLFSPACE_BASH_ENV === "full"/);
  });

  test("komentarnya JUJUR: ini bukan pengurungan sungguhan", () => {
    // Penting untuk pembaca berikutnya. Ini menutup satu keluarga pelarian,
    // bukan membuat shell tak bisa menjangkau luar — path absolut yang ditulis
    // terang masih bergantung pada penjaga regex yang bisa ditembus cara lain.
    const i = SRC.indexOf("Environment bash TIDAK lagi diwariskan utuh");
    expect(i).toBeGreaterThan(-1);
    expect(SRC.slice(i, i + 2000)).toMatch(/BUKAN pengurungan sungguhan/);
  });
});

describe("perintah yang KELUAR worktree diblokir: temp, shell, powershell", () => {
  // Tiga permukaan yang diminta ditutup, diuji sebagai satu kesatuan.
  //
  // Dua mekanisme bekerja bersama, dan keduanya perlu:
  //   - penjaga path menangkap yang menulis lokasi TERANG-TERANGAN, termasuk
  //     `set A=...` lalu %A%, substring expansion, pushd, dan ....  //   - env yang dipangkas mematikan yang MENYEMBUNYIKANNYA di balik variabel:
  //     %TEMP%, %USERPROFILE%, $env:TEMP, $HOME, dan
  //     [Environment]::GetFolderPath — PowerShell membaca variabel proses yang
  //     sama, jadi memangkas env menutup jalur PowerShell sekaligus.
  //
  // Kalau salah satu mekanisme dilepas, separuh daftar ini akan bocor.
  const os = require("os");
  const NAMA = "rahasia-uji-keluar.txt";
  const ISI = "RAHASIA-DI-LUAR-WORKTREE";
  const RAHASIA = path.join(os.tmpdir(), NAMA);
  const TMPDIR = os.tmpdir();
  const ps = (inner) => 'powershell -NoProfile -Command "' + inner + '"';
  let WS;

  beforeAll(() => {
    fs.writeFileSync(RAHASIA, ISI);
    WS = siapkanWorktree("wolf-test-keluar");
  });
  afterAll(() => {
    fs.rmSync(RAHASIA, { force: true });
    fs.rmSync(WS, { recursive: true, force: true });
  });

  test.each([
    ["temp: %TEMP%", "type %TEMP%\\" + NAMA],
    ["temp: %TMP%", "type %TMP%\\" + NAMA],
    ["temp: $env:TEMP lewat powershell", ps("Get-Content $env:TEMP\\" + NAMA)],
    ["shell: path absolut", "type " + RAHASIA],
    ["shell: %USERPROFILE%", "type %USERPROFILE%\AppData\Local\Temp\\" + NAMA],
    [
      "shell: set var lalu pakai",
      'cmd /c "set A=' + TMPDIR + "& type %A%\\" + NAMA + '"',
    ],
    [
      "shell: substring expansion",
      'cmd /c "set A=' + TMPDIR + "& type %A:~0,99%\\" + NAMA + '"',
    ],
    ["shell: naik lewat ..", "type ..\..\Local\Temp\\" + NAMA],
    [
      "shell: pushd lalu type",
      'cmd /c "pushd ' + TMPDIR + " & type " + NAMA + '"',
    ],
    ["powershell: path absolut", ps("Get-Content '" + RAHASIA + "'")],
    [
      "powershell: GetFolderPath",
      ps(
        "Get-Content (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Temp\\" +
          NAMA +
          "')",
      ),
    ],
    [
      "powershell: resolve lewat ..",
      ps("Get-Content ..\..\Local\Temp\\" + NAMA),
    ],
    ["powershell: $HOME", ps("Get-Content $HOME\AppData\Local\Temp\\" + NAMA)],
  ])(
    "%s tidak mengeluarkan isi berkas",
    async (_l, cmd) => {
      const r = await runSelfTool(
        "bash",
        { command: cmd, timeout: 25000 },
        noop,
        {
          workspaceRoot: WS,
        },
      );
      expect(String(r.output || "")).not.toContain(ISI);
    },
    40000,
  );
});
