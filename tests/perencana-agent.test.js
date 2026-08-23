// The planner is ONE implementation with two callers, for the same reason the
// guards are: two copies of a decision drift, and the copy is always the one
// that drifts.
//
// Before this, the Python orchestrator answered its __plan__ pseudo-tool with a
// stub that ALWAYS returned an empty checklist. Nothing failed — the graph
// accepted it and the run continued — so the loss was invisible: the checklist is
// the ground truth re-injected at every step, and since failures are recorded
// against items, it also carries "already tried, already failed".

const fs = require("fs");
const path = require("path");

require("../scripts/ts-register.cjs");
const perencana = require("../agent/perencana-agent.ts");
const penjaga = require("../agent/penjaga-agent.ts");

const AKAR = path.resolve(__dirname, "..");
const SELF = fs.readFileSync(path.join(AKAR, "agent", "self_agent.ts"), "utf8");
const PY = fs.readFileSync(path.join(AKAR, "agent", "python-agent.ts"), "utf8");

describe("perencana: satu implementasi, dua pemanggil", () => {
  test("prompt planner hanya ada di SATU berkas", () => {
    // The thing that made the two paths able to differ at all.
    expect((SELF.match(/AI Planner/g) || []).length).toBe(0);
    expect((PY.match(/AI Planner/g) || []).length).toBe(0);
    expect(perencana.promptRencana("x")).toContain("AI Planner");
  });

  test("kedua orkestrator memanggil rencanakan yang sama", () => {
    expect(SELF).toContain("perencana-agent.ts");
    expect(SELF).toContain("rencanakan(");
    expect(PY).toContain("perencana-agent.ts");
    expect(PY).toContain("rencanakan(");
  });

  test("jalur Python TIDAK lagi mengembalikan checklist kosong", () => {
    // The exact shape of the old stub. If it ever comes back, this goes red.
    //
    // Comments are stripped first: the comment explaining the fix QUOTES the
    // stub it replaced, and matching raw source would trip over the explanation
    // for the fix itself.
    const kode = PY.replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((baris) => !baris.trim().startsWith("//"))
      .join("\n");
    expect(kode).not.toMatch(
      /return \{ ok: true, messages: \[\], checklist: \[\] \}/,
    );
    // And it really does call the shared planner instead.
    expect(kode).toContain("perencana.rencanakan(");
  });
});

describe("perencana: mengurai balasan model", () => {
  test("hanya baris berawalan '- ' yang jadi item", () => {
    expect(perencana.parseChecklist("- satu\n- dua")).toEqual(["satu", "dua"]);
  });

  test("prosa TIDAK diurai jadi checklist", () => {
    // Half-parsed prose would put sentences in the checklist, and the checklist
    // is re-injected into the system message on every single step.
    expect(perencana.parseChecklist("Saya akan mengerjakan ini dulu.")).toEqual(
      [],
    );
    expect(perencana.parseChecklist("")).toEqual([]);
    expect(perencana.parseChecklist(null)).toEqual([]);
  });

  test("dibatasi MAKS_LANGKAH", () => {
    // Length is paid again on every model call, so the cap is not cosmetic.
    const banyak = Array.from({ length: 9 }, (_, i) => "- item " + i).join(
      "\n",
    );
    expect(perencana.parseChecklist(banyak)).toHaveLength(
      perencana.MAKS_LANGKAH,
    );
  });
});

describe("perencana: ganti provider BEDA dari retry provider", () => {
  // The two predicates answer different questions, and collapsing them would
  // silently disable fallback for dead keys — on a real run here, 8 of the 10
  // keys in CLOUD_KEYS were dead when measured.
  test("401 dan kuota habis: GANTI provider, jangan retry yang sama", () => {
    for (const pesan of [
      "401 Unauthorized",
      "insufficient_quota",
      "FreeUsageLimit",
    ]) {
      expect(perencana.layakGantiProvider(pesan)).toBe(true);
      expect(penjaga.galatSementara(pesan)).toBe(false);
    }
  });

  test("kegagalan transport: keduanya setuju", () => {
    for (const pesan of ["ECONNRESET", "socket hang up", "ETIMEDOUT"]) {
      expect(perencana.layakGantiProvider(pesan)).toBe(true);
      expect(penjaga.galatSementara(pesan)).toBe(true);
    }
  });

  test("penolakan biasa bukan alasan pindah", () => {
    expect(perencana.layakGantiProvider("invalid request: bad schema")).toBe(
      false,
    );
  });
});

describe("perencana: TIDAK PERNAH menggagalkan run", () => {
  test("semua provider mati -> tetap mengembalikan checklist fallback", async () => {
    // The planner is a convenience; the executor runs the same without one.
    // Before there was a fallback, one dead key in first position killed the
    // ENTIRE run 1-2 seconds in.
    const cloudPath = require.resolve("../agent/cloud.ts");
    const asli = require.cache[cloudPath];
    require.cache[cloudPath] = {
      id: cloudPath,
      filename: cloudPath,
      loaded: true,
      exports: {
        askCloudTools: async () => {
          throw new Error("401 Unauthorized");
        },
        CLOUD_KEYS: {},
        fillCloudKey: () => {},
      },
    };
    try {
      const hasil = await perencana.rencanakan(
        { provider: "mati" },
        "buat sesuatu",
      );
      expect(hasil.checklist).toEqual([perencana.RENCANA_FALLBACK]);
      expect(hasil.checklist.length).toBeGreaterThan(0);
    } finally {
      if (asli) require.cache[cloudPath] = asli;
      else delete require.cache[cloudPath];
    }
  });
});
