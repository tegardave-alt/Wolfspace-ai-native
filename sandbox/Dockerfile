# WOLFSPACE execution sandbox image -- referenced by server.cjs's
# runSandboxed() (SANDBOX_IMAGE = "WOLFSPACE-sandbox") but never actually
# built: this file didn't exist until now, so sandbox/build.ps1 would fail
# immediately on `docker build` (no Dockerfile in context). This completes
# the feature described in sandbox/README.md.
#
# The image itself does NOT set resource/network limits -- those are applied
# by the CALLER at `docker run` time (--network none, --memory, --cpus,
# --read-only, etc., see server.cjs runSandboxed()). This image only needs
# to provide the `python` and `node` binaries and run as a non-root user.
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
