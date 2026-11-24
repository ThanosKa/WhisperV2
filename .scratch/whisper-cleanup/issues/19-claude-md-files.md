# Which CLAUDE.md files, and what each says

Status: resolved
Type: grilling
Blocked by: 16, 18

## Question

For step 8 of [Order of the work](07-work-order.md): which `CLAUDE.md` files exist (workspace root; `WhisperV2` root; maybe `src/main/`, `src/renderer/`, `whisper_web/`, `whisper_web/backend_node/`) and what each one covers, now that the folder layout is set by [Code structure for main and preload](15-main-code-structure.md). All are written from scratch from the code. Cover the areas that have no doc today, listed in [Which docs to keep, merge or delete](06-docs-inventory.md): recovery, windows, the dashboard data channels, auto-update, permissions, CI/build. Also decide what the new `README.md` says, written alongside them, and the WhisperAPP glossary terms (Lease; audio stream vs the LLM Stream route; Chat) and the ADR for leases settled from Soniox usage logs. Use the `writing-for-agents` skill.

## Answer

Resolved 2026-11-24. The owner set the rule (as many files as needed; split one when it fills up) and handed the rest to the agent as standard practice (`writing-for-agents`).

1. **Files.** Workspace `Whisper/CLAUDE.md` as already decided ([Which docs to keep, merge or delete](06-docs-inventory.md)). In `WhisperV2`: `CLAUDE.md` (root), `src/main/CLAUDE.md`, `src/renderer/CLAUDE.md`, `whisper_web/CLAUDE.md`. Claude Code loads a subfolder's `CLAUDE.md` only when working there, so each agent reads only the part it touches. Any file past about 150 lines is split into a `CLAUDE.md` in the subfolder it describes.
2. **What they say: only what the code does not.** The map of what lives where, the reasons behind choices, gotchas, unwritten conventions. Commands stay in `package.json`, schemas and env vars in code; the agent looks them up there.
   - **Root:** what the app is and its parts (main, preload, renderer, shared, `whisper_web`); how to verify a change (automated suite after every step, smoke tests and screenshots, Claude in Chrome for the dashboard); commit and branch conventions (Conventional Commits, as today); one-line pointers to `docs/agents/release.md`, `DESIGN.md` files, `GLOSSARY.md`, `docs/adr/`; the existing "Agent skills" section kept.
   - **`src/main/`:** services and how they get dependencies; windows and shortcuts (only `windowManager` touches windows); the typed IPC list; crash and session recovery; auto-update and the macOS 13 floor; macOS permissions (microphone, screen); `webStack` (Hono, one port, dashboard API).
   - **`src/renderer/`:** one folder per window, Kosmos components and token values, `window.api.<feature>` and `useIpcEvent`, state lives in main; pointer to its `DESIGN.md`.
   - **`whisper_web/`:** what the dashboard is, the Hono client, MSW handlers for tests and dev, Kosmos; pointer to its `DESIGN.md`.
   - **`docs/agents/release.md`** (new, disclosed): build, signing, notarization, CI, publishing an update. Reached only when releasing.
3. **`README.md`** (for humans, short): what Whisper is, where to download it, how to set up and run it for development, how to run the tests, and that agent instructions live in `CLAUDE.md`.
4. **Glossary and ADR.** Lease, audio stream (`me`/`them`, as opposed to WhisperAPP's LLM Stream route) and Chat go in `WhisperAPP/GLOSSARY.md`, and the ADR "leases charged up front and settled from Soniox usage logs, no relay" is `WhisperAPP/docs/adr/0006`. Both are written in **step 7**, with the lease routes, so they land with the code they describe (amends [Direct-to-Soniox design](14-direct-to-soniox-design.md), which left them to the end). `WhisperV2/GLOSSARY.md` is created then with Dashboard and audio stream, and Lease as a pointer to WhisperAPP's definition.
5. **How they are written.** Step 8, from scratch, by reading the final code; every path and claim checked against the code before commit. No old doc is consulted as a source.

## Comments

From [whisper_web cleanup scope](18-whisper-web-cleanup.md): `whisper_web/backend_node/` no longer exists (the API is `src/main/webStack/`, Hono), so it needs no CLAUDE.md. "Dashboard" (the local web pages the app opens in the browser) is a candidate glossary term.
