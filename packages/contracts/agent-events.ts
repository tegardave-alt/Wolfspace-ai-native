// agent-events.ts — the shapes that actually cross the two streaming channels
// between backend and renderer.
//
// ROLE IN THE SYSTEM. It DESCRIBES the live wire format, it does not redesign
// it: the terse field names (t, c, m, ...) are verbatim, because renaming one
// would break the renderer. Redesign happens when callers migrate, not here.
//
// tests/kontrak-agent-events.test.js keeps it honest by extracting the event
// names the backend really emits and comparing them with the unions below, so a
// new backend event cannot land without appearing here.
//
// CONNECTS TO
//   used by  packages/contracts/ipc.ts, and through it electron/preload.ts

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
 * agent/self_agent.ts + agent/tools/index.cjs). Most variants may carry
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
  /**
   * Token accounting for the run so far, emitted after every model call.
   *
   * NOT the same thing as `tok`, despite the name: that one carries a chunk of
   * streamed TEXT, this one carries the provider's own usage report. The counts
   * are already summed across the run's steps.
   *
   * Absent entirely when the provider reports no usage — an OpenAI-compatible
   * endpoint that ignores stream_options, for instance. A zero would read as a
   * free turn, so nothing is emitted rather than a number nobody can trust.
   *
   * `anggaran` is the effort mode's Context Token Budget, which the agent
   * already states in the system prompt. It is deliberately not a model context
   * window: this repo has no honest table of those.
   */
  | {
      t: "usage";
      masuk: number;
      keluar: number;
      cacheBaca?: number;
      cacheTulis?: number;
      panggilan: number;
      model?: string;
      provider?: string;
      anggaran?: number;
      /**
       * The figures are ESTIMATED, not the provider's own.
       *
       * True while a call is still streaming: exact usage does not exist until
       * a request finishes, so the live count is derived from bytes sent and
       * characters received. A settled report replaces it, and the UI marks
       * the difference so an estimate is never read as a measurement.
       */
      taksiran?: boolean;
      thread_id?: string;
    }
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
  | {
      // A restorable snapshot, taken before each edit by agent/tools/index.ts.
      // NOT the same as t:"backup", which carries a _agent_backups directory
      // that POST /api/rollback cannot restore — see _emitCheckpoint there.
      t: "checkpoint";
      id: string;
      label?: string;
      files?: number;
      thread_id?: string;
    }
  | { t: "hitl"; request: HitlRequestPayload; thread_id: string }
  | {
      t: "ask";
      question?: string;
      choices?: string[];
      /**
       * A structured form, when the agent needs several answers at once.
       * Normalised in agent/tools/index.ts BEFORE it is emitted — the model
       * chooses what to ask, never how it is drawn.
       */
      fields?: {
        name: string;
        label: string;
        type: "text" | "number" | "select" | "boolean";
        options?: string[];
        required?: boolean;
        placeholder?: string;
      }[];
      thread_id?: string;
    }
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
