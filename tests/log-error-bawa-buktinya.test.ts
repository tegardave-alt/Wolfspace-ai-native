// An error log must carry its own evidence.
//
// WHAT IT COST. A user reported that switching branch "stops and fails". The
// route was made to log its outcome, and the log then read:
//
//   "/ww/branch/create -> ok     {ms:514, cabang:hy}"
//   "/ww/commit        -> GAGAL"
//   "/ww/branch/switch -> GAGAL"
//
// The success carried its data and both failures carried none. Not a
// coincidence: dlog printed `data.error` and NOTHING else at error level, so
// every field under any other name was discarded -- at the one level where the
// payload is the entire point. The reason was under `err`, so the log answered
// "it failed" and refused to say why.
//
// This is the third time in this repository that a measurement described a
// failure without naming it. The other two were a timeout that guessed at a
// lock, and a renderer freeze that reported only a duration.
//
// BOTH ARE PRINTED NOW, and the second is not redundant: an Error object loses
// its stack through JSON.stringify, and the stack is usually the useful half.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const SRC = fs
  .readFileSync(path.join(AKAR, "server.ts"), "utf8")
  .replace(/\r\n/g, "\n");

/** The dlog branch that prints at error level. */
function cabangError(): string {
  const i = SRC.indexOf('if (level === "error")');
  expect(i).toBeGreaterThan(-1);
  // Up to the `else` that starts the info branch.
  const j = SRC.indexOf("\n    else", i);
  return SRC.slice(i, j > i ? j : i + 2000);
}

describe("log level error tidak membuang muatannya", () => {
  test("seluruh data dicetak, bukan hanya data.error", () => {
    expect(cabangError()).toContain("JSON.stringify(data, null, 0)");
  });

  test("data.error TETAP dicetak terpisah — stack-nya hilang lewat JSON", () => {
    expect(cabangError()).toContain("data.error ? [data.error]");
  });

  test("info dan error mencetak muatan yang SAMA", () => {
    // They used to disagree, and the disagreement is what hid the reason. If
    // one of them is ever changed alone, this fails.
    const i = SRC.indexOf('if (level === "error")');
    const blok = SRC.slice(i, i + 2600);
    const jumlah = blok.split("JSON.stringify(data, null, 0)").length - 1;
    expect(jumlah).toBeGreaterThanOrEqual(2);
  });
});

describe("rute mutasi git melaporkan hasilnya", () => {
  test("hasil, durasi dan cabangnya ikut dicatat", () => {
    // The log used to record only that the request had ARRIVED. Every layer
    // below reports what it did; this one did not.
    const i = SRC.indexOf('req.url + " -> "');
    expect(i).toBeGreaterThan(-1);
    const blok = SRC.slice(Math.max(0, i - 400), i + 400);
    expect(blok).toContain("ms:");
    expect(blok).toContain("err:");
    expect(blok).toContain("cabang:");
  });

  test("dicatat sebagai error kalau gagal, info kalau berhasil", () => {
    const i = SRC.indexOf('req.url + " -> "');
    const blok = SRC.slice(Math.max(0, i - 400), i + 200);
    expect(blok).toContain('"error"');
    expect(blok).toContain('"info"');
  });
});
