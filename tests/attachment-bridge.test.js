// Alamatnya tak boleh menyeberang — dan tak boleh bisa menyeberang.
//
// KENAPA ADA. Attach lama menyisipkan PATH berkas ke pesan agent. Saat agent
// dikurung ke satu worktree, path itu di luar cakupan dan broker menolaknya,
// sehingga pengurungan yang benar justru mematikan fitur attach. Modul jembatan
// membalik yang menyeberang: isinya, bukan alamatnya.
//
// Sifat yang dijaga di sini bukan "path disembunyikan" melainkan "path tak
// pernah masuk". Bedanya menentukan: yang disembunyikan masih bisa bocor lewat
// bug; yang tak pernah ada tidak bisa.

const bridge = require("../agent/attachment-bridge.cjs");

beforeEach(() => bridge.bersihkan());

describe("alamat tak pernah masuk, apa pun yang dikirim pemanggil", () => {
  test("API-nya memang tak punya jalan masuk untuk path", () => {
    // Penjaga arah, bukan sekadar gaya: begitu ada parameter path, seluruh
    // jaminan modul ini runtuh — dan runtuhnya tak terlihat dari luar.
    const src = require("fs")
      .readFileSync(require.resolve("../agent/attachment-bridge.cjs"), "utf8")
      .replace(/\r\n/g, "\n");
    expect(src).toMatch(/TIDAK ADA parameter path/);
    // Tak ada fs sama sekali: modul ini tak pernah menyentuh disk, jadi tak ada
    // yang bisa dibaca ulang dari lokasi asal.
    expect(src).not.toMatch(/require\("fs"\)/);
  });

  test.each([
    [
      "path Windows absolut",
      "C:\\Users\\dave\\rahasia\\laporan.pdf",
      "laporan.pdf",
    ],
    ["path POSIX absolut", "/home/dave/rahasia/laporan.pdf", "laporan.pdf"],
    ["path relatif menaik", "../../etc/passwd", "passwd"],
    ["UNC share", "\\\\server\\bagi\\data.csv", "data.csv"],
    ["nama biasa", "catatan.md", "catatan.md"],
  ])("%s -> tersisa nama berkasnya saja", (_l, masuk, harap) => {
    expect(bridge._namaAman(masuk)).toBe(harap);
  });

  test("File.path Electron yang keliru dikirim pun ikut rontok", () => {
    // Di renderer Electron, objek File punya `.path` non-standar berisi path
    // absolut. Kalau suatu saat pemanggil keliru mengoperkannya sebagai `nama`,
    // kebocoran alamat TIDAK boleh bergantung pada kedisiplinan pemanggil.
    const r = bridge.serahkan({
      nama: "D:\\Dokumen Pribadi\\pajak\\2026\\spt.txt",
      isi: "isi berkas",
    });
    expect(r.ok).toBe(true);
    expect(r.nama).toBe("spt.txt");
    expect(JSON.stringify(r)).not.toMatch(/Dokumen Pribadi|pajak|D:/);
  });

  test("tak satu pun nilai balik memuat jejak asal", () => {
    const r = bridge.serahkan({
      nama: "C:\\kerja\\klien\\kontrak.txt",
      isi: "rahasia dagang",
    });
    const semua = JSON.stringify([r, bridge.daftar(), bridge.ambil(r.id)]);
    for (const jejak of ["C:", "kerja", "klien", "\\\\"])
      expect(semua).not.toContain(jejak);
  });
});

describe("barangnya menyeberang", () => {
  test("isi yang diserahkan bisa dibaca kembali, utuh", () => {
    const teks = "baris satu\nbaris dua\n";
    const r = bridge.serahkan({ nama: "a.txt", isi: teks });
    const b = bridge.ambil(r.id);
    expect(b.ok).toBe(true);
    expect(b.isi).toBe(teks);
    expect(b.nama).toBe("a.txt");
  });

  test("handle BOLEH dipakai berulang", () => {
    // Bukan kelonggaran: yang dibaca adalah salinan yang SUDAH menyeberang,
    // bukan berkas di disk asal — jadi membaca ulang tak menambah akses apa
    // pun. Sekali-pakai justru membuat agent buntu saat konteksnya terpotong,
    // dan pemotongan konteks itu rutin terjadi.
    const r = bridge.serahkan({ nama: "a.txt", isi: "halo" });
    expect(bridge.ambil(r.id).isi).toBe("halo");
    expect(bridge.ambil(r.id).isi).toBe("halo");
    expect(bridge.ambil(r.id).isi).toBe("halo");
  });

  test("Buffer maupun string sama-sama diterima", () => {
    const a = bridge.serahkan({
      nama: "a.txt",
      isi: Buffer.from("dari buffer"),
    });
    expect(bridge.ambil(a.id).isi).toBe("dari buffer");
  });
});

describe("handle adalah kapabilitasnya", () => {
  test("tak bisa ditebak dan tak pernah berulang", () => {
    const id = new Set();
    for (let i = 0; i < 200; i++)
      id.add(bridge.serahkan({ nama: "x.txt", isi: "x" }).id || "gagal-" + i);
    // Sebagian ditolak batas jumlah; yang berhasil harus unik semua.
    const sah = [...id].filter((x) => x.startsWith("att_"));
    expect(new Set(sah).size).toBe(sah.length);
    for (const x of sah) expect(x).toMatch(/^att_[0-9a-f]{24}$/);
  });

  test("handle yang tak dikenal ditolak, bukan mengembalikan apa pun", () => {
    const r = bridge.ambil("att_000000000000000000000000");
    expect(r.ok).toBe(false);
    expect(r.isi).toBeUndefined();
  });

  test("dilupakan berarti benar-benar hilang", () => {
    const r = bridge.serahkan({ nama: "a.txt", isi: "rahasia" });
    expect(bridge.lupakan(r.id)).toBe(true);
    expect(bridge.ambil(r.id).ok).toBe(false);
  });
});

describe("berkas biner tak membakar jendela konteks", () => {
  test("ditolak dengan keterangan, bukan dikirim sebagai base64", () => {
    // PDF 240 KB jadi ~80 ribu token bila di-base64 — habis seluruh konteks
    // untuk sesuatu yang tetap tak terbaca model.
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0x02, 0x00]);
    const r = bridge.serahkan({ nama: "l.pdf", isi: pdf });
    const b = bridge.ambil(r.id);
    expect(b.ok).toBe(false);
    expect(b.biner).toBe(true);
    expect(b.nama).toBe("l.pdf"); // namanya tetap berguna
    expect(b.bytes).toBe(8);
    expect(b.isi).toBeUndefined();
  });

  test("teks dengan aksen TIDAK salah dikira biner", () => {
    const r = bridge.serahkan({ nama: "id.txt", isi: "kucing — enak, naïve" });
    expect(bridge.ambil(r.id).ok).toBe(true);
  });
});

describe("batas dijaga: isinya tinggal di memori proses pemilik jendela", () => {
  test("berkas melebihi batas per-berkas DITOLAK saat diserahkan", () => {
    const r = bridge.serahkan({
      nama: "besar.txt",
      isi: Buffer.alloc(bridge.MAKS_PER_BERKAS + 1, 0x61),
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/melebihi batas/);
    expect(bridge.daftar()).toHaveLength(0);
  });

  test("jumlah lampiran per sesi dibatasi", () => {
    for (let i = 0; i < bridge.MAKS_JUMLAH; i++)
      expect(bridge.serahkan({ nama: i + ".txt", isi: "x" }).ok).toBe(true);
    const lewat = bridge.serahkan({ nama: "lebih.txt", isi: "x" });
    expect(lewat.ok).toBe(false);
    expect(bridge.daftar()).toHaveLength(bridge.MAKS_JUMLAH);
  });

  test("daftar() hanya metadata — tak ada isi, tak ada asal", () => {
    bridge.serahkan({ nama: "C:\\x\\a.txt", isi: "rahasia dagang" });
    const d = bridge.daftar();
    expect(d[0]).toEqual({
      id: expect.stringMatching(/^att_/),
      nama: "a.txt",
      bytes: 14,
      tipe: null,
      ts: expect.any(Number),
    });
    expect(JSON.stringify(d)).not.toContain("rahasia dagang");
  });
});

describe("bertahan melewati hot-reload backend", () => {
  test("instans disimpan di globalThis, bukan di module scope", () => {
    // Hot-reload membuang require.cache. Tanpa singleton global, seluruh
    // lampiran user lenyap di tengah sesi hanya karena sebuah berkas sumber
    // tersentuh — pola yang sama sudah pernah menggigit mcp-client.
    const r = bridge.serahkan({ nama: "a.txt", isi: "bertahan" });
    jest.resetModules();
    const lagi = require("../agent/attachment-bridge.cjs");
    expect(lagi.ambil(r.id).isi).toBe("bertahan");
  });
});

describe("tersambung: agent memakai handle, bukan alamat", () => {
  // Uji END-TO-END lewat runSelfTool — dispatcher yang BENAR-BENAR dipakai
  // self_agent.cjs, bukan modul jembatan langsung. Pelajaran dari
  // gate-agent-path.test.js: gerbang pernah dipasang di jalur mati dan lulus
  // semua tesnya tanpa pernah mengikat agent sedetik pun.
  const path = require("path");
  const os = require("os");
  const fsn = require("fs");
  const { runSelfTool } = require("../agent/tools.cjs");

  const WS = path.join(os.tmpdir(), "wolf-uji-lampiran-worktree");
  const noop = () => {};
  const ctx = { workspaceRoot: WS, sessionId: "uji-lampiran" };

  beforeAll(() => {
    fsn.rmSync(WS, { recursive: true, force: true });
    fsn.mkdirSync(WS, { recursive: true });
  });

  test("attachment_list kosong menjelaskan bahwa HANYA user yang bisa melampirkan", async () => {
    // Penting untuk model: tanpa kalimat ini ia akan mencari-cari tool untuk
    // membuka berkas sendiri, lalu berputar saat tak menemukannya.
    const r = await runSelfTool("attachment_list", {}, noop, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toMatch(/hanya user yang bisa melampirkan/i);
    expect(r.output).toMatch(/tak ada tool untuk membuka berkas/i);
  });

  test("berkas DI LUAR worktree: read ditolak, lampiran diterima", async () => {
    const luar = path.join(os.tmpdir(), "wolf-uji-luar");
    fsn.rmSync(luar, { recursive: true, force: true });
    fsn.mkdirSync(luar, { recursive: true });
    const berkas = path.join(luar, "kontrak.txt");
    fsn.writeFileSync(berkas, "PASAL 1: rahasia");

    // Jalur biasa: pengurungan bekerja, dan ini yang dulu mematikan attach.
    const rBaca = await runSelfTool("read", { path: berkas }, noop, ctx);
    expect(String(rBaca.output || "")).not.toContain("PASAL 1");

    // Jalur jembatan: berkas yang SAMA menyeberang, tanpa pengurungan
    // dilonggarkan sedikit pun — tak ada root kedua yang ditambahkan.
    const serah = bridge.serahkan({
      nama: berkas, // path PENUH sengaja dikirim; jembatan memotongnya
      isi: fsn.readFileSync(berkas),
    });
    expect(serah.nama).toBe("kontrak.txt");

    const rLamp = await runSelfTool(
      "attachment_read",
      { id: serah.id },
      noop,
      ctx,
    );
    expect(rLamp.ok).toBe(true);
    expect(rLamp.output).toContain("PASAL 1");
    // Dan tak ada jejak asal di keluaran yang DIBACA MODEL.
    expect(rLamp.output).not.toContain("wolf-uji-luar");
    expect(rLamp.output).not.toMatch(/[A-Za-z]:[\\/]/); // C:\ atau C:/
  });

  test("handle tak bisa ditebak — id ngawur tidak mengembalikan apa pun", async () => {
    const r = await runSelfTool(
      "attachment_read",
      { id: "att_ffffffffffffffffffffffff" },
      noop,
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/tak dikenal/);
  });

  test("kedua tool terdaftar di SELF_TOOLS — kalau tidak, model tak melihatnya", () => {
    const { SELF_TOOLS } = require("../agent/tools.cjs");
    const nama = SELF_TOOLS.map((t) => t.function.name);
    expect(nama).toContain("attachment_list");
    expect(nama).toContain("attachment_read");
  });

  test("attachment.read ada di kosakata CommandChain dan bisa DIKUNCI", () => {
    const cc = require("../agent/broker/commandchain.ts");
    const bebas = cc.buatRuleset({});
    expect(cc.periksa(bebas, "attachment.read").allow).toBe(true);
    // Dikunci per sesi tanpa ikut mematikan pembacaan berkas di worktree —
    // itulah gunanya kapabilitas ini terpisah dari readFile.
    const kunci = cc.buatRuleset({ tanpa: ["attachment.read"] });
    expect(cc.periksa(kunci, "attachment.read").allow).toBe(false);
    expect(cc.periksa(kunci, "readFile").allow).toBe(true);
  });

  test("UI mengirim HANDLE ke agent, bukan path — di KEDUA permukaan", () => {
    // Dua permukaan lagi (Components.tsx + Screens.tsx). Perbaikan yang hanya
    // menyentuh satu membuat format lampiran berbeda tergantung layar mana yang
    // dipakai — persis kesalahan yang terjadi pada daftar MCP.
    for (const m of [
      "../public/app/Components.tsx",
      "../public/app/Screens.tsx",
    ]) {
      const mentah = require("fs").readFileSync(require.resolve(m), "utf8");
      // Komentar DIBUANG sebelum diperiksa. Catatan "kenapa" di kedua berkas
      // sengaja mengutip bentuk lama ("- [Attached]: <path>") supaya pembaca
      // berikutnya tahu apa yang diganti dan kenapa — dan tanpa pembuangan ini,
      // tes menangkap kutipan itu lalu merah karena dokumentasinya sendiri.
      const src = mentah.replace(/^\s*\/\/.*$/gm, "").replace(/\s+/g, " ");
      expect(src).toContain('path: "/attach"');
      expect(src).toContain("[Terlampir]");
      expect(src).toContain("id: ${a.attId}");
      // Bentuk lama yang menyerahkan LOKASI ke agent tak boleh tersisa di kode.
      expect(src).not.toContain("[Attached]");
      expect(src).not.toContain('path: "/upload"');
    }
  });
});

describe("tool disk_* benar-benar tak ada — bukan sekadar disembunyikan", () => {
  // KENAPA ADA. disk_list/disk_read/disk_glob/disk_grep dulu menerima path
  // SEMBARANG dan ditangani DI LUAR blok `if (_wsRoot)`, sehingga mengabaikan
  // pengurungan worktree sepenuhnya.
  //
  // Mereka sudah lama dicabut dari SELF_TOOLS, jadi model tak bisa memanggilnya
  // dan lubangnya tak pernah aktif — koreksi atas laporan saya sebelumnya, yang
  // menyebutnya "BOCOR" berdasarkan probe yang memanggil runSelfTool LANGSUNG,
  // melewati daftar tool. Agent tak punya jalan itu.
  //
  // Yang tersisa adalah kode mati yang menembus pengurungan, dan itu ranjau:
  // satu baris yang mengembalikannya ke SELF_TOOLS membatalkan seluruh
  // pengurungan tanpa satu pun tes menjadi merah. Karena itu dua lapis dijaga
  // di sini — tak terekspos DAN tak terimplementasi.
  const path = require("path");
  const os = require("os");
  const fsn = require("fs");
  const { runSelfTool, SELF_TOOLS } = require("../agent/tools.cjs");
  const MATI = ["disk_read", "disk_list", "disk_glob", "disk_grep"];

  test("tidak terekspos ke model", () => {
    const nama = SELF_TOOLS.map((t) => t.function.name);
    for (const t of MATI) expect(nama).not.toContain(t);
  });

  test("tidak terimplementasi — dispatcher menolaknya sebagai tool tak dikenal", async () => {
    const ctx = { workspaceRoot: path.join(os.tmpdir(), "wolf-uji-kurung") };
    for (const t of MATI) {
      const r = await runSelfTool(
        t,
        { path: "C:\\", pattern: "*" },
        () => {},
        ctx,
      );
      expect(r.ok).toBe(false);
      expect(r.output).toContain("unknown tool");
    }
  }, 20000);

  test("jalur SAH tidak ikut mati: list/glob/grep tetap terkurung ke worktree", async () => {
    // disk-tools.cjs sendiri TETAP dipakai — diskListA/diskGlobA/diskGrepA
    // melayani list/glob/grep yang dikurung. Yang dihapus jalur tool-nya, bukan
    // modulnya; kalau ikut terhapus, agent kehilangan kemampuan menjelajah
    // worktree-nya sendiri.
    const WS = path.join(os.tmpdir(), "wolf-uji-kurung-sah");
    fsn.rmSync(WS, { recursive: true, force: true });
    fsn.mkdirSync(WS, { recursive: true });
    fsn.writeFileSync(path.join(WS, "didalam.txt"), "isi");
    const r = await runSelfTool("list", {}, () => {}, { workspaceRoot: WS });
    expect(r.ok).toBe(true);
    expect(r.output).toContain("didalam.txt");
  }, 20000);
});

describe("lampiran tampil sebagai KARTU, bukan baris teks di gelembung", () => {
  // KENAPA ADA. Ringkasan lampiran disatukan ke dalam teks pesan, dan pesan
  // user dirender apa adanya (<div className="bubble-user">{msg.text}</div>).
  // Akibatnya lampiran mendarat sebagai baris teks mentah di gelembung chat —
  // dan sesudah jembatan handle dipasang, barisnya ikut membawa "att_57a5…"
  // yang tak ada gunanya dibaca manusia.
  //
  // Handle TETAP harus sampai ke model (satu-satunya cara agent membaca
  // lampiran). Jadi yang dipisah bukan datanya, melainkan JALURNYA: argumen
  // pertama onSend untuk model, argumen kedua untuk mata user.
  const fs = require("fs");
  const baca = (m) =>
    fs.readFileSync(require.resolve(m), "utf8").replace(/\s+/g, " ");

  test("doSend menerima display berupa objek {text, attachments}", () => {
    const app = baca("../public/app.tsx");
    expect(app).toMatch(
      /const _pesanUser = \(content(?:: \w+)?, display(?:: \w+)?\)/,
    );
    // Bentuk string lama HARUS tetap didukung: beberapa pemanggil lain
    // (retry, resume HITL) masih mengirimkannya.
    expect(app).toContain("return { text: display || content };");
    // Tanda kurungnya sengaja TIDAK dicocokkan: prettier membuang kurung
    // berlebih, dan tes yang mengunci bentuknya jadi merah karena pemformatan,
    // bukan karena perilaku berubah. (Sudah terjadi dua kali di sesi ini.)
    expect(app).toContain("_pesanUser(content, display)");
    // Setiap tempat pembentuk pesan user harus lewat helper yang sama —
    // kalau satu terlewat, lampiran tampil sebagai teks mentah hanya pada
    // jalur itu, dan bug seperti itu sangat sulit ditelusuri.
    //
    // The count went from 4 to 2 when the /openclaw bridge was deleted: two of
    // the four sites lived inside that handler (its empty-message path and its
    // send path), and both went away with it. What is guarded is that every
    // REMAINING construction site funnels through the helper — not that there
    // are four of them, so the number follows the call sites that still exist.
    expect(app.match(/\.\.\._pesanUser\(content, display\)/g)).toHaveLength(2);
  });

  test("KEDUA permukaan mengirim tampilan terpisah dari teks model", () => {
    // Dua permukaan lagi. Yang pertama Composer, yang kedua layar pemilih
    // proyek — dan pesan PERTAMA sebuah sesi justru lewat yang kedua.
    expect(baca("../public/app/Components.tsx")).toContain(
      "onSend(fullText, { text: v, attachments:",
    );
    expect(baca("../public/app/Screens.tsx")).toContain(
      "onStart(fullText, chosenPath, { text: v, attachments:",
    );
  });

  test("gelembung hanya memuat teks user; lampiran dirender terpisah", () => {
    const c = baca("../public/app/Components.tsx");
    expect(c).toContain('className="msg-attachments"');
    expect(c).toContain("msg.attachments && msg.attachments.length > 0");
    // Gelembung tak dirender sama sekali bila user hanya melampirkan tanpa
    // mengetik — kalau tidak, muncul gelembung kosong.
    expect(c).toContain(
      'msg.text ? <div className="bubble-user">{msg.text}</div> : null',
    );
  });

  test("lampiran yang GAGAL diserahkan terlihat gagal, bukan diam-diam hilang", () => {
    const c = baca("../public/app/Components.tsx");
    expect(c).toContain("ok: !!a.attId");
    expect(c).toContain('"msg-att" + (a.ok ? "" : " err")');
    // Dan teks yang dikirim ke model pun menyebutnya, supaya model tak
    // menunggu lampiran yang tak pernah sampai.
    expect(c).toContain("handoff FAILED");
  });

  test("gaya kartunya benar-benar ada — kalau tidak, kartunya tampil polos", () => {
    const css = fs.readFileSync(
      require.resolve("../public/styles.css"),
      "utf8",
    );
    for (const kelas of [".msg-attachments", ".msg-att", ".msg-att-name"])
      expect(css).toContain(kelas);
  });
});
