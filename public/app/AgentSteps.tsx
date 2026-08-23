// NOTE on the `: any` props below. Their shape comes from the agent run state
// built in public/app.tsx, which has not migrated yet. Writing a made-up shape
// here would be a lie that typechecks; these narrow once app.tsx follows.

// AgentSteps — extracted from Sidebar.tsx (the app.tsx split): ToolOutput,
// *ActionRow, ConsolidatedThoughtCard, AgentSteps, HitlModal. Prepended via
// APP_MODULES.

// useDekatLayar moved to Config.tsx (loaded FIRST) because CodeBlocks.tsx
// uses it too and loads BEFORE this file. Today every module is concatenated
// into one <script>, so hoisting covers it — but that is a guarantee which
// could disappear silently if loading is ever split up.
function ToolOutput({ text, ok, kind, arg }: any) {
  const [edReady, setEdReady] = useState(false);
  const hostRef = useRef<any>(null);
  const edRef = useRef<any>(null);
  const wrapRef = useRef<any>(null);
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
      // ext comes from a filename, so it is an arbitrary string rather than one of
      // the literal keys; read through an index-typed view.
      return (langMap as Record<string, string>)[ext] || "plaintext";
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
    if (!dekat) return; // far off screen -> a <pre> is enough, skip the editor
    if (!window.monacoReady) return;
    window.monacoReady.then((monaco: any) => {
      if (disposed || !hostRef.current) return;
      const tryCreate = () => {
        if (disposed || !hostRef.current) return;
        try {
          const ed = monaco.editor.create(hostRef.current, {
            value: text || "",
            language,
            theme: "wolfspace-gelap",
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            lineNumbers: "on",
            renderLineHighlight: "none",
            // The 14px canvas Monaco paints itself along the editor's right
            // edge (error marks, search hits), active even with the minimap
            // off — and with a built-in border that CSS `outline` cannot
            // touch, because it is drawn to pixels rather than set through
            // style. Found while tracing a similar line in the Logic code
            // panel (LogicCodePane, app.tsx); matched here BEFORE anyone
            // reported it, because this app's three Monaco editors are meant
            // to look identical.
            overviewRulerLanes: 0,
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
        setEdReady(false); // drop back to <pre>, else an empty host is left behind
      }
    };
  }, [language, dekat]);
  // follow text changes — append at the end rather than rewriting the whole
  // model. The reasoning and the sizes are in terapkanTeksStream (Viewport.tsx).
  useEffect(() => {
    const ed = edRef.current;
    if (ed) terapkanTeksStream(ed, text);
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
function AgentActionLogRow({ e, i, expanded, setExpanded }: any) {
  const isOpen = !!expanded[i];

  if (e.type === "thought") {
    const text = e.output || e.arg || "Thinking...";
    const sections: any[] = [];
    const lines = text.split("\n");
    let current: any = null;
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
          onClick={() => setExpanded((p: any) => ({ ...p, [i]: !isOpen }))}
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
            {displaySections.map((s: any, idx: number) => (
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
  let fileLang: any = null;

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
    } else if (k === "retry") {
      // An agent retry. The backend used to emit this as force_retry from SIX
      // places, but the UI had no handler and no catch-all branch — so it
      // vanished silently. Every retry loop (up to 4 times, 60+ seconds) then
      // looked like a frozen screen, which itself read as "the run stopped on
      // its own". Now it is a timeline row, with its reason.
      verb = "Retried";
      icon = AG_SVG.grep;
      color = "#d7ba7d";
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
    const lm = lMap as Record<string, string>;
    if (lm[ext]) fileLang = lm[ext];
  }

  let added = 0;
  let removed = 0;
  if (verb === "Edited" && e.output && e.output.includes("@@")) {
    const lines = e.output.split("\n");
    added = lines.filter(
      (l: any) => l.startsWith("+") && !l.startsWith("+++"),
    ).length;
    removed = lines.filter(
      (l: any) => l.startsWith("-") && !l.startsWith("---"),
    ).length;
  }

  const SvgIcon = icon;

  return (
    <React.Fragment>
      <div
        className={"aal-row" + (e.output ? "" : " no-hover")}
        onClick={
          e.output
            ? () => setExpanded((p: any) => ({ ...p, [i]: !isOpen }))
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

function GroupedActionRow({ group, expanded, setExpanded }: any) {
  const acts = group.acts;
  const isError = acts.some((a: any) => !a.ok);
  const isOpen = expanded[group.id] !== false;
  return (
    <React.Fragment>
      <div
        className={"aal-row aal-group " + (isError ? "aal-error" : "")}
        onClick={() => setExpanded((p: any) => ({ ...p, [group.id]: !isOpen }))}
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
          {acts.map((a: any, j: number) => {
            // Each command has its OWN fold.
            //
            // Before this only the group could be folded, and every command's
            // body was always open. One group can hold a dozen commands with
            // long output, so scrolling to find a single result meant passing
            // all of them — and the only way to hide what you were not looking
            // for was folding the group, which hid what you were.
            //
            // The key is tied to the group id, not just the index: two
            // different groups each have their own command 0, and a bare index
            // would make both open and close together.
            const kunci = group.id + ":" + j;
            // CLOSED BY DEFAULT, which is the point of the change: output no
            // longer opens itself when a command finishes. The header stays
            // visible, so what ran and whether it succeeded is still readable
            // without opening anything.
            const isiTerbuka = !!expanded[kunci];
            const adaIsi = !!(a.output && String(a.output).trim());
            return (
              <div
                key={j}
                style={
                  j > 0 ? { borderTop: "1px solid rgba(175,184,193,0.3)" } : {}
                }
              >
                <div
                  onClick={() =>
                    adaIsi &&
                    setExpanded((p: any) => ({ ...p, [kunci]: !isiTerbuka }))
                  }
                  style={{
                    background: "#21262d",
                    padding: "4px 12px",
                    fontSize: "12px",
                    color: "#8c959f",
                    fontFamily: "monospace",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    // The pointer only appears when there is something to open;
                    // a row with no output must not look clickable.
                    cursor: adaIsi ? "pointer" : "default",
                  }}
                >
                  <span
                    className="aal-chevron"
                    style={{ opacity: adaIsi ? 1 : 0.25, width: "10px" }}
                  >
                    {adaIsi ? (isiTerbuka ? "▼" : "▶") : "·"}
                  </span>
                  <span style={{ color: "#3fb950" }}>...\wolfspace &gt;</span>{" "}
                  {a.arg || a.kind}
                  {!a.ok && (
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: "11px",
                        color: "#f85149",
                      }}
                    >
                      gagal
                    </span>
                  )}
                </div>
                {isiTerbuka && (
                  <ToolOutput
                    text={a.output}
                    ok={a.ok}
                    kind={a.kind}
                    arg={a.arg}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </React.Fragment>
  );
}

function ConsolidatedThoughtCard({ thoughts, expanded, setExpanded }: any) {
  const isOpen = expanded["thought_card"] === true;
  const allSections: any[] = [];
  const bullets: any[] = [];
  thoughts.forEach((thought: any) => {
    const text = (thought.output || thought.arg || "").trim();
    if (!text) return;
    const hasHeadings = /^##\s+/m.test(text);
    if (hasHeadings) {
      const lines = text.split("\n");
      let current: any = null;
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
        onClick={() =>
          setExpanded((p: any) => ({ ...p, thought_card: !isOpen }))
        }
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
          {bullets.map((b: any, idx: number) => (
            <div key={"b" + idx} className="aal-thought-bullet">
              • {b}
            </div>
          ))}
          {allSections.map((s: any, idx: number) => (
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

function AgentSteps({ run }: any) {
  const [expanded, setExpanded] = React.useState({});
  const allActs = (run.events || []).filter(
    (e: any) => e.type === "act" || e.type === "err" || e.type === "thought",
  );
  const thoughts = allActs.filter((e: any) => e.type === "thought");
  // todowrite rows are NOT shown in the timeline.
  //
  // todowrite sends TWO things for one event: a t:"todos" event that fills the
  // checklist panel above the input box, AND a summary string as tool output —
  // which without this filter reappears as a "✓ [high] ..." row in the
  // timeline. So one list would show twice, in two places, in two shapes.
  //
  // Only the DISPLAY is hidden. The tool still runs and its result still
  // reaches the model unchanged; what is dropped is the on-screen duplicate.
  const acts = allActs.filter(
    (e: any) =>
      e.type !== "thought" && (e.kind || "").toLowerCase() !== "todowrite",
  );
  const summary = cleanAgentText(run.summary);

  // EVERY hook must be called UNCONDITIONALLY before any return. The useState
  // and useEffect below used to sit AFTER the early return for
  // "run.done && no steps" -> the hook count changed between renders -> React
  // error #300 ("Rendered fewer hooks than expected") and a crash through
  // ErrorBoundary. Keep them above.
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    let timer: any;
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
      </React.Fragment>
    );
  if (!run.busy && allActs.length === 0 && run.error)
    return (
      <div className="bubble-model" style={{ color: "#fca5a5" }}>
        {summary || (run.events && run.events[0] && run.events[0].m) || "error"}
      </div>
    );

  // `expanded` is a per-section open/closed map keyed by section id, and the
  // ids are computed rather than literal — so it is read through an index type.
  const isTopOpen = (expanded as Record<string, unknown>).top !== false;

  const formatTime = (sec: any) => {
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
        onClick={() => setExpanded((p: any) => ({ ...p, top: !isTopOpen }))}
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
          const groupedActs: any[] = [];
          let currentGroup: any = null;
          acts.forEach((e: any, idx: number) => {
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
          return groupedActs.map((item: any, idx: number) => {
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
        {/* The todowrite checklist MOVED to the panel above the input box
            (TodoPanel in Components.tsx). Here it scrolled away with its own
            bubble, so a list whose whole purpose is to be seen WHILE working
            was the first thing to leave the screen. */}
        {run.busy && (
          <div className="aal-row aal-thought-header">
            {/* run.status is shown AS IS when present.
                This line could once only read "Thinking..." or
                "Processing...", so every wait looked the same — including a
                64-second model call and a 60-second MCP startup. The
                heartbeat text the backend already sent ("Still waiting for
                the model (30s)…") never reached the user's eyes. */}
            {/* A 3x3 box loader. aria-hidden because it is PURE decoration:
                the real state is carried by the text beside it, and a screen
                reader announcing nine empty boxes only obscures that. */}
            <span className="wl-muat" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span>
              {run.status || (run.thinking ? "Thinking..." : "Processing...")}
            </span>
          </div>
        )}
      </div>

      {/* The condition used to be `summary || run.run`. run.run is ALWAYS
          truthy — it holds a stub object from runReply — so this block
          rendered even with an empty summary, producing a hollow panel. It now
          depends on summary alone. */}
      {run.done && summary ? (
        <div style={{ marginTop: "8px" }}>
          <div className="bubble-model av2-result-bubble">
            <Blocks text={summary} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HitlModal({ request, onResolve }: any) {
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
          ).map((opt: any, i: number) => (
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
