"""End-to-end test of the worker over its real line protocol.

The worker is spawned as an actual subprocess and driven through stdin/stdout,
because that IS the interface. Importing app.py and calling its functions would
test something the host never does.

The stub host below plays the TypeScript side: it answers every `tool` request,
so a full run completes without a model, a sandbox, or the network.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
SERVICE = os.path.dirname(HERE)
APP = os.path.join(SERVICE, "app.py")
ROOT = os.path.dirname(os.path.dirname(SERVICE))

sys.path.insert(0, SERVICE)
from models import EVENT_NAMES  # noqa: E402


def _spawn():
    return subprocess.Popen(
        [sys.executable, APP],
        cwd=SERVICE,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        bufsize=1,
    )


def _send(proc, obj):
    proc.stdin.write(json.dumps(obj) + "\n")
    proc.stdin.flush()


def _read(proc, timeout=30.0):
    """Read one protocol line, failing loudly rather than hanging forever."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        line = proc.stdout.readline()
        if line:
            return json.loads(line)
    raise AssertionError("worker produced no line within the timeout")


def _drive(proc, run_id, tool_answer):
    """Pump the run to completion, answering every tool request via callback."""
    events = []
    while True:
        msg = _read(proc)
        if msg.get("type") == "event":
            events.append(msg["payload"])
        elif msg.get("type") == "tool":
            _send(
                proc,
                {
                    "v": 1,
                    "id": run_id,
                    "type": "tool_result",
                    "call": msg["call"],
                    **tool_answer(msg["name"], msg.get("args") or {}),
                },
            )
        elif msg.get("type") == "done":
            return events
        elif msg.get("type") == "trace":
            raise AssertionError("worker raised:\n" + msg.get("text", ""))


def test_worker_announces_itself_and_answers_ping():
    proc = _spawn()
    try:
        hello = _read(proc)
        assert hello["type"] == "ready"
        assert hello["v"] == 1
        _send(proc, {"v": 1, "id": "p1", "type": "ping"})
        assert _read(proc)["type"] == "pong"
    finally:
        proc.kill()


def test_a_full_run_completes_and_emits_known_events():
    proc = _spawn()
    try:
        assert _read(proc)["type"] == "ready"
        _send(
            proc,
            {
                "v": 1,
                "id": "r1",
                "type": "start",
                "payload": {
                    "history": [{"role": "user", "content": "cari sesuatu"}],
                    "thread_id": "t1",
                },
            },
        )

        # Stateful on purpose: the model asks for a tool ONCE, then answers
        # plainly. A stub that always returns tool_calls never reaches validate —
        # it loops until the step ceiling, which is a different path entirely.
        seen = {"model": 0}

        def answer(name, _args):
            if name == "__model__":
                seen["model"] += 1
                if seen["model"] == 1:
                    return {
                        "ok": True,
                        "messages": [
                            {
                                "role": "assistant",
                                "tool_calls": [
                                    {"name": "read", "args": {"path": "a.txt"}}
                                ],
                            }
                        ],
                    }
                return {
                    "ok": True,
                    "messages": [{"role": "assistant", "content": "sudah"}],
                }
            if name == "__validate__":
                return {"ok": True, "finished": True, "summary": "selesai"}
            return {"ok": True, "output": "isi berkas", "edited": False}

        events = _drive(proc, "r1", answer)
    finally:
        proc.kill()

    kinds = [e["t"] for e in events]
    # Every emitted name must be one the UI already knows: the same union
    # packages/contracts/agent-events.ts declares.
    assert set(kinds) <= EVENT_NAMES, f"unknown event(s): {set(kinds) - EVENT_NAMES}"
    assert "step" in kinds
    assert "act" in kinds
    assert kinds[-1] == "adone"

    done = events[-1]
    assert done["summary"] == "selesai"
    assert done["thread_id"] == "t1"


def test_a_failing_tool_does_not_kill_the_worker():
    proc = _spawn()
    try:
        assert _read(proc)["type"] == "ready"
        _send(
            proc,
            {
                "v": 1,
                "id": "r2",
                "type": "start",
                "payload": {"history": [{"role": "user", "content": "x"}]},
            },
        )

        def answer(name, _args):
            if name == "__model__":
                return {
                    "ok": True,
                    "messages": [
                        {"role": "assistant", "tool_calls": [{"name": "read"}]}
                    ],
                }
            if name == "__validate__":
                return {"ok": True, "finished": True, "summary": "done"}
            return {"ok": False, "output": "", "error": "denied"}

        events = _drive(proc, "r2", answer)

        # The failed tool is reported as an act with ok:false, and the run still
        # reaches adone — a refused tool is a routing input, not a crash.
        acts = [e for e in events if e["t"] == "act"]
        assert acts and acts[0]["ok"] is False
        assert events[-1]["t"] == "adone"

        # And the process is still healthy afterwards.
        _send(proc, {"v": 1, "id": "p2", "type": "ping"})
        assert _read(proc)["type"] == "pong"
    finally:
        proc.kill()


def test_malformed_line_is_reported_and_skipped():
    proc = _spawn()
    try:
        assert _read(proc)["type"] == "ready"
        proc.stdin.write("{ this is not json\n")
        proc.stdin.flush()
        bad = _read(proc)
        assert bad["type"] == "bad_line"
        # Still alive: an unknown line must never take the agent down.
        _send(proc, {"v": 1, "id": "p3", "type": "ping"})
        assert _read(proc)["type"] == "pong"
    finally:
        proc.kill()


def test_event_names_match_the_typescript_contract():
    """The Python list and the TypeScript union must not drift apart."""
    contract = os.path.join(ROOT, "packages", "contracts", "agent-events.ts")
    with open(contract, encoding="utf-8") as fh:
        src = fh.read()
    start = src.index("export type SelfAgentStreamEvent")
    block = src[start : src.index("\nexport ", start + 1)]
    declared = set(re.findall(r't:\s*"([a-z_]+)"', block))
    assert declared == set(EVENT_NAMES), (
        "drift between models.py EVENT_NAMES and agent-events.ts: "
        f"only in TS={declared - set(EVENT_NAMES)}, "
        f"only in PY={set(EVENT_NAMES) - declared}"
    )


def test_step_ceiling_pauses_the_run_instead_of_looping():
    """A model that never stops asking for tools must be braked, not looped."""
    proc = _spawn()
    try:
        assert _read(proc)["type"] == "ready"
        _send(
            proc,
            {
                "v": 1,
                "id": "r3",
                "type": "start",
                "payload": {"history": [{"role": "user", "content": "x"}]},
            },
        )

        def answer(name, _args):
            if name == "__model__":
                return {
                    "ok": True,
                    "messages": [
                        {"role": "assistant", "tool_calls": [{"name": "read"}]}
                    ],
                }
            return {"ok": True, "output": "x", "edited": False}

        events = _drive(proc, "r3", answer)
    finally:
        proc.kill()

    done = events[-1]
    assert done["t"] == "adone"
    # Paused, not failed: the host offers "continue" rather than reporting an
    # error, and the checkpoint under thread_id stays usable.
    assert done["continuable"] is True
    assert done["thread_id"] == "r3"


import re  # noqa: E402  (used by the contract test above)
