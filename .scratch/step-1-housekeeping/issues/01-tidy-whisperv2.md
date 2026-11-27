# 01: Tidy WhisperV2 and delete the old docs

**What to build:** `WhisperV2`'s `main` has no old docs, a clean working tree and a short temporary `CLAUDE.md`, and the app's suite gives the same results as before. Follows [Spec: Step 1, housekeeping](../spec.md), items 1-4.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Model:** Sonnet (run `/model sonnet` before `/implement`)

- [ ] Before any change: the suite's baseline (root Jest, `whisper_web` Jest, root lint, `whisper_web` lint, `whisper_web` type-check) is run against the installed `node_modules`, and its pass/fail counts are saved to this spec's `assets/` folder
- [ ] The uncommitted `whisper_web` ESLint config change is committed on a local branch `wip/whisper-web-lint-rules` (not merged, not pushed), and `main` has the committed config back
- [ ] The whitespace-only `package-lock.json` change is discarded (check `git diff -w` is empty first)
- [ ] `.claude/worktrees/` is in `.gitignore`
- [ ] The three research worktrees are removed after checking none has uncommitted changes (unlock the locked one first); the `research/*` branches still exist
- [ ] Every file on the delete list in "Which docs to keep, merge or delete" (cleanup map ticket 06) is deleted; `README.md`, `docs/agents/`, `.claude/agents/`, `.github/` and `.scratch/` are untouched
- [ ] `CLAUDE.md` is the temporary version: cleanup in progress with a pointer to the cleanup map, real files arrive in step 8, the "Agent skills" section word for word. It no longer mentions `AGENTS.md` or `.cursor/`. It **keeps** the `@CODING_STANDARDS.md` line until ticket 03, so no agent loses the rules in between
- [ ] `CODING_STANDARDS.md` stays where it is, untracked (ticket 03 moves it)
- [ ] The suite gives the same counts as the baseline
- [ ] `git status` on `main` shows nothing but the untracked `CODING_STANDARDS.md`; the work is committed in small Conventional Commits
