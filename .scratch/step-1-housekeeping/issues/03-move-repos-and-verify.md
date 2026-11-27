# 03: Move the repos into the workspace and run the final check

**What to build:** the three repos live in `~/Desktop/Cursor/Whisper/`, every agent there loads `CODING_STANDARDS.md` from the workspace root, the suite gives the same results as the baseline, and a one-off check confirms the whole step. Follows [Spec: Step 1, housekeeping](../spec.md), items 7-8.

**Blocked by:** 02 (Sync the three repos with GitHub and create the workspace repo)

**Status:** resolved

**Model:** Sonnet (run `/model sonnet` before `/implement`)

- [x] Runs from a session or shell whose working directory is outside `WhisperV2` (for example `~/Desktop/Cursor/`). If the agent can't, it hands the owner the exact commands instead
- [x] Right before moving, each repo is checked again: neither ahead of nor behind its remote
- [x] `WhisperV2`, `WhisperAPP` and `websocket` are moved into `~/Desktop/Cursor/Whisper/` under their current names
- [x] `CODING_STANDARDS.md` is moved from `WhisperV2` to the workspace root unchanged and committed in the workspace repo
- [x] `WhisperV2/CLAUDE.md` drops its `@CODING_STANDARDS.md` line on a branch made from `dev`, which goes to `dev` as a PR and is merged (see the map's Branches note); `WhisperAPP` and `websocket` keep their own copies
- [x] The suite, rerun in the moved `WhisperV2`, gives the same counts as the baseline saved in ticket 01
- [x] A short shell script in this spec's `assets/` folder checks and passes: every file on the delete list is absent; `WhisperV2` has no `CODING_STANDARDS.md` and no `AGENTS.md`; the workspace is a git repo with `CLAUDE.md`, `CODING_STANDARDS.md` and a `.gitignore` listing the three repos; the three repos sit inside it with clean working trees, neither ahead of nor behind their remotes (for `WhisperV2`, its `dev` branch); `git worktree list` in `WhisperV2` shows only the main worktree
- [x] The owner is told that sessions and Claude Code project memory from the old paths no longer show up

## Comments

- Done from the original session, not a new one: a temporary symlink at the old `WhisperV2` path kept the session working during the move, and was removed before the final check. A second Claude Code session open in `WhisperV2` was closed by the owner first.
- Workspace commit `82c93fa` adds `CODING_STANDARDS.md`. `WhisperV2/CLAUDE.md` dropped its `@CODING_STANDARDS.md` line in PR #4, merged into `dev`.
- Suite in the moved repo matches the baseline: root Jest 13 suites / 124 tests, `whisper_web` Jest 49, `whisper_web` lint and type-check clean, root lint exit 127 as before (`eslint` not installed, step 3).
- `assets/check-structure.sh` prints PASS (21 checks).
- The owner was told that sessions and Claude Code project memory from the old paths no longer show up.
