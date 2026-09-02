// Where the credential typed in the MCP dialog actually goes.
//
// WHAT WENT WRONG. The UI asks for two things — a name and a credential — and
// then had to GUESS three it could not know: what command runs the server,
// whether it is stdio or remote, and what the secret is called. Two of those
// guesses lived in different files:
//
//   command    -> MCP_ALIAS in Config.tsx          (notion, n8n, figma, github)
//   credential -> an if/else chain in Screens.tsx  (github, brave, postgres,
//                                                   slack, notion, figma)
//                 AND another one in Components.tsx (the same, minus notion,
//                 plus a remote-bearer branch Screens never had)
//
// Three lists, none matching. Anything in none of them fell through to
// `env = { TOKEN: value }` — a variable name no MCP server reads. So the dialog
// reported success, the config looked filled in, and the connection could not
// work.
//
// OBSERVED: typing `huggingface` produced `npx -y huggingface` (npm 404, since
// there is no such package — the official HuggingFace server is a REMOTE
// endpoint), with the token written to TOKEN. Both halves wrong, no complaint.
//
// The registry now carries the command and the credential TOGETHER, and when it
// does not know a credential's name it says so instead of inventing one.
//
// The resolver is TAKEN FROM SOURCE and run through the same Babel transform
// index.html uses — not reimplemented here, so editing Config.tsx changes what
// this test sees.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");

globalThis.self = globalThis;
const Babel = require(path.join(AKAR, "public/vendor/babel.min.js"));
const kode = Babel.transform(
  fs.readFileSync(path.join(AKAR, "public/app/Config.tsx"), "utf8"),
  { presets: ["react", "typescript"], filename: "/app/Config.tsx" },
).code;

const sandbox: any = { window: undefined, localStorage: undefined };
const fn = new Function(
  "window",
  "localStorage",
  kode + "\nreturn { mcpResolvePerintah, mcpResolveKredensial, MCP_DIKENAL };",
);
const { mcpResolvePerintah, mcpResolveKredensial, MCP_DIKENAL } = fn(
  sandbox.window,
  sandbox.localStorage,
);

const kred = (type: any, teks: any, args: any = []) =>
  mcpResolveKredensial(type, teks, args);

describe("satu registry, bukan tiga daftar", () => {
  test("every entry can actually be run", () => {
    // An entry is either something to spawn or a URL to bridge to. One that is
    // neither would resolve to `undefined` as a command and fail at spawn.
    for (const [nama, e] of Object.entries<any>(MCP_DIKENAL)) {
      const punyaPerintah = Boolean(e.command && e.args);
      expect([nama, punyaPerintah || Boolean(e.url)]).toEqual([nama, true]);
    }
  });

  test("a credential mapping is recorded only where it is known", () => {
    // The point is not that every entry HAS one — it is that a recorded one is
    // a real name rather than a guess, and that a missing one is admitted.
    for (const [nama, e] of Object.entries<any>(MCP_DIKENAL)) {
      if (!e.kredensial) continue;
      const k = e.kredensial;
      const bentuk = Boolean(k.env || k.arg || k.header);
      expect([nama, bentuk]).toEqual([nama, true]);
    }
  });
});

describe("kredensial ditaruh di tempat yang benar", () => {
  test("a known server gets its own variable name", () => {
    expect(kred("github", "ghp_abc").env).toEqual({
      GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_abc",
    });
    expect(kred("notion", "secret_x").env).toEqual({
      NOTION_TOKEN: "secret_x",
    });
    expect(kred("brave", "bsk").env).toEqual({ BRAVE_API_KEY: "bsk" });
  });

  test("figma takes its key on the command line, not in the environment", () => {
    const r = kred("figma", "fig_123", [
      "-y",
      "figma-developer-mcp",
      "--stdio",
    ]);
    expect(r.env).toEqual({});
    expect(r.args).toEqual([
      "-y",
      "figma-developer-mcp",
      "--stdio",
      "--figma-api-key=fig_123",
    ]);
  });

  test("TOKEN is never invented again", () => {
    // The whole defect in one assertion.
    const r = kred("sesuatu-yang-tak-dikenal", "rahasia");
    expect(r.env).toEqual({});
    expect(r.perluNama).toBe(true);
  });

  test("an unknown server is workable via NAME=value", () => {
    // The escape hatch: no registry entry needed, nothing guessed.
    expect(kred("apa-saja", "MY_API_KEY=abc123").env).toEqual({
      MY_API_KEY: "abc123",
    });
    expect(kred("apa-saja", "MY_API_KEY=abc123").perluNama).toBeUndefined();
  });

  test("JSON is used as the environment verbatim", () => {
    expect(kred("apa-saja", '{"A":"1","B":"2"}').env).toEqual({
      A: "1",
      B: "2",
    });
  });

  test("an empty credential asks for nothing", () => {
    expect(kred("github", "").env).toEqual({});
    expect(kred("github", "").perluNama).toBeUndefined();
  });
});

describe("server remote", () => {
  test("huggingface resolves to the bridge, not to a package", () => {
    // `npx -y huggingface` is a 404 and always was: the official server is an
    // endpoint. This is the case that prompted the whole change.
    const r = mcpResolvePerintah("huggingface");
    expect(r.command).toBe("node");
    expect(r.args[0]).toBe("scripts/mcp-http-bridge.cjs");
    expect(r.args[1]).toBe("https://huggingface.co/mcp");
  });

  test("its token travels as a header, never in argv", () => {
    // argv shows up in any process listing and is recorded with it.
    const r = kred("huggingface", "hf_abc");
    expect(JSON.parse(r.env.MCP_HEADERS)).toEqual({
      Authorization: "Bearer hf_abc",
    });
    expect(JSON.stringify(r.args)).not.toContain("hf_abc");
  });

  test("a typed URL behaves the same way", () => {
    const r = kred("https://contoh.test/mcp", "tok");
    expect(JSON.parse(r.env.MCP_HEADERS)).toEqual({
      Authorization: "Bearer tok",
    });
  });
});

describe("kedua permukaan memakai resolver bersama", () => {
  const SCREENS = fs.readFileSync(
    path.join(AKAR, "public/app/Screens.tsx"),
    "utf8",
  );
  const COMPONENTS = fs.readFileSync(
    path.join(AKAR, "public/app/Components.tsx"),
    "utf8",
  );

  test.each([
    ["Screens.tsx", () => SCREENS],
    ["Components.tsx", () => COMPONENTS],
  ])("%s calls mcpResolveKredensial", (_nama, ambil: any) => {
    expect(ambil()).toMatch(/mcpResolveKredensial\(/);
  });

  test.each([
    ["Screens.tsx", () => SCREENS],
    ["Components.tsx", () => COMPONENTS],
  ])("%s no longer maps credentials itself", (_nama, ambil: any) => {
    const src = ambil();
    // Anchored on CODE, never on prose. The first version of this assertion
    // matched `env = { TOKEN:` and went red against the comment directly above
    // the fix explaining that `env = { TOKEN: ... }` was the bug — a test
    // reading its own file's commentary rather than its behaviour.
    expect(src).not.toMatch(/TOKEN: envVars/);
    expect(src).not.toMatch(/JSON\.parse\(envVars\)/);
    expect(src).not.toMatch(/GITHUB_PERSONAL_ACCESS_TOKEN:/);
    expect(src).not.toMatch(/BRAVE_API_KEY:/);
  });
});
