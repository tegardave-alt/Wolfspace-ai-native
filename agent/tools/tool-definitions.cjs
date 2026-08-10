// Tool definitions (OpenAI function-calling format)
// ── Tool definitions (OpenAI function-calling format) ──
// NOTE: disk_* tools removed from defaults — only project-scoped tools exposed.
// Disk tools are still implemented in tools/index.cjs if needed dynamically.
const SELF_TOOLS = [
  {
    type: "function",
    function: {
      name: "task",
      description:
        "Spawn a focused SUB-AGENT to handle ONE self-contained sub-task.",
      parameters: {
        type: "object",
        properties: {
          goal: {
            type: "string",
            description: "one clear, self-contained sub-task",
          },
        },
        required: ["goal"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list",
      description: "List project source files.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "architecture_map",
      description:
        "Peta arsitektur: analisis dependensi require() NYATA antar modul di sebuah scope, lalu hasilkan diagram Mermaid (dirender inline di UI). Pakai saat user minta menggambar/memetakan arsitektur, struktur, atau dependensi kode. Sertakan blok ```mermaid dari output verbatim di jawaban.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            description:
              "folder yang dipetakan: 'agent' (default) | 'server' | 'all' | subfolder lain",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "glob",
      description:
        "Find files by wildcard (e.g. public/**/*.jsx, *agent*). Supports semantic intent search with `intent` param.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          intent: {
            type: "string",
            enum: [
              "credential",
              "temporary",
              "build_output",
              "backup",
              "config_sensitive",
              "",
            ],
            description:
              "Semantic intent — find files matching a category (credential, temporary, build_output, backup, config_sensitive)",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read",
      description:
        "Read a file with line numbers. Pass near=<line> for ±40 lines context.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, near: { type: "number" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description:
        'Search project source files (*.cjs,js,jsx,css,html,json). WARNING: When searching for DOM elements from user snippets, NEVER search for exact multi-class strings like `class="a b"`. In React/JSX, classes are dynamic (`className={"a " + (active?"b":"")}`). Search for single unique keywords instead.',
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          intent: {
            type: "string",
            enum: [
              "credential",
              "temporary",
              "build_output",
              "backup",
              "config_sensitive",
              "",
            ],
            description:
              'Semantic intent to search for (e.g. "credential" finds passwords, tokens, API keys)',
          },
          semantic: {
            type: "boolean",
            description: "Auto-detect intent from pattern text",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit",
      description:
        "PRIMARY tool untuk edit/hapus kode. WAJIB pakai ini untuk modifikasi file. Untuk HAPUS: set new_string kosong. Untuk GANTI: set new_string kode baru. Baca file dulu dengan read untuk dapat old_string yang exact.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "replace_file_content",
      description:
        "Edit a file using line-based replacement. Provide the exact target content, start line, end line, and replacement content.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          start_line: { type: "number", description: "1-indexed start line" },
          end_line: { type: "number", description: "1-indexed end line" },
          target_content: {
            type: "string",
            description: "exact string to be replaced within the line range",
          },
          replacement_content: {
            type: "string",
            description: "content to replace it with",
          },
        },
        required: [
          "path",
          "start_line",
          "end_line",
          "target_content",
          "replacement_content",
        ],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_artifact",
      description:
        "Create a new markdown artifact in the user workspace (e.g., plan, analysis).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          filename: {
            type: "string",
            description: "e.g. implementation_plan.md",
          },
          content: { type: "string" },
        },
        required: ["title", "filename", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write",
      description: "Create or overwrite a file.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bash",
      description:
        "Run PowerShell command. DILARANG pakai untuk edit/hapus file — gunakan edit tool. Hanya untuk: install package, run script, cek status sistem. PENTING soal batas: di luar `npm run app:wsl`, penolakan path hanya berasal dari pemindaian TEKS perintah, bukan dari batas OS, dan ia MELEWATKAN path yang dirakit saat jalan. JANGAN katakan kepada user bahwa sesuatu 'diblokir oleh sistem keamanan' atau bahwa kamu 'terkurung'. Yang benar: perintah itu ditolak oleh pemeriksaan teks, dan pemeriksaan itu bukan jaminan. Hasil tool membawa medan `penegakan` dan `terkurungOs` yang menyatakan keadaan sebenarnya.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          cwd: {
            type: "string",
            description:
              'working directory (absolute path, e.g. "C:\\Users\\dave\\project")',
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web via StackOverflow+GitHub+npm+DDG. Returns top results with title/URL/snippet.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "search query" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Fetch text from a URL using Microsoft Edge headless (bypasses bot detection). Returns clean text up to 8KB.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "full URL to fetch" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_extract",
      description:
        "Ambil BAGIAN TERTENTU dari halaman web dengan browser sungguhan (Playwright). " +
        "Pakai ini — BUKAN web_fetch — bila datanya dimuat oleh JavaScript, ada di dalam tabel/daftar, " +
        "butuh atribut seperti href, atau ada jauh di bawah halaman. " +
        "web_fetch mengembalikan innerText seluruh halaman dan memotongnya di 8KB, sehingga struktur hilang " +
        "dan isi yang dimuat belakangan terbaca kosong.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL lengkap (http/https)" },
          selector: {
            type: "string",
            description:
              "Selector CSS bagian yang diambil, mis. 'table.harga', 'article h2', '.item'. Default 'body'.",
          },
          mode: {
            type: "string",
            enum: ["teks", "tabel", "tautan", "atribut", "html"],
            description:
              "teks=innerText per elemen; tabel=baris/kolom sebagai array; tautan=teks+href; atribut=nilai satu atribut; html=outerHTML",
          },
          atribut: {
            type: "string",
            description:
              "Nama atribut bila mode='atribut' (mis. href, src, data-id)",
          },
          tunggu: {
            type: "string",
            description:
              "Selector yang DITUNGGU sampai muncul sebelum mengambil. Pakai ini untuk konten yang dimuat JS — jauh lebih andal daripada menunggu waktu.",
          },
          tunggu_ms: {
            type: "number",
            description:
              "Batas menunggu selector, 1000-45000 ms (default 15000)",
          },
          gulir: {
            type: "number",
            description:
              "Berapa kali menggulir satu layar sebelum mengambil, 0-20. Untuk daftar lazy-load.",
          },
          batas: {
            type: "number",
            description:
              "Maksimal elemen yang dikembalikan, 1-2000 (default 200)",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "retrieve",
      description:
        'Ambil PENGETAHUAN dari memori proyek & dokumen (semantic recall) — keputusan/rangkuman run sebelumnya, gotcha berulang, dan docs library/API yang TIDAK ada di repo. Pakai untuk pertanyaan konseptual/historis ("kenapa dulu kita pilih X?", "cara pakai API Y"). JANGAN pakai untuk mencari lokasi kode di repo — itu tugas grep/glob/read.',
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "apa yang ingin diingat/dicari secara semantik",
          },
          k: {
            type: "number",
            description: "jumlah hasil teratas (default 5)",
          },
          kind: {
            type: "string",
            enum: ["memory", "doc", ""],
            description: "batasi ke memori atau dokumen saja (opsional)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dspy",
      description:
        "Use DSpy (native JS ChainOfThought) to optimize prompts via WOLFSPACE's cloud LLM.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "the prompt to optimize" },
        },
        required: ["prompt"],
      },
    },
  },
  // Lampiran diserahkan USER lewat jembatan; agent tak punya cara memintanya.
  // Yang dipegang agent adalah HANDLE (att_...), bukan path — alamat berkasnya
  // tak pernah masuk ke sistem. Karena itu deskripsinya sengaja menyebut "sudah
  // dilampirkan": tak ada tool untuk membuka dialog berkas maupun menjelajah
  // direktori, dan model tak boleh mengira ada.
  {
    type: "function",
    function: {
      name: "attachment_list",
      description:
        "Daftar berkas yang SUDAH dilampirkan user pada percakapan ini (nama, ukuran, id). Tidak bisa membuka berkas baru — hanya user yang bisa melampirkan.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "attachment_read",
      description:
        "Baca isi berkas yang sudah dilampirkan user, memakai id dari attachment_list atau dari pesan user (format att_...). Hanya berkas teks; berkas biner mengembalikan keterangan saja.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "id lampiran, mis. att_a1b2c3...",
          },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todowrite",
      description:
        "Maintain a structured task list to track multi-step work. Update status as you progress (pending → in_progress → completed). Use for tasks with 3+ steps.",
      parameters: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                content: {
                  type: "string",
                  description: "brief task description",
                },
                status: {
                  type: "string",
                  enum: ["pending", "in_progress", "completed", "cancelled"],
                },
                priority: { type: "string", enum: ["high", "medium", "low"] },
              },
              required: ["content", "status"],
            },
            description: "list of tasks with current status",
          },
        },
        required: ["todos"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "terminal_open",
      description:
        "Open a persistent PTY terminal session in the workspace. Returns session id.",
      parameters: {
        type: "object",
        properties: {
          cwd: {
            type: "string",
            description: "working directory (default: workspace)",
          },
          shell: { type: "string", description: "shell override" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "terminal_write",
      description:
        "Write text to a terminal session (stdin). Use \\\\n for newline.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "session id from terminal_open" },
          data: {
            type: "string",
            description: "text to send (add \\\\n to execute command)",
          },
        },
        required: ["id", "data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "terminal_read",
      description:
        "Read accumulated output from a terminal session (non-destructive unless clear=true).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "session id" },
          clear: { type: "boolean", description: "clear buffer after reading" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "terminal_close",
      description: "Close and kill a terminal session.",
      parameters: {
        type: "object",
        properties: { id: { type: "string", description: "session id" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "question",
      description:
        "Ask the user a clarifying question when the request is ambiguous or you need more information. Use when you cannot proceed without user input.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "the question to ask the user",
          },
          choices: {
            type: "array",
            items: { type: "string" },
            description: "optional list of suggested answers",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "skill_list",
      description:
        "List all installed skills (modular tool plugins). Returns name, version, description for each.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "skill_run",
      description: "Run an installed skill by name with optional arguments.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "skill name from skill_list" },
          args: {
            type: "object",
            description: "arguments to pass to the skill (JSON object)",
          },
        },
        required: ["name"],
      },
    },
  },
  // skill_install DICABUT dari daftar tool model. Jangan dikembalikan.
  //
  // Dulu deskripsinya berbunyi "Install a new skill from npm, a local .cjs file,
  // or a URL" — artinya model bisa memasang kode arbitrer untuk dirinya sendiri,
  // tanpa satu pun persetujuan: tak ada admission CommandChain di cabang skill,
  // dan EXECUTION_TOOLS (yang memicu HITL) hanya berisi "bash".
  //
  // Yang membuatnya serius bukan kemungkinan plugin-nya jahat, melainkan JALUR
  // PEMANGGILANNYA: tool dipilih oleh model, dan model membaca isi berkas,
  // keluaran tool, serta halaman web — semuanya bisa memuat kalimat yang
  // berbunyi seperti perintah. Di VS Code tak ada masalah ini karena MANUSIA
  // yang menekan tombol install.
  //
  // Memasang adalah tindakan manusia. Implementasinya sengaja DIBIARKAN hidup di
  // tools/index.cjs supaya UI (dan jalur HITL nanti) tetap bisa memanggilnya —
  // yang dicabut hanya pintu ke model.
  //
  // Kalau suatu saat model perlu MENGUSULKAN pemasangan, jalurnya sudah ada:
  // tambahkan namanya ke EXECUTION_TOOLS di agent/self_agent.cjs, seperti bash.
  // Dikunci oleh tests/plugin-pintu-pasang.test.js.
  {
    type: "function",
    function: {
      name: "sandbox_run",
      description:
        "Jalankan perintah shell di direktori sementara, dengan timeout yang membunuh pohon proses dan pembersihan otomatis. BUKAN pilihan pertama: untuk kode yang kamu tulis sendiri, pakai capability_exec yang batasnya ditegakkan. Tool ini berguna untuk mengisolasi CRASH dan HANG, bukan untuk menahan kode yang berusaha keluar. Good for isolating crashes/hangs from the host. NOTE: readRoots/writeRoots/network only gate this tool's own JS helpers -- the spawned process itself has normal OS-level filesystem and network access, so this is NOT a security boundary against code that deliberately tries to read files or make network calls. Use capability_exec instead when the code needs to read/write files outside its own scratch dir or make network calls and that access should be policy-checked and audited.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "command to execute" },
          cwd: {
            type: "string",
            description: "working directory (default: sandbox temp dir)",
          },
          timeout: {
            type: "number",
            description: "timeout in ms (default: 30000)",
          },
          readRoots: {
            type: "array",
            items: { type: "string" },
            description:
              "directories allowed to read (advisory only, see note above)",
          },
          writeRoots: {
            type: "array",
            items: { type: "string" },
            description:
              "directories allowed to write (advisory only, see note above)",
          },
          network: {
            type: "boolean",
            description: "allow network access (default: true)",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "capability_exec",
      description:
        'Execute JS task code with ZERO ambient filesystem/network access, run in a separate process with Node\'s --permission flag (no --allow-fs-read/write grants at all). The code\'s ONLY way to affect the outside world is `await request(capability, params)` -- e.g. `await request("readFile", {path})`, `await request("writeFile", {path, content})`, `await request("fetch", {url})` -- each validated by a deny-by-default policy (scoped to the current workspace dir for files, known cloud-provider hosts for fetch) and logged to an audit trail. PILIHAN PERTAMA untuk menjalankan kode. Coba ini DULU untuk apa pun yang kamu akan tulis sebagai `node -e`. Terukur: tugas di sini BISA membaca dan menulis berkas workspace lewat request(), sementara fs langsung dan child_process ke luar workspace sama-sama mengembalikan ERR_ACCESS_DENIED. Jadi ia bukan versi bash yang lebih lemah — ia bisa mengerjakan hal yang sama untuk kode, dengan batas yang benar-benar ditegakkan. Pakai bash hanya bila kamu butuh MEMANGGIL PROGRAM yang sudah ada (npm, git, compiler), bukan untuk menjalankan kode yang kamu tulis sendiri.',
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description:
              "JS statements; use `await request(capability, params)` to act, end with `return <value>`",
          },
          timeout: {
            type: "number",
            description: "timeout in ms (default: 10000)",
          },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "opencode_run",
      description:
        "Orchestrate the OpenCode CLI as a worker agent. Runs `opencode run <instruction> --auto` in the background and returns its final result. Use this to delegate complex coding tasks to OpenCode.",
      parameters: {
        type: "object",
        properties: {
          instruction: {
            type: "string",
            description:
              'The task instruction to give to OpenCode (e.g. "Create a login page")',
          },
          cwd: { type: "string", description: "working directory" },
          model: {
            type: "string",
            description: 'Optional model to use (e.g. "gpt-4o")',
          },
          provider: {
            type: "string",
            description:
              'Optional provider to use (e.g. "openai", "anthropic")',
          },
          api_key: {
            type: "string",
            description: "Optional API key if not globally logged in",
          },
        },
        required: ["instruction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_3d",
      description:
        "Generate model 3D BERKUALITAS dari TEKS atau GAMBAR via Replicate (model open-source TRELLIS + flux). Alur: prompt -> gambar bersih (flux-schnell) -> mesh 3D bertekstur (TRELLIS) -> GLB. Bila `image` diberikan (path lokal/URL), langsung gambar->3D. Cocok untuk objek kompleks (mobil, karakter, furnitur). Hasil GLB bisa ditampilkan di viewer. Butuh Replicate API key di cloud-keys.json.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              'deskripsi objek yang dibuat (mis. "kursi kayu vintage merah")',
          },
          image: {
            type: "string",
            description:
              "path gambar lokal (dalam workspace) atau URL — jika ada, lewati tahap teks->gambar",
          },
          output: {
            type: "string",
            description: "nama file GLB keluaran (default generated.glb)",
          },
          texture_size: {
            type: "number",
            description: "resolusi tekstur (default 1024)",
          },
          timeout: {
            type: "number",
            description: "timeout ms (default 300000, maks 600000)",
          },
        },
      },
    },
  },
];

module.exports = { SELF_TOOLS };
