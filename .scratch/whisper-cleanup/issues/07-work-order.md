# Order of the work

Status: claimed
Type: grilling
Blocked by: 01, 02, 04, 08, 09, 10, 11

## Question

In what order do the big pieces happen: shared folder, docs cleanup and new CLAUDE.md files, TypeScript migration, code structure, DESIGN.md, `whisper_web/` cleanup, relay change? Which can run in parallel, and which depend on others?

## Comments

From [Which docs to keep, merge or delete](06-docs-inventory.md), pieces to place in the order: deleting the dead docs (`AGENTS.md`, `.cursor/`, root docs, `docs/*.md`); turning the workspace folder into a git repo and moving `CODING_STANDARDS.md` there; writing the new `CLAUDE.md` files and `README.md` from scratch.

From [STT relay decision](08-stt-relay-decision.md): place the direct-to-Soniox change (desktop `sttService.js`, a WhisperAPP route, later deleting `../websocket`). It rewrites the same file the TypeScript move rewrites; it changes internals, not what the user sees. The `stt-rt-v6` model move on the live relay is urgent (before 2026-12-15) and sits outside the order.
