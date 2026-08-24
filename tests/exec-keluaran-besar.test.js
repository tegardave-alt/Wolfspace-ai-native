// A talkative command is a RESULT, not a failure.
//
// WHAT WAS WRONG. runInWorkspace passed maxBuffer: 200 * 1024 and rejected on
// overflow, so any command producing more than ~200 KB returned nothing at all.
// Measured on the boundary before the change:
//
//   100 KB -> ok        190 KB -> ok
//   200 KB -> ok        210 KB -> "stdout maxBuffer length exceeded"
//
// An ordinary `git log` or `npm ls` clears that line, and the output had already
// been produced successfully — it was discarded purely for being long.
//
// The ceiling is now agent/anggaran.ts EXEC_MAKS_BUFFER, and what genuinely
// exceeds it comes back cut with a notice instead of vanishing.

const T = require("../agent/tools/exec-tools.ts");
const A = require("../agent/anggaran.ts");

// A busy machine and two-at-a-time rate limiting make these slow; the work
// itself is a single node process writing to stdout.
jest.setTimeout(180000);

/** Code that writes exactly `kb` kilobytes to stdout. */
function tulis(kb) {
  return (
    'const b = "x".repeat(1024);' +
    "for (let i = 0; i < " +
    kb +
    "; i++) process.stdout.write(b);"
  );
}

describe("runInWorkspace: keluaran besar", () => {
  test("250 KB lewat — dulu justru DI SINI perintahnya gagal total", async () => {
    const r = await T.runInWorkspace("javascript", tulis(250));
    expect(r.ok).toBe(true);
    expect(r.error).toBeUndefined();
    // The javascript branch hands on the first 4000 chars; what matters is that
    // real output came back rather than an ENOBUFS rejection.
    expect(String(r.output).length).toBeGreaterThan(1000);
    expect(String(r.output)).not.toMatch(/dipotong/);
  });

  test("plafonnya diambil dari anggaran, bukan angka lokal", () => {
    const mentah = require("fs").readFileSync(
      require.resolve("../agent/tools/exec-tools.ts"),
      "utf8",
    );
    // Comments are stripped FIRST. The doc comment on _jalankan quotes the old
    // value while explaining why it went, and a guard that reads its own
    // explanation as the offence has already cried wolf three times in this
    // repo. Only executable lines count.
    const src = mentah
      .split("\n")
      .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
      .join("\n");
    // The old literal must be gone, or the ceiling silently reverts to 200 KB.
    expect(src).not.toMatch(/maxBuffer:\s*200\s*\*\s*1024/);
    expect(src).toMatch(/EXEC_MAKS_BUFFER/);
    expect(A.EXEC_MAKS_BUFFER).toBe(8 * 1024 * 1024);
  });

  test("yang MELEWATI plafon dipotong dan mengatakannya", async () => {
    const kb = Math.round(A.EXEC_MAKS_BUFFER / 1024) + 512; // comfortably over
    const r = await T.runInWorkspace("javascript", tulis(kb));
    expect(r.ok).toBe(true); // truncated, not failed
    // The notice has to survive the branch's own 4000-char slice, which is why
    // it is prepended rather than appended — appended, it would be cut off by
    // the very truncation it announces.
    expect(String(r.output)).toMatch(/^\[keluaran dipotong: melewati 8 MB\]/);
  });
});
