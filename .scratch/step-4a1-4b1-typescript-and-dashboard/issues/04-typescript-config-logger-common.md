# 04: TypeScript part 1: config, logger and `common`

**What to build:** main reads its environment once through a zod-checked config module, every request goes to one `API_BASE_URL` (`https://www.app-whisper.com`, no more 308 redirect), main has one pino logger, and `src/main/features/common/` is strict TypeScript with its data parsed where it enters. This ticket sets the patterns tickets 05 and 06 copy. Follows [the spec](../spec.md), "4a-1: config and domain", "4a-1: logs" and "4a-1: folders and TypeScript".

**Blocked by:** 03

**Status:** open

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). Sets the patterns the other batches copy: zod at the boundary, typed database rows, the logger call shape and the config module.

- [ ] `allowJs` is on for main, so the TypeScript files and the not-yet-converted JavaScript build together
- [ ] One config module parses `process.env` with zod at startup, after `dotenv`, covering every variable main reads; a variable nothing reads is deleted. A wrong value stops startup with a clear message
- [ ] `API_BASE_URL` defaults to `https://www.app-whisper.com` with the trailing slash removed; auth and the LLM client use it; no `https://app-whisper.com` default is left in main or preload
- [ ] Preload gets `API_BASE_URL` from main (through `additionalArguments` or a sync IPC call, whichever is simpler in the sandbox) and still exposes `window.api.env.API_BASE_URL`
- [ ] One pino logger module (`pino-pretty` in dev, stdout only). A short note in this ticket shows the call shape the next tickets copy: level, an object with the ids in scope, a message
- [ ] Every file under `common/` is strict TypeScript with zero type errors; its `console.*` calls use the logger
- [ ] Data that enters in `common/` is parsed with zod into named types: database rows in each repository's read functions, `electron-store` reads, WhisperAPP auth responses. Types between modules are derived from those schemas
- [ ] No `any`, no type assertions (`as const` allowed), no non-null `!`, object arguments for named functions ([`CODING_STANDARDS.md`](../../../../CODING_STANDARDS.md))
- [ ] The structure of `common/` stays: singletons, the repository `index` layers and the cycles keep their shape
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [ ] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request
