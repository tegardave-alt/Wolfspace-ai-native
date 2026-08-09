// Jawaban agent tak boleh disisipi penanda buatan sistem.
//
// KENAPA ADA. Dulu sanitizeOutput() menyapu kata spekulatif dari jawaban akhir
// dan menggantinya dengan "[kata-spekulatif-dihapus]". Penandanya IKUT TAMPIL
// ke user, jadi jawaban yang isinya benar pun terbaca rusak:
//
//   "File config mungkin tidak ada"
//     -> "File config [kata-spekulatif-dihapus] tidak ada"
//
// Yang membuatnya tak bisa sekadar "diperbaiki": menghapus katanya saja, tanpa
// penanda, menghasilkan "File config tidak ada" — dugaan berubah jadi
// pernyataan pasti. Penyapu itu tak pernah menghapus spekulasinya, hanya TANDA
// bahwa itu spekulasi. Jadi ia dibuang, bukan diganti.

const fs = require("fs");

const SRC = fs
  .readFileSync(require.resolve("../agent/self_agent.cjs"), "utf8")
  .replace(/\r\n/g, "\n");

// Baris komentar dibuang dulu supaya catatan sejarah (yang memang menyebut
// penandanya) tidak dikira kode hidup.
const KODE = SRC.split("\n")
  .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
  .join("\n");

describe("jawaban akhir tidak disisipi penanda sistem", () => {
  test("penanda [kata-spekulatif-dihapus] tak ada lagi di kode hidup", () => {
    expect(KODE).not.toContain("kata-spekulatif-dihapus");
  });

  test("sanitizeOutput dan FORBIDDEN_SPECULATIVE tak dipanggil lagi", () => {
    expect(KODE).not.toMatch(/sanitizeOutput\s*\(/);
    expect(KODE).not.toContain("FORBIDDEN_SPECULATIVE");
  });

  test("pipeline jawaban akhir hanya MEMBUANG, tak menyisipkan", () => {
    // stripToolRecap membuang rekap tool, truncateToConcise memotong panjang.
    // Keduanya boleh mengurangi teks; tak satu pun menaruh penanda di tengah
    // kalimat. Kalau ada langkah baru disisipkan di antara keduanya, baris ini
    // merah dan penambahannya harus dilihat lagi.
    const i = KODE.indexOf("let fallback = rawContent;");
    expect(i).toBeGreaterThan(-1);
    const k = KODE.indexOf("truncateToConcise(fallback", i);
    expect(k).toBeGreaterThan(i);
    const j = KODE.indexOf("\n", k); // sampai AKHIR baris truncate
    const langkah = KODE.slice(i, j)
      .split("\n")
      .map((b) => b.trim())
      .filter((b) => b.startsWith("fallback ="));
    expect(langkah).toEqual([
      "fallback = stripToolRecap(fallback);",
      "fallback = truncateToConcise(fallback, 2000);",
    ]);
  });

  test("tak ada penanda '[...-dihapus]' lain yang disuntikkan ke teks", () => {
    // Penjaga arah untuk seluruh modul agent: pola yang sama tak boleh muncul
    // lagi dengan nama berbeda.
    const berkas = fs
      .readdirSync(
        require.resolve("../agent/self_agent.cjs").replace(/[^\\/]+$/, ""),
      )
      .filter((f) => f.endsWith(".cjs"));
    const temuan = [];
    for (const f of berkas) {
      const isi = fs.readFileSync(
        require.resolve("../agent/self_agent.cjs").replace(/[^\\/]+$/, "") + f,
        "utf8",
      );
      const kode = isi
        .split(/\r?\n/)
        .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
        .join("\n");
      if (/"\[[a-z-]*(dihapus|disensor|diedit)\]"/.test(kode)) temuan.push(f);
    }
    expect(temuan).toEqual([]);
  });

  // Varian kedua dari cacat yang sama. Bukan penanda dalam kurung siku, tapi
  // LABEL KEADAAN yang ditempel di depan teks agent:
  //
  //   localSummary = "Menunggu jawaban user: " + results[i].question;
  //     -> "Menunggu jawaban user: Maksudnya "scibd" itu apa? …"
  //
  // User membacanya sebagai bagian dari kalimat agent. Padahal keadaan menunggu
  // sudah disampaikan UI dua kali — panel "Question from the Agent" dan status
  // "Menunggu jawaban Anda...". Labelnya menarasikan mekanisme UI, bukan
  // menjawab apa pun.
  test("finalSummary tidak diawali label keadaan atau jargon internal", () => {
    // Hanya teks yang BENAR-BENAR jadi ringkasan untuk user.
    const penugasan =
      KODE.match(/(?:localSummary|finalSummary)\s*[:=]\s*\n?\s*"[^"]*"/g) || [];
    const bocor = penugasan.filter((p) =>
      /"(Menunggu|Waiting|Berhenti:)|HITL/.test(p),
    );
    expect(bocor).toEqual([]);
  });

  test('"HITL" tak pernah muncul di teks yang tampil ke user', () => {
    // Istilah internal: tak berarti apa pun bagi user yang membacanya.
    const literal = KODE.match(/"[^"]*HITL[^"]*"/g) || [];
    // Boleh dipakai sebagai NILAI internal (stopReason: "hitl"), bukan sebagai
    // kalimat — jadi yang ditolak hanya string yang mengandung spasi.
    expect(literal.filter((s) => /\s/.test(s.slice(1, -1)))).toEqual([]);
  });
});
