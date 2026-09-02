// Tool definitions (OpenAI function-calling format)
// ── Tool definitions (OpenAI function-calling format) ──
// NOTE: disk_* tools removed from defaults — only project-scoped tools exposed.
// Disk tools are still implemented in tools/index.ts if needed dynamically.
// `export {}` makes this a MODULE rather than a global script.
//
// A .ts file with no import or export shares one global scope with every
// other such file, so two of them declaring the same top-level name collide
// (TS2451) — which is how mcp-client.ts and dspy_tool.ts both declaring
// `dlog` surfaced a problem that had been latent for several phases.
export {};

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
        "Architecture map: analyses the REAL require() dependencies between modules in a scope, then produces a Mermaid diagram (rendered inline in the UI). Use it when the user asks to draw or map architecture, structure, or code dependencies. Include the ```mermaid block from the output verbatim in your answer.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            description:
              "folder to map: 'agent' (default) | 'server' | 'all' | another subfolder",
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
        "PRIMARY tool for editing/deleting code. You MUST use this to modify a file. To DELETE: set new_string empty. To REPLACE: set new_string to the new code. Read the file first with read so old_string is exact.",
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
        'Run a shell command. Do NOT use it to edit or delete files — use the edit tool. Only for: installing packages, running scripts, checking system state. THE LIMITS, and do not claim more or less than this: on Windows the command runs INSIDE an AppContainer, so a file refusal comes from the KERNEL, not from scanning text — even a path assembled at run time is refused. Measured across 16 directories: WRITING outside the workspace is refused entirely, and READING user data (Desktop, Documents, Downloads, the profile, AppData, .wolfspace) is refused too. OUTBOUND NETWORK IS CLOSED AS WELL: DNS fails, HTTP times out, TCP is refused with AccessDenied, loopback is refused -- the container profile is created with no network capability, and in the AppContainer model the network IS a capability. Use the `web_search`/`webExtract` tools when you need the network, not curl through bash. BUT C:\\Windows, C:\\Program Files and C:\\langs REMAIN READABLE (read-only): system folders grant read access to every application package, and that is a property of AppContainer this tool cannot revoke. So do not say "everything outside the workspace is blocked" — what is true is: nothing outside the workspace can be WRITTEN, and user data cannot be read. Some commands do NOT work inside the confinement and that is not a sign of breakage: git (use the `git` tool), `dir` and `vol` (use Get-ChildItem), `del` (use Remove-Item), and ls/grep/sed from Git for Windows. Always check the `penegakan` and `terkurungOs` fields on the result — they state what is actually true, and if `penegakan` is not "kernel" then the boundary really is only a text scan.',
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
        "Pull a SPECIFIC PART out of a web page with a real browser (Playwright). " +
        "Use this — NOT web_fetch — when the data is loaded by JavaScript, sits inside a table or list, " +
        "needs an attribute such as href, or lives far down the page. " +
        "web_fetch returns the whole page innerText and cuts it at 8KB, so structure is lost " +
        "and anything loaded later reads as empty.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "full URL (http/https)" },
          selector: {
            type: "string",
            description:
              "CSS selector of the part to take, e.g. 'table.harga', 'article h2', '.item'. Default 'body'.",
          },
          mode: {
            type: "string",
            enum: ["teks", "tabel", "tautan", "atribut", "html"],
            description:
              "teks=innerText per element; tabel=rows/columns as arrays; tautan=text+href; atribut=one attribute's value; html=outerHTML",
          },
          atribut: {
            type: "string",
            description:
              "Attribute name when mode='atribut' (e.g. href, src, data-id)",
          },
          tunggu: {
            type: "string",
            description:
              "Selector to WAIT for before extracting. Use this for JS-loaded content — far more reliable than waiting on a timer.",
          },
          tunggu_ms: {
            type: "number",
            description:
              "How long to wait for the selector, 1000-45000 ms (default 15000)",
          },
          gulir: {
            type: "number",
            description:
              "How many screens to scroll before extracting, 0-20. For lazy-loaded lists.",
          },
          batas: {
            type: "number",
            description: "Maximum elements returned, 1-2000 (default 200)",
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
        'Pull KNOWLEDGE out of project memory and documents (semantic recall) — decisions and summaries from earlier runs, recurring gotchas, and library/API docs that are NOT in the repo. Use it for conceptual or historical questions ("why did we pick X back then?", "how do I use API Y"). Do NOT use it to find where code lives in the repo — that is what grep/glob/read are for.',
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "what to recall or search for semantically",
          },
          k: {
            type: "number",
            description: "how many top results (default 5)",
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
  // Attachments are handed over by the USER through the bridge; the agent has no
  // way to ask for one. What the agent holds is a HANDLE (att_...), not a path —
  // the file's address never enters the system. So the description deliberately
  // says "already attached": there is no tool to open a file dialog or browse a
  // directory, and the model must not assume one exists.
  {
    type: "function",
    function: {
      name: "attachment_list",
      description:
        "Lists the files the user has ALREADY attached to this conversation (name, size, id). It cannot open new files — only the user can attach.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "attachment_read",
      description:
        "Read the contents of a file the user has attached, using an id from attachment_list or from the user's message (att_... form). Text files only; a binary file returns a description instead.",
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
  // git has its own tool because it CAN NO LONGER be run through bash.
  //
  // Once bash became AppContainer-contained, every git command died before doing
  // anything: git opens /dev/null (read+write) at startup, and the NUL device
  // cannot be read inside the container. That is not something a permission can
  // patch, so git was moved to a form that needs no shell at all.
  {
    type: "function",
    function: {
      name: "git",
      description:
        "NAMED git operations inside the workspace. It does NOT accept free-form " +
        "git commands — the argv is built by this tool from validated " +
        "parameters, every path must lie inside the workspace, and another repo " +
        "cannot be targeted. Use this for anything git: running git through bash " +
        "ALWAYS fails, because bash is confined by AppContainer and git cannot " +
        "open /dev/null in there. There are NO network operations " +
        "(push/pull/fetch/clone) — those are outside this tool. Read operations: " +
        "status, diff, log, show, berkas, cabang, kepala, blame. Write operations " +
        "(tambah, commit, pulihkan, cabang_baru, pindah) run the repo's own hooks, " +
        "so they ask the user for approval and are recorded in the ledger.",
      parameters: {
        type: "object",
        properties: {
          operasi: {
            type: "string",
            enum: [
              "status",
              "diff",
              "log",
              "show",
              "berkas",
              "cabang",
              "kepala",
              "blame",
              "tambah",
              "commit",
              "pulihkan",
              "cabang_baru",
              "pindah",
            ],
          },
          berkas: {
            type: "array",
            items: { type: "string" },
            description:
              "path relative to the workspace; outside the workspace is refused",
          },
          ref: {
            type: "string",
            description:
              "branch or commit name; no spaces, must not start with '-'",
          },
          pesan: { type: "string", description: "commit message" },
          bertahap: {
            type: "boolean",
            description: "diff: show what is already staged",
          },
          jumlah: {
            type: "number",
            description: "log: how many commits (1-200)",
          },
        },
        required: ["operasi"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "net_diag",
      description:
        "Network diagnostics run INSIDE the WSL distro. It does NOT accept " +
        "free-form commands — only named operations from a fixed list, with the " +
        "argv built by this tool from validated parameters. Because there is no " +
        "command text to scan, there is nothing to assemble your way past; the " +
        "boundary is a property of the data's shape, not a guess about a string. " +
        "Operations: ping (4 ICMP packets), rute (routing table), antarmuka " +
        "(ip addr), jejak (traceroute), port (check one TCP port), kepala (HTTP " +
        "headers only, without downloading the body). Use this instead of bash " +
        "for network questions — on Windows bash is bounded only by a text scan.",
      parameters: {
        type: "object",
        properties: {
          operasi: {
            type: "string",
            enum: ["ping", "rute", "antarmuka", "jejak", "port", "kepala"],
          },
          host: {
            type: "string",
            description: "domain name or IP; no scheme, no path",
          },
          port: {
            type: "number",
            description: "1-65535, only for the 'port' operation",
          },
        },
        required: ["operasi"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sandbox_run",
      description:
        "Run a shell command in a temporary directory, with a timeout that kills the process tree and automatic cleanup. NOT the first choice: for code you write yourself, use capability_exec, whose limits are enforced. This tool is useful for isolating CRASHES and HANGS, not for holding back code that is trying to get out. Good for isolating crashes/hangs from the host. LIMITS, and these have changed: readRoots/writeRoots/network gate only this tool's own JS helpers. The process USED TO have ordinary OS filesystem access -- measured, it successfully wrote to Desktop and read Documents at a time when bash already could not. On Windows it is now wrapped in the SAME AppContainer as bash, so a write outside the workspace is refused by the kernel and user data cannot be read. What still holds: the network is NOT confined, and readRoots/writeRoots are not a security boundary against code deliberately trying to escape -- what holds it is the AppContainer, not those fields. Use capability_exec instead when the code needs to read/write files outside its own scratch dir or make network calls and that access should be policy-checked and audited.",
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
        'Execute JS task code with ZERO ambient filesystem/network access, run in a separate process with Node\'s --permission flag (no --allow-fs-read/write grants at all). The code\'s ONLY way to affect the outside world is `await request(capability, params)` -- e.g. `await request("readFile", {path})`, `await request("writeFile", {path, content})`, `await request("fetch", {url})` -- each validated by a deny-by-default policy (scoped to the current workspace dir for files, known cloud-provider hosts for fetch) and logged to an audit trail. THE FIRST CHOICE for running code. Try this BEFORE anything you were about to write as `node -e`. Measured: a task here CAN read and write workspace files through request(), while direct fs and child_process outside the workspace both return ERR_ACCESS_DENIED. So it is not a weaker bash — it can do the same work for code, with limits that are actually enforced. Use bash only when you need to INVOKE AN EXISTING PROGRAM (npm, git, a compiler), not to run code you wrote yourself.',
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
        "Generate a HIGH-QUALITY 3D model from TEXT or an IMAGE via Replicate (the open-source TRELLIS + flux models). Flow: prompt -> clean image (flux-schnell) -> textured 3D mesh (TRELLIS) -> GLB. If `image` is given (local path or URL), it goes straight from image to 3D. Suits complex objects (cars, characters, furniture). The resulting GLB can be shown in the viewer. Needs a Replicate API key in cloud-keys.json.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              'description of the object to build (e.g. "red vintage wooden chair")',
          },
          image: {
            type: "string",
            description:
              "local image path (inside the workspace) or a URL — when present, the text->image stage is skipped",
          },
          output: {
            type: "string",
            description: "output GLB filename (default generated.glb)",
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
