// Debug API (run timelines, in-memory log ring, live SSE stream, HTML viewer).
// Ported from the former server/routes/debug.cjs; behavior is unchanged.
// State (LOG_RING, debugSubs, DEBUG_VIEWER, dlog) still lives in server.cjs and
// is injected via deps — this module holds routing logic only.

import type { IncomingMessage, ServerResponse } from "node:http";

/** One entry as produced by dlog() in server.cjs. */
export interface DebugLogEntry {
  seq: number;
  t: number;
  cat: string;
  level: string;
  msg: string;
  data: unknown;
}

/** A live SSE writer; dlog() calls it with a pre-formatted "data: ...\n\n" line. */
export type DebugSubscriber = (chunk: string) => void;

export interface TraceApi {
  listRuns(limit?: number): unknown[];
  /** Null/undefined means "no such run" — the caller answers 404. */
  getRunTimeline(runId: string): unknown[] | null | undefined;
  exportBundle(
    runId: string,
    opts?: { includeConfig?: boolean },
  ): unknown | null | undefined;
}

export interface DebugRouteDeps {
  trace: TraceApi;
  LOG_RING: DebugLogEntry[];
  debugSubs: Set<DebugSubscriber>;
  DEBUG_VIEWER: string;
  dlog(cat: string, level: string, msg: string, data?: unknown): void;
}

export function handle(
  req: IncomingMessage,
  res: ServerResponse,
  deps: DebugRouteDeps,
): boolean {
  // split() always yields at least one element; the ?? keeps that fact in the
  // type as well, so startsWith() below needs no non-null assertion.
  const _path = (req.url || "/").split("?")[0] ?? "/";
  const { trace, LOG_RING, debugSubs, DEBUG_VIEWER, dlog } = deps;

  // Debug: list recent runs
  if (req.method === "GET" && _path === "/debug/runs") {
    const runs = trace.listRuns(30);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(runs));
    return true;
  }

  // Debug: get run timeline by ID
  if (req.method === "GET" && _path.startsWith("/debug/runs/")) {
    const runId = (req.url || "").split("/").pop() as string;
    const timeline = trace.getRunTimeline(runId);
    if (!timeline) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "run not found" }));
      return true;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(timeline));
    return true;
  }

  // Debug: export bundle for reproduction
  if (req.method === "GET" && _path.startsWith("/debug/export/")) {
    const runId = (req.url || "").split("/").pop() as string;
    const bundle = trace.exportBundle(runId, { includeConfig: true });
    if (!bundle) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "run not found" }));
      return true;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(bundle));
    return true;
  }

  if (req.method === "GET" && _path === "/debug/log") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(LOG_RING));
    return true;
  }

  // Beacon: studio (Dart) + React shell post trace
  if (req.method === "GET" && _path === "/dbg") {
    const sp = new URL("http://x" + req.url).searchParams;
    const n = sp.get("n");
    dlog(
      "studio",
      "info",
      (sp.get("src") || "?") + ": " + (sp.get("m") || ""),
      n ? { n: +n } : {},
    );
    res.writeHead(200, {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store",
    });
    res.end("ok");
    return true;
  }

  if (req.method === "GET" && _path === "/debug/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const w: DebugSubscriber = (s) => {
      if (!res.writableEnded) res.write(s);
    };
    for (const e of LOG_RING.slice(-120))
      w("data: " + JSON.stringify(e) + "\n\n");
    debugSubs.add(w);
    req.on("close", () => debugSubs.delete(w));
    res.on("close", () => debugSubs.delete(w));
    return true;
  }

  if (req.method === "GET" && _path === "/debug") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(DEBUG_VIEWER);
    return true;
  }

  return false;
}
