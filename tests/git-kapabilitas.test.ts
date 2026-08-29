// git sesudah bash terkurung kernel.
//
// KENAPA BERKAS INI ADA. AppContainer menutup satu hal yang tak bisa dibuka
// lagi dengan izin apa pun: git memanggil sanitize_stdfds() saat start, yang
// membuka /dev/null dengan O_RDWR TANPA SYARAT, dan perangkat NUL di dalam
// container bisa DITULIS tapi tidak bisa DIBACA. Jadi setiap perintah git apa
// pun mati sebelum mengerjakan apa pun.
//
// Godaan yang jelas adalah melubangi kurungan untuk git. Itu membatalkan
// seluruh gunanya: perintah yang boleh keluar adalah perintah yang bisa dipakai
// untuk keluar. Jalan yang dipilih sama dengan net_diag — bukan "kurung
// shell-nya", tapi "jangan beri shell sama sekali, beri kapabilitas bernama".
//
// Yang dikunci di sini adalah bentuknya, bukan cuma bahwa ia jalan: begitu tool
// ini menerima teks perintah bebas, seluruh alasan keberadaannya hilang.

const fs = require("fs");
const path = require("path");
const G = require("../agent/tools/git-tool.ts");

const AKAR = path.resolve(__dirname, "..");
jest.setTimeout(90000);

describe("bentuk: kapabilitas bernama, bukan perintah", () => {
  const src = fs.readFileSync(
    path.join(AKAR, "agent", "tools", "git-tool.ts"),
    "utf8",
  );

  test("tak ada parameter perintah bebas", () => {
    // Kalau ini gagal, tool sudah berubah jadi shell git dan pemindaian teks
    // kembali jadi satu-satunya batas — persis yang sudah terbukti bocor.
    expect(src).not.toMatch(/args\.(command|perintah|cmd)\b/);
    expect(src).toMatch(/const OPERASI = \{/);
  });

  test("dijalankan lewat execFile dengan argv array, bukan shell", () => {
    expect(src).toMatch(/execFile\(\s*\n?\s*"git"/);
    expect(src).not.toMatch(/\bexec\(\s*`/);
  });

  test("tak ada operasi jaringan", () => {
    // push/pull/fetch/clone butuh kredensial dan menyentuh dunia luar; keduanya
    // di luar cakupan tool ini, dan diamnya tidak cukup — harus tak ada.
    for (const k of Object.keys(G.OPERASI))
      expect(["push", "pull", "fetch", "clone", "remote"]).not.toContain(k);
  });

  test("repo dipaksa ke workspace lewat -C", () => {
    expect(src).toMatch(/"-C", ws/);
  });

  test("pager, editor, dan prompt kredensial dimatikan", () => {
    // Ketiganya membuat git MENGGANTUNG menunggu manusia yang tak ada, dan dari
    // luar itu tampak persis seperti hang tanpa sebab.
    expect(src).toMatch(/GIT_PAGER/);
    expect(src).toMatch(/GIT_EDITOR/);
    expect(src).toMatch(/GIT_TERMINAL_PROMPT/);
  });

  test("operasi tulis digerbang admission, operasi baca tidak", () => {
    expect(G.OPERASI.commit.tulis).toBe(true);
    expect(G.OPERASI.tambah.tulis).toBe(true);
    expect(G.OPERASI.status.tulis).toBeUndefined();
    expect(G.OPERASI.log.tulis).toBeUndefined();
    expect(src).toMatch(/proc\.raw/);
  });

  test("hook TIDAK dimatikan diam-diam", () => {
    // Mematikan hook akan membuat commit melewati gerbang mutu yang justru
    // dipasang orang dengan sengaja. Lubangnya diakui dan digerbang, bukan
    // ditutup dengan menghilangkan perilaku yang benar.
    expect(src).not.toMatch(/--no-verify|core\.hooksPath/);
    expect(src).toMatch(/hook/i);
  });

  test("persetujuan user diminta untuk operasi TULIS saja", () => {
    // Sebelum tool ini ada, git hanya bisa lewat bash — yang selalu minta
    // persetujuan. Tanpa gerbang ini, tool baru justru jadi jalan memutar.
    // The gate moved to agent/penjaga-agent.ts so BOTH orchestrators use one
    // implementation. Both halves are checked: the logic is in the shared
    // module, AND self_agent delegates rather than keeping a copy. Checking
    // only the first would stop noticing a second copy growing back — which is
    // the drift the extraction exists to prevent.
    const pj = fs.readFileSync(
      path.join(AKAR, "agent", "penjaga-agent.ts"),
      "utf8",
    );
    expect(pj).toMatch(/git-tool\.(?:cjs|ts)"\)\.OPERASI/);
    // Argumen yang tak bisa diurai harus gagal ke arah MEMINTA izin.
    expect(pj).toMatch(/return true;/);

    const sa = fs.readFileSync(
      path.join(AKAR, "agent", "self_agent.ts"),
      "utf8",
    );
    expect(sa).toMatch(/_perluPersetujuan/);
    expect(sa).toMatch(/penjaga-agent\.ts/);
    expect(sa).not.toMatch(/const EXECUTION_TOOLS = \[/);

    // And the decision itself, not just its text: write asks, read does not.
    require(require("path").join(AKAR, "scripts", "ts-register.cjs"));
    const G = require(path.join(AKAR, "agent", "penjaga-agent.ts"));
    expect(
      G.perluPersetujuan({
        function: { name: "git", arguments: '{"operasi":"commit"}' },
      }),
    ).toBe(true);
    expect(
      G.perluPersetujuan({
        function: { name: "git", arguments: '{"operasi":"status"}' },
      }),
    ).toBe(false);
  });
});

describe("perilaku nyata di repo ini", () => {
  const jalan = (a) => G.jalankan(a, AKAR);

  test("status terbaca", async () => {
    const r = await jalan({ operasi: "status" });
    expect(r.ok).toBe(true);
    expect(String(r.output)).toMatch(/^##/m);
  });

  test("log terbaca dan jumlahnya dibatasi", async () => {
    const r = await jalan({ operasi: "log", jumlah: 3 });
    expect(r.ok).toBe(true);
    expect(String(r.output).trim().split("\n").length).toBeLessThanOrEqual(3);
  });

  test("jumlah di luar batas dijepit, bukan diteruskan", async () => {
    const r = await jalan({ operasi: "log", jumlah: 99999 });
    expect(r.ok).toBe(true);
    expect(String(r.output).trim().split("\n").length).toBeLessThanOrEqual(200);
  });

  test("path di luar workspace DITOLAK", async () => {
    const r = await jalan({
      operasi: "diff",
      berkas: ["../../Windows/win.ini"],
    });
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/di luar workspace/);
  });

  test("path yang menyamar sebagai opsi DITOLAK", async () => {
    // `--output=...` sebagai "path" akan diurai git sebagai OPSI, bukan berkas.
    const r = await jalan({ operasi: "diff", berkas: ["--output=/tmp/x"] });
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/must not start with '-'/);
  });

  test("ref berisi spasi atau opsi DITOLAK", async () => {
    for (const ref of ["--upload-pack=calc", "a b", "-x"]) {
      const r = await jalan({ operasi: "show", ref });
      expect(r.ok).toBe(false);
      expect(r.output).toMatch(/is invalid/);
    }
  });

  test("operasi tak dikenal menyebutkan yang ada", async () => {
    const r = await jalan({ operasi: "rm -rf" });
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/status/);
    // Pesannya diterjemahkan ke Inggris bersama sisa teks yang dibaca agent;
    // yang dijaga tetap sama — daftar operasi HARUS menyebut bahwa tool ini
    // tak punya jalur jaringan sama sekali.
    expect(r.output).toMatch(/NO network operations/);
  });

  test("commit tanpa pesan ditolak sebelum apa pun dijalankan", async () => {
    const r = await jalan({ operasi: "commit", pesan: "   " });
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/butuh 'pesan'/);
  });

  test("label penegakan JUJUR: bukan kurungan kernel", async () => {
    // Prosesnya berjalan DI LUAR AppContainer. Melabelinya "kernel" akan
    // mengulang persis kesalahan yang dibuang dari jalur bash: klaim yang lebih
    // kuat daripada yang dimiliki.
    const r = await jalan({ operasi: "kepala" });
    expect(r.penegakan).toBe("penasihat");
    expect(r.mekanisme).toBe("kapabilitas-git");
    expect(r.terkurungOs).toBe(false);
  });
});
