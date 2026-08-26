// The shared agent guards, and the parity that makes sharing them worth it.
//
// These checks used to live inside a closure in agent/self_agent.ts. There are
// now two orchestrators, and a guard present on only one of them is worse than
// no guard: the SAME request would behave differently depending on which one
// handled it. This file holds the extracted implementation to the behaviour the
// original had, so the extraction is a move rather than a rewrite.
require(require("path").join(__dirname, "..", "scripts", "ts-register.cjs"));

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const G = require(path.join(AKAR, "agent", "penjaga-agent.ts"));

describe("gerbang persetujuan", () => {
  test("bash SELALU minta persetujuan — ia jalan tanpa broker maupun sandbox", () => {
    expect(
      G.perluPersetujuan({ function: { name: "bash", arguments: "{}" } }),
    ).toBe(true);
    // The flat shape the Python worker sends must decide identically. A gate
    // that only understood one call shape would be a gate with a hole in it.
    expect(G.perluPersetujuan({ name: "bash", args: {} })).toBe(true);
  });

  test("read/grep/edit TIDAK digerbang", () => {
    for (const n of ["read", "grep", "edit", "write", "list"]) {
      expect(
        G.perluPersetujuan({ function: { name: n, arguments: "{}" } }),
      ).toBe(false);
    }
  });

  test("git digerbang PER OPERASI: tulis minta izin, baca tidak", () => {
    // The distinction that matters: `commit` runs the repo's hooks outside the
    // containment, `status` runs nothing.
    const tulis = {
      function: { name: "git", arguments: '{"operasi":"commit"}' },
    };
    const baca = {
      function: { name: "git", arguments: '{"operasi":"status"}' },
    };
    expect(G.perluPersetujuan(tulis)).toBe(true);
    expect(G.perluPersetujuan(baca)).toBe(false);
  });

  test("argumen yang tak bisa diurai GAGAL KE ARAH MEMINTA IZIN", () => {
    // Failing the other way would turn a malformed argument into a way past the
    // gate, which is the one direction this must never fail in.
    expect(
      G.perluPersetujuan({ function: { name: "git", arguments: "{rusak" } }),
    ).toBe(true);
    expect(G.perluPersetujuan({ name: "git", args: undefined })).toBe(true);
  });

  test("operasi git yang tak dikenal juga minta izin", () => {
    const asing = {
      function: { name: "git", arguments: '{"operasi":"belum-ada"}' },
    };
    expect(G.perluPersetujuan(asing)).toBe(true);
  });
});

describe("klasifikasi keluaran tak substantif", () => {
  test("kosong dan 'tidak ada' bukan bukti", () => {
    for (const s of [
      "",
      "   ",
      "(ok)",
      "tidak ada file cocok",
      "(no matching file)",
      "not found",
      "0 hasil",
    ]) {
      expect(G.takSubstantif(s)).toBe(true);
    }
  });

  test("isi berkas sungguhan ADALAH bukti", () => {
    expect(G.takSubstantif("function halo() { return 1; }")).toBe(false);
    expect(G.takSubstantif("agent/tools/index.ts:42")).toBe(false);
  });

  test("string keluaran yang diseragamkan tetap terklasifikasi sama", () => {
    // The tool output was unified from "(tidak ada file cocok)" to
    // "(no matching file)" during the tools migration. Both must still read as
    // non-substantive, or evidence checking changes meaning with a translation.
    expect(G.takSubstantif("(tidak ada file cocok)")).toBe(true);
    expect(G.takSubstantif("(no matching file)")).toBe(true);
  });
});

describe("jawaban harus berpijak pada bukti", () => {
  test("tanpa tool yang jalan, jawaban apa pun sah", () => {
    // A question answered from the model's own knowledge is a legitimate answer.
    expect(G.buktiSahih("langit biru karena hamburan Rayleigh", [])).toBe(true);
  });

  test("menyebut path dari bukti sudah cukup", () => {
    const bukti = ["agent/tools/index.ts:42: const x = 1"];
    expect(
      G.buktiSahih("perubahannya ada di agent/tools/index.ts", bukti),
    ).toBe(true);
  });

  test("menyebut istilah khas dari bukti sudah cukup", () => {
    const bukti = ["const BATAS_PANGGILAN_IDENTIK = 8"];
    expect(G.buktiSahih("BATAS_PANGGILAN_IDENTIK bernilai 8", bukti)).toBe(
      true,
    );
  });

  test("pencocokan istilah bekerja per TOKEN, tanda baca ikut", () => {
    // A real limitation of this check, written down rather than discovered
    // again later: evidence is split on whitespace, so a token keeps whatever
    // punctuation touches it. "perluPersetujuan(tc)" therefore does NOT match a
    // summary saying "perluPersetujuan".
    //
    // Not tightened here on purpose. The same function guards the JS loop, and
    // loosening what counts as evidence is a behaviour change to the agent's
    // answer validation — a separate decision from extracting it.
    const bukti = ["function perluPersetujuan(tc) { return true; }"];
    expect(
      G.buktiSahih("fungsi perluPersetujuan mengembalikan true", bukti),
    ).toBe(false);
  });

  test("jawaban yang tak menyentuh bukti sama sekali DITOLAK", () => {
    const bukti = ["agent/tools/index.ts:42: const x = 1"];
    expect(G.buktiSahih("saya sudah memperbaiki semuanya", bukti)).toBe(false);
  });
});

describe("keputusan retry", () => {
  test("kegagalan berbentuk transport layak dicoba ulang", () => {
    for (const m of [
      "ECONNRESET",
      "socket hang up",
      "503 Service Unavailable",
      "ETIMEDOUT",
    ]) {
      expect(G.galatSementara(new Error(m))).toBe(true);
    }
  });

  test("penolakan model TIDAK dicoba ulang", () => {
    // Retrying a refusal only spends the budget to get the same answer.
    expect(
      G.galatSementara(new Error("invalid_request_error: bad tool schema")),
    ).toBe(false);
  });
});

describe("kunci pengulangan panggilan", () => {
  test("argumen berbeda BUKAN pengulangan", () => {
    const a = { function: { name: "read", arguments: '{"path":"a"}' } };
    const b = { function: { name: "read", arguments: '{"path":"b"}' } };
    expect(G.kunciPanggilan(a)).not.toBe(G.kunciPanggilan(b));
  });

  test("dua bentuk panggilan yang sama menghasilkan kunci yang sama", () => {
    // The JS loop and the Python worker send different shapes for the same call.
    // If they keyed differently, repeat detection would count one call as two.
    const jsShape = { function: { name: "read", arguments: '{"path":"a"}' } };
    const pyShape = { name: "read", args: { path: "a" } };
    expect(G.kunciPanggilan(jsShape)).toBe(G.kunciPanggilan(pyShape));
  });

  test("backstop hanya menyala jauh di atas pemakaian wajar", () => {
    // The principle is to punish STALLING, not volume: six different bash
    // commands, or `npm test` four times around an edit/test cycle, are
    // legitimate and were killed by an earlier volume-based rule.
    expect(G.melewatiBatasUlang(4)).toBe(false);
    expect(G.melewatiBatasUlang(8)).toBe(false);
    expect(G.melewatiBatasUlang(9)).toBe(true);
  });
});

describe("paritas dengan self_agent.ts", () => {
  const SRC = fs.readFileSync(
    path.join(AKAR, "agent", "self_agent.ts"),
    "utf8",
  );

  test("self_agent MEMAKAI modul bersama, bukan salinannya sendiri", () => {
    // The whole point of the extraction. If self_agent kept a private copy, the
    // two would drift and this file would be documentation rather than a guard.
    expect(SRC).toMatch(/require\("\.\/penjaga-agent\.ts"\)/);
  });

  test("tak ada lagi daftar EXECUTION_TOOLS kedua di self_agent", () => {
    // A second literal would be the drift itself.
    expect(SRC).not.toMatch(/const EXECUTION_TOOLS = \[/);
  });
});
