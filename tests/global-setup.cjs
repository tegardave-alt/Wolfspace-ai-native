// Runs ONCE in the parent jest process, before any worker is spawned.
//
// WHAT HAPPENED. .husky/pre-commit runs `npm test`. Git exports GIT_DIR,
// GIT_INDEX_FILE and GIT_PREFIX to every hook, and child processes inherit
// them. Any test that then shells out to git -- even with `cwd` set to a
// fresh temp directory -- is silently redirected to THE REAL REPOSITORY,
// because GIT_DIR wins over cwd. Measured, on one commit: `git init --bare`
// for a test's fake remote set core.bare=true on the shared config (which
// also killed the main checkout, since worktrees share it); `add .` plus
// `commit -m "chore: initialize workspace"` committed a one-file tree that
// deleted 811 paths; a branch-switch test left HEAD on a branch named "B".
// The same suite is clean under `npx jest` and in CI, where no hook runs --
// which is why nothing ever caught it.
//
// WHY HERE and not tests/setup-jest.cjs: that file runs inside the sandbox,
// where process.env is a copy. Subprocesses read the real one. This is the
// only place that edits the environment every worker is born with.
module.exports = async () => {
  for (const k of Object.keys(process.env)) {
    if (
      /^GIT_(DIR|INDEX_FILE|PREFIX|WORK_TREE|COMMON_DIR|OBJECT_DIRECTORY)$/.test(
        k,
      )
    ) {
      delete process.env[k];
    }
  }
};
