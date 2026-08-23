"""Routing tests for the ported StateGraph.

The routing is what actually moved to Python, so it is what gets tested here.
The node bodies are stubs on purpose: a run must be checkable without a model,
a sandbox, or a host process on the other end of the pipe.

Each case below mirrors a branch in the `addConditionalEdges` calls of
agent/self_agent.ts. If the JS routing changes, one of these should go red.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from graph import (  # noqa: E402
    MAX_STEPS,
    RECURSION_LIMIT,
    route_executor,
    route_start,
    route_tools,
    route_validate,
)


def test_resume_after_approval_skips_the_planner():
    # Planning already happened before the pause; redoing it would throw away
    # the decision the human just made.
    assert route_start({"hitlApproved": True, "messages": []}) == "executor"


def test_code_request_with_empty_checklist_goes_to_planner():
    state = {
        "task_checklist": [],
        "messages": [{"role": "user", "content": "buatkan fungsi login"}],
    }
    assert route_start(state) == "planner"


def test_lookup_request_skips_the_planner():
    state = {
        "task_checklist": [],
        "messages": [{"role": "user", "content": "apa itu AppContainer"}],
    }
    assert route_start(state) == "executor"


def test_non_empty_checklist_skips_the_planner():
    # A checklist already exists, so planning is not the missing step.
    state = {
        "task_checklist": ["satu"],
        "messages": [{"role": "user", "content": "buatkan fungsi"}],
    }
    assert route_start(state) == "executor"


def test_executor_routes_to_tools_when_tool_calls_are_present():
    state = {
        "messages": [{"role": "assistant", "tool_calls": [{"name": "read"}]}],
    }
    assert route_executor(state) == "tools"


def test_executor_routes_to_validate_without_tool_calls():
    state = {"messages": [{"role": "assistant", "content": "done"}]}
    assert route_executor(state) == "validate"


def test_executor_reruns_itself_when_the_last_message_is_not_assistant():
    # A fallback provider answered but produced nothing usable.
    state = {"messages": [{"role": "tool", "content": "x"}]}
    assert route_executor(state) == "executor"


def test_stop_reason_ends_the_run_from_executor_and_tools():
    assert route_executor({"stopReason": "cancel", "messages": []}) == "__end__"
    assert route_tools({"stopReason": "cancel"}) == "__end__"


def test_step_ceiling_pauses_rather_than_loops():
    # The pause-checkpoint: at the ceiling the graph stops WITH its state, so
    # the host can offer "continue" instead of rolling the run back.
    assert route_tools({"step": MAX_STEPS}) == "__end__"
    assert route_tools({"step": MAX_STEPS - 1}) == "executor"


def test_explicit_step_ceiling_overrides_the_default():
    assert route_tools({"step": 3, "stepCeiling": 3}) == "__end__"
    assert route_tools({"step": 3, "stepCeiling": 9}) == "executor"


def test_validate_ends_only_on_finished():
    assert route_validate({"stopReason": "finished"}) == "__end__"
    assert route_validate({"stopReason": ""}) == "executor"
    assert route_validate({}) == "executor"


def test_recursion_limit_exceeds_what_max_steps_needs():
    # LangGraph counts super-steps, the app counts steps only inside `tools`.
    # If this shrinks below what MAX_STEPS needs, the graph throws "Recursion
    # limit reached" BEFORE the graceful pause logic ever runs.
    assert RECURSION_LIMIT > MAX_STEPS * 2
