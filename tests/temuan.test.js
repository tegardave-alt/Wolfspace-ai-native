// Agent harus ingat APA YANG SUDAH IA KETAHUI, bukan hanya apa yang harus
// dikerjakan.
//
// KENAPA ADA. Ditemukan dengan membaca ledger run NYATA, bukan dengan membaca
// kode. pid 12932, satu run 88 menit:
//
//     246 entri untuk 22 perintah unik   = 11x pengulangan
//     13x  read  index.html
//     12x  read  app.js
//     11x  read  api-manager.js
//     pengulangan BERUNTUN terpanjang: cuma 4x
//
// Angka terakhir itu yang menentukan diagnosisnya. Pengulangan beruntun berarti
// loop; pengulangan TERSEBAR berarti LUPA. Kalau salah membacanya, orang akan
// mencari bug di loop dan tak menemukan apa-apa.
//
// Sebabnya satu baris: history.slice(-16). Pemotongan itu buta — memotong dari
// ekor tanpa peduli isi apa yang hilang, dan hasil `read` (paling panjang) yang
// paling cepat terbuang. Checklist menjaga agent ingat TUGASNYA; tak ada yang
// menjaga ia ingat PENGETAHUANNYA.

const fs = require("fs");
const os = require("os");
const path = require("path");

const T = require("../agent/temuan.cjs");

const WS = path.join(os.tmpdir(), "wolf-tes-temuan");
const jurnal = () =>
  path.join(
    T.DIR,
    String(WS)
      .replace(/[^A-Za-z0-9._-]/g, "_")
      .slice(-80) + ".jsonl",
  );

beforeEach(() => {
  T.bersihkan();
  try {
    fs.rmSync(jurnal(), { force: true });
  } catch (_) {}
});
afterAll(() => {
  T.bersihkan();
  try {
    fs.rmSync(jurnal(), { force: true });
  } catch (_) {}
});

describe("catatan temuan: identitas PERSIS, bukan kemiripan", () => {
  test("jalur yang sudah dibaca dikenali, yang belum tidak", () => {
    // Inilah sebabnya ini BUKAN RAG. RAG mencari lewat kemiripan, dan "app.js"
    // bisa berskor tinggi untuk kueri "app.tsx" — agent lalu MELEWATI pekerjaan
    // yang belum ia kerjakan. Kegagalan itu lebih buruk daripada mengulang,
    // karena tak terlihat.
    T.catat(WS, "app.js", "function render(){}\n");
    expect(T.sudahDibaca(WS, "app.js")).toBeTruthy();
    expect(T.sudahDibaca(WS, "app.tsx")).toBeNull();
    expect(T.sudahDibaca(WS, "belum-pernah.js")).toBeNull();
  });

  test("membaca ulang menaikkan hitungan, bukan menggandakan entri", () => {
    T.catat(WS, "app.js", "isi");
    T.catat(WS, "app.js", "isi");
    T.catat(WS, "app.js", "isi");
    expect(T.jumlah(WS)).toBe(1);
    expect(T.sudahDibaca(WS, "app.js").kali).toBe(3);
  });

  test("temuan proyek lain TIDAK bocor", () => {
    // "Sudah dibaca" milik proyek yang salah akan membuat agent melewati
    // pekerjaan nyata di proyek ini.
    T.catat(WS, "rahasia.js", "isi proyek A");
    expect(T.blokPrompt(WS + "-lain")).toBe("");
    expect(T.sudahDibaca(WS + "-lain", "rahasia.js")).toBeNull();
  });
});

describe("blok prompt terbaca sebagai ground truth", () => {
  test("memuat jalur, ukuran, dan intisari", () => {
    T.catat(WS, "app.js", "// entri utama aplikasi\nfunction render(){}\n");
    const b = T.blokPrompt(WS);
    expect(b).toMatch(/SUDAH DIBACA/);
    expect(b).toMatch(/app\.js/);
    expect(b).toMatch(/entri utama aplikasi/);
  });

  test("menjelaskan KENAPA isinya tak ada di riwayat", () => {
    // Tanpa kalimat ini, model melihat daftar berkas tanpa isi dan menyimpulkan
    // pembacaannya gagal — lalu mengulang, yaitu perilaku yang sedang ditutup.
    T.catat(WS, "a.js", "isi");
    const b = T.blokPrompt(WS);
    expect(b).toMatch(/keluar dari riwayat/i);
    expect(b).toMatch(/PEMBACAANNYA sudah terjadi/);
  });

  test("panjangnya DIBATASI walau berkasnya ratusan", () => {
    // Blok yang terlalu panjang memakan jendela konteks yang justru sedang
    // dihemat — obatnya tak boleh jadi penyakit yang sama.
    for (let i = 0; i < 200; i++) T.catat(WS, "f" + i + ".js", "isi " + i);
    const b = T.blokPrompt(WS);
    expect(T.jumlah(WS)).toBe(200);
    expect((b.match(/\n- /g) || []).length).toBeLessThanOrEqual(40);
  });

  test("tak ada temuan -> blok KOSONG, bukan blok hampa", () => {
    expect(T.blokPrompt(WS)).toBe("");
  });
});

describe("bertahan melewati restart proses", () => {
  test("muat() memulihkan temuan dari jurnal", () => {
    // Checklist memakai MemorySaver yang mati bersama proses. Jurnal inilah
    // yang membuat pengetahuan menyeberangi restart.
    T.catat(WS, "app.js", "// entri utama\n");
    T.catat(WS, "index.html", "<!doctype html>\n");
    expect(T.jumlah(WS)).toBe(2);

    T.bersihkan(); // seolah proses mati
    expect(T.jumlah(WS)).toBe(0);

    const n = T.muat(WS);
    expect(n).toBeGreaterThanOrEqual(2);
    expect(T.jumlah(WS)).toBe(2);
    expect(T.sudahDibaca(WS, "app.js")).toBeTruthy();
  });

  test("baris jurnal rusak dilewati, sisanya tetap terbaca", () => {
    T.catat(WS, "baik.js", "isi");
    fs.appendFileSync(jurnal(), "{ bukan json valid\n");
    T.catat(WS, "baik2.js", "isi");
    T.bersihkan();
    T.muat(WS);
    expect(T.sudahDibaca(WS, "baik.js")).toBeTruthy();
    expect(T.sudahDibaca(WS, "baik2.js")).toBeTruthy();
  });
});

describe("biayanya tak boleh mengulang kesalahan rag.ingest", () => {
  test("catat() TIDAK menulis ulang seluruh berkas", () => {
    // rag.cjs ingest() melakukan _load() + _save() SELURUH store tiap panggilan.
    // Terukur: ke-1 4,3 ms, ke-100 27,2 ms, ke-400 55,6 ms — 13,2 detik untuk
    // 400 ingest, tumbuh linear. Di jalur panas itu jauh lebih buruk daripada
    // blokir 10,8 detik yang sudah diperbaiki di repo ini.
    const SRC = fs.readFileSync(require.resolve("../agent/temuan.cjs"), "utf8");
    expect(SRC).toMatch(/appendFileSync/);
    expect(SRC).not.toMatch(/writeFileSync\(\s*_berkasJurnal/);
  });

  test("biaya tetap datar seiring bertambahnya entri", () => {
    const ukur = () => {
      const t0 = process.hrtime.bigint();
      T.catat(WS, "x" + Math.random() + ".js", "isi\n".repeat(50));
      return Number(process.hrtime.bigint() - t0) / 1e6;
    };
    for (let i = 0; i < 50; i++) ukur();
    const awal = [ukur(), ukur(), ukur()].sort((a, b) => a - b)[1];
    for (let i = 0; i < 300; i++) ukur();
    const akhir = [ukur(), ukur(), ukur()].sort((a, b) => a - b)[1];
    // Datar, bukan linear. Ambang longgar supaya tak rapuh di mesin lambat;
    // yang ditolak adalah pertumbuhan seperti rag.ingest (13x lebih mahal).
    expect(akhir).toBeLessThan(awal * 5 + 5);
  }, 60000);
});

describe("terpasang di jalur yang benar", () => {
  const IDX = fs.readFileSync(
    require.resolve("../agent/tools/index.cjs"),
    "utf8",
  );
  const SELF = fs.readFileSync(
    require.resolve("../agent/self_agent.cjs"),
    "utf8",
  );

  test("read mencatat temuan", () => {
    expect(IDX).toMatch(/_t\.catat\(/);
  });

  test("blok disuntik ke prompt", () => {
    expect(SELF).toMatch(/_temuan\.blokPrompt\(/);
  });

  test("jurnal dimuat sekali per run", () => {
    expect(SELF).toMatch(/_t\.muat\(/);
  });

  test("KEDUA sisi memakai kunciWs() yang sama", () => {
    // Kalau rantai fallback-nya melenceng, temuan tersimpan di bawah kunci A
    // tapi dibaca dengan kunci B — dan blok "SUDAH DIBACA" jadi selalu kosong
    // TANPA satu pun error. Gagal senyap, jadi lebih berbahaya daripada crash.
    expect(IDX).toMatch(/_t\.kunciWs\(/);
    expect(SELF).toMatch(/_temuan\.kunciWs\(/);
  });

  test("kegagalan mencatat tak menggagalkan tool maupun run", () => {
    expect(() => T.catat(WS, null, undefined)).not.toThrow();
    expect(() => T.catat(null, "a.js", "isi")).not.toThrow();
    expect(() => T.blokPrompt(undefined)).not.toThrow();
  });
});

describe("KEDUA jalur read mencatat temuan", () => {
  // KENAPA ADA. Versi pertama hanya mengait cabang qRead — dan di run nyata
  // pengguna, SELURUH 23 pembacaan lewat broker (terlihat di ledger sebagai
  // "ALLOW readFile"). Jurnalnya tetap kosong tanpa satu pun error, jadi
  // kegagalannya senyap: mekanismenya terpasang, teruji, dan tak pernah jalan.
  //
  // Ada DUA cabang `name === "read"` di agent/tools/index.cjs:
  //   _brokeredFileOp()  dipakai saat sebuah workspace dipilih  <- yang terlewat
  //   qRead()            dipakai saat tidak ada workspace
  //
  // "Pola dua permukaan" yang sama yang sudah berkali-kali menggigit repo ini.
  const fs = require("fs");
  const IDX = fs.readFileSync(
    require.resolve("../agent/tools/index.cjs"),
    "utf8",
  );

  test("ada dua cabang read, dan KEDUANYA mencatat", () => {
    const cabang = (IDX.match(/if \(name === "read"\) \{/g) || []).length;
    expect(cabang).toBe(2);
    // Satu catat() per cabang. Kalau salah satu hilang, jurnal jadi kosong di
    // separuh konfigurasi tanpa gejala apa pun.
    expect((IDX.match(/_t\.catat\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  test("jalur broker memakai wsRoot yang sudah terkurung", () => {
    const blok = IDX.slice(
      IDX.indexOf('const content = await broker.request("readFile"'),
      IDX.indexOf('const content = await broker.request("readFile"') + 1200,
    );
    expect(blok).toMatch(/_t\.catat\(_t\.kunciWs\(wsRoot\)/);
  });

  test("jalur broker BENAR-BENAR mencatat saat dipanggil", async () => {
    const os = require("os");
    const path = require("path");
    const { runSelfTool } = require("../agent/tools/index.cjs");
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "wolf-tes-broker-"));
    fs.writeFileSync(path.join(ws, "a.js"), "// berkas uji\nlet x = 1;\n");
    const kunci = T.kunciWs(ws);
    T.bersihkan(kunci);
    try {
      const r = await runSelfTool("read", { path: "a.js" }, () => {}, {
        workspaceRoot: ws,
      });
      expect(r.ok).toBe(true);
      expect(T.sudahDibaca(kunci, "a.js")).toBeTruthy();
      expect(T.blokPrompt(kunci)).toMatch(/a\.js/);
    } finally {
      T.bersihkan(kunci);
      try {
        fs.rmSync(
          path.join(
            T.DIR,
            String(kunci)
              .replace(/[^A-Za-z0-9._-]/g, "_")
              .slice(-80) + ".jsonl",
          ),
          { force: true },
        );
      } catch (_) {}
      fs.rmSync(ws, { recursive: true, force: true });
    }
  }, 30000);
});
