/**
 * lsp.ts — /lsp/*, the editor's half of the Language Server Protocol.
 *
 * CONNECTS TO
 *   imports  core/lsp-session (which server, which project, what it said)
 *   mounted  by server.ts
 *   renderer public/app/Lsp.ts, which turns these answers into Monaco providers
 *
 * The renderer cannot speak LSP itself, and that is not a limitation to work
 * around — it is the architecture. public/index.html concatenates its modules
 * into ONE global scope and compiles them with esbuild's transform(), never a
 * bundler, so there is no import graph for `monaco-languageclient` to live in.
 * The protocol therefore lives in Node, and Monaco gets thin providers that ask
 * these routes.
 *
 * That is the same shape the Python (Jedi) providers already use, and this
 * generalises it: one protocol instead of one worker per language.
 *
 * ── WHAT EVERY REQUEST CARRIES, AND WHY ──
 *
 * `root` plus `path`, always, and both go through the SAME confinement helper
 * the file-writing routes use. A language server is a process that reads
 * whatever it is pointed at, so the editor must never point one outside the
 * workspace on the strength of a path the renderer sent.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

const lsp = require("../../core/lsp-session.ts");

export type ContainedPath =
  | { akar: string; berkas: string; dalam: string }
  | { kode: number; galat: string };

export interface LspRouteDeps {
  kurungDiAkar?: (root: unknown, p: unknown) => ContainedPath;
}

function badan(req: IncomingMessage): Promise<any | null> {
  return new Promise((done) => {
    let s = "";
    req.on("data", (c: any) => (s += c));
    req.on("end", () => {
      try {
        done(JSON.parse(s || "{}"));
      } catch (_) {
        done(null);
      }
    });
  });
}

export function handle(
  req: IncomingMessage,
  res: ServerResponse,
  deps: LspRouteDeps,
): boolean {
  const jalur = (req.url || "/").split("?")[0] ?? "/";
  if (!jalur.startsWith("/lsp/")) return false;
  const { kurungDiAkar } = deps || {};

  // Returns TRUE so a handler can `return kirim(...)` and still satisfy the
  // "did this route claim the request" contract the dispatcher reads.
  const kirim = (kode: number, isi: unknown): boolean => {
    res.writeHead(kode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(isi));
    return true;
  };

  /** Confinement, applied identically on every path-carrying route. */
  const kurung = (root: unknown, p: unknown) =>
    kurungDiAkar
      ? kurungDiAkar(root, p)
      : { akar: String(root), berkas: String(p), dalam: "." };

  // Which servers exist on this machine, and how to get the ones that do not.
  // A GET, because it changes nothing and the panel polls it.
  if (req.method === "GET" && jalur === "/lsp/status") {
    try {
      const q = new URL(req.url || "/", "http://x").searchParams;
      return kirim(200, {
        ok: true,
        servers: lsp.availability(q.get("root") || process.cwd()),
      });
    } catch (e: any) {
      return kirim(500, { ok: false, error: e.message });
    }
  }

  if (req.method === "GET" && jalur === "/lsp/diagnostics") {
    try {
      const q = new URL(req.url || "/", "http://x").searchParams;
      const k = kurung(q.get("root"), q.get("path"));
      if ("galat" in k) return kirim(k.kode, { ok: false, error: k.galat });
      const d = lsp.diagnostics(k.akar, k.berkas, q.get("language"));
      // null means "no server for this language" and [] means "a server, and it
      // is happy". The renderer must be able to tell those apart: clearing the
      // markers on the first would erase Monaco's own TypeScript diagnostics.
      return kirim(200, { ok: true, diagnostics: d, hasServer: d !== null });
    } catch (e: any) {
      return kirim(500, { ok: false, error: e.message });
    }
  }

  if (
    req.method === "POST" &&
    (jalur === "/lsp/sync" || jalur === "/lsp/close")
  ) {
    badan(req).then(async (p) => {
      if (!p) return kirim(400, { ok: false, error: "invalid json" });
      const k = kurung(p.root, p.path);
      if ("galat" in k) return kirim(k.kode, { ok: false, error: k.galat });
      try {
        if (jalur === "/lsp/close") {
          await lsp.close(k.akar, k.berkas, p.languageId);
          return kirim(200, { ok: true });
        }
        const state = await lsp.sync(k.akar, k.berkas, p.languageId, p.text);
        return kirim(200, {
          ok: true,
          // `missing` is not an error. Most languages will have no server
          // installed, and the renderer's answer to that is to leave the file
          // to Monaco rather than to show a failure.
          missing: !state,
          server: state ? state.entry.id : null,
        });
      } catch (e: any) {
        return kirim(500, { ok: false, error: e.message });
      }
    });
    return true;
  }

  if (req.method === "POST" && jalur === "/lsp/ask") {
    badan(req).then(async (p) => {
      if (!p) return kirim(400, { ok: false, error: "invalid json" });
      const k = kurung(p.root, p.path);
      if ("galat" in k) return kirim(k.kode, { ok: false, error: k.galat });
      try {
        const r = await lsp.ask({
          root: k.akar,
          file: k.berkas,
          languageId: p.languageId,
          kind: p.kind,
          line: p.line,
          character: p.character,
          text: p.text,
        });
        return kirim(200, r);
      } catch (e: any) {
        return kirim(500, { ok: false, error: e.message });
      }
    });
    return true;
  }

  return false;
}

/** Called when the app shuts down: a language server left behind holds an index. */
export function stopAll() {
  return lsp.stopAll();
}
