# WOLFSPACE Execution Sandbox (gate #1 for a multi-user platform)

The WOLFSPACE executor runs **arbitrary user code**. For a single local user that's
fine. For a platform serving _other people_, running untrusted code with full host
access is catastrophic. This sandbox isolates each execution in a throwaway Docker
container with **no network, capped CPU/RAM, a read-only filesystem, and a hard
time limit**.

## How it works

There are **two independent callers** of this image, gated differently. Knowing
which one you are testing matters — otherwise "the sandbox doesn't work" is
ambiguous.

| Caller                                                                     | Gate                                                                                | Active by default?                                                         |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `server.cjs runSandboxed()` + `agent/runners.cjs` — Python/JS execution    | `config.json` `"sandbox": true` **and** Docker available                            | **No** — `sandbox` is unset in both `config.json` and `config.docker.json` |
| `agent/tools/index.cjs _runBashInDocker()` — bash tool, workspace-confined | a confined workspace root **and** Docker available **and** `WW_BASH_NATIVE !== "1"` | **Yes** — no config flag; self-activates whenever Docker runs              |

The second path falls back to a regex guard (leaky, defense-in-depth only) when
Docker is unavailable — so bash stays confined either way, just less strongly.

### Path 1 — Python/JS execution

When `config.json` has `"sandbox": true` **and** Docker is available, the server
runs Python/JavaScript code like this instead of natively:

```
docker run --rm --network none --memory 256m --memory-swap 256m \
  --cpus 0.5 --pids-limit 128 --read-only --tmpfs /tmp:size=16m \
  -v <tempdir>:/code:ro -w /code wolfspace-sandbox sh -c "python /code/main.py"
```

- `--network none` — no internet / no LAN access
- `--memory 256m` / `--cpus 0.5` — resource caps (can't exhaust the host)
- `--read-only` + `--tmpfs /tmp` — can't write the filesystem (except small /tmp)
- `--user 1000` (in image) — never root
- wall-clock timeout via the server (`EXEC_TIMEOUT`)
- `--rm` — container is destroyed after each run

### Path 2 — bash tool, workspace-confined

When the agent runs `bash` against a confined workspace and Docker is available,
`agent/tools/index.cjs` mounts **only that workspace folder** and runs:

```
docker run --rm --network none --memory 512m --memory-swap 512m \
  --cpus 1 --pids-limit 256 --read-only --tmpfs /tmp:size=64m \
  -v <workspaceRoot>:/work -w /work wolfspace-sandbox sh -c "<cmd>"
```

Differences from path 1: the mount is **read-write** (the agent edits files in
its workspace) and limits are higher (512m / 1 cpu). Set `WW_BASH_NATIVE=1` to
force the native path instead. Override the image with `WW_SANDBOX_IMAGE`.

> **Deploying the whole app inside Docker?** `-v <workspaceRoot>:/work` is
> resolved by the **daemon**, i.e. on the _host_ filesystem. A path that is
> valid inside the app container will silently mount empty unless the daemon
> can see the same path (shared named volume, or an identical bind-mount path
> on both sides). The shipped `Dockerfile` installs no Docker client and mounts
> no socket, so in that deployment both paths fall back to non-Docker execution
> and the container itself is the only boundary.

## Setup (one time)

1. **Install Docker Desktop** (needs WSL2 + virtualization enabled):

   ```powershell
   winget install Docker.DockerDesktop
   ```

   Then **launch Docker Desktop once**, accept the terms, and wait until it says
   "Engine running". (If WSL2 is missing: run `wsl --install` in an admin
   PowerShell, reboot, then start Docker Desktop.)

2. **Build the sandbox image**:

   ```powershell
   powershell C:\Users\dave\WOLFSPACE\sandbox\build.ps1
   ```

3. **Enable it** — set `"sandbox": true` in `config.json`, then restart WOLFSPACE.

## Status / roadmap

- v1: Python + JavaScript run sandboxed. Other languages still run natively
  (will be added to the image next).
- Next gates for a platform: per-user auth + isolation, per-request resource
  quotas, an extension/MCP API, and cloud hosting (a laptop can't host a public
  service).
