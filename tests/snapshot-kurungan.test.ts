// A checkpoint has to still mean what it said when it was taken.
//
// THE BUG THIS FILE EXISTS FOR, measured before it was fixed:
//
//     write VERSI-1  -> checkpoint 1
//     write VERSI-2  -> checkpoint 2
//     write VERSI-3
//     rollback(checkpoint 1)  ->  { ok: true, restored: 1 }
//     the file then read      ->  VERSI-2
//
// Confidently wrong, which is worse than failing outright: the older a
// checkpoint was, the less it meant, and nothing anywhere said so.
//
// The cause is one line. Files are recorded relative to QROOT — WOLFSPACE's own
// root — while the project being edited is almost always somewhere else, so the
// recorded path begins with `..` and `path.join(<snapshot dir>, rel)` ESCAPES
// the snapshot it belongs to. Every snapshot of one file landed on a single
// shared location and the newest overwrote the rest. The copies also came to
// rest outside every per-snapshot folder, where the pruner never reaches them.
//
// NOTE ON WHERE THIS WRITES. SNAP_DIR is a module constant pointing at the real
// .wolfspace/snapshots, so these tests create snapshots there and delete their
// own afterwards. They are kept few on purpose: createSnapshot prunes on every
// call, and a test that made fifty would evict real ones.

const fs = require("fs");
const os = require("os");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const S = require("../agent/snapshot.ts");

const SNAP_DIR = path.join(AKAR, ".wolfspace", "snapshots");
const dibuat: string[] = [];
const bersihkan = () => {
  for (const id of dibuat) {
    try {
      fs.rmSync(path.join(SNAP_DIR, id), { recursive: true, force: true });
    } catch (_) {}
  }
  dibuat.length = 0;
};
const snap = (berkas: string[], label: string) => {
  const r = S.createSnapshot(berkas, label);
  dibuat.push(r.id);
  return r;
};

afterAll(bersihkan);

describe("the storage key cannot climb out of its snapshot", () => {
  test("'..' becomes a name, not a move", () => {
    expect(S._kunciSimpan("../a.py")).toBe("__naik__/a.py");
    expect(S._kunciSimpan("..\\..\\x\\a.py")).toBe("__naik__/__naik__/x/a.py");
  });

  test("a drive letter loses its colon", () => {
    // "C:/x" as a path segment would open a second root on Windows.
    expect(S._kunciSimpan("C:/proyek/a.py")).toBe("C_/proyek/a.py");
  });

  test("an ordinary relative path is untouched apart from separators", () => {
    expect(S._kunciSimpan("src\\pkg\\a.py")).toBe("src/pkg/a.py");
    expect(S._kunciSimpan("./a.py")).toBe("a.py");
  });

  test("whatever goes in, the result stays inside", () => {
    // The property, checked rather than assumed: joining the key onto a folder
    // must never resolve above that folder.
    const dasar = path.resolve("C:/snap/id");
    for (const jahat of [
      "../../../etc/passwd",
      "..\\..\\Windows\\system32\\a.dll",
      "C:/Users/dave/a.py",
      "./../a",
      "a/../../b",
    ]) {
      const hasil = path.resolve(path.join(dasar, S._kunciSimpan(jahat)));
      expect(hasil.startsWith(dasar)).toBe(true);
    }
  });
});

describe("two checkpoints of one file, taken outside the WOLFSPACE root", () => {
  let luar = "";
  let berkas = "";

  beforeEach(() => {
    luar = fs.mkdtempSync(path.join(os.tmpdir(), "uji-cp-"));
    berkas = path.join(luar, "a.py");
  });

  test("the older one still holds the older content", () => {
    // The measured bug, pinned. Before the fix this restored VERSI-2.
    fs.writeFileSync(berkas, "VERSI-1\n");
    const s1 = snap([berkas], "sebelum edit pertama");
    fs.writeFileSync(berkas, "VERSI-2\n");
    snap([berkas], "sebelum edit kedua");
    fs.writeFileSync(berkas, "VERSI-3\n");

    const r = S.rollback(s1.id);
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(berkas, "utf8").trim()).toBe("VERSI-1");
  });

  test("the copy is stored INSIDE the snapshot's own folder", () => {
    // It used to land one level up, beside the snapshot folders rather than in
    // one — out of reach of _pruneOldSnapshots, so the store grew for ever.
    fs.writeFileSync(berkas, "isi\n");
    const s = snap([berkas], "uji");
    const isi: string[] = [];
    const jelajah = (d: string) => {
      for (const nama of fs.readdirSync(d)) {
        const p = path.join(d, nama);
        if (fs.statSync(p).isDirectory()) jelajah(p);
        else isi.push(path.relative(s.dir, p).replace(/\\/g, "/"));
      }
    };
    jelajah(s.dir);
    expect(isi).toContain("_meta.json");
    // Something other than the metadata: the backup itself.
    expect(isi.filter((f) => f !== "_meta.json").length).toBeGreaterThan(0);
    expect(isi.some((f) => f.includes("__naik__"))).toBe(true);
  });

  test("rollback still reports the address, not the storage key", () => {
    // `files` is what old snapshots on disk contain and what /api/snapshots
    // publishes. Sanitising the STORAGE key must not change the address.
    fs.writeFileSync(berkas, "isi\n");
    const s = snap([berkas], "uji");
    expect(s.files[0]).toMatch(/\.\./); // relative to QROOT, so it climbs
    expect(s.files[0]).not.toMatch(/__naik__/);
    const r = S.rollback(s.id);
    expect(r.restored[0]).toBe(s.files[0]);
  });

  test("a file inside the WOLFSPACE root still works", () => {
    // The case that always worked, kept working: no `..`, so the key is the
    // path itself.
    const di_dalam = path.join(AKAR, ".wolfspace", "uji-cp-dalam.txt");
    fs.mkdirSync(path.dirname(di_dalam), { recursive: true });
    fs.writeFileSync(di_dalam, "SATU\n");
    try {
      const s = snap([di_dalam], "dalam");
      fs.writeFileSync(di_dalam, "DUA\n");
      expect(S.rollback(s.id).ok).toBe(true);
      expect(fs.readFileSync(di_dalam, "utf8").trim()).toBe("SATU");
    } finally {
      try {
        fs.unlinkSync(di_dalam);
      } catch (_) {}
    }
  });
});

describe("snapshots taken before the fix", () => {
  test("a copy at the OLD location is still restored", () => {
    // Refusing to read them would turn one bug into two: the store on a real
    // machine already holds snapshots written the old way.
    const luar = fs.mkdtempSync(path.join(os.tmpdir(), "uji-cp-lama-"));
    const berkas = path.join(luar, "b.py");
    fs.writeFileSync(berkas, "BARU\n");
    const s = snap([berkas], "warisan");
    const rel = s.files[0];

    // Move the copy back to where the old code would have put it, and give it
    // the content that snapshot is supposed to hold.
    const aman = path.join(s.dir, S._kunciSimpan(rel));
    const lama = path.join(s.dir, rel);
    fs.mkdirSync(path.dirname(lama), { recursive: true });
    fs.writeFileSync(lama, "LAMA\n");
    fs.rmSync(aman, { force: true });

    const r = S.rollback(s.id);
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(berkas, "utf8").trim()).toBe("LAMA");
  });

  test("a legacy copy that IS the file itself is not counted as restored", () => {
    // The old escape could resolve the stored copy onto the original. Copying a
    // file over itself and reporting "restored 1 file" is the exact lie this
    // whole change is about.
    const luar = fs.mkdtempSync(path.join(os.tmpdir(), "uji-cp-diri-"));
    const berkas = path.join(luar, "c.py");
    fs.writeFileSync(berkas, "ISI\n");
    const s = snap([berkas], "menunjuk-diri");
    // Remove the real copy so only the self-resolving legacy path is left.
    fs.rmSync(path.join(s.dir, S._kunciSimpan(s.files[0])), { force: true });
    const r = S.rollback(s.id);
    expect(r.ok).toBe(true);
    expect(r.restored).toHaveLength(0);
  });
});
