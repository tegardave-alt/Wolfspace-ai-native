// ── The agent run, orchestrated by the Python LangGraph worker ──
//
// This is the piece that makes Phase 10 real: services/agent-python owns the
// state machine, and everything it needs done is done here. It presents the same
// surface as selfAgentStream in agent/self_agent.cjs — (payload, emit, ctl) —
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
// HONEST ABOUT WHAT THIS IS NOT, YET
//
// agent/self_agent.cjs carries far more than a graph: hallucination guards that
// check claims against evidence, stall detection, retry-with-a-different-
// provider, HITL approval, the findings journal. None of that is here. The graph
// in services/agent-python is the SHAPE of the loop, not a replacement for those
// guards, and calling this path a drop-in replacement today would be a claim the
// code does not support.
//
// So the JS agent stays the default. This path runs when it is asked for, by
// name — see WOLFSPACE_AGENT_PY in selfAgentStreamPython below.

import * as path from "path";

const worker = require("./python-worker.ts");
// Resolved at CALL time rather than destructured at load.
//
// electron/main.js drops the whole project require.cache on every hot reload,
// and the agent edits its own source, so it triggers that itself. A binding
// captured at load would keep calling into the module instance that was
// discarded — stale code that only shows up after an edit. This is the same
// reason appcontainer-jail keeps its state on globalThis.
const tools = () => require("./tools.cjs");
const cloud_ = () => require("./cloud.cjs");
const { dlog } = require("./debug.cjs");

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
): Promise<ToolAnswer> {
  const messages = args?.messages || [];
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
async function pseudoValidate(args: any): Promise<ToolAnswer> {
  const messages = args?.messages || [];
  let summary = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "assistant" && m.content) {
      summary = String(m.content);
      break;
    }
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
 * in self_agent.cjs, which is a separate extraction from this wiring.
 */
async function pseudoPlan(args: any): Promise<ToolAnswer> {
  return { ok: true, messages: [], checklist: [] };
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

  const onTool = async (name: string, args: any): Promise<ToolAnswer> => {
    if (name === "__model__") return pseudoModel(cloud, args, toolDefs);
    if (name === "__validate__") return pseudoValidate(args);
    if (name === "__plan__") return pseudoPlan(args);

    // A real tool. Same function, same sandbox, same ledger as the JS agent.
    const r = await tools().runSelfTool(name, args, emit, agentCtx);
    return {
      ok: !!(r && r.ok),
      output: String((r && r.output) ?? ""),
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
