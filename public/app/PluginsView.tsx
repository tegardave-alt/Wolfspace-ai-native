// Plugins — halaman penuh, tersambung ke GET /plugins.
//
// Dua keputusan sengaja TERLIHAT di permukaan ini, bukan hanya di kode:
//
//   1. Tombol Install milik USER. Di VS Code tak ada agent yang bisa memasang
//      extension sendiri; WOLFSPACE punya, jadi pemisahan "siapa memasang" vs
//      "apa yang boleh dijangkau agent" harus kelihatan di UI juga.
//   2. Tiap plugin memajang IZIN yang dimintanya. Izin itu jadi kosakata genesis
//      CommandChain — plugin yang izinnya tak disetujui tetap terpasang dan
//      tetap terlihat di sini, tapi tool-nya tak pernah muncul di mata model.
//   3. `disetujui` dan `aktifSesi` ditampilkan TERPISAH. Memberi izin baru
//      berlaku sesi berikutnya (genesis sudah beku); mencabut berlaku seketika.
//      Menyamarkan bedanya membuat user mengira plugin sudah hidup.
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
  nama: string;
  versi: string;
  ket: string;
  /** Perintah yang dijalankan sebagai server MCP — bukan berkas yang di-require. */
  sumber: string;
  izin: readonly IzinPlugin[];
  /** User sudah memberi izin. Ditulis ke plugins/_disetujui.json. */
  disetujui: boolean;
  /**
   * Kapabilitasnya sudah masuk genesis SESI INI.
   *
   * Beda dari `disetujui`, dan perbedaannya HARUS terlihat: genesis dibekukan
   * sekali saat sesi mulai, jadi yang baru disetujui akan `disetujui:true`
   * tapi `aktifSesi:false`. Tanpa menampilkan itu, user mengira plugin sudah
   * hidup padahal agent belum bisa memanggilnya sampai restart.
   */
  aktifSesi: boolean;
}

interface ManifestRusak {
  dir: string;
  error: string;
}

interface JawabanPlugin {
  ok: boolean;
  izinDikenal?: readonly string[];
  plugin?: readonly PluginTerpasang[];
  rusak?: readonly ManifestRusak[];
  error?: string;
}

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

function BarisPlugin({
  p,
  onUbah,
  onCopot,
  sibuk,
}: {
  p: PluginTerpasang;
  onUbah: (nama: string, setujui: boolean) => void;
  onCopot: (nama: string) => void;
  sibuk: boolean;
}): JSX.Element {
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
          color: p.aktifSesi ? HIJAU : REDUP,
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
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "6px",
          flexShrink: 0,
        }}
      >
        <button
          className="btn"
          onClick={() => onUbah(p.nama, !p.disetujui)}
          disabled={sibuk}
          title={
            p.disetujui
              ? "Cabut izin — prosesnya dihentikan sekarang"
              : "Beri izin — berlaku mulai sesi berikutnya"
          }
          style={{
            padding: "6px 14px",
            borderRadius: "8px",
            fontSize: "12px",
            opacity: sibuk ? 0.5 : 1,
          }}
        >
          {p.disetujui ? "Cabut izin" : "Beri izin"}
        </button>

        {/* disetujui != aktif di sesi ini. Perbedaan itu sengaja ditampilkan:
            genesis dibekukan saat sesi mulai, jadi izin yang baru diberi belum
            bisa dipakai agent sampai restart. Menyembunyikannya membuat user
            mengira plugin sudah hidup. */}
        <span
          style={{ fontSize: "10.5px", color: p.aktifSesi ? HIJAU : REDUP }}
        >
          {p.aktifSesi
            ? "aktif di sesi ini"
            : p.disetujui
              ? "aktif setelah restart"
              : "tak terjangkau agent"}
        </span>

        <button
          onClick={() => onCopot(p.nama)}
          disabled={sibuk}
          title="Copot — folder dan persetujuannya dihapus"
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontSize: "10.5px",
            color: REDUP,
            cursor: sibuk ? "default" : "pointer",
            textDecoration: "underline",
          }}
        >
          copot
        </button>
      </div>
    </div>
  );
}

/**
 * Dialog pasang.
 *
 * Sengaja meminta PERINTAH, bukan berkas atau URL. Plugin dijalankan sebagai
 * server MCP di proses terpisah, jadi yang perlu diketahui WOLFSPACE cuma cara
 * menjalankannya — tak ada kode yang diunduh atau disalin ke sini. Jalur "ambil
 * dari URL lalu simpan" yang dulu ada di skill_install tidak dihidupkan lagi.
 *
 * Izin diminta DI SINI, saat memasang, seperti memasang aplikasi ponsel. Itu
 * satu-satunya saat user benar-benar memperhatikan apa yang ia berikan.
 */
function DialogPasang({
  izinDikenal,
  onBatal,
  onPasang,
  sibuk,
}: {
  izinDikenal: readonly string[];
  onBatal: () => void;
  onPasang: (p: {
    nama: string;
    ket: string;
    command: string;
    args: string[];
    izin: string[];
  }) => void;
  sibuk: boolean;
}): JSX.Element {
  const [nama, setNama] = useState<string>("");
  const [ket, setKet] = useState<string>("");
  const [perintah, setPerintah] = useState<string>("");
  const [izin, setIzin] = useState<readonly string[]>([]);

  const gaya = {
    width: "100%",
    background: "#0f1115",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    padding: "9px 12px",
    color: "#e2e8f0",
    fontSize: "13px",
    outline: "none",
  } as const;

  // Perintah dipecah dengan spasi sederhana. Cukup untuk bentuk yang dipakai
  // server MCP ("npx -y paket", "node skrip.cjs"); yang butuh tanda kutip bisa
  // menyunting manifest.json langsung.
  const potong = perintah.trim().split(/\s+/).filter(Boolean);

  return (
    <div
      style={{
        ...KARTU,
        padding: "20px",
        marginBottom: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <div style={{ fontSize: "14px", fontWeight: 600, color: "#f3f4f6" }}>
        Pasang plugin
      </div>

      <div style={{ display: "flex", gap: "10px" }}>
        <input
          value={nama}
          onChange={(e: { target: { value: string } }) =>
            setNama(e.target.value)
          }
          placeholder="nama (mis. kaggle)"
          style={{ ...gaya, flex: 1 }}
        />
        <input
          value={ket}
          onChange={(e: { target: { value: string } }) =>
            setKet(e.target.value)
          }
          placeholder="keterangan singkat"
          style={{ ...gaya, flex: 2 }}
        />
      </div>

      <input
        value={perintah}
        onChange={(e: { target: { value: string } }) =>
          setPerintah(e.target.value)
        }
        placeholder="perintah — mis. npx -y @notionhq/notion-mcp-server"
        style={{ ...gaya, fontFamily: "var(--mono, monospace)" }}
      />

      <div>
        <div style={{ fontSize: "12px", color: REDUP, marginBottom: "7px" }}>
          Izin yang diminta plugin ini:
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {izinDikenal.map((z) => {
            const pilih = izin.includes(z);
            return (
              <button
                key={z}
                onClick={() =>
                  setIzin(
                    pilih ? izin.filter((x) => x !== z) : izin.concat([z]),
                  )
                }
                style={{
                  fontSize: "10.5px",
                  fontFamily: "var(--mono, monospace)",
                  color: pilih ? "#0f1115" : "#9aa4b2",
                  background: pilih ? HIJAU : "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "5px",
                  padding: "3px 8px",
                  cursor: "pointer",
                }}
              >
                {z}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
        <button className="btn" onClick={onBatal} style={{ fontSize: "12px" }}>
          Batal
        </button>
        <button
          className="btn"
          disabled={sibuk || !nama.trim() || potong.length === 0}
          onClick={() =>
            onPasang({
              nama: nama.trim(),
              ket: ket.trim(),
              command: potong[0] as string,
              args: potong.slice(1),
              izin: izin.slice(),
            })
          }
          style={{
            fontSize: "12px",
            opacity: sibuk || !nama.trim() || potong.length === 0 ? 0.5 : 1,
          }}
        >
          Pasang
        </button>
      </div>

      <div style={{ fontSize: "11px", color: REDUP, lineHeight: 1.5 }}>
        Memasang tidak memberi izin. Sesudah terpasang, plugin masih harus Anda
        setujui — dan agent baru bisa memanggilnya pada sesi berikutnya.
      </div>
    </div>
  );
}

function PluginsView(): JSX.Element {
  const [cari, setCari] = useState<string>("");
  const [semua, setSemua] = useState<readonly PluginTerpasang[]>([]);
  const [rusak, setRusak] = useState<readonly ManifestRusak[]>([]);
  const [galat, setGalat] = useState<string>("");
  const [sibuk, setSibuk] = useState<boolean>(false);
  const [memuat, setMemuat] = useState<boolean>(true);
  const [bukaPasang, setBukaPasang] = useState<boolean>(false);
  const [izinDikenal, setIzinDikenal] = useState<readonly string[]>([]);

  const muat = useCallback(async (): Promise<void> => {
    try {
      const r = await fetch("/plugins");
      const j: JawabanPlugin = await r.json();
      if (!j.ok) throw new Error(j.error || "gagal memuat plugin");
      setSemua(j.plugin || []);
      setRusak(j.rusak || []);
      setIzinDikenal(j.izinDikenal || []);
      setGalat("");
    } catch (e) {
      // Kegagalan muat DITAMPILKAN, tak diganti daftar kosong. Daftar kosong
      // terbaca sebagai "belum ada plugin" — dua keadaan yang sangat berbeda.
      setGalat(e instanceof Error ? e.message : String(e));
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const ubahIzin = useCallback(
    async (nama: string, setujui: boolean): Promise<void> => {
      setSibuk(true);
      try {
        const r = await fetch("/plugins/setujui", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nama, setujui }),
        });
        const j = await r.json();
        if (!j.ok) setGalat(j.error || "gagal mengubah izin");
        else await muat();
      } catch (e) {
        setGalat(e instanceof Error ? e.message : String(e));
      } finally {
        setSibuk(false);
      }
    },
    [muat],
  );

  const pasang = useCallback(
    async (p: {
      nama: string;
      ket: string;
      command: string;
      args: string[];
      izin: string[];
    }): Promise<void> => {
      setSibuk(true);
      try {
        const r = await fetch("/plugins/pasang", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
        });
        const j = await r.json();
        if (!j.ok) setGalat(j.error || "gagal memasang");
        else {
          setBukaPasang(false);
          setGalat("");
          await muat();
        }
      } catch (e) {
        setGalat(e instanceof Error ? e.message : String(e));
      } finally {
        setSibuk(false);
      }
    },
    [muat],
  );

  const copot = useCallback(
    async (nama: string): Promise<void> => {
      setSibuk(true);
      try {
        const r = await fetch("/plugins/copot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nama }),
        });
        const j = await r.json();
        if (!j.ok) setGalat(j.error || "gagal mencopot");
        else await muat();
      } catch (e) {
        setGalat(e instanceof Error ? e.message : String(e));
      } finally {
        setSibuk(false);
      }
    },
    [muat],
  );

  const daftar: readonly PluginTerpasang[] = semua.filter((p) => {
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
            placeholder="Saring plugin terpasang…"
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
          onClick={() => setBukaPasang(!bukaPasang)}
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

      {bukaPasang ? (
        <DialogPasang
          izinDikenal={izinDikenal}
          onBatal={() => setBukaPasang(false)}
          onPasang={pasang}
          sibuk={sibuk}
        />
      ) : null}

      {galat ? (
        <div
          style={{
            ...KARTU,
            borderColor: "rgba(248,113,113,0.35)",
            padding: "16px 18px",
            marginBottom: "10px",
            fontSize: "12.5px",
            color: "#f8b4b4",
          }}
        >
          Gagal memuat daftar plugin: {galat}
        </div>
      ) : null}

      {/* Manifest rusak DITAMPILKAN, tidak dibuang diam-diam. Plugin yang hilang
          tanpa jejak adalah persis cara skills.cjs jadi terlupakan sampai
          akhirnya jadi celah keamanan. */}
      {rusak.map((r) => (
        <div
          key={r.dir}
          style={{
            ...KARTU,
            borderColor: "rgba(210,153,34,0.35)",
            padding: "14px 18px",
            marginBottom: "10px",
            fontSize: "12.5px",
            color: "#d9b168",
          }}
        >
          <b>plugins/{r.dir}</b> — manifest tak sah: {r.error}
        </div>
      ))}

      {memuat ? (
        <div
          style={{
            ...KARTU,
            padding: "28px",
            textAlign: "center",
            fontSize: "13px",
            color: REDUP,
          }}
        >
          Memuat…
        </div>
      ) : daftar.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {daftar.map((p) => (
            <BarisPlugin
              key={p.nama}
              p={p}
              onUbah={ubahIzin}
              onCopot={copot}
              sibuk={sibuk}
            />
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
          {cari.trim()
            ? `Tak ada plugin yang cocok dengan “${cari}”.`
            : "Belum ada plugin. Taruh folder berisi manifest.json di plugins/."}
        </div>
      )}
    </div>
  );
}
