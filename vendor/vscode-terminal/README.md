# VS Code terminal — vendored source

Unmodified source copied from [microsoft/vscode](https://github.com/microsoft/vscode),
MIT licensed. `LICENSE.txt` beside this file is theirs, copied with it.

- Commit: `db46a82c4f4a77c4853867dcdba5057229b5d099`
- Copied on: 2026-08-31
- Copyright (c) 2015 - present Microsoft Corporation

Paths preserved as in the source tree:

```
src/vs/workbench/contrib/terminal/   the terminal UI and its contributions
src/vs/platform/terminal/            the process/PTY layer
```

179 `.ts` files, 51,361 lines.

## This does not build, and is not meant to

It is here as **reference**, not as code on the build path. Nothing in
WOLFSPACE imports it, and it is deliberately outside every scan:

- `build.files` in `package.json` is an allowlist and does not list `vendor/`,
  so none of this reaches the installer
- it sits outside `public/`, so the renderer typecheck never sees it
- it is excluded from the repo's own comment-language and formatting checks

The reason is measured, not assumed. These files import **232 distinct modules
from outside themselves** on the first hop alone — and those modules import
further still. The heaviest pull:

```
478x  vs/base/common              99x  vs/workbench/services
 68x  vs/base/browser             46x  vs/platform/configuration
 43x  vs/platform/instantiation   43x  vs/platform/theme
 31x  vs/platform/log             17x  vs/platform/contextkey
```

`vs/platform/instantiation` is VS Code's dependency-injection container and
`vs/workbench/services` is its service layer. The terminal does not call a
library; it calls the application framework it lives in. Dropping these files
onto a build path yields code that cannot compile, and satisfying the imports
means copying VS Code.

## How it is meant to be used

As the authority to read while building against WOLFSPACE's own xterm and
node-pty — which are the same two components VS Code's terminal is built on.

Already taken from here:

- the 16 ANSI colour values, in `public/app/TemaTerminalVSCode.ts`

Worth reading next, with what each is for:

| file                                              | what to take from it                               |
| ------------------------------------------------- | -------------------------------------------------- |
| `.../terminal/common/terminalColorRegistry.ts`    | colours (done)                                     |
| `.../terminal/common/terminalConfiguration.ts`    | default font, cursor, scrollback                   |
| `.../terminal/browser/links/`                     | how paths and URLs are detected and made clickable |
| `.../terminal/browser/terminalGroup.ts`           | how splits and groups are modelled                 |
| `.../platform/terminal/common/terminalProcess.ts` | the PTY lifecycle contract                         |

## Updating

Re-copy from the same two paths at a newer commit and update the commit hash
above. Nothing here is edited in place — local changes would be lost silently
on the next copy, and would also make it untrue that this is the upstream
source.
