// A host that is alive and silent has to say WHICH request it never answered.
//
// WHAT HAPPENED. A user's log carried one line and nothing else:
//
//   [probe] backend-host gagal api: host backend tak menjawab dalam 30000 ms
//
// The wording already proves a great deal. A host that has EXITED fails its
// waiters from the exit handler with "host backend berhenti", so reaching the
// timeout text at all means the process was alive and simply never answered --
// a blocked event loop, seen from outside.
//
// And then the line runs out of information. It does not name the route, it
// does not say how long was really waited, and it does not say whether other
// requests were piling up behind it. Two plausible causes were chased and BOTH
// were disproved by measurement:
//
//   requiring core.js through ts-register  -> 1162 ms with the cache OFF
//   startJedi() at module level            -> async, spawns, does not block
//
// Neither is 30 seconds. The guessing was paid for in full before anyone
// noticed that the message itself was the thing that was broken.
//
// THE SECOND GAP was worse. agent/pemantau-blokir.ts -- the instrument that
// measures exactly this -- was started in electron/main.ts alone. That was
// correct while the backend still ran on that thread, and stopped being correct
// the moment backend-host.cjs took it off. The instrument stayed with the
// window; the work moved. So the one process that went silent was the only one
// with nothing watching it.
//
// This file pins both halves shut.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const baca = (rel: string) => fs.readFileSync(path.join(AKAR, rel), "utf8");

/** Assertions must read CODE, never the prose explaining it. */
const tanpaKomentar = (s: string) =>
  s
    .split(String.fromCharCode(10))
    .filter((b: string) => !b.trim().startsWith("//"))
    .join(String.fromCharCode(10));

describe("timeout host menyebut permintaan mana yang menggantung", () => {
  const MAIN = tanpaKomentar(baca("electron/main.ts"));

  test("pesannya membawa rute, bukan cuma nama host", () => {
    // Without the route the line cannot be acted on, which is the whole reason
    // this test exists.
    expect(MAIN).toContain("payload && payload.path");
    expect(MAIN).toContain("payload && payload.method");
  });

  test("waktu yang dilaporkan DIUKUR, bukan batasnya diulang", () => {
    // The old message printed batasMs -- the budget -- and called it the wait.
    // Those are the same number only when the timer is the thing that fired,
    // and the elapsed figure is what tells a reader it really was.
    expect(MAIN).toContain("const t0 = Date.now();");
    expect(MAIN).toContain("(Date.now() - t0)");
  });

  test("antrean di belakangnya ikut dihitung", () => {
    // 0 others waiting means one slow route. A pile means a wedged host. The
    // two need different fixes, and the old line could not tell them apart.
    expect(MAIN).toContain("antre++");
    expect(MAIN).toContain("permintaan lain masih menunggu");
  });
});

describe("host mengukur event loop-nya sendiri", () => {
  const HOST = tanpaKomentar(baca("electron/backend-host.cjs"));

  test("backend-host menyalakan pemantau blokir", () => {
    expect(HOST).toContain("pemantau-blokir");
    expect(HOST).toContain("pasangLaporan");
  });

  test("laporannya ditandai supaya terlihat di log yang sama", () => {
    // stdio is inherited from main, so this lands in the log the original line
    // came from -- next to the timeout it explains.
    expect(HOST).toContain("[backend-host] BLOKIR");
  });

  test("menyalakannya tak boleh fatal", () => {
    // An instrument that can cost the app its backend is worse than none.
    const i = HOST.indexOf("pemantau-blokir");
    expect(i).toBeGreaterThan(-1);
    expect(HOST.slice(Math.max(0, i - 200), i)).toContain("try {");
  });
});

// The wiring above is shape. This is the mechanism actually running, in a
// separate process, because a utilityProcess is a Node process and the
// histogram has to work there or the instrument is decorative.
describe("perilaku: blokir nyata benar-benar dilaporkan", () => {
  test("stretch 900 ms muncul sebagai laporan, bukan senyap", async () => {
    const anak = spawn(
      process.execPath,
      [
        "-e",
        [
          "require('./scripts/ts-register.cjs');",
          "const pb = require('./agent/pemantau-blokir.ts');",
          "pb.mulai(20);",
          "pb.pasangLaporan(function (l) { console.log('BLOKIR ' + pb.ringkas(l)); }, 300);",
          "setTimeout(function () {",
          "  var t = Date.now(); while (Date.now() - t < 900) {}",
          "  setTimeout(function () { process.exit(0); }, 700);",
          "}, 150);",
        ].join(" "),
      ],
      { cwd: AKAR, windowsHide: true },
    );
    let keluaran = "";
    anak.stdout.on("data", (d: any) => (keluaran += d));
    anak.stderr.on("data", (d: any) => (keluaran += d));
    await new Promise((selesai) => anak.on("close", selesai));

    expect(keluaran).toContain("BLOKIR");
    // The verdict for 900 ms sits above the normal band (100 ms) and below the
    // hang threshold (5000 ms) -- so it must read "naik", not "over".
    expect(keluaran).toContain("naik");
  }, 30000);
});
