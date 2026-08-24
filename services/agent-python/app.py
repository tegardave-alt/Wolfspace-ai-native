"""The worker process: reads NDJSON requests, drives the graph, writes events.

Long-lived, one process for many runs — the shape jedi_worker.py already uses in
this repo, and what the migration plan asks for: "a worker that stays alive, with
a health check, timeout, cancellation, and resource limits", not a spawn per
request.

WHAT THIS PROCESS MAY NOT DO. It never touches the filesystem, never spawns a
shell, and never opens a socket. When a node needs a tool it emits a `tool`
message and waits; the TypeScript host runs it inside the sandbox that already
exists and answers with `tool_result`. That is not a temporary arrangement — see
README.md.

Cancellation is cooperative rather than a kill: the host sends `cancel`, the run
sets stopReason, and the graph exits through its own END edges so the checkpoint
stays consistent. A killed process would leave a half-written checkpoint that
resume would then read back.
"""

from __future__ import annotations

import queue
import threading
import traceback
from typing import Any

from langgraph.checkpoint.memory import MemorySaver

import graph as graph_mod
from models import AgentState
from protocol import emit, emit_error, emit_event, read_lines

#: One checkpointer for the whole process, exactly as the JS side keeps its
#: MemorySaver on globalThis. Rebuilding it per request would drop the checkpoint
#: of a HITL-paused run, and resume would then never find it.
CHECKPOINTER = MemorySaver()


class Run:
    """One in-flight agent run, and the mailbox its tool results arrive on."""

    def __init__(self, run_id: str, payload: dict[str, Any]) -> None:
        self.id = run_id
        self.payload = payload
        self.cancelled = False
        self.inbox: queue.Queue[dict[str, Any]] = queue.Queue()
        self.pending: dict[str, queue.Queue[dict[str, Any]]] = {}
        self._next_call = 0

    def call_tool(
        self, name: str, args: dict[str, Any], timeout: float = 300.0
    ) -> dict[str, Any]:
        """Ask the host to run a tool, and block this node until it answers.

        Blocking is correct here: a graph node is a step in a state machine, and
        the next state genuinely depends on the result. Each run owns its own
        thread, so a blocked node never stalls another run or the reader loop.
        """
        self._next_call += 1
        call_id = f"{self.id}:c{self._next_call}"
        box: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=1)
        self.pending[call_id] = box
        emit(self.id, "tool", call=call_id, name=name, args=args)
        try:
            return box.get(timeout=timeout)
        except queue.Empty:
            # A timeout is reported as a failed tool, not as a dead run: the
            # graph already knows how to route around a tool that failed.
            return {"ok": False, "error": f"tool timeout after {timeout}s: {name}"}
        finally:
            self.pending.pop(call_id, None)

    def deliver(self, msg: dict[str, Any]) -> None:
        box = self.pending.get(str(msg.get("call") or ""))
        if box is not None:
            box.put(msg)


def _make_nodes(run: Run):
    """Build the four node functions for one run.

    Every one of them delegates: the model call and the tool execution both live
    on the TypeScript side. What the node contributes is the state update, which
    is the part LangGraph is here for.
    """

    def _guard(state: AgentState) -> dict[str, Any] | None:
        if run.cancelled:
            return {"stopReason": "cancelled"}
        return None

    def planner(state: AgentState) -> dict[str, Any]:
        stop = _guard(state)
        if stop:
            return stop
        emit_event(run.id, {"t": "step", "n": state.get("step", 1)})
        result = run.call_tool("__plan__", {"messages": state.get("messages", [])})
        if not result.get("ok"):
            return {"stopReason": "error", "finalSummary": str(result.get("error", ""))}
        return {
            "messages": result.get("messages", []),
            "task_checklist": result.get("checklist", []),
        }

    def executor(state: AgentState) -> dict[str, Any]:
        stop = _guard(state)
        if stop:
            return stop
        step = state.get("step", 1)
        emit_event(run.id, {"t": "step", "n": step})
        result = run.call_tool(
            "__model__",
            {"messages": state.get("messages", []), "step": step},
        )
        if not result.get("ok"):
            return {"stopReason": "error", "finalSummary": str(result.get("error", ""))}
        return {"messages": result.get("messages", [])}

    def tools(state: AgentState) -> dict[str, Any]:
        stop = _guard(state)
        if stop:
            return stop
        messages = state.get("messages") or []
        last = messages[-1] if messages else {}
        update: dict[str, Any] = {"step": state.get("step", 1) + 1}
        out_messages: list[dict[str, Any]] = []
        edits = 0
        edit_log: list[dict[str, Any]] = []
        failed: list[str] = []

        # Calls the host refused because they need a human. Collected rather than
        # acted on one by one: the run pauses once, with everything that is
        # waiting, instead of stopping on the first and hiding the rest.
        perlu_izin: list[dict[str, Any]] = []

        for call in last.get("tool_calls") or []:
            name = str(call.get("name") or "")
            result = run.call_tool(name, call.get("args") or {})
            ok = bool(result.get("ok"))
            if result.get("needs_approval"):
                perlu_izin.append({"name": name, "args": call.get("args") or {}})
                # Still emitted, so the timeline SHOWS what is waiting. Skipping
                # the event would leave the run looking as though it simply
                # stopped for no reason.
                emit_event(
                    run.id,
                    {
                        "t": "act",
                        "kind": name,
                        "arg": call.get("args"),
                        "ok": False,
                        "output": str(result.get("output", "")),
                    },
                )
                continue
            emit_event(
                run.id,
                {
                    "t": "act",
                    "kind": name,
                    "arg": call.get("args"),
                    "ok": ok,
                    "output": str(result.get("output", "")),
                },
            )
            out_messages.append(
                {"role": "tool", "name": name, "content": str(result.get("output", ""))}
            )
            if ok and result.get("edited"):
                edits += 1
                edit_log.append(
                    {
                        "tool": name,
                        "target": str(result.get("target", "")),
                        "ok": True,
                        "bytes": int(result.get("bytes", 0) or 0),
                    }
                )
            elif not ok:
                failed.append(name)

        update["messages"] = out_messages
        if edits:
            update["edits"] = edits
            update["editLog"] = edit_log
        if failed:
            update["failedTools"] = failed

        if perlu_izin:
            # PAUSED, not failed. The host asks the user, and a later run arrives
            # with hitl_approved set — route_start then sends it straight back to
            # the executor rather than replanning.
            #
            # Tools that did NOT need approval already ran above and their results
            # are in `messages`, so the work done before the pause is not thrown
            # away. That mirrors the JS loop, which executes the non-execution
            # calls (grep, read) so their output is available when the run
            # resumes.
            #
            # The summary deliberately avoids the word HITL: it means nothing to
            # the user, and the waiting state is already visible from the
            # approve/reject buttons. What is left is the useful fact — how many
            # commands.
            update["stopReason"] = "hitl"
            update["hitlPending"] = True
            update["pendingToolCalls"] = perlu_izin
            update["finalSummary"] = (
                f"{len(perlu_izin)} perintah perlu persetujuan Anda sebelum dijalankan."
            )
        return update

    def validate(state: AgentState) -> dict[str, Any]:
        stop = _guard(state)
        if stop:
            return stop
        result = run.call_tool(
            "__validate__",
            {"messages": state.get("messages", []), "editLog": state.get("editLog", [])},
        )
        if result.get("finished"):
            return {
                "stopReason": "finished",
                "finalSummary": str(result.get("summary", "")),
            }
        return {"messages": result.get("messages", [])}

    return planner, executor, tools, validate


def _run_graph(run: Run) -> None:
    """Drive one run to completion on its own thread."""
    try:
        planner, executor, tools, validate = _make_nodes(run)
        app = graph_mod.build(planner, executor, tools, validate, CHECKPOINTER)
        config = {
            "configurable": {"thread_id": run.payload.get("thread_id") or run.id},
            "recursion_limit": graph_mod.RECURSION_LIMIT,
        }
        initial: AgentState = {
            "messages": run.payload.get("history") or [],
            "step": 1,
            "task_checklist": run.payload.get("task_checklist") or [],
            # Carried in from the host so a resumed run skips the planner and goes
            # straight back to the executor (see route_start in graph.py): the
            # planning already happened before the pause, and redoing it would
            # discard the decision the human just made.
            "hitlApproved": bool(run.payload.get("hitl_approved")),
        }
        final = app.invoke(initial, config=config)
        emit_event(
            run.id,
            {
                "t": "adone",
                "summary": final.get("finalSummary", ""),
                "edits": final.get("edits", 0),
                "thread_id": config["configurable"]["thread_id"],
                # The step ceiling pauses rather than fails, so the host can
                # offer "continue" instead of presenting it as an error.
                "continuable": final.get("stopReason") not in ("finished", "error"),
            },
        )
    except Exception as exc:  # noqa: BLE001 - a run must never kill the worker
        emit_error(run.id, f"{type(exc).__name__}: {exc}")
        emit(run.id, "trace", text=traceback.format_exc()[-2000:])
    finally:
        emit(run.id, "done")
        RUNS.pop(run.id, None)


RUNS: dict[str, Run] = {}


def main() -> None:
    emit("__proto__", "ready", version=1)
    for msg in read_lines():
        kind = msg.get("type")
        run_id = str(msg.get("id") or "")

        if kind == "ping":
            emit(run_id or "__proto__", "pong")
            continue

        if kind == "start":
            if run_id in RUNS:
                emit_error(run_id, "run id already in flight")
                continue
            run = Run(run_id, msg.get("payload") or {})
            RUNS[run_id] = run
            threading.Thread(target=_run_graph, args=(run,), daemon=True).start()
            continue

        run = RUNS.get(run_id)
        if run is None:
            # Late or unknown: reported, never fatal. A tool_result can arrive
            # after its run already ended.
            emit(run_id or "__proto__", "unknown_run", of=kind)
            continue

        if kind == "tool_result":
            run.deliver(msg)
        elif kind == "cancel":
            # Cooperative: the nodes see it at their next guard and the graph
            # leaves through its own END edges, keeping the checkpoint usable.
            run.cancelled = True
        else:
            emit(run_id, "unknown_type", of=str(kind))


if __name__ == "__main__":
    main()
