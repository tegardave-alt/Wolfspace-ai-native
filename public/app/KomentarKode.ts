// KomentarKode.ts — review comments in the code editor, and the road from a
// comment to the agent.
//
// WHAT IT IS FOR. The user reads the agent's code and sees a part that should
// change. Until now the way to say so was to describe the place in the chat:
// "the function in the middle of the file, the loop after the fetch". Now
// they mark the lines and write the note where the code is -- and one button
// hands the note, the file, the line numbers and the code itself to the
// agent, which answers in the chat: an explanation, or the change.
//
// THE REFERENCE. VS Code's comments contribution
// (src/vs/workbench/contrib/comments/browser/commentsController.ts and
// commentThreadZoneWidget.ts): a "+" glyph appears in the gutter of the
// hovered line (`comment-range-glyph line-hover`), a click on it -- or "Add
// Comment on Line" from the menu, or the selection -- opens a thread widget
// BELOW the last line of the range (a ZoneWidget: a view zone for the space
// and an overlay widget for the content), and the thread's range stays
// highlighted while it exists. GitHub's pull-request review is the same
// shape, and it is the one users already know. Here the thread has one
// author (the user) and one reader (the agent); the reply arrives in the
// chat, where the agent's tools and its timeline already are.
//
// ── How the widget is built ──
//
// A view zone alone cannot be typed into: Monaco puts the zone's DOM node in
// a layer that does not receive the pointer. So, exactly as Monaco's own
// ZoneWidget does, the zone only RESERVES the height and an overlay widget
// carries the form, pinned to the zone's top through onDomNodeTop. The zone
// is re-laid when the textarea grows, so the code below never slides under
// the form.
//
// Comments are kept in localStorage per absolute path. They are a reading
// aid, not a document: losing them costs the note, never the code.

const KOMENTAR_KUNCI = "wolfspace_komentar_kode";
const KOMENTAR_MAKS_BARIS_KODE = 200;

type KomentarKode = {
  id: string;
  mulai: number;
  akhir: number;
  teks: string;
  waktu: number;
};

function _bacaSemuaKomentar(): Record<string, KomentarKode[]> {
  try {
    const v = JSON.parse(localStorage.getItem(KOMENTAR_KUNCI) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch (_) {
    return {};
  }
}
function bacaKomentar(abs: string): KomentarKode[] {
  const d = _bacaSemuaKomentar()[abs];
  return Array.isArray(d) ? d : [];
}
function tulisKomentar(abs: string, daftar: KomentarKode[]) {
  const semua = _bacaSemuaKomentar();
  if (daftar.length) semua[abs] = daftar;
  else delete semua[abs];
  try {
    localStorage.setItem(KOMENTAR_KUNCI, JSON.stringify(semua));
  } catch (_) {}
}

/**
 * The message the agent receives. The absolute path is in it on purpose:
 * the scope guard admits a file the request names, so the agent may edit
 * this one without being held for straying.
 */
function pesanUntukAgent(k: {
  abs: string;
  mulai: number;
  akhir: number;
  bahasa: string;
  kode: string;
  teks: string;
}): string {
  const baris =
    k.mulai === k.akhir
      ? "line " + k.mulai
      : "lines " + k.mulai + "-" + k.akhir;
  const pagar = "```";
  return (
    "Code comment on " +
    k.abs +
    " (" +
    baris +
    "):\n\n> " +
    String(k.teks || "")
      .trim()
      .replace(/\n/g, "\n> ") +
    "\n\n" +
    pagar +
    (k.bahasa || "") +
    "\n" +
    k.kode.replace(/\r?\n$/, "") +
    "\n" +
    pagar +
    "\n\nAddress the comment: if it asks for a change, make it in that file; " +
    "otherwise explain the code it refers to."
  );
}

/** The selection as a line range; a selection ending at column 1 of a later line does not include that line. */
function rentangSeleksi(ed: any): { mulai: number; akhir: number } {
  const s = ed.getSelection();
  if (!s) return { mulai: 1, akhir: 1 };
  let mulai = s.startLineNumber;
  let akhir = s.endLineNumber;
  if (akhir > mulai && s.endColumn === 1) akhir--;
  return { mulai, akhir };
}

function installKomentarKode(
  monaco: any,
  ed: any,
  ambil: () => { rel: string; abs: string },
) {
  if (!monaco || !ed || ed.__komentarTerpasang) return;
  ed.__komentarTerpasang = true;
  const R = monaco.Range;

  // ── State for the file on screen ──
  let hias: any = ed.createDecorationsCollection([]);
  let hiasHover: any = ed.createDecorationsCollection([]);
  let barisHover = 0;
  // id -> { zona, overlay, dom, tinggi }. The open threads; a stored comment
  // is shown collapsed to its glyph until the glyph is clicked.
  const terbuka = new Map<string, any>();
  const absSekarang = () => String((ambil() || ({} as any)).abs || "");

  const kodeRentang = (mulai: number, akhir: number) => {
    const model = ed.getModel();
    if (!model) return { bahasa: "", kode: "" };
    const batas = Math.min(akhir, mulai + KOMENTAR_MAKS_BARIS_KODE - 1);
    return {
      bahasa: String(model.getLanguageId ? model.getLanguageId() : ""),
      kode: model.getValueInRange(
        new R(mulai, 1, batas, model.getLineMaxColumn(batas)),
      ),
    };
  };

  // ── Decorations: the highlighted range and the glyph of each stored comment ──
  const gambar = () => {
    const abs = absSekarang();
    const daftar = abs ? bacaKomentar(abs) : [];
    const model = ed.getModel();
    if (!model) {
      hias.clear();
      return;
    }
    const n = model.getLineCount();
    hias.set(
      daftar
        .filter((k) => k.mulai >= 1 && k.mulai <= n)
        .map((k) => ({
          range: new R(k.mulai, 1, Math.min(k.akhir, n), 1),
          options: {
            isWholeLine: true,
            className: "komentar-rentang",
            linesDecorationsClassName: "komentar-ikon",
            stickiness: 1,
          },
        })),
    );
  };

  // ── The thread widget: a zone for the space, an overlay for the form ──
  const tutup = (id: string) => {
    const t = terbuka.get(id);
    if (!t) return;
    terbuka.delete(id);
    try {
      if (t.buang) t.buang();
    } catch (_) {}
    try {
      ed.changeViewZones((acc: any) => acc.removeZone(t.zona));
    } catch (_) {}
    try {
      ed.removeOverlayWidget(t.overlay);
    } catch (_) {}
  };
  const tutupSemua = () => {
    for (const id of Array.from(terbuka.keys())) tutup(id);
  };

  const buka = (opsi: {
    id: string;
    mulai: number;
    akhir: number;
    tersimpan?: KomentarKode | null;
  }) => {
    if (terbuka.has(opsi.id)) {
      tutup(opsi.id);
      return;
    }
    const abs = absSekarang();
    const { mulai, akhir } = opsi;
    const dom = document.createElement("div");
    dom.className = "komentar-zona";
    const judul =
      mulai === akhir ? "Line " + mulai : "Lines " + mulai + "–" + akhir;
    dom.innerHTML =
      '<div class="komentar-kepala"><span class="komentar-judul"></span>' +
      '<button type="button" class="komentar-tutup" title="Close">×</button></div>' +
      '<div class="komentar-isi"></div>' +
      '<textarea class="komentar-teks" rows="2" placeholder="Leave a comment — what should change, or what to explain…"></textarea>' +
      '<div class="komentar-aksi">' +
      '<button type="button" class="komentar-btn komentar-kirim">Send to agent</button>' +
      '<button type="button" class="komentar-btn komentar-simpan">Save</button>' +
      '<button type="button" class="komentar-btn komentar-hapus" hidden>Delete</button>' +
      "</div>";
    (dom.querySelector(".komentar-judul") as any).textContent = judul;
    const isi = dom.querySelector(".komentar-isi") as HTMLElement;
    const teks = dom.querySelector(".komentar-teks") as HTMLTextAreaElement;
    const btnKirim = dom.querySelector(".komentar-kirim") as HTMLButtonElement;
    const btnSimpan = dom.querySelector(
      ".komentar-simpan",
    ) as HTMLButtonElement;
    const btnHapus = dom.querySelector(".komentar-hapus") as HTMLButtonElement;
    const btnTutup = dom.querySelector(".komentar-tutup") as HTMLButtonElement;

    if (opsi.tersimpan) {
      const k = opsi.tersimpan;
      isi.innerHTML =
        '<div class="komentar-item"><span class="komentar-penulis">You</span> ' +
        '<span class="komentar-waktu"></span><div class="komentar-badan"></div></div>';
      (isi.querySelector(".komentar-waktu") as any).textContent = new Date(
        k.waktu,
      ).toLocaleString();
      (isi.querySelector(".komentar-badan") as any).textContent = k.teks;
      teks.value = k.teks;
      btnHapus.hidden = false;
      btnSimpan.textContent = "Update";
    }

    // Monaco's keyboard handling must not see keys typed into the form.
    for (const ev of ["keydown", "keyup", "keypress"])
      dom.addEventListener(ev, (e) => e.stopPropagation());
    dom.addEventListener("mousedown", (e) => e.stopPropagation());
    dom.addEventListener("wheel", (e) => e.stopPropagation());

    const zonaDesc: any = {
      afterLineNumber: akhir,
      heightInPx: 120,
      domNode: document.createElement("div"),
      onDomNodeTop: (top: number) => {
        dom.style.top = top + "px";
      },
    };
    let zonaId = "";
    const overlay = {
      getId: () => "wolfspace.komentar." + opsi.id,
      getDomNode: () => dom,
      getPosition: () => null,
    };
    const letak = () => {
      const li = ed.getLayoutInfo();
      dom.style.left = li.contentLeft + "px";
      dom.style.width =
        Math.max(160, li.contentWidth - li.verticalScrollbarWidth - 8) + "px";
    };
    const ukur = () => {
      const t = Math.max(80, dom.offsetHeight + 6);
      if (t === zonaDesc.heightInPx) return;
      zonaDesc.heightInPx = t;
      try {
        ed.changeViewZones((acc: any) => acc.layoutZone(zonaId));
      } catch (_) {}
    };
    ed.addOverlayWidget(overlay);
    letak();
    ed.changeViewZones((acc: any) => {
      zonaId = acc.addZone(zonaDesc);
    });
    const langgananLayout = ed.onDidLayoutChange(() => {
      letak();
      ukur();
    });
    terbuka.set(opsi.id, {
      zona: zonaId,
      overlay,
      dom,
      buang: () => langgananLayout.dispose(),
    });
    requestAnimationFrame(() => {
      ukur();
      teks.focus();
    });
    teks.addEventListener("input", () => {
      teks.style.height = "auto";
      teks.style.height = Math.min(teks.scrollHeight, 220) + "px";
      ukur();
    });

    const simpan = (): KomentarKode | null => {
      const t = teks.value.trim();
      if (!t || !abs) return null;
      const daftar = bacaKomentar(abs).filter((k) => k.id !== opsi.id);
      const k: KomentarKode = {
        id: opsi.id,
        mulai,
        akhir,
        teks: t,
        waktu: Date.now(),
      };
      daftar.push(k);
      daftar.sort((a, b) => a.mulai - b.mulai);
      tulisKomentar(abs, daftar);
      gambar();
      return k;
    };
    const selesai = () => tutup(opsi.id);
    btnTutup.addEventListener("click", selesai);
    btnSimpan.addEventListener("click", () => {
      if (simpan()) selesai();
      else teks.focus();
    });
    btnHapus.addEventListener("click", () => {
      if (abs)
        tulisKomentar(
          abs,
          bacaKomentar(abs).filter((k) => k.id !== opsi.id),
        );
      gambar();
      selesai();
    });
    btnKirim.addEventListener("click", () => {
      const k = simpan();
      if (!k) {
        teks.focus();
        return;
      }
      const { bahasa, kode } = kodeRentang(mulai, akhir);
      window.dispatchEvent(
        new CustomEvent("WOLFSPACE:send-composer", {
          detail: pesanUntukAgent({
            abs,
            mulai,
            akhir,
            bahasa,
            kode,
            teks: k.teks,
          }),
        }),
      );
      selesai();
    });
    teks.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") selesai();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) btnKirim.click();
    });
  };

  const bukaBaru = (mulai: number, akhir: number) =>
    buka({
      id:
        "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      mulai,
      akhir,
    });

  // ── The gutter "+" on the hovered line, and what a click on it does ──
  const T = monaco.editor.MouseTargetType;
  ed.onMouseMove((e: any) => {
    const pos = e.target && e.target.position;
    const baris = pos ? pos.lineNumber : 0;
    if (baris === barisHover) return;
    barisHover = baris;
    // No "+" where a comment already has its glyph: two marks in one lane.
    const abs = absSekarang();
    if (!baris || (abs && bacaKomentar(abs).some((k) => k.mulai === baris))) {
      hiasHover.clear();
      return;
    }
    hiasHover.set([
      {
        range: new R(baris, 1, baris, 1),
        options: { linesDecorationsClassName: "komentar-plus" },
      },
    ]);
  });
  ed.onMouseLeave(() => {
    barisHover = 0;
    hiasHover.clear();
  });
  ed.onMouseDown((e: any) => {
    if (!e.target || e.target.type !== T.GUTTER_LINE_DECORATIONS) return;
    const baris = e.target.position && e.target.position.lineNumber;
    if (!baris) return;
    e.event.preventDefault();
    const abs = absSekarang();
    // A stored comment on this line: toggle its thread.
    const ada = abs
      ? bacaKomentar(abs).find((k) => k.mulai === baris)
      : undefined;
    if (ada) {
      buka({ id: ada.id, mulai: ada.mulai, akhir: ada.akhir, tersimpan: ada });
      return;
    }
    // Otherwise a new one -- on the selection when it covers this line, as
    // VS Code does, else on the line alone.
    const s = rentangSeleksi(ed);
    if (s.mulai <= baris && baris <= s.akhir && s.akhir > s.mulai)
      bukaBaru(s.mulai, s.akhir);
    else bukaBaru(baris, baris);
  });

  // ── The editor's own context menu ──
  ed.addAction({
    id: "wolfspace.komentar.tambah",
    label: "Add Comment…",
    keybindings: [
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyC,
    ],
    contextMenuGroupId: "a_wolfspace",
    contextMenuOrder: 1,
    run: () => {
      const s = rentangSeleksi(ed);
      bukaBaru(s.mulai, s.akhir);
    },
  });
  ed.addAction({
    id: "wolfspace.komentar.jelaskan",
    label: "Ask Agent to Explain",
    contextMenuGroupId: "a_wolfspace",
    contextMenuOrder: 2,
    run: () => {
      const s = rentangSeleksi(ed);
      const abs = absSekarang();
      if (!abs) return;
      const { bahasa, kode } = kodeRentang(s.mulai, s.akhir);
      window.dispatchEvent(
        new CustomEvent("WOLFSPACE:send-composer", {
          detail: pesanUntukAgent({
            abs,
            mulai: s.mulai,
            akhir: s.akhir,
            bahasa,
            kode,
            teks: "Explain this code.",
          }),
        }),
      );
    },
  });

  // A new file on screen: its own comments, and no thread left from the last.
  ed.onDidChangeModel(() => {
    tutupSemua();
    hias = ed.createDecorationsCollection([]);
    hiasHover = ed.createDecorationsCollection([]);
    barisHover = 0;
    gambar();
  });
  gambar();

  const pegangan = { buka, bukaBaru, tutupSemua, gambar, terbuka };
  ed.__wolfspaceKomentar = pegangan;
  return pegangan;
}

if (typeof window !== "undefined") {
  (window as any).__wolfspaceKomentarKode = {
    installKomentarKode,
    pesanUntukAgent,
    bacaKomentar,
    tulisKomentar,
  };
}
