// Commit perubahan workspace dari panel git.
//
// KENAPA ADA. Panel workspace sudah menampilkan "N uncommitted changes" tapi tak
// punya cara untuk meng-commit-nya — angka yang hanya bisa dilihat, tak bisa
// ditindaklanjuti. Endpoint /ww/commit dan tombolnya menutup itu.
//
// YANG DIJAGA DI SINI adalah dua sifat yang gampang rusak diam-diam:
//   1. Yang di-commit HARUS sepadan dengan angka yang ditampilkan. Angka itu
//      dihitung dari `git status --porcelain` (seluruh working tree), jadi
//      commit-nya memakai `add -A`. Tombol yang meng-commit lebih sedikit
//      daripada yang diperlihatkan angkanya menyesatkan, dan orang baru sadar
//      setelah mengira pekerjaannya tersimpan.
//   2. Commit TANPA pesan tak boleh ada. Riwayat git yang penuh pesan seragam
//      tak bisa dibaca lagi justru saat paling dibutuhkan.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const ww = require("../scripts/ww.ts");

const git = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

describe("commitAll", () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "wwcommit-"));
  });
  afterEach(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  });

  const jadikanRepo = () => {
    git(["init", "-b", "main"], dir);
    git(["config", "user.name", "uji"], dir);
    git(["config", "user.email", "uji@local"], dir);
    fs.writeFileSync(path.join(dir, "a.txt"), "satu");
    git(["add", "-A"], dir);
    git(["commit", "-m", "awal"], dir);
  };

  test("menolak folder yang bukan repo", async () => {
    expect((await ww.commitAll(dir, "apa saja")).ok).toBe(false);
  });

  test("menolak pesan kosong — TIDAK diam-diam memakai pesan bawaan", async () => {
    jadikanRepo();
    fs.writeFileSync(path.join(dir, "b.txt"), "dua");
    const r = await ww.commitAll(dir, "   ");
    expect(r.ok).toBe(false);
    expect(r.err).toMatch(/message/i);
    // Dan tak ada commit yang terlanjur dibuat.
    expect(git(["log", "--oneline"], dir).split("\n")).toHaveLength(1);
  });

  test("menolak saat memang tak ada perubahan", async () => {
    jadikanRepo();
    const r = await ww.commitAll(dir, "tak ada apa-apa");
    expect(r.ok).toBe(false);
    expect(r.err).toMatch(/nothing to commit/i);
  });

  test("commit berhasil dan working tree jadi bersih", async () => {
    jadikanRepo();
    fs.writeFileSync(path.join(dir, "b.txt"), "dua");
    const r = await ww.commitAll(dir, "feat: tambah b");
    expect(r.ok).toBe(true);
    expect(r.hash).toMatch(/^[0-9a-f]{7,}$/);
    expect(git(["status", "--porcelain"], dir)).toBe("");
  });

  test("PENGHAPUSAN ikut ter-commit, bukan cuma berkas baru", async () => {
    // `git add .` versi lama tak mementaskan penghapusan; angka di panel
    // menghitungnya, jadi commit-nya harus ikut. Kalau tidak, panel akan tetap
    // melaporkan perubahan tersisa sesudah orang menekan Commit.
    jadikanRepo();
    fs.rmSync(path.join(dir, "a.txt"));
    fs.writeFileSync(path.join(dir, "c.txt"), "tiga");
    expect((await ww.commitAll(dir, "chore: tukar berkas")).ok).toBe(true);
    expect(git(["ls-tree", "--name-only", "HEAD"], dir)).toBe("c.txt");
    expect(git(["status", "--porcelain"], dir)).toBe("");
  });

  test("hanya baris pertama jadi subject", async () => {
    // `git log --oneline` tak terbaca lagi kalau seluruh badan pesan ikut.
    jadikanRepo();
    fs.writeFileSync(path.join(dir, "b.txt"), "dua");
    const r = await ww.commitAll(
      dir,
      "fix: satu baris\n\nbadan panjang di bawah",
    );
    expect(r.subject).toBe("fix: satu baris");
    expect(git(["log", "--format=%s", "-1"], dir)).toBe("fix: satu baris");
  });
});

describe("jalur HTTP dan UI terpasang", () => {
  test("/ww/commit terdaftar di dispatcher dan memanggil commitAll", () => {
    const S = fs.readFileSync(require.resolve("../server.ts"), "utf8");
    expect(S).toMatch(/req\.url === "\/ww\/commit"/);
    expect(S).toMatch(/ww\.commitAll\(b\.path, b\.message\)/);
  });

  test("tombol muncul HANYA saat ada perubahan", () => {
    // Tombol commit pada working tree bersih tak melakukan apa pun kecuali
    // memberi pesan gagal — lebih baik tak ditampilkan.
    const B = fs.readFileSync(
      require.resolve("../public/app/Sidebar.tsx"),
      "utf8",
    );
    expect(B).toMatch(/\{g\.dirty && !committing &&/);
  });

  test("pesan kosong di UI = BATAL, bukan commit tanpa pesan", () => {
    const B = fs.readFileSync(
      require.resolve("../public/app/Sidebar.tsx"),
      "utf8",
    );
    const i = B.indexOf("const doCommit");
    const blok = B.slice(i, i + 500);
    expect(blok).toMatch(/if \(!m\) return;/);
  });
});

describe("jalur tulis git tidak lagi memblokir", () => {
  // WHY. These run on the "kerja" host, which is single-threaded. execFileSync
  // there holds its only thread, so a slow commit stalled every other /ww call
  // behind it -- the file tree went quiet while git worked. Splitting the hosts
  // stopped that reaching the file tree; this stops it reaching the rest of
  // /ww as well.
  const fsx = require("fs");
  const pathx = require("path");
  const WW = fsx.readFileSync(
    pathx.join(__dirname, "..", "scripts", "ww.ts"),
    "utf8",
  );
  const SRV = fsx.readFileSync(
    pathx.join(__dirname, "..", "server.ts"),
    "utf8",
  );
  // Sliced with indexOf rather than a RegExp built from a string: the escapes
  // needed for that do not survive being written through a shell, and a broken
  // pattern fails as a SyntaxError that looks like a code fault rather than a
  // test fault.
  const isi = (nama) => {
    const mulai = WW.indexOf("async function " + nama + "(");
    expect(mulai).toBeGreaterThan(-1);
    const akhir = WW.indexOf("\n}", mulai);
    expect(akhir).toBeGreaterThan(mulai);
    return WW.slice(mulai, akhir);
  };

  test("there is an async twin of gitRun", () => {
    expect(WW).toMatch(/function gitRunAsync\(args: any, cwd: any\)/);
    expect(WW).toMatch(/execFile\(\s*\n?\s*"git"/);
  });

  test("every write path is async and awaits git", () => {
    for (const nama of [
      "switchBranch",
      "createBranch",
      "renameBranch",
      "deleteBranch",
      "commitAll",
    ]) {
      const blok = isi(nama);
      expect(blok).not.toMatch(/gitRun\(/);
      expect(blok).not.toMatch(/gitTry\(/);
    }
  });

  test("commitAll reads status and hash without blocking either", () => {
    const blok = isi("commitAll");
    expect(blok).toMatch(/await gitTryAsync\(\["status", "--porcelain"\]/);
    expect(blok).toMatch(/await gitRunAsync\(\["add", "-A"\]/);
    expect(blok).toMatch(/await gitRunAsync\(\["commit", "-m", subject\]/);
    expect(blok).toMatch(
      /await gitTryAsync\(\["rev-parse", "--short", "HEAD"\]/,
    );
  });

  test("the route awaits them, or it would answer with a Promise", () => {
    // Returning the promise itself would send `{}` to the UI and look like a
    // silent failure -- the same shape of bug as the null-body regression.
    expect(SRV).toMatch(/await ww\.commitAll\(b\.path, b\.message\)/);
    expect(SRV).toMatch(/await ww\.switchBranch\(/);
    expect(SRV).toMatch(/req\.on\("end", async \(\) => \{/);
  });
});
