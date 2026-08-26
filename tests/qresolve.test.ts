const path = require("path");
const { qResolve, QROOT } = require("../agent/tools.ts");

describe("qResolve", () => {
  // 1. A valid path inside QROOT resolves to an absolute path
  it("mengembalikan path absolut untuk file valid di dalam QROOT (config.json)", () => {
    const result = qResolve("config.json", false);
    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toBe(path.resolve(QROOT, "config.json"));
  });

  // 2. A path outside QROOT is refused as outside the root
  it('melempar Error "path di luar root" untuk path di luar QROOT', () => {
    expect(() => qResolve("../../etc/passwd", false)).toThrow(
      /path di luar root/,
    );
  });

  // 3. A forbidden path such as "cloud-keys.json" is refused
  it('melempar Error "path terlarang" untuk cloud-keys.json', () => {
    expect(() => qResolve("cloud-keys.json", false)).toThrow(/path terlarang/);
  });

  // 4. A forbidden path such as "node_modules/foo.cjs" is refused
  it('melempar Error "path terlarang" untuk node_modules/foo.cjs', () => {
    expect(() => qResolve("node_modules/foo.cjs", false)).toThrow(
      /path terlarang/,
    );
  });

  // 5. A non-editable path (package.json) with mustBeEditable=true must throw Error "path is not writable"
  it('throws Error "path is not writable" for package.json with mustBeEditable=true', () => {
    expect(() => qResolve("package.json", true)).toThrow(
      /path is not writable/,
    );
  });

  // 6. An editable .cjs path resolves under mustBeEditable=true
  it("mengembalikan path absolut untuk agent/tools.ts dengan mustBeEditable=true", () => {
    const result = qResolve("agent/tools.ts", true);
    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toBe(path.resolve(QROOT, "agent/tools.ts"));
  });

  // 7. public/app.tsx resolves under mustBeEditable=true. THIS is the case
  //    that would have caught Q_ALLOWED losing .ts/.tsx in the migration --
  //    see agent/tools/file-tools.ts. It never ran, because the file was
  //    named .test.cjs and jest's testMatch only covers [tj]s.
  it("mengembalikan path absolut untuk public/app.tsx dengan mustBeEditable=true", () => {
    const result = qResolve("public/app.tsx", true);
    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toBe(path.resolve(QROOT, "public/app.tsx"));
  });

  // 8. Leading/trailing backticks and quotes are trimmed before resolving
  it("mem-trim backticks/quotes di awal/akhir dan resolve dengan benar", () => {
    const result = qResolve("`config.json`", false);
    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toBe(path.resolve(QROOT, "config.json"));
  });

  it("mem-trim double quotes di awal/akhir dan resolve dengan benar", () => {
    const result = qResolve('"config.json"', false);
    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toBe(path.resolve(QROOT, "config.json"));
  });

  it("mem-trim single quotes di awal/akhir dan resolve dengan benar", () => {
    const result = qResolve("'config.json'", false);
    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toBe(path.resolve(QROOT, "config.json"));
  });
});
