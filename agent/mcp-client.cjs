const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");
const { dlog } = require("./debug.cjs");

// File PID tracker: simpan PID semua proses MCP yang pernah di-spawn
// agar bisa dibunuh saat restart berikutnya.
const PID_FILE = path.join(__dirname, "..", "config", ".mcp-pids.json");

function _savePids(pids) {
  try {
    const dir = path.dirname(PID_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PID_FILE, JSON.stringify(pids), "utf8");
  } catch (_) {}
}

function _loadPids() {
  try {
    if (!fs.existsSync(PID_FILE)) return [];
    return JSON.parse(fs.readFileSync(PID_FILE, "utf8")) || [];
  } catch (_) {
    return [];
  }
}

function _killOrphans() {
  const pids = _loadPids();
  if (!pids.length) return;
  dlog("mcp", "info", `Membersihkan ${pids.length} proses MCP lama...`, {
    pids,
  });
  for (const pid of pids) {
    try {
      process.kill(pid, 0); // cek apakah masih hidup
      process.kill(pid); // bunuh jika masih ada
      dlog("mcp", "info", `MCP orphan PID ${pid} dihentikan.`);
    } catch (_) {}
  }
  // Hapus file PID setelah dibersihkan
  try {
    fs.unlinkSync(PID_FILE);
  } catch (_) {}
}

const CONFIG_PATH = path.join(__dirname, "..", "config", "mcp.json");

class MCPClient {
  constructor() {
    this.servers = {}; // serverName -> process info
    this.toolsCache = {}; // serverName -> array of tools
    this.msgId = 1;
    this.pendingReqs = {}; // msgId -> { resolve, reject }
    this.initialized = false;
  }

  _loadConfig() {
    try {
      if (!fs.existsSync(CONFIG_PATH)) return {};
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    } catch (e) {
      dlog("mcp", "error", "Gagal memuat mcp.json", { error: e.message });
      return {};
    }
  }

  async init() {
    if (this.initialized) return;

    // Bunuh semua proses MCP dari sesi sebelumnya sebelum spawn baru.
    // Ini memastikan setiap restart adalah proses yang bersih tanpa duplikat.
    _killOrphans();

    const config = this._loadConfig();
    const srvs = config.mcpServers || {};

    for (const [name, conf] of Object.entries(srvs)) {
      try {
        await this._startServer(name, conf);
      } catch (e) {
        dlog("mcp", "error", `Gagal memulai MCP server ${name}`, {
          error: e.message,
        });
      }
    }
    this.initialized = true;
  }

  _startServer(name, conf) {
    return new Promise((resolve, reject) => {
      dlog("mcp", "info", `Memulai server MCP: ${name}`, {
        cmd: conf.command,
        args: conf.args,
      });

      const env = { ...process.env, ...conf.env };
      const cmd =
        process.platform === "win32" && conf.command === "npx"
          ? "npx.cmd"
          : conf.command;
      const proc = spawn(cmd, conf.args || [], {
        env,
        shell: process.platform === "win32",
      });

      let buffer = "";

      proc.stdout.on("data", (data) => {
        buffer += data.toString();
        let nlIdx;
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nlIdx).trim();
          buffer = buffer.slice(nlIdx + 1);
          if (line) this._handleMessage(name, line);
        }
      });

      proc.stderr.on("data", (data) => {
        dlog("mcp", "warn", `[MCP ${name} stderr] ${data.toString().trim()}`);
      });

      proc.on("error", (err) => {
        dlog("mcp", "error", `[MCP ${name} process error]`, {
          err: err.message,
        });
      });

      proc.on("close", (code) => {
        dlog("mcp", "info", `MCP server ${name} ditutup dengan kode ${code}`);
        delete this.servers[name];
        delete this.toolsCache[name];
      });

      this.servers[name] = { proc, ready: false };

      // Catat PID ke file agar bisa dibunuh saat restart berikutnya
      const currentPids = _loadPids();
      if (proc.pid && !currentPids.includes(proc.pid)) {
        currentPids.push(proc.pid);
        _savePids(currentPids);
      }

      // Lakukan Initialize handshake
      this._request(name, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {
          roots: { listChanged: true },
          sampling: {},
        },
        clientInfo: { name: "WOLFSPACE", version: "1.0.0" },
      })
        .then(() => {
          // Kirim initialized notifikasi
          this._notify(name, "notifications/initialized", {});
          if (this.servers[name]) {
            this.servers[name].ready = true;
            dlog("mcp", "info", `MCP server ${name} siap.`);
          }
          resolve();
        })
        .catch((err) => {
          dlog("mcp", "error", `Gagal inisialisasi MCP server ${name}`, {
            err: err.message,
          });
          reject(err);
        });
    });
  }

  _saveConfig(configData) {
    try {
      const dir = path.dirname(CONFIG_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(configData, null, 2));
    } catch (e) {
      dlog("mcp", "error", "Gagal menyimpan mcp.json", { error: e.message });
    }
  }

  stopServer(name) {
    const srv = this.servers[name];
    if (srv && srv.proc) {
      dlog("mcp", "info", `Menghentikan MCP server: ${name}`);
      try {
        srv.proc.kill();
      } catch (e) {}
      delete this.servers[name];
      delete this.toolsCache[name];
    }
  }

  async addServer(name, conf) {
    this.stopServer(name);
    const config = this._loadConfig();
    if (!config.mcpServers) config.mcpServers = {};
    config.mcpServers[name] = conf;
    this._saveConfig(config);
    try {
      await this._startServer(name, conf);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  removeServer(name) {
    this.stopServer(name);
    const config = this._loadConfig();
    // Bedakan "terhapus" dari "memang tak ada": dulu keduanya membalas {ok:true}
    // sehingga salah ketik nama tampak berhasil dan UI diam-diam tak berubah.
    const existed = !!(config.mcpServers && config.mcpServers[name]);
    if (existed) {
      delete config.mcpServers[name];
      this._saveConfig(config);
    }
    return { ok: true, removed: existed };
  }

  getServers() {
    return this._loadConfig().mcpServers || {};
  }

  _send(name, msg) {
    const srv = this.servers[name];
    if (!srv || !srv.proc) return;
    const str = JSON.stringify(msg) + "\r\n";
    srv.proc.stdin.write(str);
  }

  _notify(name, method, params) {
    this._send(name, { jsonrpc: "2.0", method, params });
  }

  _request(name, method, params) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.pendingReqs[id] = { resolve, reject };
      this._send(name, { jsonrpc: "2.0", id, method, params });

      // Timeout 120 detik untuk setiap request
      setTimeout(() => {
        if (this.pendingReqs[id]) {
          delete this.pendingReqs[id];
          reject(new Error(`Timeout MCP request: ${method}`));
        }
      }, 120000);
    });
  }

  _handleMessage(name, line) {
    try {
      const msg = JSON.parse(line);
      // Jika ini adalah respon (memiliki id dan tidak memiliki method)
      if (msg.id !== undefined && !msg.method) {
        const p = this.pendingReqs[msg.id];
        if (p) {
          delete this.pendingReqs[msg.id];
          if (msg.error)
            p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else p.resolve(msg.result);
        }
      } else if (msg.method) {
        // Notifikasi atau request dari server (misal ping)
        dlog(
          "mcp",
          "info",
          `Menerima request/notif dari ${name}: ${msg.method}`,
        );
      }
    } catch (e) {
      dlog("mcp", "warn", `Gagal parsing MCP message dari ${name}`, {
        text: line,
        err: e.message,
      });
    }
  }

  async getTools() {
    await this.init();
    const allTools = [];

    for (const name of Object.keys(this.servers)) {
      if (!this.servers[name].ready) continue;

      try {
        if (!this.toolsCache[name]) {
          const res = await this._request(name, "tools/list", {});
          this.toolsCache[name] = res.tools || [];
        }

        // Format ulang tool agar sesuai dengan format SELF_TOOLS WOLFSPACE
        for (const t of this.toolsCache[name]) {
          const toolName = `mcp_${name}_${t.name}`; // Prefix dengan nama server untuk mencegah tabrakan nama
          const def = {
            type: "function",
            function: {
              name: toolName,
              description: `[MCP Server: ${name}] ${t.description || ""}`,
              parameters: t.inputSchema || { type: "object", properties: {} },
            },
          };
          allTools.push(def);
        }
      } catch (e) {
        dlog("mcp", "error", `Gagal fetch tools dari ${name}`, {
          error: e.message,
        });
      }
    }
    return allTools;
  }

  async callTool(prefixedToolName, args) {
    // prefixedToolName format: mcp_{serverName}_{toolName}
    const match = prefixedToolName.match(/^mcp_([^_]+)_(.+)$/);
    if (!match)
      return {
        ok: false,
        output: `Invalid MCP tool name: ${prefixedToolName}`,
      };

    const serverName = match[1];
    const toolName = match[2];

    if (!this.servers[serverName] || !this.servers[serverName].ready) {
      return { ok: false, output: `Server MCP ${serverName} is not active.` };
    }

    // BUANG argumen INTERNAL WOLFSPACE sebelum menyeberang ke protokol MCP.
    // self_agent.cjs menyuntikkan `rencana_tindakan` (chain-of-thought) ke skema
    // SEMUA tool, termasuk tool MCP. Server MCP memvalidasi argumen terhadap skema
    // miliknya sendiri yang tak mengenal field itu, lalu MENOLAK panggilannya —
    // gejalanya: MCP "terhubung" tapi setiap panggilan gagal. Field itu sudah
    // dipakai di self_agent (emit thought) SEBELUM dispatch, jadi membuangnya di
    // sini tak menghilangkan apa pun dari UI. Ini batas yang benar: satu tempat,
    // berlaku untuk semua server MCP.
    const INTERNAL_ARGS = ["rencana_tindakan"];
    let wireArgs = args;
    if (args && typeof args === "object" && !Array.isArray(args)) {
      wireArgs = {};
      for (const k of Object.keys(args)) {
        if (!INTERNAL_ARGS.includes(k)) wireArgs[k] = args[k];
      }
    }

    try {
      dlog("mcp", "info", `Memanggil tool MCP: ${toolName} di ${serverName}`, {
        args: wireArgs,
      });
      const res = await this._request(serverName, "tools/call", {
        name: toolName,
        arguments: wireArgs,
      });

      // Format balasan MCP
      if (res.isError) {
        const pesan = (res.content || []).map((c) => c.text).join("\\n");
        this._catat(serverName, false, pesan);
        return { ok: false, output: `[MCP Error] ${pesan}` };
      }

      const textOutput = (res.content || []).map((c) => c.text).join("\\n");
      this._catat(serverName, true);
      return { ok: true, output: textOutput };
    } catch (e) {
      dlog(
        "mcp",
        "error",
        `Gagal memanggil tool ${toolName} di ${serverName}`,
        { error: e.message },
      );
      this._catat(serverName, false, e.message);
      return { ok: false, output: `Error eksekusi MCP tool: ${e.message}` };
    }
  }

  // Rekam hasil panggilan TERAKHIR per server. `ready` saja tidak cukup untuk
  // menyatakan sebuah server "berfungsi": proses bisa start & berjabat tangan
  // dengan mulus, lalu SETIAP panggilan API gagal — persis yang terjadi ketika
  // token GitHub dicabut tapi UI tetap menampilkan "Connected". Status jujur
  // butuh bukti dari panggilan nyata, bukan dari keberhasilan start saja.
  _catat(name, ok, pesan) {
    const s = this.servers[name];
    if (!s) return;
    s.lastCallAt = Date.now();
    s.lastCallOk = ok;
    s.lastError = ok
      ? null
      : String(pesan || "")
          .replace(/\s+/g, " ")
          .slice(0, 200);
  }

  // Status RUNTIME per server (bukan sekadar isi config). Dipakai UI supaya badge
  // koneksi mencerminkan keadaan sebenarnya alih-alih nilai `active: true` yang
  // dulu di-hardcode di frontend.
  //   configured : ada di config/mcp.json
  //   running    : prosesnya hidup
  //   ready      : handshake initialize selesai
  //   lastCallOk : hasil panggilan tool terakhir (null bila belum pernah dipanggil)
  status() {
    const cfg = this._loadConfig().mcpServers || {};
    const out = {};
    for (const name of Object.keys(cfg)) {
      const s = this.servers[name];
      out[name] = {
        configured: true,
        running: !!(s && s.proc),
        ready: !!(s && s.ready),
        lastCallOk:
          s && typeof s.lastCallOk === "boolean" ? s.lastCallOk : null,
        lastCallAt: (s && s.lastCallAt) || null,
        lastError: (s && s.lastError) || null,
        toolCount: (this.toolsCache[name] || []).length,
      };
    }
    return out;
  }
}

// Ekspor instance singleton
const mcpClient = new MCPClient();
module.exports = mcpClient;
