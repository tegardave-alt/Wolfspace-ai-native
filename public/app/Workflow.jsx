// Workflow — diekstrak dari app.jsx (lihat public/app.jsx untuk App orkestrator).
// Dimuat via APP_MODULES di index.html: di-CONCAT SEBELUM app.jsx (prepend) lalu
// Babel sekali -> satu scope global. Body fungsi (hooks/React/SB) jalan saat render.

// Palet node untuk MODE INTEGRASI (kanvas Logic) — beda dari WF_PALETTE (pipeline
// agent). Node di sini memodelkan alur integrasi/otomasi website: Trigger → HTTP
// Request → Transform → Condition → Output, dan node HTTP benar-benar dieksekusi
// (lewat /flow/http di server). Label node HTTP dipakai sebagai URL.
const INTEGRATION_PALETTE = [
  {
    type: "trigger",
    label: "Trigger",
    accent: "#3fb950",
    desc: "flow entry point (optional initial payload)",
  },
  {
    type: "http",
    label: "HTTP Request",
    accent: "#2f81f7",
    desc: "call a URL/API — pick the method and fill the URL in the node",
  },
  {
    type: "transform",
    label: "Transform",
    accent: "#d29922",
    desc: "ambil field JSON (label = path, mis. data.0.name)",
  },
  {
    type: "condition",
    label: "Condition",
    accent: "#bc8cff",
    desc: "branch: pick the edge whose label appears in the data",
  },
  {
    type: "output",
    label: "Output",
    accent: "#f85149",
    desc: "tampilkan hasil akhir",
  },
];

function WFNodeCard({ id, data, selected }) {
  const XY = window.RFLib && window.RFLib.XY;
  const Handle = XY && XY.Handle;
  const Position = XY && XY.Position;
  const NodeToolbar = XY && XY.NodeToolbar;
  const ctx = React.useContext(WFNodeCtx);
  const editable = !!(ctx && ctx.editable);
  const [editing, setEditing] = React.useState(false);
  const accent = (data && data.accent) || wfKindAccent(data && data.kind);
  const err = data && data.ok === false; // langkah agent gagal
  const active = data && data.active; // langkah agent yang sedang jalan
  const edge = err ? "#f85149" : accent;
  const update = (patch) =>
    ctx &&
    ctx.setNodes &&
    ctx.setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    );
  const cycleKind = () => {
    if (!editable) return;
    const nx = WF_KINDS[(WF_KINDS.indexOf(data.kind) + 1) % WF_KINDS.length];
    update({ kind: nx, accent: wfKindAccent(nx) });
  };
  const commit = (v) => {
    const t = String(v || "").trim();
    if (t) update({ label: t });
    setEditing(false);
  };
  // Fase 3: tiap node bisa diikat ke FOLDER sendiri. Saat graph jalan, agent tahap
  // itu terkurung ke folder ini (workspace_root) — jadi satu graph bisa
  // mengorkestrasi banyak agent, masing-masing di folder/repo berbeda.
  const wsRoot = data && data.workspaceRoot;
  const wsBase = wsRoot
    ? String(wsRoot)
        .replace(/[\\/]+$/, "")
        .split(/[\\/]/)
        .pop()
    : "";
  const setFolder = () => {
    const cur = wsRoot || "";
    const v = window.prompt(
      "Folder for this node (absolute path). Leave empty to follow the active folder:",
      cur,
    );
    if (v === null) return;
    update({ workspaceRoot: String(v).trim() || undefined });
  };
  // Bentuk per-kind (konvensi flowchart): condition = belah ketupat, prompt/output
  // = pil (terminator), agent/tool = kotak (proses).
  const kind = data && data.kind;
  const shape =
    kind === "condition"
      ? "diamond"
      : kind === "prompt" || kind === "output"
        ? "pill"
        : "rect";
  const hStyle = { background: edge, width: 8, height: 8, border: "none" };
  const chip = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: shape === "diamond" ? "center" : "flex-start",
        gap: "5px",
        fontSize: "9px",
        letterSpacing: ".12em",
        textTransform: "uppercase",
        color: edge,
        marginBottom: "2px",
      }}
    >
      <span
        onClick={(e) => {
          e.stopPropagation();
          cycleKind();
        }}
        title={editable ? "click: change node type" : undefined}
        style={{ cursor: editable ? "pointer" : "default", userSelect: "none" }}
      >
        {data.kind}
        {editable ? " ▾" : ""}
      </span>
      {active && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: edge,
            boxShadow: "0 0 6px " + edge,
          }}
        />
      )}
      {err && <span title="failed">✕</span>}
      {wsBase && (
        <span
          title={"confined to folder: " + wsRoot}
          onClick={
            editable
              ? (e) => {
                  e.stopPropagation();
                  setFolder();
                }
              : undefined
          }
          style={{
            marginLeft: "auto",
            color: "#d29922",
            cursor: editable ? "pointer" : "default",
            textTransform: "none",
            letterSpacing: 0,
            fontSize: "9px",
          }}
        >
          📁 {wsBase}
        </span>
      )}
    </div>
  );
  const labelEl = editing ? (
    <input
      className="nodrag"
      autoFocus
      defaultValue={data.label}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit(e.currentTarget.value);
        else if (e.key === "Escape") setEditing(false);
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
      style={{
        width: "100%",
        background: "#0d1117",
        border: "1px solid " + edge,
        borderRadius: "5px",
        color: "#dce4f0",
        fontFamily: "ui-monospace, monospace",
        fontSize: "12px",
        fontWeight: 600,
        padding: "2px 6px",
        outline: "none",
        textAlign: shape === "diamond" ? "center" : "left",
      }}
    />
  ) : (
    <div
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (editable) setEditing(true);
      }}
      title={editable ? "double-click: edit label" : undefined}
      style={{
        fontSize: "12.5px",
        fontWeight: 600,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        cursor: editable ? "text" : "default",
        textAlign: shape === "diamond" ? "center" : "left",
      }}
    >
      {data.label}
    </div>
  );
  const resultEl =
    data && data.result ? (
      <div
        onClick={(e) => {
          e.stopPropagation();
          ctx &&
            ctx.openDetail &&
            ctx.openDetail({
              label: data.label,
              kind: data.kind,
              result: data.result,
              accent: edge,
            });
        }}
        title="click: view the full result"
        style={{
          marginTop: "5px",
          paddingTop: shape === "diamond" ? 0 : "5px",
          borderTop: shape === "diamond" ? "none" : "1px solid #21324a",
          fontSize: "10.5px",
          color: "#8fb3ff",
          cursor: "pointer",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        📄{" "}
        {shape === "diamond"
          ? "hasil"
          : String(data.result).replace(/\s+/g, " ").slice(0, 40) + "…"}
      </div>
    ) : null;
  const _tb = {
    border: "1px solid #2f4056",
    background: "#131922",
    color: "#dce4f0",
    borderRadius: "5px",
    width: "24px",
    height: "22px",
    cursor: "pointer",
    fontSize: "11px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
  const toolbar =
    NodeToolbar && editable ? (
      <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            title="Duplicate (Ctrl+V from the copy)"
            style={_tb}
            onClick={(e) => {
              e.stopPropagation();
              ctx.duplicateNode && ctx.duplicateNode(id);
            }}
          >
            ⧉
          </button>
          <button
            title={
              wsRoot
                ? "Folder node: " + wsRoot
                : "Bind the node to its own folder (the agent is confined there)"
            }
            style={{ ..._tb, color: wsRoot ? "#d29922" : "#dce4f0" }}
            onClick={(e) => {
              e.stopPropagation();
              setFolder();
            }}
          >
            📁
          </button>
          <button
            title="Delete"
            style={{ ..._tb, color: "#f0776b" }}
            onClick={(e) => {
              e.stopPropagation();
              ctx.deleteNode && ctx.deleteNode(id);
            }}
          >
            🗑
          </button>
        </div>
      </NodeToolbar>
    ) : null;

  if (shape === "diamond") {
    const diaClip = "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
    return (
      <div
        style={{
          position: "relative",
          width: "138px",
          height: "116px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {toolbar}
        {Handle && (
          <Handle type="target" position={Position.Left} style={hStyle} />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: active ? edge : edge + "88",
            clipPath: diaClip,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: "1.6px",
            background: "#131922",
            clipPath: diaClip,
          }}
        />
        <div
          style={{
            position: "relative",
            textAlign: "center",
            maxWidth: "74%",
            color: "#dce4f0",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {chip}
          {labelEl}
          {resultEl}
        </div>
        {Handle && (
          <Handle type="source" position={Position.Right} style={hStyle} />
        )}
      </div>
    );
  }
  const pill = shape === "pill";
  return (
    <div
      style={{
        minWidth: pill ? "120px" : "128px",
        maxWidth: "220px",
        background: "#131922",
        border: "1px solid " + (active ? edge : edge + "55"),
        borderLeft: pill
          ? "1px solid " + (active ? edge : edge + "55")
          : "3px solid " + edge,
        borderRadius: pill ? "999px" : "8px",
        padding: pill ? "8px 18px" : "8px 12px",
        color: "#dce4f0",
        fontFamily: "ui-monospace, monospace",
        boxShadow: active
          ? "0 0 0 2px " + edge + "88, 0 4px 14px rgba(0,0,0,.5)"
          : "0 4px 14px rgba(0,0,0,.4)",
      }}
    >
      {toolbar}
      {Handle && (
        <Handle type="target" position={Position.Left} style={hStyle} />
      )}
      {chip}
      {labelEl}
      {resultEl}
      {Handle && (
        <Handle type="source" position={Position.Right} style={hStyle} />
      )}
    </div>
  );
}

// Node CUSTOM terpadu mode integrasi. SATU komponen, tapi field inline BEDA per
// jenis (trigger/http/transform/condition/output) — cara React Flow yang benar,
// tiap tipe punya UI-nya sendiri. Semua simpan konfig ke data.* via ctx.setNodes;
// dibaca runGraphIntegration. Trigger tak punya handle-masuk (titik awal), Output
// tak punya handle-keluar (titik akhir) — mencerminkan perannya.
const INTEG_META = {
  trigger: { title: "Trigger", icon: "⚡", accent: "#3fb950" },
  http: { title: "HTTP Request", icon: "🌐", accent: "#2f81f7" },
  transform: { title: "Transform", icon: "🧮", accent: "#d29922" },
  condition: { title: "Condition", icon: "🔀", accent: "#bc8cff" },
  output: { title: "Output", icon: "📤", accent: "#f85149" },
};
function IntegrationNode({ id, data, selected }) {
  const XY = window.RFLib && window.RFLib.XY;
  const Handle = XY && XY.Handle,
    Position = XY && XY.Position,
    NodeToolbar = XY && XY.NodeToolbar;
  const ctx = React.useContext(WFNodeCtx);
  const editable = !!(ctx && ctx.editable);
  const kind = (data && data.kind) || "output";
  const meta = INTEG_META[kind] || INTEG_META.output;
  const accent = (data && data.accent) || meta.accent;
  const err = data && data.ok === false;
  const active = data && data.active;
  const edge = err ? "#f85149" : accent;
  const update = (patch) =>
    ctx &&
    ctx.setNodes &&
    ctx.setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    );
  const hStyle = { background: edge, width: 8, height: 8, border: "none" };
  const stop = (e) => e.stopPropagation();
  const inp = {
    background: "#0d1117",
    border: "1px solid #2f4056",
    borderRadius: "5px",
    color: "#dce4f0",
    fontFamily: "inherit",
    fontSize: "11px",
    padding: "3px 6px",
    outline: "none",
  };
  const sel = {
    ...inp,
    color: "#8fb3ff",
    fontWeight: 600,
    cursor: editable ? "pointer" : "default",
  };
  const _tb = {
    border: "1px solid #2f4056",
    background: "#131922",
    color: "#f0776b",
    borderRadius: "5px",
    width: "24px",
    height: "22px",
    cursor: "pointer",
    fontSize: "11px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };

  // ── field inline BERBEDA per jenis ──
  let body = null;
  if (kind === "http") {
    body = (
      <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
        <select
          className="nodrag"
          value={(data && data.method) || "GET"}
          disabled={!editable}
          onMouseDown={stop}
          onClick={stop}
          onChange={(e) => update({ method: e.target.value })}
          style={{ ...sel, padding: "3px 4px" }}
        >
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          className="nodrag"
          value={(data && data.url) || ""}
          readOnly={!editable}
          placeholder="https://api…"
          onMouseDown={stop}
          onKeyDown={stop}
          onChange={(e) => update({ url: e.target.value })}
          style={{ ...inp, flex: 1, minWidth: 0 }}
        />
      </div>
    );
  } else if (kind === "trigger") {
    const tt = (data && data.trigger) || "manual";
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        <select
          className="nodrag"
          value={tt}
          disabled={!editable}
          onMouseDown={stop}
          onClick={stop}
          onChange={(e) => update({ trigger: e.target.value })}
          style={sel}
        >
          <option value="manual">Manual (click Run)</option>
          <option value="webhook">Webhook (URL dipanggil)</option>
          <option value="schedule">Schedule (interval)</option>
        </select>
        {tt === "webhook" && (
          <div
            style={{
              ...inp,
              color: "#8fb3ff",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            POST /hook/{(data && data.hookId) || "…"}
          </div>
        )}
        {tt === "schedule" && (
          <input
            className="nodrag"
            value={(data && data.schedule) || ""}
            readOnly={!editable}
            placeholder="mis. every 5m"
            onMouseDown={stop}
            onKeyDown={stop}
            onChange={(e) => update({ schedule: e.target.value })}
            style={inp}
          />
        )}
      </div>
    );
  } else if (kind === "transform") {
    body = (
      <input
        className="nodrag"
        value={(data && data.expr) || ""}
        readOnly={!editable}
        placeholder="path JSON, mis. data.0.name"
        onMouseDown={stop}
        onKeyDown={stop}
        onChange={(e) => update({ expr: e.target.value })}
        style={{ ...inp, width: "100%" }}
      />
    );
  } else if (kind === "condition") {
    body = (
      <input
        className="nodrag"
        value={(data && data.check) || ""}
        readOnly={!editable}
        placeholder="kata kunci di data, mis. ok"
        onMouseDown={stop}
        onKeyDown={stop}
        onChange={(e) => update({ check: e.target.value })}
        style={{ ...inp, width: "100%" }}
      />
    );
  } else if (kind === "output") {
    body = (
      <select
        className="nodrag"
        value={(data && data.format) || "text"}
        disabled={!editable}
        onMouseDown={stop}
        onClick={stop}
        onChange={(e) => update({ format: e.target.value })}
        style={{ ...sel, width: "100%" }}
      >
        <option value="text">Tampilkan sebagai teks</option>
        <option value="json">Tampilkan sebagai JSON</option>
      </select>
    );
  }

  // Gaya kartu mengikuti artifact: header-bar beraksen + field kotak bertumpuk,
  // ALUR VERTIKAL (handle masuk di ATAS, keluar di BAWAH). Condition = dua colokan
  // bawah berlabel true (hijau) / false (merah).
  return (
    <div
      style={{
        position: "relative",
        width: "236px",
        background: "#131922",
        border: "1px solid " + (active ? edge : "#24303f"),
        borderTop: "2px solid " + edge,
        borderRadius: "9px",
        color: "#dce4f0",
        fontFamily: "ui-monospace, monospace",
        boxShadow: active
          ? "0 0 0 2px " + edge + "88, 0 6px 18px rgba(0,0,0,.5)"
          : "0 6px 16px rgba(0,0,0,.45)",
      }}
    >
      {NodeToolbar && editable && (
        <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
          <button
            title="Delete"
            style={_tb}
            onClick={(e) => {
              stop(e);
              ctx.deleteNode && ctx.deleteNode(id);
            }}
          >
            🗑
          </button>
        </NodeToolbar>
      )}
      {/* handle MASUK di atas (kecuali trigger = titik awal) */}
      {kind !== "trigger" && Handle && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ ...hStyle, background: edge }}
        />
      )}
      {/* header-bar: tint warna + kotak + label KAPITAL */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          padding: "6px 10px",
          background: edge + "1f",
          borderBottom: "1px solid " + edge + "33",
          borderRadius: "7px 7px 0 0",
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            background: edge,
            boxShadow: active ? "0 0 8px " + edge : "none",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: "10px",
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: edge,
            fontWeight: 700,
            flex: 1,
          }}
        >
          {meta.title}
        </span>
        {err && (
          <span title="failed" style={{ color: "#f0776b" }}>
            ✕
          </span>
        )}
      </div>
      {/* body: field kotak bertumpuk */}
      <div
        style={{
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        {body}
        {data && data.result ? (
          <div
            onClick={(e) => {
              stop(e);
              ctx &&
                ctx.openDetail &&
                ctx.openDetail({
                  label: meta.title,
                  kind,
                  result: data.result,
                  accent: edge,
                });
            }}
            title="click: view the full result"
            style={{
              paddingTop: "6px",
              borderTop: "1px solid #21324a",
              fontSize: "10.5px",
              color: err ? "#f0776b" : "#8fb3ff",
              cursor: "pointer",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            📄 {String(data.result).replace(/\s+/g, " ").slice(0, 46) + "…"}
          </div>
        ) : null}
      </div>
      {/* handle KELUAR di bawah. Condition = dua colokan true/false */}
      {kind === "condition" ? (
        <div style={{ position: "relative", height: "13px" }}>
          {Handle && (
            <Handle
              id="true"
              type="source"
              position={Position.Bottom}
              style={{ ...hStyle, left: "30%", background: "#3fb950" }}
            />
          )}
          {Handle && (
            <Handle
              id="false"
              type="source"
              position={Position.Bottom}
              style={{ ...hStyle, left: "70%", background: "#f85149" }}
            />
          )}
          <span
            style={{
              position: "absolute",
              left: "30%",
              top: "1px",
              transform: "translateX(-50%)",
              fontSize: "8.5px",
              color: "#3fb950",
            }}
          >
            true
          </span>
          <span
            style={{
              position: "absolute",
              left: "70%",
              top: "1px",
              transform: "translateX(-50%)",
              fontSize: "8.5px",
              color: "#f85149",
            }}
          >
            false
          </span>
        </div>
      ) : (
        kind !== "output" &&
        Handle && (
          <Handle
            type="source"
            position={Position.Bottom}
            style={{ ...hStyle, background: edge }}
          />
        )
      )}
    </div>
  );
}

// Edge custom WOLFSPACE: bezier dengan rel gelap + partikel mengalir (dash animasi).
// Label (mis. cabang "ya"/"tidak") dirender via EdgeLabelRenderer bila ada.
function WFEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  label,
  data,
}) {
  const XY = window.RFLib && window.RFLib.XY;
  const [path, labelX, labelY] = XY.getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const lbl = (data && data.label) || label;
  return (
    <React.Fragment>
      <path
        d={path}
        fill="none"
        stroke={selected ? "#8fb3ff" : "#24384f"}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <path
        d={path}
        fill="none"
        stroke="#8fb3ff"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeDasharray="1 10"
        style={{ animation: "wfflow 0.7s linear infinite" }}
      />
      {lbl && XY.EdgeLabelRenderer && (
        <XY.EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              background: "#0d1117",
              border: "1px solid #2f4056",
              borderRadius: "5px",
              padding: "1px 7px",
              fontSize: "10px",
              color: "#8fb3ff",
              fontFamily: "ui-monospace, monospace",
              pointerEvents: "all",
            }}
          >
            {lbl}
          </div>
        </XY.EdgeLabelRenderer>
      )}
    </React.Fragment>
  );
}

// Background diagonal cross-hatch WOLFSPACE — komponen kustom di atas API publik
// React Flow (useStore -> transform viewport), tanpa menyentuh internal library.
// Menggantikan varian fork "BackgroundVariant.Diagonal" (fork sudah dilepas ke npm).
function WFDiagonalBackground({ gap = 26, color = "#1c2a3a", lineWidth = 1 }) {
  const XY = window.RFLib.XY;
  const transform = XY.useStore((s) => s.transform); // [x, y, zoom]
  const g = gap * transform[2];
  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      <pattern
        id="wf-diag-bg"
        x={transform[0] % g}
        y={transform[1] % g}
        width={g}
        height={g}
        patternUnits="userSpaceOnUse"
      >
        <path
          d={`M0 0 L${g} ${g} M${g} 0 L0 ${g}`}
          stroke={color}
          strokeWidth={lineWidth}
          fill="none"
        />
      </pattern>
      <rect x="0" y="0" width="100%" height="100%" fill="url(#wf-diag-bg)" />
    </svg>
  );
}

function WorkflowBuilderInner({
  onBack,
  runStage,
  integration,
  workspaceRoot,
}) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const XY = window.RFLib.XY;
  const {
    ReactFlow,
    useNodesState,
    useEdgesState,
    addEdge,
    useReactFlow,
    applyNodeChanges,
  } = XY;
  const idRef = React.useRef(3);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [showJson, setShowJson] = React.useState(false);
  // mode "builder" = kanvas manual; "live" = cermin eksekusi agent (Fase 1) —
  // tiap langkah t:"act" dari self_agent.cjs jadi node berurut, yang terbaru disorot.
  const [mode, setMode] = React.useState("builder");
  const [liveNodes, setLiveNodes] = React.useState([]);
  const [liveEdges, setLiveEdges] = React.useState([]);
  const liveRef = React.useRef({ i: 0, lastId: null });
  // Fase 2: eksekusi graph tergambar (Builder) sebagai pipeline agent berurutan.
  const [running, setRunning] = React.useState(false);
  const [runErr, setRunErr] = React.useState("");
  const runAbort = React.useRef(false);
  const [detailNode, setDetailNode] = React.useState(null); // #2 panel detail hasil node
  const [showLoad, setShowLoad] = React.useState(false); // #1 menu muat
  const [savedList, setSavedList] = React.useState(() => {
    try {
      return Object.keys(
        JSON.parse(localStorage.getItem("wolfspace_workflows") || "{}"),
      );
    } catch (_) {
      return [];
    }
  });
  const rf = useReactFlow();
  const isLive = mode === "live";
  const nodeTypes = React.useMemo(
    () =>
      integration
        ? {
            wf: WFNodeCard,
            trigger: IntegrationNode,
            http: IntegrationNode,
            transform: IntegrationNode,
            condition: IntegrationNode,
            output: IntegrationNode,
          }
        : { wf: WFNodeCard },
    [integration],
  );
  const edgeTypes = React.useMemo(() => ({ wf: WFEdge }), []);

  // Dengar stream agent (dipancarkan dari doSend): bangun graph eksekusi live.
  React.useEffect(() => {
    if (integration) return; // mode integrasi: kanvas berdiri sendiri, bukan cermin agent
    // Live "loop nyata": cermin STRUKTUR LangGraph agent (planner → executor ⇄
    // tools → validate) sebagai node peran tetap dalam layout loop; langkah konkret
    // dikelompokkan per-peran (klik node → semua langkahnya). kind act → peran.
    const ROLES = [
      {
        id: "R_planner",
        role: "planner",
        pos: { x: 0, y: 30 },
        accent: "#bc8cff",
      },
      {
        id: "R_executor",
        role: "executor",
        pos: { x: 250, y: 30 },
        accent: "#2f81f7",
      },
      {
        id: "R_tools",
        role: "tools",
        pos: { x: 510, y: 30 },
        accent: "#d29922",
      },
      {
        id: "R_validate",
        role: "validate",
        pos: { x: 250, y: 190 },
        accent: "#3fb950",
      },
    ];
    const roleOf = (kind) => {
      if (kind === "planner") return "planner";
      if (kind === "validate" || kind === "verify") return "validate";
      if (
        [
          "bash",
          "read",
          "edit",
          "write",
          "grep",
          "glob",
          "list",
          "task",
          "architecture_map",
        ].indexOf(kind) >= 0
      )
        return "tools";
      return "executor"; // workspace, hitl, continue, thought, dll = giliran executor
    };
    const baseNodes = () =>
      ROLES.map((r) => ({
        id: r.id,
        type: "wf",
        position: { ...r.pos },
        data: {
          label: r.role,
          kind: r.role,
          accent: r.accent,
          steps: [],
          active: false,
        },
      }));
    const baseEdges = () => [
      { id: "le1", source: "R_planner", target: "R_executor", type: "wf" },
      {
        id: "le2",
        source: "R_executor",
        target: "R_tools",
        type: "wf",
        data: { label: "panggil" },
      },
      {
        id: "le3",
        source: "R_tools",
        target: "R_executor",
        type: "wf",
        data: { label: "hasil" },
      }, // loop-back
      { id: "le4", source: "R_executor", target: "R_validate", type: "wf" },
    ];
    const onRun = (e) => {
      const phase = e.detail && e.detail.phase;
      if (phase === "start") {
        liveRef.current = {
          steps: { planner: [], executor: [], tools: [], validate: [] },
        };
        setLiveNodes(baseNodes());
        setLiveEdges(baseEdges());
        setMode("live");
        setTimeout(() => {
          try {
            rf && rf.fitView && rf.fitView({ duration: 300, padding: 0.25 });
          } catch (_) {}
        }, 60);
      } else if (phase === "done") {
        setLiveNodes((nds) =>
          nds.map((n) => ({ ...n, data: { ...n.data, active: false } })),
        );
      }
    };
    const onAct = (e) => {
      const d = e.detail || {};
      const role = roleOf(d.kind);
      const rid = "R_" + role;
      // Guard pada .steps, bukan hanya liveRef.current: tombol "Bersihkan" pernah
      // me-reset liveRef ke bentuk tanpa .steps, sehingga onAct berikutnya membaca
      // st.steps[role] pada undefined → "Cannot read properties of undefined
      // (reading 'planner')". Bangun ulang bila steps hilang.
      let st = liveRef.current;
      if (!st || !st.steps)
        st = liveRef.current = {
          steps: { planner: [], executor: [], tools: [], validate: [] },
        };
      if (!st.steps[role]) st.steps[role] = [];
      st.steps[role].push(
        (String(d.arg || "").trim() || d.kind || "step").slice(0, 60),
      );
      const list = st.steps[role];
      setLiveNodes((nds) => {
        const has = nds.some((n) => n.id === rid);
        const src = has ? nds : baseNodes();
        return src.map((n) => {
          if (n.id === rid)
            return {
              ...n,
              data: {
                ...n.data,
                active: true,
                ok: d.ok,
                label: role + " · " + list.length,
                result: list.map((s, i) => i + 1 + ". " + s).join("\n"),
              },
            };
          return { ...n, data: { ...n.data, active: false } };
        });
      });
      setLiveEdges((eds) => (eds.length ? eds : baseEdges()));
    };
    window.addEventListener("wolfspace_agent_run", onRun);
    window.addEventListener("wolfspace_agent_act", onAct);
    return () => {
      window.removeEventListener("wolfspace_agent_run", onRun);
      window.removeEventListener("wolfspace_agent_act", onAct);
    };
  }, [rf]);

  // Chat kanan minta "buat workflow" → agent kirim spec → render ke kanvas (Builder).
  React.useEffect(() => {
    const onSpec = (e) => {
      const spec = e.detail;
      if (!spec || !Array.isArray(spec.nodes) || !spec.nodes.length) return;
      const { nodes: nn, edges: ee } = specToFlow(spec);
      if (!nn.length) return;
      setMode("builder");
      setNodes(nn);
      setEdges(ee);
      setTimeout(() => {
        try {
          rf && rf.fitView && rf.fitView({ duration: 400, padding: 0.2 });
        } catch (_) {}
      }, 80);
    };
    window.addEventListener("wolfspace_workflow_spec", onSpec);
    return () => window.removeEventListener("wolfspace_workflow_spec", onSpec);
  }, [rf, setNodes, setEdges]);

  const liveOnNodesChange = React.useCallback(
    (changes) => setLiveNodes((nds) => applyNodeChanges(changes, nds)),
    [applyNodeChanges],
  );
  const noop = React.useCallback(() => {}, []);

  const onConnect = React.useCallback(
    (c) => setEdges((eds) => addEdge({ ...c, type: "wf" }, eds)),
    [setEdges, addEdge],
  );
  const onDragOver = React.useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);
  const addNode = React.useCallback(
    (item, clientX, clientY) => {
      const pos =
        rf && rf.screenToFlowPosition
          ? rf.screenToFlowPosition({ x: clientX, y: clientY })
          : { x: 220, y: 180 };
      const id = "n" + idRef.current++;
      if (integration) {
        // Mode integrasi: node.type = kind → dirender IntegrationNode dgn field-nya.
        const k = item.type;
        const extra =
          k === "http"
            ? { method: "GET", url: "" }
            : k === "trigger"
              ? { trigger: "manual" }
              : k === "output"
                ? { format: "text" }
                : {};
        setNodes((nds) =>
          nds.concat({
            id,
            type: k,
            position: pos,
            data: { kind: k, accent: item.accent, ...extra },
          }),
        );
      } else {
        setNodes((nds) =>
          nds.concat({
            id,
            type: "wf",
            position: pos,
            data: { label: item.label, kind: item.type, accent: item.accent },
          }),
        );
      }
    },
    [rf, setNodes],
  );
  const onDrop = React.useCallback(
    (e) => {
      e.preventDefault();
      if (isLive) return;
      const raw = e.dataTransfer.getData("application/wf");
      if (!raw) return;
      try {
        addNode(JSON.parse(raw), e.clientX, e.clientY);
      } catch (_) {}
    },
    [addNode, isLive],
  );

  // Fase 2: JALANKAN graph tergambar. Kompilasi → urutan topological → eksekusi tiap
  // node berurutan (prompt = seed; agent/tool/condition/output = 1 giliran agent),
  // node menyala saat berjalan, konteks di-thread antar-node. Hasil ke panel chat.
  const setNodeData = (id, patch) =>
    setNodes((nds) =>
      nds.map((x) =>
        x.id === id ? { ...x, data: { ...x.data, ...patch } } : x,
      ),
    );
  const clearActive = () =>
    setNodes((nds) =>
      nds.map((x) => ({ ...x, data: { ...x.data, active: false } })),
    );
  // MODE INTEGRASI: eksekusi flow nyata. Trigger (seed) → HTTP (fetch via
  // /flow/http) → Transform (ambil field JSON) → Condition (pilih cabang) →
  // Output. Konteks (ctx) di-thread antar-node sebagai teks/JSON.
  const runGraphIntegration = async () => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const outOf = (id) => edges.filter((e) => e.source === id);
    const edgeLabel = (e) => String((e.data && e.data.label) || e.label || "");
    const indeg = new Map(nodes.map((n) => [n.id, 0]));
    edges.forEach((e) => {
      if (indeg.has(e.target)) indeg.set(e.target, indeg.get(e.target) + 1);
    });
    let queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
    if (!queue.length) queue = [nodes[0].id];
    const visited = new Set();
    let ctx = "",
      steps = 0;
    try {
      while (queue.length && !runAbort.current && steps < 60) {
        const id = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id);
        steps++;
        const n = byId.get(id);
        if (!n) continue;
        clearActive();
        setNodeData(id, { active: true });
        const kind = n.data.kind,
          label = String(n.data.label || ""),
          outs = outOf(id);
        if (kind === "http") {
          const url = String(n.data.url || label).trim();
          let r;
          try {
            r = await (
              await fetch("/flow/http", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  method: n.data.method || "GET",
                  url,
                  body: ctx || undefined,
                }),
              })
            ).json();
          } catch (e) {
            r = { ok: false, error: e.message };
          }
          setNodeData(id, {
            ok: !!r.ok,
            result: r.ok
              ? `${r.status} ${r.statusText} · ${r.ms}ms\n\n${r.body}`
              : "ERROR: " + (r.error || r.status),
          });
          ctx = r.ok ? String(r.body || "") : "";
          outs.forEach((e) => queue.push(e.target));
        } else if (kind === "transform") {
          const pathExpr = String(n.data.expr || "").trim(); // dari field custom
          let outVal = ctx;
          try {
            const j = JSON.parse(ctx);
            outVal = pathExpr
              ? pathExpr.split(".").reduce((a, k) => (a == null ? a : a[k]), j)
              : j;
            outVal =
              typeof outVal === "string"
                ? outVal
                : JSON.stringify(outVal, null, 2);
          } catch (_) {
            /* bukan JSON → pass-through apa adanya */
          }
          ctx = String(outVal == null ? "" : outVal);
          setNodeData(id, { ok: true, result: ctx.slice(0, 4000) });
          outs.forEach((e) => queue.push(e.target));
        } else if (kind === "condition") {
          // Evaluasi: bila 'check' (kata kunci) ADA di data → true, else false.
          // Ikuti edge dari colokan yang cocok (sourceHandle "true"/"false").
          const check = String(n.data.check || "")
            .trim()
            .toLowerCase();
          const pass = check ? ctx.toLowerCase().includes(check) : true;
          const want = pass ? "true" : "false";
          const picked =
            outs.find((e) => (e.sourceHandle || "") === want) ||
            outs.find((e) => edgeLabel(e).toLowerCase() === want) ||
            outs[0];
          setNodeData(id, {
            ok: true,
            result:
              'check "' +
              (n.data.check || "") +
              '" → ' +
              (pass ? "true" : "false"),
          });
          if (picked) queue.push(picked.target);
        } else if (kind === "trigger") {
          ctx = ""; // titik mulai — payload kosong (webhook/schedule menyusul)
          setNodeData(id, {
            ok: true,
            result: "trigger · " + (n.data.trigger || "manual"),
          });
          outs.forEach((e) => queue.push(e.target));
        } else {
          // output & lainnya
          let out = ctx;
          if (n.data.format === "json") {
            try {
              out = JSON.stringify(JSON.parse(ctx), null, 2);
            } catch (_) {}
          }
          setNodeData(id, {
            ok: true,
            result: String(out).slice(0, 8000) || "(empty)",
          });
          outs.forEach((e) => queue.push(e.target));
        }
      }
    } catch (e) {
      setRunErr(e.message || "failed to run the flow");
    }
    clearActive();
    setRunning(false);
  };

  const runGraph = async () => {
    if (running) return;
    if (!nodes.length) {
      setRunErr("Canvas is empty — add a node first.");
      setTimeout(() => setRunErr(""), 4000);
      return;
    }
    setRunErr("");
    setRunning(true);
    runAbort.current = false;
    setNodes((nds) =>
      nds.map((x) => ({
        ...x,
        data: { ...x.data, active: false, ok: undefined, result: undefined },
      })),
    );
    if (integration) {
      await runGraphIntegration();
      return;
    }
    if (!runStage) {
      setRunning(false);
      return;
    }
    // #4: TRAVERSAL BERCABANG. Mulai dari node tanpa masukan; di node Condition,
    // agent MEMILIH satu cabang (cocokkan jawaban ke label edge / label node target)
    // — hanya jalur itu diikuti. Non-condition mengikuti semua edge keluar.
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const outOf = (id) => edges.filter((e) => e.source === id);
    const edgeLabel = (e) => String((e.data && e.data.label) || e.label || "");
    const indeg = new Map(nodes.map((n) => [n.id, 0]));
    edges.forEach((e) => {
      if (indeg.has(e.target)) indeg.set(e.target, indeg.get(e.target) + 1);
    });
    let queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
    if (!queue.length) queue = [nodes[0].id];
    const visited = new Set();
    let ctx = "",
      steps = 0;
    try {
      while (queue.length && !runAbort.current && steps < 60) {
        const id = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id);
        steps++;
        const n = byId.get(id);
        if (!n) continue;
        clearActive();
        setNodeData(id, { active: true });
        const kind = n.data.kind,
          label = n.data.label,
          outs = outOf(id);
        if (kind === "prompt") {
          ctx = label || "";
          outs.forEach((e) => queue.push(e.target));
          continue;
        }
        if (kind === "condition" && outs.length > 1) {
          const choices = outs.map(
            (e) =>
              edgeLabel(e) ||
              (byId.get(e.target) && byId.get(e.target).data.label) ||
              e.target,
          );
          const q =
            `Evaluate the condition: "${label}". Pick ONE branch from the list below and answer with that branch name ONLY: [${choices.join(", ")}].` +
            (ctx ? "\n\nKonteks:\n" + ctx : "");
          const r = await runStage(q, {
            kind,
            label,
            workspaceRoot: n.data.workspaceRoot,
          });
          setNodeData(id, { ok: r.ok, result: r.summary || "" });
          const ans = String(r.summary || "").toLowerCase();
          let picked = outs.find((e) => {
            const l = edgeLabel(e).toLowerCase();
            return l && ans.includes(l);
          });
          if (!picked)
            picked = outs.find((e) => {
              const t = byId.get(e.target);
              return (
                t &&
                t.data.label &&
                ans.includes(String(t.data.label).toLowerCase())
              );
            });
          if (!picked) picked = outs[0];
          ctx += `\n\n[condition] ${label} → ${edgeLabel(picked) || (byId.get(picked.target) && byId.get(picked.target).data.label) || picked.target}`;
          queue.push(picked.target);
        } else {
          const r = await runStage(buildStagePrompt(kind, label, ctx), {
            kind,
            label,
            workspaceRoot: n.data.workspaceRoot,
          });
          ctx += `\n\n[${kind}] ${label}:\n${(r.summary || "").slice(0, 700)}`;
          setNodeData(id, { ok: r.ok, result: r.summary || "" });
          outs.forEach((e) => queue.push(e.target));
        }
      }
    } catch (e) {
      setRunErr(e.message || "failed to run the graph");
    }
    clearActive();
    setRunning(false);
  };

  // #1 Simpan/muat workflow ke localStorage (bertahan lintas reload).
  const _wfStore = () => {
    try {
      return JSON.parse(localStorage.getItem("wolfspace_workflows") || "{}");
    } catch (_) {
      return {};
    }
  };
  const saveWorkflow = () => {
    const name = (
      window.prompt(
        "Save workflow as:",
        "wf-" + new Date().toISOString().slice(0, 10),
      ) || ""
    ).trim();
    if (!name) return;
    const all = _wfStore();
    all[name] = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type || "wf",
        position: n.position,
        data: {
          label: n.data.label,
          kind: n.data.kind,
          accent: n.data.accent,
          workspaceRoot: n.data.workspaceRoot,
          method: n.data.method,
          url: n.data.url,
          expr: n.data.expr,
          check: n.data.check,
          trigger: n.data.trigger,
          format: n.data.format,
          schedule: n.data.schedule,
        },
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "wf",
        label: e.label,
      })),
    };
    try {
      localStorage.setItem("wolfspace_workflows", JSON.stringify(all));
      setSavedList(Object.keys(all));
    } catch (_) {}
  };
  const loadWorkflow = (name) => {
    const wf = _wfStore()[name];
    if (!wf) return;
    setNodes(wf.nodes);
    setEdges(wf.edges);
    setShowLoad(false);
    setTimeout(() => {
      try {
        rf.fitView({ duration: 300, padding: 0.2 });
      } catch (_) {}
    }, 60);
  };
  const deleteWorkflow = (name) => {
    const all = _wfStore();
    delete all[name];
    try {
      localStorage.setItem("wolfspace_workflows", JSON.stringify(all));
      setSavedList(Object.keys(all));
    } catch (_) {}
  };

  // #3 Auto-layout dengan dagre (aset sudah di-vendor: window.RFLib.dagre).
  const autoLayout = () => {
    const dagre = window.RFLib && window.RFLib.dagre;
    if (!dagre || !nodes.length) return;
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "LR", nodesep: 42, ranksep: 96 });
    g.setDefaultEdgeLabel(() => ({}));
    const W = 168,
      H = 62;
    nodes.forEach((n) => g.setNode(n.id, { width: W, height: H }));
    edges.forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);
    setNodes((nds) =>
      nds.map((n) => {
        const p = g.node(n.id);
        return p ? { ...n, position: { x: p.x - W / 2, y: p.y - H / 2 } } : n;
      }),
    );
    setTimeout(() => {
      try {
        rf.fitView({ duration: 300, padding: 0.2 });
      } catch (_) {}
    }, 60);
  };

  // ── Quick wins: undo, duplikat/hapus per-node (toolbar), copy-paste ──────────
  const historyRef = React.useRef([]);
  const clipboardRef = React.useRef(null);
  const snapshot = () => {
    try {
      historyRef.current.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      });
      if (historyRef.current.length > 40) historyRef.current.shift();
    } catch (_) {}
  };
  const undo = () => {
    const h = historyRef.current.pop();
    if (h) {
      setNodes(h.nodes);
      setEdges(h.edges);
    }
  };
  const duplicateNode = (nid) => {
    const n = nodes.find((x) => x.id === nid);
    if (!n) return;
    snapshot();
    const id2 = "n" + idRef.current++;
    setNodes((nds) =>
      nds
        .map((x) => ({ ...x, selected: false }))
        .concat({
          ...n,
          id: id2,
          position: { x: n.position.x + 44, y: n.position.y + 44 },
          selected: true,
          data: { ...n.data, active: false, ok: undefined, result: undefined },
        }),
    );
  };
  const deleteNode = (nid) => {
    snapshot();
    setNodes((nds) => nds.filter((x) => x.id !== nid));
    setEdges((eds) => eds.filter((e) => e.source !== nid && e.target !== nid));
  };
  const copySelected = () => {
    const sel = nodes.filter((n) => n.selected);
    if (sel.length) {
      try {
        clipboardRef.current = JSON.parse(JSON.stringify(sel));
      } catch (_) {}
    }
  };
  const pasteClipboard = () => {
    const cb = clipboardRef.current;
    if (!cb || !cb.length) return;
    snapshot();
    const clones = cb.map((n) => ({
      ...n,
      id: "n" + idRef.current++,
      position: { x: n.position.x + 50, y: n.position.y + 50 },
      selected: true,
      data: { ...n.data, active: false, ok: undefined, result: undefined },
    }));
    setNodes((nds) =>
      nds.map((n) => ({ ...n, selected: false })).concat(clones),
    );
  };
  React.useEffect(() => {
    if (isLive) return;
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (
        /INPUT|TEXTAREA|SELECT/.test(tag) ||
        (e.target && e.target.isContentEditable)
      )
        return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "c") copySelected();
      else if ((e.ctrlKey || e.metaKey) && k === "v") {
        e.preventDefault();
        pasteClipboard();
      } else if ((e.ctrlKey || e.metaKey) && k === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLive, nodes, edges]);

  const wf = {
    nodes: nodes.map((n) => ({
      id: n.id,
      kind: n.data.kind,
      label: n.data.label,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    })),
    edges: edges.map((e) => ({ from: e.source, to: e.target })),
  };
  const btn = {
    fontFamily: "ui-monospace, monospace",
    fontSize: "11px",
    color: "#dce4f0",
    background: "#131922",
    border: "1px solid #2f4056",
    borderRadius: "6px",
    padding: "6px 9px",
    cursor: "pointer",
  };

  const shownNodes = isLive ? liveNodes : nodes;
  const shownEdges = isLive ? liveEdges : edges;

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        width: "100%",
        background: "#0d1117",
      }}
    >
      {!sidebarOpen && (
        <div
          style={{
            position: "absolute",
            left: "14px",
            top: "14px",
            zIndex: 10,
            display: "flex",
            gap: "8px",
          }}
        >
          <button
            onClick={onBack}
            title="Back to chat"
            style={{
              ...btn,
              padding: "3px 8px",
              background: "rgba(19,25,34,.82)",
            }}
          >
            ←
          </button>
          <button
            onClick={() => setSidebarOpen(true)}
            title="Tampilkan Nodes"
            style={{
              ...btn,
              padding: "3px 8px",
              background: "rgba(19,25,34,.82)",
            }}
          >
            ☰ Nodes
          </button>
        </div>
      )}
      {sidebarOpen && (
        <div
          style={{
            width: "158px",
            flexShrink: 0,
            borderRight: "1px solid #212a36",
            background: "#0c1219",
            padding: "12px 10px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            zIndex: 5,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "2px",
            }}
          >
            <button
              onClick={onBack}
              title="Back to chat"
              style={{ ...btn, padding: "3px 8px" }}
            >
              ←
            </button>
            <span
              style={{
                fontSize: "10px",
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: "#6f7d92",
                fontFamily: "ui-monospace, monospace",
                flex: 1,
              }}
            >
              {isLive ? "Live" : "Nodes"}
            </span>
            <button
              className="btn-reset"
              onClick={() => setSidebarOpen(false)}
              title="Sembunyikan"
              style={{
                color: "#6f7d92",
              }}
            >
              ✕
            </button>
          </div>
          {isLive ? (
            <div
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "11px",
                color: "#8fb3ff",
                lineHeight: 1.6,
                background: "#0f1620",
                border: "1px solid #212a36",
                borderRadius: "7px",
                padding: "8px 9px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#3fb950",
                    boxShadow: "0 0 6px #3fb950",
                  }}
                />
                cermin eksekusi agent
              </div>
              <div style={{ color: "#6f7d92", marginTop: "5px" }}>
                {liveNodes.length ? "active graph structure" : "waiting…"}
              </div>
              <div style={{ color: "#6f7d92", marginTop: "3px" }}>
                Run the agent in chat — its steps will appear here.
              </div>
            </div>
          ) : (
            (integration ? INTEGRATION_PALETTE : WF_PALETTE).map((it) => (
              <div
                key={it.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/wf", JSON.stringify(it));
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDoubleClick={() =>
                  addNode(it, window.innerWidth / 2, window.innerHeight / 2)
                }
                title={it.desc + " — drag onto the canvas or double-click"}
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "12px",
                  color: "#dce4f0",
                  background: "#131922",
                  border: "1px solid #212a36",
                  borderLeft: "3px solid " + it.accent,
                  borderRadius: "7px",
                  padding: "7px 9px",
                  cursor: "grab",
                  userSelect: "none",
                }}
              >
                {it.label}
              </div>
            ))
          )}
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            {!integration && (
              <button
                style={{
                  ...btn,
                  borderColor: isLive ? "#3fb95088" : "#2f4056",
                }}
                onClick={() =>
                  setMode((m) => (m === "live" ? "builder" : "live"))
                }
                title="Switch between the manual canvas and the agent execution mirror"
              >
                Mode: {isLive ? "Live" : "Builder"}
              </button>
            )}
            {!isLive && (
              <React.Fragment>
                <button
                  style={{
                    ...btn,
                    background: running ? "#21262d" : "#132a1c",
                    borderColor: running ? "#2f4056" : "#2e6b3f",
                    color: running ? "#8b949e" : "#7ee2a8",
                    fontWeight: 600,
                  }}
                  onClick={() =>
                    running ? (runAbort.current = true) : runGraph()
                  }
                  title="Compile the graph → run nodes in order as an agent pipeline"
                >
                  {running ? "■ Hentikan" : "▶ Run graph"}
                </button>
                {runErr && (
                  <div
                    style={{
                      fontSize: "10.5px",
                      color: "#f0776b",
                      lineHeight: 1.4,
                    }}
                  >
                    {runErr}
                  </div>
                )}
                <button
                  style={btn}
                  onClick={autoLayout}
                  title="Rapikan tata letak otomatis (dagre)"
                >
                  ⇄ Rapikan
                </button>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    style={{ ...btn, flex: 1 }}
                    onClick={saveWorkflow}
                    title="Save this workflow"
                  >
                    💾 Save
                  </button>
                  <button
                    style={{ ...btn, flex: 1 }}
                    onClick={() => setShowLoad((s) => !s)}
                    title="Load a saved workflow"
                    disabled={!savedList.length}
                  >
                    📂 Muat
                  </button>
                </div>
                {showLoad && (
                  <div
                    style={{
                      background: "#0d1117",
                      border: "1px solid #212a36",
                      borderRadius: "7px",
                      maxHeight: "160px",
                      overflowY: "auto",
                    }}
                  >
                    {savedList.length === 0 ? (
                      <div
                        style={{
                          padding: "8px",
                          fontSize: "11px",
                          color: "#6f7d92",
                        }}
                      >
                        nothing saved yet
                      </div>
                    ) : (
                      savedList.map((nm) => (
                        <div
                          key={nm}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "5px 7px",
                            fontSize: "11.5px",
                          }}
                        >
                          <span
                            onClick={() => loadWorkflow(nm)}
                            style={{
                              flex: 1,
                              cursor: "pointer",
                              color: "#dce4f0",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title="click: load"
                          >
                            {nm}
                          </span>
                          <button
                            className="btn-reset"
                            onClick={() => deleteWorkflow(nm)}
                            title="delete"
                            style={{
                              color: "#f0776b",
                              fontSize: "11px",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
                <button style={btn} onClick={() => setShowJson((s) => !s)}>
                  {showJson ? "Close JSON" : "Export JSON"}
                </button>
              </React.Fragment>
            )}
            <button
              style={btn}
              onClick={() => {
                if (isLive) {
                  setLiveNodes([]);
                  setLiveEdges([]);
                  liveRef.current = {
                    steps: {
                      planner: [],
                      executor: [],
                      tools: [],
                      validate: [],
                    },
                  };
                } else {
                  setNodes([]);
                  setEdges([]);
                }
              }}
            >
              Bersihkan
            </button>
          </div>
        </div>
      )}
      <div
        style={{ flex: 1, position: "relative" }}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        <style>{"@keyframes wfflow{to{stroke-dashoffset:-22}}"}</style>
        <WFNodeCtx.Provider
          value={{
            setNodes,
            editable: !isLive,
            openDetail: setDetailNode,
            duplicateNode,
            deleteNode,
          }}
        >
          <ReactFlow
            nodes={shownNodes}
            edges={shownEdges}
            onNodesChange={isLive ? liveOnNodesChange : onNodesChange}
            onEdgesChange={isLive ? noop : onEdgesChange}
            onConnect={isLive ? noop : onConnect}
            onEdgeDoubleClick={
              isLive
                ? undefined
                : (ev, edge) => {
                    const cur =
                      (edge.data && edge.data.label) || edge.label || "";
                    const l = window.prompt(
                      "Edge label (e.g. condition branch 'yes'/'no'):",
                      cur,
                    );
                    if (l !== null)
                      setEdges((eds) =>
                        eds.map((x) =>
                          x.id === edge.id
                            ? {
                                ...x,
                                data: { ...x.data, label: l.trim() },
                                label: undefined,
                              }
                            : x,
                        ),
                      );
                  }
            }
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: "wf" }}
            colorMode="dark"
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <WFDiagonalBackground gap={26} lineWidth={1} color="#1c2a3a" />
            {integration && XY.MiniMap && (
              <XY.MiniMap
                pannable
                zoomable
                nodeColor={(n) => (n.data && n.data.accent) || "#8fb3ff"}
                maskColor="rgba(12,18,25,.72)"
                style={{
                  background: "#0c1219",
                  border: "1px solid #212a36",
                  borderRadius: "8px",
                }}
                onNodeClick={(ev, node) => setDetailNode(node.data)}
              />
            )}
          </ReactFlow>
        </WFNodeCtx.Provider>
        {/* Kontrol custom WOLFSPACE (ganti <Controls> bawaan) */}
        <div
          style={{
            position: "absolute",
            right: "14px",
            bottom: "14px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            zIndex: 5,
          }}
        >
          {[
            ["＋", () => rf.zoomIn({ duration: 150 }), "Perbesar"],
            ["－", () => rf.zoomOut({ duration: 150 }), "Perkecil"],
            [
              "⤢",
              () => rf.fitView({ duration: 300, padding: 0.2 }),
              "Fit to screen",
            ],
          ].map(([lbl, fn, t]) => (
            <button
              key={t}
              onClick={fn}
              title={t}
              style={{
                width: "30px",
                height: "30px",
                borderRadius: "7px",
                border: "1px solid #212a36",
                background: "#131922",
                color: "#8fb3ff",
                cursor: "pointer",
                fontSize: "15px",
                lineHeight: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#1a2430")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "#131922")
              }
            >
              {lbl}
            </button>
          ))}
        </div>
        {showJson && !isLive && (
          <pre
            style={{
              position: "absolute",
              right: "14px",
              top: "14px",
              maxHeight: "60%",
              maxWidth: "340px",
              overflow: "auto",
              margin: 0,
              fontFamily: "ui-monospace, monospace",
              fontSize: "11px",
              lineHeight: 1.5,
              color: "#9fb7d9",
              background: "#0c1219",
              border: "1px solid #212a36",
              borderRadius: "8px",
              padding: "10px 12px",
            }}
          >
            {JSON.stringify(wf, null, 2)}
          </pre>
        )}
        {/* #2: panel detail hasil node (klik cuplikan hasil di kartu) */}
        {detailNode && (
          <div
            style={{
              position: "absolute",
              right: "14px",
              top: "14px",
              height: "500px",
              width: "400px",
              minWidth: "300px",
              minHeight: "200px",
              resize: "both",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              background: "#0c1219",
              border: "1px solid " + (detailNode.accent || "#2f4056"),
              borderRadius: "9px",
              boxShadow: "0 12px 36px rgba(0,0,0,.6)",
              zIndex: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "9px 12px",
                borderBottom: "1px solid #212a36",
              }}
            >
              <span
                style={{
                  fontSize: "9px",
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  color: detailNode.accent || "#8fb3ff",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {detailNode.kind}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: "#dce4f0",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {detailNode.label}
              </span>
              <button
                className="btn-reset"
                onClick={() => setDetailNode(null)}
                style={{
                  color: "#8b949e",
                  fontSize: "14px",
                }}
              >
                ✕
              </button>
            </div>
            {(() => {
              const resStr = String(detailNode.result);
              const htmlMatch = resStr.match(
                /(?:[a-zA-Z]:\\[^\n]+|\/[^\n]+|[a-zA-Z0-9_.-]+)\.html/,
              );
              return (
                <>
                  <div
                    style={{
                      padding: "10px 12px",
                      overflowY: "auto",
                      fontSize: "12px",
                      lineHeight: 1.55,
                      color: "#c7d4e3",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {resStr}
                  </div>
                  {htmlMatch && (
                    <div
                      style={{
                        flex: 1,
                        minHeight: "300px",
                        padding: "10px",
                        borderTop: "1px solid #212a36",
                        background: "#fff",
                      }}
                    >
                      {(() => {
                        let targetPath = htmlMatch[0];
                        if (
                          !targetPath.match(/^[a-zA-Z]:\\/) &&
                          !targetPath.startsWith("/")
                        ) {
                          try {
                            const root = workspaceRoot;
                            if (root) {
                              targetPath =
                                root.replace(/\\/g, "/") + "/" + targetPath;
                            }
                          } catch (e) {}
                        }
                        return (
                          <iframe
                            src={
                              "/preview-file?path=" +
                              encodeURIComponent(targetPath)
                            }
                            style={{
                              width: "100%",
                              height: "100%",
                              border: "none",
                            }}
                            title="Preview HTML"
                          />
                        );
                      })()}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkflowBuilder({ onBack, runStage, integration, workspaceRoot }) {
  const XY = window.RFLib && window.RFLib.XY;
  if (!XY || !XY.ReactFlow || !XY.ReactFlowProvider) {
    return (
      <div
        style={{
          padding: "40px",
          color: "#6f7d92",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        React Flow failed to load (window.RFLib.XY unavailable).
      </div>
    );
  }
  const { ReactFlowProvider } = XY;
  return (
    <ReactFlowProvider>
      <WorkflowBuilderInner
        onBack={onBack}
        runStage={runStage}
        integration={integration}
        workspaceRoot={workspaceRoot}
      />
    </ReactFlowProvider>
  );
}

/* ============================================================
   Agent Runner View
   ============================================================ */
