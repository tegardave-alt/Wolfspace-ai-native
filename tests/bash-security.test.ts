// Jest tests for bash tool security filter in agent/tools.cjs
const { runSelfTool } = require("../agent/tools.cjs");

describe("bash tool security filter", () => {
  it('menolak "rm -rf /"', async () => {
    const res = await runSelfTool("bash", { command: "rm -rf /" }, null);
    expect(res.ok).toBe(false);
    expect(res.output).toMatch(/REJECTED|dangerous/i);
  });

  it('menolak "format C:"', async () => {
    const res = await runSelfTool("bash", { command: "format C:" }, null);
    expect(res.ok).toBe(false);
  });

  it('menolak "shutdown /s"', async () => {
    const res = await runSelfTool("bash", { command: "shutdown /s" }, null);
    expect(res.ok).toBe(false);
  });

  it('menolak "git push origin main"', async () => {
    const res = await runSelfTool(
      "bash",
      { command: "git push origin main" },
      null,
    );
    expect(res.ok).toBe(false);
  });

  it('mengizinkan "echo hello" dan output mengandung "hello"', async () => {
    const res = await runSelfTool("bash", { command: "echo hello" }, null);
    expect(res.ok).toBe(true);
    expect(res.output).toContain("hello");
  }, 30000);

  it('menolak "del /f file.txt"', async () => {
    const res = await runSelfTool("bash", { command: "del /f file.txt" }, null);
    expect(res.ok).toBe(false);
  });

  it('menolak fork bomb ":(){ :|:& }"', async () => {
    const res = await runSelfTool("bash", { command: ":(){ :|:& }" }, null);
    expect(res.ok).toBe(false);
  });
});
