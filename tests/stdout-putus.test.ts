// A backend whose OWN stdout breaks must not be killed by it.
//
// WHAT HAPPENED, the second time. The stdin guards were shipped, and the very
// same crash came back:
//
//   Error: write EOF
//       at WriteWrap.onWriteComplete [as oncomplete]
//   { errno: -4095, code: EOF, syscall: write }
//   [probe] host backend keluar, kode 7
//
// The exit code is the part that names the mechanism. 7 is Nodes "Internal
// Exception Handler Run-Time Failure": an uncaughtException handler that itself
// throws. server.ts has exactly one, and it rethrows on purpose so a real bug
// still dies loudly. So the stream error was never handled, the handler ran,
// and rethrowing turned it into a hard exit.
//
// WHICH STREAM. The stack ends at onWriteComplete and names nothing, but
// _crash.log had already recorded the same failure with a full stack, hours
// earlier:
//
//   EPIPE: broken pipe, write
//       at Socket._write
//       at console.value / console.log
//       at _writeSafe (server.ts)
//
// That is this process writing to its OWN stdout. Under Electron the backend is
// forked by main with inherited stdio, so stdout is a pipe to another process,
// not a terminal, and the reader can go away at any time.
//
// AND _writeSafe WRAPS EVERY ONE OF THOSE WRITES IN try/catch. It is named for
// a safety it cannot provide: the write is accepted and fails afterwards, so by
// the time the stream raises there is nothing on the stack left to catch. The
// first test below proves that rather than asserting it -- the child writing in
// the reproduction has its writes inside try/catch, and still dies.
//
// WHY THE EARLIER SCANNER MISSED IT. tests/stdin-anak-mati.test.ts looks for
// writes to a CHILD process stdin. It never asked what a process does with its
// own stdout, so every one of these was invisible to it.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const baca = (rel: string) => fs.readFileSync(path.join(AKAR, rel), "utf8");

/**
 * A child that writes hard to stdout, with every write inside try/catch, whose
 * reader is destroyed mid-write. `penjaga` decides whether it also attaches the
 * one listener under test.
 */
function anakYangDiputus(penjaga: boolean): Promise<any> {
  const badan = [
    "const buf = 'y'.repeat(1 << 16);",
    "setInterval(function () { try { process.stdout.write(buf); } catch (e) {} }, 1);",
    // 1200 ms, not longer. The reader is destroyed at 400 ms and the
    // stream raises within a tick or two of that; the rest is only the
    // child proving it survived. This suite runs alongside the two
    // browser suites that are already the slowest in the repo, and every
    // second spent here is contention charged to them.
    "setTimeout(function () { process.exit(0); }, 1200);",
  ].join(" ");
  const kode = penjaga
    ? "process.stdout.on('error', function () {}); " + badan
    : badan;
  return new Promise((selesai) => {
    const anak = spawn(process.execPath, ["-e", kode], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let err = "";
    anak.stderr.on("data", (d: any) => (err += d));
    anak.stdout.on("data", () => {});
    setTimeout(() => anak.stdout.destroy(), 400);
    anak.on("close", (kodeKeluar: any) => selesai({ kode: kodeKeluar, err }));
  });
}

describe("perilaku: pembaca stdout menghilang di tengah tulisan", () => {
  test("tanpa listener ia MATI, walau tulisannya dibungkus try/catch", async () => {
    const r: any = await anakYangDiputus(false);
    expect(r.kode).not.toBe(0);
    // EPIPE on a POSIX pipe, EOF on a Windows one. Either is the same event.
    expect(r.err).toMatch(/EPIPE|EOF/);
  }, 30000);

  test("dengan satu listener ia selesai bersih", async () => {
    const r: any = await anakYangDiputus(true);
    expect(r.kode).toBe(0);
    expect(r.err).toBe("");
  }, 30000);
});

describe("proses yang menulis ke pipa milik proses lain memasang penjaga", () => {
  // The backend, wherever it runs, and the host that forks it. Both write to a
  // pipe they do not own the other end of.
  const BERKAS = ["server.ts", "electron/backend-host.cjs"];

  for (const rel of BERKAS) {
    test(rel + " menjaga stdout DAN stderr", () => {
      const src = baca(rel);
      expect(src).toContain('process.stdout.on("error"');
      expect(src).toContain('process.stderr.on("error"');
    });
  }

  test("backend-host memasangnya SEBELUM apa pun dimuat", () => {
    // core() is lazy, so server.ts guard does not exist until the first invoke
    // arrives. Everything this file logs before that -- the watchdog, any load
    // failure -- would be unprotected if the guard sat lower down.
    const src = baca("electron/backend-host.cjs");
    const jaga = src.indexOf('process.stdout.on("error"');
    const muat = src.indexOf('require("../scripts/ts-register.cjs")');
    expect(jaga).toBeGreaterThan(-1);
    expect(muat).toBeGreaterThan(-1);
    expect(jaga).toBeLessThan(muat);
  });

  test("penjaganya tak boleh mencoba mencatat ke pipa yang baru putus", () => {
    // Logging from inside the handler writes to the stream that just failed.
    // Both handlers stay empty on purpose.
    for (const rel of BERKAS) {
      const src = baca(rel);
      const i = src.indexOf('process.stdout.on("error"');
      expect(src.slice(i, i + 120)).not.toContain("console.");
    }
  });
});
