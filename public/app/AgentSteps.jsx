// AgentSteps — diekstrak dari Sidebar.jsx (app.jsx split): ToolOutput, *ActionRow,
// ConsolidatedThoughtCard, AgentSteps, HitlModal. Prepend via APP_MODULES.

// useDekatLayar dipindah ke Config.jsx (dimuat PERTAMA) karena CodeBlocks.jsx
// juga memakainya dan dimuat LEBIH DULU dari berkas ini. Saat ini semua modul
// digabung jadi satu <script> sehingga hoisting menyelamatkannya, tapi itu
// jaminan yang bisa hilang diam-diam kalau pemuatannya dipecah nanti.
function ToolOutput({ text, ok, kind, arg }) {
  const [edReady, setEdReady] = useState(false);
  const hostRef = useRef(null);
  const edRef = useRef(null);
  const wrapRef = useRef(null);
  const dekat = useDekatLayar(wrapRef);
  // detect language from tool kind + file extension + content
  const language = useMemo(() => {
    if (kind === "read" && arg) {
      const ext = (arg || "").split(".").pop().toLowerCase();
      const langMap = {
        js: "javascript",
        jsx: "javascript",
        ts: "typescript",
        tsx: "typescript",
        py: "python",
        rb: "ruby",
        go: "go",
        rs: "rust",
        java: "java",
        c: "c",
        cpp: "cpp",
        dart: "dart",
        php: "php",
        yml: "yaml",
        yaml: "yaml",
        json: "json",
        xml: "xml",
        html: "html",
        css: "css",
        md: "markdown",
        sql: "sql",
        sh: "shell",
        bash: "shell",
        ps1: "powershell",
        cjs: "javascript",
        mjs: "javascript",
        kt: "kotlin",
        swift: "swift",
      };
      return langMap[ext] || "plaintext";
    }
    if (text) {
      if (
        /^(?:import|export|const|let|var|function|class|async|await|require)\b/m.test(
          text,
        )
      )
        return "javascript";
      if (/^(?:def |class |import |from |print\b)/m.test(text)) return "python";
      if (/^(?:fn |pub |let |mut |impl |enum |struct )/m.test(text))
        return "rust";
      if (/^(?:func |package |import |fmt\.)/m.test(text)) return "go";
      if (/^</m.test(text) && /<\/?[a-z]/i.test(text)) return "html";
      if (/^\{/m.test(text) || /"[^"]*"\s*:/m.test(text)) return "json";
      if (/^(?:#!|\$ |npm |git |cd |ls |echo |cat )/m.test(text))
        return "shell";
    }
    return "plaintext";
  }, [kind, arg, text]);
  // create Monaco editor
  useEffect(() => {
    let disposed = false;
    let retries = 0;
    if (!dekat) return; // jauh dari layar -> cukup <pre>, jangan buat editor
    if (!window.monacoReady) return;
    window.monacoReady.then((monaco) => {
      if (disposed || !hostRef.current) return;
      const tryCreate = () => {
        if (disposed || !hostRef.current) return;
        try {
          const ed = monaco.editor.create(hostRef.current, {
            value: text || "",
            language,
            theme: "vs-dark",
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            lineNumbers: "on",
            renderLineHighlight: "none",
            tabSize: 2,
            scrollbar: { alwaysConsumeMouseWheel: false },
            padding: { top: 6, bottom: 6 },
            wordWrap: "on",
            readOnly: true,
            domReadOnly: true,
            contextmenu: false,
            folding: true,
            glyphMargin: false,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 1,
          });
          edRef.current = ed;
          setEdReady(true);
          const fit = () => {
            if (!hostRef.current) return;
            hostRef.current.style.height =
              Math.min(Math.max(ed.getContentHeight(), 28), 400) + "px";
            ed.layout();
          };
          ed.onDidContentSizeChange(fit);
          fit();
        } catch (e) {
          if (retries < 10) {
            retries++;
            if (hostRef.current) hostRef.current.style.display = "block";
            setTimeout(tryCreate, 0);
          } else {
            setEdReady(false);
          }
        }
      };
      tryCreate();
    });
    return () => {
      disposed = true;
      if (edRef.current) {
        const model = edRef.current.getModel();
        if (model) model.dispose();
        edRef.current.dispose();
        edRef.current = null;
        setEdReady(false); // turun lagi ke <pre>, kalau tidak host kosong tersisa
      }
    };
  }, [language, dekat]);
  // follow text changes
  useEffect(() => {
    const ed = edRef.current;
    if (ed && ed.getValue() !== text) ed.setValue(text || "");
  }, [text]);
  return (
    <div className={"ar-out" + (ok ? "" : " err")} ref={wrapRef}>
      <div
        className="ar-out-mona-host"
        ref={hostRef}
        style={{ display: edReady ? "block" : "none" }}
      />
      {!edReady && (
        <pre
          style={{
            margin: 0,
            font: "inherit",
            color: "inherit",
            background: "transparent",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {text}
        </pre>
      )}
    </div>
  );
}

/* ── Agent Action Log (IDE Style) ── */
function AgentActionLogRow({ e, i, expanded, setExpanded }) {
  const isOpen = !!expanded[i];

  if (e.type === "thought") {
    const text = e.output || e.arg || "Thinking...";
    const sections = [];
    const lines = text.split("\n");
    let current = null;
    for (const line of lines) {
      const headingMatch = line.match(/^##\s+(.+)$/);
      if (headingMatch) {
        if (current) sections.push(current);
        current = { heading: headingMatch[1].trim(), body: "" };
      } else if (current) {
        current.body += line + "\n";
      }
    }
    if (current) sections.push(current);
    const hasSections = sections.length > 0;
    const displaySections = hasSections
      ? sections
      : [{ heading: "Thinking", body: text }];
    return (
      <React.Fragment>
        <div
          className="aal-row aal-thought-header"
          onClick={() => setExpanded((p) => ({ ...p, [i]: !isOpen }))}
        >
          <span>Thought Process</span>
          <span className={"aal-chevron" + (isOpen ? " open" : "")}>
            <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
              <path
                d="M5 3l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
        {isOpen && (
          <div className="aal-thought-content">
            {displaySections.map((s, idx) => (
              <div key={idx} className="aal-thought-section">
                <div className="aal-thought-heading">{s.heading}</div>
                <div className="aal-thought-body">{s.body.trim()}</div>
              </div>
            ))}
          </div>
        )}
      </React.Fragment>
    );
  }

  let verb = "Ran";
  let target = e.arg || "";
  let icon = AG_SVG.bash;
  let color = "var(--text-muted, #8c959f)";
  let fileLang = null;

  if (e.kind) {
    const k = e.kind.toLowerCase();
    if (k.includes("grep") || k.includes("search")) {
      verb = "Searched";
      icon = AG_SVG.grep;
    } else if (k.includes("read") || k.includes("view")) {
      verb = "Analyzed";
      icon = AG_SVG.read;
      color = "#61dafb";
    } else if (
      k.includes("edit") ||
      k.includes("replace") ||
      k.includes("write")
    ) {
      verb = "Edited";
      icon = AG_SVG.edit;
      color = "#ef4444";
    } else if (k.includes("list") || k.includes("glob")) {
      verb = "Explored";
      icon = AG_SVG.glob;
    }
  }

  if (verb !== "Ran" && verb !== "Explored" && target.includes(".")) {
    const ext = target.split(".").pop().toLowerCase();
    const lMap = {
      js: "javascript",
      jsx: "javascript",
      ts: "typescript",
      tsx: "typescript",
      py: "python",
      rb: "ruby",
      go: "go",
      rs: "rust",
      java: "java",
      c: "c",
      cpp: "cpp",
      dart: "dart",
      php: "php",
      yml: "yaml",
      yaml: "yaml",
      json: "json",
      xml: "xml",
      html: "html",
      css: "css",
      md: "markdown",
      sql: "sql",
      sh: "shell",
      bash: "shell",
      ps1: "powershell",
      cjs: "javascript",
      mjs: "javascript",
      kt: "kotlin",
      swift: "swift",
    };
    if (lMap[ext]) fileLang = lMap[ext];
  }

  let added = 0;
  let removed = 0;
  if (verb === "Edited" && e.output && e.output.includes("@@")) {
    const lines = e.output.split("\n");
    added = lines.filter(
      (l) => l.startsWith("+") && !l.startsWith("+++"),
    ).length;
    removed = lines.filter(
      (l) => l.startsWith("-") && !l.startsWith("---"),
    ).length;
  }

  const SvgIcon = icon;

  return (
    <React.Fragment>
      <div
        className={"aal-row" + (e.output ? "" : " no-hover")}
        onClick={
          e.output
            ? () => setExpanded((p) => ({ ...p, [i]: !isOpen }))
            : undefined
        }
      >
        <span>{verb}</span>
        {fileLang ? (
          <span className="aal-icon" style={{ marginTop: "1px" }}>
            <LangIcon lang={fileLang} />
          </span>
        ) : (
          SvgIcon && (
            <span className="aal-icon" style={{ color: color }}>
              <SvgIcon width={13} height={13} />
            </span>
          )
        )}
        <span className="aal-code-highlight">
          {target.substring(0, 60) + (target.length > 60 ? "..." : "")}
        </span>

        {verb === "Edited" && (added > 0 || removed > 0) ? (
          <React.Fragment>
            <span className="aal-diff-add">+{added}</span>
            <span className="aal-diff-sub">-{removed}</span>
          </React.Fragment>
        ) : null}

        {e.output && (
          <span
            className={"aal-chevron" + (isOpen ? " open" : "")}
            style={{ marginLeft: "auto" }}
          >
            <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
              <path
                d="M5 3l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
      </div>

      {isOpen && e.output && (
        <div
          style={{
            margin: "4px 8px 12px 24px",
            border: "1px solid rgba(175,184,193,0.3)",
            borderRadius: "6px",
            overflow: "hidden",
          }}
        >
          <ToolOutput text={e.output} ok={e.ok} kind={e.kind} arg={e.arg} />
        </div>
      )}
    </React.Fragment>
  );
}

function GroupedActionRow({ group, expanded, setExpanded }) {
  const acts = group.acts;
  const isError = acts.some((a) => !a.ok);
  const isOpen = expanded[group.id] !== false;
  return (
    <React.Fragment>
      <div
        className={"aal-row aal-group " + (isError ? "aal-error" : "")}
        onClick={() => setExpanded((p) => ({ ...p, [group.id]: !isOpen }))}
      >
        <span className="aal-chevron" style={{ marginRight: "6px" }}>
          {isOpen ? "▼" : "▶"}
        </span>
        <span>{acts.length} perintah dieksekusi</span>
        <span style={{ marginLeft: "auto", fontSize: "11px", opacity: 0.6 }}>
          {isError ? "Failed" : "Success"}
        </span>
      </div>
      {isOpen && (
        <div
          style={{
            margin: "4px 8px 12px 24px",
            border: "1px solid rgba(175,184,193,0.3)",
            borderRadius: "6px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {acts.map((a, j) => (
            <div
              key={j}
              style={
                j > 0 ? { borderTop: "1px solid rgba(175,184,193,0.3)" } : {}
              }
            >
              <div
                style={{
                  background: "#21262d",
                  padding: "4px 12px",
                  fontSize: "12px",
                  color: "#8c959f",
                  fontFamily: "monospace",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span style={{ color: "#3fb950" }}>...\wolfspace &gt;</span>{" "}
                {a.arg || a.kind}
              </div>
              <ToolOutput text={a.output} ok={a.ok} kind={a.kind} arg={a.arg} />
            </div>
          ))}
        </div>
      )}
    </React.Fragment>
  );
}

function ConsolidatedThoughtCard({ thoughts, expanded, setExpanded }) {
  const isOpen = expanded["thought_card"] === true;
  const allSections = [];
  const bullets = [];
  thoughts.forEach((thought) => {
    const text = (thought.output || thought.arg || "").trim();
    if (!text) return;
    const hasHeadings = /^##\s+/m.test(text);
    if (hasHeadings) {
      const lines = text.split("\n");
      let current = null;
      for (const line of lines) {
        const headingMatch = line.match(/^##\s+(.+)$/);
        if (headingMatch) {
          if (current) allSections.push(current);
          current = { heading: headingMatch[1].trim(), body: "" };
        } else if (current) {
          current.body += line + "\n";
        }
      }
      if (current) allSections.push(current);
    } else {
      bullets.push(text);
    }
  });
  const totalSteps = allSections.length + bullets.length;
  if (totalSteps === 0) return null;
  return (
    <React.Fragment>
      <div
        className="aal-row aal-thought-header"
        onClick={() => setExpanded((p) => ({ ...p, thought_card: !isOpen }))}
      >
        <span>
          Thought Process ({totalSteps} step{totalSteps > 1 ? "s" : ""})
        </span>
        <span className={"aal-chevron" + (isOpen ? " open" : "")}>
          <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
            <path
              d="M5 3l5 5-5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
      {isOpen && (
        <div className="aal-thought-content">
          {bullets.map((b, idx) => (
            <div key={"b" + idx} className="aal-thought-bullet">
              • {b}
            </div>
          ))}
          {allSections.map((s, idx) => (
            <div key={"s" + idx} className="aal-thought-section">
              <div className="aal-thought-heading">{s.heading}</div>
              <div className="aal-thought-body">{s.body.trim()}</div>
            </div>
          ))}
        </div>
      )}
    </React.Fragment>
  );
}

function AgentSteps({ run }) {
  const [expanded, setExpanded] = React.useState({});
  const allActs = (run.events || []).filter(
    (e) => e.type === "act" || e.type === "err" || e.type === "thought",
  );
  const thoughts = allActs.filter((e) => e.type === "thought");
  const acts = allActs.filter((e) => e.type !== "thought");
  const summary = cleanAgentText(run.summary);

  // SEMUA hook harus dipanggil TANPA SYARAT sebelum return mana pun. useState +
  // useEffect di bawah ini dulu berada SETELAH early-return "run.done && tak ada
  // langkah" → jumlah hook berubah antar render → React error #300 ("Rendered
  // fewer hooks than expected") dan crash lewat ErrorBoundary. Jaga tetap di atas.
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    let timer;
    if (run.busy) {
      // Record actual start time for this mount so intervals are accurate
      const start = Date.now() - elapsed * 1000;
      timer = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [run.busy]);

  if (run.done && allActs.length === 0 && !run.error)
    return (
      <React.Fragment>
        <div className="bubble-model">
          <Blocks text={summary} />
        </div>
        <Verdict run={run.run} />
      </React.Fragment>
    );
  if (!run.busy && allActs.length === 0 && run.error)
    return (
      <div className="bubble-model" style={{ color: "#fca5a5" }}>
        {summary || (run.events && run.events[0] && run.events[0].m) || "error"}
      </div>
    );

  const isTopOpen = expanded.top !== false;

  const formatTime = (sec) => {
    if (sec === 0 && !run.busy) return "a moment";
    if (sec < 60) return sec + "s";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + "m " + (s > 0 ? s + "s" : "");
  };

  return (
    <div className="aal-container">
      <div
        className="aal-row"
        onClick={() => setExpanded((p) => ({ ...p, top: !isTopOpen }))}
      >
        <span className="aal-code-highlight">
          Worked for{" "}
          {run.busy
            ? elapsed > 0
              ? formatTime(elapsed) + "..."
              : "..."
            : elapsed > 0
              ? formatTime(elapsed)
              : "1m"}
        </span>
        <span
          className={"aal-chevron" + (isTopOpen ? " open" : "")}
          style={{ marginLeft: "auto" }}
        >
          <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
            <path
              d="M5 3l5 5-5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>

      <div className={"aal-indent" + (isTopOpen ? "" : " aal-hidden")}>
        {thoughts.length > 0 && (
          <ConsolidatedThoughtCard
            thoughts={thoughts}
            expanded={expanded}
            setExpanded={setExpanded}
          />
        )}
        {(() => {
          const groupedActs = [];
          let currentGroup = null;
          acts.forEach((e, idx) => {
            if (e.type === "act") {
              if (!currentGroup) {
                currentGroup = [];
                groupedActs.push({
                  type: "group",
                  acts: currentGroup,
                  id: "g" + idx,
                });
              }
              currentGroup.push({ ...e, originalIndex: idx });
            } else {
              currentGroup = null;
              groupedActs.push({
                type: "single",
                event: e,
                originalIndex: idx,
              });
            }
          });
          return groupedActs.map((item, idx) => {
            if (item.type === "group")
              return (
                <GroupedActionRow
                  key={"g" + idx}
                  group={item}
                  expanded={expanded}
                  setExpanded={setExpanded}
                />
              );
            return (
              <AgentActionLogRow
                key={"s" + idx}
                e={item.event}
                i={item.originalIndex}
                expanded={expanded}
                setExpanded={setExpanded}
              />
            );
          });
        })()}
        {run.busy && (
          <div className="aal-row aal-thought-header">
            <span>{run.thinking ? "Thinking..." : "Processing..."}</span>
          </div>
        )}
      </div>

      {run.done && (summary || run.run) ? (
        <div style={{ marginTop: "8px" }}>
          {summary ? (
            <div className="bubble-model av2-result-bubble">
              <Blocks text={summary} />
            </div>
          ) : null}
          <Verdict run={run.run} />
        </div>
      ) : null}
    </div>
  );
}

function HitlModal({ request, onResolve }) {
  const [selected, setSelected] = React.useState(0);
  if (!request) return null;

  return (
    <div className="hitl-overlay">
      <div className="hitl-modal">
        <div className="hitl-title">{request.title || "Allow action?"}</div>
        {request.code && <div className="hitl-code-box">{request.code}</div>}
        <div className="hitl-options">
          {(
            request.options || [
              { value: "allow_once", text: "Yes, allow this time" },
              {
                value: "allow_project",
                text: "Yes, and always allow in this project",
              },
              { value: "allow_always", text: "Yes, and always allow" },
              { value: "deny", text: "No (tell the agent what to do instead)" },
            ]
          ).map((opt, i) => (
            <div
              key={i}
              className={"hitl-option " + (selected === i ? "selected" : "")}
              onClick={() => setSelected(i)}
            >
              <div className="hitl-badge">{i + 1}</div>
              <div className="hitl-text">
                {opt.text.replace(" (tell the agent what to do instead)", "")}
                {opt.text.includes("instead") && (
                  <span className="hitl-text-muted">
                    {" "}
                    (tell the agent what to do instead)
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="hitl-footer">
          <button className="hitl-btn-skip" onClick={() => onResolve(null)}>
            Skip
          </button>
          <button
            className="hitl-btn-submit"
            onClick={() => {
              const opts = request.options || [];
              const val = opts[selected] ? opts[selected].value : selected;
              onResolve(val);
            }}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
