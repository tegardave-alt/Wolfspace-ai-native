// Views — extracted from Components.tsx (the app.tsx split). Prepended via
// APP_MODULES.

/** One saved conversation as kept in the chat history. */
interface ObrolanTersimpan {
  id?: string | number;
  title?: string;
  project?: string;
  savedAt?: string | number;
  [k: string]: unknown;
}

/* ----------------------------- History (full page) ----------------------------- */
function HistoryView({
  savedChats = [],
  onSelect,
  onDelete,
}: {
  savedChats?: ObrolanTersimpan[];
  onSelect: (chat: ObrolanTersimpan) => void;
  onDelete: (id: unknown) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const formatTimeAgo = (ts?: string | number) => {
    if (!ts) return "now";
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return "now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
    return `${Math.floor(diff / 2592000)}mo`;
  };

  const filteredChats = savedChats
    .slice()
    .reverse()
    .filter((c) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const title = (c.title || "").toLowerCase();
      const proj = (c.project || "").toLowerCase();
      return title.includes(q) || proj.includes(q);
    });

  return (
    // .hub / .hub-header / .hub-body is the layout every hub page is meant to
    // have; SettingsView already had it and this one did not. Two things ride
    // on that header, and neither is visible on its own:
    //
    //   1. `.app.sb-sembunyi .hub-header` is what reserves 58px for the
    //      floating sidebar toggle. With no header, nothing on this page knew
    //      the button was there.
    //   2. `.tb-spacer` IS the window's drag handle. With no header there was
    //      no drag region at all, so the window could not be moved while this
    //      page was open.
    //
    // Both are inherited from the shared classes now rather than restated
    // here, so the next page that copies this structure gets them too.
    <div className="hub">
      <header className="hub-header">
        <span className="tb-divider" />
        <div className="hub-title-group">
          <span
            className="hub-hf-mark"
            style={{ background: "rgba(167,139,250,.14)", color: "#a78bfa" }}
          >
            {SB.history({ width: 16, height: 16 })}
          </span>
          <span className="hub-title">Conversation History</span>
        </div>
        {/* Drag handle. Same element, same reason, as in the top bar. */}
        <div className="tb-spacer" />
      </header>
      <div className="hub-body">
        <div
          style={{
            maxWidth: "920px",
            margin: "0 auto",
            width: "100%",
            color: "#e2e8f0",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              marginBottom: "32px",
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                background: "#181b20",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                padding: "10px 16px",
                gap: "10px",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6b7280"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e: any) => setSearchQuery(e.target.value)}
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#e2e8f0",
                  fontSize: "14px",
                  width: "100%",
                  fontFamily: "inherit",
                }}
              />
            </div>
          </div>

          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.8px",
              color: "#6b7280",
              textTransform: "uppercase",
              marginBottom: "12px",
            }}
          >
            ALL CONVERSATIONS
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {filteredChats.length === 0 ? (
              <div
                style={{
                  padding: "40px 0",
                  textAlign: "center",
                  color: "#6b7280",
                  fontSize: "14px",
                }}
              >
                No saved conversation history yet.
              </div>
            ) : (
              filteredChats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => onSelect(chat)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "16px 12px",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                    cursor: "pointer",
                    borderRadius: "8px",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e: any) =>
                    (e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.02)")
                  }
                  onMouseLeave={(e: any) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "15px",
                        fontWeight: 500,
                        color: "#e2e8f0",
                      }}
                    >
                      {chat.title || "Chat"}
                    </div>
                    <div style={{ fontSize: "13px", color: "#6b7280" }}>
                      {chat.project || "WOLFSPACE"}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                    }}
                  >
                    <span style={{ fontSize: "13px", color: "#6b7280" }}>
                      {formatTimeAgo(chat.savedAt)}
                    </span>
                    <button
                      className="btn-reset"
                      title="Delete"
                      onClick={(e: any) => {
                        e.stopPropagation();
                        onDelete(chat.id);
                      }}
                      style={{
                        color: "#6b7280",
                        fontSize: "16px",
                        padding: "4px 8px",
                        borderRadius: "4px",
                      }}
                      onMouseEnter={(e: any) => {
                        e.currentTarget.style.color = "#ef4444";
                        e.currentTarget.style.background =
                          "rgba(239, 68, 68, 0.1)";
                      }}
                      onMouseLeave={(e: any) => {
                        e.currentTarget.style.color = "#6b7280";
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Settings (full page) ----------------------------- */
function SettingsView({
  onBack,
  onSaved,
  onCloudChanged,
}: {
  onBack: () => void;
  onSaved: () => void;
  onCloudChanged: () => void;
}) {
  const tersimpan = getCloud();
  // AN AUTOMATIC ENTRY IS NOT A CHOICE, so this screen does not present it as
  // one. loadModels() in app.tsx hydrates a provider from whatever the SERVER
  // holds keys for, and marks it `otomatis` — see the comment there for why it
  // has to be written at all.
  //
  // Reading it back as if the user had picked it is what made a clean install
  // look pre-configured: a provider and a model on screen, no key beside them,
  // and no way to tell it apart from something typed in by hand.
  const stored = tersimpan && tersimpan.otomatis ? null : tersimpan;
  const [key, setKey] = useState("");
  const [provider, setProvider] = useState(
    stored ? (stored.baseUrl ? "custom" : stored.provider) : "auto",
  );
  const [model, setModelName] = useState(
    stored ? (keyish(stored.model) ? "" : stored.model) : "",
  );
  const [baseUrl, setBaseUrl] = useState(stored ? stored.baseUrl || "" : "");
  const [hint, setHint] = useState(
    stored
      ? "Provider " +
          stored.provider +
          " � " +
          (stored.key ? stored.key.slice(-4) : "server") +
          " � active"
      : tersimpan && tersimpan.otomatis
        ? "Using " +
          (tersimpan.name || tersimpan.provider) +
          " from a key stored on the server. Paste your own key to override it."
        : "Paste an API key, then auto-detect or pick a provider.",
  );

  const detect = async () => {
    const k = key.trim() || (stored && stored.key);
    if (!k) {
      setHint("Paste an API key first.");
      return;
    }
    setHint("Detecting provider…");
    try {
      const d = await (
        await fetch("/detect-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: k }),
        })
      ).json();
      if (PROVIDER_LABELS[d.provider]) setProvider(d.provider);
      setHint(
        d.verified
          ? "Verified: " + d.name
          : "Guess: " + d.name + " (unverified)",
      );
    } catch (e) {
      setHint("Detection failed: " + (e as Error).message);
    }
  };
  const save = () => {
    const k = key.trim() || (stored && stored.key);
    if (!k) {
      setHint("Paste an API key first.");
      return;
    }
    let prov: string;
    let name: string | undefined;
    let bu: string | undefined;
    if (provider === "auto") {
      const d = detectPrefix(k);
      // detectPrefix returns null only for an empty key, and k is non-empty by
      // the guard above. Stated explicitly so the narrowing is visible.
      prov = d ? d.provider : "openai";
      name = d ? d.name : "OpenAI";
    } else if (provider === "custom" || provider === "cloudflare") {
      // provider comes from a <select> whose options are PROVIDER_OPTS, so it is
      // always a string here; useState typed it as string | undefined because its
      // initialiser reads stored.provider.
      prov = provider ?? "openai";
      name = PROVIDER_LABELS[prov];
      bu = baseUrl.trim();
      if (!bu) {
        setHint(
          "Enter the Base URL for " +
            (provider === "cloudflare"
              ? "Cloudflare Worker"
              : "a custom provider") +
            ".",
        );
        return;
      }
    } else {
      prov = provider ?? "openai";
      name = PROVIDER_LABELS[prov];
    }
    let mdl = (model ?? "").trim();
    if (stored && stored.provider !== prov) mdl = "";
    if (!mdl || keyish(mdl)) mdl = CLOUD_DEFAULT[prov] || "gpt-4o";
    setCloudLS({ key: k, provider: prov, name, model: mdl, baseUrl: bu });
    // mirror to the server so the backend agent loop can use it autonomously
    fetch("/cloud-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: k, provider: prov, model: mdl, baseUrl: bu }),
    })
      .then((r) => r.json())
      .then(() =>
        setHint(
          "Saved in the browser and on the server: " +
            prov +
            " � " +
            k.slice(-4) +
            " ? " +
            mdl,
        ),
      )
      .catch(() =>
        setHint(
          "Saved in the browser: " + prov + " � " + k.slice(-4) + " ? " + mdl,
        ),
      );
    onSaved();
    onCloudChanged(); // Trigger model list reload
  };
  const clear = () => {
    setCloudLS(null);
    setKey("");
    setModelName("");
    setBaseUrl("");
    setProvider("auto");
    setHint("API key configuration deleted.");
    onSaved();
    onCloudChanged();
  };

  return (
    <div className="hub">
      <header className="hub-header">
        <span className="tb-divider" />
        <div className="hub-title-group">
          <span
            className="hub-hf-mark"
            style={{ background: "rgba(94,234,212,.14)", color: "#5eead4" }}
          >
            {SB.key({ width: 16, height: 16 })}
          </span>
          <span className="hub-title">API Settings</span>
        </div>
        <div className="tb-spacer" />
      </header>
      <div className="hub-body">
        <div className="hub-inner settings-inner">
          <div className="settings-card">
            <div className="field">
              <label className="field-label">API Key Cloud</label>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={key}
                onChange={(e: any) => setKey(e.target.value)}
                placeholder={
                  stored
                    ? "Key saved (… " +
                      (stored.key ? stored.key.slice(-4) : "server") +
                      ") - leave empty to keep the existing key"
                    : "Paste your API key here"
                }
              />
            </div>
            <button className="btn btn-ghost" onClick={detect}>
              Detect provider from key
            </button>
            <div className="field">
              <label className="field-label">Provider</label>
              <div className="select-wrap">
                <select
                  value={provider}
                  onChange={(e: any) => setProvider(e.target.value)}
                >
                  <option value="auto">Auto-detect</option>
                  {PROVIDER_OPTS.filter((p) => p !== "auto").map((p) => (
                    <option key={p} value={p}>
                      {p === "custom"
                        ? "OpenAI-compatible (URL custom)"
                        : PROVIDER_LABELS[p]}
                    </option>
                  ))}
                </select>
                <Icon.chev className="chev" style={{ width: 15, height: 15 }} />
              </div>
            </div>
            {(provider === "custom" || provider === "cloudflare") && (
              <div className="field">
                <label className="field-label">Base URL</label>
                <input
                  className="input"
                  value={baseUrl}
                  onChange={(e: any) => setBaseUrl(e.target.value)}
                  placeholder={
                    provider === "cloudflare"
                      ? "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1"
                      : "https://host/v1"
                  }
                />
              </div>
            )}
            <div className="field">
              <label className="field-label">Model</label>
              <input
                className="input"
                value={model}
                onChange={(e: any) => setModelName(e.target.value)}
                placeholder="Optional, e.g. qwen, coder, gpt-4o"
              />
            </div>
            <div className="provider-status">
              <span className="status-dot" />
              {hint}
            </div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={save}>
                <Icon.check style={{ width: 14, height: 14 }} /> Save
              </button>
              <button className="btn btn-danger" onClick={clear}>
                Delete configuration
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
