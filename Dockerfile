# ── WOLFSPACE hosted image ──
# Runs the whole app (server.cjs + agent/ + public/) in a container, for the
# "hosted / multi-user" deployment target -- complementary to the Electron
# desktop build (electron/main.js), not a replacement for it. See README.md
# "Security" section: this container boundary is what gives capability_exec
# and sandbox_run a REAL outer wall on top of their own (partial) guarantees.
#
# HONEST SCOPE: this image runs the Node/JS core and Python code execution.
# It does NOT install Go/Java/Rust/PHP/C/C++ toolchains -- config.docker.json
# leaves those runners unset, so `runners.cjs` will report them unavailable
# rather than silently failing. Add apt packages below if you need them.
FROM node:20-bookworm-slim AS base

# build-essential + python3: node-pty (native addon) needs a compiler to
# build from source if no prebuilt binary matches this image's ABI; python3
# doubles as both a node-gyp requirement and the actual Python code-execution
# runner WOLFSPACE itself uses.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      build-essential \
      git \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better layer caching): only package*.json here.
COPY package.json package-lock.json* ./
# package.json's "prepare" script runs the `husky` binary on every
# `npm install`, but husky is a devDependency skipped by --omit=dev, so the
# binary doesn't exist at all (HUSKY=0 doesn't help -- that only silences
# husky's OWN setup logic once it's running, and it never gets that far).
# Delete the script for this build rather than --ignore-scripts globally,
# which would also skip node-pty's native postinstall build and break it.
RUN npm pkg delete scripts.prepare
RUN npm install --omit=dev --no-audit --no-fund \
      --fetch-retries=5 --fetch-retry-mintimeout=5000 --fetch-retry-maxtimeout=60000

# App source.
COPY server.cjs ./
COPY server/ ./server/
COPY agent/ ./agent/
COPY public/ ./public/
COPY config.docker.json ./config.json

ENV NODE_ENV=production
ENV PORT=8090
ENV HOST=0.0.0.0
# cloud-keys.json resolver (agent/keys-path.cjs) defaults to ~/.wolfspace;
# HOME isn't meaningfully "yours" in a container, so pin it explicitly and
# mount a volume there if keys should survive a container restart.
ENV WOLFSPACE_KEYS_DIR=/data/.wolfspace

# Jalankan sebagai NON-ROOT. Image ini dulu berjalan sebagai uid 0 — bisa
# ditoleransi saat hanya dipakai sendiri di mesin lokal, tapi tidak untuk
# deployment yang menghadap internet: apa pun yang lolos dari agent langsung
# mewarisi root di dalam container. Image sandbox (sandbox/Dockerfile) sudah
# memakai USER node sejak awal; ini menyamakannya.
#
# /data HARUS di-chown SEBELUM pindah user: Docker membuat direktori VOLUME
# sebagai root, jadi tanpa ini penulisan cloud-keys.json akan gagal EACCES
# saat runtime — dan gagalnya diam-diam, saat user menyimpan kunci pertamanya.
RUN mkdir -p /data/.wolfspace \
    && chown -R node:node /data /app
USER node

EXPOSE 8090
VOLUME ["/data"]

# Healthcheck memakai PORT dari env, bukan angka tetap — host container
# menyuntikkan port sendiri, dan probe ke 8090 yang di-hardcode akan selalu
# gagal di sana lalu memicu restart beruntun.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.PORT||8090,path:'/healthz'},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.cjs"]
