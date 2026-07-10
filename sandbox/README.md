# WOLFSPACE Execution Sandbox (gate #1 for a multi-user platform)

The WOLFSPACE executor runs **arbitrary user code**. For a single local user that's
fine. For a platform serving *other people*, running untrusted code with full host
access is catastrophic. This sandbox isolates each execution in a throwaway Docker
container with **no network, capped CPU/RAM, a read-only filesystem, and a hard
time limit**.

## How it works

When `config.json` has `"sandbox": true` **and** Docker is available, the server
runs Python/JavaScript code like this instead of natively:

```
docker run --rm --network none --memory 256m --memory-swap 256m \
  --cpus 0.5 --pids-limit 128 --read-only --tmpfs /tmp:size=16m \
  -v <tempdir>:/code:ro -w /code WOLFSPACE-sandbox sh -c "python /code/main.py"
```

- `--network none` — no internet / no LAN access
- `--memory 256m` / `--cpus 0.5` — resource caps (can't exhaust the host)
- `--read-only` + `--tmpfs /tmp` — can't write the filesystem (except small /tmp)
- `--user 1000` (in image) — never root
- wall-clock timeout via the server (`EXEC_TIMEOUT`)
- `--rm` — container is destroyed after each run

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

