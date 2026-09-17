# VS Code git — vendored source, ON the build path

Source copied from [microsoft/vscode](https://github.com/microsoft/vscode),
`extensions/git/src/`, MIT licensed. `LICENSE.txt` beside this file is theirs,
copied with it.

- Commit: `412766560b24`
- Copied on: 2026-09-11
- Copyright (c) 2015 - present Microsoft Corporation

```
src/git.ts                the Git and Repository classes: every git command
src/util.ts               TRIMMED to the nineteen names git.ts imports
src/api/git.d.ts          the public types (Commit, Ref, Remote, Stash ...)
src/api/git.constants.ts  RefType, Status, GitErrorCodes, ForcePushMode
src/vscode.ts             WOLFSPACE's shim for what git.ts asks of 'vscode'
src/modules.d.ts          type stubs for which@2 and byline@5
```

## This one BUILDS, and vendor/vscode-terminal does not — here is why

The terminal reaches **232 framework modules** on its first hop: the DI
container, the service layer, the theme service. It calls the application it
lives in. `git.ts` reaches **one line**:

```ts
import {
  CancellationError,
  CancellationToken,
  ConfigurationChangeEvent,
  LogOutputChannel,
  Progress,
  Uri,
  workspace,
} from "vscode";
```

Seven names, used lightly — `Uri` for `.fsPath` and `Uri.file()`, a
`CancellationToken` that is read but never made here, `workspace` only for
`getConfiguration('git').get(...)`. Seven things can be written down, and
`src/vscode.ts` writes them down as the _smallest_ shape each use touches.
Everything else git.ts needs is Node (`child_process`, `fs`, `path`) and three
small npm packages (`which`, `byline`, `file-type`).

So this directory is in `build.files` **and** `asarUnpack`, and
`core/git-vscode.ts` constructs it. The terminal stays reference-only; this one
is the command layer WOLFSPACE's git panel runs on.

## What was changed, exactly

Three edits to the copied files, each marked inline:

| file      | change                                                                        |
| --------- | ----------------------------------------------------------------------------- |
| `git.ts`  | `from 'vscode'` → `from './vscode'` (the shim)                                |
| `git.ts`  | `fileTypeFromBuffer` → `fromBuffer as fileTypeFromBuffer` (file-type@16, CJS) |
| `util.ts` | cut at line 548; the vscode import replaced; `isRemote` (reads `env`) removed |

Plus `tsconfig.json` here sets `useUnknownInCatchVariables: false`, which is
what upstream compiles with — a compiler setting, not a source change. The
logic in `git.ts` is **untouched**: 3,435 upstream lines, zero edited.

## What it gave WOLFSPACE

`scripts/ww.ts` had branch list/switch/create/rename/delete and commit-all.
An inventory of the backend found **no** `push`, `pull` or `fetch` anywhere,
no stash list/pop/drop, no log, no diff, no merge. All of it is here, and it
was proven against a real bare remote before the routes were written: push
with upstream, stash create/list/pop, fetch after another clone pushed, pull,
log, diff.

## Updating

Fetch the four upstream files at a newer commit, reapply the three edits
above, update the commit hash here, and run `npx tsc -p vendor/vscode-git`.
`tests/git-vscode.test.ts` is the behavioural check.
