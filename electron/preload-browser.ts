// preload-browser.ts — runs inside every page the Web Dev browser shows.
//
// ONE JOB: hand the application its keyboard shortcuts back.
//
// The page is a native WebContentsView. When it has focus, every keystroke
// goes to the page and the application never sees it: click into a site and
// Ctrl+Shift+P, Ctrl+J, Escape all die there. A browser inside an editor
// has to do what VS Code's integrated browser does (its preload-browserView):
// listen for keydown events THE PAGE DID NOT HANDLE and forward the ones that
// can only mean an application shortcut, leaving the page everything else.
//
// What is forwarded: a key with Ctrl/Alt/Meta, or Escape, or an F-key, or a
// media key -- and only if the page did not preventDefault it first.
// What is NOT forwarded, ever:
//   - plain keys (typing), and bare modifier presses;
//   - Chromium's own editing shortcuts (Ctrl+C/V/X/A/Z/Y, Ctrl+arrows,
//     Ctrl+Backspace/Delete, Home/End) -- taking those would break every
//     text field on the web;
//   - Alt+Numpad (Windows character codes), Shift+F10 (context menu).
//
// TRUST: this runs in the page's process with contextIsolation ON, so the
// page cannot reach this script, ipcRenderer, or Node. Only `isTrusted`
// events -- real key presses -- are forwarded; a page cannot synthesise an
// application shortcut. The main process re-checks nothing else because it
// receives only {key, code, modifiers}: data, not commands.
import { ipcRenderer } from "electron";

const PAPAN_NATIVE = {
  selalu: new Set([
    "arrowup",
    "arrowdown",
    "arrowleft",
    "arrowright",
    "home",
    "end",
    "backspace",
    "delete",
  ]),
  tanpaShift: new Set(["a", "c", "v", "x", "z", "y"]),
  denganShift: new Set(["v", "z"]),
};

window.addEventListener("keydown", (event: KeyboardEvent) => {
  if (!(event instanceof KeyboardEvent) || !event.isTrusted) return;
  if (event.defaultPrevented) return;

  const kunciBukanKetik =
    event.key === "Escape" ||
    /^F\d+$/.test(event.key) ||
    event.key.startsWith("Audio") ||
    event.key.startsWith("Media") ||
    event.key.startsWith("Browser");
  if (!(event.ctrlKey || event.altKey || event.metaKey) && !kunciBukanKetik)
    return;
  if (
    event.key === "Control" ||
    event.key === "Shift" ||
    event.key === "Alt" ||
    event.key === "Meta"
  )
    return;

  const mac = navigator.platform.indexOf("Mac") >= 0;
  if (event.altKey && !event.ctrlKey && !event.metaKey) {
    if (mac || /^Numpad\d+$/.test(event.code)) return;
  }
  if (
    event.key === "F10" &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey
  )
    return;

  const ctrlCmd = mac ? event.metaKey : event.ctrlKey;
  if (ctrlCmd && !event.altKey) {
    let key = event.key.toLowerCase();
    // A non-Latin layout reports its own letter; fall back to the physical key.
    if (!/^[a-z]$/.test(key) && /^Key[A-Z]$/.test(event.code))
      key = event.code.slice(3).toLowerCase();
    if (
      PAPAN_NATIVE.selalu.has(key) ||
      (event.shiftKey ? PAPAN_NATIVE.denganShift : PAPAN_NATIVE.tanpaShift).has(
        key,
      )
    )
      return;
  }

  event.preventDefault();
  event.stopPropagation();
  ipcRenderer.send("WOLFSPACE:browser-keydown", {
    key: event.key,
    keyCode: event.keyCode,
    code: event.code,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    repeat: event.repeat,
  });
});
