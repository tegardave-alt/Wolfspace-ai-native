// MCP servers are spawned WITHOUT a shell whenever the command is a real
// executable — and the argument vector survives intact when they are.
//
// WHAT THIS CLOSES. _startServer used to pass `shell: true` on Windows for every
// command. Node reports that as DEP0190, and the reason is not style: with a
// shell the arguments are concatenated into one command line instead of being
// escaped, so `&` or `|` inside an argument stops being text and becomes a
// second command. Those arguments come from config/mcp.json and from plugin
// manifests.
//
// The shell could not simply be dropped: `npx` on Windows is npx.cmd, and Node
// refuses to spawn .cmd/.bat without one. So the command is resolved first, a
// real .exe is spawned directly, and only .cmd/.bat still go through cmd.exe.
//
// The first test asserts the DECISION, the second asserts the CONSEQUENCE — an
// argument full of shell metacharacters arriving at the child unchanged. The
// second is the one that would notice if the decision were ever quietly undone.

const fs = require("fs");
const os = require("os");
const path = require("path");
const mcp = require("../agent/mcp-client.ts");

const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

describe("spawn MCP tanpa shell", () => {
  describe("_cariExe", () => {
    test("menemukan executable nyata di PATH", () => {
      const hasil = mcp._cariExe("node", process.env);
      expect(hasil).toBeTruthy();
      expect(fs.existsSync(hasil)).toBe(true);
    });

    test("mengembalikan null untuk perintah yang tak ada", () => {
      // Null is what keeps the OLD behaviour: the caller falls back to a shell
      // rather than failing a configuration that works today.
      expect(
        mcp._cariExe("perintah-yang-pasti-tidak-ada-xyz", process.env),
      ).toBe(null);
      expect(mcp._cariExe("", process.env)).toBe(null);
    });

    test("jalur absolut diperiksa apa adanya, bukan dicari di PATH", () => {
      expect(mcp._cariExe(process.execPath, process.env)).toBe(
        process.execPath,
      );
      expect(
        mcp._cariExe(path.join(os.tmpdir(), "tidak-ada-xyz.exe"), process.env),
      ).toBe(null);
    });
  });

  test("argumen dengan metakarakter shell sampai UTUH ke proses anak", async () => {
    // A child that records its own argv and then stays alive, so the handshake
    // failure below exercises the same path a real server would.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-argv-"));
    const skrip = path.join(dir, "rekam-argv.js");
    const keluaran = path.join(dir, "argv.json");
    fs.writeFileSync(
      skrip,
      "require('fs').writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)));" +
        "setInterval(function () {}, 1000);",
      "utf8",
    );

    // Every one of these is a shell operator. Under `shell: true` they would be
    // interpreted; passed as a vector they are just characters.
    const JAHAT = "a & echo INJECTED | b > c ^ d";
    const NAMA = "__uji-spawn-tanpa-shell__";

    const asli = mcp._request;
    // Rejected AFTER a delay, not immediately. _startServer now kills the child
    // as soon as a handshake fails (that is the fix in fac8ab0), and node takes
    // ~50 ms to reach its first statement — so an instant rejection killed the
    // process before it could record anything, and the first version of this
    // test failed for a reason that had nothing to do with what it measures.
    mcp._request = () =>
      new Promise((_, tolak) =>
        setTimeout(() => tolak(new Error("handshake dilewati (uji)")), 800),
      );
    try {
      await expect(
        mcp._startServer(NAMA, {
          command: process.execPath,
          args: [skrip, keluaran, JAHAT],
        }),
      ).rejects.toThrow();

      for (let i = 0; i < 60 && !fs.existsSync(keluaran); i++) await tunggu(50);
      expect(fs.existsSync(keluaran)).toBe(true);

      const argv = JSON.parse(fs.readFileSync(keluaran, "utf8"));
      // Exactly one argument, byte for byte. A shell would have split it at `&`
      // and left "INJECTED" somewhere it does not belong.
      expect(argv).toEqual([JAHAT]);
    } finally {
      mcp._request = asli;
      try {
        mcp.stopServer(NAMA);
      } catch (_) {}
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (_) {}
    }
  }, 30000);
});
