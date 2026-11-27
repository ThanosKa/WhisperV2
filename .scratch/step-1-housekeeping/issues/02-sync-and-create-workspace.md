# 02: Sync the three repos with GitHub and create the workspace repo

**What to build:** `WhisperV2`, `WhisperAPP` and `websocket` each match their GitHub remote, and `~/Desktop/Cursor/Whisper/` exists as a local private git repo with the root `CLAUDE.md`, ready for the repos to move in. Follows [Spec: Step 1, housekeeping](../spec.md), items 5-6.

**Blocked by:** 01 (Tidy WhisperV2 and delete the old docs)

**Status:** ready-for-agent

**Model:** Sonnet (run `/model sonnet` before `/implement`)

- [ ] In each repo: `git fetch`, then its working branch is neither behind nor ahead of its remote. A repo that is behind is pulled. For `WhisperV2` the working branch is `dev`, not `main` (see the map's Branches note); local `main` is left as it is
- [ ] `WhisperV2`'s local commits already reached GitHub through `dev` (PR #2), and its `main` is not pushed. If `WhisperAPP` or `websocket` is ahead of its remote, the agent reports it and pushes nothing: the owner is asked first, because a push there may deploy. The `wip/*` and `research/*` branches are not pushed
- [ ] Untracked files outside git (for example `WhisperAPP`'s `.wrangler/`) are left alone
- [ ] `~/Desktop/Cursor/Whisper/` is a `git init` repo with no remote, holding a `.gitignore` that lists `WhisperV2/`, `WhisperAPP/` and `websocket/`
- [ ] Its root `CLAUDE.md`, written with the `writing-for-agents` skill, is about 10 lines: one line per repo on what it does; how they talk today (desktop → WhisperAPP for sign-in, LLM and quotas; desktop → relay → Soniox for live audio; relay → WhisperAPP internal routes for session checks and usage); a pointer to each repo's own agent file (`WhisperV2/CLAUDE.md`, `WhisperAPP/CLAUDE.md`, `websocket/AGENTS.md`); and `@CODING_STANDARDS.md`. Every claim is checked against the repos' code
- [ ] The workspace repo has one commit with `.gitignore` and `CLAUDE.md` (`CODING_STANDARDS.md` arrives in ticket 03)
- [ ] No file in the three repos changes
