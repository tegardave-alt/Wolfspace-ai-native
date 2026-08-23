# WOLFSPACE — Peta Arsitektur (Analogi Motor)

Dokumen ini memetakan **keseluruhan** WOLFSPACE seperti mesin: saklar → starter → piston → kabel.  
Tujuan: saat membaca kode (termasuk buatan AI), kamu selalu tahu **siapa yang menyalakan apa**, dan **apa yang terhubung ke mana**.

---

## 0. Model mental satu kalimat

```
UI (public/)  ⇄  Electron IPC  ATAU  HTTP :8090
                    ⇄  core.js → server.cjs
                         ⇄  agent/* + core/* + scripts/ww.ts
```

- **Jalur produk utama:** `npm run app` → desktop Electron (backend **in-process**, UI lewat `app://`).
- **Jalur sekunder:** `npm start` → server HTTP di `127.0.0.1:8090`.

Satu **mesin logika** (`server.cjs` lewat `core.js`), dua **cara menyalakan kabel** (IPC vs HTTP).

---

## 1. Kamus analogi

| Motor                       | Di kode WOLFSPACE                                                               |
| --------------------------- | ------------------------------------------------------------------------------- |
| **Saklar / starter**        | `npm run app`, klik UI, route API, event, IPC channel                           |
| **Kunci kontak / baterai**  | `config.json`, API keys (`keys-path`), `config/prompts.json`, `config/mcp.json` |
| **Mesin utama**             | `server.cjs` (+ `core.js` untuk Electron tanpa port)                            |
| **Kabbin / dashboard**      | UI React di `public/` (`index.html` → modul → `app.jsx`)                        |
| **Piston**                  | Modul/fungsi yang benar-benar dipanggil                                         |
| **Kabel / rantai timing**   | `import`/`require`, `fetch`, IPC, SSE/stream, `CustomEvent`, callback           |
| **Kopling**                 | Transport: Electron IPC **atau** HTTP — memutus/menghubungkan UI ↔ server       |
| **Oli / rem / kurungan**    | jail bash, broker, sandbox, `safe-edit`, `workspace_root`, snapshot             |
| **Knalpot / spoiler palsu** | Dead code, komentar usang, endpoint yang ada tapi UI tak memakai                |

**Aturan baca:** ikuti **saklar nyata**, bukan nama file yang keren. Kalau tak ada yang memanggil, itu bukan piston — itu suku cadang di gudang.

---

## 2. Cara menyalakan mesin (boot)

### 2.1 Saklar di `package.json`

| Saklar            | Starter                    | Yang ikut hidup                    |
| ----------------- | -------------------------- | ---------------------------------- |
| `npm run app`     | `node scripts/app.cjs`     | Electron + backend in-process      |
| `npm run app:wsl` | `scripts/wsl-app.cjs`      | Backend WSL + URL eksternal        |
| `npm start`       | `node server.cjs`          | HTTP listen (default `:8090`)      |
| `npm run dev`     | nodemon → `server.cjs`     | sama + auto-reload                 |
| `npm run dist`    | electron-builder           | paket; `main` → `electron/main.js` |
| `npm test`        | Jest                       | `tests/*`                          |
| `npm run live`    | browser-sync proxy `:8090` | hot UI statis                      |
| `npm run profil`  | `scripts/profil-beku.cjs`  | attach inspect                     |

### 2.2 Rantai desktop (produk)

```
saklar:  npm run app
   │
   ▼
starter: scripts/app.cjs
   │  clear ELECTRON_RUN_AS_NODE, optional profile/inspect
   ▼
electron/main.js
   ├─ protocol app://  →  public/ + preview-file
   ├─ registerIpc()    →  channel WOLFSPACE:*
   ├─ startBackend()   →  core.js in-process (tanpa child model lokal)
   ├─ createWindow()   →  app://WOLFSPACE/index.html
   ├─ fs.watch(...)    →  HMR UI / reloadCore (ditunda jika agent sibuk)
   └─ first IPC use    →  require(core.js) → require(server.cjs) SEBAGAI MODUL
                                              (tidak listen port)
```

### 2.3 Rantai HTTP murni

```
saklar:  npm start  (node server.cjs, require.main === module)
   │
   ▼
config.json → HOST/PORT
   │
   ▼
http.createServer(handler) → listen
   │
   └─ optional startWwWatcher() jika config.ww.watch
```

### 2.4 Shim terkait

| File                                         | Peran motor                                                |
| -------------------------------------------- | ---------------------------------------------------------- |
| `core.js`                                    | Adaptor: ekspor logika `server.cjs` untuk IPC (tanpa port) |
| `boot.js`                                    | Bukan starter app; trampoline eval (jalur terpisah)        |
| `Wolfspace.cmd` / `start.ps1` / `launch.ps1` | Saklar OS di luar npm                                      |

### 2.5 Kunci kontak (`config` & rahasia)

| Berkas / lokasi                     | Isi                                                 |
| ----------------------------------- | --------------------------------------------------- |
| `config.json`                       | host/port, runners, `ww.root` / `ww.watch`, verbose |
| `config/prompts.json`               | system prompt chat + self-agent                     |
| `config/mcp.json`                   | definisi server MCP                                 |
| `config/.mcp-pids/`                 | jejak PID child MCP                                 |
| `plugins/_disetujui.json`           | capability plugin yang disetujui                    |
| keys lewat `agent/keys-path.cjs`    | API key di luar tree proyek                         |
| `~/.wolfspace/…`                    | rag, migrasi, data user                             |
| `.wolfspace/snapshots` / quarantine | jejak safe-edit                                     |

---

## 3. Kabbin — UI (`public/`)

### 3.1 Starter UI

```
public/index.html
  ├─ vendor: react, babel, monaco, xterm, mermaid, cytoscape, three…
  ├─ loadApp():
  │    fetch APP_MODULES (urutan tetap) + /app.jsx
  │    Babel.transform per modul → satu <script> global
  │    pin build bagus ke localStorage (rollback jika crash)
  └─ styles: public/styles.css
```

**Urutan APP_MODULES** (kabel wajib: yang di atas harus ada sebelum `App` render):

1. `app/Config.jsx`
2. `app/IkonBahasa.jsx`
3. `app/Viewport.jsx`
4. `app/Icons.jsx`
5. `app/Model3DViewer.jsx`
6. `app/VisualTools.jsx`
7. `app/CodeBlocks.jsx`
8. `app/Views.jsx`
9. `app/PluginsView.tsx` (opsional)
10. `app/Components.jsx` — TopBar, Composer, Message, TodoPanel, …
11. `app/Screens.jsx` — ProjectPicker, VSCodeTerminal, …
12. `app/Sidebar.jsx`
13. `app/AgentSteps.jsx`
14. `app/usePreviewPanel.jsx`
15. lalu **`public/app.jsx`** — `function App()` = dashboard utama

### 3.2 Piston UI → siapa menggerakkan siapa

| Piston                                        | Saklar khas                   | Menyambung ke                                            |
| --------------------------------------------- | ----------------------------- | -------------------------------------------------------- |
| `App()` di `app.jsx`                          | mount / state global          | semua panel; stream agent/chat; Logic; terminal; preview |
| `Sidebar.jsx`                                 | buka app, pilih workspace     | `/ww/list`, git, branch, delete, `selectedProject`       |
| `Composer` (`Components.jsx`)                 | kirim pesan                   | `streamSelfAgent` / `streamChat`                         |
| `AgentSteps.jsx`                              | event langkah agent           | tampilan tool call / HITL                                |
| `LogicFileTree` + `LogicCodePane` (`app.jsx`) | panel Logic / klik file       | `devFiles`, `/ww/tulis-berkas`, `/preview-file?raw=1`    |
| `VSCodeTerminal` (`Screens.jsx`)              | buka terminal                 | IPC `terminal` atau `/api/terminal/*`                    |
| `usePreviewPanel.jsx`                         | agent tulis `.html` / omnibox | `/preview-file` atau IPC `browser`                       |
| `VisualTools.jsx`                             | mode picker/gambar            | DOM UI + iframe same-origin                              |
| `Views.jsx`                                   | navigasi history              | riwayat chat penuh                                       |
| `PluginsView` / settings                      | pasang plugin, MCP, key       | `/plugins/*`, `/mcp/*`, `/cloud-*`                       |
| `services/api.js`                             | opsional                      | alternatif client; jalur utama sudah di `app.jsx`        |

### 3.3 Kopling transport UI ↔ mesin

```
window.WOLFSPACE.ipc ada?  (Electron default)
  YA:
    IPC.stream("chat" | "self-agent", …)
    IPC.invoke("api", { method, path, body })   ← fetch("/…") di-shim ke sini
    IPC.invoke("terminal" | "browser" | "selectFolder" | …)
  TIDAK:  (browser murni / WOLFSPACE_BACKEND)
    fetch("/chat"), fetch("/self-agent"), SSE, …
```

Shim `fetch` di `app.jsx`: path relatif `"/…"` di Electron → IPC `api`, supaya **satu call-site** untuk desktop dan browser.

---

## 4. Poros tengah — server + rute

### 4.1 Starter handler

- **HTTP:** `server.cjs` → `http.createServer`
- **Electron:** `electron/main.js` → channel `api` / stream → handler yang **sama** lewat `core.js`

Modul rute terpisah (`server/routes/*`) didaftarkan dulu, sisanya inline di `server.cjs`.

### 4.2 Kelompok rute (piston API)

| Kelompok     | Path utama                                           | Piston berikutnya                        |
| ------------ | ---------------------------------------------------- | ---------------------------------------- |
| Health       | `GET /healthz`                                       | status proses                            |
| Chat         | `POST /chat`                                         | `agent/chat.cjs`                         |
| Self-agent   | `POST /self-agent`                                   | `agent/self_agent.ts`                    |
| Agent lama   | `POST /agent`                                        | loop WRITE/RUN di server (jalur warisan) |
| Workspace ww | `/ww/*`                                              | `scripts/ww.ts` + fs (lihat §5)          |
| MCP          | `/mcp`, `/mcp/status`, `/mcp/connect`, `/mcp/toggle` | `agent/mcp-client.cjs`                   |
| Plugin       | `/plugins`, pasang/copot/setujui                     | `agent/plugins.cjs`                      |
| Cloud keys   | `/cloud-save`, `/detect-key`, `/cloud-providers`     | `server/routes/cloud.cjs`, `keys-path`   |
| Terminal     | `/api/terminal/*`                                    | `server/routes/terminal.cjs` → node-pty  |
| DAP/debug    | `/dap/*`, `/debug/*`                                 | `server/routes/dap.cjs`, `core/dap*.cjs` |
| Preview      | `/preview-file`, `/preview-file-assets/*`            | baca HTML/aset dari disk                 |
| RAG          | `/rag/ingest`, `/rag/retrieve`                       | `agent/rag.cjs`                          |
| Snapshot     | `/api/snapshots`, `/api/rollback`                    | `agent/snapshot.cjs`                     |
| Complete     | `/complete`, `/pycomplete`                           | ghost text / Jedi                        |
| Attach       | `/attach`, `/upload`                                 | `attachment-bridge.cjs`                  |
| Flow         | `POST /flow/http`                                    | node HTTP di logic canvas                |
| Static       | `GET /*`                                             | `public/` (+ `.br`/`.gz` bila ada)       |

### 4.3 IPC Electron (kabel desktop)

**preload** (`electron/preload.js`) membuka `window.WOLFSPACE`:

| API                        | Channel                             |
| -------------------------- | ----------------------------------- |
| `invoke(channel, payload)` | `WOLFSPACE:invoke`                  |
| `stream(...)`              | `WOLFSPACE:stream` / chunk / cancel |
| `terminal.*`               | invoke `terminal`                   |
| `onBrowser` / `onHmr`      | event dari main                     |

**main** handle invoke:

| Channel        | Fungsi                                      |
| -------------- | ------------------------------------------- |
| `ping`         | hidup?                                      |
| `selectFolder` | dialog folder native                        |
| `reloadCore`   | buang `require.cache`, muat ulang `core.js` |
| `browser`      | panel `WebContentsView` (live browser)      |
| `api`          | proksi handler HTTP in-process              |
| `cloudKeys`    | nama provider saja                          |
| `terminal`     | open/write/read/resize/close/list           |

**Stream:** `chat` → `chatStream`; `self-agent` → `selfAgentStream`.

**Rem HMR:** selama stream self-agent masih “panas”, reload dari `fs.watch` ditunda agar `thread_id` tidak hilang di tengah jalan.

---

## 5. Sistem workspace (ww) — garasi terisolasi

### 5.1 Otak disk/git

**Starter logika:** `scripts/ww.ts`  
Dipakai sebagai CLI (`create|adopt|list|watch`) **dan** `require()` dari server.

### 5.2 Kabel `/ww/*` ↔ UI ↔ agent

```
Sidebar / Screens
  GET  /ww/list          → listWorkspaces(root)
  POST /ww/attach        → initWorkspace
  POST /ww/verify        → path masih valid?
  POST /ww/delete        → hapus (wajib .ww.json)
  GET  /ww/git|branches  → status git
  POST /ww/branch/*|commit|rename → mutasi git + folder

Logic editor (app.jsx)
  POST /ww/tulis-berkas  → simpan Monaco
  POST /ww/buat-berkas   → file/folder baru
  POST /ww/hapus-berkas  → hapus (folder butuh folder:true)
  GET  /ww/pustaka       → saran import
  GET  /ww/tree          → walk disk (ADA di server; lihat §10)

App state
  selectedProject → resolveWorkspaceRoot() → workspace_root
       → self_agent / tools mengurung path agent ke folder itu
```

### 5.3 Explorer di UI — dua “garasi” berbeda

| Bagian                    | Bukan / Iya                   | Sumber data                                                         |
| ------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| **Sidebar Workspaces**    | daftar folder project         | `/ww/list` + localStorage + disk                                    |
| **LogicFileTree**         | pohon berkas kerja            | `devFiles` / `devFolders` (file yang disentuh), **bukan** full disk |
| Kata `explorer` di source | biasanya **Windows Explorer** | komentar saja                                                       |

Alur file muncul di pohon Logic:

```
agent sukses write/edit/create
  → app.jsx dispatch CustomEvent "wolfspace_agent_act"
  → setDevFiles(...)
  → LogicFileTree = buildDevTree(devFiles, root, devFolders)
  → klik → bukaTab → LogicCodePane → /preview-file?raw=1
```

---

## 6. Mesin agent (`agent/*`)

### 6.1 Rantai utama self-agent

```
saklar:  Composer kirim tugas agent
   │
   ▼
kopling: IPC.stream("self-agent")  ATAU  POST /self-agent
   │
   ▼
starter: agent/self_agent.ts :: selfAgentStream
   ├─ prompts (config/prompts.json, sysprompt_opt, rules)
   ├─ cloud.cjs          → model BYOK (OpenAI/Claude/Gemini/… )
   ├─ LangGraph (lazy)   → loop langkah
   ├─ tools.cjs → tools/index.cjs :: runSelfTool
   ├─ temuan.cjs         → ingat fakta lintas history terpotong
   ├─ pseudo-tag-filter  → selamatkan tool-call berbentuk teks
   ├─ snapshot / safe-edit hooks
   ├─ mcp-client         → tool dinamis bila MCP connect
   └─ emit event langkah → UI AgentSteps
```

Jalur paralel:

- `POST /chat` → `agent/chat.cjs` (lebih sederhana; bisa tetap sentuh tools)
- `POST /agent` → loop lama di `server.cjs`

### 6.2 Piston tools (katalog ≈ `tools/tool-definitions.cjs`)

| Keluarga tool                               | Implementasi / kabel                                         |
| ------------------------------------------- | ------------------------------------------------------------ |
| list, glob, read, grep, edit, write, …      | `file-tools.cjs` + `safe-edit` + `code-quality` + `snapshot` |
| bash                                        | `bash-jail`, appcontainer/WSL jail, env quarantine           |
| sandbox_run                                 | `sandbox.cjs` + `sandbox-policy` + `penegakan`               |
| capability_exec                             | `broker/*` (policy deny-by-default, zone, audit)             |
| web_search / fetch / extract                | `web.cjs` (+ Playwright extract)                             |
| git                                         | `git-tool.cjs`                                               |
| skill_list / skill_run                      | `skills.cjs` + `skills/*.cjs`                                |
| terminal_*                                  | sesi PTY (`core/terminal.cjs` / server sessions)             |
| retrieve                                    | `rag.cjs`                                                    |
| attachment_*                                | `attachment-bridge.cjs`                                      |
| architecture_map, gen3d, dspy, todowrite, … | tool khusus di index                                         |
| tool MCP                                    | digabung runtime lewat `mcp-client.cjs`                      |

### 6.3 Rem & oli (isolasi) — urutan kasar

```
runSelfTool
  → kurung path (workspace_root / qResolve)
  → bash-jail / appcontainer / wsl-jail (sesuai platform)
  → broker zone + policy (capability_exec)
  → sandbox session bila diminta
  → penegakan melaporkan siapa yang menolak/mengizinkan
```

### 6.4 Modul agent pendukung

| File                                | Peran                                 |
| ----------------------------------- | ------------------------------------- |
| `cloud.cjs`                         | stream multi-provider                 |
| `keys-path.cjs`                     | lokasi aman API key                   |
| `mcp-client.cjs`                    | hidupkan MCP stdio                    |
| `plugins.cjs`                       | pasang plugin → MCP + izin            |
| `safe-edit.cjs`                     | snapshot → quality → tulis/quarantine |
| `snapshot.cjs`                      | rollback titik aman                   |
| `code-quality.cjs`                  | ratchet kualitas suntingan            |
| `prompts.cjs` / `sysprompt_opt.cjs` | prompt                                |
| `rag.cjs`                           | indeks per proyek                     |
| `web.cjs`                           | jaringan keluar (dengan cek)          |
| `temuan.cjs`                        | memori temuan                         |
| `attachment-bridge.cjs`             | lampiran tanpa bocor path host        |
| `debug.cjs` / `trace.cjs`           | bus debug / jejak                     |
| `penegakan.cjs`                     | kosakata penegakan seragam            |
| `platform/*`                        | adaptor Windows vs POSIX              |
| `broker/*`                          | gerbang capability host               |

Bridge MCP HTTP→stdio: `scripts/mcp-http-bridge.cjs`.

---

## 7. Terminal, debug, browser live

### 7.1 Terminal

```
saklar: buka panel terminal
  UI: Screens.jsx VSCodeTerminal (xterm)
    ├─ Electron: window.WOLFSPACE.terminal.* → IPC → sesi node-pty
    └─ HTTP: /api/terminal/* → server/routes/terminal.cjs
Agent tool terminal_* bisa pakai jalur PTY terpisah (core/terminal.cjs)
Worker: terminal-worker.cjs (varian worker_thread)
```

### 7.2 DAP / debug

```
saklar: tombol Run/Debug di Logic / permintaan debug
  → /dap/mulai|aksi|titik-henti|tutup + GET keadaan
  → server/routes/dap.cjs
  → core/dap-sesi.cjs → core/dap.cjs
  → adapter: debugpy / js-debug / dlv / …
GET /debug/tersedia → debugger apa yang terpasang
```

(Alternatif sederhana: jalankan `pdb`/`rdbg` langsung di terminal.)

### 7.3 Preview / live browser

| Mode                 | Saklar                 | Piston                                                          |
| -------------------- | ---------------------- | --------------------------------------------------------------- |
| Iframe preview       | agent tulis HTML / URL | `usePreviewPanel` → `/preview-file` atau `app://…/preview-file` |
| Panel browser native | IPC `browser`          | `WebContentsView` di `main.js`                                  |
| Editor Logic         | pilih file di tree     | `/preview-file?raw=1` baca; `/ww/tulis-berkas` tulis            |

---

## 8. Diagram hierarki full (seluruh mesin)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ SAKLAR NYALA                                                              │
│   npm run app → scripts/app.cjs → electron/main.js                        │
│   npm start   → server.cjs listen :8090                                   │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
        ┌───────────────────────┴────────────────────────┐
        │ ELECTRON                                        │ HTTP
        │  app:// → public/                               │  static public/
        │  IPC (tanpa child model lokal)                  │  CORS + listen
        │  core.js → server.cjs (tanpa listen)            │  server.cjs listen
        └───────────────────────┬─────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────┐
│ KABBIN (renderer)                                                         │
│  index.html → Babel(APP_MODULES + app.jsx) → App()                        │
│    Sidebar │ Composer │ Messages/AgentSteps │ Logic tree+Monaco           │
│    Terminal │ Preview │ VisualTools │ Plugins/Settings │ Todo             │
│  kopling: IPC (default desktop) ATAU fetch/SSE                            │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────┐
│ POROS (server.cjs + server/routes/*)                                      │
│  /chat → chat.cjs          /self-agent → self_agent.ts                   │
│  /ww/* → ww.ts + fs       /mcp/* → mcp-client                            │
│  /api/terminal/*           /dap/* → dap-sesi → dap                        │
│  /preview-file             /plugins/*  /rag/*  /cloud-*  /debug*          │
│  /cloud-providers /attach + static public/                                │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────┐
│ MESIN AGENT                                                               │
│  self_agent loop                                                          │
│    → cloud (BYOK)                                                         │
│    → runSelfTool                                                          │
│         file/edit (+ safe-edit + snapshot + quality)                      │
│         bash jails / sandbox_run / capability_exec(broker)                │
│         web / git / rag / skills / MCP / terminal / 3d / …                │
│    → temuan + prompts + filter tag + attachment                           │
│    → event UI (AgentSteps, wolfspace_agent_act → tree + preview)          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Cheat sheet: aksi manusia → rantai piston

| Aksi user                        | Saklar                  | Rantai (disingkat)                                                 |
| -------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| Buka app desktop                 | `npm run app`           | app.cjs → main.js → app:// UI + core in-process                    |
| Pilih / attach folder            | picker / attach         | `selectFolder` dan/atau `POST /ww/attach` → ww → `selectedProject` |
| Kirim tugas agent                | Composer submit         | stream `self-agent` → self_agent → tools → AgentSteps              |
| Kirim chat biasa                 | mode chat               | stream `chat` → chat.cjs → cloud/local                             |
| Agent menulis file               | tool write/edit         | disk + safe-edit → event `wolfspace_agent_act` → `devFiles` → tree |
| Simpan di Logic                  | Ctrl+S / save Monaco    | `POST /ww/tulis-berkas` (kurung di server)                         |
| Buat/hapus file di tree          | menu pohon              | `/ww/buat-berkas` / `/ww/hapus-berkas`                             |
| Buka isi file                    | klik di LogicFileTree   | `bukaTab` → `/preview-file?raw=1` → Monaco                         |
| Preview HTML                     | tulis `.html` / omnibox | usePreviewPanel dan/atau IPC `browser`                             |
| Terminal                         | buka panel              | terminal open → pty → xterm                                        |
| Debug                            | tombol debug            | `/dap/*` → adapter                                                 |
| Git di sidebar                   | pill / folder options   | `/ww/git`, branches, commit, rename                                |
| Pasang MCP                       | UI MCP                  | `/mcp/connect` → mcp-client spawn                                  |
| Pasang plugin                    | UI plugins              | `/plugins/pasang` → setujui → tool gated                           |
| Simpan API key                   | settings                | `/cloud-save` / detect-key → keys-path                             |
| Agent mengedit WOLFSPACE sendiri | tool write di QROOT     | snapshot + syntax + quality; HMR ditunda sampai run selesai        |

---

## 10. Spoiler & suku cadang (jangan tertipu)

Hal-hal yang **ada di mesin** tapi perilaku/kabelnya perlu dibaca hati-hati:

| Item                    | Kenyataan                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET /ww/tree`          | Hidup di `server.cjs`; pohon Logic utama memakai `buildDevTree(devFiles)`, bukan full walk tiap render |
| Tab "Changes" di Logic  | Dihapus secara sadar — dulu tak tersambung data nyata                                                  |
| Auto-run setiap jawaban | Pipeline lama dihapus; verifikasi = agent memanggil tool run sendiri                                   |
| `POST /agent`           | Jalur warisan; jalur produk agent = `/self-agent`                                                      |
| Kata `explorer` di grep | Hampir selalu Windows Explorer, bukan komponen UI                                                      |
| Dua manajer terminal    | Sesi UI di server vs tool agent di `core/terminal.cjs` — mirip tapi tidak identik                      |
| `services/api.js`       | Bukan satu-satunya client; `app.jsx` sudah memegang jalur utama                                        |
| `boot.js`               | Bukan cara normal menyalakan app                                                                       |

---

## 11. Pohon sekunder (bukan poros, tapi ada di bengkel)

| Path                                 | Peran                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `scripts/*`                          | launch, ww CLI, MCP bridge, compress, stress, profil, WSL                               |
| `skills/`                            | skill runtime (contoh `file-organizer.cjs`)                                             |
| `plugins/`                           | plugin terpasang + persetujuan                                                          |
| `workspace/`                         | folder kerja default agent                                                              |
| `core/*`                             | terminal + DAP murni untuk dipanggil server/agent                                       |
| `tests/*`                            | kontrak perilaku (banyak nama Indonesia = invariant)                                    |
| `docs/`                              | dokumentasi (termasuk file ini); lihat juga `PETA.md`, `SECURITY.md`, `COMMANDCHAIN.md` |
| `site/`                              | situs statis/marketing                                                                  |
| `vendor/`, `dist-app/`, `artifacts/` | vendor, hasil build, artefak                                                            |

### 11.1 Tes sebagai “uji jalan mesin”

| Cluster nama file                                            | Menguji             |
| ------------------------------------------------------------ | ------------------- |
| `broker-*`, `bash-*`, `wsl-*`, `zone-*`, `appcontainer-*`    | rem isolasi jujur   |
| `mcp-*`, `plugin-*`                                          | kabel MCP/plugin    |
| `ww-*`, `git-*`, `file-tools*`, `gate-agent-path`            | workspace + file    |
| `electron-*`, `hot-reload-*`, `rollback-*`                   | nyala desktop & HMR |
| `dap-*`, `debug-*`                                           | debug               |
| `sidebar-*`, `tab-editor*`, `monaco-*`, `composer-*`         | kabbin UI           |
| `temuan*`, `salvage-*`, `agent-run-hang*`, `prioritas-tool*` | kualitas loop agent |

---

## 12. Cara memakai dokumen ini saat baca kode

1. **Tentukan saklar** — aksi user atau script npm apa?
2. **Cari starter** — file entry di tabel boot / cheat sheet.
3. **Ikuti kabel satu arah** — jangan loncat ke file “yang kelihatan terkait”.
4. **Cek rem** — apakah path/command lewat jail, `_kurungDiAkar`, atau policy broker?
5. **Verifikasi pemanggil** — grep siapa yang `require`/fetch/invoke; nol pemanggil = suku cadang.
6. **Bandingkan dengan tes** — nama tes sering menjelaskan janji perilaku.

### Urutan baca file (first oil change)

1. `package.json` (scripts)
2. `scripts/app.cjs` → `electron/main.js` → `electron/preload.js`
3. `public/index.html` → `public/app.jsx` (wwApi, App state, Logic*)
4. `public/app/Sidebar.jsx`
5. `server.cjs` (blok `/ww/*`, `/self-agent`, static) + `server/routes/*`
6. `scripts/ww.ts`
7. `agent/self_agent.ts` → `agent/tools.cjs` / `tools/index.cjs`
8. `core.js` (apa yang diekspor ke Electron)

---

## 13. Ringkas satu halaman

```
SAKLAR        npm run app | npm start | klik UI
   ↓
STARTER       app.cjs/main.js | server.cjs | App()/Composer
   ↓
KOPLING       IPC desktop  ⟷  HTTP :8090
   ↓
POROS         server.cjs (+ routes) via core.js di Electron
   ↓
PISTON BESAR  ww workspaces | self_agent+tools | terminal | dap | preview | mcp/plugins
   ↓
REM           jail, broker, safe-edit, workspace_root, snapshot
   ↓
DASHBOARD     Sidebar + chat/agent steps + Logic tree/editor + terminal + browser
```

**Prinsip yang sama dengan motor:** tidak ada piston yang bergerak tanpa saklar dan rantai penghubung. Baca kodenya dengan mencari **saklar dulu**, baru **kabel**, baru **detail piston**.
