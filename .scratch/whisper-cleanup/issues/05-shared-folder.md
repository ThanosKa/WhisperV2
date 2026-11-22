# Shared folder for the Whisper repos

Status: resolved
Type: grilling
Blocked by: none

## Question

How are `WhisperV2`, `WhisperAPP` and `websocket` grouped in one folder while staying separate repos? Decide: folder name and location, whether the folder itself is a small git repo, what its root CLAUDE.md says (each repo's job, how they talk to each other, pointers to each repo's CLAUDE.md), and whether this map moves there.

## Answer

- **Folder:** `~/Desktop/Cursor/Whisper/`, holding `WhisperV2/`, `WhisperAPP/` and `websocket/` under their current names (same as the GitHub repo names).
- **Not a git repo.** A plain folder; its CLAUDE.md is small enough to rewrite if lost.
- **Root CLAUDE.md:** about 10 lines, written with `writing-for-agents`. Only what no single repo's CLAUDE.md says: which repo does what, and how they talk to each other (desktop → WhisperAPP for sign-in and LLM; desktop → websocket → Soniox for live audio; websocket → WhisperAPP for session check and usage). Points to each repo's own CLAUDE.md; repeats nothing from them.
- **This map stays in `WhisperV2/.scratch/`.**
- **If the relay is replaced** ([STT relay decision](08-stt-relay-decision.md)), `websocket/` leaves the folder.
- **When the move happens** is decided in [Order of the work](07-work-order.md).

Checklist for whoever does the move:

1. In each repo: `git status` is clean (or its changes are committed), then `git fetch` and `git pull`, so all three match GitHub before moving.
2. Move the three folders; moving does not touch git history or uncommitted files.
3. In `WhisperV2`, run `git worktree repair` (research worktrees under `.claude/worktrees/` store absolute paths), or remove those worktrees first.
4. Expect old Claude Code and Cursor sessions not to show up: they are keyed by the old path.
5. Check for hard-coded absolute paths (for example `WhisperAPP`'s `watchman:reset` script).
