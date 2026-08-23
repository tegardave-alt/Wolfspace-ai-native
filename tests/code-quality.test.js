// Gerbang kualitas struktural (agent/code-quality.ts) — dijalankan safe-edit
// SEBELUM setiap tulisan agent ke disk.
//
// Tes ini menjaga dua sifat yang saling bertentangan, dan keduanya wajib:
//   1. MEMBLOKIR pemburukan — kalau tidak, penjaganya percuma.
//   2. TIDAK MEMBLOKIR pekerjaan sah — penjaga yang menolak edit perbaikan
//      akan melumpuhkan agent total, dan itu lebih buruk daripada tak ada
//      penjaga sama sekali. Sifat kedua inilah yang paling mudah rusak saat
//      seseorang memperketat ambang, jadi ia diuji eksplisit di sini.

const q = require("../agent/code-quality.ts");

const indent = (n, text) => " ".repeat(n) + text;

describe("measure()", () => {
  test("mengukur indentasi terdalam dan jumlah baris sangat dalam", () => {
    const src = ["a", indent(4, "b"), indent(30, "c"), indent(32, "d")].join(
      "\n",
    );
    const m = q.measure(src);
    expect(m.maxIndent).toBe(32);
    expect(m.deepLines).toBe(2); // yang >= 28 spasi
  });

  test("baris kosong tidak dihitung sebagai indentasi", () => {
    expect(q.measure("a\n\n   \nb").maxIndent).toBe(0);
  });
});

describe("berkas yang dijaga", () => {
  test("hanya ekstensi kode yang dijaga", () => {
    expect(q.isGuarded("x.jsx")).toBe(true);
    expect(q.isGuarded("x.cjs")).toBe(true);
    expect(q.isGuarded("x.md")).toBe(false);
    expect(q.isGuarded("x.css")).toBe(false);
    expect(q.isGuarded("x.json")).toBe(false);
  });

  test("berkas tak dijaga selalu lolos, seberapa pun dalamnya", () => {
    const deep = indent(200, "x");
    expect(q.check("notes.md", deep, null).ok).toBe(true);
  });
});

describe("berkas BARU — batas keras", () => {
  test("menolak yang melebihi batas indentasi", () => {
    const r = q.check("new.jsx", indent(q.NEW_FILE_MAX_INDENT + 2, "x"), null);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/DITOLAK/);
  });

  test("menerima yang tepat di batas", () => {
    expect(
      q.check("new.jsx", indent(q.NEW_FILE_MAX_INDENT, "x"), null).ok,
    ).toBe(true);
  });

  test("menolak berkas terlalu panjang", () => {
    const long = Array(q.NEW_FILE_MAX_LINES + 5)
      .fill("x")
      .join("\n");
    const r = q.check("new.jsx", long, null);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/terlalu panjang/);
  });
});

describe("berkas LAMA — ratchet", () => {
  const dirty = [indent(40, "sudah-dalam"), indent(30, "juga-dalam")].join(
    "\n",
  );

  test("MEMBLOKIR edit yang memperdalam sarang", () => {
    const worse = dirty + "\n" + indent(42, "lebih-dalam");
    const r = q.check("old.jsx", worse, dirty);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/MEMPERDALAM/);
  });

  test("MEMBLOKIR edit yang menambah jumlah baris sangat dalam", () => {
    const worse = dirty + "\n" + indent(30, "satu-lagi");
    const r = q.check("old.jsx", worse, dirty);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/sangat dalam/);
  });

  // ── Sifat #2: penjaga TIDAK BOLEH menghalangi pekerjaan sah ──

  test("MENGIZINKAN edit pada berkas yang sudah jauh melewati batas berkas baru", () => {
    // 40 spasi jauh di atas NEW_FILE_MAX_INDENT (24). Kalau batas keras ikut
    // diterapkan ke berkas lama, agent takkan bisa menyentuh Components.tsx
    // (48 spasi) sama sekali — termasuk untuk memperbaikinya.
    const sameDepth = dirty + "\n" + indent(10, "tambahan-dangkal");
    expect(q.check("old.jsx", sameDepth, dirty).ok).toBe(true);
  });

  test("MENGIZINKAN edit yang mengurangi kedalaman", () => {
    const better = [indent(20, "a"), indent(10, "b")].join("\n");
    expect(q.check("old.jsx", better, dirty).ok).toBe(true);
  });

  test("MENGIZINKAN penghapusan besar", () => {
    expect(q.check("old.jsx", "x", dirty).ok).toBe(true);
  });

  test("MENGIZINKAN edit yang tak mengubah struktur (mis. ganti string)", () => {
    const renamed = dirty.replace("sudah-dalam", "already-deep");
    expect(q.check("old.jsx", renamed, dirty).ok).toBe(true);
  });
});
