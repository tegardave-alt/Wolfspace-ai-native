// Windows commands run under a resource ceiling, not just a sandbox.
//
// THE GAP THIS CLOSES. An AppContainer confines what a command can REACH. It
// says nothing about how much it can CONSUME — a command could take every byte
// of RAM on the machine while staying perfectly inside its sandbox. The Linux
// path never had that hole: agent/tools/bash-jail.ts caps processes, virtual
// memory and CPU through the namespace jail. Windows had no equivalent until
// the Job Object in scripts/appcontainer/AcLaunch.cs.
//
// WHY IT IS TESTED THIS WAY. Asserting that the environment variables are set
// would prove only that they are set. The first attempt at this measurement was
// not even a control: the ceilings come from agent/anggaran.ts, so deleting the
// variables in the parent changed nothing and BOTH runs were bounded — they
// failed identically and looked like proof that nothing worked.
//
// So the launcher is invoked DIRECTLY, where the environment can really be
// withheld, and the same command is run twice. Measured while writing this:
//
//   allocate 256 MB   without ceiling -> 268435456   with ceiling -> 268435456
//   allocate 700 MB   without ceiling -> 734003200   with ceiling -> OutOfMemory
//
// Under the ceiling nothing changes; over it, the allocation is refused. That
// difference is the whole claim.

const path = require("path");
const { execFile } = require("child_process");
const { diWindows, describeKalau } = require("./butuh.cjs");

const ROOT = path.resolve(__dirname, "..");
const A = require("../agent/anggaran.ts");

const PS = path.join(
  process.env.SystemRoot || "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);

function alokasi(mb) {
  return "$a = New-Object byte[] " + mb * 1048576 + "; Write-Output $a.Length";
}

describeKalau(diWindows())("plafon sumber daya Windows (Job Object)", () => {
  const ac = require("../agent/tools/appcontainer-jail.ts");
  let siap = false;

  beforeAll(async () => {
    // Existence is not capability — the same lesson as the playwright and
    // Electron guards. A machine without the container profile prepared cannot
    // answer this question, and skipping is honest where a green tick is not.
    siap = (await ac.siapUntuk(ROOT)).siap;
  }, 120000);

  function jalan(cmd, denganPlafon) {
    const [EXE, args] = ac.bungkus(ROOT, PS, [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      cmd,
    ]);
    const env = { ...process.env, ...ac.envTambahan(ROOT) };
    if (!denganPlafon) for (const k of Object.values(A.JOB_ENV)) delete env[k];
    return new Promise((res) => {
      execFile(
        EXE,
        args,
        {
          encoding: "utf8",
          timeout: 90000,
          windowsHide: true,
          maxBuffer: 8 << 20,
          env,
        },
        (_err, so, se) =>
          res({ out: String(so || "").trim(), err: String(se || "") }),
      );
    });
  }

  test("envTambahan membawa ketiga plafon dari anggaran.ts", () => {
    const env = ac.envTambahan(ROOT);
    expect(env[A.JOB_ENV.mem]).toBe(String(A.JOB_MEM_MB));
    expect(env[A.JOB_ENV.proses]).toBe(String(A.JOB_MAKS_PROSES));
    expect(env[A.JOB_ENV.cpu]).toBe(String(A.JOB_CPU_DETIK));
    // LOCALAPPDATA must survive: without it CreateProcessW refuses to create an
    // AppContainer process at all, with a code that names no variable.
    expect(env.LOCALAPPDATA).toBeTruthy();
  });

  test("alokasi DI BAWAH plafon tidak terpengaruh", async () => {
    if (!siap) return;
    const mb = Math.floor(A.JOB_MEM_MB / 2);
    const r = await jalan(alokasi(mb), true);
    expect(r.out).toBe(String(mb * 1048576));
  }, 180000);

  test("alokasi DI ATAS plafon ditolak — dan lolos tanpa plafon", async () => {
    if (!siap) return;
    const mb = Math.round(A.JOB_MEM_MB * 1.4);

    // The control first. If this one fails too, the refusal below proves
    // nothing — it would just mean the machine could not allocate that much.
    const tanpa = await jalan(alokasi(mb), false);
    expect(tanpa.out).toBe(String(mb * 1048576));

    const dengan = await jalan(alokasi(mb), true);
    expect(dengan.out).not.toBe(String(mb * 1048576));
    expect(dengan.err).toMatch(/OutOfMemory/i);
  }, 240000);
});
