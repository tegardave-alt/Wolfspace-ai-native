// MenuTeks.ts — the right-click menu of every plain text field: Undo, Redo,
// Cut, Copy, Paste, Select All.
//
// WHY IT EXISTS. A browser gives an <input> or <textarea> a native right-click
// menu; Electron gives it NOTHING. So the chat composer, the rename box, the
// filter fields — every text field that is not Monaco — answered a right-click
// with silence, and "copy" meant remembering the shortcut. Monaco is not
// affected: it draws its own menu (Cut/Copy/Paste are in it) and is skipped
// here.
//
// THE REFERENCE. VS Code hit the same gap and closed it with
// src/vs/workbench/browser/actions/textInputActions.ts: one `contextmenu`
// listener on the window, a check that the target is a textarea or a text
// input, and a menu of six actions. Undo/Redo/Cut/Copy/Select All go through
// document.execCommand -- still the only way to do them so that the browser's
// own undo stack, and React's onChange, see the change. Paste reads the
// clipboard itself (execCommand("paste") is refused in a web renderer) and
// splices the text in at the selection, then dispatches an `input` event so
// the field's owner learns of it. This file is that design, without the
// action/keybinding services around it.

const MENU_TEKS_ID = "menu-teks";

/** A text field, as VS Code's TextInputActionsProvider decides it. */
function bidangTeks(el: any): HTMLTextAreaElement | HTMLInputElement | null {
  if (!el || typeof el.closest !== "function") return null;
  if (el.tagName === "TEXTAREA") {
    // Monaco's hidden input area: its editor has a menu of its own.
    if (el.classList.contains("inputarea")) return null;
    return el;
  }
  if (el.tagName === "INPUT") {
    const t = String(el.type || "text").toLowerCase();
    if (["text", "search", "url", "email", "tel", "password", ""].includes(t))
      return el;
  }
  return null;
}

function tutupMenuTeks() {
  const m = document.getElementById(MENU_TEKS_ID);
  if (m) m.remove();
}

/**
 * Paste, as VS Code does it in a web renderer: read the clipboard, splice at
 * the selection, tell the field's owner through an `input` event. The
 * `insertText` command is tried FIRST -- it keeps the browser's undo stack
 * intact, which the splice cannot -- and the splice is the fallback for
 * fields where the command is refused.
 */
async function tempelKe(el: any): Promise<boolean> {
  let teks = "";
  try {
    teks = await navigator.clipboard.readText();
  } catch (_) {
    return false;
  }
  if (!teks) return true;
  el.focus();
  try {
    if (document.execCommand("insertText", false, teks)) return true;
  } catch (_) {}
  const a = el.selectionStart == null ? el.value.length : el.selectionStart;
  const b = el.selectionEnd == null ? a : el.selectionEnd;
  // React listens for the native `input` event through the value setter of
  // the prototype; assigning through it is what makes onChange fire.
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  const nilai = el.value.slice(0, a) + teks + el.value.slice(b);
  if (desc && desc.set) desc.set.call(el, nilai);
  else el.value = nilai;
  try {
    el.setSelectionRange(a + teks.length, a + teks.length);
  } catch (_) {}
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

/** The six actions, in VS Code's order and with VS Code's separators. */
function aksiMenuTeks(el: any) {
  const adaSeleksi =
    el.selectionStart != null && el.selectionEnd !== el.selectionStart;
  const perintah = (nama: string) => () => {
    el.focus();
    try {
      document.execCommand(nama);
    } catch (_) {}
  };
  return [
    { label: "Undo", jalankan: perintah("undo") },
    { label: "Redo", jalankan: perintah("redo") },
    { pemisah: true },
    {
      label: "Cut",
      jalankan: perintah("cut"),
      mati: !adaSeleksi || el.readOnly,
    },
    { label: "Copy", jalankan: perintah("copy"), mati: !adaSeleksi },
    { label: "Paste", jalankan: () => tempelKe(el), mati: !!el.readOnly },
    { pemisah: true },
    { label: "Select All", jalankan: perintah("selectAll") },
  ];
}

/**
 * Selected text that is NOT in a field -- a chat reply, a label, a tool's
 * output. A browser offers Copy for that; Electron offers nothing. One
 * action, because there is nothing else to do with read-only text. Monaco's
 * selections are left to Monaco.
 */
function seleksiBiasa(target: any): string {
  try {
    if (target && target.closest && target.closest(".monaco-editor")) return "";
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return "";
    const teks = sel.toString();
    if (!teks) return "";
    const n = sel.anchorNode as any;
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    if (el && el.closest && el.closest(".monaco-editor")) return "";
    return teks;
  } catch (_) {
    return "";
  }
}

function aksiMenuSeleksi(teks: string) {
  return [
    {
      label: "Copy",
      jalankan: () => {
        try {
          if (document.execCommand("copy")) return;
        } catch (_) {}
        try {
          navigator.clipboard.writeText(teks);
        } catch (_) {}
      },
    },
  ];
}

function bukaMenuTeks(el: any, x: number, y: number, aksi?: any[]) {
  tutupMenuTeks();
  const menu = document.createElement("div");
  menu.id = MENU_TEKS_ID;
  menu.className = "pohon-menu menu-teks";
  menu.setAttribute("role", "menu");
  for (const a of aksi || aksiMenuTeks(el)) {
    if ((a as any).pemisah) {
      const s = document.createElement("div");
      s.className = "menu-teks-pemisah";
      menu.appendChild(s);
      continue;
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pohon-menu-opsi menu-teks-opsi";
    b.setAttribute("role", "menuitem");
    b.textContent = (a as any).label;
    if ((a as any).mati) b.disabled = true;
    // mousedown, not click: a click would first blur the field, and with the
    // blur goes the selection that Cut and Copy are about to use.
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", (e) => {
      e.preventDefault();
      tutupMenuTeks();
      (a as any).jalankan();
    });
    menu.appendChild(b);
  }
  menu.addEventListener("contextmenu", (e) => e.preventDefault());
  document.body.appendChild(menu);
  // Kept on screen: flipped up or left when the pointer is near an edge.
  const r = menu.getBoundingClientRect();
  const kiri = Math.max(4, Math.min(x, window.innerWidth - r.width - 4));
  const atas = Math.max(4, Math.min(y, window.innerHeight - r.height - 4));
  menu.style.left = kiri + "px";
  menu.style.top = atas + "px";
}

let _menuTeksTerpasang = false;
/** Once per window. Idempotent, so a re-render cannot stack listeners. */
function installMenuTeks() {
  if (_menuTeksTerpasang || typeof document === "undefined") return;
  _menuTeksTerpasang = true;
  document.addEventListener(
    "contextmenu",
    (e: any) => {
      const el = bidangTeks(e.target);
      if (el) {
        e.preventDefault();
        e.stopPropagation();
        bukaMenuTeks(el, e.clientX, e.clientY);
        return;
      }
      const teks = seleksiBiasa(e.target);
      if (!teks) return;
      e.preventDefault();
      e.stopPropagation();
      bukaMenuTeks(null, e.clientX, e.clientY, aksiMenuSeleksi(teks));
    },
    true,
  );
  document.addEventListener(
    "mousedown",
    (e: any) => {
      const m = document.getElementById(MENU_TEKS_ID);
      if (m && !m.contains(e.target)) tutupMenuTeks();
    },
    true,
  );
  document.addEventListener("keydown", (e: any) => {
    if (e.key === "Escape") tutupMenuTeks();
  });
  window.addEventListener("blur", tutupMenuTeks);
  window.addEventListener("resize", tutupMenuTeks);
}

if (typeof window !== "undefined") {
  (window as any).__wolfspaceMenuTeks = {
    installMenuTeks,
    tempelKe,
    bidangTeks,
    seleksiBiasa,
  };
}
