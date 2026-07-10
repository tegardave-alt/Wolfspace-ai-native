# ⚛️ WOLFSPACE

**A local, open-source AI coding chat that _proves_ its code by actually running it.**

Most AI coding tools hand you code and hope it works. WOLFSPACE treats the model as an
**untrusted guesser** and your **CPU as the judge**: generated code is executed and tested
automatically, and if it fails, the error is fed back to the model to fix — looping until it
genuinely runs.

> **model guesses → your CPU runs it → pass / fail (real)**

You don't get a smarter model. You get **output you can trust**, because it was proven by
execution, not by appearance.

---

## Why WOLFSPACE

- ✅ **Verified, not vibes.** Every code answer is run; you see real stdout/stderr and a
  `✓ verified` / `⚠ not passing` verdict — not "looks right."
- 🔌 **Any model.** Bring your own API key — WOLFSPACE auto-detects the provider
  (OpenAI, Claude, Qwen, DeepSeek, GitHub Models, Groq, OpenRouter, Gemini, or any
  OpenAI-compatible endpoint). Or run **local GGUF models** via llama.cpp.
- 🤗 **Model Hub.** Search Hugging Face, see real logos + download size, download a GGUF,
  and run it — all from the app.
- 🧪 **Compare models.** Send one prompt to two models side by side; both get auto-verified.
- ✏️ **Real editor.** Monaco (VS Code's editor) for every code block — edit in place, re-run,
  or ask the AI to revise.
- 🔒 **Local-first.** Runs on your machine, with your keys. Nothing leaves your computer
  except the model API calls you opt into.

---

## Quickstart

```bash
git clone https://github.com/<you>/WOLFSPACE && cd WOLFSPACE
npm start                      # -> http://127.0.0.1:8090
```

Open **http://127.0.0.1:8090**, click **⚛️ WOLFSPACE** (top-left) -> paste any **cloud API key**
-> ask for code. It runs and verifies automatically. That's it.

**Requirements:** [Node.js](https://nodejs.org) 18+ (or [Bun](https://bun.sh)).
Python is optional (only to execute Python snippets). No build step — the UI is served as-is.

### Optional: run models locally (offline, no API key)

Local models use [llama.cpp](https://github.com/ggml-org/llama.cpp). One-time setup downloads
`llama-server` + a small CPU-friendly model:

```powershell
powershell scripts/setup.ps1          # Windows: fetches llama.cpp + models
powershell scripts/start-models.ps1   # launch the local model servers
npm start
```

```bash
bash scripts/setup.sh                 # Linux/macOS
bash scripts/start-models.sh
npm start
```

Then pick a local model from the dropdown, or open the **Model Hub** to download more from
Hugging Face.

---

## Languages

Runs **Python** and **JavaScript** out of the box (JS via your Node/Bun runtime). WOLFSPACE also
runs **C, C++, Go, Java, PHP, Rust, and Kotlin** if their compilers are on your PATH — point to
them under `runners` in `config.json`. HTML/CSS preview live in an iframe.

## How it works

| Layer | Role |
|-------|------|
| **Generator** (untrusted) | guesses code — a local model via `llama-server`, or a cloud API |
| **Bridge** (`server.cjs`) | streams tokens, extracts the code block, runs it, feeds errors back to retry |
| **Judge** (ground truth) | says what the code actually does — your CPU (subprocess) |

Configure everything in `config.json`: models/ports, local model dir, language runners.
Cloud keys live in the browser (localStorage) or server-side in `cloud-keys.json` (gitignored).

## Security

WOLFSPACE runs generated code **on your machine, with your permissions** — like other local AI
coding tools. Keep it bound to `127.0.0.1`; **don't expose the server to a network.** A
sandboxed execution mode (Docker) for multi-user/hosted use is in `sandbox/` (opt-in).

## Roadmap

- Sandboxed execution (Docker) for safe multi-user / hosted deployments
- MCP tool connections (filesystem, web, etc.)
- Richer verification (tests-as-spec, coverage)

## License

MIT — see [LICENSE](LICENSE).

