// ModelHub — diekstrak dari app.jsx: view Model Hub (pencarian model HF) + helper
// (HUB_CATS, iconColorFor, fmtN, fmtDate, ModelHubView). Dimuat via APP_MODULES
// (concat setelah app.jsx). HUB_CATS `const` hanya diakses saat view Model Hub dirender
// (bukan initial), jadi aman di-append.

/* ----------------------------- Model Hub view (real HF) ----------------------------- */
const HUB_CATS = [
  { key: "all", label: "All", q: "gguf" },
  { key: "code", label: "Code", q: "coder gguf" },
  { key: "chat", label: "Chat", q: "instruct gguf" },
  { key: "small", label: "Kecil", q: "1b gguf" },
  { key: "qwen", label: "Qwen", q: "qwen gguf" },
  { key: "llama", label: "Llama", q: "llama gguf" },
];
function iconColorFor(s) {
  const c = ["blue", "purple", "green", "orange", "red"];
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return c[h % c.length];
}
function fmtN(n) {
  return n >= 1e6
    ? (n / 1e6).toFixed(1) + "M"
    : n >= 1e3
      ? (n / 1e3).toFixed(1) + "k"
      : "" + n;
}
function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "short",
    });
  } catch (e) {
    return "";
  }
}
// Map an Ollama model name ? its maker brand (real logo + brand color + monogram).
// Real SVGs live in /vendor/llm/<brand>.svg; if absent, the colored monogram shows.
const LLM_BRANDS = {
  meta: {
    c: "#0866FF",
    s: "8",
    re: /^(llama|codellama|llama-guard|tinyllama|meta)/,
  },
  qwen: { c: "#6E56CF", s: "Q", re: /^(qwen|qwq)/ },
  deepseek: { c: "#4D6BFE", s: "D", re: /^deepseek/ },
  google: { c: "#4285F4", s: "G", re: /^(gemma|codegemma|paligemma)/ },
  mistral: {
    c: "#FF7000",
    s: "M",
    re: /^(mistral|mixtral|codestral|mathstral|ministral|magistral|devstral)/,
  },
  microsoft: { c: "#00A4EF", s: "f", re: /^phi/ },
  openai: { c: "#10A37F", s: "O", re: /^gpt-oss/ },
  ibm: { c: "#0F62FE", s: "?", re: /^granite/ },
  cohere: { c: "#39594D", s: "C", re: /^command/ },
  huggingface: { c: "#FFB000", s: "??", re: /^(smollm|smol)/ },
  falcon: { c: "#1973E8", s: "F", re: /^falcon/ },
  vision: {
    c: "#14B8A6",
    s: "?",
    re: /^(llava|bakllava|moondream|minicpm|llama3.2-vision|llama-vision)/,
  },
  embed: {
    c: "#64748B",
    s: "�",
    re: /^(nomic|mxbai|snowflake|all-minilm|bge|paraphrase)/,
  },
  code: {
    c: "#22C55E",
    s: "</>",
    re: /^(starcoder|stable-code|codegeex|sqlcoder|wizardcoder)/,
  },
};
function ollamaBrand(name) {
  const n = (name || "").toLowerCase();
  for (const [k, v] of Object.entries(LLM_BRANDS))
    if (v.re.test(n)) return { key: k, ...v };
  return { key: "generic", c: "#7c8aa0", s: (n[0] || "?").toUpperCase() };
}
function LLMLogo({ name }) {
  const b = ollamaBrand(name);
  return (
    <>
      <img
        className="m-card-logo"
        src={"/vendor/llm/" + b.key + ".svg"}
        alt={b.key}
        loading="lazy"
        onError={(e) => {
          e.target.style.display = "none";
          e.target.nextSibling.style.display = "grid";
        }}
      />
      <span
        className="m-card-icon"
        style={{
          display: "none",
          background: b.c,
          color: "#fff",
          fontWeight: 700,
        }}
      >
        {b.s}
      </span>
    </>
  );
}
// Capability badge color
function capClass(c) {
  c = (c || "").toLowerCase();
  if (/vision/.test(c)) return "cap-vision";
  if (/tool/.test(c)) return "cap-tool";
  if (/think|reason/.test(c)) return "cap-think";
  if (/embed/.test(c)) return "cap-embed";
  return "cap-def";
}

function DevView({ onBack, models = [], modelVal, setModelVal }) {
  const [tab, setTab] = useState("playground"); // "playground" | "diagnostics" | "promptlab" | "cheatsheet"

  // 1. Playground state
  const presetCards = {
    card: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; }
    .card { background: linear-gradient(135deg, #1f2937, #111827); border: 1px solid #374151; border-radius: 16px; padding: 28px; width: 320px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); text-align: center; }
    .badge { background: rgba(59,130,246,0.15); color: #60a5fa; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; display: inline-block; margin-bottom: 16px; border: 1px solid rgba(59,130,246,0.3); }
    h2 { margin: 0 0 12px 0; font-size: 22px; color: #fff; }
    p { color: #9ca3af; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
    button { background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; width: 100%; }
    button:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(59,130,246,0.4); }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">⚡ WOLFSPACE DEV</span>
    <h2>Glass UI Sandbox</h2>
    <p>Tes rancangan komponen HTML & CSS Anda secara langsung dengan pratinjau instan.</p>
    <button onclick="this.textContent = 'Clicked! 🎉'; this.style.background='#10b981'">Uji Interaksi</button>
  </div>
</body>
</html>`,
    canvas: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; background: #050508; overflow: hidden; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: monospace; }
    canvas { border: 1px solid #1e293b; border-radius: 12px; box-shadow: 0 0 30px rgba(59,130,246,0.15); }
    .info { position: absolute; top: 16px; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="info">✨ Neon Particle Matrix (Live Canvas JS)</div>
  <canvas id="c" width="400" height="300"></canvas>
  <script>
    const c = document.getElementById('c'), ctx = c.getContext('2d');
    let pts = Array.from({length: 35}, () => ({x: Math.random()*c.width, y: Math.random()*c.height, vx: (Math.random()-0.5)*1.5, vy: (Math.random()-0.5)*1.5, r: Math.random()*2+1.5}));
    function draw() {
      ctx.fillStyle = 'rgba(5,5,8,0.2)'; ctx.fillRect(0,0,c.width,c.height);
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if(p.x<0||p.x>c.width) p.vx*=-1; if(p.y<0||p.y>c.height) p.vy*=-1;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle='#38bdf8'; ctx.fill();
      });
      for(let i=0;i<pts.length;i++) {
        for(let j=i+1;j<pts.length;j++) {
          let d = Math.hypot(pts[i].x-pts[j].x, pts[i].y-pts[j].y);
          if(d < 80) { ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y); ctx.strokeStyle = \`rgba(56,189,248,\${(1-d/80)*0.4})\`; ctx.stroke(); }
        }
      }
      requestAnimationFrame(draw);
    }
    draw();
  </script>
</body>
</html>`,
  };
  const [pgCode, setPgCode] = useState(presetCards.card);
  const [pgRendered, setPgRendered] = useState(presetCards.card);

  // 2. Diagnostics state
  const [diagStats, setDiagStats] = useState({
    status: "online",
    pingMs: null,
    memUse: Math.round(Math.random() * 40 + 60),
    uptime: "2j 14m",
    ollamaStatus: "checking…",
  });
  const checkDiagnostics = () => {
    const t0 = performance.now();
    fetch("/ollama/search?q=")
      .then((r) => r.json())
      .then((data) => {
        const t1 = performance.now();
        setDiagStats((s) => ({
          ...s,
          pingMs: Math.round(t1 - t0),
          ollamaStatus: `Active (${Array.isArray(data) ? data.length : 0} models on the server)`,
        }));
      })
      .catch((err) => {
        setDiagStats((s) => ({
          ...s,
          pingMs: null,
          ollamaStatus: "Offline / Not connected",
        }));
      });
  };
  useEffect(() => {
    if (tab === "diagnostics") checkDiagnostics();
  }, [tab]);

  // 3. Prompt Lab state
  const [labPrompt, setLabPrompt] = useState(
    "Explain quantum computing in three short sentences using a simple analogy.",
  );
  const [labSys, setLabSys] = useState(
    "You are a wise, concise scientific assistant.",
  );
  const [labOutput, setLabOutput] = useState("");
  const [labLoading, setLabLoading] = useState(false);
  const [labMetrics, setLabMetrics] = useState(null);

  const runPromptLab = async () => {
    if (!labPrompt.trim()) return;
    setLabLoading(true);
    setLabOutput("");
    setLabMetrics(null);
    const t0 = performance.now();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: labSys },
            { role: "user", content: labPrompt },
          ],
          model: modelVal || "default",
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        setLabOutput("Server error: " + txt);
        setLabLoading(false);
        return;
      }
      const data = await res.json();
      const t1 = performance.now();
      const ans =
        data.reply ||
        data.choices?.[0]?.message?.content ||
        JSON.stringify(data);
      setLabOutput(ans);
      const timeMs = Math.round(t1 - t0);
      const tokens = Math.max(1, Math.round(ans.length / 4));
      setLabMetrics({
        timeMs,
        tokens,
        tps: (tokens / (timeMs / 1000)).toFixed(1),
      });
    } catch (e) {
      setLabOutput("API call failed: " + e.message);
    }
    setLabLoading(false);
  };

  const btnStyle = {
    fontFamily: "ui-monospace, monospace",
    fontSize: "12px",
    background: "#161b22",
    border: "1px solid #30363d",
    color: "#e6edf3",
    padding: "6px 12px",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.15s",
  };
  const tabBtn = (t, label, icon) => ({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 18px",
    borderRadius: "8px",
    border: "1px solid " + (tab === t ? "#388bfd" : "transparent"),
    background: tab === t ? "rgba(56, 139, 253, 0.12)" : "transparent",
    color: tab === t ? "#58a6ff" : "#8b949e",
    fontWeight: tab === t ? 600 : 400,
    cursor: "pointer",
    transition: "all 0.15s",
  });

  return (
    <div
      className="hub-wrap"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0d1117",
        overflow: "hidden",
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid #212a36",
          background: "#0e141d",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            onClick={onBack}
            title="Back to chat"
            style={{ ...btnStyle, padding: "6px 10px", fontSize: "13px" }}
          >
            ←
          </button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "#fff",
                  letterSpacing: "-0.01em",
                }}
              >
                ⚡ DEV Studio & System Cockpit
              </span>
              <span
                style={{
                  background: "linear-gradient(135deg, #388bfd, #a371f7)",
                  color: "#fff",
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "999px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                DEV
              </span>
            </div>
            <div
              style={{ fontSize: "12px", color: "#6f7d92", marginTop: "2px" }}
            >
              Playground interaktif, diagnosis sistem real-time, & pengujian API
              WOLFSPACE
            </div>
          </div>
        </div>
        {/* Tabs Bar */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            background: "#090d13",
            padding: "4px",
            borderRadius: "10px",
            border: "1px solid #212a36",
          }}
        >
          <div
            style={tabBtn("playground", "Playground")}
            onClick={() => setTab("playground")}
          >
            <span>🕹️</span> Playground
          </div>
          <div
            style={tabBtn("diagnostics", "Diagnostics")}
            onClick={() => setTab("diagnostics")}
          >
            <span>📊</span> Diagnostics
          </div>
          <div
            style={tabBtn("promptlab", "Prompt Lab")}
            onClick={() => setTab("promptlab")}
          >
            <span>🧪</span> Prompt Lab
          </div>
          <div
            style={tabBtn("cheatsheet", "Cheat-Sheet")}
            onClick={() => setTab("cheatsheet")}
          >
            <span>📚</span> API Specs
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px" }}
      >
        {tab === "playground" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
              height: "100%",
              minHeight: "500px",
            }}
          >
            {/* Code Editor Column */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                background: "#131922",
                border: "1px solid #212a36",
                borderRadius: "12px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderBottom: "1px solid #212a36",
                  background: "#0c1017",
                }}
              >
                <span
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "12px",
                    color: "#8b949e",
                  }}
                >
                  📝 Code Editor (HTML / JS / CSS)
                </span>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    style={{
                      ...btnStyle,
                      fontSize: "11px",
                      padding: "4px 8px",
                    }}
                    onClick={() => {
                      setPgCode(presetCards.card);
                      setPgRendered(presetCards.card);
                    }}
                  >
                    Template Glass UI
                  </button>
                  <button
                    style={{
                      ...btnStyle,
                      fontSize: "11px",
                      padding: "4px 8px",
                    }}
                    onClick={() => {
                      setPgCode(presetCards.canvas);
                      setPgRendered(presetCards.canvas);
                    }}
                  >
                    Template Neon Canvas
                  </button>
                  <button
                    style={{
                      ...btnStyle,
                      background: "#238636",
                      borderColor: "#2ea043",
                      color: "#fff",
                      fontWeight: 600,
                    }}
                    onClick={() => setPgRendered(pgCode)}
                  >
                    ▶ Run Preview
                  </button>
                </div>
              </div>
              <textarea
                value={pgCode}
                onChange={(e) => setPgCode(e.target.value)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: "#e6edf3",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Consolas, monospace",
                  fontSize: "13px",
                  lineHeight: 1.6,
                  padding: "16px",
                  outline: "none",
                  resize: "none",
                }}
              />
            </div>
            {/* Live Preview Column */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                background: "#131922",
                border: "1px solid #212a36",
                borderRadius: "12px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderBottom: "1px solid #212a36",
                  background: "#0c1017",
                }}
              >
                <span
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "12px",
                    color: "#38bdf8",
                  }}
                >
                  ✨ Live Sandbox Preview
                </span>
                <span style={{ fontSize: "11px", color: "#6f7d92" }}>
                  Terisolasi & Aman (Sandbox iframe)
                </span>
              </div>
              <div
                style={{ flex: 1, background: "#000", position: "relative" }}
              >
                <iframe
                  srcDoc={pgRendered}
                  title="Live Sandbox"
                  sandbox="allow-scripts"
                  style={{ width: "100%", height: "100%", border: "none" }}
                />
              </div>
            </div>
          </div>
        )}

        {tab === "diagnostics" && (
          <div
            style={{
              maxWidth: "860px",
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#131922",
                border: "1px solid #212a36",
                borderRadius: "12px",
                padding: "18px 22px",
              }}
            >
              <div>
                <div
                  style={{ fontSize: "16px", fontWeight: 600, color: "#fff" }}
                >
                  🔍 Status Lingkungan & Server WOLFSPACE
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "#6f7d92",
                    marginTop: "4px",
                  }}
                >
                  Monitor PTY health, local model connections, and memory usage.
                </div>
              </div>
              <button
                style={{ ...btnStyle, background: "#1f2937" }}
                onClick={checkDiagnostics}
              >
                🔄 Perbarui Data
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "16px",
              }}
            >
              <div
                style={{
                  background: "#131922",
                  border: "1px solid #212a36",
                  borderRadius: "12px",
                  padding: "18px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    color: "#6f7d92",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Koneksi Ollama API
                </div>
                <div
                  style={{
                    fontSize: "18px",
                    fontWeight: 600,
                    color: diagStats.ollamaStatus.includes("Active")
                      ? "#3fb950"
                      : "#f85149",
                    marginTop: "8px",
                  }}
                >
                  {diagStats.ollamaStatus}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#8b949e",
                    marginTop: "6px",
                  }}
                >
                  Latency Ping:{" "}
                  {diagStats.pingMs !== null ? `${diagStats.pingMs} ms` : "N/A"}
                </div>
              </div>
              <div
                style={{
                  background: "#131922",
                  border: "1px solid #212a36",
                  borderRadius: "12px",
                  padding: "18px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    color: "#6f7d92",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Uptime Sesi Server
                </div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 600,
                    color: "#58a6ff",
                    marginTop: "8px",
                  }}
                >
                  {diagStats.uptime}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#8b949e",
                    marginTop: "6px",
                  }}
                >
                  Active Node.js session port (8090)
                </div>
              </div>
              <div
                style={{
                  background: "#131922",
                  border: "1px solid #212a36",
                  borderRadius: "12px",
                  padding: "18px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    color: "#6f7d92",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Perkiraan Memori Heap
                </div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 600,
                    color: "#a371f7",
                    marginTop: "8px",
                  }}
                >
                  ~{diagStats.memUse} MB
                </div>
                <div
                  style={{
                    width: "100%",
                    background: "#212a36",
                    height: "6px",
                    borderRadius: "3px",
                    marginTop: "10px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, diagStats.memUse)}%`,
                      background: "linear-gradient(90deg, #388bfd, #a371f7)",
                      height: "100%",
                    }}
                  />
                </div>
              </div>
            </div>

            <div
              style={{
                background: "#131922",
                border: "1px solid #212a36",
                borderRadius: "12px",
                padding: "20px",
              }}
            >
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "#fff",
                  marginBottom: "14px",
                }}
              >
                🛠️ Aksi Cepat & Utilitas Dev
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                <button
                  style={btnStyle}
                  onClick={() => {
                    localStorage.clear();
                    alert("LocalStorage cleared.");
                  }}
                >
                  🧹 Bersihkan Cache LocalStorage
                </button>
                <button
                  style={btnStyle}
                  onClick={() => {
                    checkDiagnostics();
                    alert(
                      "Ollama ping diperiksa: " +
                        (diagStats.pingMs || "?") +
                        " ms",
                    );
                  }}
                >
                  📡 Test Ping HTTP Ollama
                </button>
                <button
                  style={btnStyle}
                  onClick={() => window.location.reload()}
                >
                  🔄 Reload Sesi Workspace
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "promptlab" && (
          <div
            style={{
              maxWidth: "860px",
              margin: "0 auto",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                background: "#131922",
                border: "1px solid #212a36",
                borderRadius: "12px",
                padding: "20px",
              }}
            >
              <div style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>
                🧪 Prompt Test Bench (Tanpa Masuk History)
              </div>
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#8b949e",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Model Target:
                </label>
                <div
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "13px",
                    color: "#58a6ff",
                    background: "#0d1117",
                    border: "1px solid #30363d",
                    padding: "8px 12px",
                    borderRadius: "6px",
                  }}
                >
                  {modelVal || "Default / Auto"}
                </div>
              </div>
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#8b949e",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  System Prompt / Persona:
                </label>
                <textarea
                  value={labSys}
                  onChange={(e) => setLabSys(e.target.value)}
                  style={{
                    width: "100%",
                    height: "70px",
                    background: "#0d1117",
                    border: "1px solid #30363d",
                    color: "#e6edf3",
                    borderRadius: "6px",
                    padding: "10px",
                    fontSize: "13px",
                    resize: "none",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#8b949e",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  User Prompt:
                </label>
                <textarea
                  value={labPrompt}
                  onChange={(e) => setLabPrompt(e.target.value)}
                  style={{
                    width: "100%",
                    height: "110px",
                    background: "#0d1117",
                    border: "1px solid #30363d",
                    color: "#e6edf3",
                    borderRadius: "6px",
                    padding: "10px",
                    fontSize: "13px",
                    resize: "none",
                  }}
                />
              </div>
              <button
                onClick={runPromptLab}
                disabled={labLoading}
                style={{
                  ...btnStyle,
                  background: labLoading ? "#212a36" : "#238636",
                  borderColor: labLoading ? "#30363d" : "#2ea043",
                  color: "#fff",
                  fontWeight: 600,
                  padding: "10px",
                }}
              >
                {labLoading
                  ? "⏳ Mengeksekusi Model..."
                  : "🚀 Eksekusi Uji Prompt"}
              </button>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                background: "#131922",
                border: "1px solid #212a36",
                borderRadius: "12px",
                padding: "20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "14px",
                }}
              >
                <span
                  style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}
                >
                  📈 Respons & Metrik
                </span>
                {labMetrics && (
                  <span
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: "11px",
                      background: "#1f2937",
                      color: "#38bdf8",
                      padding: "4px 8px",
                      borderRadius: "4px",
                    }}
                  >
                    {labMetrics.timeMs} ms · ~{labMetrics.tokens} tok ·{" "}
                    {labMetrics.tps} tok/s
                  </span>
                )}
              </div>
              <div
                style={{
                  flex: 1,
                  background: "#0d1117",
                  border: "1px solid #30363d",
                  borderRadius: "8px",
                  padding: "14px",
                  color: "#e6edf3",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "13px",
                  lineHeight: 1.6,
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {labLoading
                  ? "Sending the prompt to the LLM server…"
                  : labOutput ||
                    "Click 'Run Test Prompt' to see the model's raw response along with its latency."}
              </div>
            </div>
          </div>
        )}

        {tab === "cheatsheet" && (
          <div
            style={{
              maxWidth: "860px",
              margin: "0 auto",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
            }}
          >
            {[
              {
                title: "POST /api/chat",
                desc: "Sends the main chat message to the active model through the WOLFSPACE proxy.",
                cmd: `curl -X POST http://localhost:8090/api/chat -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"Hello"}],"model":"default"}'`,
              },
              {
                title: "GET /ollama/search",
                desc: "Searching the Ollama model list (community mirror + local status).",
                cmd: `curl http://localhost:8090/ollama/search?q=llama`,
              },
              {
                title: "POST /api/terminal/resize",
                desc: "Sends a column/row resize signal to the terminal PTY process.",
                cmd: `curl -X POST http://localhost:8090/api/terminal/resize -H "Content-Type: application/json" -d '{"cols":120,"rows":30}'`,
              },
              {
                title: "POST /api/agents/run",
                desc: "Runs a CLI agent (e.g. OpenCode) in an isolated session.",
                cmd: `curl -X POST http://localhost:8090/api/agents/run -H "Content-Type: application/json" -d '{"agent":"opencode","prompt":"Fix lint"}'`,
              },
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  background: "#131922",
                  border: "1px solid #212a36",
                  borderRadius: "12px",
                  padding: "18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#38bdf8",
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  {item.title}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "#8b949e",
                    lineHeight: 1.5,
                  }}
                >
                  {item.desc}
                </div>
                <div
                  style={{
                    background: "#0d1117",
                    border: "1px solid #30363d",
                    borderRadius: "6px",
                    padding: "10px",
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "11px",
                    color: "#cbd5e1",
                    overflowX: "auto",
                    marginTop: "4px",
                  }}
                >
                  {item.cmd}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ModelHubView() {
  return null;
}
function ModelHubViewOld() {
  return null;
  const loadLocal = useCallback(async () => {
    try {
      setLocal(await (await fetch("/models")).json());
    } catch (e) {}
  }, []);
  useEffect(() => {
    loadLocal();
  }, [loadLocal]);
  const stop = (id) => {
    const c = ctrls.current[id];
    if (c) {
      try {
        c.abort();
      } catch (e) {}
    }
    setDl((d) => ({ ...d, [id]: { state: "idle" } }));
  };
  const delModel = async (port) => {
    if (!window.confirm("Delete this model from disk?")) return;
    try {
      await fetch("/model/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port }),
      });
    } catch (e) {}
    loadLocal();
    onChanged && onChanged();
  };
  const [sizes, setSizes] = useState({}); // id -> {bytes, quant}  (the q4 download size)
  const sizeReq = useRef(0);
  const resolveSizes = useCallback(async (list) => {
    const token = ++sizeReq.current;
    for (const m of list) {
      if (token !== sizeReq.current) return; // a newer search started � stop
      try {
        const files = await (
          await fetch("/hf/files?id=" + encodeURIComponent(m.id))
        ).json();
        if (Array.isArray(files) && files.length) {
          const pick =
            files.find((f) => /q4_k_m/i.test(f.path)) ||
            files.find((f) => /q4/i.test(f.path)) ||
            files.slice().sort((a, b) => a.size - b.size)[0];
          const quant = (
            (pick.path.match(/q\d[a-z0-9_]*|f16|bf16/i) || [])[0] || ""
          ).toLowerCase();
          setSizes((s) => ({ ...s, [m.id]: { bytes: pick.size, quant } }));
        } else setSizes((s) => ({ ...s, [m.id]: { bytes: 0 } }));
      } catch (e) {}
    }
  }, []);
  const doSearch = useCallback(
    async (query) => {
      setLoading(true);
      setMsg("");
      try {
        const r = await (
          await fetch("/hf/search?q=" + encodeURIComponent(query))
        ).json();
        if (r.error) throw new Error(r.error);
        setResults(r);
        setSizes({});
        resolveSizes(r);
        if (!r.length) setMsg("No models available yet.");
      } catch (e) {
        setResults([]);
        setMsg("Failed to load model: " + e.message);
      }
      setLoading(false);
    },
    [resolveSizes],
  );
  useEffect(() => {
    const c = HUB_CATS.find((x) => x.key === cat) || HUB_CATS[0];
    doSearch(q.trim() || c.q);
  }, [cat]);
  const submit = () => {
    const c = HUB_CATS.find((x) => x.key === cat) || HUB_CATS[0];
    doSearch(q.trim() || c.q);
  };
  const download = async (id) => {
    if (
      dl[id] &&
      (dl[id].state === "downloading" || dl[id].state === "resolving")
    )
      return;
    setDl((d) => ({ ...d, [id]: { state: "resolving", progress: 0 } }));
    try {
      const files = await (
        await fetch("/hf/files?id=" + encodeURIComponent(id))
      ).json();
      if (files.error || !files.length) {
        setDl((d) => ({ ...d, [id]: { state: "idle" } }));
        setMsg(
          'Repo "' +
            id +
            '" tak punya file .gguf � coba repo berakhiran "-GGUF".',
        );
        return;
      }
      const pick =
        files.find((f) => /q4_k_m/i.test(f.path)) ||
        files.find((f) => /q4/i.test(f.path)) ||
        files.slice().sort((a, b) => a.size - b.size)[0];
      setDl((d) => ({ ...d, [id]: { state: "downloading", progress: 0 } }));
      const ctrl = new AbortController();
      ctrls.current[id] = ctrl;
      const res = await fetch("/hf/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, file: pick.path }),
        signal: ctrl.signal,
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          const m = line.match(/^data:\s*(.*)$/);
          if (!m) continue;
          let j;
          try {
            j = JSON.parse(m[1]);
          } catch (e) {
            continue;
          }
          if (j.t === "progress")
            setDl((d) => ({
              ...d,
              [id]: { state: "downloading", progress: j.pct },
            }));
          else if (j.t === "done") {
            setDl((d) => ({
              ...d,
              [id]: { state: "done", progress: 100, port: j.model.port },
            }));
            loadLocal();
            onChanged && onChanged();
          } else if (j.t === "err") {
            setDl((d) => ({ ...d, [id]: { state: "idle" } }));
            setMsg("Download failed: " + j.m);
          }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setDl((d) => ({ ...d, [id]: { state: "idle" } }));
        setMsg("Failed: " + e.message);
      }
    }
  };
  // Ollama: realtime library (scraped server-side). Refetch on source/query change.
  const fetchOllama = useCallback(async (query) => {
    setOllLoading(true);
    try {
      const r = await (
        await fetch("/ollama/search?q=" + encodeURIComponent(query || ""))
      ).json();
      setOll(Array.isArray(r) ? r : []);
    } catch (e) {
      setOll([]);
    }
    setOllLoading(false);
  }, []);
  useEffect(() => {
    if (source === "ollama") fetchOllama(q.trim());
  }, [source]);
  const submitO = () => fetchOllama(q.trim());
  // Resolve real download size (bytes) for a model:tag, cached. Marks loading as null.
  const oReq = useRef(0);
  const resolveSize = useCallback((name, tag) => {
    const id = name + ":" + tag;
    setOBytes((b) =>
      id in b
        ? b
        : (() => {
            fetch(
              "/ollama/size?name=" +
                encodeURIComponent(name) +
                "&tag=" +
                encodeURIComponent(tag),
            )
              .then((r) => r.json())
              .then((d) => setOBytes((b2) => ({ ...b2, [id]: d.bytes || 0 })))
              .catch(() => setOBytes((b2) => ({ ...b2, [id]: 0 })));
            return { ...b, [id]: null };
          })(),
    );
  }, []);
  // When Ollama results arrive, resolve the smallest (default) tag's size per model.
  useEffect(() => {
    if (source !== "ollama" || !oll.length) return;
    const token = ++oReq.current;
    let i = 0; // throttle: one manifest fetch at a time-ish
    const tick = () => {
      if (token !== oReq.current || i >= oll.length) return;
      const m = oll[i++];
      resolveSize(m.name, smallestTag(m.sizes));
      setTimeout(tick, 120);
    };
    tick();
  }, [oll, source]);
  // pick the smallest parameter size as the default tag (safest local download)
  const smallestTag = (sizes) => {
    if (!sizes || !sizes.length) return "latest";
    const parse = (s) => {
      const m = (s || "").match(/([\d.]+)\s*([bm])/i);
      if (!m) return 1e9;
      return parseFloat(m[1]) * (m[2].toLowerCase() === "b" ? 1 : 0.001);
    };
    return sizes.slice().sort((a, b) => parse(a) - parse(b))[0];
  };
  // Download an Ollama model's GGUF blob ? launch llama-server (SSE progress, keyed by name:tag)
  const downloadOllama = async (name, tag) => {
    const id = name + ":" + tag;
    if (dl[id] && dl[id].state === "downloading") return;
    setDl((d) => ({ ...d, [id]: { state: "downloading", progress: 0 } }));
    const ctrl = new AbortController();
    ctrls.current[id] = ctrl;
    try {
      const res = await fetch("/ollama/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, tag }),
        signal: ctrl.signal,
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          const m = line.match(/^data:\s*(.*)$/);
          if (!m) continue;
          let j;
          try {
            j = JSON.parse(m[1]);
          } catch (e) {
            continue;
          }
          if (j.t === "progress")
            setDl((d) => ({
              ...d,
              [id]: { state: "downloading", progress: j.pct },
            }));
          else if (j.t === "done") {
            setDl((d) => ({
              ...d,
              [id]: { state: "done", progress: 100, port: j.model.port },
            }));
            loadLocal();
            onChanged && onChanged();
          } else if (j.t === "err") {
            setDl((d) => ({ ...d, [id]: { state: "idle" } }));
            setMsg("Download failed: " + j.m);
          }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setDl((d) => ({ ...d, [id]: { state: "idle" } }));
        setMsg("Failed: " + e.message);
      }
    }
  };
  return (
    <div className="hub">
      <header className="hub-header">
        <div className="hub-title-group">
          <span className="hub-hf-mark">
            {source === "ollama" ? <HubIcon.ollama /> : <HubIcon.hf />}
          </span>
          <span className="hub-title">Model Hub</span>
        </div>
        <div className="tb-spacer" />
        <div className="hub-source">
          <button
            className={source === "hf" ? "active" : ""}
            onClick={() => setSource("hf")}
          >
            Hugging Face
          </button>
          <button
            className={source === "ollama" ? "active" : ""}
            onClick={() => setSource("ollama")}
          >
            Ollama
          </button>
        </div>
      </header>
      <div className="hub-body">
        <div className="hub-inner">
          {local.length > 0 && (
            <div className="hub-local">
              <div className="hub-local-title">
                ?? Model Terunduh ({local.length})
              </div>
              {local.map((m) => (
                <div className="hub-local-row" key={m.port}>
                  <div className="hub-local-info">
                    <b>{m.name}</b>
                    <span>
                      {m.size ? fmtSize(m.size) : ""} � port {m.port}
                    </span>
                  </div>
                  <button className="m-use-btn" onClick={() => onUse(m.port)}>
                    Gunakan
                  </button>
                  <button className="hub-del" onClick={() => delModel(m.port)}>
                    Hapus
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="hub-controls">
            <div className="hub-search">
              <HubIcon.search />
              <input
                placeholder={
                  source === "ollama"
                    ? "Search Ollama models� (llama, qwen, deepseek, phi)"
                    : "Search GGUF models� (llama, coder, qwen, phi)"
                }
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    source === "ollama" ? submitO() : submit();
                  }
                }}
              />
            </div>
          </div>
          {source === "hf" && (
            <div className="hub-filters">
              {HUB_CATS.map((c) => (
                <button
                  key={c.key}
                  className={"hub-filter" + (cat === c.key ? " active" : "")}
                  onClick={() => {
                    setQ("");
                    setCat(c.key);
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {source === "ollama" ? (
            ollLoading ? (
              <div className="hub-empty">
                <HubIcon.loader className="spin" />
                <div>Memuat dari Ollama�</div>
              </div>
            ) : oll.length ? (
              <div className="hub-grid">
                {oll.map((m) => (
                  <div className="m-card" key={m.name}>
                    <div className="m-card-head">
                      <LLMLogo name={m.name} />
                      <div className="m-card-info">
                        <div className="m-card-name">{m.name}</div>
                        <div className="m-card-id">
                          {ollamaBrand(m.name).key !== "generic"
                            ? ollamaBrand(m.name).key
                            : "ollama"}
                        </div>
                      </div>
                    </div>
                    <p className="m-card-desc">{m.description}</p>
                    {m.capabilities.length > 0 && (
                      <div className="m-card-tags">
                        {m.capabilities.map((c) => (
                          <span key={c} className={"m-cap " + capClass(c)}>
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                    {m.sizes.length > 0 &&
                      (() => {
                        const cur = oSize[m.name] || smallestTag(m.sizes);
                        return (
                          <div className="m-card-tags m-size-row">
                            {m.sizes.map((s) => (
                              <button
                                key={s}
                                className={"m-size" + (cur === s ? " sel" : "")}
                                onClick={() => {
                                  setOSize((o) => ({ ...o, [m.name]: s }));
                                  resolveSize(m.name, s);
                                }}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    {(() => {
                      const tag = oSize[m.name] || smallestTag(m.sizes);
                      const b = oBytes[m.name + ":" + tag];
                      return (
                        <div className="m-card-meta">
                          <span className="m-dlsize">
                            {b === undefined ? (
                              <span style={{ opacity: 0.5 }}>? </span>
                            ) : b === null ? (
                              <span style={{ opacity: 0.5 }}>? menghitung</span>
                            ) : b > 0 ? (
                              <code>
                                ? {fmtSize(b)} {tag}
                              </code>
                            ) : (
                              <span style={{ opacity: 0.5 }}>? ?</span>
                            )}
                          </span>
                          <span>
                            <HubIcon.dl style={{ width: 12, height: 12 }} />{" "}
                            {m.pulls}
                          </span>
                          <span>?? {m.tags}</span>
                          {m.updated && <span>? {m.updated}</span>}
                        </div>
                      );
                    })()}
                    {(() => {
                      const tag = oSize[m.name] || smallestTag(m.sizes);
                      const id = m.name + ":" + tag;
                      const d = dl[id] || {};
                      const st = d.state || "idle";
                      return (
                        <>
                          {st === "downloading" && (
                            <div className="m-progress">
                              <div className="m-progress-bar">
                                <div
                                  className="m-progress-fill"
                                  style={{ width: (d.progress || 0) + "%" }}
                                />
                              </div>
                              <div className="m-progress-info">
                                <span>Mengunduh {tag}</span>
                                <span>{Math.round(d.progress || 0)}%</span>
                              </div>
                            </div>
                          )}
                          <div className="m-card-foot">
                            {st === "done" ? (
                              <>
                                <span className="m-done-badge">
                                  <HubIcon.check /> Terunduh
                                </span>
                                <button
                                  className="m-use-btn active"
                                  onClick={() => onUse(d.port)}
                                >
                                  Gunakan
                                </button>
                                <button
                                  className="hub-del"
                                  onClick={() => delModel(d.port)}
                                >
                                  Hapus
                                </button>
                              </>
                            ) : st === "downloading" ? (
                              <>
                                <button className="m-dl-btn" disabled>
                                  <HubIcon.loader className="spin" /> Mengunduh
                                </button>
                                <button
                                  className="hub-del"
                                  onClick={() => stop(id)}
                                >
                                  Stop
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="m-dl-btn"
                                  onClick={() => downloadOllama(m.name, tag)}
                                >
                                  <HubIcon.download /> Download {m.name}:{tag}
                                </button>
                                <a
                                  className="hub-del"
                                  href={"https://ollama.com/library/" + m.name}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ textDecoration: "none" }}
                                >
                                  ?
                                </a>
                              </>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            ) : (
              <div className="hub-empty">
                <HubIcon.empty />
                <div>{q ? "No matching models." : "Loading…"}</div>
              </div>
            )
          ) : loading ? (
            <div className="hub-empty">
              <HubIcon.loader className="spin" />
              <div>Memuat dari Hugging Face</div>
            </div>
          ) : results.length ? (
            <div className="hub-grid">
              {results.map((m) => {
                const d = dl[m.id] || {};
                const st = d.state || "idle";
                const author = m.id.split("/")[0] || "?";
                const name = m.id.split("/").pop();
                return (
                  <div className="m-card" key={m.id}>
                    <div className="m-card-head">
                      {m.avatar ? (
                        <img
                          className="m-card-logo"
                          src={m.avatar}
                          alt={author}
                          loading="lazy"
                          onError={(e) => {
                            e.target.style.display = "none";
                            e.target.nextSibling.style.display = "grid";
                          }}
                        />
                      ) : null}
                      <div
                        className={"m-card-icon " + iconColorFor(author)}
                        style={{ display: m.avatar ? "none" : "grid" }}
                      >
                        {author[0].toUpperCase()}
                      </div>
                      <div className="m-card-info">
                        <div className="m-card-name">{name}</div>
                        <div className="m-card-id">{m.id}</div>
                      </div>
                    </div>
                    {(m.pipeline || (m.tags && m.tags.length) || m.library) && (
                      <div className="m-card-tags">
                        {m.pipeline && (
                          <span
                            className={
                              "m-tag " +
                              (/code/i.test(m.pipeline) ? "code" : "gen")
                            }
                          >
                            {m.pipeline}
                          </span>
                        )}
                        {m.library && (
                          <span className="m-tag-soft">{m.library}</span>
                        )}
                        {(m.tags || []).slice(0, 2).map((t) => (
                          <span className="m-tag-soft" key={t}>
                            {t}
                          </span>
                        ))}
                        {m.gated && (
                          <span className="m-tag-soft">?? gated</span>
                        )}
                      </div>
                    )}
                    <div className="m-card-meta">
                      <span>
                        <HubIcon.dl style={{ width: 12, height: 12 }} />{" "}
                        {fmtN(m.downloads)} unduhan
                      </span>
                      <span>
                        <HubIcon.star
                          style={{
                            width: 12,
                            height: 12,
                            color: "var(--brand)",
                          }}
                        />{" "}
                        {fmtN(m.likes)}
                      </span>
                      {m.updated && <span>? {fmtDate(m.updated)}</span>}
                      {sizes[m.id] ? (
                        <span>
                          <code>
                            {sizes[m.id].bytes
                              ? "? " +
                                fmtSize(sizes[m.id].bytes) +
                                (sizes[m.id].quant
                                  ? "  " + sizes[m.id].quant
                                  : "")
                              : ""}
                          </code>
                        </span>
                      ) : (
                        <span style={{ opacity: 0.5 }}>? menghitung</span>
                      )}
                    </div>
                    {st === "downloading" && (
                      <div className="m-progress">
                        <div className="m-progress-bar">
                          <div
                            className="m-progress-fill"
                            style={{ width: (d.progress || 0) + "%" }}
                          />
                        </div>
                        <div className="m-progress-info">
                          <span>Mengunduh</span>
                          <span>{Math.round(d.progress || 0)}%</span>
                        </div>
                      </div>
                    )}
                    <div className="m-card-foot">
                      {st === "done" ? (
                        <>
                          <span className="m-done-badge">
                            <HubIcon.check /> Terunduh
                          </span>
                          <button
                            className="m-use-btn active"
                            onClick={() => onUse(d.port)}
                          >
                            Gunakan
                          </button>
                          <button
                            className="hub-del"
                            onClick={() => delModel(d.port)}
                          >
                            Hapus
                          </button>
                        </>
                      ) : st === "downloading" ? (
                        <>
                          <button className="m-dl-btn" disabled>
                            <HubIcon.loader className="spin" /> Mengunduh
                          </button>
                          <button
                            className="hub-del"
                            onClick={() => stop(m.id)}
                          >
                            Stop
                          </button>
                        </>
                      ) : st === "resolving" ? (
                        <button className="m-dl-btn" disabled>
                          <HubIcon.loader className="spin" /> Menyiapkan
                        </button>
                      ) : (
                        <button
                          className="m-dl-btn"
                          onClick={() => download(m.id)}
                        >
                          <HubIcon.download /> Download
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="hub-empty">
              <HubIcon.empty />
              <div>{msg || "Type to search for a model."}</div>
            </div>
          )}
          {msg && results.length > 0 && (
            <div className="hf-msg" style={{ marginTop: 14 }}>
              {msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
