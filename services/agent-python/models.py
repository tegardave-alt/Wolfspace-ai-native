"""State shape and wire types for the LangGraph agent worker.

The state is a faithful port of the `Annotation.Root({...})` block in
agent/self_agent.ts. Every channel keeps its original name and its original
reducer semantics, because the JS graph stays authoritative until each node is
proven at parity — and a run checkpointed by one side has to be readable by the
other.

Reducer mapping, JS -> Python:

    (x, y) => y          replace   -> last write wins
    (x, y) => x.concat(y) append   -> operator.add on a list
    (x, y) => x + y      sum       -> operator.add on an int
    Set union            union     -> a custom reducer, see below

`failedTools` and `accessedEvidence` are Sets in JS. They are modelled here as
sorted lists with a union reducer rather than Python sets, for one reason: the
state crosses a JSON line protocol, and JSON has no set. Sorting keeps the
serialised form stable so an unchanged state does not look changed.
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, Literal, TypedDict


def union_sorted(current: list[str], incoming: list[str]) -> list[str]:
    """Set union that survives JSON: deduplicated and order-stable."""
    return sorted(set(current) | set(incoming))


def replace(_current: Any, incoming: Any) -> Any:
    """Last write wins — the JS `(x, y) => y` reducer."""
    return incoming


class EditEntry(TypedDict, total=False):
    """One proven edit: {tool, target, ok, bytes} in the JS source.

    Rich on purpose. The hallucination guard verifies a "done" claim against
    edits that ACTUALLY succeeded and wrote real content, not merely against a
    count of tool invocations.
    """

    tool: str
    target: str
    ok: bool
    bytes: int


class AgentState(TypedDict, total=False):
    """The graph state. Field names match the JS Annotation.Root exactly."""

    messages: Annotated[list[dict[str, Any]], operator.add]
    step: Annotated[int, replace]
    edits: Annotated[int, operator.add]
    editLog: Annotated[list[EditEntry], operator.add]
    failedTools: Annotated[list[str], union_sorted]
    accessedEvidence: Annotated[list[str], union_sorted]
    fallbackCount: Annotated[int, replace]
    forceRetryCount: Annotated[int, replace]
    finalSummary: Annotated[str, replace]
    stopReason: Annotated[str, replace]
    waitForAnswer: Annotated[bool, replace]
    hitlPending: Annotated[bool, replace]
    hitlApproved: Annotated[bool, replace]
    pendingToolCall: Annotated[dict[str, Any] | None, replace]
    pendingToolCalls: Annotated[list[dict[str, Any]], replace]


#: Event names the worker may emit, mirroring the SelfAgentStreamEvent union in
#: packages/contracts/agent-events.ts. Held to that list by tests/test_protocol.py
#: on this side and tests/kontrak-agent-events.test.js on the other.
EVENT_NAMES: frozenset[str] = frozenset(
    {
        "act",
        "adone",
        "ask",
        "backup",
        "err",
        "force_retry",
        "hitl",
        "model_wait",
        "step",
        "thought",
        "todos",
        "tok",
    }
)

MessageKind = Literal["start", "resume", "cancel", "tool_result", "ping"]
