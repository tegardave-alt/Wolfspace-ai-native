// No require() may name an absolute path from somebody's machine.
//
// This escaped to CI once already: a probe in tests/debug-log-rotation.test.js
// was written as
//
//   require("c:/Users/dave/WOLFSPACE/scripts/ts-register.cjs")
//
// which works perfectly on the machine that wrote it and nowhere else. It cost a
// CI cycle to find, and the error it produced — "Cannot find module" — points at
// the module rather than at the assumption.
//
// Sample paths in test DATA are fine and common here (glob fixtures, path-guard
// inputs). What is checked is narrower and unambiguous: the argument to require.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const LEWATI =
  /node_modules|[\/]\.git[\/]|[\/]vendor[\/]|dist-app|_agent_backups|\.claude/;

function telusuri(dir, keluar) {
  let isi;
  try {
    isi = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return keluar;
  }
  for (const e of isi) {
    const p = path.join(dir, e.name);
    if (LEWATI.test(p)) continue;
    if (e.isDirectory()) telusuri(p, keluar);
    else if (/\.(ts|tsx|cjs|js|mjs)$/.test(e.name)) keluar.push(p);
  }
  return keluar;
}

// require("C:/..."), require('/home/...'), require(`/Users/...`)
const REQUIRE_ABSOLUT =
  /\brequire\(\s*["'`](?:[a-zA-Z]:[\/]|\/(?:home|Users|mnt)\/)[^"'`]*["'`]\s*\)/g;

describe("tak ada path mesin yang ter-hardcode", () => {
  test("require() tidak pernah menyebut path absolut", () => {
    const temuan = [];
    for (const f of telusuri(AKAR, [])) {
      // This file carries the offending shape ON PURPOSE, as the fixture that
      // proves the pattern still matches. Scanning it would make the guard fail
      // on its own evidence.
      if (f === __filename) continue;
      const isi = fs.readFileSync(f, "utf8");
      isi.split("\n").forEach((baris, i) => {
        // A line that is entirely a comment is prose, including the comment in
        // this very file explaining the bug.
        if (/^\s*(\/\/|\*|#)/.test(baris)) return;
        const m = baris.match(REQUIRE_ABSOLUT);
        if (m)
          temuan.push(
            path.relative(AKAR, f).split(path.sep).join("/") +
              ":" +
              (i + 1) +
              "  " +
              m[0].slice(0, 70),
          );
      });
    }
    expect(temuan).toEqual([]);
  });

  test("penjaganya benar-benar menangkap bentuk yang dulu lolos", () => {
    // A guard that matches nothing would pass forever and prove nothing.
    const contoh =
      'require("c:/Users/dave/WOLFSPACE/scripts/ts-register.cjs");';
    expect(contoh.match(REQUIRE_ABSOLUT)).toBeTruthy();
    // And it must not fire on the ordinary shapes this repo uses everywhere.
    expect('require("./debug.ts")'.match(REQUIRE_ABSOLUT)).toBeNull();
    expect('require("../agent/tools.cjs")'.match(REQUIRE_ABSOLUT)).toBeNull();
    expect(
      'require(path.join(AKAR, "x.cjs"))'.match(REQUIRE_ABSOLUT),
    ).toBeNull();
  });
});
