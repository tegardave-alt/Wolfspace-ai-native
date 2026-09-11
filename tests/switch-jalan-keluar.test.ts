// A refused switch must offer a way through, not just a better excuse.
//
// THE COMPLAINT THAT PRODUCED THIS, and it was right: "you fixed the jam, not
// the problem -- I am on branch A, I want branch B, it errors, and it keeps
// happening." Everything before it made the refusal faster, clearer and better
// logged. None of it made the switch POSSIBLE. Telling someone to commit first
// is an explanation, not a solution.
//
// WHY IT RECURS HERE IN PARTICULAR: this repository's branches differ by 445
// files, 144 of them under public/vendor/monaco. Almost any work in progress
// touches a file that also differs, so git must refuse -- otherwise it would
// destroy that work. The refusal is correct every single time.
//
// TWO ANSWERS, BOTH THE USER'S TO GIVE:
//
//   bawa    `git checkout -m` -- the work comes along. What people usually
//           mean: it belongs on B, they were simply standing on A.
//   simpan  `git stash push -u` then switch -- park it, arrive clean.
//
// NEITHER IS THE DEFAULT. Both move uncommitted work, and moving someone's work
// unasked is not a convenience. The plain call still refuses exactly as before.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const ww = require(path.join(AKAR, "scripts", "ww.ts"));

let dir = "";
const g = (a: string[]) =>
  execFileSync("git", a, { cwd: dir, stdio: "ignore" });
const tulis = (t: string) => fs.writeFileSync(path.join(dir, "f.txt"), t);
const baca = () => fs.readFileSync(path.join(dir, "f.txt"), "utf8");
const cabang = () =>
  execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: dir,
    encoding: "utf8",
  }).trim();

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-sw-"));
  g(["init", "-q", "-b", "A", "."]);
  g(["config", "user.email", "a@b.c"]);
  g(["config", "user.name", "uji"]);
  tulis("versi-A");
  g(["add", "."]);
  g(["commit", "-qm", "A"]);
  g(["checkout", "-q", "-b", "B"]);
  tulis("versi-B");
  g(["commit", "-qam", "B"]);
  g(["checkout", "-q", "A"]);
  // The work in progress that will block the switch.
  tulis("KERJA-BELUM-SELESAI");
});

afterEach(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
});

describe("perilaku bawaan tidak berubah", () => {
  test("tanpa mode: tetap MENOLAK, dan pekerjaan tidak disentuh", async () => {
    const r = await ww.switchBranch(dir, "B");
    expect(r.ok).toBe(false);
    expect(String(r.err)).toMatch(/uncommitted changes/i);
    // The important half: nothing moved.
    expect(cabang()).toBe("A");
    expect(baca().trim()).toBe("KERJA-BELUM-SELESAI");
  }, 60000);
});

describe("mode bawa: pekerjaan ikut pindah", () => {
  // LIFTED FROM THE VS CODE GIT EXTENSION, which implements "Migrate Changes"
  // as stash -> checkout -> stash pop rather than as `checkout -m`:
  //
  //   } else if (choice === stash || choice === migrate) {
  //     if (await this._stash(repository, true)) {
  //       await item.run(repository, opts);
  //       if (choice === migrate) { await this.stashPopLatest(repository); }
  //
  // The difference is not cosmetic, and it is the whole reason this was
  // changed: `git stash pop` DOES NOT DROP THE STASH when it conflicts, while a
  // conflicted `checkout -m` leaves markers and nothing held in reserve.
  test("berpindah, dan saat pop bentrok pekerjaannya MASIH di simpanan", async () => {
    const r = await ww.switchBranch(dir, "B", { mode: "bawa" });
    expect(r.ok).toBe(true);
    expect(cabang()).toBe("B");
    // The work reached the working tree as conflict markers...
    expect(baca()).toContain("KERJA-BELUM-SELESAI");
    // ...AND it is still recoverable, which is the point.
    expect(typeof r.simpanan).toBe("string");
    expect(String(r.catatan)).toMatch(/STILL[\s\S]*stash|stash/i);
    const daftar = execFileSync("git", ["stash", "list"], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(daftar.trim().length).toBeGreaterThan(0);
  }, 60000);

  test("pop yang BERSIH tidak meninggalkan simpanan menggantung", async () => {
    // A file that does not differ between the branches pops cleanly, and then
    // there is no stash left to name -- reporting one would send the user
    // looking for something that is not there.
    fs.writeFileSync(path.join(dir, "bebas.txt"), "kerja-bebas");
    execFileSync("git", ["checkout", "--", "f.txt"], { cwd: dir });
    const r = await ww.switchBranch(dir, "B", { mode: "bawa" });
    expect(r.ok).toBe(true);
    expect(r.simpanan).toBeNull();
    expect(fs.readFileSync(path.join(dir, "bebas.txt"), "utf8").trim()).toBe(
      "kerja-bebas",
    );
  }, 60000);
});

describe("mode paksa: perubahan sengaja dibuang", () => {
  // VS Code's third option, "Force Checkout": cleanAll() then checkout. It
  // destroys work, so it is never a default and never silent -- but it is a
  // real answer when the changes were junk, and leaving it out would send the
  // user to a terminal for the one case the panel refuses to handle.
  test("berpindah, pohon kerja jadi milik branch tujuan", async () => {
    const r = await ww.switchBranch(dir, "B", { mode: "paksa" });
    expect(r.ok).toBe(true);
    expect(cabang()).toBe("B");
    expect(baca().trim()).toBe("versi-B");
    // Nothing was stashed: the user asked for the changes to go.
    expect(r.simpanan).toBeNull();
  }, 60000);
});

describe("mode simpan: pekerjaan diparkir", () => {
  test("berpindah bersih, dan ref simpanannya DIKEMBALIKAN", async () => {
    const r = await ww.switchBranch(dir, "B", { mode: "simpan" });
    expect(r.ok).toBe(true);
    expect(cabang()).toBe("B");
    // Arrived clean: the branch's own content, not the work in progress.
    expect(baca().trim()).toBe("versi-B");
    // Work that moves without saying where it went is work the user thinks is
    // gone. The id is what makes it recoverable.
    expect(typeof r.simpanan).toBe("string");
    expect(r.simpanan.length).toBeGreaterThan(6);
    expect(String(r.catatan)).toMatch(/stash/i);
  }, 60000);

  test("pekerjaannya benar-benar bisa dikembalikan", async () => {
    // RECOVERED ON THE BRANCH IT CAME FROM, and the first version of this test
    // got that wrong: popping onto B conflicts, because f.txt differs there --
    // which is correct git behaviour, not a fault in the stash. The realistic
    // recovery is to come back and pop.
    await ww.switchBranch(dir, "B", { mode: "simpan" });
    const kembali = await ww.switchBranch(dir, "A");
    expect(kembali.ok).toBe(true);
    execFileSync("git", ["stash", "pop"], { cwd: dir, stdio: "ignore" });
    expect(baca()).toContain("KERJA-BELUM-SELESAI");
  }, 60000);

  test("tanpa perubahan apa pun, tidak melaporkan simpanan palsu", async () => {
    // "No local changes to save" is a SUCCESS with nothing stashed, and must
    // not be reported as something the user could restore.
    g(["checkout", "-q", "--", "f.txt"]);
    const r = await ww.switchBranch(dir, "B", { mode: "simpan" });
    expect(r.ok).toBe(true);
    expect(r.simpanan).toBeNull();
  }, 60000);
});
