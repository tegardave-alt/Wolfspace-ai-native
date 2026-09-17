// Connect must be able to revive a server that shows "Failed".
//
// THE BUG THE USER HIT. Press Connect on a server badged "Failed"; the badge
// flickers to "Connecting…" and drops straight back to "Failed". Nothing else
// in the UI can revive it, so the server is stuck for the rest of the session.
//
// It was a disagreement about one word. The list computes
//
//   active = !disabled && ready && lastCallOk !== false        (Components.tsx)
//
// so a server whose last TOOL CALL failed is shown as not active -- and
// clicking a not-active server sends POST /mcp/connect, which is exactly right:
// the user is asking for it to be fixed. connectServer() then looked only at
//
//   if (ada && ada.ready) return { ok: true, already: true }
//
// and did nothing, because by ITS definition the server was connected. Both
// sides were self-consistent and the pair was a dead end.
//
// WHAT "FAILED" ACTUALLY MEANS here, since it misleads: it is not a failure to
// connect. A server that never started reads "○ Berhenti", one still starting
// reads "◌ Connecting…". "✕ Failed" is only ever lastCallOk === false.
//
// Restarting cannot repair a cause outside the process -- a revoked token stays
// revoked -- but it clears a stale verdict: a new process starts with
// lastCallOk null, so the badge stops asserting a failure that may be over, and
// the next call decides it again.

const path = require("path");
const fs = require("fs");
const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const { spawn } = require("child_process");
const mcp = require(path.join(AKAR, "agent", "mcp-client.ts"));

const NAMA = "uji-panggilan-gagal";
/** Starts fine, never speaks MCP. Enough: connect does not await the handshake. */
const DIAM = {
  command: process.execPath,
  args: ["-e", "setTimeout(function () {}, 30000)"],
};

let _configAsli: any;
let _anak: any = null;

beforeEach(() => {
  // The real config belongs to whoever runs this. Swapped for one this test
  // owns, so the assertions do not depend on the machine.
  _configAsli = mcp._loadConfigMentah;
  mcp._loadConfigMentah = () => ({ mcpServers: { [NAMA]: DIAM } });
});

afterEach(() => {
  mcp._loadConfigMentah = _configAsli;
  try {
    mcp.stopServer(NAMA);
  } catch (_) {}
  if (_anak) {
    try {
      _anak.kill();
    } catch (_) {}
    _anak = null;
  }
  delete mcp._mulai[NAMA];
  delete mcp._galatMulai[NAMA];
  delete mcp.servers[NAMA];
});

/** A ready server record backed by a REAL process, so stopServer has something
 *  genuine to kill rather than a shape that only looks like one. */
function pasangServerSiap(lastCallOk: any) {
  _anak = spawn(process.execPath, ["-e", "setTimeout(function () {}, 30000)"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  _anak.stdin.on("error", () => {});
  mcp.servers[NAMA] = {
    proc: _anak,
    ready: true,
    lastCallOk,
    lastCallAt: Date.now(),
  };
}

describe("Connect pada server yang panggilannya gagal", () => {
  test("server READY dengan panggilan terakhir GAGAL dimulai ulang", async () => {
    pasangServerSiap(false);
    const lama = mcp.servers[NAMA].proc;
    const r: any = await mcp.connectServer(NAMA);

    // The old shortcut answered this with { already: true } and stopped.
    expect(r.already).toBeFalsy();
    expect(r.ok).toBe(true);
    expect(r.status).toBe("starting");
    // And it is a genuinely new process, not the same one relabelled.
    expect(mcp.servers[NAMA] && mcp.servers[NAMA].proc).not.toBe(lama);
  }, 20000);

  // Three values, three cases, and they are NOT the same case. `true` is a call
  // that worked; null and undefined are a server that has never been called at
  // all -- the state every freshly connected server is in. Only `false` may
  // restart, so the two never-called spellings have to be checked too.
  //
  // Written as test.each after a first attempt looped inside ONE test with a
  // `return` in the loop body: it passed while exercising the first value only.
  test.each([
    ["berhasil", true],
    ["belum pernah (null)", null],
    ["belum pernah (undefined)", undefined],
  ])(
    "server sehat (%s) TIDAK dimulai ulang — tombolnya bukan pemutus koneksi",
    async (_label: any, nilai: any) => {
      // Over-correcting would be its own bug: pressing Connect on something
      // that works would kill a live process and drop its tools.
      pasangServerSiap(nilai);
      const lama = mcp.servers[NAMA].proc;
      const r: any = await mcp.connectServer(NAMA);
      expect(r.already).toBe(true);
      expect(mcp.servers[NAMA].proc).toBe(lama);
    },
    20000,
  );
});

describe("kedua sisi memakai definisi yang sama", () => {
  const baca = (rel: string) => fs.readFileSync(path.join(AKAR, rel), "utf8");

  test("UI menghitung lastCallOk, dan klien sekarang juga", () => {
    // Pinned together on purpose. These two lines living in different files is
    // what let them drift into a dead button; if either is edited alone, this
    // fails and says so.
    expect(baca("public/app/Components.tsx")).toContain(
      "s.lastCallOk !== false",
    );
    expect(baca("agent/mcp-client.ts")).toContain("ada.lastCallOk === false");
  });

  test("layar pemilih proyek memakai rumus yang sama", () => {
    // The same list is rendered in two places. A fix that reached only one of
    // them would leave the dead button alive on the other screen.
    expect(baca("public/app/Screens.tsx")).toContain("lastCallOk !== false");
  });
});
