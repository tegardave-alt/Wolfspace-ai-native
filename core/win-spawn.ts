"use strict";
/**
 * win-spawn.ts — starting a child process that might be a .cmd, on Windows.
 *
 * ROLE IN THE SYSTEM. Small and unglamorous, and nothing that spawns a
 * developer tool on Windows works without it.
 *
 * CONNECTS TO
 *   imports  child_process
 *   used by  core/lsp.ts, and anything else spawning an npm-installed binary
 *
 * MEASURED, and not a corner case: spawning an npm-installed language server
 * fails outright on Windows with
 *
 *     spawn EINVAL
 *
 * Since the fix for CVE-2024-27980, Node refuses to spawn `.cmd` and `.bat`
 * files without a shell. And on Windows, `typescript-language-server`,
 * `pyright-langserver`, `yaml-language-server`, `bash-language-server` and
 * `intelephense` are ALL `.cmd` shims — so without this file, every
 * npm-installed language server is unreachable on the platform this app is
 * primarily developed on.
 *
 * ── WHY NOT JUST `shell: true` ──
 *
 * Because Node then concatenates the arguments into one command line WITHOUT
 * quoting them — its own DEP0190 warning says exactly that — and an argument
 * containing a space silently becomes two. This repo has already measured that
 * failure once, in the MCP client: `["-y", "hugging face"]` reached the child as
 * `["-y", "hugging", "face"]`.
 *
 * So cmd.exe is invoked the way Node would have (`/d /s /c`, the whole line
 * wrapped, `windowsVerbatimArguments` so Node does not re-mangle it) — but the
 * line is built here, with every token quoted.
 *
 * ── ON THE SECOND COPY ──
 *
 * agent/mcp-client.ts solved this first, and its version is pinned by tests
 * against exact source patterns, so it is left exactly as it is. What keeps the
 * two from drifting is not a comment: tests/lsp-spawn-windows.test.ts drives
 * BOTH implementations over the same inputs and fails if they ever disagree.
 */

import { spawn } from "child_process";

/**
 * Quote ONE token for a cmd.exe command line.
 *
 * Windows hands a process a command LINE, not an argv array, so every token
 * carrying a separator has to bring its own quotes. Backslashes are special
 * only immediately before a quote, which is why the doubling below is
 * conditional rather than applied everywhere.
 *
 * `%` is deliberately NOT handled. cmd expands %VAR% even inside double quotes
 * and there is no escape for it outside a batch file, so an argument that must
 * contain a literal percent sign cannot survive cmd at all — better that it
 * stay visibly unsupported than be silently half-escaped.
 */
function quoteForCmd(token: any): string {
  const s = String(token == null ? "" : token);
  if (s === "") return '""';
  if (!/[\s"^&|<>()]/.test(s)) return s;
  const inner = s
    // A run of backslashes before a quote doubles, and the quote is escaped.
    .replace(/(\\*)"/g, '$1$1\\"')
    // A trailing run doubles too, so it cannot escape the closing quote.
    .replace(/(\\+)$/, "$1$1");
  return '"' + inner + '"';
}

/** Only .cmd and .bat need the shell, and only on Windows. */
function needsShell(command: any) {
  return (
    process.platform === "win32" && /\.(cmd|bat)$/i.test(String(command || ""))
  );
}

/**
 * spawn(), but a `.cmd` shim starts too.
 *
 * A real executable is spawned DIRECTLY with its arguments as a vector — the
 * safe path, and the one taken on every platform but Windows and by every
 * server that ships a real binary (gopls, rust-analyzer, clangd).
 */
function spawnPortable(command: any, args: any, options: any = {}) {
  const argv = args || [];
  if (!needsShell(command)) return spawn(command, argv, options);
  const line = '"' + [command, ...argv].map(quoteForCmd).join(" ") + '"';
  return spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", line], {
    ...options,
    windowsVerbatimArguments: true,
  });
}

module.exports = { quoteForCmd, needsShell, spawnPortable };

export {};
