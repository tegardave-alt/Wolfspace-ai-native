// Kegagalan harus terlihat di JANGKAR, dan kemacetan harus BERTANYA.
//
// KENAPA ADA. task_checklist adalah ground truth agent — disuntik ulang ke system
// message pada SETIAP langkah justru supaya model tak perlu mengandalkan ingatan.
// Tapi ia tak punya status "gagal" sama sekali: _TODO_ICON hanya mengenal
// completed/in_progress/cancelled/pending, dan kegagalan tak pernah menyentuh
// task_checklist (terverifikasi dengan grep sebelum perubahan ini).
//
// Akibatnya item yang sudah dicoba dan gagal tetap tampil "[→] sedang dikerjakan"
// selamanya. Untuk tahu ia pernah gagal, model HARUS menggali riwayat percakapan —
// persis hal yang paling cepat memburuk saat konteks memanjang. Jangkarnya bocor
// tepat di tempat yang paling dibutuhkan.
//
// MAX_STEPS memang sudah membatasi, tapi ia plafon BUTA: membunuh run tanpa
// memberi tahu apa yang macet. Gerbang di sini berhenti pada item SPESIFIK,
// membawa sebabnya, dan BERTANYA ke user — bukan menyerah diam-diam.

const fs = require("fs");
const a = require("../agent/self_agent.ts");

// Dinormalkan ke LF — repo dipakai dengan core.autocrlf=true, jadi akhiran baris
// di working tree tergantung apakah berkas baru lewat checkout. Lihat catatan
// yang sama di tests/verify-cakupan.test.js.
const SRC = fs
  .readFileSync(require.resolve("../agent/self_agent.ts"), "utf8")
  .replace(/\r\n/g, "\n");

describe("menautkan kegagalan ke item yang sedang dikerjakan", () => {
  test("item aktif dikenali dari penanda [→]", () => {
    expect(a.itemAktif(["[x] a", "[→] perbaiki bug X", "[ ] c"])).toBe(
      "perbaiki bug X",
    );
  });

  test("tanpa item aktif -> null (kegagalan tak ditautkan ke apa pun)", () => {
    // Agent bisa sedang menjelajah, bukan mengerjakan rencana. Menghitung
    // kegagalan ke item yang salah lebih buruk daripada tak menghitung.
    expect(a.itemAktif(["[x] a", "[ ] b"])).toBeNull();
    expect(a.itemAktif([])).toBeNull();
    expect(a.itemAktif(null)).toBeNull();
  });
});

describe("hitungan kegagalan per item", () => {
  test("terakumulasi, dan sebab terakhir tersimpan", () => {
    let f = {};
    f = a.catatGagalItem(f, "bug X", "edit: tak cocok");
    f = a.catatGagalItem(f, "bug X", "bash: exit 1");
    expect(f["bug X"].n).toBe(2);
    expect(f["bug X"].sebab[f["bug X"].sebab.length - 1]).toMatch(/exit 1/);
  });

  test("TIDAK memutasi peta lama", () => {
    // Reducer state ini "ganti total" ((x,y) => y), jadi mutasi di tempat tak
    // akan pernah terlihat oleh langkah berikutnya — bug yang sunyi.
    const lama = { x: { n: 1, sebab: ["a"] } };
    const baru = a.catatGagalItem(lama, "x", "b");
    expect(lama.x.n).toBe(1);
    expect(baru.x.n).toBe(2);
  });

  test("sebab dibatasi 3 terakhir — checklist ini disuntik ULANG tiap langkah", () => {
    // Panjang checklist berbanding lurus dengan ongkos token per langkah. Yang
    // dibutuhkan model adalah POLA kegagalan, bukan arsip lengkap.
    let f = {};
    for (let i = 0; i < 6; i++) f = a.catatGagalItem(f, "x", "sebab" + i);
    expect(f.x.n).toBe(6);
    expect(f.x.sebab).toHaveLength(3);
    expect(f.x.sebab[2]).toBe("sebab5");
  });

  test("item tanpa kegagalan tak tersentuh", () => {
    expect(a.catatGagalItem({}, null, "apa saja")).toEqual({});
  });
});

describe("kegagalan TERLIHAT di checklist yang disuntik", () => {
  test("item gagal ditandai [!] dengan jumlah dan sebab", () => {
    const f = a.catatGagalItem({}, "bug X", "edit: tak cocok");
    const out = a.checklistDenganKegagalan(["[→] bug X"], f);
    expect(out[0]).toMatch(/^\[!\] bug X \(gagal 1×: edit: tak cocok\)/);
  });

  test("item lain TIDAK ikut berubah", () => {
    const f = a.catatGagalItem({}, "bug X", "gagal");
    const out = a.checklistDenganKegagalan(
      ["[x] selesai", "[→] bug X", "[ ] nanti"],
      f,
    );
    expect(out[0]).toBe("[x] selesai");
    expect(out[2]).toBe("[ ] nanti");
  });

  test("tanpa kegagalan, checklist apa adanya", () => {
    const baris = ["[x] a", "[→] b"];
    expect(a.checklistDenganKegagalan(baris, {})).toEqual(baris);
  });
});

describe("gerbang macet: BERHENTI dan BERTANYA", () => {
  test("batas percobaan per item ada dan masuk akal", () => {
    expect(a.SYSTEM_RULES.MAX_ITEM_ATTEMPTS).toBeGreaterThanOrEqual(2);
    expect(a.SYSTEM_RULES.MAX_ITEM_ATTEMPTS).toBeLessThanOrEqual(5);
  });

  test("memakai jalur HITL yang SUDAH ada, bukan jalur baru", () => {
    // Menempel ke t:"ask" + waitForAnswer berarti resume, checkpoint HITL, dan
    // UI-nya otomatis ikut bekerja. Jalur baru harus membangun ulang semuanya.
    const i = SRC.indexOf("MAX_ITEM_ATTEMPTS && !waitForAnswer");
    expect(i).toBeGreaterThan(-1);
    const blok = SRC.slice(i, i + 900);
    expect(blok).toMatch(/emit\(\{\s*t: "ask"/);
    expect(blok).toMatch(/waitForAnswer = true/);
    expect(blok).toMatch(/stopReason = "item_macet"/);
  });

  test("user diberi pilihan, bukan hanya diberi tahu", () => {
    const i = SRC.indexOf('stopReason = "item_macet"');
    const blok = SRC.slice(Math.max(0, i - 900), i);
    expect(blok).toMatch(/Coba pendekatan lain/);
    expect(blok).toMatch(/Lewati item ini/);
    expect(blok).toMatch(/Hentikan run/);
  });

  test("kegagalan APA PUN dihitung, bukan hanya tool pencarian", () => {
    // Yang membuat pekerjaan macet biasanya edit/bash/write yang gagal berulang.
    // Membatasi ke REQUIRED_TOOL_SEQUENCE akan melewatkan justru kasus utamanya.
    expect(SRC).toMatch(/if \(!r\.ok && itemSedangDikerjakan\)/);
  });

  test("checklistFails hanya dikirim bila memang ada kegagalan", () => {
    // Reducer "ganti total": mengirim {} tiap langkah akan MENGHAPUS riwayat
    // kegagalan yang sudah terkumpul.
    expect(SRC).toMatch(
      /sebabGagalLangkahIni\.length\s*\?\s*\{ checklistFails: failsBaru \}/,
    );
  });
});
