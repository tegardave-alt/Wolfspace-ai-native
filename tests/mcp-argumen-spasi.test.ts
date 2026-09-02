// An MCP argument containing a space must arrive as ONE argument.
//
// WHAT WENT WRONG. _startServer spawned with `shell: true` whenever the command
// resolved to a .cmd or .bat — which on Windows is every npx-based MCP server,
// i.e. nearly all of them. Node concatenates the arguments into one command line
// WITHOUT quoting them; its own DEP0190 warning says so in as many words:
//
//   "the arguments are not escaped, only concatenated"
//
// MEASURED. Spawning node with ["-y", "hugging face"]:
//
//   without a shell : ["-y","hugging face"]
//   with a shell    : ["-y","hugging","face"]
//
// The observed failure was npm fetching a package called `hugging` and
// returning 404. Nothing in that error points at quoting, and the WOLFSPACE log
// is no help either: it prints the CONFIGURED args, so it shows the space
// perfectly while the child never saw it.
//
// A Windows path — C:\Program Files\... — breaks in exactly the same way, which
// is the case that will keep happening.
//
// WHY THE FIX IS SHAPED LIKE THIS. cmd.exe is invoked the way Node itself would
// (/d /s /c, the whole line wrapped, windowsVerbatimArguments so Node does not
// re-mangle it) — but the line is built in mcp-client, with each token quoted.

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const mcp = require(path.join(AKAR, "agent", "mcp-client.ts"));

const K = mcp._kutipCmd;

describe("_kutipCmd", () => {
  test("an ordinary token is left completely alone", () => {
    // Quoting everything would work too, but it makes every command line
    // unreadable in a log and in Task Manager.
    expect(K("-y")).toBe("-y");
    expect(K("@scope/pkg")).toBe("@scope/pkg");
    expect(K("C:\\tools\\node.exe")).toBe("C:\\tools\\node.exe");
  });

  test("a space is what gets quoted", () => {
    expect(K("hugging face")).toBe('"hugging face"');
    expect(K("C:\\Program Files\\x\\y.json")).toBe(
      '"C:\\Program Files\\x\\y.json"',
    );
  });

  test("an empty token survives as an empty argument", () => {
    // Without this it would vanish from the line entirely, shifting every
    // argument after it by one position.
    expect(K("")).toBe('""');
  });

  test("an embedded quote is escaped, not dropped", () => {
    expect(K('say "hi"')).toBe('"say \\"hi\\""');
  });

  test("a trailing backslash cannot escape the closing quote", () => {
    // "C:\dir\" would end the argument at the backslash and swallow the rest of
    // the command line.
    expect(K("C:\\dir with space\\")).toBe('"C:\\dir with space\\\\"');
  });

  test("cmd metacharacters are quoted rather than executed", () => {
    for (const t of ["a&b", "a|b", "a>b", "a<b", "a^b", "a(b)"]) {
      expect(K(t).startsWith('"')).toBe(true);
    }
  });
});

// The unit test above pins the string. This one pins what the CHILD receives,
// which is the thing that actually broke.
const jalankanDiWindows =
  process.platform === "win32" ? describe : describe.skip;

jalankanDiWindows("through cmd.exe, end to end", () => {
  const TMP = fs.mkdtempSync(path.join(require("os").tmpdir(), "wsarg-"));
  const LIHAT = path.join(TMP, "lihat.cjs");
  fs.writeFileSync(
    LIHAT,
    "console.log(JSON.stringify(process.argv.slice(2)));\n",
  );
  afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

  /** Spawn the way _startServer does when the target needs cmd.exe. */
  function lewatCmd(args: string[]) {
    const baris =
      '"' +
      [process.execPath, LIHAT, ...args].map((a: any) => K(a)).join(" ") +
      '"';
    const r = spawnSync(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", baris],
      {
        encoding: "utf8",
        windowsVerbatimArguments: true,
      },
    );
    return JSON.parse((r.stdout || "[]").trim());
  }

  test("an argument with a space stays one argument", () => {
    expect(lewatCmd(["-y", "hugging face"])).toEqual(["-y", "hugging face"]);
  });

  test("a path with spaces is not split", () => {
    expect(lewatCmd(["--config", "C:\\Program Files\\a b\\c.json"])).toEqual([
      "--config",
      "C:\\Program Files\\a b\\c.json",
    ]);
  });

  test("the old `shell: true` route really did split it", () => {
    // Kept as the reason this file exists. If Node ever starts quoting for us
    // this goes red, and the workaround above can be reconsidered.
    const r = spawnSync(process.execPath, [LIHAT, "-y", "hugging face"], {
      encoding: "utf8",
      shell: true,
    });
    expect(JSON.parse((r.stdout || "[]").trim())).toEqual([
      "-y",
      "hugging",
      "face",
    ]);
  });
});

describe("the spawn path in mcp-client", () => {
  const SUMBER = fs.readFileSync(
    path.join(AKAR, "agent", "mcp-client.ts"),
    "utf8",
  );

  test("_startServer no longer passes shell:true", () => {
    // Source-level, because the whole defect was invisible at the call site: it
    // spawned successfully and only the arguments were wrong.
    expect(SUMBER).not.toMatch(/shell:\s*perluShell/);
    expect(SUMBER).toMatch(/windowsVerbatimArguments:\s*true/);
  });

  test("every token on the cmd line goes through _kutipCmd", () => {
    expect(SUMBER).toMatch(/\.map\(_kutipCmd\)\.join\(" "\)/);
  });
});
