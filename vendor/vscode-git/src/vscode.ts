// vscode.ts — the seven things git.ts asks of the VS Code API, provided here.
//
// WHY THIS FILE EXISTS. vendor/vscode-git/src/git.ts is copied from the VS Code
// git extension and imports exactly one line from 'vscode':
//
//   import { CancellationError, CancellationToken, ConfigurationChangeEvent,
//            LogOutputChannel, Progress, Uri, workspace } from 'vscode'
//
// Everything else it needs is Node (child_process, fs, path) and three small npm
// packages. That is what makes this file different from vendor/vscode-terminal,
// which is reference only: the terminal reaches 232 framework modules on its
// first hop, git.ts reaches these seven, and seven can be written down.
//
// Each shim is the SMALLEST shape git.ts actually touches, measured by reading
// its uses -- not the full VS Code type. Uri is used for .fsPath and
// Uri.file(); a CancellationToken is read, never created here; workspace only
// answers getConfiguration('git').get(...). Nothing below pretends to be more
// than that.

import * as path from "path";
import { EventEmitter as NodeEmitter } from "events";

/** The one-argument listener shape VS Code calls Event<T>. */
export type Event<T> = (
  listener: (e: T) => any,
  thisArgs?: any,
  disposables?: Disposable[],
) => Disposable;

export interface Disposable {
  dispose(): any;
}

/**
 * VS Code's EventEmitter, on Node's. `event` is the subscribe function git.ts
 * hands out; `fire` is what it calls.
 */
export class EventEmitter<T> {
  private readonly _e = new NodeEmitter();
  readonly event: Event<T> = (listener, thisArgs, disposables) => {
    const bound = thisArgs ? listener.bind(thisArgs) : listener;
    this._e.on("e", bound);
    const d: Disposable = { dispose: () => this._e.off("e", bound) };
    if (disposables) disposables.push(d);
    return d;
  };
  fire(data: T): void {
    this._e.emit("e", data);
  }
  dispose(): void {
    this._e.removeAllListeners();
  }
}

/** Just enough of Uri: a file path, and the two ways git.ts asks for it. */
export class Uri {
  readonly scheme = "file";
  /** Always empty for a local file. git.ts compares it to tell remote URIs apart. */
  readonly authority = "";
  private constructor(readonly fsPath: string) {}
  /** The posix-style path VS Code exposes beside fsPath. */
  get path(): string {
    return this.fsPath.split(path.sep).join("/");
  }
  static file(p: string): Uri {
    return new Uri(path.resolve(p));
  }
  static parse(s: string): Uri {
    return Uri.file(s.startsWith("file://") ? s.slice(7) : s);
  }
  with(_change: any): Uri {
    return this;
  }
  toString(): string {
    return "file://" + this.fsPath.split(path.sep).join("/");
  }
}

export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  readonly onCancellationRequested: Event<any>;
}

export class CancellationError extends Error {
  constructor() {
    super("Canceled");
    this.name = "Canceled";
  }
}

/** A token that never cancels -- what callers pass when they have none. */
export const CancellationTokenNone: CancellationToken = {
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose() {} }),
};

export interface Progress<T> {
  report(value: T): void;
}

export interface ConfigurationChangeEvent {
  affectsConfiguration(section: string): boolean;
}

/**
 * The log channel git.ts writes to. Routed to console, which in WOLFSPACE is
 * intercepted by server.ts and lands in the debug log with everything else.
 */
export interface LogOutputChannel {
  trace(...args: any[]): void;
  debug(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
}
export const logChannel: LogOutputChannel = {
  trace: () => {},
  debug: () => {},
  info: (...a) => console.log("[git]", ...a),
  warn: (...a) => console.warn("[git]", ...a),
  error: (...a) => console.error("[git]", ...a),
};

/**
 * workspace.getConfiguration('git'). git.ts reads a handful of keys; the
 * defaults here are VS Code's own defaults for each, so behaviour matches what
 * the extension does out of the box. WOLFSPACE can override any of them by
 * calling setGitConfig() before the Git object is built.
 */
const _konfigGit: Record<string, any> = {
  path: null,
  autofetch: false,
  untrackedChanges: "mixed",
  showProgress: false,
  postCommitCommand: "none",
  useEditorAsCommitInput: false,
  commandsToLog: [],
};
export function setGitConfig(key: string, value: any): void {
  _konfigGit[key] = value;
}
export const workspace = {
  getConfiguration(_section?: string, _scope?: any) {
    return {
      get<T>(key: string, fallback?: T): T {
        return (key in _konfigGit ? _konfigGit[key] : fallback) as T;
      },
    };
  },
  // git.ts subscribes to this to reload on settings change. WOLFSPACE has no
  // settings UI for git, so it never fires; the subscription still needs a
  // disposable to hand back.
  onDidChangeConfiguration: ((_l: any) => ({
    dispose() {},
  })) as Event<ConfigurationChangeEvent>,
  workspaceFolders: undefined as any,
  isTrusted: true,
};
