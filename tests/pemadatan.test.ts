// Compaction of a long conversation: agent/pemadatan.ts
//
// The invariant that matters most here is not "it got smaller". It is that the
// result is still a VALID message sequence. An assistant message carrying
// tool_calls whose answers were dropped, or a role:"tool" message whose
// assistant was dropped, is rejected outright by strict providers --
// self_agent.ts:2919 records deepseek doing exactly that. Compaction that
// produced a 400 would be worse than the overflow it exists to prevent, so that
// invariant is asserted structurally on every compacted result rather than
// checked by eye on one example.

const P = require("../agent/pemadatan.ts");
const anggaran = require("../agent/anggaran.ts");

/** Asserts a message array is a sequence a provider will accept. */
function assertValidSequence(pesan) {
  const answered = new Set();
  const declared = new Map();
  for (let i = 0; i < pesan.length; i++) {
    const m = pesan[i];
    if (m.role === "assistant" && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) declared.set(tc.id, i);
    }
    if (m.role === "tool") {
      // Every tool result must answer a call declared EARLIER in the array.
      expect(declared.has(m.tool_call_id)).toBe(true);
      expect(declared.get(m.tool_call_id)).toBeLessThan(i);
      answered.add(m.tool_call_id);
    }
  }
  // And every declared call must have been answered.
  for (const id of declared.keys()) expect(answered.has(id)).toBe(true);
}

/** A run of `n` steps, each: assistant with one tool_call, then its result.
 *  `isi` pads the tool result so the array can be pushed over the threshold. */
function buatRiwayat(n, isi = 100) {
  const out = [
    { role: "system", content: "SISTEM" },
    { role: "user", content: "PERMINTAAN ASLI" },
  ];
  for (let i = 0; i < n; i++) {
    out.push({
      role: "assistant",
      tool_calls: [
        {
          id: "c" + i,
          function: {
            name: i % 3 === 0 ? "read" : "bash",
            arguments: JSON.stringify({ path: "berkas" + (i % 4) + ".ts" }),
          },
        },
      ],
    });
    out.push({ role: "tool", tool_call_id: "c" + i, content: "x".repeat(isi) });
  }
  return out;
}

describe("pemadatan", () => {
  test("leaves a short conversation completely alone", () => {
    const pesan = buatRiwayat(3, 10);
    expect(P.padatkan(pesan)).toBeNull();
  });

  test("returns null rather than an array that only looks compacted", () => {
    expect(P.padatkan([])).toBeNull();
    expect(P.padatkan(null)).toBeNull();
  });

  test("measures characters exactly, and reports tokens as an estimate", () => {
    const pesan = [{ role: "user", content: "abcd" }];
    expect(P.ukuranChar(pesan)).toBe(4);
    expect(P.taksirToken(pesan)).toBe(4 / anggaran.PADAT_CHAR_PER_TOKEN);
  });

  test("compacts once over the threshold, and gets smaller", () => {
    const pesan = buatRiwayat(100, 3000);
    expect(P.perluPadat(pesan)).toBe(true);

    const h = P.padatkan(pesan);
    expect(h).not.toBeNull();
    expect(h.dibuang).toBeGreaterThan(0);
    expect(h.charSesudah).toBeLessThan(h.charSebelum);
    expect(h.pesan.length).toBeLessThan(pesan.length);
  });

  test("keeps the system message and the original request", () => {
    const h = P.padatkan(buatRiwayat(100, 3000));
    expect(h.pesan[0].role).toBe("system");
    expect(h.pesan[0].content).toContain("SISTEM");
    expect(h.pesan[1].role).toBe("user");
    expect(h.pesan[1].content).toBe("PERMINTAAN ASLI");
  });

  test("adds no new message: the digest rides in the system message", () => {
    const asli = buatRiwayat(100, 3000);
    const h = P.padatkan(asli);
    // Same number of ROLES in sequence terms -- nothing inserted, only removed.
    expect(h.pesan.length).toBe(asli.length - h.dibuang);
    expect(h.pesan[0].content).toContain("[RIWAYAT DIPADATKAN]");
  });

  test("the digest carries what actually ran, so work is not repeated", () => {
    const blok = P.padatkan(buatRiwayat(100, 3000)).pesan[0].content;
    expect(blok).toMatch(/tool: /);
    expect(blok).toMatch(/read|bash/);
    expect(blok).toMatch(/target: /);
    expect(blok).toMatch(/berkas\d\.ts/);
  });

  test("the digest never grows past its own ceiling", () => {
    const h = P.padatkan(buatRiwayat(400, 3000));
    const tambahan = h.pesan[0].content.length - "SISTEM".length;
    expect(tambahan).toBeLessThanOrEqual(anggaran.PADAT_BLOK_MAKS + 32);
  });

  test("never orphans a tool result, at any tail size", () => {
    // Sweeps the tail boundary across both parities. An off-by-one here lands
    // the cut in the middle of a tool group, which is the exact failure this
    // module must not produce -- so it is swept, not sampled.
    for (let ekor = 1; ekor <= 24; ekor++) {
      const h = P.padatkan(buatRiwayat(100, 3000), { sisaEkor: ekor });
      expect(h).not.toBeNull();
      assertValidSequence(h.pesan);
    }
  });

  test("keeps a valid sequence when the history has no system message", () => {
    const pesan = buatRiwayat(100, 3000).slice(1);
    const h = P.padatkan(pesan);
    expect(h.pesan[0].role).toBe("system");
    assertValidSequence(h.pesan);
  });

  test("honours an explicit threshold instead of the global one", () => {
    const pesan = buatRiwayat(20, 100);
    expect(P.padatkan(pesan)).toBeNull();
    expect(P.padatkan(pesan, { ambang: 10 })).not.toBeNull();
  });
});
