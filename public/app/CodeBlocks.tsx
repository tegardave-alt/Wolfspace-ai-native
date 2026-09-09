// CodeBlocks.tsx — everything a reply can contain that is not prose: code
// blocks, the Monaco editor, and diagrams.
//
// ROLE IN THE SYSTEM. Blocks() in Components.tsx routes here. Three renderers
// live in this file and they are chosen, not interchangeable:
//
//   CodeBlock      highlighted source, with copy and run
//   DiagramBlock   a mermaid diagram — the wrapper that owns the full-window
//                  view; the chat must render THIS, not MermaidBlock, or every
//                  interactive part of a diagram becomes unreachable
//   CytoscapeBlock a mermaid flowchart converted to a live graph
//
// The syntax highlighter below is hand-written for the same reason everything
// here is: the renderer has no module graph, so highlight.js and its kin cannot
// be imported (see public/app.tsx).

/* ----------------------------- Syntax highlight ----------------------------- */
const KW: Record<string, string[]> = {
  python:
    "def class return if elif else for while in and or not import from as with try except finally lambda None True False print pass break continue is global nonlocal yield assert raise del self".split(
      " ",
    ),
  javascript:
    "function return if else for while const let var class new typeof instanceof import from export default await async try catch finally throw switch case break continue this null undefined true false of in delete void yield".split(
      " ",
    ),
};
KW.typescript = KW.javascript!;
KW.go =
  "func return if else for range var const type struct interface package import map chan go defer nil true false switch case break continue".split(
    " ",
  );
function highlight(code: string, lang?: string) {
  const kws = KW[lang || ""] || KW.javascript!;
  const re =
    /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+\.?\d*\b)|([A-Za-z_$][\w$]*)(\s*\()?/g;
  let out = "",
    last = 0,
    m;
  while ((m = re.exec(code))) {
    out += escHtml(code.slice(last, m.index));
    if (m[1]) out += '<span class="t-com">' + escHtml(m[1]) + "</span>";
    else if (m[2]) out += '<span class="t-str">' + escHtml(m[2]) + "</span>";
    else if (m[3]) out += '<span class="t-num">' + escHtml(m[3]) + "</span>";
    else if (m[4] !== undefined) {
      const w = m[4],
        paren = m[5] || "";
      if (kws.indexOf(w) >= 0)
        out += '<span class="t-kw">' + escHtml(w) + "</span>";
      else if (paren) out += '<span class="t-fn">' + escHtml(w) + "</span>";
      else out += escHtml(w);
      out += escHtml(paren);
    }
    last = re.lastIndex;
  }
  out += escHtml(code.slice(last));
  return out;
}

/* ----------------------------- Code block ----------------------------- */
const LANGS = [
  "python",
  "javascript",
  "typescript",
  "bash",
  "go",
  "c",
  "cpp",
  "java",
  "php",
  "rust",
  "kotlin",
  "html",
  "css",
  "json",
];
const MLANG: Record<string, string> = {
  js: "javascript",
  javascript: "javascript",
  node: "javascript",
  ts: "typescript",
  typescript: "typescript",
  py: "python",
  python: "python",
  go: "go",
  golang: "go",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  java: "java",
  php: "php",
  rust: "rust",
  kotlin: "kotlin",
  html: "html",
  css: "css",
  json: "json",
  bash: "shell",
  sh: "shell",
  shell: "shell",
  sql: "sql",
  yaml: "yaml",
  markdown: "markdown",
};
function mLang(l?: string) {
  return MLANG[(l || "").toLowerCase()] || "plaintext";
}

// Per-language monogram badge (color + short symbol) — clean, no heavy logo assets.
const LANG_META: Record<string, any> = {
  python: { l: "Python", s: "Py", c: "#3776AB" },
  javascript: { l: "JavaScript", s: "JS", c: "#F7DF1E", d: 1 },
  typescript: { l: "TypeScript", s: "TS", c: "#3178C6" },
  bash: { l: "Bash", s: ">_", c: "#4EAA25" },
  go: { l: "Go", s: "Go", c: "#00ADD8" },
  c: { l: "C", s: "C", c: "#5C6BC0" },
  cpp: { l: "C++", s: "C+", c: "#00599C" },
  java: { l: "Java", s: "Jv", c: "#E76F00" },
  php: { l: "PHP", s: "php", c: "#777BB4" },
  rust: { l: "Rust", s: "Rs", c: "#D9844B" },
  kotlin: { l: "Kotlin", s: "Kt", c: "#7F52FF" },
  html: { l: "HTML", s: "<>", c: "#E34F26" },
  css: { l: "CSS", s: "#", c: "#1572B6" },
  json: { l: "JSON", s: "{}", c: "#A0A6B0" },
};
const LANG_LOGOS = new Set([
  "python",
  "javascript",
  "typescript",
  "bash",
  "go",
  "c",
  "cpp",
  "java",
  "php",
  "rust",
  "kotlin",
  "html",
  "css",
  "json",
]);
function LangIcon({ lang }: any) {
  const m = LANG_META[lang] || {
    l: lang,
    s: (lang || "?").slice(0, 2),
    c: "#7c8aa0",
  };
  if (LANG_LOGOS.has(lang))
    return (
      <img
        className="lang-logo"
        src={"/vendor/lang/" + lang + ".svg"}
        alt={m.l}
        loading="lazy"
        onError={(e: any) => {
          const sp = document.createElement("span");
          sp.className = "lang-badge";
          sp.style.background = m.c;
          sp.style.color = m.d ? "#111" : "#fff";
          sp.textContent = m.s;
          e.target.replaceWith(sp);
        }}
      />
    );
  return (
    <span
      className="lang-badge"
      style={{ background: m.c, color: m.d ? "#111" : "#fff" }}
    >
      {m.s}
    </span>
  );
}

function CodeBlock({ lang, code }: any) {
  const [copied, setCopied] = useState(false);
  const [language, setLanguage] = useState((lang || "python").toLowerCase());
  const [runState, setRunState] = useState("idle");
  const [out, setOut] = useState<any>(null);
  const [edReady, setEdReady] = useState(false); // Monaco mounted? else show <pre> fallback
  const hostRef = useRef<any>(null);
  const edRef = useRef<any>(null);
  const focusedRef = useRef(false);
  const wrapRef = useRef<any>(null);
  // The full reasoning lives in useDekatLayar (public/app/AgentSteps.tsx).
  const dekat = useDekatLayar(wrapRef);
  // Unsaved user edits. The editor here is WRITABLE, so tearing it down when
  // the block scrolls off screen would discard someone's typing without a
  // trace. The text is copied out before teardown and restored on remount —
  // and shown in the <pre> too, so what stays visible is the user's version.
  const draftRef = useRef<any>(null);
  const teks = draftRef.current != null ? draftRef.current : code;
  const getCode = () => (edRef.current ? edRef.current.getValue() : teks);

  useEffect(() => {
    let disposed = false;
    if (!dekat) return; // far off screen -> a <pre> is enough
    if (!window.monacoReady) return;
    window.monacoReady.then((monaco: any) => {
      if (disposed || !hostRef.current) return;
      // One-time fix: kill Monaco's blue outline (always-on via .monaco-editor rule in editor.main.css)
      if (!document.getElementById("monaco-outline-fix")) {
        const s = document.createElement("style");
        s.id = "monaco-outline-fix";
        s.textContent =
          ".monaco-editor { outline: none !important; outline-offset: 0 !important; }";
        document.head.appendChild(s);
      }
      const ed = monaco.editor.create(hostRef.current, {
        // Shared look and behaviour: opsiEditor() in Config.tsx.
        ...opsiEditor(),
        value: teks, // the user's text when there is one, otherwise the original
        language: mLang(language),
        lineNumbers: "on",
        tabSize: 4,
        wordWrap: "off",
        domReadOnly: false,
        readOnly: false,
        autoDetectHighContrast: false,
        // A code block grows to fit its content, so a bar pinned to its top
        // would cover the first line of a five-line snippet.
        stickyScroll: { enabled: false },
      });
      edRef.current = ed;
      setEdReady(true);
      const fit = () => {
        if (!hostRef.current) return;
        hostRef.current.style.height =
          Math.min(Math.max(ed.getContentHeight(), 38), 540) + "px";
        ed.layout();
      };
      ed.onDidContentSizeChange(fit);
      fit();
      ed.onDidFocusEditorText(() => {
        focusedRef.current = true;
      });
      ed.onDidBlurEditorText(() => {
        focusedRef.current = false;
      });
    });
    return () => {
      disposed = true;
      if (edRef.current) {
        // Copy the text out FIRST, before anything is disposed.
        try {
          const isi = edRef.current.getValue();
          draftRef.current = isi === code ? null : isi;
        } catch (_) {}
        const model = edRef.current.getModel();
        if (model) model.dispose();
        edRef.current.dispose();
        edRef.current = null;
        setEdReady(false);
      }
    };
  }, [dekat]);
  // follow streaming text until the user starts editing
  useEffect(() => {
    const ed = edRef.current;
    // A block being edited must not be overwritten by the stream, and neither
    // must one whose text was preserved because it scrolled off screen.
    if (draftRef.current != null) return;
    // Append at the end rather than rewriting the whole model — see
    // terapkanTeksStream (Viewport.tsx) for the reasoning and the sizes.
    // The guard above ensures this only runs while the user is NOT editing,
    // so their cursor and undo stack are never disturbed.
    if (ed && !focusedRef.current) terapkanTeksStream(ed, code);
  }, [code]);
  useEffect(() => {
    const ed = edRef.current;
    if (ed && window.monaco)
      window.monaco.editor.setModelLanguage(ed.getModel(), mLang(language));
  }, [language]);

  const copyCode = () => {
    navigator.clipboard?.writeText(getCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const run = async () => {
    setRunState("running");
    setOut(null);
    try {
      const r = await fetch("/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: language, code: getCode() }),
      });
      setOut(await r.json());
    } catch (e) {
      setOut({ ok: false, error: "Server unreachable: " + (e as any).message });
    }
    setRunState("done");
  };

  return (
    <div className="code-block" ref={wrapRef}>
      <div className="code-head">
        <span className="code-dots">
          <span style={{ background: "#ff5f57" }} />
          <span style={{ background: "#febc2e" }} />
          <span style={{ background: "#28c840" }} />
        </span>
        <span className="code-lang">{language}</span>
        <span className="lang-spacer" />
      </div>
      <div
        className="monaco-host"
        ref={hostRef}
        style={{ display: edReady ? "block" : "none" }}
      />
      {!edReady && (
        <pre
          className="code-fallback"
          style={{
            margin: 0,
            padding: "10px 14px",
            overflow: "auto",
            color: "#cbd5e1",
            background: "#0d1117",
            font: "13px/1.6 ui-monospace,Consolas,monospace",
            whiteSpace: "pre",
          }}
        >
          {teks}
        </pre>
      )}
      <div className="code-toolbar">
        <button
          className={"ctb-btn" + (copied ? " copied" : "")}
          onClick={copyCode}
        >
          {copied ? <Icon.check /> : <Icon.copy />} {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {runState === "done" && out && (
        <div className={"code-output " + (out.ok ? "ok" : "err")}>
          <div className="output-head">
            <span className="ok-mark">
              {out.ok ? (
                <>
                  <Icon.check /> ran (exit 0)
                </>
              ) : (
                <>
                  <Icon.close /> error
                </>
              )}{" "}
              · {language}
            </span>
          </div>
          <div className="output-body">
            {(out.output || "") + (out.error ? "\n" + out.error : "") ||
              "(no output)"}
          </div>
        </div>
      )}
    </div>
  );
}

function parseMermaidFlowchart(code: string) {
  const lines = String(code || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line && !/^%%/.test(line) && !/^(flowchart|graph)\b/i.test(line),
    );

  const nodes = new Map();
  const edges: any[] = [];

  const getNode = (id: any) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label: id, shape: "rect", order: nodes.size });
    }
    return nodes.get(id);
  };

  const parseNode = (token: any) => {
    const raw = String(token || "").trim();
    if (!raw) return null;
    const m = raw.match(
      /^([A-Za-z0-9_:-]+)\s*(?:\[\[([\s\S]+)\]\]|\[([\s\S]+)\]|\(\(([\s\S]+)\)\)|\(([^()]+)\)|\{([\s\S]+)\})?$/,
    );
    const id = m ? m[1] : raw.replace(/[^A-Za-z0-9_:-]/g, "_");
    const node = getNode(id);
    if (m) {
      const label = m[2] || m[3] || m[4] || m[5] || m[6];
      if (label) node.label = label.trim();
      if (m[2]) node.shape = "subroutine";
      else if (m[4]) node.shape = "circle";
      else if (m[5]) node.shape = "round";
      else if (m[6]) node.shape = "diamond";
      else if (m[3]) node.shape = "rect";
    }
    return node;
  };

  for (const line of lines) {
    const edgeMatch = line.match(
      /^(.*?)\s*(?:--\s*([^>-]+?)\s*-->|-+>|\.->)\s*(.*)$/,
    );
    if (!edgeMatch) {
      const nodeOnly = parseNode(line);
      if (nodeOnly) getNode(nodeOnly.id);
      continue;
    }
    const from = parseNode(edgeMatch[1]);
    const label = (edgeMatch[2] || "").trim();
    const to = parseNode(edgeMatch[3]);
    if (from && to) edges.push({ from: from.id, to: to.id, label });
  }

  if (!nodes.size) return null;

  const incoming = new Map();
  const outgoing = new Map();
  for (const n of nodes.keys()) {
    incoming.set(n, 0);
    outgoing.set(n, []);
  }
  for (const e of edges) {
    incoming.set(e.to, (incoming.get(e.to) || 0) + 1);
    outgoing.get(e.from).push(e.to);
  }

  const level = new Map();
  const queue: any[] = [];
  for (const [id, deg] of incoming.entries()) {
    if (deg === 0) {
      level.set(id, 0);
      queue.push(id);
    }
  }
  if (!queue.length) {
    const first = nodes.keys().next().value;
    level.set(first, 0);
    queue.push(first);
  }

  const processed = new Set();
  while (queue.length) {
    const cur = queue.shift();
    if (processed.has(cur)) continue;
    processed.add(cur);
    const curLevel = level.get(cur) || 0;
    const nextLevel = curLevel + 1;
    for (const nxt of outgoing.get(cur) || []) {
      const oldLevel = level.get(nxt);
      if (oldLevel === undefined || oldLevel < nextLevel) {
        level.set(nxt, nextLevel);
      }
      if (!processed.has(nxt)) {
        queue.push(nxt);
      }
    }
  }

  for (const id of nodes.keys()) {
    if (!level.has(id)) level.set(id, 0);
  }

  const layers: any[] = [];
  for (const [id, lv] of level.entries()) {
    if (!layers[lv]) layers[lv] = [];
    layers[lv].push(id);
  }
  layers.forEach((layer) =>
    layer.sort((a: any, b: any) => nodes.get(a).order - nodes.get(b).order),
  );

  const fontSize = 14;
  const padX = 18;
  const padY = 12;
  const gapX = 42;
  const gapY = 54;
  const layerGap = 86;
  const measure = (label: any) =>
    Math.max(96, Math.min(260, label.length * 8.5 + padX * 2));

  const positioned = new Map();
  let maxWidth = 0;
  let maxHeight = 0;
  for (let ly = 0; ly < layers.length; ly++) {
    const layer = layers[ly] || [];
    let rowWidth = 0;
    const sizes = layer.map((id: any) => ({
      id,
      w: measure(nodes.get(id).label),
      h: 54,
    }));
    rowWidth =
      sizes.reduce((sum: any, item: any) => sum + item.w, 0) +
      Math.max(0, sizes.length - 1) * gapX;
    let x = Math.max(24, Math.max(0, rowWidth) ? 0 : 0);
    const topY = 28 + ly * layerGap;
    const startX = 24;
    let cursorX = startX;
    for (const item of sizes) {
      positioned.set(item.id, {
        x: cursorX,
        y: topY,
        w: item.w,
        h: item.h,
        layer: ly,
      });
      cursorX += item.w + gapX;
      maxWidth = Math.max(maxWidth, cursorX);
      maxHeight = Math.max(maxHeight, topY + item.h);
    }
  }

  return {
    nodes,
    edges,
    positioned,
    width: Math.max(360, maxWidth + 24),
    height: Math.max(120, maxHeight + 28),
    fontSize,
    padX,
    padY,
  };
}

// ── Jembatan mermaid -> Cytoscape ──
// mermaid is used as the INPUT LANGUAGE (models write it easily); it is turned
// into Cytoscape elements so the diagram becomes INTERACTIVE (drag, zoom,
// change layout) rather than a dead image. This reuses parseMermaidFlowchart,
// which already extracts the nodes and edges.
function mermaidToCytoElements(code: string) {
  const raw = String(code || "");
  // Subgraph -> compound node. parseMermaidFlowchart does not understand
  // `subgraph`/`end` and would invent junk nodes from those lines, so they are
  // split out first while recording which node belongs to which group. Grouped
  // nodes get data.parent; the group itself becomes a compound node.
  const subs: Record<string, string> = {}; // subId -> title
  const parentOf: Record<string, string> = {}; // nodeId -> subId (innermost group that first refers to it)
  const stack: any[] = [];
  const clean: any[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^subgraph\b/i.test(line)) {
      const rest = line.replace(/^subgraph\s+/i, "");
      const mB =
        rest.match(/^([A-Za-z0-9_:-]+)\s*\[([^\]]*)\]/) ||
        rest.match(/^([A-Za-z0-9_:-]+)\s*"([^"]*)"/);
      let id, title;
      if (mB) {
        id = mB[1];
        title = mB[2];
      } else if (/^[A-Za-z0-9_:-]+$/.test(rest.trim())) {
        id = rest.trim();
        title = id;
      } else {
        id = "sg" + Object.keys(subs).length;
        title = rest.replace(/["']/g, "").trim();
      }
      subs[id!] = String(title).replace(/^["']|["']$/g, "");
      stack.push(id);
      continue;
    }
    if (/^end$/i.test(line)) {
      stack.pop();
      continue;
    }
    if (stack.length) {
      const cur = stack[stack.length - 1];
      for (const t of line.match(/[A-Za-z0-9_:-]+/g) || [])
        if (!parentOf[t]) parentOf[t] = cur;
    }
    clean.push(rawLine);
  }
  const parsed = parseMermaidFlowchart(clean.join("\n"));
  if (!parsed || !parsed.nodes || !parsed.nodes.size) return null;

  const cleanLabel = (l: any) =>
    String(l || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/^\s*["']|["']\s*$/g, "");
  const usedSubs = new Set();
  for (const id of parsed.nodes.keys())
    if (parentOf[id] && subs[parentOf[id]]) usedSubs.add(parentOf[id]);
  const parents = [...usedSubs].map((id: any) => ({
    data: { id, label: subs[id as string], isParent: 1 },
  }));

  const nodes = [...parsed.nodes.values()].map((n: any) => ({
    data: {
      id: n.id,
      label: cleanLabel(n.label || n.id),
      shape: n.shape || "rect",
      deg: 0,
      parent:
        parentOf[n.id] && usedSubs.has(parentOf[n.id])
          ? parentOf[n.id]
          : undefined,
    },
  }));
  const byId = new Map(nodes.map((n: any) => [n.data.id, n]));
  const edges = (parsed.edges || []).map((e: any, i: number) => {
    if (byId.get(e.from)) byId.get(e.from).data.deg++;
    if (byId.get(e.to)) byId.get(e.to).data.deg++;
    return {
      data: {
        id: "ce" + i,
        source: e.from,
        target: e.to,
        label: e.label || "",
      },
    };
  });
  return [...parents, ...nodes, ...edges];
}

function cyLayoutOpts(name: string) {
  const o: Record<string, any> = {
    name,
    padding: 22,
    animate: true,
    animationDuration: 350,
  };
  if (name === "breadthfirst") {
    o.directed = true;
    o.spacingFactor = 1.1;
  } else if (name === "cose") {
    o.idealEdgeLength = 80;
    o.nodeRepulsion = 8000;
    o.gravity = 0.3;
  } else if (name === "concentric") {
    o.concentric = (n: any) => n.degree();
    o.levelWidth = () => 3;
  }
  return o;
}

const CY_STYLE = [
  {
    selector: "node",
    style: {
      "background-color": "#141d2b",
      "border-color": "#8fb3ff",
      "border-width": 1.5,
      label: "data(label)",
      color: "#dce4f0",
      "font-family": "ui-monospace, monospace",
      "font-size": 11,
      "text-valign": "center",
      "text-halign": "center",
      "text-wrap": "wrap",
      "text-max-width": 150,
      shape: "round-rectangle",
      width: "label",
      height: "label",
      padding: "9px",
    },
  },
  {
    selector: 'node[shape="diamond"]',
    style: { shape: "diamond", width: 76, height: 54 },
  },
  { selector: 'node[shape="circle"]', style: { shape: "ellipse" } },
  { selector: 'node[shape="round"]', style: { shape: "round-rectangle" } },
  { selector: 'node[shape="subroutine"]', style: { shape: "cut-rectangle" } },
  // A compound node is a subgraph group: a transparent box labelled at the top,
  // with its children inside.
  {
    selector: "node[?isParent]",
    style: {
      "background-color": "#8fb3ff",
      "background-opacity": 0.05,
      "border-color": "#3a4a63",
      "border-width": 1,
      shape: "round-rectangle",
      label: "data(label)",
      "text-valign": "top",
      "text-halign": "center",
      "font-size": 10,
      color: "#8fb3ff",
      padding: "16px",
      "text-margin-y": 3,
      width: "label",
      height: "label",
    },
  },
  {
    selector: "node[deg >= 4]",
    style: {
      "border-width": 2.5,
      "border-color": "#a9c6ff",
      "background-color": "#182741",
    },
  },
  {
    selector: "edge",
    style: {
      width: 1.4,
      "line-color": "#3f5578",
      "target-arrow-color": "#5f7bb0",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      "arrow-scale": 0.9,
      opacity: 0.9,
      label: "data(label)",
      "font-family": "ui-monospace, monospace",
      "font-size": 9,
      color: "#9fb7d9",
      "text-background-color": "#0d1117",
      "text-background-opacity": 0.85,
      "text-background-padding": 2,
    },
  },
  {
    selector: "node.hl",
    style: { "border-color": "#ffd479", "border-width": 2.5 },
  },
  {
    selector: "edge.hl",
    style: {
      "line-color": "#8fb3ff",
      "target-arrow-color": "#8fb3ff",
      opacity: 1,
      width: 2,
    },
  },
];

// The INTERACTIVE renderer: mermaid text -> Cytoscape canvas. Reached through
// DiagramBlock only when the user presses "interactive" (the default stays
// full-fidelity mermaid.js).
function CytoscapeBlock({ code, onStatic }: any) {
  const ref = useRef<any>(null);
  const cyRef = useRef<any>(null);
  const [failed, setFailed] = useState(false);
  const [layout, setLayout] = useState("breadthfirst");
  const elements = useMemo(() => {
    try {
      return mermaidToCytoElements(code);
    } catch (e) {
      return null;
    }
  }, [code]);

  useEffect(() => {
    if (
      !elements ||
      typeof window === "undefined" ||
      typeof window.cytoscape !== "function" ||
      !ref.current
    ) {
      setFailed(true);
      return;
    }
    let cy: any;
    try {
      cy = window.cytoscape({
        container: ref.current,
        elements,
        style: CY_STYLE,
        layout: cyLayoutOpts("breadthfirst"),
        wheelSensitivity: 0.2,
        minZoom: 0.2,
        maxZoom: 3,
      });
    } catch (e) {
      setFailed(true);
      return;
    }
    cyRef.current = cy;
    cy.on("mouseover", "node", (e: any) => {
      const n = e.target;
      n.addClass("hl");
      n.connectedEdges().addClass("hl").connectedNodes().addClass("hl");
    });
    cy.on("mouseout", "node", () => cy.elements().removeClass("hl"));
    return () => {
      try {
        cy.destroy();
      } catch (_) {}
      cyRef.current = null;
    };
  }, [elements]);

  useEffect(() => {
    if (cyRef.current) cyRef.current.layout(cyLayoutOpts(layout)).run();
  }, [layout]);

  if (failed || !elements) return <MermaidBlock code={code} />;
  const btn = (l: any) => ({
    fontFamily: "ui-monospace,monospace",
    fontSize: 11,
    color: layout === l ? "#dce4f0" : "#8b98ac",
    background: layout === l ? "rgba(143,179,255,0.16)" : "transparent",
    border: "1px solid " + (layout === l ? "#8fb3ff" : "#2a3542"),
    borderRadius: 6,
    padding: "3px 9px",
    cursor: "pointer",
  });
  return (
    <div className="mermaid-block">
      <div className="code-head">
        <span className="code-dots">
          <span style={{ background: "#ff5f57" }} />
          <span style={{ background: "#febc2e" }} />
          <span style={{ background: "#28c840" }} />
        </span>
        <span className="code-lang">graph · interaktif</span>
        <span className="lang-spacer" />
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          {["breadthfirst", "cose", "concentric"].map((l: any) => (
            <button key={l} style={btn(l)} onClick={() => setLayout(l)}>
              {l}
            </button>
          ))}
          <button
            style={btn("_fit")}
            onClick={() =>
              cyRef.current &&
              cyRef.current.animate({ fit: { padding: 22 } }, { duration: 250 })
            }
          >
            fit
          </button>
          {onStatic ? (
            <button
              style={btn("_st")}
              onClick={onStatic}
              title="Back to the static diagram (full fidelity)"
            >
              ← statis
            </button>
          ) : null}
        </div>
      </div>
      <div
        ref={ref}
        style={{
          height: 360,
          width: "100%",
          background: "radial-gradient(circle at 50% 40%, #0f1620, #0d1117)",
          borderRadius: "0 0 8px 8px",
        }}
      />
    </div>
  );
}

// The wrapper chat uses for every ```mermaid block. The DEFAULT is real
// mermaid.js (full fidelity: every diagram type, shape, subgraph and colour).
// When the diagram is a flowchart that can be converted to a graph, an
// "interactive" button appears and switches to Cytoscape. So mermaid's
// richness is never sacrificed — interactivity is opt-in.
// ── SEEING THE WHOLE DIAGRAM ─────────────────────────────────────────────
//
// A rendered diagram sat in a box with `overflow-x: auto`, so anything wider
// than the chat column could only be read by scrolling it sideways a piece at
// a time — and a flowchart is exactly the kind of thing that is useless in
// pieces. The way out existed but was a small button in the header labelled
// "⇱ interaktif", which nobody looks for while trying to read a picture.
//
// Now the picture itself is the control: click it and it opens filling the
// window, scaled to fit, and drags with the pointer.

/** Scale that fits `isi` inside `wadah`, never enlarging past 1:1. */
function skalaMuat(isi: any, wadah: any, sisa = 48) {
  const iw = Number(isi && isi.w);
  const ih = Number(isi && isi.h);
  const ww = Number(wadah && wadah.w) - sisa;
  const wh = Number(wadah && wadah.h) - sisa;
  if (!(iw > 0 && ih > 0 && ww > 0 && wh > 0)) return 1;
  // Never blown up: a small diagram enlarged to fill the window is blurry in
  // the raster case and merely odd in the vector one.
  return Math.min(ww / iw, wh / ih, 1);
}

/** Zoom is bounded. Unbounded wheel zoom loses the diagram off-screen. */
function jepitSkala(s: any) {
  // `typeof`, not just isFinite. Number(null) is 0 — finite, and therefore
  // clamped to the 0.1 floor, which shrinks the diagram to nothing instead of
  // falling back to 1:1. A missing scale is a broken value, not a scale of
  // zero. Found by the test rather than by reading.
  if (typeof s !== "number" || !Number.isFinite(s)) return 1;
  return Math.min(Math.max(s, 0.1), 8);
}

/**
 * The full-window view.
 *
 * PORTALLED, for the reason the GitHub panel is: a `position: fixed` overlay
 * rendered from inside the chat column is measured and clipped against any
 * ancestor carrying a transform, filter or backdrop-filter — which in a split
 * view means half the picture disappears. document.body has no such ancestor.
 *
 * The SVG is CLONED rather than re-rendered. mermaid has already drawn it into
 * the page; drawing it a second time would cost the same work again and could
 * differ. Injecting it here is not a new exposure — it is the very markup
 * already living in the document a few nodes away.
 */
// ── SATU KANVAS, DUA SASARAN SERET ─────────────────────────────────────────
//
// Dragging the background moves the whole picture; dragging a box moves that
// box. The picture stays the one mermaid drew — its routing and its spacing
// are the tidy part and are not thrown away to make the boxes movable.
//
// These four functions are the whole mechanism, and every one of them was
// written against a REAL mermaid render (headless Chromium, the vendored
// mermaid.min.js) rather than against a belief about its markup:
//
//   node   <g class="node default" id="<svg>-flowchart-<id>-<n>"
//             transform="translate(x, y)">
//   edge   <path class="... flowchart-link" id="<svg>-L_<src>_<dst>_<n>"
//             d="M… L… C…">        ← M, L and C only; no H, V, A or Q
//   label  <g class="edgeLabels"> one <g> per edge, in the same order
//
// Ids are NOT parsed by splitting on "_": a node may legally be called
// my_node, and "L_my_node_other_node_0" cannot be split by counting
// underscores. The split is resolved against the ids the diagram actually
// contains instead.

/** {x,y} from a transform="translate(x, y)", or {x:0,y:0}. */
function uraiTranslate(t: any) {
  const m = String(t || "").match(
    /translate\(\s*(-?[\d.]+)\s*[, ]\s*(-?[\d.]+)/,
  );
  return m ? { x: parseFloat(m[1]!), y: parseFloat(m[2]!) } : { x: 0, y: 0 };
}

/**
 * "u0-flowchart-my_node-0" -> "my_node".
 *
 * Requiring "-flowchart-" is what CONFINES box dragging to flowcharts, and
 * that is deliberate. Measured: a class diagram names its boxes
 * "z1-classId-Animal-0" and a state diagram "z2-state-Diam-1", so both answer
 * null here and fall through to the pan. They have to: a class diagram's
 * connectors are "id_Animal_Dog_1" and a state diagram's are plain "edge0",
 * which carries no endpoints at all — a box could be moved but its arrows
 * could not be found to follow it, leaving arrows hanging in mid-air.
 */
function idSimpulDari(gid: any) {
  const m = String(gid || "").match(/-flowchart-(.+)-\d+$/);
  return m ? m[1] : null;
}

/**
 * Which END of an edge a node sits on: "awal", "akhir", or null.
 *
 * The 'ids' list is every node id in the diagram, and it is what makes this
 * unambiguous — the core of "L_a_b_0" is split at the one position where BOTH
 * halves are real nodes. Two valid splits (possible only when the diagram
 * itself is ambiguous) answer null rather than guessing wrong.
 */
function ujungTepi(eid: any, nodeId: any, ids: any) {
  const m = String(eid || "").match(/-L_(.+)_\d+$/);
  if (!m || !nodeId) return null;
  const inti = m[1]!;
  const punya = new Set(ids || []);
  let ketemu: any = null;
  for (let i = 1; i < inti.length; i++) {
    if (inti[i] !== "_") continue;
    const a = inti.slice(0, i);
    const b = inti.slice(i + 1);
    if (!punya.has(a) || !punya.has(b)) continue;
    if (ketemu) return null;
    ketemu = { a, b };
  }
  if (!ketemu) return null;
  if (ketemu.a === nodeId) return "awal";
  if (ketemu.b === nodeId) return "akhir";
  return null;
}

/**
 * The same path, bent so one end follows a node that moved by (dx,dy).
 *
 * Every point is shifted by a weight that runs from 1 at the moved end to 0 at
 * the other, so the far end stays pinned to the node it still touches and the
 * curve mermaid chose is kept rather than replaced by a straight line.
 *
 * BAILS OUT on any command other than M, L or C. Those three take whole
 * coordinate pairs, which is what lets every number be treated as an x or a y;
 * H, V and A do not, and shifting their arguments would corrupt the path. A
 * measured mermaid render only ever emitted M, L and C — this guard is for the
 * day that stops being true.
 */
function geserJalur(d: any, dx: any, dy: any, dariAwal: any) {
  const s = String(d || "");
  if (!s) return s;
  if (/[^MLC\d\s,.eE+-]/.test(s)) return s;
  const angka = s.match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
  if (!angka || angka.length < 2 || angka.length % 2) return s;
  const n = angka.length / 2;
  let i = 0;
  return s.replace(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g, (m: any) => {
    const pasangan = Math.floor(i / 2);
    const sumbuY = i % 2 === 1;
    i++;
    const w =
      n < 2 ? 1 : dariAwal ? 1 - pasangan / (n - 1) : pasangan / (n - 1);
    const v = parseFloat(m) + (sumbuY ? dy : dx) * w;
    return String(Math.round(v * 1000) / 1000);
  });
}

/**
 * The drawing's TRUE size, read from its viewBox.
 *
 * WHY THIS IS NEEDED. mermaid emits width="100%" with no height, and the
 * stage centres its content, so the browser is asked how wide a percentage
 * of an unknown width is. It answers with the SVG default, 300px. Measured:
 * a drawing whose viewBox says 1002 x 293 was being laid out at 300 x 87.7
 * inside a 1280 x 704 stage — and since the fit never enlarges past 1:1, it
 * stayed at 300 wide with the window three-quarters empty.
 */
function ukuranViewBox(vb: any) {
  const n = String(vb || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (n.length !== 4) return null;
  const w = n[2]!;
  const h = n[3]!;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
    return null;
  return { w, h };
}

/** The same, falling back to the ink when there is no usable viewBox. */
function ukuranGambar(svg: any) {
  const vb = ukuranViewBox(
    svg && svg.getAttribute && svg.getAttribute("viewBox"),
  );
  if (vb) return vb;
  try {
    const b = svg.getBBox();
    if (b && b.width > 0 && b.height > 0) return { w: b.width, h: b.height };
  } catch (_) {}
  return null;
}

function DiagramLightbox({ svgHtml, children, hint, onClose }: any) {
  const wadahRef = useRef<any>(null);
  const isiRef = useRef<any>(null);
  const [skala, setSkala] = useState(1);
  const [geser, setGeser] = useState({ x: 0, y: 0 });
  const seret = useRef<any>(null);
  // A node drag and a background pan are mutually exclusive, and each
  // ignores the other's move events. Both live in refs rather than state:
  // a drag fires on every animation frame, and re-rendering the diagram
  // markup that often would fight the pointer.
  const seretSimpul = useRef<any>(null);

  // Fit once the SVG is in the DOM and has a measurable size.
  const muat = useCallback(() => {
    const w = wadahRef.current;
    const i = isiRef.current && isiRef.current.querySelector("svg");
    if (!w || !i) return;
    // PIN THE SIZE. Left alone the browser guesses 300px (see
    // ukuranViewBox), and everything downstream — the fit, the drag, the
    // area a box may move in — is then measured against a number that has
    // nothing to do with the drawing.
    const u = ukuranGambar(i);
    if (u) {
      i.setAttribute("width", String(u.w));
      i.setAttribute("height", String(u.h));
    }
    // The viewBox is in the drawing's own units, so it is already free of
    // the zoom. The old code divided a measured width by `skala` to undo
    // it, and read `skala` out of a closure with an empty dependency list —
    // so pressing 0 after zooming always divided by the initial 1 and refit
    // to the wrong size.
    setSkala(
      skalaMuat(u || { w: 0, h: 0 }, { w: w.clientWidth, h: w.clientHeight }),
    );
    setGeser({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const t = setTimeout(muat, 0);
    return () => clearTimeout(t);
  }, [svgHtml, muat]);

  // Escape closes. Without it the only way out is finding the backdrop, and
  // a diagram that fills the window leaves little of it to click.
  useEffect(() => {
    const onKey = (e: any) => {
      if (e.key === "Escape") onClose && onClose();
      if (e.key === "0") muat();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, muat]);

  /** The <g class="node"> under the pointer, or null for the background. */
  const simpulDi = (t: any) => (t && t.closest ? t.closest("g.node") : null);

  const mulaiSeret = (e: any) => {
    const g = simpulDi(e.target);
    if (g && mulaiSeretSimpul(e, g)) return;
    seret.current = { x: e.clientX - geser.x, y: e.clientY - geser.y };
  };

  /**
   * Begin moving one box. Everything that will move is collected NOW —
   * the box's own translate, each connected edge's original 'd', each of
   * their labels' original position — so every frame is computed from the
   * starting state rather than from the previous frame. Accumulating
   * frame-to-frame deltas drifts, and a path re-bent from an already-bent
   * path drifts fast.
   */
  const mulaiSeretSimpul = (e: any, g: any) => {
    const svg = isiRef.current && isiRef.current.querySelector("svg");
    if (!svg) return false;
    const nid = idSimpulDari(g.getAttribute("id"));
    if (!nid) return false;
    const ids = [...svg.querySelectorAll("g.node")]
      .map((n: any) => idSimpulDari(n.getAttribute("id")))
      .filter(Boolean);
    const label = [...svg.querySelectorAll("g.edgeLabels > g")];
    const ikut: any[] = [];
    [...svg.querySelectorAll("path.flowchart-link")].forEach(
      (p: any, i: number) => {
        const u = ujungTepi(p.getAttribute("id"), nid, ids);
        if (!u) return;
        const l = label[i] || null;
        ikut.push({
          p,
          d: p.getAttribute("d"),
          dariAwal: u === "awal",
          l,
          lt: l ? uraiTranslate(l.getAttribute("transform")) : null,
        });
      },
    );
    // getScreenCTM carries the lightbox's own scale AND the viewBox's, so
    // one conversion covers both. Without it a drag at 3x zoom moves the
    // box three times as far as the pointer.
    const ctm = svg.getScreenCTM && svg.getScreenCTM();
    seretSimpul.current = {
      g,
      t: uraiTranslate(g.getAttribute("transform")),
      ikut,
      x: e.clientX,
      y: e.clientY,
      sx: ctm && ctm.a ? ctm.a : 1,
      sy: ctm && ctm.d ? ctm.d : 1,
    };
    return true;
  };
  const jalanSeret = (e: any) => {
    const s = seretSimpul.current;
    if (s) {
      const dx = (e.clientX - s.x) / (s.sx || 1);
      const dy = (e.clientY - s.y) / (s.sy || 1);
      s.g.setAttribute(
        "transform",
        "translate(" + (s.t.x + dx) + ", " + (s.t.y + dy) + ")",
      );
      for (const it of s.ikut) {
        it.p.setAttribute("d", geserJalur(it.d, dx, dy, it.dariAwal));
        // The label sits at the middle of its edge, where the weight is a
        // half — so it follows by half the distance and stays on the line.
        if (it.l && it.lt)
          it.l.setAttribute(
            "transform",
            "translate(" + (it.lt.x + dx / 2) + ", " + (it.lt.y + dy / 2) + ")",
          );
      }
      return;
    }
    if (!seret.current) return;
    setGeser({
      x: e.clientX - seret.current.x,
      y: e.clientY - seret.current.y,
    });
  };
  const selesaiSeret = () => {
    seret.current = null;
    seretSimpul.current = null;
  };

  const isi = (
    <div
      className="diag-lightbox"
      onMouseDown={(e: any) => {
        // Only the backdrop closes. A drag that happens to end on the backdrop
        // must not be read as a click meaning 'close'.
        if (e.target === e.currentTarget) onClose && onClose();
      }}
    >
      <div className="diag-bar">
        <span className="diag-hint">
          {hint ||
            "drag a box to move it · drag the background to pan · scroll to zoom · 0 to fit · Esc to close"}
        </span>
        <button
          className="diag-tutup"
          onClick={onClose}
          aria-label="Close diagram"
        >
          ✕
        </button>
      </div>
      {/* TWO THINGS CAN FILL THIS WINDOW, and they are handled differently.
          A rendered SVG is a picture: it pans and zooms as one, because there
          is nothing inside it to address. A converted graph is a MODEL —
          cytoscape drags its nodes, runs layouts and does its own zooming — so
          when children are given, this stops steering and stays out of the way.
          Applying the pan transform to both would fight cytoscape for the
          pointer and move the whole canvas when the user meant one node. */}
      {children ? (
        <div className="diag-panggung diag-hidup">{children}</div>
      ) : (
        <div
          className="diag-panggung"
          ref={wadahRef}
          onMouseDown={mulaiSeret}
          onMouseMove={jalanSeret}
          onMouseUp={selesaiSeret}
          onMouseLeave={selesaiSeret}
          onDoubleClick={muat}
          onWheel={(e: any) => {
            const arah = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            setSkala((s: any) => jepitSkala(s * arah));
          }}
        >
          <div
            ref={isiRef}
            className="diag-isi"
            style={{
              transform:
                "translate(" +
                geser.x +
                "px," +
                geser.y +
                "px) scale(" +
                skala +
                ")",
            }}
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        </div>
      )}
    </div>
  );
  return typeof document !== "undefined" && document.body
    ? ReactDOM.createPortal(isi, document.body)
    : isi;
}

function DiagramBlock({ code }: any) {
  const [interactive, setInteractive] = useState(false);
  const canInteractive = useMemo(() => {
    if (typeof window === "undefined" || typeof window.cytoscape !== "function")
      return false;
    try {
      const els = mermaidToCytoElements(code);
      return !!(
        els && els.some((e: any) => !e.data.source && !e.data.isParent)
      );
    } catch (e) {
      return false;
    }
  }, [code]);
  // The full-window view, and WHAT it shows. Held here rather than in
  // MermaidBlock because only this component knows whether the diagram converts
  // into a graph whose nodes can be dragged.
  const [penuh, setPenuh] = useState<any>(null);

  if (interactive && canInteractive)
    return (
      <CytoscapeBlock code={code} onStatic={() => setInteractive(false)} />
    );
  return (
    <React.Fragment>
      <MermaidBlock
        code={code}
        onInteractive={canInteractive ? () => setInteractive(true) : null}
        onOpen={(html: any) => setPenuh(html)}
      />
      {penuh ? (
        // ── THE LAYOUT IS THE USER'S TO REARRANGE ──
        //
        // When the diagram converts, the full view is the LIVE GRAPH: nodes are
        // dragged where they belong, layouts can be swapped, and the arrangement
        // dagre chose is a starting point rather than a verdict. That was
        // already possible, but only behind a small "⇱ interaktif" link in the
        // header — which is not where anyone looks while reading a picture.
        //
        // Diagrams that do NOT convert (sequence, pie, class) are still just
        // pictures, and get the pan-and-zoom view instead. Offering drag on
        // something with no nodes to drag would be a control that does nothing.
        <DiagramLightbox
          onClose={() => setPenuh(null)}
          {...(canInteractive
            ? {
                hint: "drag the nodes to rearrange · scroll to zoom · Esc to close",
                children: <CytoscapeBlock code={code} />,
              }
            : { svgHtml: penuh })}
        />
      ) : null}
    </React.Fragment>
  );
}

// The primary renderer: real mermaid.js (window.mermaid, vendored from
// index.html). It understands <br/>, subgraphs, node shapes and dagre's tidy
// layout. If mermaid fails or has not loaded yet, this falls back to
// MermaidBlockFallback (a custom SVG parser) so a diagram is never lost.
// menampilkan kode mentah.
function MermaidBlock({ code, onInteractive, onOpen }: any) {
  const ref = useRef<any>(null);
  const [failed, setFailed] = useState(false);
  // The SVG being shown full-window, or null. Held as markup rather than as a
  // node so the overlay owns its own copy and cannot be emptied by a re-render
  // of the block underneath it.
  const [penuh, setPenuh] = useState<any>(null);
  const [disalin, setDisalin] = useState(false);
  // The PARENT decides what the full view shows — a draggable graph when the
  // diagram converts into one, this picture otherwise. It knows; this does not.
  const buka = (html: any) => (onOpen ? onOpen(html) : setPenuh(html));
  useEffect(() => {
    let cancelled = false;

    // MERMAID IS LOADED WHEN IT IS USED, not when the app starts.
    //
    // Measured in the running app: loading it up front cost 8904 ms of an
    // 11795 ms vendor total — 75% of it, all of it blocking the render before a
    // single pixel was drawn. Most sessions never show a diagram at all, so
    // that was paid for something never used.
    //
    // The old `!m` branch went straight to setFailed(true), which means the
    // fallback renderer. That was right when mermaid was never going to exist;
    // now it merely does not exist YET, and giving up there would show the
    // degraded diagram on every first diagram.
    const jalankan = (m: any) => {
      try {
        if (!window.__mermaidInit) {
          m.initialize({
            startOnLoad: false,
            securityLevel: "loose",
            theme: "base",
            themeVariables: {
              background: "#0d1117",
              primaryColor: "#1c2634",
              primaryBorderColor: "#c8d3e0",
              primaryTextColor: "#eaf0f7",
              lineColor: "#8fb3ff",
              secondaryColor: "#161b22",
              tertiaryColor: "#0d1117",
              clusterBkg: "#12161d",
              clusterBorder: "#2b3546",
              edgeLabelBackground: "#0d1117",
              fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
              fontSize: "15px",
            },
            flowchart: {
              curve: "basis",
              htmlLabels: true,
              nodeSpacing: 46,
              rankSpacing: 54,
              padding: 10,
              useMaxWidth: true,
            },
          });
          window.__mermaidInit = true;
        }
        const id = "mmd-" + Math.random().toString(36).slice(2, 9);
        Promise.resolve(m.render(id, code))
          .then(({ svg }: any) => {
            if (cancelled || !ref.current) return;
            ref.current.innerHTML = svg;
            // ── FIT THE FIRST VIEW, DO NOT MAKE IT SCROLL ──
            //
            // mermaid stamps a fixed `height` on the <svg>, so a tall flowchart
            // renders at whatever height dagre decided — nine hundred pixels is
            // ordinary — and the reader meets a diagram they must scroll before
            // they can see what it is.
            //
            // Dropping the attribute lets `height: auto` and the max-height in
            // the stylesheet do their work: the viewBox mermaid also emits means
            // the drawing scales down to MEET inside the box, whole. Removing it
            // here rather than overriding in CSS because an attribute and a
            // stylesheet rule are not the same fight — the attribute wins on
            // some SVG properties.
            const el = ref.current.querySelector("svg");
            if (el) el.removeAttribute("height");
          })
          .catch(() => {
            if (!cancelled) setFailed(true);
          });
      } catch (e) {
        setFailed(true);
      }
    };

    const siap = typeof window !== "undefined" ? window.mermaid : null;
    if (siap && siap.render) {
      jalankan(siap);
    } else if (typeof window !== "undefined" && (window as any).__muatMermaid) {
      (window as any)
        .__muatMermaid()
        .then(() => {
          if (cancelled) return;
          const m = (window as any).mermaid;
          if (m && m.render) jalankan(m);
          else setFailed(true);
        })
        .catch(() => {
          // The loader rejects rather than hanging, so this really is reached.
          if (!cancelled) setFailed(true);
        });
    } else {
      setFailed(true);
    }

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (failed) return <MermaidBlockFallback code={code} />;
  return (
    <div className="mermaid-block">
      <div className="code-head">
        <span className="code-dots">
          <span style={{ background: "#ff5f57" }} />
          <span style={{ background: "#febc2e" }} />
          <span style={{ background: "#28c840" }} />
        </span>
        <span className="code-lang">mermaid</span>
        <span className="lang-spacer" />
        {/* THE SOURCE, not the picture. An SVG on the clipboard pastes into
            almost nothing useful, while the mermaid text goes into a document,
            an issue, or back into this chat to be edited. Same button and the
            same 1.5s acknowledgement as CodeBlock — a second copy idiom would
            be one more thing to keep in step. */}
        <button
          className={"ctb-btn" + (disalin ? " copied" : "")}
          style={{ marginLeft: "auto" }}
          title="Copy the diagram source"
          onClick={(e: any) => {
            e.stopPropagation();
            navigator.clipboard?.writeText(code);
            setDisalin(true);
            setTimeout(() => setDisalin(false), 1500);
          }}
        >
          {disalin ? <Icon.check /> : <Icon.copy />}{" "}
          {disalin ? "Copied" : "Copy"}
        </button>
        {onInteractive ? (
          <button
            onClick={onInteractive}
            title="Open as interactive graph (drag / zoom / layout)"
            style={{
              fontFamily: "ui-monospace,monospace",
              fontSize: 11,
              color: "#8fb3ff",
              background: "rgba(143,179,255,0.12)",
              border: "1px solid #8fb3ff",
              borderRadius: 6,
              padding: "3px 10px",
              cursor: "pointer",
            }}
          >
            ⇱ interaktif
          </button>
        ) : null}
      </div>
      {/* THE PICTURE IS THE BUTTON. Reading a wide flowchart through a
          sideways scrollbar means never seeing it whole, and the way out used
          to be a small "⇱ interaktif" link in the header that nobody looks for
          while trying to read a diagram. */}
      <div
        className="mermaid-canvas"
        ref={ref}
        role="button"
        tabIndex={0}
        title="Click to open full size — drag to move, scroll to zoom"
        onClick={() => {
          const svg = ref.current && ref.current.querySelector("svg");
          if (svg) buka(svg.outerHTML);
        }}
        onKeyDown={(e: any) => {
          // Reachable without a mouse: it announces itself as a button, so it
          // has to behave like one.
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          const svg = ref.current && ref.current.querySelector("svg");
          if (svg) buka(svg.outerHTML);
        }}
        style={{
          // No scrollbar. Nothing overflows any more — the whole diagram is
          // scaled into the box, and the full-size view is one click away.
          overflow: "hidden",
          padding: "12px 14px 16px",
          display: "flex",
          justifyContent: "center",
          cursor: "zoom-in",
        }}
      />
      {penuh ? (
        <DiagramLightbox svgHtml={penuh} onClose={() => setPenuh(null)} />
      ) : null}
    </div>
  );
}

function MermaidBlockFallback({ code }: any) {
  const diagram = useMemo(() => parseMermaidFlowchart(code), [code]);
  if (!diagram) {
    return (
      <pre
        className="code-fallback"
        style={{
          margin: 0,
          padding: "10px 14px",
          overflow: "auto",
          color: "#cbd5e1",
          background: "#0d1117",
          font: "13px/1.6 ui-monospace,Consolas,monospace",
          whiteSpace: "pre",
        }}
      >
        {code}
      </pre>
    );
  }

  const { nodes, edges, positioned, width, height, fontSize, padX, padY } =
    diagram;

  const edgePath = (from: any, to: any) => {
    const a = positioned.get(from);
    const b = positioned.get(to);
    if (!a || !b) return "";
    const x1 = a.x + a.w / 2;
    const y1 = a.y + a.h;
    const x2 = b.x + b.w / 2;
    const y2 = b.y;
    const midY = y1 + Math.max(20, (y2 - y1) * 0.42);
    return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  };

  return (
    <div className="mermaid-block">
      <div className="code-head">
        <span className="code-dots">
          <span style={{ background: "#ff5f57" }} />
          <span style={{ background: "#febc2e" }} />
          <span style={{ background: "#28c840" }} />
        </span>
        <span className="code-lang">mermaid</span>
        <span className="lang-spacer" />
      </div>
      <div
        className="mermaid-canvas"
        style={{ overflowX: "auto", padding: "10px 12px 14px" }}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Mermaid flowchart"
        >
          <defs>
            <marker
              id="mermaid-arrow"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#8fb3ff" />
            </marker>
          </defs>
          <rect
            x="0"
            y="0"
            width={width}
            height={height}
            rx="14"
            fill="#0d1117"
          />
          {edges.map((e: any, idx: number) => {
            const a = positioned.get(e.from);
            const b = positioned.get(e.to);
            if (!a || !b) return null;
            const path = edgePath(e.from, e.to);
            const midX = (a.x + a.w / 2 + b.x + b.w / 2) / 2;
            const midY = (a.y + a.h + b.y) / 2 - 8;
            return (
              <g key={idx}>
                <path
                  d={path}
                  fill="none"
                  stroke="#8fb3ff"
                  strokeWidth="1.8"
                  markerEnd="url(#mermaid-arrow)"
                  opacity="0.95"
                />
                {e.label ? (
                  <text
                    x={midX}
                    y={midY}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#9fb7d9"
                    style={{
                      paintOrder: "stroke",
                      stroke: "#0d1117",
                      strokeWidth: 3,
                    }}
                  >
                    {e.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {Array.from(nodes.values()).map((node: any) => {
            const p = positioned.get(node.id);
            if (!p) return null;
            const cx = p.x + p.w / 2;
            const cy = p.y + p.h / 2;
            const label = node.label || node.id;
            const commonStroke =
              node.shape === "diamond" ? "#93c5fd" : "#5eead4";
            return (
              <g key={node.id}>
                {node.shape === "diamond" ? (
                  <polygon
                    points={`${cx},${p.y} ${p.x + p.w},${cy} ${cx},${p.y + p.h} ${p.x},${cy}`}
                    fill="#111827"
                    stroke={commonStroke}
                    strokeWidth="2"
                  />
                ) : node.shape === "circle" ? (
                  <ellipse
                    cx={cx}
                    cy={cy}
                    rx={Math.max(48, p.w / 2)}
                    ry={p.h / 2}
                    fill="#111827"
                    stroke={commonStroke}
                    strokeWidth="2"
                  />
                ) : node.shape === "subroutine" ? (
                  <>
                    <rect
                      x={p.x}
                      y={p.y}
                      width={p.w}
                      height={p.h}
                      rx="14"
                      fill="#111827"
                      stroke={commonStroke}
                      strokeWidth="2"
                    />
                    <line
                      x1={p.x + 10}
                      y1={p.y}
                      x2={p.x + 10}
                      y2={p.y + p.h}
                      stroke={commonStroke}
                      strokeWidth="1.4"
                    />
                    <line
                      x1={p.x + p.w - 10}
                      y1={p.y}
                      x2={p.x + p.w - 10}
                      y2={p.y + p.h}
                      stroke={commonStroke}
                      strokeWidth="1.4"
                    />
                  </>
                ) : (
                  <rect
                    x={p.x}
                    y={p.y}
                    width={p.w}
                    height={p.h}
                    rx="14"
                    fill="#111827"
                    stroke={commonStroke}
                    strokeWidth="2"
                  />
                )}
                <text
                  x={cx}
                  y={cy + 5}
                  textAnchor="middle"
                  fontSize={fontSize}
                  fill="#e5e7eb"
                  fontWeight="600"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
