// Prototipe: React Flow (frontend) DIJALANKAN oleh LangGraph (backend). Server ini
// meng-COMPILE graph yang digambar user (nodes/edges) menjadi StateGraph LangGraph
// NYATA (@langchain/langgraph v1.x — sama dengan yang dipakai agent/self_agent.ts),
// lalu MENJALANKANNYA sambil men-stream eksekusi per-node (SSE) ke UI.
//
// Skenario web-dev: node "Generate Site" benar-benar menghasilkan HTML website,
// lalu node berikutnya (http/transform/condition/output) memprosesnya. Hasil situs
// dikembalikan untuk di-preview di iframe.
//
// Jalankan: node scripts/langgraph-flow-server.cjs   (buka http://127.0.0.1:8092)
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { StateGraph, START, END, Annotation } = require("@langchain/langgraph");

const ROOT = path.resolve(__dirname, "..");
const PUB = path.join(ROOT, "public");
const PORT = Number(process.env.LG_PORT) || 8092;

// ── Generator website sederhana (deterministik, tanpa LLM) untuk prototipe ──
function genSite(d) {
  const title = (d && d.title) || "Landing Page";
  const tagline = (d && d.tagline) || "Dibuat oleh LangGraph flow";
  const color = (d && d.color) || "#4c8bf5";
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>*{margin:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0b0e14;color:#e6edf5}
.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;
background:radial-gradient(1200px 500px at 50% -10%, ${color}33, transparent)}
h1{font-size:clamp(32px,7vw,64px);background:linear-gradient(90deg,#fff,${color});-webkit-background-clip:text;background-clip:text;color:transparent}
p{margin-top:16px;color:#9fb0c3;font-size:clamp(15px,2.4vw,20px);max-width:560px}
.cta{margin-top:28px;display:flex;gap:12px}
a.btn{padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600}
a.primary{background:${color};color:#0b0e14}a.ghost{border:1px solid ${color};color:${color}}
.feat{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;max-width:900px;margin:48px auto;padding:0 24px}
.card{background:#141b26;border:1px solid #24303f;border-radius:12px;padding:20px}.card h3{color:${color}}</style></head>
<body><section class="hero"><h1>${title}</h1><p>${tagline}</p>
<div class="cta"><a class="btn primary" href="#">Mulai</a><a class="btn ghost" href="#">Pelajari</a></div></section>
<section class="feat">
<div class="card"><h3>Cepat</h3><p>Di-generate langsung oleh node flow.</p></div>
<div class="card"><h3>Terintegrasi</h3><p>Node berikutnya bisa panggil API, transform, cabang.</p></div>
<div class="card"><h3>LangGraph</h3><p>Flow selesai.</p></div>
</section></body></html>`;
}

// ── Fungsi tiap jenis node (dipanggil LangGraph saat node dieksekusi) ──
function makeNodeFn(node) {
  const d = node.data || {};
  const kind = (d && d.kind) || node.type; // kind LOGIS dari data (tipe RF bisa beda, mis. outputNode)
  const id = node.id;
  return async (state) => {
    if (kind === "generate") {
      const html = genSite(d);
      return {
        site: html,
        ctx: "SITE_GENERATED",
        log: [
          {
            id,
            kind,
            ok: true,
            summary:
              "Website di-generate (" + Buffer.byteLength(html) + " byte HTML)",
          },
        ],
      };
    }
    if (kind === "http") {
      const url = String(d.url || "").trim();
      if (!/^https?:\/\//i.test(url))
        return {
          ctx: "",
          log: [{ id, kind, ok: false, summary: "URL tak valid" }],
        };
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15000);
        const r = await fetch(url, {
          method: d.method || "GET",
          signal: ctrl.signal,
        });
        const body = await r.text();
        clearTimeout(t);
        return {
          ctx: body.slice(0, 20000),
          log: [
            {
              id,
              kind,
              ok: r.ok,
              summary:
                r.status + " " + r.statusText + " (" + body.length + "b)",
            },
          ],
        };
      } catch (e) {
        return {
          ctx: "",
          log: [{ id, kind, ok: false, summary: "ERROR " + (e.message || e) }],
        };
      }
    }
    if (kind === "transform") {
      const expr = String(d.expr || "").trim();
      let out = state.ctx || "";
      try {
        const j = JSON.parse(state.ctx);
        out = expr
          ? expr.split(".").reduce((a, k) => (a == null ? a : a[k]), j)
          : j;
        out = typeof out === "string" ? out : JSON.stringify(out, null, 2);
      } catch (_) {
        /* bukan JSON → pass-through */
      }
      out = String(out == null ? "" : out);
      return {
        ctx: out,
        log: [{ id, kind, ok: true, summary: "→ " + out.slice(0, 48) }],
      };
    }
    if (kind === "condition") {
      const check = String(d.check || "")
        .trim()
        .toLowerCase();
      const pass = check
        ? String(state.ctx || "")
            .toLowerCase()
            .includes(check)
        : true;
      return {
        _cond: pass ? "true" : "false",
        log: [
          {
            id,
            kind,
            ok: true,
            summary:
              'check "' + (d.check || "") + '" → ' + (pass ? "true" : "false"),
          },
        ],
      };
    }
    // output
    return {
      log: [
        {
          id,
          kind: "output",
          ok: true,
          summary:
            (state.site ? "Situs siap · " : "") +
            String(state.ctx || "").slice(0, 60),
        },
      ],
    };
  };
}

// ── Compile graph gambar → StateGraph LangGraph, jalankan, stream via SSE ──
async function runFlow(spec, sse) {
  const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];
  const edges = Array.isArray(spec.edges) ? spec.edges : [];
  if (!nodes.length) {
    sse({ t: "err", m: "graph kosong" });
    return;
  }

  const State = Annotation.Root({
    ctx: Annotation({ reducer: (_a, b) => b, default: () => "" }),
    site: Annotation({ reducer: (_a, b) => b, default: () => "" }),
    _cond: Annotation({ reducer: (_a, b) => b, default: () => "" }),
    log: Annotation({
      reducer: (a, b) => (a || []).concat(b || []),
      default: () => [],
    }),
  });

  const g = new StateGraph(State);
  for (const n of nodes) g.addNode(n.id, makeNodeFn(n));

  const outMap = {};
  for (const e of edges) (outMap[e.source] = outMap[e.source] || []).push(e);
  const inSet = new Set(edges.map((e) => e.target));

  // entry: node tanpa edge masuk → START
  let entries = nodes.filter((n) => !inSet.has(n.id));
  if (!entries.length) entries = [nodes[0]];
  for (const n of entries) g.addEdge(START, n.id);

  for (const n of nodes) {
    const outs = outMap[n.id] || [];
    if (n.type === "condition") {
      const t = outs.find(
        (e) =>
          (e.sourceHandle || "") === "true" || /true|ya/i.test(e.label || ""),
      );
      const f = outs.find(
        (e) =>
          (e.sourceHandle || "") === "false" ||
          /false|tidak/i.test(e.label || ""),
      );
      g.addConditionalEdges(n.id, (s) => s._cond || "true", {
        true: t ? t.target : END,
        false: f ? f.target : END,
      });
    } else if (!outs.length) {
      g.addEdge(n.id, END);
    } else {
      for (const e of outs) g.addEdge(n.id, e.target);
    }
  }

  let app;
  try {
    app = g.compile();
  } catch (e) {
    sse({ t: "err", m: "compile gagal: " + (e.message || e) });
    return;
  }

  let site = "";
  try {
    const stream = await app.stream(
      { ctx: "", site: "", log: [] },
      { streamMode: "updates", recursionLimit: 50 },
    );
    for await (const chunk of stream) {
      for (const nid of Object.keys(chunk)) {
        const upd = chunk[nid] || {};
        if (upd.site) site = upd.site;
        sse({ t: "node", id: nid, entry: (upd.log && upd.log[0]) || null });
      }
    }
    sse({ t: "done", site });
  } catch (e) {
    sse({ t: "err", m: "run gagal: " + (e.message || e), site });
  }
}

// ── HTTP server: static + POST /run (SSE) ──
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
};

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/run") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const sse = (o) => {
        try {
          res.write("data: " + JSON.stringify(o) + "\n\n");
        } catch (_) {}
      };
      let spec = {};
      try {
        spec = JSON.parse(body || "{}");
      } catch (_) {}
      await runFlow(spec, sse);
      res.end();
    });
    return;
  }
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  const file =
    p === "/" || p === ""
      ? path.join(PUB, "langgraph-flow.html")
      : path.join(PUB, p.replace(/^\/+/, ""));
  if (!path.normalize(file).startsWith(PUB)) {
    res.writeHead(403);
    return res.end("forbidden");
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("not found: " + p);
    }
    const ext = path.extname(file).toLowerCase();
    const ct = MIME[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": ct + (ct.startsWith("text/") ? "; charset=utf-8" : ""),
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("LangGraph Flow  ->  http://127.0.0.1:" + PORT);
  console.log(
    "(React Flow di-compile jadi StateGraph LangGraph nyata & dijalankan)",
  );
});
