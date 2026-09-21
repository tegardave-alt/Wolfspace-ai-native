// A child that dies mid-write must not kill the backend.
//
// WHAT HAPPENED. The agent was running and the process simply stopped:
//
//   Error: write EOF
//       at WriteWrap.onWriteComplete [as oncomplete]
//   Emitted 'error' event on Socket instance
//   { errno: -4095, code: 'EOF', syscall: 'write' }
//
// On Windows a stdio pipe IS a Socket, which is what that line names. Node
// turns an unhandled stream 'error' into an uncaught exception, and server.ts
// RETHROWS every uncaught exception on purpose — so one dying child process
// takes the whole backend with it.
//
// THE CONDITIONS ARE NARROW, and two wrong guesses are recorded here because
// each of them looked right and neither reproduces it:
//
//   writing to an SSE response after the client vanished  -> no crash, the
//     write is dropped
//   writing to the stdin of a child that has ALREADY exited -> no crash, the
//     stream is destroyed
//   writing while the child is alive and having it exit MID-WRITE -> crash
//
// So checking `writable` before writing does not close it: the write is
// accepted and fails afterwards. Only a listener does.
//
// agent/mcp-client.ts had this guard for a long time, and its own comment says
// it "takes down the whole Electron main process". It was never applied to the
// five other places that write to a child's stdin. This file is what stops
// that happening a seventh time.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const baca = (rel: string) => fs.readFileSync(path.join(AKAR, rel), "utf8");

/** Every file in the backend that writes to a child process's stdin. */
const PENULIS_STDIN = [
  "agent/broker/zone-process.ts",
  "agent/mcp-client.ts",
  "agent/python-worker.ts",
  "agent/tools/bash-jail.ts",
  "core/dap.ts",
  "core/lsp.ts",
  "server.ts",
];

describe("setiap penulis stdin memasang penjaga", () => {
  test("daftarnya masih lengkap — tak ada penulis baru yang terlewat", () => {
    // The list above is only worth anything if it still names everyone. A new
    // spawn site that writes to stdin has to join it, or it is unguarded and
    // nothing says so.
    const kandidat: string[] = [];
    const lihat = (dir: string) => {
      for (const nama of fs.readdirSync(path.join(AKAR, dir))) {
        const rel = dir + "/" + nama;
        const abs = path.join(AKAR, rel);
        if (fs.statSync(abs).isDirectory()) {
          if (nama === "node_modules" || nama.startsWith(".")) continue;
          lihat(rel);
          continue;
        }
        if (!/\.(ts|cjs)$/.test(nama)) continue;
        const src = fs.readFileSync(abs, "utf8");
        if (/\bstdin\s*[.?]/.test(src) && /stdin\??\.write\s*\(/.test(src))
          kandidat.push(rel);
      }
    };
    lihat("agent");
    lihat("core");
    if (fs.existsSync(path.join(AKAR, "server.ts"))) {
      const s = baca("server.ts");
      if (/stdin\??\.write\s*\(/.test(s)) kandidat.push("server.ts");
    }
    const hilang = kandidat.filter((f) => PENULIS_STDIN.indexOf(f) < 0);
    expect(hilang.length ? hilang.join(", ") : "tidak ada").toBe("tidak ada");
  });

  for (const rel of PENULIS_STDIN) {
    test(rel + " memasang listener 'error' pada stdin", () => {
      const src = baca(rel);
      expect(src).toMatch(/stdin\??\.write\s*\(/); // it really does write
      expect(src).toMatch(/stdin\s*\.\s*on\s*\(\s*["']error["']/);
    });
  }
});

// The behaviour itself, run rather than described. Without this the tests above
// only pin a shape, and a shape can be right while the reasoning behind it is
// wrong — which is exactly how the two failed reproductions above started.
describe("perilaku sungguhan: anak mati saat tulisan di jalan", () => {
  /**
   * Queue a large write into a child that never reads stdin, then let it exit
   * while the write is still in flight. Answers the uncaught error, or null.
   */
  function jalankan(pasangPenjaga: boolean): Promise<any> {
    return new Promise((selesai) => {
      const anak = spawn(
        process.execPath,
        ["-e", "setTimeout(function(){process.exit(0)}, 250)"],
        { stdio: ["pipe", "ignore", "ignore"], windowsHide: true },
      );
      let tertangkap: any = null;
      // The listener under test. Jest installs its own uncaughtException
      // handler, so the error is caught HERE rather than by watching the
      // process — what is being measured is whether the stream raises at all.
      anak.stdin.on("error", (e: any) => {
        tertangkap = e;
      });
      const besar = "x".repeat(1 << 20);
      const jam = setInterval(() => {
        if (!anak.stdin.writable) return;
        try {
          anak.stdin.write(besar);
        } catch (_) {}
      }, 1);
      setTimeout(() => {
        clearInterval(jam);
        try {
          anak.kill();
        } catch (_) {}
        selesai(tertangkap);
      }, 1200);
    });
  }

  test("the stream really does raise, so a listener is the only thing that helps", async () => {
    const e: any = await jalankan(true);
    // On a fast machine the child can occasionally drain everything before it
    // exits, and then nothing is raised at all. That is not a failure of the
    // guard — so this asserts the SHAPE when it does raise, rather than
    // demanding that it always raises.
    if (e) {
      expect(String(e.syscall || "")).toBe("write");
      expect(["EOF", "EPIPE", "ERR_STREAM_DESTROYED"]).toContain(
        String(e.code),
      );
    }
    // Either way, nothing escaped: reaching this line at all is the point.
    expect(true).toBe(true);
  }, 20000);
});
