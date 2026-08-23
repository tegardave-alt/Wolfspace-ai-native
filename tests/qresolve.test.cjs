const path = require("path");
const { qResolve, QROOT } = require("../agent/tools.cjs");

describe("qResolve", () => {
  // 1. Path valid di dalam QROOT harus return path absolut
  it("mengembalikan path absolut untuk file valid di dalam QROOT (config.json)", () => {
    const result = qResolve("config.json", false);
    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toBe(path.resolve(QROOT, "config.json"));
  });

  // 2. Path di luar QROOT harus throw Error "path di luar root"
  it('melempar Error "path di luar root" untuk path di luar QROOT', () => {
    expect(() => qResolve("../../etc/passwd", false)).toThrow(
      /path di luar root/,
    );
  });

  // 3. Path terlarang seperti "cloud-keys.json" harus throw Error "path terlarang"
  it('melempar Error "path terlarang" untuk cloud-keys.json', () => {
    expect(() => qResolve("cloud-keys.json", false)).toThrow(/path terlarang/);
  });

  // 4. Path terlarang seperti "node_modules/foo.cjs" harus throw Error "path terlarang"
  it('melempar Error "path terlarang" untuk node_modules/foo.cjs', () => {
    expect(() => qResolve("node_modules/foo.cjs", false)).toThrow(
      /path terlarang/,
    );
  });

  // 5. Path yang tidak editable (package.json) dengan mustBeEditable=true harus throw Error "path tidak boleh ditulis"
  it('melempar Error "path tidak boleh ditulis" untuk package.json dengan mustBeEditable=true', () => {
    expect(() => qResolve("package.json", true)).toThrow(
      /path tidak boleh ditulis/,
    );
  });

  // 6. Path .cjs yang editable (agent/tools.cjs) dengan mustBeEditable=true harus return path absolut
  it("mengembalikan path absolut untuk agent/tools.cjs dengan mustBeEditable=true", () => {
    const result = qResolve("agent/tools.cjs", true);
    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toBe(path.resolve(QROOT, "agent/tools.cjs"));
  });

  // 7. Path public/app.tsx dengan mustBeEditable=true harus return path absolut
  it("mengembalikan path absolut untuk public/app.tsx dengan mustBeEditable=true", () => {
    const result = qResolve("public/app.tsx", true);
    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toBe(path.resolve(QROOT, "public/app.tsx"));
  });

  // 8. Path dengan backticks/quotes di awal/akhir harus di-trim dan resolve dengan benar
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
