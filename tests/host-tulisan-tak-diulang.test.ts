// A write that timed out is never run a second time.
//
// WHERE THE LOCK ACTUALLY CAME FROM. Switching branch failed repeatedly with
// ".git/index.lock" and with "git did not answer in 15s", and neither message
// pointed anywhere useful. Watching the live repository for 60 seconds, with
// the app and the editor both running, produced ZERO locks; no stale lock file
// existed anywhere. The lock was real and it was ours.
//
// It was traced from the user's own log, and only after the timeout message was
// made to name its route:
//
//   POST /ww/branch/switch
//   host backend tak menjawab dalam 30007 ms (batas 30000)
//     [POST /ww/branch/switch], 0 permintaan lain masih menunggu
//
// "0 others waiting" is what settles it. The host was not wedged behind a
// queue; this ONE request needed longer than the budget. A cold `git checkout`
// of this repository was measured at 44.9 seconds -- 35 MB out of the pack with
// an empty OS cache, which is the ordinary state after a build or a test run.
//
// So: the 30-second budget fired, main fell through to its in-process path and
// started a SECOND `git checkout` while the first was still writing. Two
// writers, one repository, and the loser reports a lock. Every lock hunted in
// this session traces back here.
//
// TWO THINGS FIX IT, and both are needed. The budget must be larger than the
// work legitimately takes, AND a write must never be retried by the fallback --
// because a budget can always be exceeded by a slower machine, and the second
// write is the part that does damage.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const MAIN = fs
  .readFileSync(path.join(AKAR, "electron", "main.ts"), "utf8")
  .replace(/\r\n/g, "\n");
const WW = fs
  .readFileSync(path.join(AKAR, "scripts", "ww.ts"), "utf8")
  .replace(/\r\n/g, "\n");

/** Assertions must read CODE. The comments in this file QUOTE the very
 *  message being searched for, and the first version anchored on that quote --
 *  measuring its own explanation instead of the behaviour. */
const MAIN_KODE = MAIN.split(String.fromCharCode(10))
  .filter((b: string) => {
    const t = b.trim();
    return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
  })
  .join(String.fromCharCode(10));

describe("tulisan yang timeout TIDAK diulang di main", () => {
  test("non-GET berhenti di situ, tidak jatuh ke jalur in-process", () => {
    const i = MAIN_KODE.indexOf("backend-host gagal api: ");
    expect(i).toBeGreaterThan(-1);
    const blok = MAIN_KODE.slice(i, i + 2600);
    // The method is read, and anything that is not a safe method returns.
    expect(blok).toContain("GET");
    expect(blok).toContain("HEAD");
    expect(blok).toContain("It was NOT retried here");
  });

  test("GET tetap boleh jatuh ke jalur in-process", () => {
    // Re-running a read is wasteful, not harmful, and the fallback exists so
    // that losing the host does not lose the feature.
    const i = MAIN_KODE.indexOf("backend-host gagal api: ");
    const blok = MAIN_KODE.slice(i, i + 2600);
    expect(blok).toContain('metode !== "GET"');
  });
});

describe("anggaran waktu sesuai pekerjaan yang nyata", () => {
  test("kanal api punya anggarannya sendiri, bukan 30 detik bawaan", () => {
    expect(MAIN).toContain("BATAS_API_MS");
    const n = Number(MAIN.match(/BATAS_API_MS = ([0-9]+)/)[1]);
    // A cold checkout was measured at 44.9 s. Anything at or below that is a
    // budget that fires on ordinary work.
    expect(n).toBeGreaterThan(45000);
  });

  test("anggaran api LEBIH BESAR dari anggaran tulis git", () => {
    // So git's own message wins the race: the user is told what git said, not
    // that something timed out.
    const api = Number(MAIN.match(/BATAS_API_MS = ([0-9]+)/)[1]);
    const gitTulis = Number(WW.match(/BATAS_TULIS_MS = ([0-9]+)/)[1]);
    expect(api).toBeGreaterThan(gitTulis);
  });

  test("pesan timeout menyebut rute dan panjang antrean", () => {
    // Without the route this failure could not be traced at all -- that is how
    // it stayed unexplained through several rounds.
    const i = MAIN_KODE.indexOf("tak menjawab dalam");
    expect(i).toBeGreaterThan(-1);
    const blok = MAIN_KODE.slice(Math.max(0, i - 1500), i + 600);
    expect(blok).toContain("rute");
    expect(blok).toContain("antre");
  });
});
