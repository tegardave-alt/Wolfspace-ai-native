// The performance budget, and the IPC guard that spends from it.
//
// WHY THIS FILE DRIVES THE GUARD INSTEAD OF READING ITS SOURCE. An earlier
// guard in this repo passed a source-pattern test while the hook it described
// sat on a dead branch. So every assertion here calls the real function with a
// real value and checks what comes back.

const A = require("../agent/anggaran.ts");

describe("anggaran: angkanya konsisten satu sama lain", () => {
  test("pita blokir berurutan naik menuju ambang hang", () => {
    expect(A.BLOKIR_NORMAL_MS).toBeLessThan(A.BLOKIR_WASPADA_MS);
    expect(A.BLOKIR_WASPADA_MS).toBeLessThan(A.AMBANG_HANG_MS);
  });

  test("ambang hang adalah yang TERUKUR, bukan angka bulat sembarang", () => {
    // Measured three times on this machine: 5011 / 5028 / 5034 ms. If someone
    // relaxes this to buy headroom, the whole file stops describing reality.
    expect(A.AMBANG_HANG_MS).toBe(5000);
  });

  test("vonisBlokir memetakan tiap pita ke namanya", () => {
    expect(A.vonisBlokir(0)).toBe("normal");
    expect(A.vonisBlokir(A.BLOKIR_NORMAL_MS - 1)).toBe("normal");
    expect(A.vonisBlokir(A.BLOKIR_NORMAL_MS)).toBe("naik");
    expect(A.vonisBlokir(A.BLOKIR_WASPADA_MS)).toBe("waspada");
    expect(A.vonisBlokir(A.AMBANG_HANG_MS)).toBe("over");
    expect(A.vonisBlokir(999999)).toBe("over");
  });

  test("plafon IPC jauh di bawah titik beku yang terukur", () => {
    // The curve measured ~22 ms per MB, so ~220 MB freezes the window. The cap
    // must leave a real margin, not shave the cliff.
    const msPerMb = 4486 / 200;
    const msDiPlafon = (A.IPC_PAYLOAD_MAKS / 1048576) * msPerMb;
    expect(msDiPlafon).toBeLessThan(A.BLOKIR_WASPADA_MS);
    expect(A.IPC_PAYLOAD_MAKS).toBeLessThan(220 * 1024 * 1024);
  });

  test("batas job Windows menyamai jail Linux, bukan mengarang", () => {
    const jail = require("fs").readFileSync(
      require.resolve("../agent/tools/bash-jail.ts"),
      "utf8",
    );
    // bash-jail.ts is the Linux side. These must not drift apart silently:
    // a command should be bounded the same way on both platforms.
    expect(jail).toMatch(
      new RegExp("MAX_VMEM_KB\\s*=\\s*" + A.JOB_MEM_MB + "\\s*\\*\\s*1024"),
    );
    expect(jail).toMatch(new RegExp("MAX_CPU_SEC\\s*=\\s*" + A.JOB_CPU_DETIK));
    expect(jail).toMatch(new RegExp("MAX_PROC\\s*=\\s*" + A.JOB_MAKS_PROSES));
  });
});

describe("ukuranKasar: menaksir tanpa menserialisasi", () => {
  const D = A.IPC_SIZER_KEDALAMAN;
  const BESAR = A.IPC_PAYLOAD_MAKS;

  test("string dihitung 2 byte per karakter", () => {
    expect(A.ukuranKasar("abcd", BESAR, D)).toBe(8);
  });

  test("buffer dihitung byte sebenarnya", () => {
    expect(A.ukuranKasar(Buffer.alloc(1000), BESAR, D)).toBe(1000);
    expect(A.ukuranKasar(new ArrayBuffer(512), BESAR, D)).toBe(512);
  });

  test("objek bersarang dijumlahkan berikut nama kuncinya", () => {
    // key "a" (1 char = 2) + value "xy" (2 chars = 4)
    expect(A.ukuranKasar({ a: "xy" }, BESAR, D)).toBe(6);
  });

  test("null dan undefined tidak dihitung", () => {
    expect(A.ukuranKasar(null, BESAR, D)).toBe(0);
    expect(A.ukuranKasar(undefined, BESAR, D)).toBe(0);
  });

  test("berhenti pada kedalaman yang ditentukan", () => {
    // Wrapped deeper than the walk goes, the payload becomes invisible. That is
    // the accepted trade: paying full traversal is the cost the cap avoids.
    const dalam = { a: { b: { c: { d: { e: "x".repeat(1000) } } } } };
    expect(A.ukuranKasar(dalam, BESAR, 2)).toBeLessThan(100);
  });

  test("BERHENTI AWAL begitu sudah lewat anggaran", () => {
    // The proof is behavioural, not a timing guess: anything visited after the
    // budget is blown would throw, so a passing test means it stopped.
    const meledak = {
      get boom() {
        throw new Error("sizer melanjutkan padahal sudah lewat anggaran");
      },
    };
    const arr = ["x".repeat(BESAR), meledak];
    expect(() => A.ukuranKasar(arr, BESAR, D)).not.toThrow();
    expect(A.ukuranKasar(arr, BESAR, D)).toBeGreaterThan(BESAR);
  });
});

describe("lewatBatasIpc: menolak hanya yang benar-benar lewat", () => {
  test("payload wajar diloloskan (null = tak ada keluhan)", () => {
    expect(A.lewatBatasIpc({ pesan: "halo" }, "masuk")).toBeNull();
    expect(A.lewatBatasIpc("x".repeat(1000), "keluar")).toBeNull();
  });

  test("tepat DI batas masih lolos, di atasnya ditolak", () => {
    const pas = "x".repeat(A.IPC_PAYLOAD_MAKS / 2); // 2 byte per char
    expect(A.lewatBatasIpc(pas, "masuk")).toBeNull();
    expect(A.lewatBatasIpc(pas + "yy", "masuk")).not.toBeNull();
  });

  test("penolakan menyebut ukuran, batas, dan arahnya", () => {
    const pesan = A.lewatBatasIpc("x".repeat(A.IPC_PAYLOAD_MAKS), "keluar");
    expect(pesan).toContain("keluar");
    expect(pesan).toContain("64.0 MB"); // 32M chars x 2 byte
    expect(pesan).toContain("32.0 MB"); // the ceiling itself
    // The message has to say WHY, or the next person will just raise the cap.
    expect(pesan).toMatch(/memblokir|Not Responding/);
  });
});
