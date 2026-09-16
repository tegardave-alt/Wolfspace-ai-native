// The agent can push, pull, sync, publish and clone when the user asks --
// and never without the user's approval.
//
// WHAT THIS IS. The `git` tool used to have "NO network operations": it ran
// git with no credential, so a push could only hang or fail, and the only
// way to give the model a credential would have been to hand it the token.
// The panel's credential helper changed that -- git receives the connected
// account's token at the moment it asks, the model never holds it -- and
// the panel's own implementation (core/git-remote.ts) is now what the tool
// calls. What is proven here, on the real graph with a scripted model and a
// real bare remote:
//
//   1. a push the model asks for is HELD for approval; the remote does not
//      move;
//   2. approved, the same push lands on the remote;
//   3. clone through the tool creates the folder under the workspace, and
//      refuses to overwrite.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
jest.setTimeout(180000);

const git = (cwd: string, a: string[]) =>
  execFileSync("git", a, { cwd, stdio: "pipe", encoding: "utf8" }).trim();

function modelSkrip(langkah: any[]) {
  let i = 0;
  return async () => {
    const s = langkah[Math.min(i, langkah.length - 1)];
    i++;
    if (typeof s === "string") return { role: "assistant", content: s };
    return {
      role: "assistant",
      content: "",
      tool_calls: s.map((c: any, k: number) => ({
        id: "call_" + i + "_" + k,
        type: "function",
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })),
    };
  };
}

let tmp = "";
let ws = "";
let remote = "";

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-agent-git-"));
  ws = path.join(tmp, "ws");
  remote = path.join(tmp, "remote.git");
  git(tmp, ["init", "-q", "--bare", "-b", "main", remote]);
  fs.mkdirSync(ws);
  git(ws, ["init", "-q", "-b", "main"]);
  git(ws, ["config", "user.email", "a@b.c"]);
  git(ws, ["config", "user.name", "uji"]);
  fs.writeFileSync(path.join(ws, "a.txt"), "1");
  git(ws, ["add", "."]);
  git(ws, ["commit", "-qm", "awal"]);
  git(ws, ["remote", "add", "origin", remote]);
  git(ws, ["push", "-q", "-u", "origin", "main"]);
  // One local commit the remote does not have.
  fs.writeFileSync(path.join(ws, "b.txt"), "2");
  git(ws, ["add", "."]);
  git(ws, ["commit", "-qm", "lokal"]);
});

afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (_) {}
});

async function jalankan(tujuan: string, langkah: any[], extra: any = {}) {
  jest.resetModules();
  const cloud = require(path.join(AKAR, "agent", "cloud.ts"));
  cloud.askCloudTools = modelSkrip(langkah);
  const perencana = require(path.join(AKAR, "agent", "perencana-agent.ts"));
  perencana.rencanakan = async (c: any) => ({ cloud: c, checklist: [] });
  const sa = require(path.join(AKAR, "agent", "self_agent.ts"));
  const events: any[] = [];
  await sa.selfAgentStream(
    {
      history: [{ role: "user", content: tujuan }],
      cloud: { provider: "uji", model: "uji", key: "x" },
      workspace_root: ws,
      thread_id: extra.thread_id || "agentgit_" + Date.now(),
      ...extra,
    },
    (e: any) => events.push(e),
    { isCancelled: () => false, setCurReq: () => {}, depth: 0 },
  );
  return events;
}

describe("push through the agent", () => {
  test("is held for approval; the remote does not move", async () => {
    const sebelum = git(remote, ["rev-parse", "main"]);
    const ev = await jalankan("Push my commits to GitHub.", [
      [{ name: "git", args: { operasi: "push" } }],
      "Pushed.",
    ]);
    const hitl = ev.find((e) => e.t === "hitl");
    expect(hitl).toBeTruthy();
    expect(hitl.request.title).toMatch(/git/);
    expect(hitl.request.code).toMatch(/"operasi": "push"/);
    expect(git(remote, ["rev-parse", "main"])).toBe(sebelum);
  });

  test("approved, the same push lands on the remote", async () => {
    const sebelum = git(remote, ["rev-parse", "main"]);
    const thread_id = "agentgit_setuju_" + Date.now();
    await jalankan(
      "Push my commits to GitHub.",
      [[{ name: "git", args: { operasi: "push" } }], "Pushed."],
      { thread_id },
    );
    // The user presses Allow: the run resumes on the same thread and the
    // pending call runs for real.
    const ev = await jalankan("", ["Pushed."], {
      thread_id,
      hitl_response: true,
    });
    expect(ev.some((e) => e.t === "act" && e.kind === "hitl_approved")).toBe(
      true,
    );
    const sesudah = git(remote, ["rev-parse", "main"]);
    expect(sesudah).not.toBe(sebelum);
    expect(sesudah).toBe(git(ws, ["rev-parse", "main"]));
    const act = ev.find((e) => e.t === "act" && e.kind === "git");
    expect(act && act.ok).toBe(true);
    expect(String(act.output)).toMatch(/push ok/);
  });
});

describe("clone through the agent", () => {
  test("creates the folder under the workspace, and refuses to overwrite", async () => {
    // Clone the bare remote itself: a real repository, no network needed.
    const url = "file:///" + remote.replace(/\\/g, "/");
    const thread_id = "agentgit_clone_" + Date.now();
    await jalankan(
      "Clone " + url + " into a folder named salinan.",
      [
        [{ name: "git", args: { operasi: "clone", url, tujuan: "salinan" } }],
        "Done.",
      ],
      { thread_id },
    );
    const ev = await jalankan("", ["Done."], {
      thread_id,
      hitl_response: true,
    });
    const act = ev.find((e) => e.t === "act" && e.kind === "git");
    expect(act && act.ok).toBe(true);
    expect(fs.existsSync(path.join(ws, "salinan", ".git"))).toBe(true);
    expect(fs.existsSync(path.join(ws, "salinan", "a.txt"))).toBe(true);

    // Again: the folder exists, so the module refuses before git runs.
    const G = require(path.join(AKAR, "agent", "tools", "git-tool.ts"));
    const r = await G.jalankan(
      { operasi: "clone", url, tujuan: "salinan" },
      ws,
    );
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/already exists/);
  });

  test("a folder name that escapes the workspace is refused", async () => {
    const G = require(path.join(AKAR, "agent", "tools", "git-tool.ts"));
    const url = "file:///" + remote.replace(/\\/g, "/");
    const r = await G.jalankan(
      { operasi: "clone", url, tujuan: "../keluar" },
      ws,
    );
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/not a folder name/);
    expect(fs.existsSync(path.join(tmp, "keluar"))).toBe(false);
  });
});
