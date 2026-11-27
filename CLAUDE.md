# WhisperV2 (cleanup in progress)

This repo is being cleaned up. The plan is the map at `.scratch/whisper-cleanup/map.md`: read it before changing structure, docs or tooling. The old agent docs are deleted on purpose; read the code instead. The real `CLAUDE.md` files arrive in step 8.

Write TypeScript by the rules in @CODING_STANDARDS.md.

Your context window will be automatically compacted as it approaches its limit,
allowing you to continue working indefinitely from where you left off. Therefore,
do not stop tasks early due to token budget concerns.

## Agent skills

### Issue tracker

Local markdown files in `.scratch/`, committed to git. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
