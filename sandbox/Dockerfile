# Quantum execution sandbox — runs UNTRUSTED user code in isolation.
# Minimal, non-root. Network/filesystem/limits are enforced at `docker run` time
# (see sandbox/README.md), not here. Keep this image lean.
FROM python:3.12-slim

# Node.js for JavaScript snippets (Debian's packaged node is fine for short scripts)
RUN apt-get update \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# Run as an unprivileged user — never root inside the sandbox
RUN useradd -m -u 1000 runner
USER runner
WORKDIR /code

# No ENTRYPOINT: the command is supplied per-run by the server
# (e.g. `python /code/main.py` or `node /code/main.js`).
