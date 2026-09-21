// The agent reporting without being asked.
//
// ── WHAT MAKES THIS DIFFERENT FROM EVERY OTHER FEATURE HERE ──────────────────
//
// It is the only part of WOLFSPACE that spends the user's money while the user
// does nothing. Two things therefore have to be true, and neither can be left
// to a prompt:
//
//   1. IT CANNOT CHANGE ANYTHING. Enforced by handing the run a tool array with
//      no writing tools in it — a tool that is absent cannot be called, which a
//      instruction to behave can never guarantee.
//   2. IT CANNOT RUN AWAY. A save is a burst, not an event; a generated file
//      can rewrite itself in a loop; a slow model plus a busy folder queues
//      runs behind each other. Each limit below closes one of those.
//
// The watcher is driven FOR REAL against a temporary folder — real files, real
// fs.watch, real debounce — with only the model call faked. That is the half
// worth testing, and faking the model is what makes it testable at all.

const fs = require("fs");
const os = require("os");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const R = require(path.join(AKAR, "agent", "reaktif.ts"));

const AGEN = fs.readFileSync(path.join(AKAR, "agent", "self_agent.ts"), "utf8");
const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The module keeps its state on globalThis; each test starts from a clean one. */
function bersihkan() {
  const S = R._S;
  S.aktif = false;
  S.berubah.clear();
  S.sedangJalan = false;
  S.terakhirLapor = 0;
  S.capJam = [];
  if (S.jam) {
    clearTimeout(S.jam);
    S.jam = null;
  }
}
beforeEach(bersihkan);
afterEach(bersihkan);

describe("hanya boleh membaca", () => {
  test("the run is handed a filtered tool array, not an instruction", () => {
    // A prompt can be misread, argued with, or lost when history is trimmed.
    const i = AGEN.indexOf("if (hanyaBaca) {");
    expect(i).toBeGreaterThan(0);
    const blok = AGEN.slice(i, i + 700);
    expect(blok).toMatch(/currentTools = currentTools\.filter\(/);
    expect(blok).toMatch(/READ_ONLY_TOOLS\.includes/);
  });

  test("the filter runs AFTER MCP tools are added, so it drops them too", () => {
    // What an MCP server does behind a name is that server's decision: a tool
    // called `search` may write, and nothing here can tell.
    const iMcp = AGEN.indexOf("currentTools = currentTools.concat(mcpTools)");
    const iSaring = AGEN.indexOf("if (hanyaBaca) {");
    expect(iMcp).toBeGreaterThan(0);
    expect(iSaring).toBeGreaterThan(iMcp);
  });

  test("no writing tool can survive the filter", () => {
    // The list is READ_ONLY_TOOLS, shared with the CoT injection so a tool
    // cannot be read-only for one purpose and not the other.
    const i = AGEN.indexOf("const READ_ONLY_TOOLS = [");
    const daftar = AGEN.slice(i, AGEN.indexOf("];", i));
    for (const menulis of [
      "edit",
      "write",
      "bash",
      "replace_file_content",
      "write_artifact",
      "terminal_write",
      "sandbox_run",
      "capability_exec",
      "git",
    ]) {
      expect(daftar).not.toMatch(new RegExp('"' + menulis + '"'));
    }
    // And the ones it must keep.
    for (const baca of ["read", "grep", "glob", "list", "github_repo"]) {
      expect(daftar).toMatch(new RegExp('"' + baca + '"'));
    }
  });

  test("the reactive run always sets the flag", () => {
    const src = fs.readFileSync(path.join(AKAR, "agent", "reaktif.ts"), "utf8");
    const i = src.indexOf("await opsi.jalankan(");
    expect(src.slice(i, i + 500)).toMatch(/hanyaBaca: true/);
  });
});

describe("tidak bisa lepas kendali", () => {
  test("it is off until switched on", () => {
    // A feature that spends money on its own must be switched on deliberately,
    // not arrive already running because it shipped in an installer.
    expect(R.keadaan().aktif).toBe(false);
    expect(R.bolehLapor()).toEqual({ boleh: false, sebab: "switched off" });
  });

  test("a report while one is running is refused", () => {
    R.setAktif(true);
    R._S.sedangJalan = true;
    expect(R.bolehLapor().sebab).toMatch(/already running/);
  });

  test("two reports cannot land inside the minimum gap", () => {
    R.setAktif(true);
    R._S.terakhirLapor = Date.now() - 1000;
    const r = R.bolehLapor();
    expect(r.boleh).toBe(false);
    expect(r.sebab).toMatch(/since the last report/);
    // Past the gap it is allowed again.
    R._S.terakhirLapor = Date.now() - (R.JEDA_MINIMUM + 1000);
    expect(R.bolehLapor().boleh).toBe(true);
  });

  test("the hourly ceiling holds, and its window slides", () => {
    R.setAktif(true);
    R._S.terakhirLapor = 0;
    // Fill the hour.
    R._S.capJam = Array.from({ length: R.MAKS_PER_JAM }, () => Date.now());
    expect(R.bolehLapor().sebab).toMatch(/hourly ceiling/);
    // An entry older than an hour no longer counts — the window slides, it
    // does not reset on the hour.
    R._S.capJam = Array.from(
      { length: R.MAKS_PER_JAM },
      () => Date.now() - 3600001,
    );
    expect(R.bolehLapor().boleh).toBe(true);
  });

  test("refusals say WHY", () => {
    // A feature that silently declines to do the thing it exists for is
    // indistinguishable from a broken one.
    expect(R.bolehLapor().sebab).toBeTruthy();
  });
});

describe("hanya bangun untuk berkas yang berarti", () => {
  test("build output, dependencies and binaries are ignored", () => {
    for (const f of [
      "C:/p/node_modules/x/y.js",
      "C:/p/dist/app.js",
      "C:/p/dist-app/win/x.ts",
      "C:/p/.git/HEAD",
      "C:/p/public/app.build.js",
      "C:/p/a.png",
      "C:/p/x.log",
      "C:/p/.wolfspace/cloud-keys.json",
      "C:/p/vendor/monaco/loader.js",
    ]) {
      expect(R.berkasMenarik(f)).toBe(false);
    }
  });

  test("source is", () => {
    for (const f of [
      "C:/p/agent/github.ts",
      "C:/p/public/app/Screens.tsx",
      "C:/p/scripts/x.cjs",
      "C:/p/a.py",
      "C:/p/styles.css",
    ]) {
      expect(R.berkasMenarik(f)).toBe(true);
    }
  });

  test("a README is not a code question", () => {
    expect(R.berkasMenarik("C:/p/README.md")).toBe(false);
  });
});

describe("satu ledakan simpanan = satu laporan", () => {
  let dir = "";
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "reaktif-"));
  });

  test("five files saved together produce ONE report, listing all five", async () => {
    // Saving a file is not one event: the editor writes, a formatter rewrites,
    // a build touches an output. Without the quiet period this is five model
    // calls for one action.
    const laporan: any[] = [];
    let panggilan = 0;
    let dilihat: string[] = [];
    R.setAktif(true);
    const stop = R.mulai({
      akar: dir,
      cloud: {},
      tenang: 150, // the real default is 20s; the mechanism is the same
      jalankan: async (payload: any, emit: any) => {
        panggilan++;
        dilihat = String(payload.history[0].content).split("\n");
        emit({ t: "adone", text: "two things look off" });
      },
      lapor: (teks: string, berkas: string[]) =>
        laporan.push({ teks, n: berkas.length }),
    });
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(
        path.join(dir, "f" + i + ".ts"),
        "export const x = " + i,
      );
      await tunggu(20);
    }
    await tunggu(500);
    stop();
    expect(panggilan).toBe(1);
    expect(laporan).toHaveLength(1);
    expect(laporan[0].n).toBe(5);
    // The brief names the files, so the run knows what to look at.
    expect(dilihat.join("\n")).toMatch(/f0\.ts/);
  }, 15000);

  test("an ignored file wakes nothing at all", async () => {
    let panggilan = 0;
    R.setAktif(true);
    const stop = R.mulai({
      akar: dir,
      cloud: {},
      tenang: 120,
      jalankan: async () => {
        panggilan++;
      },
      lapor: () => {},
    });
    fs.writeFileSync(path.join(dir, "notes.md"), "hello");
    fs.writeFileSync(path.join(dir, "out.log"), "hello");
    await tunggu(400);
    stop();
    expect(panggilan).toBe(0);
  }, 15000);

  test("switched off, a change wakes nothing", async () => {
    let panggilan = 0;
    R.setAktif(false);
    const stop = R.mulai({
      akar: dir,
      cloud: {},
      tenang: 100,
      jalankan: async () => {
        panggilan++;
      },
      lapor: () => {},
    });
    fs.writeFileSync(path.join(dir, "a.ts"), "export const a = 1");
    await tunggu(350);
    stop();
    expect(panggilan).toBe(0);
  }, 15000);
});

describe("laporan yang tak berguna tidak sampai", () => {
  test("NOTHING is swallowed, not delivered", async () => {
    // NOTHING is the agreed way to say "not worth interrupting for". Delivered
    // literally it would reach the user as a message reading "NOTHING".
    const laporan: any[] = [];
    R.setAktif(true);
    await R.laporSekali({
      berkas: ["a.ts"],
      cloud: {},
      jalankan: async (_p: any, emit: any) =>
        emit({ t: "adone", text: "NOTHING" }),
      lapor: (t: string) => laporan.push(t),
    });
    expect(laporan).toHaveLength(0);
  });

  test("an empty answer is swallowed too", async () => {
    const laporan: any[] = [];
    R.setAktif(true);
    await R.laporSekali({
      berkas: ["a.ts"],
      cloud: {},
      jalankan: async (_p: any, emit: any) => emit({ t: "adone", text: "   " }),
      lapor: (t: string) => laporan.push(t),
    });
    expect(laporan).toHaveLength(0);
  });

  test("a failing run never throws out of the module", async () => {
    // An unhandled rejection in this app becomes an automatic rollback and
    // reload: a background feature must not be able to restart the app.
    R.setAktif(true);
    await expect(
      R.laporSekali({
        berkas: ["a.ts"],
        cloud: {},
        jalankan: async () => {
          throw new Error("model unreachable");
        },
        lapor: () => {},
      }),
    ).resolves.toBeUndefined();
    // And the run is marked finished, or nothing would ever report again.
    expect(R._S.sedangJalan).toBe(false);
  });

  test("a real answer does get through", async () => {
    const laporan: any[] = [];
    R.setAktif(true);
    await R.laporSekali({
      berkas: ["a.ts"],
      cloud: {},
      jalankan: async (_p: any, emit: any) =>
        emit({
          t: "adone",
          text: "agent/x.ts:12 guard removed, test still asserts it",
        }),
      lapor: (t: string) => laporan.push(t),
    });
    expect(laporan).toHaveLength(1);
    expect(laporan[0]).toMatch(/guard removed/);
  });
});

describe("antrean laporan", () => {
  const RUTE = fs.readFileSync(
    path.join(AKAR, "server", "routes", "reaktif.ts"),
    "utf8",
  );

  test("reading TAKES the queue", () => {
    // A report delivered twice reads as the agent repeating itself, and the
    // panel has no way to tell.
    expect(RUTE).toMatch(/_antre\.splice\(0, _antre\.length\)/);
  });

  test("the queue is bounded, oldest dropped first", () => {
    // If nobody is looking this must not grow without limit, and a stale
    // observation is worth less than a fresh one.
    const R2 = require(path.join(AKAR, "server", "routes", "reaktif.ts"));
    for (let i = 0; i < 20; i++) R2._simpanLaporan("laporan " + i, ["a.ts"]);
    expect(R2._antre.length).toBeLessThanOrEqual(8);
    expect(R2._antre[R2._antre.length - 1].teks).toBe("laporan 19");
  });
});

// ── IT STARTS BY ITSELF ──────────────────────────────────────────────────────
//
// The first version shipped a "Watch this folder" toggle and defaulted to off,
// with a reason: this is the only part of WOLFSPACE that spends money while the
// user does nothing. The user's answer was that a reactive agent you have to
// enable is not reactive — it is a feature with a setup step.
//
// So it starts with the server. The limits stay, because they are not what was
// objected to: they are what stops an automatic feature becoming an invisible
// leak. VERIFIED against a freshly booted server, with nothing switched on:
//   {"aktif":true,"pengawas":1,"dalamJam":0,"maksPerJam":12}
describe("berjalan otomatis, tanpa disuruh", () => {
  const KONFIG = JSON.parse(
    fs.readFileSync(path.join(AKAR, "config.json"), "utf8"),
  );
  const SERVER = fs.readFileSync(path.join(AKAR, "server.ts"), "utf8");
  const RUTE = fs.readFileSync(
    path.join(AKAR, "server", "routes", "reaktif.ts"),
    "utf8",
  );

  test("the config ships it enabled", () => {
    expect(KONFIG.reaktif).toBeTruthy();
    expect(KONFIG.reaktif.aktif).toBe(true);
  });

  test("the note in the config says what it may do", () => {
    // config.json SHIPS IN THE INSTALLER. Someone reading it must be able to
    // find out that a background agent is enabled and what its limits are,
    // without reading the source.
    expect(KONFIG.reaktif._note).toMatch(/ONLY READ/);
    expect(KONFIG.reaktif._note).toMatch(/aktif:false/);
  });

  test("the server starts it, after it is listening", () => {
    // A watcher that fails to start must never be the reason the server does
    // not come up.
    expect(SERVER).toMatch(/startWwWatcher\(\);\s*\n\s*startReaktif\(\);/);
    const i = SERVER.indexOf("function startReaktif()");
    const blok = SERVER.slice(i, i + 600);
    expect(blok).toMatch(/try \{/);
    expect(blok).toMatch(/CONFIG\.reaktif && CONFIG\.reaktif\.aktif/);
    expect(blok).toMatch(/mulaiOtomatis\(QROOT\)/);
  });

  test("auto-start does not need a request", () => {
    expect(RUTE).toMatch(/function mulaiOtomatis\(akar: string\)/);
    expect(RUTE).toMatch(/module\.exports = \{[^}]*mulaiOtomatis/);
  });

  test("turning it off is still possible", () => {
    // Automatic is not the same as unstoppable. The route still stops it, and
    // the report itself carries the way out.
    expect(RUTE).toMatch(/url === "\/reaktif\/aktif"/);
    const ui = fs.readFileSync(
      path.join(AKAR, "public", "app", "Components.tsx"),
      "utf8",
    );
    expect(ui).toMatch(/aktif: false/);
  });
});

describe("diam saat tak ada yang perlu dikatakan", () => {
  const UI = fs.readFileSync(
    path.join(AKAR, "public", "app", "Components.tsx"),
    "utf8",
  );
  const blok = UI.slice(UI.indexOf("function ReaktifBar()"));
  const satu = blok.slice(0, blok.indexOf("\n}\n"));

  test("nothing is rendered until there is a report", () => {
    // A permanent "watching…" strip is the kind of ambient noise that gets
    // tuned out — and then the one time it matters it is tuned out too.
    expect(satu).toMatch(/if \(!laporan\.length\) return null;/);
  });

  test("there is no standing switch to manage", () => {
    // The toggle that was here is gone: it made a reactive feature into one
    // with a setup step.
    expect(satu).not.toMatch(/Watch this folder/);
    expect(satu).not.toMatch(/rk-saklar/);
  });

  test("a report cannot be delivered twice", () => {
    // The server hands each one over ONCE, so the component has to keep what
    // arrives; dropping it loses the report for good.
    expect(satu).toMatch(
      /setLaporan\(\(p: any\) => \[\.\.\.j\.laporan, \.\.\.p\]/,
    );
  });

  test("polling stops when the component goes away", () => {
    // Otherwise every remount adds another interval, and they all keep firing.
    expect(satu).toMatch(/clearInterval\(jam\)/);
    expect(satu).toMatch(/hidup = false/);
  });
});
