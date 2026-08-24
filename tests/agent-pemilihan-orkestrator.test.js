// Which orchestrator handles a /self-agent request.
//
// WOLFSPACE_AGENT_PY existed for a long time and did NOTHING: pythonAgentEnabled()
// read it, and nobody read pythonAgentEnabled(). The Python path was reachable
// only from its own tests, so "it is opt-in" was true of the code and false of
// the product.
//
// These pin the two halves that matter: the flag reaches a real decision, and the
// default does not move.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));

const SRV = fs
  .readFileSync(path.join(AKAR, "server.ts"), "utf8")
  .replace(/\r\n/g, "\n");

// Assertions are about CODE. The comment explaining the switch names the same
// symbols, so raw source would match its own explanation.
const KODE = SRV.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((b) => !b.trim().startsWith("//"))
  .join("\n");

describe("pemilihan orkestrator di /self-agent", () => {
  test("bendera BENAR-BENAR dibaca, bukan cuma ada", () => {
    expect(KODE).toContain("pythonAgentEnabled()");
    expect(KODE).toContain("selfAgentStreamPython");
  });

  test("bawaannya tetap agent JS", () => {
    // The default is not "whatever loaded last": it is chosen, and the Python
    // path only replaces it when the flag says so.
    const i = KODE.indexOf("let jalankanAgent = freshSelfAgentStream");
    const j = KODE.indexOf("pythonAgentEnabled()");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  test("jalur Python yang rusak TIDAK menjatuhkan permintaan", () => {
    // Falling back to the JS loop is better than failing the request, and this
    // is the difference between an experiment and an outage.
    const blok = KODE.slice(
      KODE.indexOf("let jalankanAgent = freshSelfAgentStream"),
      KODE.indexOf("await jalankanAgent("),
    );
    expect(blok).toMatch(/try \{/);
    expect(blok).toMatch(/catch \(e\) \{/);
  });

  test("diputuskan per PERMINTAAN, bukan sekali saat start", () => {
    // Cached at startup, the flag could only be changed by restarting — which
    // makes comparing the two paths on one machine impractical.
    const blok = KODE.slice(
      KODE.indexOf("let jalankanAgent = freshSelfAgentStream"),
      KODE.indexOf("await jalankanAgent("),
    );
    expect(blok).toContain('require.resolve("./agent/python-agent.ts")');
  });

  test("pythonAgentEnabled menjawab bendera dengan benar", () => {
    const A = require(path.join(AKAR, "agent", "python-agent.ts"));
    const sebelum = process.env.WOLFSPACE_AGENT_PY;
    try {
      delete process.env.WOLFSPACE_AGENT_PY;
      expect(A.pythonAgentEnabled()).toBe(false);
      process.env.WOLFSPACE_AGENT_PY = "1";
      expect(A.pythonAgentEnabled()).toBe(true);
      process.env.WOLFSPACE_AGENT_PY = "0";
      expect(A.pythonAgentEnabled()).toBe(false);
    } finally {
      if (sebelum === undefined) delete process.env.WOLFSPACE_AGENT_PY;
      else process.env.WOLFSPACE_AGENT_PY = sebelum;
    }
  });
});
