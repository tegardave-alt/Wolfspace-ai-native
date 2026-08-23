// ── The agent run, orchestrated by the Python LangGraph worker ──
//
// This is the piece that makes Phase 10 real: services/agent-python owns the
// state machine, and everything it needs done is done here. It presents the same
// surface as selfAgentStream in agent/self_agent.ts — (payload, emit, ctl) —
// so a caller can be pointed at either without knowing which one it got.
//
// WHAT MOVES AND WHAT DOES NOT
//
//   Python                    here
//   ------                    ----
//   which node runs next      what a node's work actually is
//   step ceiling, routing     the model call, the tool call
//   checkpoint for resume     the sandbox, broker, MCP, audit ledger
//
// The graph asks for four things. Three are pseudo-tools that only the host can
// answer because they need a model: `__plan__`, `__model__`, `__validate__`.
// Everything else is a real tool name and goes to runSelfTool — the SAME
// function the JS agent calls, so a tool runs inside the same AppContainer, the
// same broker, and lands in the same audit ledger no matter which orchestrator
// asked for it. That is the property worth protecting; an agent whose security
// boundary depends on which code path invoked it would be no boundary at all.
//
// WHERE PARITY WITH THE JS LOOP STANDS
//
// The guards are not reimplemented here. They live in agent/penjaga-agent.ts and
// BOTH orchestrators call them, because a guard on only one of two agent paths
// makes the same request behave differently depending on who handled it.
//
//   carried here now          how
//   ----------------          ---
//   approval gate             penjaga.perluPersetujuan, before any tool runs
//   evidence check            penjaga.buktiSahih, on the final answer
//   repeat backstop           penjaga.kunciPanggilan + melewatiBatasUlang
//   model heartbeat           model_wait events during a long call
//   planner checklist         perencana.rencanakan, the SAME call the JS loop
//                             makes — including its provider fallback
//   transient retry           already inside askCloudTools; NOT duplicated here
//
//   NOT here yet              why it is not merely missing
//   -----------               ---------------------------
//   HITL resume               the graph must carry hitlApproved back in; today
//                             the call is refused with a reason instead
//   findings journal          crosses process restarts; a separate extraction
//
// So the JS agent stays the default. This path runs when it is asked for, by
// name — see WOLFSPACE_AGENT_PY in pythonAgentEnabled below. Making it the
// default is a decision for when the remaining three are closed, not before.

import * as path from "path";

const worker = require("./python-worker.ts");
const penjaga = require("./penjaga-agent.ts");
// Resolved at CALL time rather than destructured at load.
//
// electron/main.js drops the whole project require.cache on every hot reload,
// and the agent edits its own source, so it triggers that itself. A binding
// captured at load would keep calling into the module instance that was
// discarded — stale code that only shows up after an edit. This is the same
// reason appcontainer-jail keeps its state on globalThis.
const tools = () => require("./tools.cjs");
const cloud_ = () => require("./cloud.ts");
const { dlog } = require("./debug.ts");

/** A tool result in the shape the worker's `call_tool` expects back. */
interface ToolAnswer {
  ok: boolean;
  output?: string;
  error?: string;
  edited?: boolean;
  target?: string;
  bytes?: number;
  [k: string]: any;
}

/**
 * Ask the model for the next assistant message.
 *
 * Returns the message inside a `messages` array because that is what the graph's
 * executor node merges into state — the reducer appends, so handing back one
 * message is how a turn advances.
 */
async function pseudoModel(
  cloud: any,
  args: any,
  toolDefs: any[],
  emit: (e: any) => void,
): Promise<ToolAnswer> {
  const messages = args?.messages || [];

  // A heartbeat while the model thinks.
  //
  // Without it a long call is indistinguishable from a hang. Measured on the JS
  // path: model calls of 64 seconds and MCP startup of 60 are both normal, and
  // for that whole time the UI showed nothing moving — which reads as "the run
  // died", not as "the run is working". The `model_wait` event is the one the
  // frontend already handles, so this needs no UI change.
  const t0 = Date.now();
  const hb = setInterval(() => {
    emit({
      t: "model_wait",
      m:
        "Still waiting for the model (" +
        Math.round((Date.now() - t0) / 1000) +
        "s)…",
    });
  }, 10000);

  try {
    // Retrying a transient failure is NOT done here: askCloudTools already
    // retries three times on transport-shaped errors. A second retry loop around
    // it would multiply the attempts rather than add resilience, and turn a
    // 3-attempt budget into 9 without anyone choosing that.
    const msg = await cloud_().askCloudTools(cloud, messages, toolDefs);
    return {
      ok: true,
      messages: [
        {
          role: "assistant",
          content: (msg && msg.content) || "",
          reasoning: (msg && msg.reasoning) || "",
          tool_calls: (msg && msg.tool_calls) || [],
        },
      ],
    };
  } finally {
    clearInterval(hb);
  }
}

/**
 * Decide whether the run is finished.
 *
 * Deliberately thin, and deliberately NOT a second model call. The graph already
 * routes to validate only when the model answered without tool calls, which is
 * the model saying it is done. Asking a model to confirm that would pay a full
 * round trip to re-derive something already known, and would introduce a second
 * opinion that can disagree with the first — a failure mode with no good
 * resolution.
 *
 * The last assistant message is the summary because it IS the answer; there is
 * nothing else it could be.
 */
async function pseudoValidate(
  args: any,
  bukti: Set<string>,
): Promise<ToolAnswer> {
  const messages = args?.messages || [];
  let summary = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "assistant" && m.content) {
      summary = String(m.content);
      break;
    }
  }

  // ── The answer has to stand on the evidence the tools produced ──
  //
  // The same check the JS loop applies, from the same function, so an answer
  // accepted by one orchestrator is accepted by the other. It does not demand
  // that the model quote tool output; naming a path or reusing a distinctive
  // term from the evidence is enough. What it catches is an answer invented
  // wholesale after tools ran and returned something else.
  //
  // Not finishing sends the graph back to the executor with the objection in the
  // conversation, which is the shape the routing already has — rather than
  // failing the run, which would throw away work that was mostly right.
  if (!penjaga.buktiSahih(summary, bukti)) {
    return {
      ok: true,
      finished: false,
      messages: [
        {
          role: "user",
          content:
            "Your answer does not refer to anything the tools actually returned. " +
            "Ground it in that output — name the file, the line, or the value you " +
            "found — or say plainly that you could not determine it.",
        },
      ],
    };
  }

  return { ok: true, finished: true, summary };
}

/**
 * Produce a task checklist before the first executor turn.
 *
 * Returns an empty plan for now, and says so rather than pretending: the graph
 * routes to the planner only for what looks like a code task, and an empty
 * checklist there is a valid state the routing already handles (route_start
 * checks `len(checklist) == 0`). Filling it needs the planning prompt that lives
 * in self_agent.ts, which is a separate extraction from this wiring.
 */
async function pseudoPlan(args: any, cloud: any): Promise<ToolAnswer> {
  // This used to `return { ok: true, messages: [], checklist: [] }` — always
  // empty. The graph accepted it, the run continued, and nothing anywhere said
  // the plan was missing.
  //
  // That absence is not cosmetic. The checklist is the ground truth re-injected
  // into the system message at every step: it is what stops the agent redoing
  // finished work, and since failures are recorded against ITEMS, it is also
  // what carries "already tried, already failed" without the model needing to
  // remember it. Answering with nothing meant the Python path lost the anchor
  // exactly where a long run needs it most.
  //
  // Now it calls the same planner the JS loop calls, so the two orchestrators
  // cannot produce different plans for the same request.
  const perencana = require("./perencana-agent.ts");
  const pesan = Array.isArray(args?.messages) ? args.messages : [];
  const terakhir = pesan.length ? pesan[pesan.length - 1] : null;

  const hasil = await perencana.rencanakan(
    cloud,
    String((terakhir && terakhir.content) || ""),
    (level: string, pesanLog: string, data: any) =>
      dlog("python-agent", level, pesanLog, data),
  );

  // `messages` stays empty on purpose: the graph appends whatever comes back,
  // and the JS planner contributes no message either — only the checklist.
  return { ok: true, messages: [], checklist: hasil.checklist };
}

/**
 * Run one agent turn through the Python graph.
 *
 * Signature matches selfAgentStream(payload, emit, ctl) so the two are
 * interchangeable at the call site.
 */
export async function selfAgentStreamPython(
  payload: any,
  emit: (event: any) => void,
  ctl: any = {},
): Promise<void> {
  const threadId =
    payload?.thread_id ||
    "thread_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

  // Per-workspace confinement, resolved exactly as the JS agent resolves it: a
  // path that is not a real directory means unconfined, not an error. Diverging
  // here would give the two orchestrators different security scopes for the same
  // request, which is the one difference that must never exist.
  let wsRoot: string | null = null;
  if (payload?.workspace_root) {
    try {
      const rp = path.resolve(payload.workspace_root);
      if (require("fs").statSync(rp).isDirectory()) wsRoot = rp;
    } catch (_) {
      wsRoot = null;
    }
  }

  const agentCtx = { sessionId: threadId, workspaceRoot: wsRoot };
  const cloud = payload?.cloud;
  const toolDefs = [...tools().SELF_TOOLS];

  // What the tools actually returned this run, used to check the final answer.
  // Only SUBSTANTIVE output counts: an empty result, or one that says it found
  // nothing, is not evidence, and counting it would make the check demand the
  // model "cite" that absence.
  const bukti = new Set<string>();

  // How many times each identical call has been made. The backstop below is the
  // last resort for a loop whose output keeps changing and therefore slips past
  // every other check — it punishes stalling, not volume.
  const hitungan = new Map<string, number>();

  const onTool = async (name: string, args: any): Promise<ToolAnswer> => {
    if (name === "__model__") return pseudoModel(cloud, args, toolDefs, emit);
    if (name === "__validate__") return pseudoValidate(args, bukti);
    if (name === "__plan__") return pseudoPlan(args, cloud);

    // The absolute backstop against an endless loop, using the same key and the
    // same threshold as the JS loop so a call counted as a repeat by one
    // orchestrator is counted as a repeat by the other.
    const kunci = penjaga.kunciPanggilan({ name, args });
    const n = (hitungan.get(kunci) || 0) + 1;
    hitungan.set(kunci, n);
    if (penjaga.melewatiBatasUlang(n)) {
      return {
        ok: false,
        output:
          "STOPPED: `" +
          name +
          "` has been called with identical arguments " +
          n +
          " times without progress. Change the approach, or say what is blocking you.",
      };
    }

    // ── The approval gate, shared with the JS loop ──
    //
    // Same function, same decision: `bash` runs PowerShell on the host with
    // neither broker nor sandbox, so it needs a human. git is gated per
    // OPERATION, because gating it by name would ask for approval on `status`
    // and an approval asked for something trivial stops being read.
    //
    // Refused rather than paused, and that limit is deliberate rather than
    // hidden: the JS loop can collect an approval and re-run the same calls
    // with hitlApproved, which needs the graph to carry that flag back in.
    // Until then the model is told plainly why the call did not run, which it
    // can act on, and the UI is told through the `hitl` event it already
    // handles.
    if (penjaga.perluPersetujuan({ name, args })) {
      emit({ t: "hitl", kind: name, arg: args, reason: "needs approval" });
      return {
        ok: false,
        output:
          "REFUSED: `" +
          name +
          "` needs human approval and this orchestrator cannot collect one yet. Use a tool that runs inside the sandbox (sandbox_run) or the broker (capability_exec), or ask the user to run it.",
      };
    }

    // A real tool. Same function, same sandbox, same ledger as the JS agent.
    const r = await tools().runSelfTool(name, args, emit, agentCtx);
    const output = String((r && r.output) ?? "");

    // Evidence, for the answer check at the end. Only what a tool actually
    // found: a successful call that returned nothing is not something an answer
    // can stand on.
    if (r && r.ok && !penjaga.takSubstantif(output)) bukti.add(output);

    return {
      ok: !!(r && r.ok),
      output,
      edited: !!(r && r.edited),
      target: (r && r.target) || "",
      bytes: (r && r.bytes) || 0,
    };
  };

  await worker.runOnWorker(
    threadId,
    {
      history: payload?.history || [],
      task_checklist: payload?.task_checklist || [],
      thread_id: threadId,
    },
    {
      onEvent: (ev: any) => emit(ev),
      onTool,
      isCancelled: ctl?.isCancelled,
      onStderr: (text: string) =>
        dlog("agent-py", "info", "worker stderr", { text: text.slice(0, 400) }),
    },
  );
}

/**
 * Which orchestrator should run.
 *
 * Opt-in by name, and the default is unchanged. See the honesty note at the top
 * of this file: the Python graph is the loop's shape, not yet a replacement for
 * the guards the JS agent carries, so making it the default would be claiming
 * parity that has not been demonstrated.
 */
export function pythonAgentEnabled(): boolean {
  const v = String(process.env.WOLFSPACE_AGENT_PY || "").toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

module.exports = {
  selfAgentStreamPython,
  pythonAgentEnabled,
};
