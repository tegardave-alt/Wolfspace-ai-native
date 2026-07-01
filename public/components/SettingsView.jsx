// SettingsView Component - API Key configuration
(function() {
  const { useState } = React;
  const { Icon } = window.Quantum.Icons;
  const { getCloud, setCloudLS, keyish, detectPrefix } = window.Quantum.API;

  const CLOUD_DEFAULT = {
    anthropic: "claude",
    openai: "gpt-4o",
    openrouter: "anthropic/claude-opus-4-8",
    groq: "llama",
    qwen: "qwen",
    deepseek: "chat",
    github: "gpt-4o",
    gemini: "gemini-2.0-flash",
    nvidia: "nvidia/nemotron-3-super-120b-a12b",
    opencode: "deepseek-v4-flash-free",
    puter: "claude-sonnet-4",
    cloudflare: "@cf/meta/llama-3.1-8b-instruct",
    custom: "gpt-4o",
  };

  const PROVIDER_LABELS = {
    openai: "OpenAI",
    qwen: "Qwen",
    groq: "Groq",
    openrouter: "OpenRouter",
    anthropic: "Claude",
    deepseek: "DeepSeek",
    github: "GitHub Models",
    gemini: "Gemini",
    nvidia: "NVIDIA",
    opencode: "OpenCode",
    puter: "Puter",
    cloudflare: "Cloudflare Worker",
    custom: "Custom",
  };

  const PROVIDER_OPTS = [
    "auto",
    "openai",
    "qwen",
    "deepseek",
    "github",
    "groq",
    "openrouter",
    "anthropic",
    "gemini",
    "nvidia",
    "opencode",
    "puter",
    "cloudflare",
    "custom",
  ];

  // Simple key icon
  const SB = {
    key: (p) => (
      <svg viewBox="0 0 24 24" fill="none" {...p}>
        <path
          d="M15 7a4 4 0 11-4 4H7l-4 4v4h4l4-4h4a4 4 0 014-4V7z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  };

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
        ? "provider " +
            stored.provider +
            " ·" +
            (stored.key ? stored.key.slice(-4) : "server") +
            " · aktif"
        : "Tempel API key, lalu Deteksi atau pilih provider.",
    );

    const detect = async () => {
      const k = key.trim() || (stored && stored.key);
      if (!k) {
        setHint("Tempel API key dulu.");
        return;
      }
      setHint("🔍 Mendeteksi…");
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
            ? "✓ Terverifikasi: " + d.name
            : "Tebakan: " + d.name + " (belum terverifikasi)",
        );
      } catch (e) {
        setHint("Deteksi gagal: " + e.message);
      }
    };

    const save = () => {
      const k = key.trim() || (stored && stored.key);
      if (!k) {
        setHint("API key kosong.");
        return;
      }
      let prov, name, bu = "";
      if (provider === "auto") {
        const d = detectPrefix(k);
        if (!d) {
          setHint("Provider tidak terdeteksi.");
          return;
        }
        prov = d.provider;
        name = d.name;
      } else if (provider === "custom" || provider === "cloudflare") {
        prov = provider;
        name = PROVIDER_LABELS[provider];
        bu = baseUrl.trim();
        if (!bu) {
          setHint("Isi Base URL untuk " + (provider === "cloudflare" ? "Cloudflare Worker" : "custom") + ".");
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
      fetch("/cloud-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: k, provider: prov, model: mdl, baseUrl: bu }),
      })
        .then((r) => r.json())
        .then(() =>
          setHint(
            "Tersimpan (browser + server): " +
              prov +
              " ·" +
              k.slice(-4) +
              " → " +
              mdl,
          ),
        )
        .catch(() =>
          setHint(
            "Tersimpan di browser: " + prov + " ·" + k.slice(-4) + " → " + mdl,
          ),
        );
      onSaved();
      onCloudChanged();
    };

    const clear = () => {
      setCloudLS(null);
      setKey("");
      setModelName("");
      setBaseUrl("");
      setProvider("auto");
      setHint("Dihapus.");
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
            <span className="hub-title">API Key</span>
          </div>
          <div className="tb-spacer" />
        </header>
        <div className="hub-body">
          <div className="hub-inner settings-inner">
            <div className="settings-card">
              <div className="field">
                <label className="field-label">Cloud API Key</label>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={
                    stored
                      ? "••••" + stored.key.slice(-4) + " (kosongkan untuk pakai yang lama)"
                      : "sk-… / gsk_… / AIza…"
                  }
                />
              </div>
              <div className="field">
                <label className="field-label">Provider</label>
                <div className="select-wrap">
                  <select
                    className="input"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                  >
                    {PROVIDER_OPTS.map((p) => (
                      <option key={p} value={p}>
                        {p === "auto"
                          ? "Auto-detect"
                          : p === "custom"
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
                  placeholder="opsional — mis. qwen, coder, gpt-4o"
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
                  Hapus
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Export to global namespace
  window.Quantum.Components.SettingsView = SettingsView;
})();
