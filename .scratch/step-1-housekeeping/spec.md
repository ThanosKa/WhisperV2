# Spec: Step 1, housekeeping

Status: open
Label: ready-for-agent

Step 1 of [Order of the work](../whisper-cleanup/issues/07-work-order.md), from the [Whisper cleanup map](../whisper-cleanup/map.md). Decisions come from [Shared folder for the Whisper repos](../whisper-cleanup/issues/05-shared-folder.md), [Which docs to keep, merge or delete](../whisper-cleanup/issues/06-docs-inventory.md) and [Which CLAUDE.md files, and what each says](../whisper-cleanup/issues/19-claude-md-files.md).

## Problem Statement

The three Whisper repos (`WhisperV2`, `WhisperAPP`, `websocket`) sit loose in `~/Desktop/Cursor/` among unrelated projects. Nothing tells an agent how they fit together. `WhisperV2` carries about 30 old docs (`AGENTS.md`, `.cursor/`, root docs, the pipeline docs). Many are out of date, some contradict each other, and the current `CLAUDE.md` sends agents to read them. An agent that follows these docs works from wrong facts, for example that the server is on Vercel or that STT uses Gemini. `CODING_STANDARDS.md` sits untracked in `WhisperV2` and covers only that repo.

## Solution

One folder, `~/Desktop/Cursor/Whisper/`, holds the three repos under their current names. The folder is a small private git repo containing a root `CLAUDE.md`, which says what each repo does and how they talk, and `CODING_STANDARDS.md`, which every repo then loads through Claude Code's parent-folder `CLAUDE.md` loading. `WhisperV2` loses every old doc. A minimal temporary `CLAUDE.md` replaces the current one and lasts until step 8 writes the real files. Before anything moves, all three repos match GitHub. Nothing the user of the app sees changes.

## User Stories

1. As the owner, I want the three Whisper repos in one folder, so that I find them together and apart from my other projects.
2. As the owner, I want the repos to keep their current names, so that the folder names still match the GitHub repo names.
3. As the owner, I want each repo to stay its own independent git repo, so that nothing about how I push, branch or deploy changes.
4. As the owner, I want the workspace folder to be a private git repo, so that its `CLAUDE.md` and `CODING_STANDARDS.md` have history and can be restored.
5. As the owner, I want the three repos listed in the workspace repo's `.gitignore`, not added as submodules, so that the workspace repo never tracks their contents.
6. As an agent working in any Whisper repo, I want a root `CLAUDE.md` that says which repo does what, so that I know where to look for code that is not in my repo.
7. As an agent, I want the root `CLAUDE.md` to say how the repos talk (desktop to WhisperAPP for sign-in, LLM and quotas; desktop to the relay to Soniox for live audio; relay to WhisperAPP for session checks and usage), so that I can follow a request across repos.
8. As an agent, I want the root `CLAUDE.md` to point at each repo's own agent file and repeat nothing from them, so that each fact has one source.
9. As an agent working in any Whisper repo, I want `CODING_STANDARDS.md` loaded from the workspace root, so that I write TypeScript by the same rules everywhere without a copy per repo.
10. As an agent in `WhisperV2`, I want no `AGENTS.md`, so that I don't follow its stale instructions.
11. As an agent in `WhisperV2`, I want no `.cursor/` folder, so that its tone rules don't clash with the owner's global instructions and its playbooks don't send me to scripts that don't exist.
12. As an agent in `WhisperV2`, I want the stale root docs (`SETUP.md`, `EXTERNAL_SERVICES.md`, `DATABASE.md`, `rules.md`, `template.md`, `run-dev.md`, `build-web.md`) gone, so that I read the code instead of wrong descriptions of it.
13. As an agent in `WhisperV2`, I want the 9 pipeline docs gone, so that I don't trust paths and providers that the TypeScript move will change anyway.
14. As an agent in `whisper_web`, I want no `whisper_web/.cursor/` rules and no placeholder `public/README.md`, so that `CODING_STANDARDS.md` is the only code-rule source and no stray note ships in the build output.
15. As an agent in `WhisperV2`, I want a short temporary `CLAUDE.md` until step 8, so that I still know where the issue tracker, the domain docs and the cleanup map live.
16. As an agent in `WhisperV2`, I want `docs/agents/` kept as it is, so that Matt Pocock's skills keep finding the issue tracker and domain-doc setup.
17. As the owner, I want every repo synced with GitHub before the move, so that nothing local is lost or diverges.
18. As the owner, I want to be asked before `WhisperV2`'s 49 local commits are pushed, so that nothing goes to GitHub without my say.
19. As the owner, I want the unfinished `whisper_web` lint rules set aside on their own branch, not committed to `main`, so that lint stays green and the work isn't lost.
20. As the owner, I want the whitespace-only `package-lock.json` change discarded, so that `main` carries no noise diff.
21. As the owner, I want the research worktrees removed and their branches kept, so that the move doesn't leave broken worktree paths and the research stays readable as a primary source.
22. As the owner, I want `.claude/worktrees/` ignored by git in `WhisperV2`, so that future agent worktrees never show up as untracked files.
23. As the owner, I want the move done from outside any session running inside `WhisperV2`, so that no session breaks halfway through.
24. As the owner, I want the automated suite to give the same results before and after, so that I know nothing in the app changed.
25. As the owner, I want one final check that the old docs are gone, the workspace has the right shape and the repos match GitHub, so that I don't check any of it by hand.
26. As the owner, I want to be told that old Claude Code and Cursor sessions won't show up after the move, so that I'm not surprised when they disappear from the list.

## Implementation Decisions

**Order inside the step.** Each item is one commit where it touches a repo:

1. **Tidy `WhisperV2`'s working tree.**
   - The uncommitted `whisper_web` ESLint config change (no-console and one-object-argument rules) goes to a local branch `wip/whisper-web-lint-rules`, and `main` gets the committed config back. On `main` the change fails lint with 27 `no-console` errors, and step 3 replaces the config with an ESLint 10 flat config, so the rules come back in step 4b-1 (shared lint). The branch is never merged; it is a record.
   - The `package-lock.json` change is whitespace only (`git diff -w` is empty), so it is discarded. The `AGENTS.md` change is discarded with the file.
   - Add `.claude/worktrees/` to `.gitignore`.
2. **Remove the research worktrees.** Unlock the locked one, check that none has uncommitted changes, then remove all three. The `research/*` branches stay as local branches, unmerged and unpushed.
3. **Delete the old docs** in `WhisperV2`, exactly the delete list in [Which docs to keep, merge or delete](../whisper-cleanup/issues/06-docs-inventory.md): `AGENTS.md`, all of `.cursor/`, `whisper_web/.cursor/`, the seven stale root docs, the nine pipeline docs and `whisper_web/public/README.md`. Nothing is carried over. `README.md` stays as it is until step 8. Kept: `docs/agents/`, `.claude/agents/`, `.github/`, `.scratch/`.
4. **Temporary `CLAUDE.md`** for `WhisperV2`, a few lines: the cleanup is in progress and its plan is in the cleanup map; the real `CLAUDE.md` files arrive in step 8; the existing "Agent skills" section, kept word for word. It drops the line pointing at `AGENTS.md` and `.cursor/`, and the `@CODING_STANDARDS.md` line, which the workspace root now provides.
5. **Sync with GitHub.** In each of the three repos: `git fetch`, then confirm that `main`/`master` is neither behind nor ahead of its remote. `WhisperV2` is 49 commits ahead: ask the owner, then push. Untracked files that git ignores or that aren't part of the repo (for example `WhisperAPP`'s `.wrangler/`) don't block the move; they move with the folder.
6. **Create the workspace repo** at `~/Desktop/Cursor/Whisper/`: `git init`, a `.gitignore` listing `WhisperV2/`, `WhisperAPP/` and `websocket/`, `CODING_STANDARDS.md` moved from `WhisperV2` unchanged, and the root `CLAUDE.md` (below). The repo stays local; a private GitHub remote only if the owner asks.
7. **Move the three repos** into the workspace. This runs from a shell whose working directory is outside `WhisperV2`: a session started in `~/Desktop/Cursor/`, or one command the owner runs. Moving a folder keeps its git history and its uncommitted files.
8. **Rerun the suite and the final check** in the moved repos (see Testing Decisions).

**Root `CLAUDE.md` content.** About 10 lines, written with the `writing-for-agents` skill:
- One line per repo: `WhisperV2` is the Electron desktop app plus the local `whisper_web` dashboard; `WhisperAPP` is the marketing site, auth, LLM, quotas and billing on a Cloudflare Worker at `www.app-whisper.com`; `websocket` is the Soniox STT relay on Railway.
- How they talk, as the code works today: desktop → WhisperAPP for sign-in, LLM and quotas; desktop → relay → Soniox for live audio; relay → WhisperAPP internal routes for session checks and usage. Step 7 rewrites this line when the desktop connects straight to Soniox.
- A pointer to each repo's own agent file (`WhisperV2/CLAUDE.md`, `WhisperAPP/CLAUDE.md`, `websocket/AGENTS.md`), repeating nothing from them.
- `@CODING_STANDARDS.md`.

**`CODING_STANDARDS.md` in the other two repos.** `WhisperAPP` and `websocket` each keep their own committed copy for now. `WhisperAPP`'s is a longer version written for that repo (Supabase and Clerk ids, Next.js file rules), and auditing those two repos is out of scope for the whole cleanup. Agents there see both files; the two agree, and the repo's own copy is the more specific one.

**What does not change.** No source file, no dependency, no script, no build or CI config, no git remote of the three repos.

## Testing Decisions

The owner confirmed these seams.

- **A good test here checks only results**: the suite's pass and fail counts and the shape of the folders. Step 1 changes no code, so no new tests go into the codebase.
- **Seam 1, the existing automated suite**, run before the step starts and again after the move, with the same results both times: root Jest (`npm test`, 124 passing per [Test safety net today](../whisper-cleanup/issues/01-test-safety-net.md)), `whisper_web` Jest (49 passing), root lint, `whisper_web` lint and `whisper_web` type-check. Record the baseline counts at the start. It runs against the installed `node_modules`, because a clean install is broken until step 3. Running it after the move also catches anything that hard-codes the old path.
- **Seam 2, a one-off structure check** at the end: a short shell script, kept under this spec's folder in `assets/`, not in the code. It confirms that:
  - every file on the delete list is absent;
  - `WhisperV2` has no `CODING_STANDARDS.md` and no `AGENTS.md`;
  - `~/Desktop/Cursor/Whisper/` is a git repo holding `CLAUDE.md`, `CODING_STANDARDS.md` and a `.gitignore` that lists the three repos;
  - the three repos sit inside it, each with a clean working tree that is neither ahead of nor behind its remote;
  - `git worktree list` in `WhisperV2` shows only the main worktree.
- **Prior art:** none for structure checks. The suite's commands are in each `package.json`.

## Out of Scope

- The real `CLAUDE.md` files and the `README.md` rewrite: step 8.
- `GLOSSARY.md` and ADRs: created when they come up (step 7 for the lease terms).
- The orphaned `aec` submodule and unused dependencies: step 3.
- Smoke tests, screenshots, deleting the empty e2e files: step 2.
- The unfinished `whisper_web` lint rules: kept on a branch, they come back in step 4b-1.
- Cleaning docs or `CODING_STANDARDS.md` in `WhisperAPP` and `websocket`: out of scope for the whole cleanup (see the map).
- The hard-coded home path in `WhisperAPP`'s `watchman:reset` script: already broken today, and that repo is out of scope.
- Any code change.

## Further Notes

- After the move, Claude Code and Cursor list sessions by folder path, so sessions started in the old paths no longer show up. Claude Code's project memory for `WhisperV2` is also keyed by the old path.
- The Soniox test script in the cleanup map's assets loads `ws` from the old `websocket` path. It is a finished record, so it stays as it is.
- This spec is small: `/to-tickets` should produce one or two tickets. Items 1-6 can run in a session inside `WhisperV2`; item 7 cannot.
