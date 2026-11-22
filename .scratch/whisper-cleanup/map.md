# Map: Whisper cleanup

Label: wayfinder:map

## Destination

A sequenced plan, with every decision made, for cleaning up the whole Whisper product without changing what the user sees:

1. WhisperV2 (this repo): the Electron app moved from JavaScript to TypeScript, a cleaner code structure, a DESIGN.md, and new CLAUDE.md files written from scratch that replace `.cursor/` rules and tell an agent what lives where.
2. One shared folder holding the three Whisper repos (still separate repos), with a root CLAUDE.md explaining how they fit together.
3. A decision on the STT relay on Railway: keep it, or replace it.

The map ends when nothing is left to decide before someone starts doing the work.

## Notes

- **Repos.** `WhisperV2` (this repo: Electron desktop app in `src/`, local Next.js dashboard in `whisper_web/`, Express bridge in `whisper_web/backend_node/`). `../WhisperAPP` (marketing site, auth, LLM, quotas, billing; a Cloudflare Worker, not Vercel any more). `../websocket` (the Soniox STT relay on Railway, TypeScript).
- **Behavior must not change.** Every plan step keeps the app working the same for the user.
- **Skills.** Grilling tickets: `grilling` + `domain-modeling`. Code structure tickets: `codebase-design`. Any CLAUDE.md / agent docs ticket: `writing-for-agents`. Research tickets: `research`. TypeScript rules: `CODING_STANDARDS.md`.
- **Working with the owner.** Solo developer. Reply in Greek, plain words, explain jargon, one question at a time. Commit after every change to this map or a ticket. Research runs on local branches; nothing is pushed without asking.

## Decisions so far

<!-- one line per closed ticket: [title](issues/NN-slug.md): gist -->

- [Electron app inventory](issues/02-electron-inventory.md): ~22.7K lines; main/preload ship unbuilt as CommonJS, renderer is Lit bundled by esbuild; two import cycles and stringly-typed IPC are the main TS hazards.
- [STT relay: keep or replace](issues/03-stt-relay-options.md): Soniox is 15-40x the hosting cost; direct-to-Soniox needs pre-charged key leases, Cloudflare needs a relay rewrite, Railway needs nothing. The Soniox model must move to `stt-rt-v6` before 2026-12-15 whatever is chosen.
- [Shared folder for the Whisper repos](issues/05-shared-folder.md): `~/Desktop/Cursor/Whisper/` with the three repos under their current names; a plain folder, not a repo; a ~10-line root CLAUDE.md on what each repo does and how they talk; sync every repo with GitHub before moving.
- [Test safety net today](issues/01-test-safety-net.md): Jest passes (124 root, 49 web), but the IPC bridges, preload, windows, UI and DB have no tests, and Electron e2e is empty placeholders. A clean install fails today (lockfile out of sync, `better-sqlite3` won't build on Node 26).

## Not yet specified

- **Code structure after TypeScript.** Which modules to deepen, where the seams go (services, windows, IPC bridges). Waits on the TypeScript approach and the Electron inventory.
- **`whisper_web/` cleanup.** It is already TypeScript; what else it needs (lint, structure, its own `.cursor/rules/typescript.mdc`) is not yet clear.
- **DESIGN.md.** One file or two (Electron UI and `whisper_web/`), and where the current tokens come from. Format: `../DESIGN.skeleton.md`.
- **Per-app CLAUDE.md files.** Root, `src/`, `whisper_web/`, `whisper_web/backend_node/`: content waits on the docs inventory and the shared-folder decision.
- **Dependency and toolchain health.** Pin a Node version, re-sync the lockfile, decide whether to upgrade outdated deps (`better-sqlite3`, Electron 30, Playwright) or only make the install reproducible. Raised by [Test safety net today](issues/01-test-safety-net.md); scope not yet asked of the owner.
- **Relay migration plan.** Only if the relay ticket says replace it.

## Out of scope

- Rewriting in Rust (Tauri or otherwise): a full rewrite in a language the owner does not know, against a behavior-preserving goal.
- New features.
- Audit of `WhisperAPP` and `websocket` against the same standards: a separate session.
