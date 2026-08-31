// Terminal ANSI palette, taken from VS Code.
//
// Source: microsoft/vscode, MIT licensed.
//   src/vs/workbench/contrib/terminal/common/terminalColorRegistry.ts
//   commit db46a82c4f4a77c4853867dcdba5057229b5d099
//   Copyright (c) 2015 - present Microsoft Corporation
// See THIRD-PARTY-NOTICES.md at the repo root for the full notice.
//
// WHY THIS FILE EXISTS. The terminal used to hand xterm five colours -- a
// background, a foreground, a cursor pair and a selection -- and nothing else.
// Everything a program actually prints in colour therefore fell through to
// xterm's own defaults, which is why the output never looked like VS Code
// however closely the surrounding chrome was matched. Colour is not chrome: it
// is what `ls`, `git diff`, a stack trace and every compiler use to carry
// meaning.
//
// WHY ONLY THE VALUES. VS Code's terminal is 179 files and 51,361 lines, and
// its first hop alone reaches 232 modules outside itself -- the workbench
// dependency-injection container, its configuration, theme and context-key
// services. That implementation cannot be lifted. This table can: it is the
// part of it that decides what the terminal LOOKS like, and it is plain data.
//
// The DARK defaults are used. VS Code carries four sets (light, dark, hcDark,
// hcLight) and picks by active theme; WOLFSPACE's terminal surface is dark and
// fixed, so choosing at runtime would be machinery with one possible answer.
// The light values are kept beside each entry as a comment so a light theme
// later does not have to go back to the source to find them.
const TEMA_ANSI_VSCODE: Record<string, string> = {
  black: "#000000", // light: #000000
  red: "#cd3131", // light: #cd3131
  green: "#0DBC79", // light: #107C10
  yellow: "#e5e510", // light: #949800
  blue: "#2472c8", // light: #0451a5
  magenta: "#bc3fbc", // light: #bc05bc
  cyan: "#11a8cd", // light: #0598bc
  white: "#e5e5e5", // light: #555555
  brightBlack: "#666666", // light: #666666
  brightRed: "#f14c4c", // light: #cd3131
  brightGreen: "#23d18b", // light: #14CE14
  brightYellow: "#f5f543", // light: #b5ba00
  brightBlue: "#3b8eea", // light: #0451a5
  brightMagenta: "#d670d6", // light: #bc05bc
  brightCyan: "#29b8db", // light: #0598bc
  brightWhite: "#e5e5e5", // light: #a5a5a5
};

// `terminal.foreground` in the same registry. The BACKGROUND is deliberately
// not taken: VS Code defines it as "falls back to the editor background", so
// there is no VS Code value to copy -- it is whatever theme is loaded. Using
// WOLFSPACE's own surface colour is the faithful equivalent, not a compromise.
const TEMA_TERMINAL_VSCODE: Record<string, string> = {
  ...TEMA_ANSI_VSCODE,
  foreground: "#CCCCCC",
  background: "#181c20",
  cursor: "#ffffff",
  cursorAccent: "#181c20",
  selectionBackground: "rgba(56, 139, 253, 0.4)",
};
