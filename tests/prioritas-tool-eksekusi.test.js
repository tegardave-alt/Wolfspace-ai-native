// Model memilih tool berdasarkan bagaimana tool itu DIPERKENALKAN, bukan
// berdasarkan mana yang lebih aman.
//
// KENAPA ADA. Ketiga tool eksekusi punya jaminan yang sangat berbeda:
//
//   capability_exec  --permission + broker + bwrap   batas DITEGAKKAN
//   bash             pemindaian teks                 terbukti bisa ditembus
//   sandbox_run      helper JS                       terbukti bisa ditembus
//
// Tapi deskripsinya dulu membingkai capability_exec sebagai alternatif
// BERSYARAT ("Use this instead of sandbox_run WHEN…"), sementara bash disebut
// lugas. Model lalu memilih bash sebagai default — bukan karena bash lebih
// baik, melainkan karena begitulah ia diperkenalkan.
//
// Terukur, dari 38 perintah di log nyata: 24 di antaranya `node …` — pekerjaan
// yang capability_exec bisa lakukan dengan batas yang benar-benar berlaku.
// Yang benar-benar butuh proses hanya npm dan PowerShell.

const { SELF_TOOLS } = require("../agent/tools/tool-definitions.ts");

const desk = (nama) => {
  const t = SELF_TOOLS.find((x) => x.function && x.function.name === nama);
  if (!t) throw new Error("tool tak ada: " + nama);
  return String(t.function.description || "");
};

describe("pembingkaian tool eksekusi", () => {
  test("capability_exec diperkenalkan sebagai PILIHAN PERTAMA", () => {
    const d = desk("capability_exec");
    expect(d).toMatch(/THE FIRST CHOICE/i);
    // Dan tidak lagi sebagai alternatif bersyarat.
    expect(d).not.toMatch(/Use this instead of sandbox_run when/i);
  });

  test("capability_exec menyebut BUKTI, bukan sekadar klaim aman", () => {
    const d = desk("capability_exec");
    // Model lebih patuh pada pernyataan yang bisa diperiksa daripada pada
    // kata sifat. "ERR_ACCESS_DENIED" adalah hasil terukur, bukan janji.
    expect(d).toMatch(/ERR_ACCESS_DENIED/);
  });

  test("capability_exec menyebut BATAS pemakaiannya sendiri", () => {
    // Tanpa ini, model akan mencoba menjalankan npm di dalamnya lalu gagal
    // berulang — pembingkaian yang terlalu kuat menghasilkan lingkaran gagal.
    const d = desk("capability_exec");
    expect(d).toMatch(/npm|git|compiler/i);
  });

  test("sandbox_run tidak terbaca setara dengan capability_exec", () => {
    const d = desk("sandbox_run");
    expect(d).toMatch(/NOT the first choice/i);
    // Kejujuran yang sama seperti pada bash: ia mengisolasi CRASH, bukan
    // menahan kode yang berusaha keluar.
    expect(d).toMatch(/crash|hang/i);
  });

  test("bash tetap memperingatkan batasnya", () => {
    const d = desk("bash");
    // Dulu asersinya mengunci frasa "JANGAN katakan", yang cocok untuk
    // kenyataan lama: batasnya cuma pemindaian teks, jadi larangannya adalah
    // "jangan bilang kamu terkurung". Sesudah bash benar-benar terkurung
    // kernel, larangan itu jadi salah arah — dan salah ke arah MEREMEHKAN
    // sama merusaknya dengan salah ke arah melebih-lebihkan: user membaca
    // sistemnya jauh lebih lemah daripada kenyataannya lalu memutuskan
    // berdasarkan itu.
    //
    // Yang dikunci sekarang maksudnya, bukan kalimatnya: deskripsi harus
    // menahan model dari MELEBIH-LEBIHKAN, dan harus menyuruhnya membaca
    // medan yang menyatakan keadaan sebenarnya.
    expect(d).toMatch(/do not (say|claim|state)/i);
    expect(d).toMatch(/penegakan|terkurungOs/);
  });
});
