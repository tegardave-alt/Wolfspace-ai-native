// API Client - Handles all server communication
(function() {
  const IPC =
    typeof window !== "undefined" && window.WOLFSPACE && window.WOLFSPACE.ipc
      ? window.WOLFSPACE
      : null;

  // Verify HTTP server is running (only for browser users, not Electron)
  async function checkServerHealth() {
    if (IPC) return true; // Electron: uses IPC, no HTTP needed
    try {
      const r = await fetch("/", { method: "HEAD", timeout: 2000 });
      return r.ok;
    } catch {
      return false;
    }
  }

  // Parse an SSE stream from a fetch Response, calling onEvent(parsedJSON) per line.
  async function pumpSSE(r, signal, onEvent) {
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        const mm = line.match(/^data:\s*(.*)$/);
        if (!mm) continue;
        let j;
        try {
          j = JSON.parse(mm[1]);
        } catch (e) {
          continue;
        }
        onEvent(j);
      }
    }
  }

  async function streamChat(reqBody, onText, signal) {
    let acc = "",
      run = null;
    const handle = (j) => {
      if (j.t === "tok") {
        acc += j.c;
        onText(acc, run);
      } else if (j.t === "retry") {
        acc = "";
        run = null;
        onText(acc, run);
      } else if (j.t === "run") {
        run = j.run;
        onText(acc, run);
      } else if (j.t === "done") {
        run = j.run || run;
        onText(acc, run);
      } else if (j.t === "err") {
        acc += "\n[" + j.m + "]";
        onText(acc, run);
      }
    };
    if (IPC) {
      await new Promise((resolve) => {
        const cancel = IPC.stream("chat", reqBody, handle, resolve);
        if (signal)
          signal.addEventListener("abort", () => {
            cancel();
            resolve();
          });
      });
      return { text: acc, run };
    }
    const r = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
      signal,
    });
    await pumpSSE(r, signal, handle);
    return { text: acc, run };
  }

  async function streamSelfAgent(reqBody, onEvent, signal) {
    if (IPC) {
      await new Promise((resolve) => {
        const cancel = IPC.stream("self-agent", reqBody, onEvent, resolve);
        if (signal)
          signal.addEventListener("abort", () => {
            cancel();
            resolve();
          });
      });
      return;
    }
    try {
      const r = await fetch("/self-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
        signal,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      await pumpSSE(r, signal, onEvent);
    } catch (e) {
      if (e instanceof TypeError && e.message.includes("Failed to fetch")) {
        throw new Error(
          'Tidak bisa terhubung ke server self-agent.\n\nJika running di browser:\n1. Buka terminal di folder WOLFSPACE\n2. Jalankan: npm start\n3. Tunggu sampai "http://127.0.0.1:8090" muncul\n4. Refresh browser dan coba lagi\n\nAtau gunakan Electron: npm run app',
        );
      }
      throw e;
    }
  }

  function reqFor(modelVal, cloud, history) {
    const b =
      modelVal === "cloud" && cloud
        ? { history, cloud }
        : { history, port: modelVal };
    return b;
  }

  const PREFIXES = [
    ["github_pat_", "github", "GitHub Models"],
    ["ghp_", "github", "GitHub Models"],
    ["sk-ant-", "anthropic", "Claude"],
    ["sk-or-", "openrouter", "OpenRouter"],
    ["gsk_", "groq", "Groq"],
    ["AIza", "gemini", "Gemini"],
    ["nvapi-", "nvidia", "NVIDIA"],
    ["sk-UUa", "opencode", "OpenCode"],
    ["sk-", "openai", "OpenAI"],
  ];

  function detectPrefix(key) {
    key = (key || "").trim();
    for (const [p, prov, name] of PREFIXES)
      if (key.startsWith(p)) return { provider: prov, name };
    return key ? { provider: "openai", name: "OpenAI" } : null;
  }

  function keyish(s) {
    return /^(sk-|gsk_|AIza|github_pat_|ghp_)/.test((s || "").trim());
  }

  function getCloud() {
    try {
      return JSON.parse(localStorage.getItem("quantum_cloud") || "null");
    } catch (e) {
      return null;
    }
  }

  function setCloudLS(c) {
    if (c) localStorage.setItem("quantum_cloud", JSON.stringify(c));
    else localStorage.removeItem("quantum_cloud");
  }

  // Export to global namespace
  window.WOLFSPACE = window.WOLFSPACE || {};
  window.WOLFSPACE.API = {
    checkServerHealth,
    pumpSSE,
    streamChat,
    streamSelfAgent,
    reqFor,
    detectPrefix,
    keyish,
    getCloud,
    setCloudLS,
    IPC
  };
})();
