# WOLFSPACE execution sandbox image. Tag: "wolfspace-sandbox" (LOWERCASE --
# Docker repository names may not contain uppercase; an earlier revision used
# "WOLFSPACE-sandbox" in the code, which could never be built at all. Keep
# every reference lowercase: server.cjs, agent/runners.cjs, agent/tools/index.cjs,
# sandbox/build.ps1, sandbox/README.md).
#
# TWO CALLERS use this image, and they are gated DIFFERENTLY -- know which one
# you are exercising before concluding "the sandbox does/doesn't work":
#
#   1. server.cjs runSandboxed() + agent/runners.cjs  (Python/JS code execution)
#      Gate: config.json "sandbox": true  AND  docker available.
#      NOTE: "sandbox" is currently unset in BOTH config.json and
#      config.docker.json, so this path is inactive by default.
#
#   2. agent/tools/index.cjs _runBashInDocker()  (bash tool, workspace-confined)
#      Gate: a confined workspace root  AND  docker available  AND
#      WW_BASH_NATIVE !== "1". No config flag -- this one self-activates
#      whenever Docker is running, and falls back to a regex guard when not.
#
# The image itself does NOT set resource/network limits -- those are applied
# by the CALLER at `docker run` time (--network none, --memory, --cpus,
# --read-only, etc.). This image only needs to provide the `python` and `node`
# binaries and run as a non-root user.
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      python-is-python3 \
    && rm -rf /var/lib/apt/lists/*

# Matches the README's documented "--user 1000" -- baked into the image
# instead of passed at `docker run` time, since server.cjs's actual args
# don't include --user (see runSandboxed()). node:*-bookworm-slim already
# ships a "node" user at exactly uid 1000 -- creating a new one collides
# (useradd exit 4: UID not unique).
USER node

WORKDIR /code
