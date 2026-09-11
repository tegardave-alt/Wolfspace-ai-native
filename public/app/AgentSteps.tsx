// AgentSteps.tsx — the agent activity feed: what the agent is doing, step by
// step, as it happens.
//
// ROLE IN THE SYSTEM. It renders the event stream the backend emits during a
// run (packages/contracts/agent-events.ts describes those shapes). What lives
// here: ToolOutput, the action rows, ConsolidatedThoughtCard, AgentSteps
// itself, and HitlModal — the human-in-the-loop approval dialog, which is the
// one place a run can be paused and released by a person.
//
// Split out of Sidebar.tsx. See public/app.tsx for how the renderer is
// assembled.
//
// The `: any` props below are deliberate: their shape comes from the run state
// built in public/app.tsx, which has not migrated yet, and inventing a shape
// here would be a lie that typechecks. They narrow when app.tsx follows.

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
            // Shared look and behaviour: opsiEditor() in Config.tsx. This app's
            // three Monaco editors are meant to look identical, and they used
            // to be kept that way by copying options between them by hand.
            ...opsiEditor(),
            value: text || "",
            language,
            lineNumbers: "on",
            tabSize: 2,
            padding: { top: 6, bottom: 6 },
            wordWrap: "on",
            readOnly: true,
            domReadOnly: true,
            contextmenu: false,
            glyphMargin: false,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 1,
            // ── THIS IS A TRANSCRIPT, NOT AN EDITOR ──
            //
            // opsiEditor() carries 13px/20px because that is what the CODE
            // PANEL wants — it is VS Code's own sizing and the panel is read
            // for minutes at a time. Tool output is neither: it sits inside
            // .ar-out, which is 11.5px with line-height 1.55, and every other
            // line around it (the action rows, the command header) is smaller
            // still.
            //
            // This was measured the hard way. Collapsing three editor.create()
            // calls onto one options object silently dropped this file's own
            // `fontSize: 12`, and the confinement notice came out visibly
            // larger than the command line printed directly above it. The
            // numbers below MATCH THE CONTAINER, so the block does not jump
            // when Monaco replaces the <pre> fallback either.
            fontSize: 11.5,
            lineHeight: 18,
            letterSpacing: 0,
            // Tool output is read, never typed into: an inlay hint or a
            // pinned header would both be noise on a transcript.
            inlayHints: { enabled: "off" },
            stickyScroll: { enabled: false },
            occurrencesHighlight: "off",
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
/**
 * ── HOW ONE AGENT ACTION READS ──
 *
 * ONE mapping, used by BOTH row renderers, and that is the whole point of
 * pulling it out. The timeline had two of them: single rows said "Analyzed" or
 * "Edited" beside a coloured icon, while GROUPED rows printed
 *
 *     ▶  ...\wolfspace >  browser
 *     ▶  ...\wolfspace >  browser
 *
 * a shell prompt that is not a shell, pointing at the app's own folder rather
 * than the workspace, repeated on every line, carrying nothing — followed by
 * `arg || kind`, which for a tool called without an argument is the bare word
 * twice over, with no way to tell the two calls apart.
 *
 * `planner` is here because a plan step is NOT a tool call with a target: its
 * `arg` is a sentence about what the agent is doing. agents-kit draws the same
 * line, giving `step` and `tool` items their own row shapes.
 */
function aksiGaya(kind: any) {
  const k = String(kind || "").toLowerCase();
  if (!k) return { verb: "Ran", icon: AG_SVG.bash };
  if (k === "planner") return { verb: "Planned", icon: AG_SVG.list };
  if (k === "retry") return { verb: "Retried", icon: AG_SVG.grep };
  if (k.includes("grep") || k.includes("search"))
    return { verb: "Searched", icon: AG_SVG.grep };
  if (k.includes("read") || k.includes("view"))
    return { verb: "Analyzed", icon: AG_SVG.read };
  if (k.includes("edit") || k.includes("replace") || k.includes("write"))
    return { verb: "Edited", icon: AG_SVG.edit };
  if (k.includes("list") || k.includes("glob"))
    return { verb: "Explored", icon: AG_SVG.glob };
  if (k.includes("browser") || k.includes("web"))
    return { verb: "Browsed", icon: AG_SVG.read };
  if (k.includes("terminal") || k.includes("bash") || k.includes("run"))
    return { verb: "Ran", icon: AG_SVG.run };
  return { verb: "Ran", icon: AG_SVG.bash };
}

/**
 * What the row shows AFTER the verb.
 *
 * The old grouped row used `arg || kind`, so a tool with no argument printed
 * its own name as its target — two `browser` rows, identical, indistinguishable.
 * Falling back to the KIND here would repeat the verb instead; falling back to
 * nothing is honest, and the row still says what ran.
 */
function aksiTarget(e: any) {
  const arg = e && e.arg;
  if (typeof arg === "string") return arg;
  if (arg && typeof arg === "object") {
    // Tools are called with objects as often as with strings. The first
    // string-valued field is what a person would have typed.
    for (const v of Object.values(arg))
      if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

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

  // FROM THE SHARED MAPPING. This block used to be a private if/else chain, and
  // the grouped rows below grew their own, different presentation because there
  // was nothing to share.
  const gaya = aksiGaya(e.kind);
  const verb = gaya.verb;
  const icon = gaya.icon;
  let target = aksiTarget(e);
  let fileLang: any = null;

  if (verb !== "Ran" && verb !== "Explored" && target.includes(".")) {
    const ext = (target.split(".").pop() || "").toLowerCase();
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
        {/* ICON, THEN VERB, THEN TARGET — the same order as a grouped row.
            The two renderers used to disagree even about that, so a timeline
            holding both had its columns land in different places. */}
        {fileLang ? (
          <span className="aal-icon" style={{ marginTop: "1px" }}>
            <LangIcon lang={fileLang} />
          </span>
        ) : (
          SvgIcon && (
            <span className="aal-icon">
              <SvgIcon width={13} height={13} />
            </span>
          )
        )}
        <span className="aal-verb">{verb}</span>
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
        <span>
          {acts.length === 1 ? "1 command run" : acts.length + " commands run"}
        </span>
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
                  // .aal-row, THE SAME CLASS A SINGLE ROW USES. This block used
                  // to lay itself out inline and disagreed with that class on
                  // four things at once, which is why the columns would not
                  // line up however wide they were made:
                  //
                  //   align-items  center   vs  flex-start  — and .aal-icon
                  //                carries margin-top: 2px, written for
                  //                flex-start, so the icon sat 2px BELOW the
                  //                word beside it. That is the gap between the
                  //                symbol and "Ran".
                  //   font-size    12px     vs  13px
                  //   font-family  monospace vs the UI font — so a 66px verb
                  //                column measured two different things
                  //   padding      4px 12px vs 4px 8px, moving the left edge
                  //
                  // Only the darker background is particular to a row inside a
                  // group, so only that is left inline.
                  className="aal-row"
                  style={{
                    background: "#21262d",
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
                  {/* THE SAME VOCABULARY AS A SINGLE ROW: an icon for the kind,
                      a verb, then what it acted on. What stood here was
                      "...\wolfspace >" — a shell prompt that is not a shell,
                      naming the app's own folder rather than the workspace,
                      repeated on every line and carrying nothing. */}
                  {(() => {
                    const g = aksiGaya(a.kind);
                    const G = g.icon;
                    const t = aksiTarget(a);
                    return (
                      <React.Fragment>
                        {G && (
                          <span className="aal-icon">
                            <G width={13} height={13} />
                          </span>
                        )}
                        <span className="aal-verb">{g.verb}</span>
                        {t ? (
                          <span className="aal-code-highlight">
                            {t.substring(0, 60) + (t.length > 60 ? "…" : "")}
                          </span>
                        ) : null}
                      </React.Fragment>
                    );
                  })()}
                  {!a.ok && (
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: "11px",
                        color: "#f85149",
                      }}
                    >
                      failed
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

/**
 * ── A CHECKPOINT IN THE TIMELINE ──
 *
 * The agent takes a snapshot before every edit, and it always has: the engine
 * is in agent/snapshot.ts, `GET /api/snapshots` and `POST /api/rollback` have
 * been mounted all along, and the run state already stored the backup path.
 * Nothing in the renderer ever called any of it. So this is not a new
 * capability — it is a surface for one that was already being paid for.
 *
 * ── WHY RESTORE ASKS TWICE ──
 *
 * Rollback OVERWRITES the files it restores, and it cannot be undone from here.
 * A single click on a row in a scrolling log is too easy to hit by accident, so
 * the button turns into a question naming the number of files first. That is
 * also why the count is shown at all: "restore" with no idea of the blast
 * radius is not a decision, it is a guess.
 *
 * Unlike the green marks in the editor, this button does NOT lie: the rollback
 * behind it genuinely puts the old contents back — verified against a real
 * snapshot store, including the case where two checkpoints hold the same file.
 */
function CheckpointRow({ e }: any) {
  const [tahap, setTahap] = React.useState("diam"); // diam | tanya | jalan | selesai
  const [pesan, setPesan] = React.useState("");
  const jml = Number.isFinite(Number(e.files)) ? Number(e.files) : null;
  const jam = new Date(Number(e.ts) || Date.now()).toLocaleTimeString();

  const pulihkan = async () => {
    setTahap("jalan");
    try {
      const r = await wwApi("/api/rollback", {
        method: "POST",
        body: { id: e.id },
      });
      if (r && r.ok) {
        setPesan("restored " + ((r.restored || []).length || 0) + " file(s)");
        // The editor is holding the OLD text now, and a manual save would put
        // it straight back. The same event the agent's own writes fire brings
        // every open buffer up to date.
        try {
          window.dispatchEvent(
            new CustomEvent("wolfspace_agent_act", {
              detail: {
                kind: "restore",
                ok: true,
                path: (r.restored || [])[0],
              },
            }),
          );
        } catch (_) {}
      } else setPesan((r && r.error) || "rollback failed");
    } catch (err: any) {
      setPesan(String((err && err.message) || err));
    }
    setTahap("selesai");
  };

  return (
    <div className="cp-baris">
      <span className="cp-ikon" aria-hidden="true">
        <Icon.reset width="12" height="12" />
      </span>
      <span className="cp-judul">
        Checkpoint
        {e.label ? " · " + e.label : ""}
      </span>
      <span className="cp-detail">
        {jam}
        {jml === null ? "" : " · " + jml + " file" + (jml === 1 ? "" : "s")}
      </span>
      <span className="cp-aksi">
        {tahap === "diam" && (
          <button
            type="button"
            className="cp-btn"
            onClick={() => setTahap("tanya")}
            title="Put the files back as they were before this edit"
          >
            Restore
          </button>
        )}
        {tahap === "tanya" && (
          <>
            <span className="cp-tanya">
              Overwrite {jml === null ? "these" : jml} file
              {jml === 1 ? "" : "s"}?
            </span>
            <button type="button" className="cp-btn cp-ya" onClick={pulihkan}>
              Yes
            </button>
            <button
              type="button"
              className="cp-btn"
              onClick={() => setTahap("diam")}
            >
              No
            </button>
          </>
        )}
        {tahap === "jalan" && <span className="cp-tanya">restoring…</span>}
        {tahap === "selesai" && <span className="cp-hasil">{pesan}</span>}
      </span>
    </div>
  );
}

function AgentSteps({ run }: any) {
  const [expanded, setExpanded] = React.useState({});
  const allActs = (run.events || []).filter(
    (e: any) =>
      e.type === "act" ||
      e.type === "err" ||
      e.type === "thought" ||
      e.type === "checkpoint",
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

  // NO SEPARATE FETCH. The checkpoint event carries its own id, label and file
  // count, straight from the createSnapshot that produced it — so there is
  // nothing to look up, and no way for a lookup to miss. The first version
  // asked GET /api/snapshots and matched by id, which is one more thing that
  // can silently fail to match.

  // EVERY hook must be called UNCONDITIONALLY before any return. The useState
  // and useEffect below used to sit AFTER the early return for
  // "run.done && no steps" -> the hook count changed between renders -> React
  // error #300 ("Rendered fewer hooks than expected") and a crash through
  // ErrorBoundary. Keep them above.
  // WHERE THE COUNTER'S DIGITS LIVE, owned here rather than inside the badge.
  //
  // The badge is rendered in two places -- the status row while working, the
  // answer bubble once done -- and the first unmounts exactly when the second
  // mounts. With the value held inside the badge, that handover reset it to
  // zero and the whole climb replayed AT THE END, which read as "it only starts
  // counting once the agent has finished". Sharing one ref makes the second
  // instance pick up the digits exactly where the first left them.
  const tampilTokenRef = React.useRef(0);
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

  // ── IT TIDIES ITSELF AWAY WHEN THE RUN ENDS ──
  //
  // Open while it is working, because that is when there is something to watch;
  // one summary line afterwards, because a finished run is a result rather than
  // a process. Adapted from collapseOnComplete in agents-kit's Agent activity.
  //
  // ON THE TRANSITION ONLY, not on every render where the run is idle. Doing it
  // whenever `busy` is false would slam the panel shut every time the user
  // opened it to look at a finished run.
  const sibukSebelumnya = React.useRef(run.busy);
  React.useEffect(() => {
    if (sibukSebelumnya.current && !run.busy)
      setExpanded((p: any) => ({ ...p, top: false }));
    sibukSebelumnya.current = run.busy;
  }, [run.busy]);

  // ── THE NEWEST ROW STAYS IN VIEW WHILE IT STREAMS ──
  //
  // A long run pushed rows in below the fold and the view never moved, so the
  // part worth watching was the part off screen.
  //
  // ONLY IF THE READER IS ALREADY AT THE BOTTOM. Scrolling someone back down
  // while they are reading an earlier step is the same discourtesy as clearing
  // a highlight they were still looking at — so a reader who has scrolled up
  // keeps their place, and the stream simply carries on below them.
  const alirRef = React.useRef<any>(null);
  React.useEffect(() => {
    if (!run.busy) return;
    const el = alirRef.current;
    if (!el) return;
    const jarak = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (jarak < 48) el.scrollTop = el.scrollHeight;
  }, [allActs.length, run.busy]);

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

  // ── HOW LONG IT REALLY TOOK ──
  //
  // `elapsed` above is a local ticker: it only counts while THIS component is
  // mounted and the run is busy, starting from zero. A run reopened from
  // history therefore had zero, and the header printed a hardcoded "1m" — the
  // same made-up minute on every past run, presented as a measurement.
  //
  // The run now carries mulaiMs and selesaiMs, so the number is derived from
  // when it actually happened. The ticker stays as the live readout for a run
  // already in flight when this mounted, which has no start time of its own.
  const durasiDetik = (() => {
    const mulai = Number(run.mulaiMs);
    if (!Number.isFinite(mulai) || mulai <= 0) return null;
    const selesai = Number(run.selesaiMs);
    const akhir =
      Number.isFinite(selesai) && selesai > 0 ? selesai : Date.now();
    return Math.max(0, Math.round((akhir - mulai) / 1000));
  })();

  /**
   * What the header says when the run is over.
   *
   * A COUNT, not a guess. The old header always read "Worked for <time>", and
   * when the time was unknown it invented one. What this component always knows
   * is what happened — how many tools ran, how many thoughts there were — so
   * that is what it reports, with the duration added only when it is real.
   */
  const ringkasKerja = (() => {
    const alat = acts.filter((e: any) => e.type === "act").length;
    const pikir = thoughts.length;
    const bagian: string[] = [];
    if (alat) bagian.push(alat + (alat === 1 ? " tool" : " tools"));
    if (pikir) bagian.push(pikir + (pikir === 1 ? " thought" : " thoughts"));
    const inti = bagian.length ? bagian.join(", ") : "no operations";
    // Returned as TWO parts so the duration can be styled apart from the count.
    // As one string the time carried the same weight as the summary and drew
    // the eye first, when it is the least important thing on the row.
    return {
      inti,
      waktu: durasiDetik === null ? null : formatTime(durasiDetik),
    };
  })();

  return (
    <div className="aal-container">
      <button
        type="button"
        className="aal-row"
        aria-expanded={isTopOpen}
        onClick={() => setExpanded((p: any) => ({ ...p, top: !isTopOpen }))}
      >
        <span className="aal-code-highlight">
          {run.busy ? "Working" : ringkasKerja.inti}
          {(() => {
            // The duration, dimmed. Same value as before; only its weight moved.
            const w = run.busy
              ? durasiDetik !== null
                ? formatTime(durasiDetik)
                : elapsed > 0
                  ? formatTime(elapsed)
                  : null
              : ringkasKerja.waktu;
            return w ? <span className="aal-waktu"> · {w}</span> : null;
          })()}
          {run.busy ? "…" : ""}
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
      </button>

      <div
        ref={alirRef}
        className={
          "aal-indent" +
          (isTopOpen ? "" : " aal-hidden") +
          (run.busy ? " aal-mengalir" : "")
        }
      >
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
            if (item.type === "single" && item.event.type === "checkpoint")
              return <CheckpointRow key={"cp" + idx} e={item.event} />;
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
            {/* The counter belongs HERE while work is happening, not only in
                the finished answer. It used to live inside the `run.done`
                block, so it appeared already at its final value and never
                counted anything -- the one moment it is worth watching was
                the one moment it was absent. */}
            <LencanaToken pakai={run.pakai} tampilRef={tampilTokenRef} />
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
            {/* SIDE BY SIDE, which is what "sejajar" asked for.
                Two earlier attempts put the badge on a line of its own: a row
                wrapper above the text, then a right float that did not hold in
                this layout at all. Making the bubble itself a flex row leaves
                nothing to interpret -- the text takes the space, the badge sits
                at the end of the same line, and neither can push the other
                down. The text is wrapped so it keeps normal block flow inside
                (paragraphs, code blocks) rather than becoming flex items. */}
            <div className="av2-isi">
              <Blocks text={summary} />
            </div>
            <LencanaToken pakai={run.pakai} tampilRef={tampilTokenRef} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * What the run cost, in the empty corner of the answer bubble.
 *
 * WHAT THE NUMBER IS. Real token counts reported by the model's own API,
 * summed across every step of the run — not an estimate, and not a character
 * count divided by four. When a provider does not report usage the badge does
 * not appear at all; an invented number on a cost display is worse than no
 * display, because it is believed.
 *
 * WHAT IT IS MEASURED AGAINST. `anggaran` is the effort mode's Context Token
 * Budget, which self_agent already declares and already states in the system
 * prompt. A model's true context window is deliberately NOT used: this repo has
 * no honest table of one, and a denominator that was guessed would make the
 * whole badge a guess.
 *
 * WHY IT COUNTS UP. The run emits usage after every step, so the figure climbs
 * while work is still happening — which is when it is worth watching. The
 * animation eases toward each new total rather than snapping, and is skipped
 * entirely under prefers-reduced-motion.
 */
function LencanaToken({ pakai, tampilRef }: any) {
  const total = pakai ? (pakai.masuk || 0) + (pakai.keluar || 0) : 0;
  // STARTS AT ZERO, ALWAYS -- and that is the whole fix.
  //
  // This used to be useState(total), so the very first render already held the
  // final figure and the effect below saw start and target already equal
  // without animating anything. On a single-step run, which is the only
  // appearance most answers ever get, the counter therefore never counted: it
  // popped into existence at 9,468 fully formed.
  const [tampil, setTampil] = React.useState(tampilRef ? tampilRef.current : 0);
  // What is ON SCREEN right now. A new total can land while a roll is still
  // running, and the next one has to continue from where the digits actually
  // are -- not from where the previous roll started. The ref comes from the
  // parent so the value also survives the handover between the two placements.
  const lokalRef = React.useRef(0);
  const jejakRef = tampilRef || lokalRef;

  React.useEffect(() => {
    const dari = jejakRef.current;
    if (dari === total) return;
    let kurangGerak = false;
    try {
      kurangGerak = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
    } catch (_) {}
    if (kurangGerak) {
      jejakRef.current = total;
      setTampil(total);
      return;
    }
    // SCALED TO THE DISTANCE. A first climb of several thousand is worth
    // watching digit by digit; a 12-token top-up mid-stream is not. Clamped at
    // both ends so it neither crawls nor flashes past unread.
    const jarak = Math.abs(total - dari);
    const DURASI = Math.min(1100, Math.max(280, jarak * 0.16));
    const t0 = performance.now();
    let raf = 0;
    const langkah = (t: number) => {
      const p = Math.min(1, (t - t0) / DURASI);
      // Ease-out cubic: quick off the mark, settling gently. A linear ramp
      // reads like a progress bar, which this is not.
      const e = 1 - Math.pow(1 - p, 3);
      const n = Math.round(dari + (total - dari) * e);
      jejakRef.current = n;
      setTampil(n);
      if (p < 1) raf = requestAnimationFrame(langkah);
    };
    raf = requestAnimationFrame(langkah);
    return () => cancelAnimationFrame(raf);
  }, [total]);

  // AFTER the hooks, never before: an early return above them changes the hook
  // count between renders and React throws.
  if (!pakai || !total) return null;

  // A tilde, and nothing louder. While a call streams there is no exact count
  // to be had, so the figure is derived from bytes sent and characters
  // received; it is replaced by the provider's own number the moment the call
  // settles. Marking it costs one character and stops a running estimate from
  // being quoted back later as a measurement.
  const awalan = pakai.taksiran ? "~" : "";

  const anggaran = Number(pakai.anggaran) || 0;

  // Screen text is English in this repo, tooltips included -- see
  // tests/teks-ui-inggris. Only what the USER reads is covered by that
  // rule; the Indonesian identifiers around it are code, not screen text.
  const rinci = [
    pakai.taksiran
      ? "Estimate — exact figure follows when the call settles"
      : "",
    "Model: " + (pakai.model || "?") + " (" + (pakai.provider || "?") + ")",
    "In: " + (pakai.masuk || 0).toLocaleString(),
    "Out: " + (pakai.keluar || 0).toLocaleString(),
    pakai.cacheBaca ? "Cache read: " + pakai.cacheBaca.toLocaleString() : "",
    pakai.cacheTulis
      ? "Cache written: " + pakai.cacheTulis.toLocaleString()
      : "",
    "Model calls: " + (pakai.panggilan || 0),
    anggaran ? "Context budget: " + anggaran.toLocaleString() : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <span
      className="lencana-token"
      title={rinci}
      aria-label={"Tokens used: " + total.toLocaleString()}
    >
      {awalan + tampil.toLocaleString()}
      {/* The unit sits one step back so the figure stays the thing you read
          first; it is what changes, and the word never does. */}
      <span className="lencana-token-unit"> tokens</span>
    </span>
  );
}

/**
 * ── A FORM THE AGENT ASKED FOR ──
 *
 * The agent chooses WHAT to ask; this decides how it is drawn. That split is
 * the whole design, and it is deliberately narrower than what "generative UI"
 * usually means: nothing about the layout comes from the model, so the surface
 * stays the app's own and stays checkable by the same source-reading tests the
 * rest of this repo relies on.
 *
 * Four field types, and anything the model invents beyond them arrives here as
 * a text box — normalised in agent/tools/index.ts before it is ever emitted.
 */
function AgentForm({ fields, nilai, setNilai }: any) {
  return (
    <div className="hitl-form">
      {fields.map((f: any) => {
        const id = "hf-" + f.name;
        const v = nilai[f.name];
        const set = (x: any) => setNilai((p: any) => ({ ...p, [f.name]: x }));
        return (
          <label className="hitl-field" key={f.name} htmlFor={id}>
            <span className="hitl-field-label">
              {f.label}
              {f.required ? <span className="hitl-wajib"> *</span> : null}
            </span>
            {f.type === "select" ? (
              <select
                id={id}
                value={v === undefined ? "" : v}
                onChange={(e: any) => set(e.target.value)}
              >
                <option value="">—</option>
                {(f.options || []).map((o: any) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : f.type === "boolean" ? (
              <input
                id={id}
                type="checkbox"
                checked={!!v}
                onChange={(e: any) => set(e.target.checked)}
              />
            ) : (
              <input
                id={id}
                type={f.type === "number" ? "number" : "text"}
                value={v === undefined ? "" : v}
                placeholder={f.placeholder || ""}
                onChange={(e: any) => set(e.target.value)}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

/**
 * The answers, as the agent reads them.
 *
 * LABELLED LINES, not JSON. The text goes into the conversation, where a person
 * reads it too — and `{"db":"postgres"}` in a transcript says less to both of
 * them than `Database: postgres`. Unanswered optional fields are left out
 * rather than sent as empty strings, which a model reads as "the user said
 * nothing here" rather than "the user answered nothing".
 */
function jawabanForm(fields: any, nilai: any) {
  const baris: string[] = [];
  for (const f of fields || []) {
    const v = nilai[f.name];
    if (f.type === "boolean") {
      baris.push(f.label + ": " + (v ? "yes" : "no"));
      continue;
    }
    const teks = v === undefined || v === null ? "" : String(v).trim();
    if (teks) baris.push(f.label + ": " + teks);
  }
  return baris.join("\n");
}

/** Which required fields are still empty. Empty array means it can be sent. */
function formKurang(fields: any, nilai: any) {
  return (fields || [])
    .filter((f: any) => {
      if (!f.required) return false;
      if (f.type === "boolean") return false; // unchecked IS an answer
      const v = nilai[f.name];
      return v === undefined || v === null || !String(v).trim();
    })
    .map((f: any) => f.label);
}

function HitlModal({ request, onResolve }: any) {
  const [selected, setSelected] = React.useState(0);
  const [nilai, setNilai] = React.useState<any>({});
  // EVERY hook before any early return — this component has crashed on that
  // before (React error #300, "Rendered fewer hooks than expected").
  const fields = (request && request.fields) || [];
  const kurang = formKurang(fields, nilai);
  if (!request) return null;

  if (fields.length)
    return (
      <div className="hitl-overlay">
        <div className="hitl-modal">
          <div className="hitl-title">{request.title || "Question"}</div>
          {request.code && <div className="hitl-code-box">{request.code}</div>}
          <AgentForm fields={fields} nilai={nilai} setNilai={setNilai} />
          <div className="hitl-footer">
            <button className="hitl-btn-skip" onClick={() => onResolve(null)}>
              Skip
            </button>
            <button
              className="hitl-btn-submit"
              disabled={kurang.length > 0}
              title={
                kurang.length ? "Still needed: " + kurang.join(", ") : "Send"
              }
              onClick={() => onResolve(jawabanForm(fields, nilai))}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );

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
