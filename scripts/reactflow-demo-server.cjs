// Server statik MANDIRI khusus demo "React Flow penuh" (tampilan default asli).
// Terpisah dari server utama (server.cjs) — port 8091. Menyajikan:
//   /            -> public/reactflow-full.html
//   /vendor/...  -> public/vendor/... (react, reactflow.bundle.js, css, babel)
// Jalankan: node scripts/reactflow-demo-server.cjs   (buka http://127.0.0.1:8091)
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PUB = path.join(ROOT, "public");
const PORT = Number(process.env.RF_DEMO_PORT) || 8091;

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  const file =
    p === "/" || p === ""
      ? path.join(PUB, "reactflow-full.html")
      : path.join(PUB, p.replace(/^\/+/, ""));
  // Kurung ke dalam public/ (cegah path traversal).
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
  console.log("React Flow demo  ->  http://127.0.0.1:" + PORT);
  console.log(
    "(tampilan React Flow penuh/asli: MiniMap + Controls + Background)",
  );
});
