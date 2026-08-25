// The .ts transpile cache has a disk tier, and the ways it can go wrong are all
// quiet: it serves stale output, or it blocks startup, or it throws where the
// tree is read-only. None of those announce themselves — the app just behaves
// oddly, or a source edit appears not to take effect.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const HOOK = path.join(AKAR, "scripts", "ts-register.cjs");
const SRC = fs.readFileSync(HOOK, "utf8");

/** Load a throwaway .ts file through the hook, in a fresh process. */
function lewatHook(isi, env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tscache-"));
  const f = path.join(dir, "modul.ts");
  fs.writeFileSync(f, isi, "utf8");
  const out = execFileSync(
    process.execPath,
    [
      "-e",
      "require(" +
        JSON.stringify(HOOK) +
        "); const m = require(" +
        JSON.stringify(f) +
        "); process.stdout.write(String(m.nilai));",
    ],
    { encoding: "utf8", env: { ...process.env, ...env }, timeout: 60000 },
  );
  return { out, dir, f };
}

describe("cache transpile .ts di disk", () => {
  test("isi yang diedit TIDAK pernah disajikan versi lama", () => {
    // The whole risk of a disk cache in one test. The key is the file's content,
    // so an edit is a different key — but if that ever regressed to a path or an
    // mtime, an edited source would silently keep running its old compile.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tscache-"));
    const f = path.join(dir, "modul.ts");
    const jalankan = () =>
      execFileSync(
        process.execPath,
        [
          "-e",
          "require(" +
            JSON.stringify(HOOK) +
            "); process.stdout.write(String(require(" +
            JSON.stringify(f) +
            ").nilai));",
        ],
        { encoding: "utf8", timeout: 60000 },
      );

    fs.writeFileSync(
      f,
      "const nilai: number = 1;\nmodule.exports = { nilai };\n",
    );
    expect(jalankan()).toBe("1");

    fs.writeFileSync(
      f,
      "const nilai: number = 2;\nmodule.exports = { nilai };\n",
    );
    expect(jalankan()).toBe("2");
  });

  test("bisa dimatikan lewat WOLFSPACE_TS_CACHE=0", () => {
    // A cache serving wrong output looks like haunted source, and the first
    // useful question is whether it still happens with the cache off.
    const { out } = lewatHook(
      "const nilai: string = 'mati';\nmodule.exports = { nilai };\n",
      { WOLFSPACE_TS_CACHE: "0" },
    );
    expect(out).toBe("mati");
  });

  test("pohon HANYA-BACA tidak menggagalkan apa pun", () => {
    // In a packaged app node_modules lives inside app.asar and cannot be written.
    // The cache is an optimisation; an optimisation that breaks startup is a bug.
    expect(SRC).toMatch(/catch \(_\) \{[\s\S]{0,120}dir = null/);
    expect(SRC).toContain("fs.constants.W_OK");
  });

  test("penulisan TIDAK menahan startup", () => {
    // Writing the 30 files a cold start compiles measured 435 ms of blocked
    // startup — with a synchronous write the cache made the first run of any
    // edited file slower than no cache at all, and the agent edits its own
    // source constantly.
    expect(SRC).not.toMatch(/fs\.writeFileSync\(tmp/);
    expect(SRC).toContain("fs.promises");
    expect(SRC).toContain(".then(() => fs.promises.rename(tmp, berkas))");
  });

  test("ditulis lewat rename, bukan langsung ke berkas tujuannya", () => {
    // rename is atomic: a second process reading concurrently sees either
    // nothing or a complete compile, never a half-written one — which would fail
    // looking exactly like a syntax error in the source.
    expect(SRC).toMatch(
      /const tmp = berkas \+ "\." \+ process\.pid \+ "\.tmp"/,
    );
  });

  test("kunci memuat versi esbuild dan opsi transform-nya", () => {
    // Upgrading esbuild, or changing the target, changes the correct output.
    // Without both in the key the cache would keep serving the previous compiler's
    // work after an upgrade.
    expect(SRC).toMatch(/esbuild\.version \+ " " \+ JSON\.stringify\(OPSI\)/);
  });
});
