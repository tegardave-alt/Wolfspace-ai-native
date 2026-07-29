const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");
const { dlog } = require("./debug.cjs");

// File PID tracker: simpan PID semua proses MCP yang pernah di-spawn agar bisa
// dibunuh saat restart berikutnya.
//
// TIAP CATATAN MENYIMPAN PEMILIKNYA: { pid, owner, at }. Dulu isinya cuma
// [pid, pid], dan berkas ini DIPAKAI BERSAMA semua proses Node — sehingga
// "orphan" tak bisa dibedakan dari server HIDUP milik proses lain yang sedang
// berjalan. Akibatnya terukur pada 3 proses serentak: satu proses menunggu 127
// detik lalu jalan dengan 26 dari 50 tool, karena server-nya dibunuh tetangga
// tepat saat handshake. Kegagalannya SENYAP — tak ada error, agent hanya
// kehilangan separuh kemampuan MCP tanpa tahu.
//
// Dengan owner tercatat, yatim = catatan yang PEMILIKNYA sudah mati. Server
// milik proses yang masih hidup tak pernah disentuh.
const PID_FILE = path.join(__dirname, "..", "config", ".mcp-pids.json");

function _alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function _savePids(entries) {
  try {
    const dir = path.dirname(PID_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PID_FILE, JSON.stringify(entries), "utf8");
  } catch (_) {}
}

function _loadPids() {
  try {
    if (!fs.existsSync(PID_FILE)) return [];
    const raw = JSON.parse(fs.readFileSync(PID_FILE, "utf8")) || [];
    // Toleran terhadap format lama ([pid, pid]) supaya upgrade tak menabrak
    // berkas yang sudah ada: tanpa owner, anggap pemiliknya sudah mati.
    return raw
      .map((e) => (typeof e === "number" ? { pid: e, owner: 0, at: 0 } : e))
      .filter((e) => e && typeof e.pid === "number");
  } catch (_) {
    return [];
  }
}

function _killOrphans() {
  const entries = _loadPids();
  if (!entries.length) return;

  const orphans = entries.filter((e) => !e.owner || !_alive(e.owner));
  const kept = entries.filter((e) => e.owner && _alive(e.owner));

  if (orphans.length) {
    dlog("mcp", "info", `Membersihkan ${orphans.length} proses MCP yatim...`, {
      pids: orphans.map((e) => e.pid),
      dipertahankan: kept.length,
    });
    for (const e of orphans) {
      try {
        if (!_alive(e.pid)) continue;
        process.kill(e.pid);
        dlog("mcp", "info", `MCP orphan PID ${e.pid} dihentikan.`);
      } catch (_) {}
    }
  }

  // Simpan kembali catatan milik proses yang MASIH HIDUP. Dulu berkasnya
  // dihapus seluruhnya, sehingga server proses lain kehilangan jejaknya dan
  // benar-benar menjadi yatim saat proses itu berakhir.
  if (kept.length) _savePids(kept);
  else {
    try {
      fs.unlinkSync(PID_FILE);
    } catch (_) {}
  }
}

const CONFIG_PATH = path.join(__dirname, "..", "config", "mcp.json");

// Panggilan tool nyata boleh lama (kueri Notion, dsb).
const REQUEST_TIMEOUT_MS = 120000;
// Handshake harus gagal cepat. Dengan 120 detik dan start BERURUTAN, dua server
// bermasalah membuat getTools() — yang memblokir langkah PERTAMA agent —
// menggantung 4 menit sebelum agent sempat berbuat apa pun.
const HANDSHAKE_TIMEOUT_MS = 25000;

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

    // PARALEL, bukan berurutan. Server-server ini tidak saling bergantung, dan
    // getTools() memblokir langkah pertama agent — dengan `await` di dalam loop,
    // waktu tunggunya adalah JUMLAH semua server, bukan yang terlama. Satu
    // server lambat/mati menahan seluruh agent.
    await Promise.all(
      Object.entries(srvs).map(([name, conf]) =>
        this._startServer(name, conf).catch((e) => {
          dlog("mcp", "error", `Gagal memulai MCP server ${name}`, {
            error: e.message,
          });
        }),
      ),
    );
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

      // Catat PID + PEMILIK agar proses lain tahu server ini masih bertuan.
      const currentPids = _loadPids();
      if (proc.pid && !currentPids.some((e) => e.pid === proc.pid)) {
        currentPids.push({ pid: proc.pid, owner: process.pid, at: Date.now() });
        _savePids(currentPids);
      }

      // Lakukan Initialize handshake
      this._request(
        name,
        "initialize",
        {
          protocolVersion: "2024-11-05",
          capabilities: {
            roots: { listChanged: true },
            sampling: {},
          },
          clientInfo: { name: "WOLFSPACE", version: "1.0.0" },
        },
        HANDSHAKE_TIMEOUT_MS,
      )
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

  // timeoutMs dapat ditimpa: handshake `initialize` harus gagal CEPAT (server
  // yang sehat menjawabnya dalam hitungan detik), sedangkan panggilan tool nyata
  // memang bisa lama dan tetap memakai 120 detik.
  _request(name, method, params, timeoutMs = REQUEST_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      // Timer di-clear saat request selesai. Dulu tidak: tiap request menahan
      // timer 120 detik sampai habis, sehingga proses menolak keluar jauh
      // setelah pekerjaannya rampung.
      const timer = setTimeout(() => {
        if (this.pendingReqs[id]) {
          delete this.pendingReqs[id];
          reject(new Error(`Timeout MCP request: ${method}`));
        }
      }, timeoutMs);
      if (timer.unref) timer.unref();
      this.pendingReqs[id] = {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      this._send(name, { jsonrpc: "2.0", id, method, params });
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

// Singleton yang BERTAHAN LINTAS HOT-RELOAD.
//
// GEJALA YANG DIPERBAIKI: koneksi MCP mati di tengah pemakaian lalu hidup lagi
// sendiri, tanpa ada yang menyentuhnya.
//
// SEBABNYA: watcher backend di electron/main.js membuang SELURUH require.cache
// di bawah root setiap kali berkas .cjs berubah — kejadian rutin pada aplikasi
// yang menyunting dirinya sendiri. Modul ini ikut terbuang, sehingga require
// berikutnya membuat MCPClient BARU dengan initialized=false. init() lalu
// memanggil _killOrphans(), yang membaca .mcp-pids.json dan MEMBUNUH proses MCP
// yang masih melayani permintaan — disangka sisa sesi sebelumnya. Sesudah itu ia
// spawn ulang, sehingga koneksinya "hidup sendiri".
//
// Terreproduksi: start MCP -> tiru bust cache watcher -> require ulang -> init()
// -> 2 dari 2 proses yang hidup terbunuh.
//
// Menyimpan instance di globalThis membuat require setelah reload mengembalikan
// objek yang SAMA: initialized tetap true, init() langsung kembali, _killOrphans
// tak pernah jalan, dan handle proses di this.servers tetap utuh. Pola ini sudah
// dipakai agent/self_agent.cjs untuk checkpointer HITL dengan alasan persis sama.
const mcpClient =
  globalThis.__wolfspaceMcpClient ||
  (globalThis.__wolfspaceMcpClient = new MCPClient());

// Kait uji. Diekspor karena satu-satunya cara lain memicu _killOrphans adalah
// init(), yang men-spawn server MCP sungguhan lewat `npx` — lambat, butuh
// jaringan, dan justru mengaburkan yang ingin diuji: keputusan bunuh/pertahankan.
mcpClient._killOrphans = _killOrphans;
mcpClient._loadPids = _loadPids;
mcpClient._savePids = _savePids;
mcpClient.PID_FILE = PID_FILE;

module.exports = mcpClient;
