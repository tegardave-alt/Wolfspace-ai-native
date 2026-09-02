describe("registrasi tool MCP ke model", () => {
  test("tool defs gabungan menyertakan tool MCP yang aktif", async () => {
    const prev = globalThis.__wolfspaceMcpClient;
    globalThis.__wolfspaceMcpClient = {
      async getTools() {
        return [
          {
            type: "function",
            function: {
              name: "mcp_github_list_issues",
              description: "GitHub MCP tool",
              parameters: { type: "object", properties: {} },
            },
          },
        ];
      },
    } as any;

    try {
      const defs = await require("../agent/tools.ts").getToolDefs();
      const names = defs.map((d) => d.function && d.function.name);
      expect(names).toContain("mcp_github_list_issues");
    } finally {
      if (prev === undefined) delete globalThis.__wolfspaceMcpClient;
      else globalThis.__wolfspaceMcpClient = prev;
    }
  });
});
