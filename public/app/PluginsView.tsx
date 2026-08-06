// Plugins — halaman penuh. STATIS untuk sekarang.
//
// Belum ada backend, belum ada pemasangan sungguhan: daftar di bawah sengaja
// hardcoded supaya bentuk dan rasanya bisa dinilai lebih dulu.
//
// Dua keputusan sengaja TERLIHAT di permukaan ini, bukan hanya di kode:
//
//   1. Tombol Install milik USER. Di VS Code tak ada agent yang bisa memasang
//      extension sendiri; WOLFSPACE punya, jadi pemisahan "siapa memasang" vs
//      "apa yang boleh dijangkau agent" harus kelihatan di UI juga.
//   2. Tiap plugin memajang IZIN yang dimintanya. Izin inilah yang nanti jadi
//      kosakata genesis CommandChain — plugin yang izinnya tak disetujui tetap
//      terpasang, hanya tak bisa dipanggil agent.
//
// Berkas .tsx pertama di repo. Babel yang di-vendor membuang tipenya saat jalan;
// `npm run typecheck` yang memeriksanya. Lihat public/tsconfig.json.

/** Kapabilitas yang boleh diminta plugin. Sengaja union, bukan string bebas:
 *  daftar ini harus sepadan dengan KOSAKATA_DEFAULT di
 *  agent/broker/commandchain.cjs, dan mengetiknya salah harus jadi error di
 *  sini — bukan penolakan diam-diam saat dijalankan nanti. */
type IzinPlugin =
  | "readFile"
  | "writeFile"
  | "fetch"
  | "network:http"
  | "network:https"
  | "proc.raw"
  | "attachment.read";

interface PluginTerpasang {
  id: string;
  nama: string;
  versi: string;
  ket: string;
  /** Perintah yang dijalankan sebagai server MCP — bukan berkas yang di-require. */
  sumber: string;
  aktif: boolean;
  izin: readonly IzinPlugin[];
}

const PLUGIN_CONTOH: readonly PluginTerpasang[] = [
  {
    id: "kaggle",
    nama: "Kaggle",
    versi: "0.1.0",
    ket: "Cari dataset dan kompetisi lewat API Kaggle.",
    sumber: "node agent/mcp-servers/kaggle-mcp.cjs",
    aktif: true,
    izin: ["network:https"],
  },
  {
    id: "notion",
    nama: "Notion",
    versi: "1.2.0",
    ket: "Baca dan tulis halaman Notion.",
    sumber: "npx @notionhq/notion-mcp-server",
    aktif: true,
    izin: ["network:https"],
  },
  {
    id: "github",
    nama: "GitHub",
    versi: "0.4.1",
    ket: "Issue, pull request, dan isi repositori.",
    sumber: "npx @modelcontextprotocol/server-github",
    aktif: false,
    izin: ["network:https"],
  },
];

const KARTU = {
  background: "#181b20",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "10px",
} as const;

const HIJAU = "#7cc4a4";
const REDUP = "#6b7280";

function IkonColokan({ ukuran = 18 }: { ukuran?: number }): JSX.Element {
  return (
    <svg
      width={ukuran}
      height={ukuran}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22v-5"></path>
      <path d="M9 8V2"></path>
      <path d="M15 8V2"></path>
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"></path>
    </svg>
  );
}

function BarisPlugin({ p }: { p: PluginTerpasang }): JSX.Element {
  return (
    <div
      style={{
        ...KARTU,
        padding: "16px 18px",
        display: "flex",
        alignItems: "flex-start",
        gap: "14px",
      }}
    >
      <i
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "34px",
          height: "34px",
          flexShrink: 0,
          borderRadius: "8px",
          background: "rgba(255,255,255,0.04)",
          color: p.aktif ? HIJAU : REDUP,
        }}
      >
        <IkonColokan />
      </i>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "4px",
          }}
        >
          <span style={{ fontSize: "14px", fontWeight: 600, color: "#f3f4f6" }}>
            {p.nama}
          </span>
          <span style={{ fontSize: "11px", color: REDUP }}>v{p.versi}</span>
        </div>

        <div
          style={{
            fontSize: "12.5px",
            color: "#9aa4b2",
            marginBottom: "8px",
            lineHeight: 1.5,
          }}
        >
          {p.ket}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {p.izin.map((z) => (
            <span
              key={z}
              title="Izin yang diminta plugin ini"
              style={{
                fontSize: "10.5px",
                fontFamily: "var(--mono, monospace)",
                color: "#9aa4b2",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "5px",
                padding: "2px 7px",
              }}
            >
              {z}
            </span>
          ))}
          <span
            style={{
              fontSize: "10.5px",
              fontFamily: "var(--mono, monospace)",
              color: REDUP,
              marginLeft: "2px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {p.sumber}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "11px", color: p.aktif ? HIJAU : REDUP }}>
          {p.aktif ? "Aktif" : "Nonaktif"}
        </span>
        <span
          aria-hidden="true"
          style={{
            width: "34px",
            height: "19px",
            borderRadius: "999px",
            background: p.aktif
              ? "rgba(124,196,164,0.28)"
              : "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.08)",
            position: "relative",
            display: "inline-block",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: "2px",
              left: p.aktif ? "16px" : "2px",
              width: "13px",
              height: "13px",
              borderRadius: "50%",
              background: p.aktif ? HIJAU : REDUP,
            }}
          />
        </span>
      </div>
    </div>
  );
}

function PluginsView(): JSX.Element {
  const [cari, setCari] = useState<string>("");

  const daftar: readonly PluginTerpasang[] = PLUGIN_CONTOH.filter((p) => {
    const q = cari.trim().toLowerCase();
    if (!q) return true;
    return p.nama.toLowerCase().includes(q) || p.ket.toLowerCase().includes(q);
  });

  return (
    <div
      style={{
        padding: "40px 60px",
        maxWidth: "920px",
        margin: "0 auto",
        width: "100%",
        color: "#e2e8f0",
      }}
    >
      <h1
        style={{
          fontSize: "20px",
          fontWeight: 600,
          color: "#f3f4f6",
          marginBottom: "6px",
        }}
      >
        Plugins
      </h1>
      <p
        style={{
          fontSize: "13px",
          color: REDUP,
          marginBottom: "24px",
          lineHeight: 1.6,
        }}
      >
        Tiap plugin berjalan sebagai proses terpisah. Pemasangan dilakukan oleh
        Anda — agent tidak bisa memasang sendiri.
      </p>

      <div
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "center",
          marginBottom: "28px",
        }}
      >
        <div
          style={{
            ...KARTU,
            flex: 1,
            display: "flex",
            alignItems: "center",
            padding: "10px 16px",
            gap: "10px",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke={REDUP}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            value={cari}
            onChange={(e: { target: { value: string } }) =>
              setCari(e.target.value)
            }
            placeholder="Cari plugin…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#e2e8f0",
              fontSize: "13px",
            }}
          />
        </div>
        <button
          className="btn"
          title="Memasang plugin adalah tindakan Anda, bukan agent"
          style={{
            padding: "10px 18px",
            borderRadius: "10px",
            fontSize: "13px",
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          + Install Plugin
        </button>
      </div>

      {daftar.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {daftar.map((p) => (
            <BarisPlugin key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <div
          style={{
            ...KARTU,
            padding: "28px",
            textAlign: "center",
            fontSize: "13px",
            color: REDUP,
          }}
        >
          Tak ada plugin yang cocok dengan “{cari}”.
        </div>
      )}
    </div>
  );
}
