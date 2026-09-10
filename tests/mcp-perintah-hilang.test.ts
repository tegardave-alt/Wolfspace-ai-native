// A missing command has to say what is missing, not quote cmd.exe.
//
// WHAT A USER GOT. WOLFSPACE ships MCP entries that start with `npx`, and npx
// comes with Node.js -- a separate install. WOLFSPACE bundles Electron's Node
// RUNTIME, which is not the same thing: there is no npx COMMAND inside the
// installed app, and _cariExe searches PATH and nothing else. So on a machine
// without Node.js the server simply failed, and the whole explanation was
// whatever cmd.exe had said:
//
//   'npx' is not recognized as an internal or external command
//
// True, and useless to anyone who does not already know where npx comes from.
// Nothing anywhere told them Node.js was a prerequisite.
//
// WHAT IS NOT DONE HERE, deliberately: the start is not blocked. _startServer
// already records that an unresolvable command is still ATTEMPTED, because the
// resolver can be wrong where cmd.exe is right, and failing early would break
// configurations that work today. So this explains a failure that has already
// happened rather than predicting one -- and the last test below pins that
// decision so a future tidy-up does not turn it into a fast failure.

const path = require("path");
const fs = require("fs");
const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const mcp = require(path.join(AKAR, "agent", "mcp-client.ts"));

const baca = (rel: string) => fs.readFileSync(path.join(AKAR, rel), "utf8");

let _configAsli: any;
const NAMA = "uji-perintah-hilang";

beforeEach(() => {
  _configAsli = mcp._loadConfigMentah;
});

afterEach(() => {
  mcp._loadConfigMentah = _configAsli;
  try {
    mcp.stopServer(NAMA);
  } catch (_) {}
  delete mcp._mulai[NAMA];
  delete mcp._galatMulai[NAMA];
  delete mcp.servers[NAMA];
});

/** Runs one server config to its failure and returns the reported reason. */
async function alasanGagal(conf: any): Promise<string> {
  mcp._loadConfigMentah = () => ({ mcpServers: { [NAMA]: conf } });
  const r: any = await mcp.connectServer(NAMA, { tunggu: true });
  return String((r && r.error) || "");
}

describe("perintah yang tak ada di PATH menjelaskan dirinya", () => {
  test("npx hilang -> menyebut Node.js, dalam bahasa Inggris", async () => {
    // An empty PATH for the child is the whole simulation: it is exactly what a
    // machine without Node.js looks like to this code path.
    const pesan = await alasanGagal({
      command: "npx",
      args: ["-y", "paket-apa-pun"],
      env: { PATH: "", Path: "" },
    });
    expect(pesan).toContain("was not found on PATH");
    expect(pesan).toContain("Node.js");
    // The point of the sentence: WHY the bundled runtime does not count.
    expect(pesan).toContain("not available as a command");
    // And something to do about it.
    expect(pesan).toContain("nodejs.org");
  }, 60000);

  test("perintah lain yang hilang disebut apa adanya", async () => {
    const pesan = await alasanGagal({
      command: "perintah-yang-tak-ada-xyz",
      args: [],
      env: {},
    });
    expect(pesan).toContain("was not found on PATH");
    expect(pesan).toContain("config/mcp.json");
    // Node.js has nothing to do with this one and must not be blamed for it.
    expect(pesan).not.toContain("nodejs.org");
  }, 60000);

  test("galat asli TETAP ada — penjelasan ditambahkan, bukan menggantikan", async () => {
    // The stderr tail is what makes an unexpected failure diagnosable at all.
    // Replacing it with a friendlier sentence would trade a real reason for a
    // guess.
    const pesan = await alasanGagal({
      command: "perintah-yang-tak-ada-xyz",
      args: [],
      env: {},
    });
    expect(pesan).toContain("the server exited with code");
    expect(pesan).toContain("is not recognized");
  }, 60000);
});

describe("penjelasan tak boleh berubah jadi penolakan", () => {
  const SRC = baca("agent/mcp-client.ts");

  test("perintah yang tak teresolusi TETAP dicoba lewat shell", () => {
    // Pinned because it is a decision, not an oversight: _cariExe can miss a
    // command that cmd.exe finds, and failing early would break a config that
    // works today.
    expect(SRC).toContain("!tersolusi ||");
    expect(SRC).toContain("spawn(tersolusi || cmd");
  });

  test("penjelasannya hanya muncul kalau memang tak teresolusi", () => {
    const i = SRC.indexOf("function _sebabPerintahHilang(");
    expect(i).toBeGreaterThan(-1);
    expect(SRC.slice(i, i + 200)).toContain('if (tersolusi) return "";');
  });
});
