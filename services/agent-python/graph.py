"""The agent StateGraph, ported from agent/self_agent.cjs.

The node bodies are NOT here. Each node asks the TypeScript host to do the work
and waits for the answer, because everything a node actually does — call a model,
run a tool — lives behind boundaries that stay in TypeScript: the sandbox, the
broker, the MCP client, the cloud providers. See README.md for why that split is
deliberate rather than temporary.

What IS here is the part LangGraph is actually for: the state machine. The four
nodes, the routing between them, the step ceiling, and the checkpointer that lets
a run paused for human approval resume later instead of starting over.

The routing is a line-by-line port of the `addConditionalEdges` calls in the JS
source. Divergence here would be invisible until a specific run took a different
turn, so the conditions are kept in the same order and shape as the original.
"""

from __future__ import annotations

from typing import Any, Callable, Literal

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from models import AgentState

#: Matches MAX_STEPS in agent/self_agent.cjs. A run that reaches it is PAUSED
#: with its checkpoint intact, not failed — the host offers "continue".
MAX_STEPS = 14

# LangGraph counts SUPER-STEPS (one per node execution) while the app counts a
# "step" only inside the tools node. One app-step is executor + tools, roughly
# two super-steps, plus planner/validate/retry. LangGraph's default of 25 is
# lower than the super-steps needed to reach MAX_STEPS, so the graph would throw
# "Recursion limit reached" BEFORE the app's own graceful stop/pause logic ran.
# Scaled here for the same reason the JS side scales it.
RECURSION_LIMIT = MAX_STEPS * 4 + 20

# Keywords that decide whether a request is worth planning first. Ported
# verbatim, Indonesian words included: they are matched against what the USER
# typed, so they are data, not prose.
CODE_KEYWORDS = (
    "buat",
    "buatkan",
    "tulis",
    "tuliskan",
    "implement",
    "debug",
    "fix",
    "perbaiki",
    "refactor",
    "optimize",
    "optimise",
    "optimasi",
)


def _last_message(state: AgentState) -> dict[str, Any]:
    messages = state.get("messages") or []
    return messages[-1] if messages else {}


def route_start(state: AgentState) -> Literal["planner", "executor"]:
    """START -> planner | executor.

    A run resuming from human approval goes straight back to the executor: the
    planning already happened before it paused, and redoing it would discard the
    decision the human just made.
    """
    if state.get("hitlApproved"):
        return "executor"

    checklist = state.get("task_checklist")
    last = _last_message(state)
    if (
        checklist is not None
        and len(checklist) == 0
        and last.get("role") == "user"
        and _looks_like_code_task(str(last.get("content") or ""))
    ):
        return "planner"

    # Simple search/lookup skips the planner and goes straight to the executor.
    return "executor"


def _looks_like_code_task(text: str) -> bool:
    low = text.lower()
    return any(word in low for word in CODE_KEYWORDS)


def route_executor(state: AgentState) -> Literal["tools", "validate", "executor", "__end__"]:
    if state.get("stopReason"):
        return END
    msg = _last_message(state)
    if msg.get("role") == "assistant" and msg.get("tool_calls"):
        return "tools"
    # A fallback provider answered but returned no tool calls: run it again.
    if msg.get("role") != "assistant":
        return "executor"
    return "validate"


def route_tools(state: AgentState) -> Literal["executor", "__end__"]:
    if state.get("stopReason"):
        return END
    # A pause-checkpoint, not a cliff: on reaching the step ceiling the graph
    # stops here WITH its state saved, and the host marks the run "paused, can
    # continue" without rolling anything back. The normal path is still natural
    # completion through validate; this is only a brake that gives the user a
    # choice.
    if state.get("step", 1) >= state.get("stepCeiling", MAX_STEPS):
        return END
    return "executor"


def route_validate(state: AgentState) -> Literal["executor", "__end__"]:
    if state.get("stopReason") == "finished":
        return END
    return "executor"


NodeFn = Callable[[AgentState], dict[str, Any]]


def build(
    planner: NodeFn,
    executor: NodeFn,
    tools: NodeFn,
    validate: NodeFn,
    checkpointer: MemorySaver | None = None,
):
    """Wire the graph. The four node functions are injected by the caller.

    Injected rather than imported so the graph can be exercised in tests with
    stubs — the routing is the part worth testing on its own, and it must be
    testable without a model, a sandbox, or a host process on the other end.
    """
    workflow = StateGraph(AgentState)
    workflow.add_node("planner", planner)
    workflow.add_node("executor", executor)
    workflow.add_node("tools", tools)
    workflow.add_node("validate", validate)

    workflow.add_conditional_edges(START, route_start)
    workflow.add_edge("planner", "executor")
    workflow.add_conditional_edges("executor", route_executor)
    workflow.add_conditional_edges("tools", route_tools)
    workflow.add_conditional_edges("validate", route_validate)

    return workflow.compile(checkpointer=checkpointer or MemorySaver())
