// Gerbang kualitas diuji lewat DISPATCHER YANG BENAR-BENAR DIPAKAI AGENT.
//
// KENAPA BERKAS INI ADA, TERPISAH DARI code-quality.test.js.
// Versi pertama gerbang ini dipasang di agent/safe-edit.cjs, diuji lewat
// safeWriteFile langsung, lulus, dan saya nyatakan bekerja. Padahal
// self_agent.cjs memakai ./tools.cjs -> agent/tools/index.cjs, yang punya
// implementasi edit/write SENDIRI dan tak pernah menyentuh safeWriteFile.
// Gerbangnya ada di jalur mati; agent tak pernah tunduk padanya sedetik pun.
// Tes unit tak bisa menangkap itu — hanya tes yang memakai jalur nyata bisa.
//
// Jadi setiap kasus di sini memanggil runSelfTool dari agent/tools.cjs, persis
// seperti self_agent.cjs, dan memeriksa DISK sesudahnya — bukan cuma nilai balik.

const fs = require("fs");
const path = require("path");
const { runSelfTool } = require("../agent/tools.cjs");

const ROOT = path.join(__dirname, "..");
const REL = "public/_gate_test_probe.jsx";
const ABS = path.join(ROOT, REL);
const BYPASS_REL = "public/_gate_test_bypass.jsx";
const BYPASS_ABS = path.join(ROOT, BYPASS_REL);

const noop = () => {};
const indent = (n, text) => " ".repeat(n) + text;
const jsx = (spaces) =>
  `function Probe() {\n  return (\n${indent(spaces, "<div />")}\n  );\n}\n`;

const cleanup = () => {
  for (const p of [ABS, BYPASS_ABS]) {
    try {
      fs.unlinkSync(p);
    } catch (_) {}
  }
};

beforeEach(cleanup);
afterAll(cleanup);

describe("tool write", () => {
  test("MENOLAK berkas baru yang terlalu dalam", async () => {
    const r = await runSelfTool("write", { path: REL, content: jsx(30) }, noop);
    expect(r.ok).toBe(false);
    expect(String(r.output)).toMatch(/DITOLAK/);
    expect(fs.existsSync(ABS)).toBe(false); // tak boleh menyentuh disk
  });

  test("MENERIMA berkas baru yang bersih", async () => {
    const r = await runSelfTool("write", { path: REL, content: jsx(8) }, noop);
    expect(r.ok).toBe(true);
    expect(fs.existsSync(ABS)).toBe(true);
  });
});

describe("tool edit (ratchet)", () => {
  test("MENOLAK edit yang memperdalam sarang", async () => {
    await runSelfTool("write", { path: REL, content: jsx(8) }, noop);
    const r = await runSelfTool(
      "edit",
      {
        path: REL,
        old_string: indent(8, "<div />"),
        new_string: indent(26, "<div />"),
      },
      noop,
    );
    expect(r.ok).toBe(false);
    expect(String(r.output)).toMatch(/MEMPERDALAM/);
    // Berkas asli harus utuh — bukan cuma panggilannya yang gagal.
    expect(fs.readFileSync(ABS, "utf8")).toContain(indent(8, "<div />"));
  });

  test("MENERIMA edit yang tak mengubah kedalaman", async () => {
    await runSelfTool("write", { path: REL, content: jsx(8) }, noop);
    const r = await runSelfTool(
      "edit",
      {
        path: REL,
        old_string: indent(8, "<div />"),
        new_string: indent(8, "<span />"),
      },
      noop,
    );
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(ABS, "utf8")).toContain("<span />");
  });
});

describe("bypass lewat bash", () => {
  // Keempat perintah ini TERBUKTI lolos sebelum penjaganya ada, dan berkasnya
  // benar-benar mendarat di disk — melewati gerbang kualitas DAN syntax check.
  const attacks = [
    ["redirect", `echo "x" > ${BYPASS_REL}`],
    ["append", `echo "x" >> ${BYPASS_REL}`],
    ["tee", `echo x | tee ${BYPASS_REL}`],
    ["python open(w)", `python -c "open('${BYPASS_REL}','w').write('x')"`],
  ];

  test.each(attacks)(
    "MEMBLOKIR tulis berkas kode via %s",
    async (_label, command) => {
      const r = await runSelfTool("bash", { command }, noop);
      expect(r.ok).toBe(false);
      expect(fs.existsSync(BYPASS_ABS)).toBe(false);
    },
  );

  test("TIDAK memblokir redirect ke berkas non-kode", async () => {
    const r = await runSelfTool(
      "bash",
      { command: "echo halo > _gate_test.log" },
      noop,
    );
    expect(r.ok).toBe(true);
    try {
      fs.unlinkSync(path.join(ROOT, "_gate_test.log"));
    } catch (_) {}
  });

  test("TIDAK memblokir pembacaan berkas kode", async () => {
    const r = await runSelfTool("bash", { command: "ls public" }, noop);
    expect(r.ok).toBe(true);
  });
});

// Audit permukaan-serang pertama saya memakai regex yang keliru dan menyimpulkan
// agent punya 16 tool dengan 3 jalur tulis. Daftar otoritatif berisi 28 tool, dan
// dua yang terlewat ternyata bypass penuh — keduanya terbukti empiris menulis
// berkas 40 spasi ke disk sebelum ditambal.
describe("jalur tulis lain (terlewat di audit pertama)", () => {
  test("replace_file_content tunduk pada ratchet", async () => {
    const shallow = jsx(8);
    await runSelfTool("write", { path: REL, content: shallow }, noop);

    const r = await runSelfTool(
      "replace_file_content",
      {
        path: REL,
        start_line: 3,
        end_line: 3,
        target_content: indent(8, "<div />"),
        replacement_content: indent(40, "<div />"),
      },
      noop,
    );

    expect(r.ok).toBe(false);
    expect(String(r.output)).toMatch(/MEMPERDALAM/);
    // Tool ini punya Verify-Then-Commit SENDIRI yang hanya cek sintaks — tanpa
    // gerbang, edit ini lolos dan commit sukses. Periksa disk, bukan nilai balik.
    expect(fs.readFileSync(ABS, "utf8")).not.toContain(indent(40, "<div />"));
  });

  test("sandbox_run tak bisa menulis berkas kode", async () => {
    const r = await runSelfTool(
      "sandbox_run",
      {
        command: `echo "x" > "${BYPASS_ABS.replace(/\\/g, "/")}"`,
        timeout: 15000,
      },
      noop,
    );
    expect(r.ok).toBe(false);
    expect(fs.existsSync(BYPASS_ABS)).toBe(false);
  });

  test("capability_exec ditolak broker untuk tulis di luar cakupan", async () => {
    // Ini BUKAN gerbang kualitas yang bekerja, melainkan kebijakan deny-by-default
    // broker. Diuji agar kalau kebijakan itu dilonggarkan suatu hari, celahnya
    // ketahuan di sini alih-alih diam-diam terbuka.
    const r = await runSelfTool(
      "capability_exec",
      {
        code: `await request("writeFile", { path: ${JSON.stringify(BYPASS_ABS)}, content: "x" }); return "done";`,
        timeout: 10000,
      },
      noop,
    );
    expect(r.ok).toBe(false);
    expect(fs.existsSync(BYPASS_ABS)).toBe(false);
  });
});
