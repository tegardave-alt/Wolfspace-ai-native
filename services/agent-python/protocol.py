"""The NDJSON line protocol between the TypeScript host and this worker.

One JSON object per line, in both directions, over stdin/stdout — the pattern
jedi_worker.py already established in this repo: a long-lived process rather
than one spawn per request.

The difference from jedi_worker is that this channel is BIDIRECTIONAL. The
worker does not only answer requests; it also raises them, because a graph node
that needs a tool cannot run that tool itself. Tools live in TypeScript behind
the sandbox and the broker, and they stay there.

Framing rules that matter:

  * stdout carries protocol ONLY. Anything a library prints would corrupt the
    stream, so the module redirects Python's own stdout to stderr on import and
    keeps the real handle private. Use `emit()`; never `print()`.
  * every line carries `v` (protocol version) and `id` (the run it belongs to),
    so the host can route concurrent runs without a second channel.
  * a malformed inbound line is reported and skipped, never fatal. The host may
    be a newer build speaking a message this worker does not know yet.
"""

from __future__ import annotations

import json
import sys
from typing import Any, Iterator

PROTOCOL_VERSION = 1

# stdout is the protocol channel. Take the real handle, then point sys.stdout at
# stderr so a stray print() inside any dependency lands somewhere harmless
# instead of injecting a line the host would try to parse.
_channel = sys.stdout
sys.stdout = sys.stderr


def emit(run_id: str, kind: str, **fields: Any) -> None:
    """Write one protocol line. The only sanctioned way to reach the host."""
    line = {"v": PROTOCOL_VERSION, "id": run_id, "type": kind, **fields}
    _channel.write(json.dumps(line, ensure_ascii=False) + "\n")
    _channel.flush()


def emit_event(run_id: str, payload: dict[str, Any]) -> None:
    """Emit an AgentEvent, the same union public/app.jsx already consumes."""
    emit(run_id, "event", payload=payload)


def emit_error(run_id: str, message: str) -> None:
    """Emit a failure as an AgentEvent, so the UI path stays identical.

    Deliberately an `err` event and not a bespoke message type: the UI already
    handles `err`, and inventing a second failure shape would mean a failure
    that only some versions of the frontend know how to show.
    """
    emit_event(run_id, {"t": "err", "m": message})


def read_lines(stream: Any = sys.stdin) -> Iterator[dict[str, Any]]:
    """Yield one parsed request per line, skipping blanks and bad JSON.

    A bad line is reported on the `__proto__` pseudo-run and then skipped rather
    than raising. The host could be a newer build sending something this worker
    does not understand, and a worker that dies on an unknown line takes the
    whole agent down with it.
    """
    for raw in stream:
        line = raw.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError as exc:
            emit("__proto__", "bad_line", error=str(exc), raw=line[:200])
            continue
        if not isinstance(msg, dict):
            emit("__proto__", "bad_line", error="not an object", raw=line[:200])
            continue
        yield msg
