#!/bin/sh
# Git runs GIT_ASKPASS through its own sh, even on Windows (Git for Windows
# bundles one), so a shell wrapper is the portable entry point. The real work
# is in git-askpass.cjs; ELECTRON_RUN_AS_NODE lets electron.exe act as node
# when that is the runtime the server is running under.
ELECTRON_RUN_AS_NODE=1 exec "$WOLFSPACE_ASKPASS_NODE" "$WOLFSPACE_ASKPASS_MAIN" "$@"
