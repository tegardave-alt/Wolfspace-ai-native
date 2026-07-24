// Views — diekstrak dari Components.jsx (app.jsx split). Prepend via APP_MODULES.

/* ----------------------------- History (full page) ----------------------------- */
function HistoryView({ savedChats = [], onSelect, onDelete }) {
  const [searchQuery, setSearchQuery] = useState("");

  const formatTimeAgo = (ts) => {
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
    <div style={{ padding: "40px 60px", maxWidth: "920px", margin: "0 auto", width: "100%", color: "#e2e8f0" }}>
      <h1 style={{ fontSize: "20px", fontWeight: 600, color: "#f3f4f6", marginBottom: "24px" }}>
        Conversation History
      </h1>

      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "32px" }}>
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
          <div style={{ padding: "40px 0", textAlign: "center", color: "#6b7280", fontSize: "14px" }}>
            Belum ada riwayat percakapan yang tersimpan.
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
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ fontSize: "15px", fontWeight: 500, color: "#e2e8f0" }}>
                  {chat.title || "Chat"}
                </div>
                <div style={{ fontSize: "13px", color: "#6b7280" }}>
                  {chat.project || "WOLFSPACE"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <span style={{ fontSize: "13px", color: "#6b7280" }}>
                  {formatTimeAgo(chat.savedAt)}
                </span>
                <button
                  title="Hapus"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(chat.id);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#6b7280",
                    cursor: "pointer",
                    fontSize: "16px",
                    padding: "4px 8px",
                    borderRadius: "4px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#ef4444";
                    e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                  }}
                  onMouseLeave={(e) => {
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
  );
}

/* ----------------------------- Settings (full page) ----------------------------- */
function SettingsView({ onBack, onSaved, onCloudChanged }) {
  const stored = getCloud();
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
          " � aktif"
      : "Tempel API key, lalu deteksi otomatis atau pilih provider.",
  );

  const detect = async () => {
    const k = key.trim() || (stored && stored.key);
    if (!k) {
      setHint("Tempel API key terlebih dahulu.");
      return;
    }
    setHint("Sedang mendeteksi provider...");
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
          ? "Terverifikasi: " + d.name
          : "Tebakan: " + d.name + " (belum terverifikasi)",
      );
    } catch (e) {
      setHint("Deteksi belum berhasil: " + e.message);
    }
  };
  const save = () => {
    const k = key.trim() || (stored && stored.key);
    if (!k) {
      setHint("Tempel API key terlebih dahulu.");
      return;
    }
    let prov, name, bu;
    if (provider === "auto") {
      const d = detectPrefix(k);
      prov = d.provider;
      name = d.name;
    } else if (provider === "custom" || provider === "cloudflare") {
      prov = provider;
      name = PROVIDER_LABELS[provider];
      bu = baseUrl.trim();
      if (!bu) {
        setHint("Isi Base URL untuk " + (provider === "cloudflare" ? "Cloudflare Worker" : "provider custom") + ".");
        return;
      }
    } else {
      prov = provider;
      name = PROVIDER_LABELS[provider];
    }
    let mdl = model.trim();
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
          "Tersimpan di browser dan server: " +
            prov +
            " � " +
            k.slice(-4) +
            " ? " +
            mdl,
        ),
      )
      .catch(() =>
        setHint(
          "Tersimpan di browser: " + prov + " � " + k.slice(-4) + " ? " + mdl,
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
    setHint("Konfigurasi API key sudah dihapus.");
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
          <span className="hub-title">Pengaturan API</span>
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
                onChange={(e) => setKey(e.target.value)}
                placeholder={
                  stored
                    ? "Key tersimpan (... " +
                      (stored.key ? stored.key.slice(-4) : "server") +
                      ") - kosongkan untuk tetap memakai key lama"
                    : "Tempel API key di sini"
                }
              />
            </div>
            <button className="btn btn-ghost" onClick={detect}>
              Deteksi provider dari key
            </button>
            <div className="field">
              <label className="field-label">Provider</label>
              <div className="select-wrap">
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="auto">Deteksi otomatis</option>
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
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={provider === "cloudflare" ? "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1" : "https://host/v1"}
              />
            </div>
          )}
            <div className="field">
              <label className="field-label">Model</label>
              <input
                className="input"
                value={model}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="Opsional, misalnya qwen, coder, gpt-4o"
              />
            </div>
            <div className="provider-status">
              <span className="status-dot" />
              {hint}
            </div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={save}>
                <Icon.check style={{ width: 14, height: 14 }} /> Simpan
              </button>
              <button className="btn btn-danger" onClick={clear}>
                Hapus konfigurasi
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
