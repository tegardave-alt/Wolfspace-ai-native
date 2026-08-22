// Wire shapes emitted by the two streaming channels, as they actually exist in
// the running code — not as they were once designed. Field names (t, c, m, ...)
// match the wire format verbatim; this describes what ships, it does not redesign
// it. Redesign happens when callers migrate to TypeScript, not here.
//
// tests/kontrak-agent-events.test.js keeps this file honest: it extracts the
// emitted event names from the backend and compares them against the unions
// below, so a new backend event cannot land without appearing here.

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority?: "high" | "medium" | "low";
}

export interface HitlRequestPayload {
  title: string;
  code: string;
}

/**
 * Events on the "chat" stream channel (core.chatStream -> agent/chat.cjs).
 * The full set: chat.cjs emits exactly these three and nothing else.
 */
export type ChatStreamEvent =
  { t: "tok"; c: string } | { t: "done" } | { t: "err"; m: string };

/**
 * Events on the "self-agent" stream channel (core.selfAgentStream ->
 * agent/self_agent.cjs + agent/tools/index.cjs). Most variants may carry
 * thread_id: the run is a LangGraph checkpoint, so a reload can resume it
 * instead of restarting.
 */
export type SelfAgentStreamEvent =
  | { t: "backup"; dir: string; thread_id?: string }
  | { t: "model_wait"; m: string; thread_id?: string }
  | { t: "force_retry"; m: string; thread_id?: string }
  | { t: "todos"; todos: TodoItem[]; thread_id?: string }
  | { t: "step"; n: number | string; thread_id?: string }
  | { t: "tok"; c: string; thread_id?: string }
  | {
      t: "thought";
      tool?: string;
      c: string;
      ok?: boolean;
      thread_id?: string;
    }
  | {
      t: "act";
      kind: string;
      arg: unknown;
      ok: boolean;
      output: string;
      path?: string;
      thread_id?: string;
    }
  | { t: "hitl"; request: HitlRequestPayload; thread_id: string }
  | { t: "ask"; question?: string; choices?: string[]; thread_id?: string }
  | {
      t: "adone";
      hitlPending?: boolean;
      continuable?: boolean;
      summary?: string;
      edits?: number;
      backup?: string;
      thread_id?: string;
    }
  | { t: "err"; m: string };

export type AgentStreamEvent = ChatStreamEvent | SelfAgentStreamEvent;

// There is deliberately no list of "dead" events here any more.
//
// An earlier version of this file typed `phase`, `retry`, and `run` as
// receivable. No live backend code emitted any of them: they were handler
// branches in public/app.jsx left over from removed features, and the contract
// test below is what exposed that. Those branches have since been deleted — the
// phaseNodes subsystem, the run/retry arms of streamChat, and the orphaned
// public/services/api.js that carried its own copy — so the unions above are now
// the whole truth, and the test holds them to it in both directions.
