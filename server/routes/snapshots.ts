// snapshots.ts — list the restore points, and roll back to one.
//
// ROLE IN THE SYSTEM. Routing only; the engine is agent/snapshot.ts. It serves
// the RESTORABLE store (.wolfspace/snapshots/), not the plain copies under
// _agent_backups/, which have no rollback path — an id from the wrong one will
// not be found here.
//
// CONNECTS TO
//   imports  node:http types
//   deps     agent/snapshot
//   mounted  by server.ts

import type { IncomingMessage, ServerResponse } from "node:http";

export interface SnapshotMeta {
  id: string;
  ts: number;
  label: string;
  files: string[];
}

export type RollbackResult =
  | { ok: true; restored: string[]; snapshotId: string }
  | { ok: false; error: string };

export interface SnapshotRouteDeps {
  listSnapshots(): SnapshotMeta[];
  rollback(id: string): RollbackResult;
}

export function handle(
  req: IncomingMessage,
  res: ServerResponse,
  deps: SnapshotRouteDeps,
): boolean {
  // split() always yields at least one element; the ?? keeps that fact in the type.
  const urlPath = (req.url || "/").split("?")[0] ?? "/";
  const { listSnapshots, rollback } = deps;

  if (req.method === "GET" && urlPath === "/api/snapshots") {
    const snaps = listSnapshots()
      .slice(0, 20)
      .map((s) => ({
        id: s.id,
        ts: s.ts,
        label: s.label,
        files: s.files,
        age: Math.round((Date.now() - s.ts) / 1000 / 60) + " minutes ago",
      }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, snapshots: snaps }));
    return true;
  }

  if (req.method === "POST" && urlPath === "/api/rollback") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let id: string | undefined;
      try {
        ({ id } = JSON.parse(body));
      } catch {
        res.writeHead(400);
        res.end("bad json");
        return;
      }
      if (!id) {
        res.writeHead(400);
        res.end("id required");
        return;
      }
      const result = rollback(id);
      res.writeHead(result.ok ? 200 : 404, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify(result));
    });
    return true;
  }

  return false;
}
