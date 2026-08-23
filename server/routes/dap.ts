// DAP debug-session routes.
// Ported from the former server/routes/dap.ts; behavior is unchanged. Session
// logic lives in core/dap-sesi.ts — this file is only its HTTP layer.
//
// PATH CONTAINMENT HAPPENS HERE, NOT IN THE UI. `program` arrives from the
// renderer and therefore cannot be trusted; it reuses the same `kurungDiAkar`
// as the file write/create routes, so the security boundary stays one
// implementation rather than three copies.
//
// NOTE ON NAMING: the route paths (/dap/mulai, /dap/aksi, /dap/titik-henti, …)
// and the JSON field names (titikHenti, baris, berkas, keadaan, sesi, …) are the
// live wire contract with public/app.jsx and are deliberately left as-is —
// renaming them here would break the renderer. Only comments, local names, and
// types are in English.

import type { IncomingMessage, ServerResponse } from "node:http";

const dapSesi = require("../../core/dap-sesi.ts") as DapSessionApi;

/** State snapshot returned by dapSesi.keadaan(); null when the id is unknown. */
export interface DapState {
  id: string;
  program: string;
  selesai: boolean;
  galat?: string;
  terpasang: number[];
  berhenti?: unknown;
  /** Output is sent from the index the renderer already holds, not in full. */
  keluaranDari: number;
  keluaran: unknown[];
  keluaranTotal: number;
}

export interface DapSessionApi {
  buka(opts: {
    program: string;
    cwd: string;
    titikHenti: Record<string, number[]>;
    python?: string;
  }): Promise<string>;
  aksi(id: string, nama: string): Promise<Record<string, unknown>>;
  titikHenti(id: string, berkas: string, baris: number[]): Promise<number[]>;
  keadaan(id: string, sejak: number): DapState | null;
  tutup(id: string): Promise<boolean>;
  daftar(): unknown[];
}

// Result of containing a renderer-supplied path inside an allowed root.
// _kurungDiAkar() in server.cjs returns one shape or the other and never a
// mixture, and `galat` is always a non-empty string when present — so testing
// for the key is equivalent to the truthiness test the original code used.
export type ContainedPath =
  | { akar: string; berkas: string; dalam?: string }
  | { galat: string; kode: number };

export interface DapRouteDeps {
  kurungDiAkar?: (root: string, program: string) => ContainedPath;
}

/** Resolves to the parsed body, or null when it is not valid JSON. */
function badan(req: IncomingMessage): Promise<any | null> {
  return new Promise((selesai) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      try {
        selesai(JSON.parse(b || "{}"));
      } catch (_) {
        selesai(null);
      }
    });
  });
}

export function handle(
  req: IncomingMessage,
  res: ServerResponse,
  deps: DapRouteDeps,
): boolean {
  // split() always yields at least one element; the ?? keeps that in the type.
  const jalur = (req.url || "/").split("?")[0] ?? "/";
  if (!jalur.startsWith("/dap/")) return false;
  const { kurungDiAkar } = deps || {};

  const kirim = (kode: number, isi: unknown): void => {
    res.writeHead(kode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(isi));
  };

  if (req.method === "POST" && jalur === "/dap/mulai") {
    badan(req).then(async (p) => {
      if (!p) return kirim(400, { ok: false, error: "json tidak sah" });
      const kurung: ContainedPath = kurungDiAkar
        ? kurungDiAkar(p.root, p.program)
        : { akar: p.root, berkas: p.program };
      if ("galat" in kurung)
        return kirim(kurung.kode, { ok: false, error: kurung.galat });
      try {
        const id = await dapSesi.buka({
          program: kurung.berkas,
          cwd: kurung.akar,
          // Breakpoints are keyed by the CONTAINED path, not the one the
          // renderer sent: two spellings of the same path in different forms
          // make the adapter attach them to a file it considers a different one.
          titikHenti: { [kurung.berkas]: (p.titikHenti || []).map(Number) },
          python: p.python,
        });
        kirim(200, { ok: true, id, keadaan: dapSesi.keadaan(id, 0) });
      } catch (e) {
        kirim(500, { ok: false, error: String((e as Error)?.message || e) });
      }
    });
    return true;
  }

  if (req.method === "POST" && jalur === "/dap/aksi") {
    badan(req).then(async (p) => {
      if (!p || !p.id)
        return kirim(400, { ok: false, error: "id wajib diisi" });
      try {
        kirim(200, { ok: true, ...(await dapSesi.aksi(p.id, p.aksi)) });
      } catch (e) {
        kirim(400, { ok: false, error: String((e as Error)?.message || e) });
      }
    });
    return true;
  }

  if (req.method === "POST" && jalur === "/dap/titik-henti") {
    badan(req).then(async (p) => {
      if (!p || !p.id)
        return kirim(400, { ok: false, error: "id wajib diisi" });
      try {
        const hasil = await dapSesi.titikHenti(
          p.id,
          p.berkas,
          (p.baris || []).map(Number),
        );
        kirim(200, { ok: true, terpasang: hasil });
      } catch (e) {
        kirim(400, { ok: false, error: String((e as Error)?.message || e) });
      }
    });
    return true;
  }

  if (req.method === "GET" && jalur === "/dap/keadaan") {
    let id = "",
      sejak = 0;
    try {
      const q = new URL(req.url || "", "http://x").searchParams;
      id = q.get("id") || "";
      sejak = Number(q.get("sejak") || 0);
    } catch (_) {}
    const k = dapSesi.keadaan(id, sejak);
    if (!k) return (kirim(404, { ok: false, error: "sesi tak ada" }), true);
    kirim(200, { ok: true, ...k });
    return true;
  }

  if (req.method === "POST" && jalur === "/dap/tutup") {
    badan(req).then(async (p) => {
      kirim(200, { ok: true, ditutup: await dapSesi.tutup((p && p.id) || "") });
    });
    return true;
  }

  if (req.method === "GET" && jalur === "/dap/daftar") {
    kirim(200, { ok: true, sesi: dapSesi.daftar() });
    return true;
  }

  return false;
}
