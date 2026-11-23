# Which docs to keep, merge or delete

Status: resolved
Type: grilling
Blocked by: none

## Question

For each existing doc, keep, merge into a new CLAUDE.md, or delete? Candidates: `AGENTS.md`, `.cursor/agents/*`, `.cursor/rules/behavior.mdc`, `.cursor/tests/*`, `.cursor/plan.md`, `docs/*.md` (pipelines), `DATABASE.md`, `EXTERNAL_SERVICES.md`, `SETUP.md`, `rules.md`, `template.md`, `build-web.md`, `run-dev.md`, `README.md`, `whisper_web/.cursor/rules/typescript.mdc`. Flag docs that are out of date (for example `AGENTS.md` still says the server is on Vercel).

## Answer

Rule: **one source per fact.** Code rules live only in `CODING_STANDARDS.md`, agent instructions only in `CLAUDE.md`, and anything readable from the code stays in the code. No doc is carried over: kept docs are rewritten from scratch by reading the code.

**Workspace (`~/Desktop/Cursor/Whisper/`)** becomes a small private git repo (amends [Shared folder for the Whisper repos](05-shared-folder.md)): the three repos are listed in its `.gitignore`, not submodules. It holds only:

- `CLAUDE.md`: how the three repos fit together, plus `@CODING_STANDARDS.md`.
- `CODING_STANDARDS.md`: moved here from `WhisperV2`, unchanged; no repo keeps a copy. Claude Code loads parent-folder `CLAUDE.md` files, so every repo gets it.

**Per repo, as Matt Pocock's skills expect** (`setup-matt-pocock-skills` runs once per repo; single-context domain docs): each repo keeps its own `docs/agents/`, `.scratch/`, `GLOSSARY.md` and `docs/adr/`. Nothing shared across repos. (Considered: one shared `GLOSSARY.md` and `docs/agents/` in the workspace. Rejected because the skills give no pattern for it and it needs hand-edited config.)

**WhisperV2: keep**

| Doc | Fate |
|---|---|
| `CLAUDE.md` | Rewritten from scratch (`writing-for-agents`). The only agent-instruction file; no `AGENTS.md`, not even a symlink. |
| `README.md` | Rewritten from scratch, for humans. |
| `docs/agents/domain.md`, `docs/agents/issue-tracker.md` | Kept as they are. |
| `GLOSSARY.md`, `docs/adr/` | Created lazily by `domain-modeling`. Decisions now buried in the deleted pipeline docs become ADRs when they come up (for example "prompts are built on the server; the client sends a profile"). |

**WhisperV2: delete, nothing carried over**

| Doc | Why |
|---|---|
| `AGENTS.md` | Replaced by `CLAUDE.md`; still says the server is on Vercel. |
| `.cursor/rules/behavior.mdc` | Tone lines clash with the owner's global `CLAUDE.md`; the rest is no-ops. |
| `whisper_web/.cursor/rules/typescript.mdc` | `CODING_STANDARDS.md` already covers it. |
| `.cursor/agents/*` (4) | All partly stale (env vars never read, scripts that don't exist); repeat README/SETUP. |
| `.cursor/tests/*` (4) | Jest guides; Vitest replaces Jest ([TypeScript migration approach](04-typescript-approach.md)). The Playwright guide names a helper that doesn't exist. |
| `.cursor/plan.md`, `template.md`, `rules.md` | Generic prompts with nothing about Whisper. |
| `run-dev.md`, `build-web.md` | One-line Windows PowerShell commands. |
| `SETUP.md` | Stale: scripts `electron`/`rebuild` and `src/main.js` don't exist; wrong DB path. |
| `EXTERNAL_SERVICES.md` | Stale: leaves out the main server; `LANDING_PAGE_URL` never read. |
| `DATABASE.md` | Partly stale (2 tables missing, wrong path); `schema.js` is the source of truth. |
| `docs/*.md` (9 pipeline docs) | 3 current, 4 partly stale, 2 stale (`stt-pipeline` says Gemini, not Soniox; `quota-system` describes old server code). The TS move changes every path they name. Cross-repo contracts are readable from the other repos in the workspace. |
| `whisper_web/public/README.md` | Stale placeholder note; `public/` is copied into the build output. |

Evidence: a read-only audit checked at least 5 concrete claims per doc against the code (paths, env vars, scripts, function names). Findings that are not about docs:

- Two default domains: `llmClient.js:5` uses `https://app-whisper.com`, `SttView.js:192` uses `https://www.app-whisper.com`. Goes to code structure (fog).
- Areas with no doc today, for whoever writes the new `CLAUDE.md` files: crash and session recovery, window management and shortcuts, the `web-data-request` channels (`index.js:451-626`), auto-update, permissions, CI/build/notarization.
- Orphaned `aec` submodule and unused dependencies: already in [Electron app inventory](02-electron-inventory.md).

When the deletions, the move of `CODING_STANDARDS.md` and the workspace repo happen is decided in [Order of the work](07-work-order.md).
