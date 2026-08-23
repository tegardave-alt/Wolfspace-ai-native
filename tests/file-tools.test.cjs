// Jest tests for qGlob, qGrep, qRead from agent/tools.cjs
const { qGlob, qGrep, qRead } = require("../agent/tools.cjs");

describe("qGlob", () => {
  it("*agent* should return a string containing agent-related files", () => {
    const result = qGlob("*agent*");
    expect(typeof result).toBe("string");
    expect(result).toContain("self_agent.ts");
  });

  it('public/**/*.jsx should return a string containing "public/app.tsx"', () => {
    const result = qGlob("public/**/*.jsx");
    expect(typeof result).toBe("string");
    expect(result).toContain("public/app.tsx");
  });

  it('nonexistent pattern should return a string (possibly empty or "(no matches)")', () => {
    const result = qGlob("nonexistent123.xyz");
    expect(typeof result).toBe("string");
  });
});

describe("qGrep", () => {
  it('"QROOT" should return a string containing "agent/tools.cjs"', () => {
    const result = qGrep("QROOT");
    expect(typeof result).toBe("string");
    expect(result).toContain("agent/tools.cjs");
  });

  it('nonexistent pattern should return a string (possibly "(no matches)" or empty)', () => {
    const result = qGrep("zzznonexistent999");
    expect(typeof result).toBe("string");
  });
});

describe("qRead", () => {
  it("config.json should return a string containing a config key (port, model, etc.)", () => {
    const result = qRead("config.json");
    expect(typeof result).toBe("string");
    // Accept any common config key
    expect(result.toLowerCase()).toMatch(
      /port|model|host|key|url|name|version|token|api|secret|provider|temperature|max/,
    );
  });

  it("config.json with near=1 should return a string with line numbers", () => {
    const result = qRead("config.json", 1);
    expect(typeof result).toBe("string");
    // Line-numbered output uses "N\t<line>" format (tab after number)
    expect(result).toMatch(/^\d+\t/m);
  });
});
