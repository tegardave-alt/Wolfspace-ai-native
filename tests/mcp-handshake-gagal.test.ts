// A failed MCP handshake must not leave the child process running.
//
// THE SYMPTOM THIS COMES FROM. Users report that turning a server on shows
// "⟳ Connecting…" and then "sometimes" does not finish. The sometimes is not
// random: HANDSHAKE_TIMEOUT_MS is 60 s precisely because `npx` instances fight
// over the npm cache during cold start — a 25 s attempt was measured producing
// 24/0/24/24 tools out of 50 across four simultaneous cold processes.
//
// Before the fix, a handshake that failed left its child ALIVE. It was cleaned
// up eventually, but only when the user pressed Connect again, because
// connectServer() calls stopServer() when it finds a half-started record. In
// between, a leaked `npx` was one more contender in exactly the fight that
// caused the failure — so each failure made the next one likelier, and the
// "sometimes" got worse the longer a session ran.
//
// WHY THE TEST IS SHAPED THIS WAY. CONFIG_PATH is hardcoded to config/mcp.json,
// so driving this through connectServer() would mean writing into the real
// configuration — test residue in the repository, which this project has been
// bitten by before. _startServer() takes its config as an argument, so calling
// it directly needs no config at all. And _request is stubbed to reject rather
// than waiting for the real 60 s timeout: the branch under test is the failure
// handler, not the clock that reaches it.

const path = require("path");
const mcp = require("../agent/mcp-client.ts");

const hidup = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e.code === "EPERM";
  }
};

const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A child that stays alive, reads nothing and answers nothing — the exact shape
 * of a server whose handshake fails while its process is perfectly healthy.
 *
 * NOT `node -e "setInterval(() => {}, 1000)"`, which is what this test tried
 * first and why it silently proved nothing. _startServer spawns with
 * `shell: true` on Windows, so cmd.exe mangles the parentheses and commas, node
 * exits 1, and the `close` handler tears the record down — the OLD path, not the
 * fix. The test passed with the fix deliberately disabled, which is how the hole
 * was found.
 *
 * `ping -n` and `sleep` carry no characters a shell will touch.
 */
function diamKonf() {
  return process.platform === "win32"
    ? { command: "ping", args: ["-n", "30", "127.0.0.1"] }
    : { command: "sleep", args: ["30"] };
}

describe("handshake MCP yang gagal", () => {
  const NAMA = "__uji-handshake-gagal__";
  let aslinya;

  beforeEach(() => {
    aslinya = mcp._request;
  });

  afterEach(() => {
    if (aslinya) mcp._request = aslinya;
    // Belt and braces: if the fix regresses, the spawned child would survive the
    // test and leak into the machine running it.
    try {
      mcp.stopServer(NAMA);
    } catch (_) {}
  });

  test("prosesnya dibunuh, bukan ditinggalkan untuk percobaan berikutnya", async () => {
    // A child that stays alive and answers nothing — the exact shape of a server
    // whose handshake fails while its process is healthy.
    const conf = diamKonf();

    // Rejects immediately instead of after HANDSHAKE_TIMEOUT_MS.
    mcp._request = () => Promise.reject(new Error("handshake ditolak (uji)"));

    const janji = mcp._startServer(NAMA, conf);

    // The record is written synchronously, before the handshake is awaited, so
    // the pid is readable here.
    const proc = mcp.servers[NAMA] && mcp.servers[NAMA].proc;
    expect(proc).toBeTruthy();
    const pid = proc.pid;
    expect(typeof pid).toBe("number");
    expect(hidup(pid)).toBe(true);

    await expect(janji).rejects.toThrow(/handshake ditolak/);

    // THE ASSERTION THAT MATTERS. Give the kill a moment to land — the signal is
    // delivered by the OS, not by the promise.
    for (let i = 0; i < 40 && hidup(pid); i++) await tunggu(50);
    expect(hidup(pid)).toBe(false);
  }, 20000);

  test("catatannya ikut dibuang, bukan hanya prosesnya", async () => {
    // A pid left recorded after its process died is a candidate victim of number
    // reuse — which is what _bukanMilikKita() exists to prevent. Dropping the
    // record is part of the cleanup, not an extra.
    const conf = diamKonf();
    mcp._request = () => Promise.reject(new Error("handshake ditolak (uji)"));

    await expect(mcp._startServer(NAMA, conf)).rejects.toThrow();
    expect(mcp.servers[NAMA]).toBeUndefined();
    expect(mcp.toolsCache && mcp.toolsCache[NAMA]).toBeUndefined();
  }, 20000);
});
