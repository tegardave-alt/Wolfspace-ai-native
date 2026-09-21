// The VS Code git layer, vendored and running: push, pull, fetch, stash, log,
// diff -- everything scripts/ww.ts never had.
//
// WHY IT IS VENDORED RATHER THAN WRITTEN. An inventory of the backend found no
// push, pull or fetch anywhere: WOLFSPACE could commit, and the commit stayed
// on one disk. Stash was created by the branch switcher and then could not be
// listed or restored from the panel. Log knew only the last commit. Rather
// than write each of these a second time, extensions/git/src/git.ts from
// microsoft/vscode is compiled AS-IS -- one import line pointed at a shim of
// the seven things it asks of 'vscode', zero logic changed. See
// vendor/vscode-git/README.md for the commit and the exact edits.
//
// A REAL REMOTE, not a mock. A bare repository stands in for GitHub, a second
// clone stands in for a colleague. What is asserted is what each command left
// behind on disk, because that is the only thing a user can see.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const gv = require(path.join(AKAR, "core", "git-vscode.ts"));

let base = "";
let kerja = "";
let pusat = "";
const g = (cwd: string, a: string[]) =>
  execFileSync("git", a, { cwd, stdio: "pipe", encoding: "utf8" }).trim();
const baca = (rel: string) =>
  fs.readFileSync(path.join(kerja, rel), "utf8").trim();

beforeAll(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-gv-"));
  pusat = path.join(base, "pusat.git");
  kerja = path.join(base, "kerja");
  g(base, ["init", "-q", "--bare", "-b", "main", pusat]);
  g(base, ["init", "-q", "-b", "main", kerja]);
  g(kerja, ["config", "user.email", "a@b.c"]);
  g(kerja, ["config", "user.name", "uji"]);
  fs.writeFileSync(path.join(kerja, "a.txt"), "satu");
  g(kerja, ["add", "."]);
  g(kerja, ["commit", "-qm", "awal"]);
  g(kerja, ["remote", "add", "origin", pusat]);
});

afterAll(() => {
  gv.lupakan();
  try {
    fs.rmSync(base, { recursive: true, force: true });
  } catch (_) {}
});

describe("remote: yang WOLFSPACE tidak pernah punya", () => {
  test("push dengan upstream: remote menerima commitnya", async () => {
    const r = await gv.repo(kerja);
    await r.push("origin", "main", true);
    expect(g(pusat, ["log", "main", "--oneline", "-1"])).toMatch(/awal$/);
    // Upstream really set: a later `pull` with no arguments knows where to go.
    expect(g(kerja, ["rev-parse", "--abbrev-ref", "main@{upstream}"])).toBe(
      "origin/main",
    );
  }, 60000);

  test("fetch melihat commit yang didorong orang lain", async () => {
    const lain = path.join(base, "lain");
    g(base, ["clone", "-q", pusat, lain]);
    g(lain, ["config", "user.email", "a@b.c"]);
    g(lain, ["config", "user.name", "lain"]);
    fs.writeFileSync(path.join(lain, "b.txt"), "dua");
    g(lain, ["add", "."]);
    g(lain, ["commit", "-qm", "dari-lain"]);
    g(lain, ["push", "-q", "origin", "main"]);

    const r = await gv.repo(kerja);
    await r.fetch({ remote: "origin" });
    const refs = await r.getRefs({});
    const jauh = refs.find((x: any) => x.name === "origin/main");
    expect(jauh).toBeTruthy();
    // origin/main is now AHEAD of local main -- fetch moved the remote ref,
    // and only that. The working tree is untouched until pull.
    expect(jauh.commit).not.toBe(g(kerja, ["rev-parse", "main"]));
    expect(fs.existsSync(path.join(kerja, "b.txt"))).toBe(false);
  }, 60000);

  test("pull membawa berkas orang lain masuk", async () => {
    const r = await gv.repo(kerja);
    await r.pull(false, "origin", "main");
    expect(baca("b.txt")).toBe("dua");
  }, 60000);
});

describe("stash: dibuat, DILIHAT, dikembalikan", () => {
  test("create -> getStashes -> pop, dan pekerjaan kembali utuh", async () => {
    const r = await gv.repo(kerja);
    fs.writeFileSync(path.join(kerja, "a.txt"), "kerja-belum-selesai");
    await r.createStash("uji simpanan", true);
    // Parked: the tree shows the committed content again.
    expect(baca("a.txt")).toBe("satu");
    const daftar = await r.getStashes();
    expect(daftar.length).toBe(1);
    expect(daftar[0].description).toContain("uji simpanan");
    await r.popStash(0);
    expect(baca("a.txt")).toBe("kerja-belum-selesai");
    expect((await r.getStashes()).length).toBe(0);
    g(kerja, ["checkout", "--", "a.txt"]);
  }, 60000);
});

describe("log dan diff", () => {
  test("log memuat riwayat, bukan hanya commit terakhir", async () => {
    const r = await gv.repo(kerja);
    const log = await r.log({ maxEntries: 10 });
    const pesan = log.map(
      (c: any) => c.message.split(String.fromCharCode(10))[0],
    );
    expect(pesan).toContain("awal");
    expect(pesan).toContain("dari-lain");
  }, 60000);

  test("diffWithHEAD menunjukkan perubahan yang belum di-commit", async () => {
    const r = await gv.repo(kerja);
    fs.writeFileSync(path.join(kerja, "a.txt"), "diubah");
    const d = await r.diffWithHEAD("a.txt");
    expect(d).toMatch(/-satu/);
    expect(d).toMatch(/\+diubah/);
    g(kerja, ["checkout", "--", "a.txt"]);
  }, 60000);
});

describe("dikirim, dibongkar, dan dicatat asal-usulnya", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(AKAR, "package.json"), "utf8"),
  );
  const README = fs.readFileSync(
    path.join(AKAR, "vendor", "vscode-git", "README.md"),
    "utf8",
  );
  const SERVER = fs.readFileSync(path.join(AKAR, "server.ts"), "utf8");

  test("build.files DAN asarUnpack memuat vendor/vscode-git", () => {
    // core/git-vscode.ts requires it through ts-register, which reads the .ts
    // from disk -- a file inside app.asar cannot be read that way. Both lists
    // or the installed app fails on the first push.
    expect(pkg.build.files).toContain("vendor/vscode-git/src/**");
    expect(pkg.build.asarUnpack).toContain("vendor/vscode-git/src/**");
    expect(pkg.build.files).toContain("vendor/vscode-git/LICENSE.txt");
  });

  test("lisensi MIT Microsoft ikut dikirim, dan README menyebut commitnya", () => {
    const lic = fs.readFileSync(
      path.join(AKAR, "vendor", "vscode-git", "LICENSE.txt"),
      "utf8",
    );
    expect(lic).toMatch(/MIT License/);
    expect(lic).toMatch(/Microsoft Corporation/);
    expect(README).toMatch(/Commit: `[0-9a-f]{12}`/);
  });

  test("rute remote dan stash tersambung di server", () => {
    for (const r of [
      "/ww/remote/push",
      "/ww/remote/pull",
      "/ww/remote/fetch",
      "/ww/stash/list",
      "/ww/stash/pop",
      "/ww/stash/drop",
      "/ww/log",
    ]) {
      expect(SERVER).toContain('"' + r + '"');
    }
  });

  test("berkas upstream dikecualikan dari prettier — diff terhadap upstream tetap bersih", () => {
    const ign = fs.readFileSync(path.join(AKAR, ".prettierignore"), "utf8");
    expect(ign).toContain("vendor/vscode-git/src/git.ts");
    expect(ign).toContain("vendor/vscode-git/src/util.ts");
  });
});
