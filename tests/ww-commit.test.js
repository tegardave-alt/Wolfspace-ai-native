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
const ww = require("../scripts/ww.cjs");

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

  test("menolak folder yang bukan repo", () => {
    expect(ww.commitAll(dir, "apa saja").ok).toBe(false);
  });

  test("menolak pesan kosong — TIDAK diam-diam memakai pesan bawaan", () => {
    jadikanRepo();
    fs.writeFileSync(path.join(dir, "b.txt"), "dua");
    const r = ww.commitAll(dir, "   ");
    expect(r.ok).toBe(false);
    expect(r.err).toMatch(/pesan/i);
    // Dan tak ada commit yang terlanjur dibuat.
    expect(git(["log", "--oneline"], dir).split("\n")).toHaveLength(1);
  });

  test("menolak saat memang tak ada perubahan", () => {
    jadikanRepo();
    const r = ww.commitAll(dir, "tak ada apa-apa");
    expect(r.ok).toBe(false);
    expect(r.err).toMatch(/tidak ada perubahan/i);
  });

  test("commit berhasil dan working tree jadi bersih", () => {
    jadikanRepo();
    fs.writeFileSync(path.join(dir, "b.txt"), "dua");
    const r = ww.commitAll(dir, "feat: tambah b");
    expect(r.ok).toBe(true);
    expect(r.hash).toMatch(/^[0-9a-f]{7,}$/);
    expect(git(["status", "--porcelain"], dir)).toBe("");
  });

  test("PENGHAPUSAN ikut ter-commit, bukan cuma berkas baru", () => {
    // `git add .` versi lama tak mementaskan penghapusan; angka di panel
    // menghitungnya, jadi commit-nya harus ikut. Kalau tidak, panel akan tetap
    // melaporkan perubahan tersisa sesudah orang menekan Commit.
    jadikanRepo();
    fs.rmSync(path.join(dir, "a.txt"));
    fs.writeFileSync(path.join(dir, "c.txt"), "tiga");
    expect(ww.commitAll(dir, "chore: tukar berkas").ok).toBe(true);
    expect(git(["ls-tree", "--name-only", "HEAD"], dir)).toBe("c.txt");
    expect(git(["status", "--porcelain"], dir)).toBe("");
  });

  test("hanya baris pertama jadi subject", () => {
    // `git log --oneline` tak terbaca lagi kalau seluruh badan pesan ikut.
    jadikanRepo();
    fs.writeFileSync(path.join(dir, "b.txt"), "dua");
    const r = ww.commitAll(dir, "fix: satu baris\n\nbadan panjang di bawah");
    expect(r.subject).toBe("fix: satu baris");
    expect(git(["log", "--format=%s", "-1"], dir)).toBe("fix: satu baris");
  });
});

describe("jalur HTTP dan UI terpasang", () => {
  test("/ww/commit terdaftar di dispatcher dan memanggil commitAll", () => {
    const S = fs.readFileSync(require.resolve("../server.cjs"), "utf8");
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
