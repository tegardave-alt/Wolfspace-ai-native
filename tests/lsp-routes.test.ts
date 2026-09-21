// /lsp/* — the routes, driven the way the app drives them.
//
// The renderer never opens a socket: in Electron there is no HTTP server at
// all, and every call arrives as a synthetic req/res pair handed to the same
// handler (electron/main.ts, apiCall). So the requests here are built the same
// way — a real stream carrying a real body — rather than by calling the
// session functions directly.
//
// THE ONE THAT IS NOT ABOUT LSP AT ALL is the confinement test. A language
// server is a process that reads whatever it is pointed at, and `path` arrives
// from the renderer. The route must refuse a path outside the workspace root
// before any of it reaches a process, and it must do so through the SAME helper
// the file-writing routes use — a second copy of a security rule is a rule that
// will diverge.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { PassThrough } = require("stream");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const rute = require("../server/routes/lsp.ts");
const S = require("../core/lsp-session.ts");

jest.setTimeout(60000);

/** The confinement helper, copied in SHAPE from server.ts only for the test. */
function kurungDiAkar(root: any, p: any) {
  if (!root || !p) return { kode: 400, galat: "root and path are required" };
  const akar = path.resolve(String(root));
  const berkas = path.resolve(String(p));
  const dalam = path.relative(akar, berkas);
  if (!dalam || dalam.startsWith("..") || path.isAbsolute(dalam))
    return { kode: 403, galat: "outside the workspace root" };
  return { akar, berkas, dalam };
}

function panggil(method: string, url: string, body?: any): Promise<any> {
  return new Promise((done) => {
    const req: any = new PassThrough();
    req.method = method;
    req.url = url;
    req.headers = { "content-type": "application/json" };
    const res: any = {
      statusCode: 200,
      _chunks: [] as any[],
      writeHead(code: number) {
        res.statusCode = code;
        return res;
      },
      end(chunk: any) {
        if (chunk) res._chunks.push(chunk);
        let parsed: any = null;
        try {
          parsed = JSON.parse(res._chunks.join(""));
        } catch (_) {}
        done({ status: res.statusCode, body: parsed });
      },
    };
    const claimed = rute.handle(req, res, { kurungDiAkar });
    if (!claimed) return done({ status: 0, body: null, claimed: false });
    if (body !== undefined) req.end(JSON.stringify(body));
    else req.end();
  });
}

describe("what the route claims", () => {
  test("anything outside /lsp/ is left to the next handler", async () => {
    const r = await panggil("GET", "/ww/list");
    expect(r.claimed).toBe(false);
  });

  test("status lists every server, installed or not", async () => {
    const r = await panggil(
      "GET",
      "/lsp/status?root=" + encodeURIComponent(AKAR),
    );
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.servers.length).toBe(S.REGISTRY.length);
    // The panel needs the missing ones too — with the command that installs them.
    for (const s of r.body.servers) expect(s.install).toMatch(/\S/);
  });
});

describe("confinement, before anything is started", () => {
  test("a path outside the root is refused with 403", async () => {
    const r = await panggil("POST", "/lsp/sync", {
      root: AKAR,
      path: path.resolve(AKAR, "..", "di-luar.py"),
      languageId: "python",
      text: "x = 1",
    });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/outside the workspace root/);
  });

  test("a sibling directory that merely SHARES A PREFIX is still outside", async () => {
    // "C:\proyek-lain" starts with "C:\proyek" textually. startsWith would let
    // it through; path.relative does not.
    const r = await panggil("POST", "/lsp/ask", {
      root: path.resolve(AKAR),
      path: path.resolve(AKAR + "-lain", "a.py"),
      languageId: "python",
      kind: "hover",
      line: 0,
      character: 0,
      text: "",
    });
    expect(r.status).toBe(403);
  });

  test("a missing root or path is a 400, not a crash", async () => {
    const r = await panggil("POST", "/lsp/sync", { languageId: "python" });
    expect(r.status).toBe(400);
  });

  test("a body that is not JSON is a 400", async () => {
    const out: any = await new Promise((done) => {
      const req: any = new PassThrough();
      req.method = "POST";
      req.url = "/lsp/sync";
      req.headers = {};
      const res: any = {
        statusCode: 200,
        writeHead(c: number) {
          res.statusCode = c;
          return res;
        },
        end(chunk: any) {
          done({ status: res.statusCode, body: JSON.parse(chunk) });
        },
      };
      rute.handle(req, res, { kurungDiAkar });
      req.end("{ this is not json");
    });
    expect(out.status).toBe(400);
    expect(out.body.error).toMatch(/invalid json/);
  });
});

describe("a language with no server installed", () => {
  test("sync answers ok with missing:true — not an error", async () => {
    // This is the ordinary case on almost every machine, and the renderer's
    // answer to it is to leave the file to Monaco. Reporting it as a failure
    // would put an error in front of the user for a language they never asked
    // to have a server for.
    const r = await panggil("POST", "/lsp/sync", {
      root: AKAR,
      path: path.join(AKAR, "a.cobol"),
      languageId: "cobol",
      text: "",
    });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.missing).toBe(true);
  });

  test("diagnostics say hasServer:false rather than an empty list", async () => {
    // An empty list means "a server looked and found nothing wrong". The
    // renderer must not confuse the two: clearing markers on "no server" would
    // erase Monaco's own TypeScript diagnostics.
    const r = await panggil(
      "GET",
      "/lsp/diagnostics?root=" +
        encodeURIComponent(AKAR) +
        "&path=" +
        encodeURIComponent(path.join(AKAR, "a.cobol")) +
        "&language=cobol",
    );
    expect(r.status).toBe(200);
    expect(r.body.hasServer).toBe(false);
    expect(r.body.diagnostics).toBe(null);
  });
});

describe("end to end, through the routes, with a server that answers", () => {
  let root = "";
  let file = "";

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "uji-lsp-rute-"));
    const bin = path.join(root, "node_modules", ".bin");
    fs.mkdirSync(bin, { recursive: true });
    const fake = path.join(root, "srv.cjs");
    fs.writeFileSync(
      fake,
      `
let rest = Buffer.alloc(0);
function send(m){const b=Buffer.from(JSON.stringify(m),"utf8");
process.stdout.write("Content-Length: "+b.length+"\\r\\n\\r\\n");process.stdout.write(b);}
process.stdin.on("data",(c)=>{rest=Buffer.concat([rest,c]);for(;;){
const e=rest.indexOf("\\r\\n\\r\\n"); if(e<0)return;
const n=Number(/Content-Length:\\s*(\\d+)/i.exec(rest.slice(0,e).toString("ascii"))[1]);
if(rest.length<e+4+n)return;
const m=JSON.parse(rest.slice(e+4,e+4+n).toString("utf8"));rest=rest.slice(e+4+n);go(m);}});
function go(m){
 if(m.method==="initialize")return send({jsonrpc:"2.0",id:m.id,result:{capabilities:{hoverProvider:true}}});
 if(m.method==="textDocument/didOpen")return send({jsonrpc:"2.0",method:"textDocument/publishDiagnostics",
   params:{uri:m.params.textDocument.uri,diagnostics:[{range:{start:{line:0,character:0},end:{line:0,character:4}},severity:1,message:"salah"}]}});
 if(m.method==="textDocument/hover")return send({jsonrpc:"2.0",id:m.id,result:{contents:{kind:"plaintext",value:"halo dari server"}}});
 if(m.method==="shutdown")return send({jsonrpc:"2.0",id:m.id,result:null});
 if(m.method==="exit")process.exit(0);}
`,
    );
    if (process.platform === "win32")
      fs.writeFileSync(
        path.join(bin, "gopls.CMD"),
        '@echo off\r\nnode "' + fake + '" %*\r\n',
      );
    else {
      const p = path.join(bin, "gopls");
      fs.writeFileSync(p, '#!/bin/sh\nexec node "' + fake + '" "$@"\n');
      fs.chmodSync(p, 0o755);
    }
    file = path.join(root, "main.go");
    fs.writeFileSync(file, "package main\n");
  });

  afterAll(async () => {
    await rute.stopAll();
  });

  test("sync starts the server and reports which one", async () => {
    const r = await panggil("POST", "/lsp/sync", {
      root,
      path: file,
      languageId: "go",
      text: "package main\n",
    });
    expect(r.body.ok).toBe(true);
    expect(r.body.missing).toBe(false);
    expect(r.body.server).toBe("go");
  });

  test("diagnostics come back through the route", async () => {
    await new Promise((r: any) => setTimeout(r, 300));
    const r = await panggil(
      "GET",
      "/lsp/diagnostics?root=" +
        encodeURIComponent(root) +
        "&path=" +
        encodeURIComponent(file) +
        "&language=go",
    );
    expect(r.body.hasServer).toBe(true);
    expect(r.body.diagnostics[0].message).toBe("salah");
  });

  test("ask returns the server's answer", async () => {
    const r = await panggil("POST", "/lsp/ask", {
      root,
      path: file,
      languageId: "go",
      kind: "hover",
      line: 0,
      character: 3,
      text: "package main\n",
    });
    expect(r.body.ok).toBe(true);
    expect(r.body.result.contents.value).toBe("halo dari server");
  });

  test("close is accepted and the file is forgotten", async () => {
    const r = await panggil("POST", "/lsp/close", {
      root,
      path: file,
      languageId: "go",
    });
    expect(r.body.ok).toBe(true);
  });
});
