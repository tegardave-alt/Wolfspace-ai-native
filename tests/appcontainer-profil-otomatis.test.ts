// The sandbox has to work on a machine nobody prepared.
//
// WHAT WAS WRONG. AppContainer confinement was never active for anyone except
// the person who had run scripts/appcontainer/pasang.ps1 by hand. That script
// is named in three error messages and called by none of them, and build.files
// is an explicit allowlist that never included it -- so an installed WOLFSPACE
// told the user the sandbox was off and pointed at a file that was not on their
// machine.
//
// WHICH HALF WAS MISSING, measured rather than assumed. Deriving the container
// SID works with no profile at all, and granting the workspace ACL works too --
// both succeeded. The launch did not:
//
//   no registered profile   -> CreateProcessW gagal: kode 2, exit 7
//   after --buat-profil     -> "ready", exit 0
//
// Byte-for-byte the same command. Only CreateAppContainerProfile was missing,
// it needs no elevation, and nothing in the app ever called it.
//
// One more thing was checked before wiring it in, because it would have made
// the fix useless: whether the probe needs its working directory to be granted
// first. It does not -- a freshly registered container ran with cwd set to a
// folder holding no grant for its SID -- so there is no ordering trap where the
// probe must pass before siapUntuk() is allowed to grant anything.
//
// WHY CI IS THE REAL TEST HERE, once it is pointed at the right runner. A
// fresh GitHub VM has no profile and nobody who ever ran a setup script:
// exactly the machine this is about. The developer machine cannot prove it,
// because it was prepared by hand long ago.
//
// THE FIRST ATTEMPT AIMED AT THE WRONG JOB. The build step was added to the
// `test` job and called a clean-machine run -- but `test` is ubuntu-latest,
// so every describe here skipped itself and building AcLaunch.exe there did
// nothing at all. The claim read true for as long as nobody checked which
// runner it named. It is now run from `build-electron`, which is
// windows-latest.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const EXE = path.join(AKAR, "scripts", "appcontainer", "AcLaunch.exe");
const baca = (rel: string) => fs.readFileSync(path.join(AKAR, rel), "utf8");

/** Assertions must read CODE. The first version of the test below did not,
 *  and it failed on this file's own doing: the comment explaining the removal
 *  QUOTES the sentence that was removed, so a plain search found it and called
 *  the fix undone. This repo has been bitten by that repeatedly -- a test that
 *  reads prose fails exactly when the prose is right. */
const tanpaKomentar = (t: string) =>
  t
    .split(String.fromCharCode(10))
    .filter((b: string) => {
      const s = b.trim();
      return !(s.startsWith("//") || s.startsWith("*") || s.startsWith("/*"));
    })
    .join(String.fromCharCode(10));

/** Windows only, and only once the launcher has been compiled. Skipping is
 *  reported rather than silent: a guard that quietly disappears is how this
 *  whole class of bug survived in the first place. */
const bisaJalan = process.platform === "win32" && fs.existsSync(EXE);
const bila = bisaJalan ? describe : describe.skip;

// MELEWATI DIAM-DIAM ADALAH KEGAGALAN, DI CI.
//
// Kalau AcLaunch.exe tak terbangun, `bila` di atas menjadi describe.skip dan
// seluruh berkas ini lulus tanpa menguji apa pun -- persis cara bug ini
// bertahan begitu lama. Di mesin pengembang itu wajar: belum semua orang
// menjalankan `npm run build:aclaunch`. Di CI tidak: langkah itu ada di ci.yml
// justru supaya uji ini berjalan, dan hilangnya langkah tersebut harus terdengar.
//
// Dua penjaga di bawah ini ada karena log CI TIDAK BISA DIBACA tanpa
// autentikasi (endpoint log menjawab 403 untuk permintaan anonim), jadi
// "apakah ujinya benar-benar berjalan di sana" tak bisa diperiksa dengan mata.
// Ia harus dijawab oleh ujinya sendiri.
describe("penjaga ini tidak boleh menghilang tanpa suara", () => {
  test("di CI Windows, peluncurnya WAJIB sudah terbangun", () => {
    if (process.platform !== "win32" || !process.env.CI) {
      expect(true).toBe(true); // bukan mesin yang dijanjikan apa-apa
      return;
    }
    expect(bisaJalan).toBe(true);
  });

  test("ci.yml menjalankan berkas ini di job WINDOWS, bukan di job ubuntu", () => {
    // Sumber kebenaran untuk janji di atas, dan ia dulu menunjuk job yang
    // SALAH: ia memeriksa job `test`, yang berjalan di ubuntu-latest -- di
    // mana seluruh berkas ini melewati dirinya sendiri. Asersinya lulus, dan
    // yang dijaganya tidak pernah berjalan sekali pun.
    const yml = baca(".github/workflows/ci.yml");
    const i = yml.indexOf("build-electron:");
    expect(i).toBeGreaterThan(-1);
    const jobWin = yml.slice(i);
    expect(jobWin).toContain("runs-on: windows-latest");
    expect(jobWin).toContain("npm run build:aclaunch");
    expect(jobWin).toContain("tests/appcontainer-profil-otomatis.test.ts");
  });
});

let _sisa: string[] = [];

/** Removes a profile this test created. Real cleanup, not best effort: these
 *  are per-user Windows objects and leaving them behind litters the machine. */
function hapusProfil(nama: string) {
  const ps =
    "Add-Type -Namespace WX -Name P -MemberDefinition " +
    '\'[DllImport("userenv.dll", CharSet=CharSet.Unicode)] ' +
    "public static extern int DeleteAppContainerProfile(string name);'; " +
    "[void][WX.P]::DeleteAppContainerProfile('" +
    nama +
    "')";
  try {
    execFileSync("powershell", ["-NoProfile", "-Command", ps], {
      stdio: "ignore",
      timeout: 30000,
      windowsHide: true,
    });
  } catch (_) {}
}

const namaBaru = () =>
  "wolfspace-uji-" + Date.now() + "-" + Math.floor(Math.random() * 100000);

afterAll(() => {
  for (const n of _sisa) hapusProfil(n);
  _sisa = [];
});

bila("profil kontainer didaftarkan sendiri", () => {
  test("--buat-profil membuat, lalu idempoten", () => {
    const nama = namaBaru();
    _sisa.push(nama);
    const satu = String(
      execFileSync(EXE, ["--buat-profil", nama], {
        encoding: "utf8",
        timeout: 30000,
        windowsHide: true,
      }),
    );
    expect(satu).toContain("dibuat");
    // Idempotence is not tidiness here: the probe calls this on every failure,
    // so "already exists" has to be a SUCCESS or the second run would report a
    // failure that is really the wanted state.
    const dua = String(
      execFileSync(EXE, ["--buat-profil", nama], {
        encoding: "utf8",
        timeout: 30000,
        windowsHide: true,
      }),
    );
    expect(dua).toContain("ada");
  }, 60000);

  test("mesin tanpa profil: tersediaAsync SIAP tanpa penyiapan manual", () => {
    const nama = namaBaru();
    _sisa.push(nama);
    // A child process, because the container name is read once at module load.
    const keluaran = String(
      execFileSync(
        process.execPath,
        [
          "-e",
          [
            "require('./scripts/ts-register.cjs');",
            "const ac = require('./agent/tools/appcontainer-jail.ts');",
            "ac.tersediaAsync().then(function (r) {",
            "  console.log('HASIL ' + JSON.stringify(r));",
            "  process.exit(0);",
            "});",
          ].join(" "),
        ],
        {
          cwd: AKAR,
          encoding: "utf8",
          timeout: 120000,
          windowsHide: true,
          env: Object.assign({}, process.env, { WOLFSPACE_AC_NAME: nama }),
        },
      ),
    );
    expect(keluaran).toContain("HASIL");
    const hasil = JSON.parse(keluaran.slice(keluaran.indexOf("HASIL") + 6));
    // Before the fix this was { siap: false } with "CreateProcessW gagal: kode 2".
    expect(hasil.alasan).toBe("");
    expect(hasil.siap).toBe(true);
  }, 180000);
});

describe("penyiapan otomatis tidak menaikkan hak", () => {
  const JAIL = baca("agent/tools/appcontainer-jail.ts");
  const CS = baca("scripts/appcontainer/AcLaunch.cs");

  test("tak ada permintaan elevasi di jalur AppContainer", () => {
    // Registering a profile is a per-user operation. The moment this path asks
    // for Administrator it stops being something that can run silently at
    // startup -- and raising the whole app to lower one command is the trade
    // this project already rejected once, when WOLFSPACE_BASH_ACL was removed.
    for (const src of [JAIL, CS]) {
      expect(src).not.toMatch(/runas/i);
      expect(src).not.toContain("RunAsAdministrator");
    }
  });

  test("kedua probe mencoba mendaftar lalu menguji ULANG", () => {
    // One retry, and only one. Without the re-probe the registration would
    // happen and the answer would still be the stale failure.
    expect(JAIL).toContain("_pastikanProfil()");
    expect(JAIL).toContain("_pastikanProfilAsync()");
    expect(JAIL).toContain("profilDicoba");
  });
});

describe("pesan tak lagi menunjuk berkas yang tak dikirim", () => {
  test("catatan bash tidak menyuruh menjalankan pasang.ps1", () => {
    // build.files is an allowlist and names only AcLaunch.exe, so this
    // instruction could never be followed by an installed user.
    expect(tanpaKomentar(baca("agent/tools/index.ts"))).not.toContain(
      "jalankan scripts/appcontainer/pasang.ps1",
    );
  });

  test("build.files tetap daftar-izin, dan peluncurnya ada di dalamnya", () => {
    const f = JSON.parse(baca("package.json")).build.files;
    expect(f).toContain("scripts/appcontainer/AcLaunch.exe");
    // No blanket scripts/** — that is what keeps config/mcp.json and its live
    // tokens out of the installer.
    expect(f).not.toContain("scripts/**");
  });
});
