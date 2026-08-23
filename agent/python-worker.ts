// ── The host side of the Python LangGraph worker ──
//
// WHAT THIS IS. services/agent-python holds the agent's state machine; this file
// is the other end of its line protocol. It owns the process, the framing, and
// the routing — and nothing about what the agent decides. That split is the
// whole point of Phase 10 and it is described in services/agent-python/README.md:
//
//   Python                              TypeScript
//   ------                              ----------
//   graph, state, routing      <-->     tools, sandbox, broker, MCP
//   checkpointer / HITL                 model calls, streaming to the UI
//
// So this module never decides anything. When the worker asks for a tool, the
// answer comes from agent/tools — the same runSelfTool the JS agent calls, with
// the same AppContainer, broker and audit ledger behind it. Re-implementing any
// of that in Python would throw away the part of this repo that is hardest to
// get right.
//
// WHY A LONG-LIVED PROCESS. One spawn per run would pay Python startup on every
// message, and worse, it would drop the checkpointer: a run paused for human
// approval keeps its state in the worker's MemorySaver, and resume would then
// find nothing. The worker stays up and multiplexes runs by `id`.
//
// WHAT IS DELIBERATELY NOT HERE. No fallback that quietly runs the JS agent when
// the worker dies. A silent fallback would make "the Python path works" untestable
// — every failure would look like success. Failure surfaces as an `err` event.

import {
  spawn,
  execFileSync,
  type ChildProcessWithoutNullStreams,
} from "child_process";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const APP = path.join(ROOT, "services", "agent-python", "app.py");

/** Protocol version this host speaks. Must match PROTOCOL_VERSION in protocol.py. */
export const PROTOCOL_VERSION = 1;

/**
 * How long a worker may stay silent after a start before the run is failed.
 *
 * Generous on purpose: a first run pays Python startup plus the LangGraph
 * import, measured at just over a second cold, and a model call inside a node
 * can legitimately take a minute. This is a liveness bound, not a run budget.
 */
const READY_TIMEOUT_MS = 30000;

/**
 * Resolve a Python interpreter that can actually run the worker.
 *
 * The requirement is not "a Python" but "a Python that can import langgraph",
 * and those are different answers on this machine. agent/safe-edit.cjs picks the
 * bundled uv interpreter, which is right for a syntax check because that needs
 * no dependencies. Copying that rule here spawned the worker against uv's
 * 3.12.10, which has no langgraph, while the system 3.11.9 does — so the worker
 * could never have started, and the transport tests skipped instead of failing.
 *
 * So each candidate is PROBED rather than assumed. The answer is cached: the
 * probe costs a process spawn and the set of installed interpreters does not
 * change while the app runs.
 */
let _binCache: string | null = null;
export function pythonBin(): string {
  if (_binCache) return _binCache;

  const bundled =
    process.env.APPDATA &&
    path.join(
      process.env.APPDATA,
      "uv",
      "python",
      "cpython-3.12.10-windows-x86_64-none",
      "python.exe",
    );

  // An explicit setting wins and is NOT probed: someone naming an interpreter
  // should get that one, with a real error if it is wrong, rather than being
  // silently redirected to another.
  if (process.env.WOLFSPACE_PYTHON) {
    _binCache = process.env.WOLFSPACE_PYTHON;
    return _binCache;
  }

  const candidates = ["python", "python3", bundled].filter(Boolean) as string[];
  for (const bin of candidates) {
    try {
      execFileSync(bin, ["-c", "import langgraph"], {
        stdio: "ignore",
        timeout: 30000,
        windowsHide: true,
      });
      _binCache = bin;
      return bin;
    } catch (_) {
      /* try the next candidate */
    }
  }

  // Nothing satisfied the requirement. Return the first candidate anyway so the
  // caller fails with the interpreter's own message, which names what is
  // missing — more useful than this module inventing "no python found".
  _binCache = candidates[0] || "python";
  return _binCache;
}

type Line = Record<string, any>;

/**
 * A live worker process plus its framing.
 *
 * Held at module scope rather than per run: see WHY A LONG-LIVED PROCESS above.
 * `null` means not started yet or dead; the next run starts a fresh one, which
 * is also the recovery path — there is no retry loop, because a worker that
 * cannot start will not start on the second attempt either, and hiding that
 * behind retries is exactly how a broken agent path looks healthy.
 */
let _proc: ChildProcessWithoutNullStreams | null = null;
let _ready: Promise<void> | null = null;

/** Per-run handlers, keyed by run id. One entry per in-flight run. */
const _runs = new Map<string, RunHandlers>();

interface RunHandlers {
  onEvent: (payload: any) => void;
  onTool: (name: string, args: any) => Promise<any>;
  onDone: () => void;
  onProtocol?: (msg: Line) => void;
}

function _send(msg: Line): void {
  if (!_proc || _proc.killed) return;
  try {
    _proc.stdin.write(JSON.stringify(msg) + "\n");
  } catch (_) {
    // A dead pipe is reported through the run's own error path, not thrown
    // here: this is called from inside message handling.
  }
}

/**
 * Start the worker if it is not already up, and resolve once it says `ready`.
 *
 * stderr is NOT swallowed. protocol.py redirects Python's own stdout to stderr
 * precisely so a stray print cannot corrupt the protocol stream, which means
 * stderr is where real diagnostics live. Dropping it would turn every worker
 * problem into silence.
 */
export function ensureWorker(onStderr?: (text: string) => void): Promise<void> {
  if (_proc && !_proc.killed && _ready) return _ready;

  _ready = new Promise<void>((resolve, reject) => {
    let settled = false;
    const bin = pythonBin();
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(bin, [APP], {
        cwd: path.dirname(APP),
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      }) as ChildProcessWithoutNullStreams;
    } catch (e: any) {
      return reject(
        new Error(`cannot start python worker (${bin}): ${e.message}`),
      );
    }
    _proc = child;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `python worker did not report ready in ${READY_TIMEOUT_MS}ms`,
        ),
      );
    }, READY_TIMEOUT_MS);

    let buf = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg: Line;
        try {
          msg = JSON.parse(line);
        } catch (_) {
          // The worker owns this channel and only writes JSON. A line that does
          // not parse means something else got in, which is worth surfacing
          // rather than dropping.
          onStderr?.(
            "[worker] unparseable protocol line: " + line.slice(0, 200),
          );
          continue;
        }
        if (msg.type === "ready" && !settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
          continue;
        }
        _dispatch(msg);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => onStderr?.(chunk.toString()));

    child.on("exit", (code, signal) => {
      _proc = null;
      _ready = null;
      const why = `python worker exited (code ${code}, signal ${signal})`;
      // Every run still in flight is failed explicitly. Left alone they would
      // hang forever waiting for events from a process that is gone.
      for (const [id, h] of _runs) {
        h.onEvent({ t: "err", m: why });
        h.onDone();
        _runs.delete(id);
      }
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(why));
      }
    });

    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`python worker failed to spawn (${bin}): ${e.message}`));
    });
  });

  return _ready;
}

/** Route one inbound protocol line to the run it belongs to. */
function _dispatch(msg: Line): void {
  const id = String(msg.id || "");
  const h = _runs.get(id);

  if (!h) {
    // Protocol-level chatter (`__proto__`) and late messages from a finished
    // run both land here. Neither is an error.
    return;
  }

  switch (msg.type) {
    case "event":
      h.onEvent(msg.payload || {});
      return;

    case "tool": {
      const call = String(msg.call || "");
      // Deliberately not awaited: a tool can take minutes, and blocking this
      // handler would stall every other run's messages on the same stdout.
      Promise.resolve()
        .then(() => h.onTool(String(msg.name || ""), msg.args || {}))
        .then((result) => {
          _send({
            v: PROTOCOL_VERSION,
            id,
            type: "tool_result",
            call,
            ...result,
          });
        })
        .catch((e: any) => {
          // A thrown tool is answered as a FAILED tool, not dropped. The graph
          // already knows how to route around a tool that failed; a dropped
          // answer would leave the node blocked until its own timeout.
          _send({
            v: PROTOCOL_VERSION,
            id,
            type: "tool_result",
            call,
            ok: false,
            error: String(e?.message || e),
          });
        });
      return;
    }

    case "trace":
      // The worker sends a traceback alongside its err event. Surfaced through
      // the same event channel so it reaches whoever is looking at the run.
      h.onProtocol?.(msg);
      return;

    case "done":
      _runs.delete(id);
      h.onDone();
      return;

    default:
      h.onProtocol?.(msg);
  }
}

/**
 * Drive one agent run through the Python graph.
 *
 * Resolves when the worker reports the run finished. Rejects only if the worker
 * could not be started at all — a failure INSIDE a run arrives as an `err`
 * event, because that is the shape the UI already handles.
 */
export function runOnWorker(
  runId: string,
  payload: any,
  handlers: {
    onEvent: (payload: any) => void;
    onTool: (name: string, args: any) => Promise<any>;
    onStderr?: (text: string) => void;
    isCancelled?: () => boolean;
  },
): Promise<void> {
  return ensureWorker(handlers.onStderr).then(
    () =>
      new Promise<void>((resolve) => {
        let cancelPoll: NodeJS.Timeout | null = null;

        _runs.set(runId, {
          onEvent: handlers.onEvent,
          onTool: handlers.onTool,
          onProtocol: (msg) => {
            if (msg.type === "trace" && msg.text) {
              handlers.onStderr?.("[worker trace] " + String(msg.text));
            }
          },
          onDone: () => {
            if (cancelPoll) clearInterval(cancelPoll);
            resolve();
          },
        });

        _send({ v: PROTOCOL_VERSION, id: runId, type: "start", payload });

        // Cancellation is cooperative by design: the worker sets a flag its
        // nodes see at their next guard and the graph leaves through its own
        // END edges, so the checkpoint stays usable. Killing the process would
        // leave a half-written checkpoint that resume would read back.
        if (handlers.isCancelled) {
          cancelPoll = setInterval(() => {
            if (handlers.isCancelled!()) {
              _send({ v: PROTOCOL_VERSION, id: runId, type: "cancel" });
              if (cancelPoll) clearInterval(cancelPoll);
              cancelPoll = null;
            }
          }, 500);
        }
      }),
  );
}

/** Ask the worker to answer, for a health check. Resolves false on timeout. */
export function ping(timeoutMs = 5000): Promise<boolean> {
  return ensureWorker()
    .then(
      () =>
        new Promise<boolean>((resolve) => {
          const id = "__ping__" + Date.now();
          const timer = setTimeout(() => {
            _runs.delete(id);
            resolve(false);
          }, timeoutMs);
          _runs.set(id, {
            onEvent: () => {},
            onTool: async () => ({ ok: false }),
            onDone: () => {},
            onProtocol: (msg) => {
              if (msg.type === "pong") {
                clearTimeout(timer);
                _runs.delete(id);
                resolve(true);
              }
            },
          });
          _send({ v: PROTOCOL_VERSION, id, type: "ping" });
        }),
    )
    .catch(() => false);
}

/** Stop the worker. Used by tests and by shutdown; safe to call when not running. */
export function stopWorker(): void {
  if (_proc && !_proc.killed) {
    try {
      _proc.kill();
    } catch (_) {}
  }
  _proc = null;
  _ready = null;
  _runs.clear();
}

/** True while a worker process is up. */
export function isRunning(): boolean {
  return !!(_proc && !_proc.killed);
}

module.exports = {
  PROTOCOL_VERSION,
  pythonBin,
  ensureWorker,
  runOnWorker,
  ping,
  stopWorker,
  isRunning,
};
