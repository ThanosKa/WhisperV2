# 03: Move the repos into the workspace and run the final check

**What to build:** the three repos live in `~/Desktop/Cursor/Whisper/`, every agent there loads `CODING_STANDARDS.md` from the workspace root, the suite gives the same results as the baseline, and a one-off check confirms the whole step. Follows [Spec: Step 1, housekeeping](../spec.md), items 7-8.

**Blocked by:** 02 (Sync the three repos with GitHub and create the workspace repo)

**Status:** ready-for-agent

- [ ] Runs from a session or shell whose working directory is outside `WhisperV2` (for example `~/Desktop/Cursor/`). If the agent can't, it hands the owner the exact commands instead
- [ ] Right before moving, each repo is checked again: neither ahead of nor behind its remote
- [ ] `WhisperV2`, `WhisperAPP` and `websocket` are moved into `~/Desktop/Cursor/Whisper/` under their current names
- [ ] `CODING_STANDARDS.md` is moved from `WhisperV2` to the workspace root unchanged and committed in the workspace repo
- [ ] `WhisperV2/CLAUDE.md` drops its `@CODING_STANDARDS.md` line (committed); `WhisperAPP` and `websocket` keep their own copies
- [ ] The suite, rerun in the moved `WhisperV2`, gives the same counts as the baseline saved in ticket 01
- [ ] A short shell script in this spec's `assets/` folder checks and passes: every file on the delete list is absent; `WhisperV2` has no `CODING_STANDARDS.md` and no `AGENTS.md`; the workspace is a git repo with `CLAUDE.md`, `CODING_STANDARDS.md` and a `.gitignore` listing the three repos; the three repos sit inside it with clean working trees, neither ahead of nor behind their remotes, except for this ticket's `CLAUDE.md` commit, which the owner is asked about before it is pushed; `git worktree list` in `WhisperV2` shows only the main worktree
- [ ] The owner is told that sessions and Claude Code project memory from the old paths no longer show up
