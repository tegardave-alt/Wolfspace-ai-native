// AgentRunner — diekstrak dari app.jsx (lihat public/app.jsx untuk App orkestrator).
// Dimuat via APP_MODULES di index.html: di-CONCAT SEBELUM app.jsx (prepend) lalu
// Babel sekali -> satu scope global. Body fungsi (hooks/React/SB) jalan saat render.

function AgentRunnerView({
  onBack,
  agents,
  activeAgent,
  agentRunning,
  agentOutput,
  onLoadAgents,
  onStart,
  onStop,
  onSend,
  currentModel,
  panelOpen,
  setPanelOpen,
}) {
  // Command Palette: state/logic now lives in App() (see App's own hooks) —
  // this component's local copy was never reachable from App's trigger button.
  const [selected, setSelected] = useState("");
  const [fullScreenAgent, setFullScreenAgent] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState("");
  const [localRunning, setLocalRunning] = useState(false);
  const xtermRef = useRef(null); // DOM container for xterm.js
  const termRef = useRef(null); // xterm.js Terminal instance
  const fitRef = useRef(null); // xterm.js FitAddon
  const esRef = useRef(null); // EventSource for SSE
  const localRunningRef = useRef(false); // mirror of localRunning for closures
  const ensureStartedRef = useRef(null); // ref to ensureStarted function
  const inputQueueRef = useRef([]); // queue of pending keystrokes
  const sendingRef = useRef(false); // lock for sequential send
  const startingRef = useRef(false); // prevent concurrent agent starts
  const runnerAgents = agents.filter((a) => (a.id || a.name) !== "WOLFSPACE");

  const getAgentStyle = (id) => {
    if (id === "WOLFSPACE") {
      return {
        background: "rgba(139,109,255,0.12)",
        color: "#8b6dff",
        padding: "6px",
        borderRadius: "8px",
        display: "inline-flex",
      };
    }
    if (id === "opencode") {
      return {
        background: "rgba(16,185,129,0.12)",
        color: "#10b981",
        padding: "6px",
        borderRadius: "8px",
        display: "inline-flex",
      };
    }
    if (id === "claude") {
      return {
        background: "rgba(217,119,87,0.12)",
        color: "#D97757",
        padding: "6px",
        borderRadius: "8px",
        display: "inline-flex",
      };
    }
    return {};
  };

  const getAgentIcon = (id) => {
    if (id === "WOLFSPACE") return SB.wolfspaceAgent;
    if (id === "opencode") return SB.opencode;
    if (id === "claude") return SB.claude;

    return SB.runner;
  };

  useEffect(() => {
    onLoadAgents();
  }, []);

  // Sync localRunningRef
  useEffect(() => {
    localRunningRef.current = localRunning;
  }, [localRunning]);

  // Set ensureStartedRef
  useEffect(() => {
    ensureStartedRef.current = ensureStarted;
  });

  // -- xterm.js init when fullscreen opens --
  useEffect(() => {
    if (!fullScreenAgent || !xtermRef.current) return;
    // Cleanup any existing terminal
    if (termRef.current) {
      try {
        termRef.current.dispose();
      } catch (_) {}
      termRef.current = null;
    }
    const term = new window.Terminal({
      cols: 120,
      rows: 40,
      scrollback: 10000,
      altClickMovesCursor: true,
      fontFamily: '"JetBrains Mono", Consolas, "Cascadia Code", monospace',
      fontSize: 13,
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
      },
      cursorBlink: true,
      allowProposedApi: true,
    });
    // xterm.js: FitAddon should be provided by xterm-addon-fit.
    // Some builds expose it as a named export (FitAddon) rather than window.FitAddon.
    const FitAddonCtor =
      window.FitAddon?.FitAddon ||
      window.FitAddon ||
      window.fitAddon?.FitAddon ||
      window.xterm?.FitAddon;
    if (!FitAddonCtor) throw new Error('FitAddon not found/loaded');
    const fit = new FitAddonCtor();
    term.loadAddon(fit);
    const agentId = fullScreenAgent
      ? fullScreenAgent.id || fullScreenAgent.name
      : "";
    term.open(xtermRef.current);
    // Send resize to backend PTY so CLI process (e.g. opencode) adjusts its layout
    term.onResize(({ cols, rows }) => {
      if (agentId) {
        fetch("/api/agents/resize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: agentId, cols, rows }),
        }).catch(() => {});
      }
    });
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    term.focus();

    // -- Scroll support: Hanya izinkan scroll di normal buffer, tidak di alternate buffer (TUI)
    // Alternate buffer (yang dipakai opencode CLI/TUI) harus dikontrol penuh oleh aplikasi agar tampilan tidak rusak
    let wheelCleanup = () => {};
    try {
      const el = xtermRef.current;
      if (el && term) {
        const onWheel = (e) => {
          try {
            const buf = term.buffer && term.buffer.active;
            // Hanya proses scroll manual jika BUKAN alternate buffer (TUI)
            // Di alternate buffer, biarkan TUI yang menangani semua input agar tampilan tidak pecah
            if (buf && buf.type === 'alternate') return;
          } catch (_) {}
        };
        el.addEventListener('wheel', onWheel, { capture: true, passive: true });
        wheelCleanup = () => {
          try { el.removeEventListener('wheel', onWheel, { capture: true }); } catch (_) {}
        };
      }
    } catch (_) {}

    // xterm input ? auto-start agent on first keystroke, then send to PTY

    // -- Queue-based sender -- ensures sequential, ordered delivery to PTY
    const flushQueue = async () => {
      if (sendingRef.current) return; // already flushing
      sendingRef.current = true;
      try {
        // Wait for agent start if it's in progress
        while (startingRef.current) {
          await new Promise((r) => setTimeout(r, 50));
        }
        // Auto-start if not running
        if (!localRunningRef.current && agentId) {
          startingRef.current = true;
          const ok = await ensureStartedRef.current(agentId);
          startingRef.current = false;
          if (!ok) {
            sendingRef.current = false;
            return;
          }
          // Let PTY settle
          await new Promise((r) => setTimeout(r, 300));
        }
        // Drain queue � send all buffered chars as one batch
        while (inputQueueRef.current.length > 0) {
          const batch = inputQueueRef.current.splice(0).join("");
          await fetch("/api/agents/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: agentId, text: batch }),
          });
          // Brief pause to let more chars accumulate if user is still typing fast
          await new Promise((r) => setTimeout(r, 10));
        }
      } catch (_) {}
      sendingRef.current = false;
      // If more chars arrived during the last send, flush again
      if (inputQueueRef.current.length > 0) flushQueue();
    };

    term.onData((data) => {
      if (!agentId) return;
      inputQueueRef.current.push(data);
      flushQueue();
    });

    // Debounced resize � prevents flooding PTY with rapid SIGWINCH
    let resizeDebounce = null;
    const doFit = () => {
      clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(() => {
        try {
          fit.fit();
        } catch (_) {}
      }, 150);
    };
    const ro = new ResizeObserver(() => doFit());
    ro.observe(xtermRef.current);
    window.addEventListener("resize", doFit);

    return () => {
      clearTimeout(resizeDebounce);
      ro.disconnect();
      window.removeEventListener("resize", doFit);
      wheelCleanup();
      if (termRef.current) {
        try {
          termRef.current.dispose();
        } catch (_) {}
        termRef.current = null;
      }
    };
  }, [fullScreenAgent]);

  // -- SSE stream: raw PTY output ? xterm.js --
  const subscribeStream = (agentId) => {
    if (esRef.current) {
      try {
        esRef.current.close();
      } catch (_) {}
    }
    const es = new EventSource("/api/agents/stream");
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type === "output" && d.id === agentId) {
          const raw = d.text || "";
          if (raw && termRef.current) termRef.current.write(raw);
        } else if (d.type === "done" && d.id === agentId) {
          setLocalRunning(false);
        } else if (d.type === "error" && d.id === agentId) {
          if (termRef.current)
            termRef.current.write("\n[ERROR] " + (d.message || "") + "\n");
          setLocalRunning(false);
        }
      } catch (_) {}
    };
    es.onerror = () => {
      esRef.current = null;
    };
  };

  // Open full-screen when card clicked
  const openFullScreen = (agent) => {
    const id = agent.id || agent.name;
    setFullScreenAgent(agent);
    setSelected(id);
    setInstallMsg("");
  };

  const closeFullScreen = () => {
    if (esRef.current) {
      try {
        esRef.current.close();
      } catch (_) {}
      esRef.current = null;
    }
    if (termRef.current) {
      try {
        termRef.current.dispose();
      } catch (_) {}
      termRef.current = null;
    }
    // Stop agent if running
    if (localRunning && selected) {
      fetch("/api/agents/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected }),
      }).catch(() => {});
    }
    setFullScreenAgent(null);
    setLocalRunning(false);
  };

  // Start agent � auto-start on first keystroke if not running
  const ensureStarted = async (agentId) => {
    const id = agentId || selected;
    if (localRunningRef.current || !id) return true;
    // Mark running immediately to prevent concurrent starts
    localRunningRef.current = true;
    try {
      const res = await fetch("/api/agents/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          model: currentModel || "",
          cwd: "",
          cols: termRef.current?.cols,
          rows: termRef.current?.rows,
        }),
      });
      if (res.ok) {
        setLocalRunning(true);
        subscribeStream(id);
        // Sync PTY size to actual xterm.js dimensions (PTY spawns at 120x40 but xterm may differ)
        if (termRef.current) {
          const { cols, rows } = termRef.current;
          fetch("/api/agents/resize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, cols, rows }),
          }).catch(() => {});
        }
        return true;
      } else {
        localRunningRef.current = false;
        const data = await res.json().catch(() => ({}));
        if (termRef.current)
          termRef.current.write(
            "\n? " + (data.error || "Gagal start agent") + "\n",
          );
        return false;
      }
    } catch (e) {
      localRunningRef.current = false;
      if (termRef.current)
        termRef.current.write("\n? " + e.message + "\n");
      return false;
    }
  };

  // Stop agent
  const handleStop = async () => {
    try {
      await fetch("/api/agents/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected }),
      });
    } catch (_) {}
    setLocalRunning(false);
    if (esRef.current) {
      try {
        esRef.current.close();
      } catch (_) {}
      esRef.current = null;
    }
  };

  // Install CLI
  const handleInstall = async () => {
    setInstalling(true);
    setInstallMsg("Installing...");
    try {
      const res = await fetch("/api/agents/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected }),
      });
      const data = await res.json();
      if (data.ok) {
        setInstallMsg("? Installed successfully!");
        setTimeout(() => onLoadAgents(), 500);
      } else {
        setInstallMsg("? " + (data.error || "Install failed"));
      }
    } catch (e) {
      setInstallMsg("? " + e.message);
    }
    setInstalling(false);
  };

  const fsAgent = fullScreenAgent;
  const fsId = fsAgent ? fsAgent.id || fsAgent.name : "";
  const FSIcon = getAgentIcon(fsId);
  const fsAvailable = fsAgent ? fsAgent.available : false;

  return (
    <div
      className="hub"
      style={{
        background:
          "radial-gradient(1200px 600px at 80% -10%, rgba(139,109,255,0.06), transparent 60%), radial-gradient(1000px 500px at 10% 110%, rgba(59,130,246,0.05), transparent 55%), var(--bg)",
      }}
    >
      {fsAgent ? (
        /* ----------- FULL-SCREEN AGENT VIEW ----------- */
        <div className="ar-fullscreen">
          {/* Header */}
          <header className="ar-fs-header">
            {typeof fsAgent.icon === "string" &&
            (fsAgent.icon.startsWith("data:") ||
              /\.(png|svg|jpg|jpeg|gif|webp|ico)$/i.test(fsAgent.icon)) ? (
              <img
                className="ar-fs-icon"
                src={fsAgent.icon}
                alt={fsAgent.name || ""}
              />
            ) : (
                            <span className="ar-fs-icon" style={getAgentStyle(fsId)}>
                {typeof FSIcon === "function" ? FSIcon({ width: 22, height: 22 }) : FSIcon}
              </span>
            )}
            <span className="ar-fs-name">{fsAgent.name || fsId}</span>
            <span
              className={
                "ar-fs-status " +
                (localRunning ? "running" : fsAvailable ? "ready" : "")
              }
            >
              <span className="ar-fs-dot" />
              {localRunning
                ? "Berjalan"
                : fsAvailable
                  ? "Siap"
                  : "Belum terpasang"}
            </span>
            <div className="tb-spacer" />
            {localRunning && (
              <button className="ar-fs-stop-btn" onClick={handleStop}>
                ⏹ Stop
              </button>
            )}
          </header>

          {/* Body: xterm.js terminal */}
          <div className="ar-fs-body">
            <>
                <div
                  className="ar-fs-terminal"
                  ref={xtermRef}
                  style={{ flex: 1, padding: 0, overflow: "hidden" }}
                />
                {/* -- MINI SIDEBAR -- */}
                <div className="ar-fs-sidebar-mini">
                  <div className="ar-fs-section">
                    <div className="ar-fs-section-label">Status</div>
                    <div className="ar-fs-status-row">
                      <span
                        className={"ar-fs-badge " + (fsAvailable ? "ok" : "warn")}
                      >
                        {fsAvailable ? "Terpasang" : "Belum terpasang"}
                      </span>
                      {!fsAvailable && (
                        <button
                          className="ar-fs-install-btn"
                          onClick={handleInstall}
                          disabled={installing}
                        >
                          {installing ? "Memasang..." : "Pasang CLI"}
                        </button>
                      )}
                    </div>
                    {installMsg && (
                      <div className="ar-fs-install-msg">{installMsg}</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* ----------- GRID VIEW ----------- */
        <>
          {/* Header */}
          <header className="hub-header">
            <div className="hub-title-group">
              <span
                className="hub-hf-mark"
                style={{
                  background: "linear-gradient(135deg,#8b6dff,#6d4aff)",
                }}
              >
                {SB.runner({ width: 16, height: 16 })}
              </span>
              <span className="hub-title">Agent Runner</span>
              <span className="hub-subtitle">Multi-agent host</span>
            </div>
            <div className="tb-spacer" />
            <button 
              className={`panel-toggle-btn ${panelOpen ? 'active' : ''}`}
              onClick={() => setPanelOpen(!panelOpen)}
              title="Toggle Right Panel"
              style={{ 
                opacity: panelOpen ? 1 : 0.7, 
                background: 'transparent', 
                border: 'none', 
                cursor: 'pointer', 
                color: 'inherit',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                <line x1="15" x2="15" y1="3" y2="21"/>
              </svg>
            </button>
          </header>

          {/* Body */}
          <div className="hub-body">
            <div className="hub-inner">
              <div
                className="agent-runner-view"
                style={{ padding: "0", height: "auto", overflow: "visible" }}
              >
                <div>
                  <div className="agent-runner-section-label">Pilih Agent</div>
                  {runnerAgents.length === 0 ? (
                    <div className="agent-runner-empty">
                      Belum ada agent yang tersedia. Pastikan backend /api/agents
                      sedang berjalan.
                    </div>
                  ) : (
                    <div className="agent-runner-grid">
                      {runnerAgents.map((a) => {
                        const id = a.id || a.name;
                        const Icon = getAgentIcon(id);
                        return (
                          <div
                            key={id}
                            className={"agent-runner-card"}
                            onClick={() => openFullScreen(a)}
                          >
                            <div className="agent-runner-card-head">
                              <span
                                className={
                                  "agent-runner-card-icon" +
                                  (id === "WOLFSPACE"
                                    ? " agent-WOLFSPACE"
                                    : id === "opencode"
                                      ? " agent-opencode"
                                      : id === "claude"
                                        ? " agent-claude"
                                        : "")
                                }
                              >
                                {typeof Icon === "function" ? Icon({ width: 18, height: 18 }) : Icon}
                              </span>
                              <span className="agent-runner-card-name">
                                {a.name || id}
                              </span>
                              {a.available ? (
                                <span className="ar-card-badge">tersedia</span>
                              ) : (
                                <span
                                  className="ar-card-badge"
                                  style={{ color: "var(--text-faint)" }}
                                >
                                  belum terpasang
                                </span>
                              )}
                            </div>
                            <div className="agent-runner-card-desc">
                              {a.description || a.desc || ""}
                            </div>
                            {a.model && (
                              <div className="agent-runner-card-model">
                                Model: {a.model}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   shadcn/ui-style Components (zero-dep, Tailwind classes)
   ============================================================ */
