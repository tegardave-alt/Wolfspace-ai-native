// VisualTools — extracted from app.tsx: useVisualPicker and useVisualDraw, plus
// their module-level guards (VP_STOP/VD_STOP). Loaded via APP_MODULES,
// concatenated after app.tsx into one scope. Function declarations hoist; the
// `let` guards are only touched during interaction (a click), so they are always
// initialised by then. Used by App via startPicker / startVisualDraw.

/* ----------------------------- Visual Picker ----------------------------- */
// Module-level guard: only ONE picker can ever be active, so re-clicking the
// sidebar item toggles it off instead of stacking capture-listeners that would
// keep swallowing clicks (the "chat becomes unclickable" bug).
let VP_STOP: (() => void) | null = null;
// getFrameDoc (optional): returns the preview iframe's contentDocument (the Web
// Dev Live Browser) when it is open and same-origin. Without it the picker only
// watches WOLFSPACE own document — hovering over the iframe only identifies the
// <iframe> element itself, not anything INSIDE the page it renders.
function useVisualPicker(getFrameDoc?: () => Document | null) {
  return useCallback(() => {
    if (VP_STOP) {
      VP_STOP();
      return;
    } // already active ? toggle off
    const docs = [document];
    try {
      const frameDoc = getFrameDoc && getFrameDoc();
      // .defaultView is null for a cross-origin document (the browser refuses
      // access before we even get here) — this check also covers a "dead" or
      // detached document.
    } catch (_) {
      // Cross-origin (the preview points at an external URL rather than a
      // same-origin local file):
      // the picker keeps working within WOLFSPACE alone, without throwing an
      // error at the user.
    }
    let hover: Element | null = null;
    const cleanHovers = () =>
      docs.forEach((d: any) =>
        d
          .querySelectorAll(".vp-hover")
          .forEach((el: any) => el.classList.remove("vp-hover")),
      );
    const move = (e: any) => {
      const el = e.target;
      if (hover && hover !== el) hover.classList.remove("vp-hover");
      hover = el;
      el.classList.add("vp-hover");
    };
    // real classes only (drop the picker's own vp-* runtime classes)
    const realCls = (el: any) =>
      typeof el.className === "string"
        ? el.className
            .trim()
            .split(/\s+/)
            .filter((c: any) => c && !/^vp-/.test(c))
        : [];
    const seg = (el: any) => {
      if (el.id) return "#" + el.id;
      let s = el.tagName.toLowerCase();
      const cls = realCls(el);
      if (cls.length) s += "." + cls.join(".");
      const p = el.parentElement; // disambiguate same-tag siblings
      if (p) {
        const same = Array.from(p.children).filter(
          (c: any) => c.tagName === el.tagName,
        );
        if (same.length > 1)
          s += ":nth-of-type(" + (same.indexOf(el) + 1) + ")";
      }
      return s;
    };
    // Build a selector that actually identifies the element: if it has no id/class,
    // walk up to the nearest classed/ided ancestor so "p" becomes ".composer-hint > p".
    const sel = (el: any) => {
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
    const click = (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.target,
        selector = sel(el);

      let d = "";

      // Include the DOM structure so the agent can find it in the source.
      let htmlSnippet = el.outerHTML || "";
      if (htmlSnippet) {
        // Truncate htmlSnippet when it is too long, while keeping its structure
        if (htmlSnippet.length > 300) {
          htmlSnippet = htmlSnippet.slice(0, 300) + "...";
        }
        d = "Struktur DOM:\n```html\n" + htmlSnippet + "\n```";
      }

      try {
        // writeText() returns a Promise — try/catch does NOT catch an async
        // rejection
        // ("Document is not focused", for one). The .catch keeps it from
        // becoming an unhandledrejection, which used to trigger auto-rollback
        // (the app reloading itself mid-run).
        navigator.clipboard &&
          navigator.clipboard.writeText(d).catch(function () {});
      } catch (_) {}
      stop();
      // Use the tidy alert.
      setTimeout(
        () => alert("Element details copied to clipboard!\n\n" + selector),
        0,
      );
    };
    const key = (e: any) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stop();
      }
    };
    // A page inside the iframe has its own <head> and never receives
    // WOLFSPACE's styles.css, so the crosshair cursor and hover outline are
    // injected straight into it — as plain values rather than CSS var(), since
    // those vars are undefined in another document.
    const frameStyleEls: any[] = [];
    docs.forEach((d: any) => {
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
      docs.forEach((d: any) => {
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
    docs.forEach((d: any) => {
      if (d.body) d.body.classList.add("vp-on");
      d.addEventListener("mouseover", move, true);
      d.addEventListener("click", click, true);
      d.addEventListener("keydown", key, true);
    });
  }, [getFrameDoc]);
}

/* ----------------------------- Visual Draw ----------------------------- */
let VD_STOP: (() => void) | null = null;
// getFrameDoc (optional): as with Visual Picker, the preview iframe document
// (the Web Dev Live Browser) when it is open and same-origin, so drawing a box
// OVER the rendered page also works — a mouse event above the iframe lands in
// the iframe's document, not in WOLFSPACE's.
function useVisualDraw(getFrameDoc?: () => Document | null) {
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
      /* cross-origin: draw keeps working within WOLFSPACE alone */
    }
    // Convert event coordinates to WOLFSPACE viewport (parent) coordinates. Events
    // inside the iframe carry clientX/Y relative to the IFRAME viewport, so they
    // are offset by
    // posisi elemen <iframe> di parent.
    const toParentXY = (ev: any) => {
      try {
        if (ev.view && ev.view !== window && ev.view.frameElement) {
          const fr = ev.view.frameElement.getBoundingClientRect();
          return { x: ev.clientX + fr.left, y: ev.clientY + fr.top };
        }
      } catch (_) {}
      return { x: ev.clientX, y: ev.clientY };
    };

    // Switch the global cursor to a crosshair to signal the active mode.
    document.body.classList.add("vp-on");
    // An iframe has its own <head>/<body>: inject the cursor and mark its body too.
    const frameStyleEls: any[] = [];
    docs.forEach((d: any) => {
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
      pointerEvents: "none", // let events reach the document so useCapture can intercept them
    });

    const activeSelections = document.createElement("div");
    Object.assign(activeSelections.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
    });
    cWrap.appendChild(activeSelections);

    document.body.appendChild(cWrap);

    // This used to snap to a 24px grid, so the final box "jumped" up to ±12px
    // from what was drawn (the reported complaint: the position did not match
    // the coordinates). Now it is 1px precise.
    const snap = (v: any) => Math.round(v);

    const copyToClipboard = (domString: string, btnElement: any) => {
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

      const fallbackCopy = (text: string) => {
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

    const checkSidebarClick = (e: any) => {
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

    // Block every click in the app (except the sidebar and the draw UI)
    const blockClick = (e: any) => {
      if (checkSidebarClick(e)) return;
      if (e.target.closest(".ui-panel")) return;
      e.preventDefault();
      e.stopPropagation();
    };

    const handleRightClick = (e: any) => {
      if (checkSidebarClick(e)) return;
      if (e.target.closest(".ui-panel")) return;

      e.preventDefault();
      e.stopPropagation();
      if (activeSelections.children.length > 0) {
        activeSelections.innerHTML = "";
      }
    };

    const cvsMD = (e: any) => {
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

      const mm = (ev: any) => {
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

      const mu = (ev: any) => {
        ev.preventDefault();
        ev.stopPropagation();
        docs.forEach((d: any) => {
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
        // The probe point is the CENTRE of the final box, not where the mouse
        // was released: it represents the drawn area and does not miss when the
        // mouse is let go slightly outside the box. For the IFRAME document,
        // frame-local coordinates are used (the rendered page's elements).
        const cx = finalX + r.left + finalW / 2;
        const cy = finalY + r.top + finalH / 2;
        let targetEl = null,
          targetDoc = document,
          frRect = null;
        try {
          const fd = docs.find((d: any) => d !== document);
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
        const realCls = (el: any) =>
          typeof el.className === "string"
            ? el.className
                .trim()
                .split(/\s+/)
                .filter((c: any) => c && !/^vp-/.test(c))
            : [];
        const seg = (el: any) => {
          if (el.id) return "#" + el.id;
          let s = el.tagName.toLowerCase();
          const cls = realCls(el);
          if (cls.length) s += "." + cls.join(".");
          const p = el.parentElement;
          if (p) {
            const same = Array.from(p.children).filter(
              (c: any) => c.tagName === el.tagName,
            );
            if (same.length > 1)
              s += ":nth-of-type(" + (same.indexOf(el) + 1) + ")";
          }
          return s;
        };
        const sel = (el: any) => {
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
        // An element rect inside the iframe is in FRAME viewport coordinates — shift to
        // parent coordinates, to stay consistent with finalX/finalY (the overlay's).
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
              Copy DOM Structure
            </button>
          </div>
        `;

        // querySelector returns Element | null, and Element has no onclick.
        // Narrowed to HTMLElement so the assignment is real rather than assumed.
        const btn = selBox.querySelector(".vd-copy-btn") as HTMLElement | null;
        if (btn) btn.onclick = () => copyToClipboard(domString, btn);
      };

      docs.forEach((d: any) => {
        d.addEventListener("mousemove", mm, true);
        d.addEventListener("mouseup", mu, true);
      });
    };

    docs.forEach((d: any) => {
      d.addEventListener("mousedown", cvsMD, true);
      d.addEventListener("click", blockClick, true);
      d.addEventListener("contextmenu", handleRightClick, true);
    });

    const key = (e: any) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stop();
      }
    };

    function stop() {
      VD_STOP = null;
      document.body.classList.remove("vp-on");
      cWrap.remove();
      docs.forEach((d: any) => {
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
    docs.forEach((d: any) => d.addEventListener("keydown", key, true));
  }, [getFrameDoc]);
}
