# Map: Whisper cleanup

Label: wayfinder:map

## Destination

A sequenced plan, with every decision made, for cleaning up the whole Whisper product without changing what the user sees:

1. WhisperV2 (this repo): every dependency on its latest stable version, the Electron main and preload moved from JavaScript to TypeScript, the Electron UI rewritten from Lit to React + TypeScript + Tailwind (looking the same), a cleaner code structure, a DESIGN.md, and new CLAUDE.md files written from scratch that replace `.cursor/` rules and tell an agent what lives where.
2. One shared folder holding the three Whisper repos (still separate repos), with a root CLAUDE.md explaining how they fit together.
3. A decision on the STT relay on Railway: keep it, or replace it.

The map ends when nothing is left to decide before someone starts doing the work.

## Notes

- **Repos.** `WhisperV2` (this repo: Electron desktop app in `src/`, local Next.js dashboard in `whisper_web/`, Express bridge in `whisper_web/backend_node/`). `../WhisperAPP` (marketing site, auth, LLM, quotas, billing; a Cloudflare Worker, not Vercel any more). `../websocket` (the Soniox STT relay on Railway, TypeScript).
- **Behavior must not change.** Every plan step keeps the app working the same for the user.
- **Follow the stable industry standard.** The owner's standing rule: when a tool or pattern is a choice, pick what the industry uses (latest stable/LTS, never beta) and recommend it; don't ask about it as an open question.
- **Skills.** Grilling tickets: `grilling` + `domain-modeling`. Code structure tickets: `codebase-design`. Any CLAUDE.md / agent docs ticket: `writing-for-agents`. Research tickets: `research`. TypeScript rules: `CODING_STANDARDS.md`.
- **Checking the work.** The owner checks nothing by hand and deploys nothing until the whole cleanup is done; every step is verified by the automated suite, and the manual checklist runs once at the end.
- **Working with the owner.** Solo developer. Reply in Greek, plain words, explain jargon, one question at a time. Commit after every change to this map or a ticket. Research runs on local branches; nothing is pushed without asking.

## Decisions so far

<!-- one line per closed ticket: [title](issues/NN-slug.md): gist -->

- [Electron app inventory](issues/02-electron-inventory.md): ~22.7K lines; main/preload ship unbuilt as CommonJS, renderer is Lit bundled by esbuild; two import cycles and stringly-typed IPC are the main TS hazards.
- [STT relay: keep or replace](issues/03-stt-relay-options.md): Soniox is 15-40x the hosting cost; direct-to-Soniox needs pre-charged key leases, Cloudflare needs a relay rewrite, Railway needs nothing. The Soniox model must move to `stt-rt-v6` before 2026-12-15 whatever is chosen.
- [Shared folder for the Whisper repos](issues/05-shared-folder.md): `~/Desktop/Cursor/Whisper/` with the three repos under their current names; a small private workspace repo with the three in its `.gitignore` (amended by the docs ticket); a ~10-line root CLAUDE.md on what each repo does and how they talk; sync every repo with GitHub before moving.
- [Test safety net today](issues/01-test-safety-net.md): Jest passes (124 root, 49 web), but the IPC bridges, preload, windows, UI and DB have no tests, and Electron e2e is empty placeholders. A clean install fails today (lockfile out of sync, `better-sqlite3` won't build on Node 26).
- [Which docs to keep, merge or delete](issues/06-docs-inventory.md): keep only `CLAUDE.md` and `README.md` (both rewritten from scratch) and `docs/agents/`; delete `AGENTS.md`, all of `.cursor/`, the root docs and the 9 pipeline docs, carrying nothing over. `CODING_STANDARDS.md` moves to the workspace root; glossary, ADRs, tickets and `docs/agents/` stay per repo, as Matt Pocock's skills expect.
- [TypeScript migration approach](issues/04-typescript-approach.md): Playwright smoke tests + screenshots first, then upgrades + pnpm, then main/preload to TS in one go, then the UI rewritten in React + TS + Tailwind; electron-vite + electron-builder, Vitest, ESLint 9 + typescript-eslint, zod, pino, strict TS.
- [Target versions for the upgrade](issues/10-upgrade-target-versions.md): Node 26 LTS, pnpm workspace, Electron 45, `better-sqlite3` 13 (fixes the clean install), Next 16, React 19, Tailwind 4, ESLint 10 and TypeScript 6 (not 9 and 7); about 20 unused dependencies deleted; Electron 45 drops macOS 11-12.
- [STT relay decision](issues/08-stt-relay-decision.md): replace the Railway relay; the desktop connects straight to Soniox with short temporary keys from WhisperAPP, charged up front and corrected from Soniox usage logs; `../websocket` is deleted once old builds are gone. A Soniox test comes first.
- [Which tests to delete](issues/09-which-tests-to-delete.md): tests only at three seams (Electron app via a small Playwright suite, services via public methods with a real in-memory DB, `whisper_web` pages via Testing Library); no Playwright in `whisper_web`; mock-only and empty tests deleted, the rest rewritten to Vitest in the TS step.
- [What the smoke tests and screenshots cover](issues/11-smoke-test-coverage.md): 4 Playwright smoke tests (open, Ask, Listen, settings) and 6 screenshots, one per window, offline against a local fake server; the agent runs them after every step; the owner's manual checklist runs once, at the very end.
- [Order of the work](issues/07-work-order.md): housekeeping and docs, safety net, upgrades + pnpm, then TS for main/preload (amended: TS first, then the new structure) alongside `whisper_web` cleanup, DESIGN.md, React UI, direct-to-Soniox, new CLAUDE.md files last, one manual check before deploy; relay model fix first, before 2026-12-15.
- [macOS minimum version](issues/12-macos-minimum-version.md): macOS 13 and later, as the industry does; auto-update must not hand 11-12 users a build that won't open; the app starts sending its app and OS version to WhisperAPP so we know who runs what.
- [Soniox temporary key test](issues/13-soniox-temp-key-test.md): all pass: a used, expired temporary key still reconnects to its own stream (clock keeps running, drops are billed); the limit ends with 403 `temp_api_key_session_expired` + close 1000; usage logs appear within 20 s, filtered by `client_reference_id` on our side; both streams switch to a new lease with no gap.
- [Direct-to-Soniox design](issues/14-direct-to-soniox-design.md): quotas and quota screen unchanged; 5-min leases per audio stream from a new WhisperAPP `POST /api/stt/lease`, switched at a pause and reconnected after drops; unused seconds given back from the desktop's count, then settled from Soniox usage logs (no cron); Railway off when no paying user has used it for 30 days; step 7, on the TS `sttService`.
- [Code structure for main and preload](issues/15-main-code-structure.md): electron-vite folders (`src/main`, `preload`, `renderer`, `shared`); services get their dependencies passed in and only `windowManager` touches windows; repository middle layers, `internalBridge` and the two bridge files deleted; one typed IPC list with zod; one `API_BASE_URL` = `www.app-whisper.com`; step 4a split into TS first, then the new structure, ending when its list is done.
- [React UI structure](issues/16-react-ui-structure.md): one electron-vite entry and folder per window (7), shared components and hooks, audio capture as plain TS; typed `window.api.<feature>` plus a `useIpcEvent` hook; state stays in main, no store library; `react-markdown` + `rehype-highlight`; components from the owner's Kosmos registry with Whisper's own token values; one window at a time, smallest first.
- [DESIGN.md scope](issues/17-design-md-scope.md): two DESIGN.md files (`src/renderer/`, `whisper_web/`) in the skeleton's format, written like the example; every value lives only in Kosmos's CSS variables, one theme file per app, lint fails on hard-coded values; today's 114 colors merged into a small palette; screenshots compared with a small tolerance.
- [whisper_web cleanup scope](issues/18-whisper-web-cleanup.md): the dashboard API moves into main on Hono (typed client), pages and API on one port so `runtime-config.json`, CORS and port env vars go; shared lint + strict TS; standard Next/shadcn folders; Vitest + MSW page tests, route tests via `app.request()`; Kosmos components in step 6; dashboard checked by eye with Claude in Chrome; split into 4b-1 / 4b-2 around 4a-2.

## Not yet specified

<!-- the CLAUDE.md files graduated to [Which CLAUDE.md files, and what each says](issues/19-claude-md-files.md) -->

## Out of scope

- Rewriting in Rust (Tauri or otherwise): a full rewrite in a language the owner does not know, against a behavior-preserving goal.
- New features.
- New colors or a new look: a separate effort after the cleanup, made a change of values only by [DESIGN.md scope](issues/17-design-md-scope.md).
- Writing the code in Effect: rejected for the whole codebase in [whisper_web cleanup scope](issues/18-whisper-web-cleanup.md); a separate effort if ever.
- Audit of `WhisperAPP` and `websocket` against the same standards: a separate session.
