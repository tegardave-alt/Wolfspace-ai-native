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

// ── DIUJI DI REPO SUNGGUHAN, BUKAN DI REPO INI ───────────────────────────────
//
// Everything above runs against WOLFSPACE's own checkout, which means it can
// only ever exercise READ operations — nothing may commit to the repo it is
// testing. That is why three bugs lived here undisturbed:
//
//   1. `blame` had NEVER worked. Not once. git blame has no --no-color (only
//      --color-lines and --color-by-age), so git answered
//        error: ambiguous option: no-color
//      and printed its usage. Every other operation takes --no-color happily,
//      which is exactly why it was copied across without being tried — and no
//      test above ever called blame.
//
//   2. A SUBFOLDER of a repository was refused. The check was
//      fs.existsSync(ws + "/.git"), true only at the top of a repo. MEASURED:
//        git -C <repo>/sub status --porcelain=v1 --branch  ->  ## master
//        the tool                                          ->  "not a git repo"
//      Open a package inside a monorepo and git vanished entirely.
//
//   3. `git add .` was impossible. _validasiBerkas refused rel === "" with
//      "path di luar workspace: ." — untrue, and it left no way to stage a
//      DELETION at all, since enumerating changed files cannot name a file that
//      is gone.
//
// A throwaway repository in a temp folder fixes the gap: writes are safe there,
// so the write half is finally reachable.
describe("perilaku di repo sekali pakai", () => {
  const os = require("os");
  const { execFileSync } = require("child_process");
  let dir = "";
  // THE IDENTITY IS PINNED IN THE ENVIRONMENT, not only in git config.
  //
  // `git config user.name` is OUTRANKED by GIT_AUTHOR_NAME / GIT_COMMITTER_NAME
  // when those are present, and inside a git hook they are: running this suite
  // from .husky/pre-commit made the commit below carry the MACHINE's identity,
  // and "blame actually works" then failed looking for "Uji" in output that
  // read "tegar". The test was right about blame and wrong about who it could
  // count on being the author.
  //
  // Reproduced directly: the same commit with GIT_AUTHOR_NAME set produces
  // exactly the observed line. Setting both here makes the repo's identity a
  // property of the test rather than of wherever it happens to run.
  const ENV_UJI = {
    ...process.env,
    GIT_AUTHOR_NAME: "Uji",
    GIT_AUTHOR_EMAIL: "uji@example.com",
    GIT_COMMITTER_NAME: "Uji",
    GIT_COMMITTER_EMAIL: "uji@example.com",
  };
  const g = (...a) =>
    execFileSync("git", ["-C", dir, ...a], {
      encoding: "utf8",
      env: ENV_UJI,
    });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "uji-git-"));
    g("init", "-q");
    g("config", "user.email", "uji@example.com");
    g("config", "user.name", "Uji");
    fs.writeFileSync(path.join(dir, "a.txt"), "satu\ndua\n");
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "sub", "b.txt"), "isi\n");
    g("add", "-A");
    g("commit", "-qm", "commit pertama");
  });

  test("blame actually works", async () => {
    // The regression that mattered most: it answered git's usage text, every
    // single time, and nothing noticed.
    const r = await G.jalankan({ operasi: "blame", berkas: ["a.txt"] }, dir);
    expect(r.ok).toBe(true);
    expect(r.output).not.toMatch(/ambiguous option/);
    expect(r.output).not.toMatch(/usage: git blame/);
    // Real blame output names the author and the line.
    expect(r.output).toMatch(/Uji/);
    expect(r.output).toMatch(/satu/);
  });

  test("a subfolder of a repository is still that repository", async () => {
    const r = await G.jalankan({ operasi: "status" }, path.join(dir, "sub"));
    expect(r.ok).toBe(true);
    expect(String(r.output)).toMatch(/^##/m);
  });

  test("a folder in no repository at all is still refused", async () => {
    // The walk upward must not turn "no repo" into "some repo far above".
    const kosong = fs.mkdtempSync(path.join(os.tmpdir(), "bukan-repo-"));
    const r = await G.jalankan({ operasi: "status" }, kosong);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/not inside a git repo/);
  });

  test("staging '.' works, and it is the only way to stage a deletion", async () => {
    fs.unlinkSync(path.join(dir, "sub", "b.txt"));
    fs.writeFileSync(path.join(dir, "c.txt"), "c\n");
    const r = await G.jalankan({ operasi: "tambah", berkas: ["."] }, dir);
    expect(r.ok).toBe(true);
    const s = await G.jalankan({ operasi: "diff", bertahap: true }, dir);
    expect(s.output).toMatch(/deleted file/);
    expect(s.output).toMatch(/new file/);
  });

  test("'..' is still outside, whatever '.' now means", async () => {
    const r = await G.jalankan({ operasi: "diff", berkas: [".."] }, dir);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/di luar workspace/);
  });

  test("the write operations do what they say", async () => {
    fs.writeFileSync(path.join(dir, "a.txt"), "satu\ndua\ntiga\n");
    expect(
      (await G.jalankan({ operasi: "tambah", berkas: ["a.txt"] }, dir)).ok,
    ).toBe(true);
    const c = await G.jalankan({ operasi: "commit", pesan: "kedua" }, dir);
    expect(c.ok).toBe(true);
    expect(c.output).toMatch(/1 file changed/);
    const b = await G.jalankan({ operasi: "cabang_baru", ref: "fitur/x" }, dir);
    expect(b.ok).toBe(true);
    expect(g("rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("fitur/x");
  });

  test("restore really discards", async () => {
    fs.writeFileSync(path.join(dir, "a.txt"), "dirusak\n");
    const r = await G.jalankan({ operasi: "pulihkan", berkas: ["a.txt"] }, dir);
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(path.join(dir, "a.txt"), "utf8")).toMatch(/satu/);
  });
});

describe("batas jumlah log", () => {
  test("0 no longer means 20", () => {
    // `Number(a.jumlah) || 20` turned 0 into 20 because 0 is falsy: a caller
    // asking for none silently got the default.
    expect(G._batasJumlah(0)).toBe(1);
    expect(G._batasJumlah(-5)).toBe(1);
  });

  test("only an absent or unreadable value takes the default", () => {
    expect(G._batasJumlah(undefined)).toBe(20);
    expect(G._batasJumlah("abc")).toBe(20);
    expect(G._batasJumlah(null)).toBe(20);
    // Number("") and Number([]) are both 0, which would look like a request
    // for none rather than an omission.
    expect(G._batasJumlah("")).toBe(20);
    expect(G._batasJumlah([])).toBe(20);
  });

  test("a number given is clamped, not replaced", () => {
    expect(G._batasJumlah(1)).toBe(1);
    expect(G._batasJumlah(7)).toBe(7);
    expect(G._batasJumlah("7")).toBe(7);
    expect(G._batasJumlah(99999)).toBe(200);
    // A fraction cannot reach git's -n.
    expect(G._batasJumlah(3.9)).toBe(3);
  });
});

describe("blame tidak boleh memakai flag yang tak ada", () => {
  const src = fs.readFileSync(
    path.join(AKAR, "agent", "tools", "git-tool.ts"),
    "utf8",
  );

  test("--no-color is gone from blame, and only from blame", () => {
    // COMMENTS STRIPPED: the note left where the flag used to be quotes the
    // flag and git's complaint about it, so matching the raw source would fail
    // against the very record of the fix.
    const KODE = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const i = KODE.indexOf("  blame: {");
    const blok = KODE.slice(i, KODE.indexOf("},", i));
    expect(blok).not.toMatch(/--no-color/);
    // The others genuinely accept it, so it must stay there.
    expect(KODE.slice(KODE.indexOf("  diff: {"))).toMatch(/--no-color/);
  });

  test("the reason is written down where the flag used to be", () => {
    // Otherwise it comes back the next time someone tidies the table.
    const i = src.indexOf("  blame: {");
    expect(src.slice(i, i + 900)).toMatch(/ambiguous option/);
  });
});
