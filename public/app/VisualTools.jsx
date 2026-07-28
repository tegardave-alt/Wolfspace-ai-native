// VisualTools — diekstrak dari app.jsx: useVisualPicker & useVisualDraw + guard
// module-level (VP_STOP/VD_STOP). Dimuat via APP_MODULES (di-concat setelah app.jsx,
// satu scope). Function-decl ter-hoist; guard `let` hanya disentuh saat interaksi
// (klik), jadi pasti sudah terinisialisasi. Dipakai App: startPicker/startVisualDraw.

/* ----------------------------- Visual Picker ----------------------------- */
// Module-level guard: only ONE picker can ever be active, so re-clicking the
// sidebar item toggles it off instead of stacking capture-listeners that would
// keep swallowing clicks (the "chat jadi tak bisa diklik" bug).
let VP_STOP = null;
// getFrameDoc (opsional): fungsi yang mengembalikan contentDocument iframe preview
// (Web Dev Live Browser) bila sedang terbuka & same-origin. Tanpa ini, picker HANYA
// memantau document WOLFSPACE sendiri — hover di atas iframe cuma "mengenali" elemen
// <iframe>-nya, bukan apa pun di DALAM halaman yang di-render.
function useVisualPicker(getFrameDoc) {
  return useCallback(() => {
    if (VP_STOP) {
      VP_STOP();
      return;
    } // already active ? toggle off
    const docs = [document];
    try {
      const frameDoc = getFrameDoc && getFrameDoc();
      // .defaultView null bila dokumen cross-origin (akses ditolak browser sebelum
      // sampai sini pun sudah throw) — cek ini jaga-jaga untuk dokumen "mati"/lepas.
      if (frameDoc && frameDoc.defaultView) docs.push(frameDoc);
    } catch (_) {
      // Cross-origin (preview arah ke URL eksternal, bukan file lokal same-origin):
      // picker tetap jalan di WOLFSPACE saja, tanpa melempar error ke pengguna.
    }
    let hover = null;
    const cleanHovers = () =>
      docs.forEach((d) =>
        d
          .querySelectorAll(".vp-hover")
          .forEach((el) => el.classList.remove("vp-hover")),
      );
    const move = (e) => {
      const el = e.target;
      if (hover && hover !== el) hover.classList.remove("vp-hover");
      hover = el;
      el.classList.add("vp-hover");
    };
    // real classes only (drop the picker's own vp-* runtime classes)
    const realCls = (el) =>
      typeof el.className === "string"
        ? el.className
            .trim()
            .split(/\s+/)
            .filter((c) => c && !/^vp-/.test(c))
        : [];
    const seg = (el) => {
      if (el.id) return "#" + el.id;
      let s = el.tagName.toLowerCase();
      const cls = realCls(el);
      if (cls.length) s += "." + cls.join(".");
      const p = el.parentElement; // disambiguate same-tag siblings
      if (p) {
        const same = Array.from(p.children).filter(
          (c) => c.tagName === el.tagName,
        );
        if (same.length > 1)
          s += ":nth-of-type(" + (same.indexOf(el) + 1) + ")";
      }
      return s;
    };
    // Build a selector that actually identifies the element: if it has no id/class,
    // walk up to the nearest classed/ided ancestor so "p" becomes ".composer-hint > p".
    const sel = (el) => {
      const parts = [];
      let cur = el,
        depth = 0;
      while (cur && cur.nodeType === 1 && depth < 6) {
        parts.unshift(seg(cur));
        if (cur.id || realCls(cur).length) break; // anchored ? enough to be unique
        cur = cur.parentElement;
        depth++;
      }
      return parts.join(" > ");
    };
    const click = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.target,
        selector = sel(el);

      let d = "";

      // Tambahkan struktur DOM agar agent lebih mudah mencari di source code
      let htmlSnippet = el.outerHTML || "";
      if (htmlSnippet) {
        // Potong htmlSnippet jika terlalu panjang, tapi tetap pertahankan strukturnya
        if (htmlSnippet.length > 300) {
          htmlSnippet = htmlSnippet.slice(0, 300) + "...";
        }
        d = "Struktur DOM:\n```html\n" + htmlSnippet + "\n```";
      }

      try {
        // writeText() mengembalikan Promise — try/catch TAK menangkap penolakan async
        // (mis. "Document is not focused"). .catch mencegahnya jadi unhandledrejection
        // yang dulu memicu auto-rollback (app reload sendiri saat proses jalan).
        navigator.clipboard &&
          navigator.clipboard.writeText(d).catch(function () {});
      } catch (_) {}
      stop();
      // Gunakan alert yang rapi
      setTimeout(
        () => alert("Element details copied to clipboard!\n\n" + selector),
        0,
      );
    };
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stop();
      }
    };
    // Halaman di dalam iframe punya <head> sendiri — tak kebagian styles.css
    // WOLFSPACE — jadi cursor crosshair & outline hover diinjeksi langsung ke situ
    // (nilai polos, bukan var() CSS, karena var itu tak terdefinisi di dokumen lain).
    const frameStyleEls = [];
    docs.forEach((d) => {
      if (d === document) return;
      try {
        const st = d.createElement("style");
        st.setAttribute("data-wf-vp", "1");
        st.textContent =
          ".vp-on, .vp-on * { cursor: crosshair !important; } .vp-hover { outline: 2px solid #8fb3ff !important; outline-offset: -2px; }";
        (d.head || d.documentElement).appendChild(st);
        frameStyleEls.push(st);
      } catch (_) {}
    });
    function stop() {
      VP_STOP = null;
      cleanHovers();
      docs.forEach((d) => {
        if (d.body) d.body.classList.remove("vp-on");
        d.removeEventListener("mouseover", move, true);
        d.removeEventListener("click", click, true);
        d.removeEventListener("keydown", key, true);
      });
      frameStyleEls.forEach((st) => {
        try {
          st.remove();
        } catch (_) {}
      });
    }
    VP_STOP = stop;
    docs.forEach((d) => {
      if (d.body) d.body.classList.add("vp-on");
      d.addEventListener("mouseover", move, true);
      d.addEventListener("click", click, true);
      d.addEventListener("keydown", key, true);
    });
  }, [getFrameDoc]);
}

/* ----------------------------- Visual Draw ----------------------------- */
let VD_STOP = null;
// getFrameDoc (opsional): sama seperti Visual Picker — dokumen iframe preview
// (Web Dev Live Browser) bila terbuka & same-origin, agar menggambar kotak DI ATAS
// halaman yang di-render ikut berfungsi (event mouse di atas iframe jatuh ke
// dokumen iframe, bukan ke document WOLFSPACE).
function useVisualDraw(getFrameDoc) {
  return useCallback(() => {
    if (VD_STOP) {
      VD_STOP();
      return;
    }

    const docs = [document];
    try {
      const frameDoc = getFrameDoc && getFrameDoc();
      if (frameDoc && frameDoc.defaultView) docs.push(frameDoc);
    } catch (_) {
      /* cross-origin: draw tetap jalan di WOLFSPACE saja */
    }
    // Konversi koordinat event → koordinat viewport WOLFSPACE (parent). Event dari
    // dalam iframe ber-clientX/Y relatif ke viewport IFRAME, jadi digeser sebesar
    // posisi elemen <iframe> di parent.
    const toParentXY = (ev) => {
      try {
        if (ev.view && ev.view !== window && ev.view.frameElement) {
          const fr = ev.view.frameElement.getBoundingClientRect();
          return { x: ev.clientX + fr.left, y: ev.clientY + fr.top };
        }
      } catch (_) {}
      return { x: ev.clientX, y: ev.clientY };
    };

    // Ubah kursor global menjadi crosshair untuk indikasi mode aktif
    document.body.classList.add("vp-on");
    // Iframe punya <head>/<body> sendiri: inject cursor + tandai body-nya juga.
    const frameStyleEls = [];
    docs.forEach((d) => {
      if (d === document) return;
      try {
        const st = d.createElement("style");
        st.setAttribute("data-wf-vd", "1");
        st.textContent = ".vp-on, .vp-on * { cursor: crosshair !important; }";
        (d.head || d.documentElement).appendChild(st);
        frameStyleEls.push(st);
        if (d.body) d.body.classList.add("vp-on");
      } catch (_) {}
    });

    const cWrap = document.createElement("div");
    cWrap.id = "vd-cwrap";
    Object.assign(cWrap.style, {
      position: "fixed",
      inset: "0",
      overflow: "hidden",
      background: "transparent",
      zIndex: "999999",
      pointerEvents: "none", // Biarkan event jatuh ke document agar bisa dicegat dengan useCapture
    });

    const activeSelections = document.createElement("div");
    Object.assign(activeSelections.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
    });
    cWrap.appendChild(activeSelections);

    document.body.appendChild(cWrap);

    // Dulu snap ke grid 24px — kotak final "melompat" sampai ±12px dari yang
    // digambar (keluhan: posisi tak sesuai koordinat). Sekarang presisi 1px.
    const snap = (v) => Math.round(v);

    const copyToClipboard = (domString, btnElement) => {
      const showSuccess = () => {
        const oldHTML = btnElement.innerHTML;
        const oldBg = btnElement.style.background;
        btnElement.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style="margin-right:4px; vertical-align:text-bottom"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
        btnElement.style.background = "var(--text-success, #2b8a3e)";
        setTimeout(() => {
          btnElement.innerHTML = oldHTML;
          btnElement.style.background = oldBg;
        }, 2000);
      };

      const fallbackCopy = (text) => {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand("copy");
          showSuccess();
        } catch (err) {
          alert("Copy manually:\\n\\n" + text);
        }
        textArea.remove();
      };

      if (navigator.clipboard) {
        navigator.clipboard
          .writeText(domString)
          .then(showSuccess)
          .catch(() => fallbackCopy(domString));
      } else {
        fallbackCopy(domString);
      }
    };

    const checkSidebarClick = (e) => {
      const btn = e.target.closest(".sb-item");
      if (
        btn &&
        (btn.textContent.includes("Visual Picker") ||
          btn.textContent.includes("Visual Draw"))
      ) {
        return true;
      }
      return false;
    };

    // Cegah semua klik di aplikasi (kecuali sidebar & UI draw)
    const blockClick = (e) => {
      if (checkSidebarClick(e)) return;
      if (e.target.closest(".ui-panel")) return;
      e.preventDefault();
      e.stopPropagation();
    };

    const handleRightClick = (e) => {
      if (checkSidebarClick(e)) return;
      if (e.target.closest(".ui-panel")) return;

      e.preventDefault();
      e.stopPropagation();
      if (activeSelections.children.length > 0) {
        activeSelections.innerHTML = "";
      }
    };

    const cvsMD = (e) => {
      if (checkSidebarClick(e)) return;
      if (e.target.closest(".ui-panel")) return;
      if (e.button !== 0) return;

      e.preventDefault();
      e.stopPropagation();

      const r = cWrap.getBoundingClientRect();
      const p0 = toParentXY(e);
      const startX = p0.x - r.left;
      const startY = p0.y - r.top;

      const selBox = document.createElement("div");
      Object.assign(selBox.style, {
        position: "absolute",
        border: "2px dashed var(--fill-accent, #339af0)",
        background: "rgba(51, 154, 240, 0.15)",
        pointerEvents: "none",
        zIndex: "9999",
        left: startX + "px",
        top: startY + "px",
        width: "0px",
        height: "0px",
        display: "flex",
        flexDirection: "column",
      });
      activeSelections.appendChild(selBox);

      const mm = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const pm = toParentXY(ev);
        const currX = pm.x - r.left;
        const currY = pm.y - r.top;
        selBox.style.left = Math.min(startX, currX) + "px";
        selBox.style.top = Math.min(startY, currY) + "px";
        selBox.style.width = Math.abs(currX - startX) + "px";
        selBox.style.height = Math.abs(currY - startY) + "px";
      };

      const mu = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        docs.forEach((d) => {
          d.removeEventListener("mousemove", mm, true);
          d.removeEventListener("mouseup", mu, true);
        });

        const pu = toParentXY(ev);
        let currX = pu.x - r.left;
        let currY = pu.y - r.top;
        let w = Math.abs(currX - startX);
        let h = Math.abs(currY - startY);

        if (w < 10 && h < 10) {
          selBox.remove();
          return;
        }

        const finalX = snap(Math.min(startX, currX));
        const finalY = snap(Math.min(startY, currY));
        const finalW = Math.max(10, snap(w));
        const finalH = Math.max(10, snap(h));

        Object.assign(selBox.style, {
          left: finalX + "px",
          top: finalY + "px",
          width: finalW + "px",
          height: finalH + "px",
          pointerEvents: "auto",
          border: "2px solid var(--fill-accent, #339af0)",
          boxShadow: "0 12px 32px rgba(51, 154, 240, 0.15)",
          overflow: "visible",
        });

        // --- DOM Context Detection ---
        // Titik uji = TENGAH KOTAK final (bukan titik lepas mouse): merepresentasikan
        // area yang digambar, dan tak meleset saat mouse dilepas sedikit di luar kotak.
        // Bila titik tengah jatuh di dalam iframe preview -> elementFromPoint milik
        // dokumen IFRAME dengan koordinat lokal frame (elemen halaman yang di-render).
        const cx = finalX + r.left + finalW / 2;
        const cy = finalY + r.top + finalH / 2;
        let targetEl = null,
          targetDoc = document,
          frRect = null;
        try {
          const fd = docs.find((d) => d !== document);
          if (fd && fd.defaultView && fd.defaultView.frameElement) {
            const fr = fd.defaultView.frameElement.getBoundingClientRect();
            if (
              cx >= fr.left &&
              cx <= fr.right &&
              cy >= fr.top &&
              cy <= fr.bottom
            ) {
              targetDoc = fd;
              frRect = fr;
              targetEl =
                fd.elementFromPoint(cx - fr.left, cy - fr.top) || fd.body;
            }
          }
        } catch (_) {}
        if (!targetEl) {
          cWrap.style.pointerEvents = "none";
          selBox.style.pointerEvents = "none";
          targetEl = document.elementFromPoint(cx, cy) || document.body;
          cWrap.style.pointerEvents = "auto"; // (or back to whatever it was)
          selBox.style.pointerEvents = "auto";
        }

        // Generate selector (same logic as Picker)
        const realCls = (el) =>
          typeof el.className === "string"
            ? el.className
                .trim()
                .split(/\s+/)
                .filter((c) => c && !/^vp-/.test(c))
            : [];
        const seg = (el) => {
          if (el.id) return "#" + el.id;
          let s = el.tagName.toLowerCase();
          const cls = realCls(el);
          if (cls.length) s += "." + cls.join(".");
          const p = el.parentElement;
          if (p) {
            const same = Array.from(p.children).filter(
              (c) => c.tagName === el.tagName,
            );
            if (same.length > 1)
              s += ":nth-of-type(" + (same.indexOf(el) + 1) + ")";
          }
          return s;
        };
        const sel = (el) => {
          const parts = [];
          let cur = el,
            depth = 0;
          while (cur && cur.nodeType === 1 && depth < 6) {
            parts.unshift(seg(cur));
            if (cur.id || realCls(cur).length) break;
            cur = cur.parentElement;
            depth++;
          }
          return parts.join(" > ");
        };

        const targetSelector = sel(targetEl);
        const tr = targetEl.getBoundingClientRect();
        // Rect elemen di dalam iframe berkoordinat viewport FRAME — geser ke
        // koordinat parent agar konsisten dengan finalX/finalY (koordinat overlay).
        let trLeft = tr.left,
          trTop = tr.top;
        if (frRect) {
          trLeft += frRect.left;
          trTop += frRect.top;
        }
        // Calculate relative coordinates
        const relX = Math.round(finalX + r.left - trLeft);
        const relY = Math.round(finalY + r.top - trTop);

        const domString = `<div data-target="${targetSelector}" style="position: absolute; left: ${relX}px; top: ${relY}px; width: ${finalW}px; height: ${finalH}px;"></div>`;
        const escapedDom = domString
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

        selBox.innerHTML = `
          <div style="position: absolute; top: 0; left: 0; background: var(--fill-accent, #339af0); color: white; font-size: 11px; font-weight: 600; padding: 4px 8px; border-bottom-right-radius: 4px; border-top-left-radius: 1px; display: inline-block; letter-spacing: 0.05em; pointer-events: none; white-space: nowrap; z-index: 2;">
            AREA KOSONG [X: ${finalX}, Y: ${finalY}]
          </div>
          <div class="ui-panel" style="position: absolute; top: calc(100% + 2px); left: -2px; width: max-content; max-width: 300px; padding: 12px; background: rgba(255, 255, 255, 0.98); border: 2px solid var(--fill-accent, #339af0); border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); display: flex; flex-direction: column; gap: 8px; z-index: 3;">
            <code style="display:block; padding:8px; background:var(--surface-2, #f1f3f5); border:1px solid var(--border, #e9ecef); border-radius:4px; font-size:11px; color:var(--text-secondary, #495057); word-break:break-all; font-family:monospace; white-space: normal;">${escapedDom}</code>
            <button class="vd-copy-btn" style="background: var(--text-primary, #212529); color: white; border: none; height: 34px; border-radius: 4px; font-weight: 500; font-size: 13px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#000'" onmouseout="this.style.background='var(--text-primary, #212529)'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style="margin-right:4px; vertical-align:text-bottom"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Salin Struktur DOM
            </button>
          </div>
        `;

        const btn = selBox.querySelector(".vd-copy-btn");
        btn.onclick = () => copyToClipboard(domString, btn);
      };

      docs.forEach((d) => {
        d.addEventListener("mousemove", mm, true);
        d.addEventListener("mouseup", mu, true);
      });
    };

    docs.forEach((d) => {
      d.addEventListener("mousedown", cvsMD, true);
      d.addEventListener("click", blockClick, true);
      d.addEventListener("contextmenu", handleRightClick, true);
    });

    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stop();
      }
    };

    function stop() {
      VD_STOP = null;
      document.body.classList.remove("vp-on");
      cWrap.remove();
      docs.forEach((d) => {
        d.removeEventListener("keydown", key, true);
        d.removeEventListener("mousedown", cvsMD, true);
        d.removeEventListener("click", blockClick, true);
        d.removeEventListener("contextmenu", handleRightClick, true);
        if (d !== document && d.body) {
          try {
            d.body.classList.remove("vp-on");
          } catch (_) {}
        }
      });
      frameStyleEls.forEach((st) => {
        try {
          st.remove();
        } catch (_) {}
      });
    }

    VD_STOP = stop;
    docs.forEach((d) => d.addEventListener("keydown", key, true));
  }, [getFrameDoc]);
}
