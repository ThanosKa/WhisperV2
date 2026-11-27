# Order of the work

Status: resolved
Type: grilling
Blocked by: 01, 02, 04, 08, 09, 10, 11

## Question

In what order do the big pieces happen: shared folder, docs cleanup and new CLAUDE.md files, TypeScript migration, code structure, DESIGN.md, `whisper_web/` cleanup, relay change? Which can run in parallel, and which depend on others?

## Comments

From [Which docs to keep, merge or delete](06-docs-inventory.md), pieces to place in the order: deleting the dead docs (`AGENTS.md`, `.cursor/`, root docs, `docs/*.md`); turning the workspace folder into a git repo and moving `CODING_STANDARDS.md` there; writing the new `CLAUDE.md` files and `README.md` from scratch.

From [STT relay decision](08-stt-relay-decision.md): place the direct-to-Soniox change (desktop `sttService.js`, a WhisperAPP route, later deleting `../websocket`). It rewrites the same file the TypeScript move rewrites; it changes internals, not what the user sees. The `stt-rt-v6` model move on the live relay is urgent (before 2026-12-15) and sits outside the order.

## Answer

Resolved 2026-11-23 with the owner.

0. **Urgent, outside the order, before 2026-12-15:** the live relay moves to `stt-rt-v6`.
1. **Housekeeping:** shared folder `~/Desktop/Cursor/Whisper/` and its workspace repo ([Shared folder for the Whisper repos](05-shared-folder.md)), `CODING_STANDARDS.md` moved there; dead docs deleted ([Which docs to keep, merge or delete](06-docs-inventory.md)); a minimal temporary `CLAUDE.md` until step 8.
2. **Safety net:** the 4 smoke tests and 6 screenshots ([What the smoke tests and screenshots cover](11-smoke-test-coverage.md)); empty e2e files and `whisper_web/e2e/` deleted.
3. **Upgrades + pnpm** for the whole repo including `whisper_web`, unused dependencies deleted ([Target versions for the upgrade](10-upgrade-target-versions.md)); macOS floor per [macOS minimum version](12-macos-minimum-version.md).
4. **In parallel after step 3:** (a) main + preload to TypeScript with the new code structure, tests rewritten to Vitest at the agreed seams ([Which tests to delete](09-which-tests-to-delete.md)); (b) `whisper_web` cleanup.
5. **DESIGN.md**, tokens taken from today's Lit CSS.
6. **UI rewritten in React + TS + Tailwind**, matching the step-2 screenshots.
7. **Direct-to-Soniox** ([Direct-to-Soniox design](14-direct-to-soniox-design.md)), on the TypeScript `sttService`, so the file is not rewritten twice.
8. **New `CLAUDE.md` files and `README.md`**, written last, when paths no longer move.
9. **Owner's manual checklist once, then deploy.**

The agent runs the automated suite after every step.

## Comments

**Amended by [Code structure for main and preload](15-main-code-structure.md):** step 4a is split into 4a-1 (main + preload to TypeScript, today's structure) and 4a-2 (the new structure, one point at a time, Vitest service tests written here). Step 4a ends when 4a-2's list is done.

**Amended by [whisper_web cleanup scope](18-whisper-web-cleanup.md):** step 4b is split. 4b-1 runs in parallel with 4a; 4b-2 runs after 4a-2 (the dashboard API moves into main on Hono there). Kosmos components enter the dashboard in step 6, with the Electron UI. Dashboard pages are checked by eye with Claude in Chrome against "before" screenshots taken before step 3.

**Step 0 done 2026-11-25:** the relay (`../websocket`, commit `23c6c7c`) uses `stt-rt-v6`. It was tested locally against the real Soniox API with spoken audio (exact transcript, `<end>` turn detected, no errors), then deployed to Railway, where the deploy succeeded.

**Step 1 done 2026-11-28:** [Spec: Step 1, housekeeping](../../step-1-housekeeping/spec.md). The three repos live in `~/Desktop/Cursor/Whisper/`, a local git repo whose root `CLAUDE.md` and `CODING_STANDARDS.md` load into every repo. WhisperV2's old docs are deleted, and its work reaches GitHub on `dev` through PRs (#2-#4); `main` waits for step 9. Same suite counts before and after.
