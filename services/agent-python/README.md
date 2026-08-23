# agent-python — the LangGraph worker

LangGraph is a Python library first; the JS port is a follower. The agent
workflow is the one part of WOLFSPACE where that difference is worth paying for,
so the graph lives here and the rest of the system keeps speaking to it over a
line protocol.

## What lives here, and what deliberately does not

**Here:** the state machine. The state shape, the reducers, the node routing, the
checkpointer that lets a HITL-paused run resume, and nothing else.

**NOT here: the tools.** `agent/tools/`, `agent/sandbox.ts`, `agent/broker/*`,
`agent/mcp-client.ts` stay in TypeScript, and they must. Those files are the
security boundary — AppContainer on Windows, Linux namespaces, WSL capability
zones, the deny-by-default broker, the tamper-evident audit ledger. Re-implementing
that in Python would not be a migration; it would be throwing away the part of
this repo that is hardest to get right, in exchange for nothing.

So the split is:

```
  Python                              TypeScript
  ------                              ----------
  graph, state, routing      <-->     tools, sandbox, broker, MCP
  checkpointer / HITL                 model calls, streaming to the UI
```

The Python side never touches the filesystem, never spawns a shell, and never
opens a socket. When a node needs a tool, it asks — and the TypeScript side runs
it inside the jail that already exists.

## Protocol

NDJSON over stdin/stdout, one JSON object per line, following the pattern
`jedi_worker.py` already established in this repo: a long-lived process, not one
spawn per request.

It is BIDIRECTIONAL, which is the part that differs from jedi_worker. The worker
does not only answer; it also asks.

```
  host -> worker   {"v":1,"id":"r1","type":"start","payload":{...}}
  worker -> host   {"v":1,"id":"r1","type":"event","payload":{"t":"step","n":1}}
  worker -> host   {"v":1,"id":"r1","type":"tool","call":"c1","name":"read", ...}
  host   -> worker {"v":1,"id":"r1","type":"tool_result","call":"c1","ok":true, ...}
  worker -> host   {"v":1,"id":"r1","type":"event","payload":{"t":"adone", ...}}
```

`event` payloads are the same `AgentEvent` union the UI already consumes —
see `packages/contracts/agent-events.ts`. The contract is shared, not duplicated:
`tests/kontrak-agent-events.test.js` holds the TypeScript side to it, and
`tests/test_protocol.py` holds this side to the same names.

## Status

Phase 10 of the migration plan. Being built incrementally: the protocol and the
state shape first, then the nodes are moved over one at a time, with the JS graph
staying authoritative until each one is proven at parity.
