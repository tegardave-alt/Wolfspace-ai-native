// The packaging job checks that files the app requires at RUNTIME survived into
// app.asar.unpacked. That check can only pass if those files are actually
// unpacked — and the two lists that decide it live in different files.
//
// They drifted, and it cost a CI run: server.ts was added to build.files and to
// the CI list, but not to asarUnpack. It went INSIDE app.asar while server.cjs —
// the launcher that does require("./server.ts") — sits unpacked beside it. The
// packaged app would not have started at all.
//
// A source-level test catches that in seconds instead of after a full Windows
// build.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const PKG = JSON.parse(
  fs.readFileSync(path.join(AKAR, "package.json"), "utf8"),
);
const CI = fs.readFileSync(
  path.join(AKAR, ".github", "workflows", "ci.yml"),
  "utf8",
);

/** The runtime files the CI packaging job insists on finding, unpacked. */
function daftarCI() {
  const m = CI.match(/for f in ([\s\S]*?); do/);
  if (!m) throw new Error("daftar cek packaging tak ketemu di ci.yml");
  return m[1]
    .replace(/\\s*\n/g, " ")
    .split(/\s+/)
    .filter((x) => x && x !== "\\");
}

/** Does an asarUnpack glob cover this path? */
function tercakup(berkas, pola) {
  return pola.some((p) =>
    p.endsWith("/**") ? berkas.startsWith(p.slice(0, -2)) : p === berkas,
  );
}

describe("paket: yang diperiksa CI benar-benar bisa ada di sana", () => {
  const daftar = daftarCI();

  test("daftar CI tidak kosong", () => {
    // A regex that silently matched nothing would make every assertion below
    // vacuously true.
    expect(daftar.length).toBeGreaterThan(10);
    expect(daftar).toContain("server.ts");
  });

  test("SETIAP berkas yang dicek CI ada di asarUnpack", () => {
    // The check reads app.asar.unpacked. A file only in build.files lands inside
    // the archive instead, and the job fails with "hilang dari paket".
    const hilang = daftar.filter((f) => !tercakup(f, PKG.build.asarUnpack));
    expect(hilang).toEqual([]);
  });

  test("SETIAP berkas yang dicek CI ada di build.files", () => {
    // asarUnpack decides WHERE a packaged file goes; files decides WHETHER it is
    // packaged at all. Both are needed.
    const hilang = daftar.filter((f) => !tercakup(f, PKG.build.files));
    expect(hilang).toEqual([]);
  });

  // Files on the CI list that are BUILT rather than committed, and are therefore
  // absent from a fresh checkout.
  //
  // The distinction is not a loophole, it is the point: those two lists exist to
  // catch a name that no longer resolves, and a generated artefact resolves only
  // after its build step. AcLaunch.exe is gitignored (see .gitignore) and
  // produced by `npm run build:aclaunch`, which both ci.yml and the release
  // workflow run before packaging. Without this exemption the ubuntu test job
  // would fail on a file it was never going to have — a red build that says
  // nothing true.
  //
  // Membership in build.files and asarUnpack is still asserted above. Only the
  // existence check is relaxed, and only for names listed here.
  const DIBANGUN = ["scripts/appcontainer/AcLaunch.exe"];

  test("berkas itu memang ada di repo", () => {
    // A list naming something deleted would pass the two checks above and fail
    // the real build.
    const hilang = daftar
      .filter((f) => !DIBANGUN.includes(f))
      .filter((f) => !fs.existsSync(path.join(AKAR, f)));
    expect(hilang).toEqual([]);
  });

  test("yang dikecualikan memang DIBANGUN, bukan sekadar hilang", () => {
    // The exemption above is only honest if a build step really produces these.
    // Otherwise it becomes a place to hide a broken entry.
    const skrip = PKG.scripts || {};
    const semuaSkrip = Object.values(skrip).join(" ; ");
    for (const f of DIBANGUN) {
      expect(daftar).toContain(f);
      // Named by a build script, and that script is wired into package.json.
      expect(semuaSkrip).toMatch(/build-aclaunch\.cjs/);
      expect(
        fs.existsSync(path.join(AKAR, "scripts", "build-aclaunch.cjs")),
      ).toBe(true);
      // And gitignored, which is WHY it is absent from a fresh checkout.
      const ignore = fs.readFileSync(path.join(AKAR, ".gitignore"), "utf8");
      expect(ignore).toContain(f);
    }
  });

  test("peluncur dan aplikasinya ada di SISI YANG SAMA", () => {
    // server.cjs does require("./server.ts"), resolved relative to itself. If one
    // is unpacked and the other is not, that require cannot find its target — the
    // exact failure this file exists to prevent.
    for (const f of ["server.cjs", "server.ts"]) {
      expect(tercakup(f, PKG.build.asarUnpack)).toBe(true);
    }
  });
});
