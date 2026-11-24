# Which CLAUDE.md files, and what each says

Status: claimed
Type: grilling
Blocked by: 16, 18

## Question

For step 8 of [Order of the work](07-work-order.md): which `CLAUDE.md` files exist (workspace root; `WhisperV2` root; maybe `src/main/`, `src/renderer/`, `whisper_web/`, `whisper_web/backend_node/`) and what each one covers, now that the folder layout is set by [Code structure for main and preload](15-main-code-structure.md). All are written from scratch from the code. Cover the areas that have no doc today, listed in [Which docs to keep, merge or delete](06-docs-inventory.md): recovery, windows, the dashboard data channels, auto-update, permissions, CI/build. Also decide what the new `README.md` says, written alongside them, and the WhisperAPP glossary terms (Lease; audio stream vs the LLM Stream route; Chat) and the ADR for leases settled from Soniox usage logs. Use the `writing-for-agents` skill.

## Comments

From [whisper_web cleanup scope](18-whisper-web-cleanup.md): `whisper_web/backend_node/` no longer exists (the API is `src/main/webStack/`, Hono), so it needs no CLAUDE.md. "Dashboard" (the local web pages the app opens in the browser) is a candidate glossary term.
