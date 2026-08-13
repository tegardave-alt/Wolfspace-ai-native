// langgraph dimuat SAAT DIPAKAI, bukan saat aplikasi dibuka.
//
// KENAPA ADA. Ia dependensi termahal di seluruh aplikasi, dan harganya dibayar
// di tempat yang paling terasa. Terukur:
//
//   require("./core.js")              1071 ms   570 modul
//     dari node_modules                533 modul (93%)
//     kode sendiri                      37 modul  (7%)
//   require("@langchain/langgraph")    987 ms   <- hampir seluruhnya satu ini
//   require("zod")                     235 ms
//
// Dan itu bukan biaya sekali jalan. electron/main.js membuang SELURUH
// require.cache proyek pada tiap hot-reload lalu memuat core lagi — di proses
// UTAMA Electron, jadi ~1 detik jendela membeku setiap kali agent menyentuh
// berkasnya sendiri. server.cjs juga membuang cache modul self_agent di setiap
// request /self-agent.
//
// Sesudah ditunda: 1071 ms -> 314 ms, 570 modul -> 45.
//
// Yang berubah cuma KAPAN, bukan berapa. Biayanya pindah ke panggilan agent
// pertama, tempat ia tenggelam di antara panggilan cloud yang memang sedetik;
// aplikasi yang dibuka untuk membaca kode atau melihat preview tak membayarnya
// sama sekali.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const SRC = fs
  .readFileSync(path.join(AKAR, "agent", "self_agent.cjs"), "utf8")
  .replace(/\r\n/g, "\n");

// Pengambil yang MENGHITUNG KURUNG, bukan mencari "\n}" pertama. bentukState()
// berakhir dengan `}));` di dalamnya, jadi pencarian naif memotongnya di tengah
// dan yang teruji jadi bukan fungsi yang sebenarnya.
// Komentar dibuang sebelum memeriksa "tak boleh ada X": catatan tentang KENAPA
// sesuatu ditinggalkan justru harus tetap ada, dan ia mengutip bentuknya.
const tanpaKomentar = (t) =>
  t
    .split("\n")
    .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join("\n");

function ambilFungsi(nama) {
  const i = SRC.indexOf("function " + nama + "(");
  if (i < 0) throw new Error("tak ketemu: " + nama);
  let j = SRC.indexOf("{", i);
  let dalam = 0;
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === "{") dalam++;
    else if (SRC[k] === "}") {
      dalam--;
      if (dalam === 0) return SRC.slice(i, k + 1);
    }
  }
  throw new Error("kurung tak seimbang: " + nama);
}

describe("bentuknya: tak ada require langgraph di lingkup modul", () => {
  test("require-nya ada DI DALAM fungsi, bukan di puncak berkas", () => {
    // Bentuk lama: `const { StateGraph, ... } = require("@langchain/langgraph")`
    // di baris 27. Selama itu ada, seluruh penundaan ini batal.
    const puncak = tanpaKomentar(SRC.slice(0, SRC.indexOf("function lg()")));
    expect(puncak).not.toContain("@langchain/langgraph");
    expect(SRC).toMatch(
      /function lg\(\) \{\s*return \(_lg = _lg \|\| require\("@langchain\/langgraph"\)\);/,
    );
  });

  test("MemorySaver dan Annotation.Root tidak lagi dijalankan saat modul dibaca", () => {
    // Keduanya menuntut langgraph termuat; menjalankannya di lingkup modul
    // membatalkan penundaan tanpa terlihat.
    expect(SRC).toMatch(/function memoriAgen\(\)/);
    expect(SRC).toMatch(/function bentukState\(\)/);
    expect(SRC).not.toMatch(/^const agentMemory =/m);
    expect(SRC).not.toMatch(/^const AgentState = Annotation\.Root/m);
  });

  test("pembersihan checkpoint tidak MEMICU pemuatan", () => {
    // Membaca globalThis langsung: kalau agent belum pernah jalan, tak ada yang
    // perlu dibersihkan — memanggil pembuatnya di sana akan memuat langgraph
    // hanya untuk membersihkan sesuatu yang kosong.
    const t = tanpaKomentar(
      SRC.slice(SRC.indexOf("Bersihkan juga checkpoint")).slice(0, 1400),
    );
    expect(t).toMatch(/globalThis\.__wolfspaceAgentMemory/);
    expect(t).not.toMatch(/memoriAgen\(\)/);
  });
});

describe("akibatnya: memuat agent tidak menyeret langgraph", () => {
  test("require(self_agent) TIDAK memuat langgraph", () => {
    for (const k of Object.keys(require.cache))
      if (k.includes("langgraph") || k.includes("self_agent"))
        delete require.cache[k];
    require(path.join(AKAR, "agent", "self_agent.cjs"));
    // Disaring ke node_modules: berkas uji ini sendiri bernama "langgraph".
    const termuat = Object.keys(require.cache).filter(
      (k) => k.includes("node_modules") && k.includes("langgraph"),
    );
    expect(termuat).toHaveLength(0);
  });
});

describe("dan tetap BEKERJA saat akhirnya dipakai", () => {
  // Bagian yang paling mudah rusak diam-diam: bentuk state graph. Kalau
  // pembungkusan fungsi memotongnya salah, tak ada uji struktural yang
  // menangkapnya — barulah ketahuan saat agent dijalankan pemakai.
  const F = eval(
    "(function(){let _lg = null; let _bentukState = null;" +
      ambilFungsi("lg") +
      ambilFungsi("bentukState") +
      ambilFungsi("memoriAgen") +
      "return { lg, bentukState, memoriAgen };})()",
  );

  test("bentukState() menghasilkan bentuk yang sah dan di-memo", () => {
    const a = F.bentukState();
    expect(a).toBeTruthy();
    expect(typeof a).toBe("object");
    expect(F.bentukState()).toBe(a); // memo, bukan dibuat ulang tiap run
  });

  test("memoriAgen() tetap SATU instance lintas panggilan", () => {
    delete globalThis.__wolfspaceAgentMemory;
    const m = F.memoriAgen();
    expect(m.constructor.name).toBe("MemorySaver");
    expect(F.memoriAgen()).toBe(m);
    expect(globalThis.__wolfspaceAgentMemory).toBe(m);
  });

  test("graph benar-benar terbangun, ter-compile, dan JALAN", async () => {
    const { StateGraph, START, END } = F.lg();
    const g = new StateGraph(F.bentukState())
      .addNode("a", async () => ({ step: 7 }))
      .addEdge(START, "a")
      .addEdge("a", END)
      .compile({ checkpointer: F.memoriAgen() });
    const r = await g.invoke(
      { messages: [] },
      { configurable: { thread_id: "uji-malas" } },
    );
    expect(r.step).toBe(7);
  }, 30000);
});
