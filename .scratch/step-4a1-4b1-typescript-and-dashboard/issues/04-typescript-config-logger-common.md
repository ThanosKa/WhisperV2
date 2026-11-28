# 04: TypeScript part 1: config, logger and `common`

**What to build:** main reads its environment once through a zod-checked config module, every request goes to one `API_BASE_URL` (`https://www.app-whisper.com`, no more 308 redirect), main has one pino logger, and `src/main/features/common/` is strict TypeScript with its data parsed where it enters. This ticket sets the patterns tickets 05 and 06 copy. Follows [the spec](../spec.md), "4a-1: config and domain", "4a-1: logs" and "4a-1: folders and TypeScript".

**Blocked by:** 03

**Status:** resolved

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). Sets the patterns the other batches copy: zod at the boundary, typed database rows, the logger call shape and the config module.

- [x] `allowJs` is on for main, so the TypeScript files and the not-yet-converted JavaScript build together
- [x] One config module parses `process.env` with zod at startup, after `dotenv`, covering every variable main reads; a variable nothing reads is deleted. A wrong value stops startup with a clear message
- [x] `API_BASE_URL` defaults to `https://www.app-whisper.com` with the trailing slash removed; auth and the LLM client use it; no `https://app-whisper.com` default is left in main or preload
- [x] Preload gets `API_BASE_URL` from main (through `additionalArguments` or a sync IPC call, whichever is simpler in the sandbox) and still exposes `window.api.env.API_BASE_URL`
- [x] One pino logger module (`pino-pretty` in dev, stdout only). A short note in this ticket shows the call shape the next tickets copy: level, an object with the ids in scope, a message
- [x] Every file under `common/` is strict TypeScript with zero type errors; its `console.*` calls use the logger
- [x] Data that enters in `common/` is parsed with zod into named types: database rows in each repository's read functions, `electron-store` reads, WhisperAPP auth responses. Types between modules are derived from those schemas
- [x] No `any`, no type assertions (`as const` allowed), no non-null `!`, object arguments for named functions ([`CODING_STANDARDS.md`](../../../../CODING_STANDARDS.md))
- [x] The structure of `common/` stays: singletons, the repository `index` layers and the cycles keep their shape
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [x] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request

## Comments

Done 2026-11-28 on branch `step-4a1-4b1-04-typescript-config-logger-common`.

- **Counts:** Vitest 188 (`main` 127, `whisper_web` 61). Main was 117; the 10 new tests are `tests/unit/common/env.test.ts` (5), `logger.test.ts` (3), `preloadArguments.test.ts` (2). `pnpm type-check`, `pnpm test`, `pnpm web:lint` and `pnpm run build:all` pass.
- **Not ticked: `pnpm lint`.** It fails as on the integration branch (root `eslint --ext`, no root config); left to the oxlint setup. No disable comment was added. **Not ticked: the PR into `dev`**; the branch is committed locally.
- **Not run:** the Electron suite (it runs once at the end of the spec). The bundle was checked by reading `out/`: `dotenv/config` is still the first `require`, then the env parse; the preload is still one file that only requires `electron`.
- **Logger call shape** (`src/main/features/common/utils/logger.ts`), for tickets 05-07:

  ```ts
  import { logger } from '../common/utils/logger';
  const log = logger.child({ module: 'ListenService' });
  log.info({ sessionId }, 'Session started');
  log.error({ err: error, sessionId }, 'Failed to save transcript');
  ```

  The level follows the old call (`console.log` is `info`), the object holds the ids in scope, `err` holds a caught error, the message is a fixed sentence. Pretty in dev (`!app.isPackaged`, through `pino-pretty` as a sync stream, not a worker transport), JSON lines to stdout when packaged, `silent` when `NODE_ENV=test`.
- **Config module:** `src/main/features/common/config/env.ts` parses `API_BASE_URL` (default `https://www.app-whisper.com`, trailing slash removed), `STT_RELAY_URL`, `NODE_ENV` (`development`/`production`/`test`) and `OPENAI_TRANSCRIBE_LANG`; an empty value counts as unset, as `process.env.X || default` did. A wrong value throws `Invalid environment, ...` with each variable's name. `index.js` imports it right after `dotenv/config`. `sttService`, `featureBridge` and `index.js` now read these from `env`. Deleted, nothing read them: `whisper_API_TIMEOUT`, `whisper_ENABLE_JWT`, `whisper_CACHE_TIMEOUT`, `whisper_LOG_LEVEL`, `whisper_DEBUG`. The four dashboard port/URL values stay on `process.env` until 4b-2: main sets them itself at runtime, so they are not startup config.
- **`config/config.ts`** keeps the settings singleton (`get`, `set`); `set` takes `{ key, value }`. It keeps the keys code reads (relay default, the Listen thresholds, `smartTrigger`), parses `~/.whisper/config.json` with zod (an invalid file is ignored with a warning; unknown keys are dropped).
- **Preload:** windows get `--whisper-api-base-url=<url>` in `additionalArguments` (`src/shared/preloadArguments.ts`, used by `windowManager` and the preload). The preload exposes it at `window.api.env.API_BASE_URL`, or `''` if missing (the Lit UI falls back to the www domain). Only `env.ts` contains the domain in main, preload and shared.
- **Parsed with zod:** rows of `sessions`, `users` and `prompt_presets` in the repositories' read functions (`SessionRow`, `UserRow`, `PresetRow`, `ResolvedPreset`), `sqliteClient`'s own reads, the WhisperAPP auth responses and the stored user in electron-store (`UserProfile`; quotas pass through as records), the `/api/llm/chat` answer. Lenient where today's data varies: the e2e fake user has a different `apiQuota` shape and no `sttQuota`.
- **Object arguments:** callers updated in JavaScript (not type-checked yet, so found by search): `sessionRepository.updateTitle({ id, title })` (ask, listen x2, index x2), `presetRepository.update({ id, changes })` (index), `authService.signInWithSession({ sessionUuid, userInfo })` (index), `llmClient.stream({ payload, signal })` (ask x2). Tests: the `stream` mock and two `toHaveBeenCalledWith`, and `config.set` in the smart-trigger test.
- **Deleted as dead (nothing imported or called them):** `utils/spawnHelper.js`, `config/checksums.js`, the `providerSettings` repository (imported by authService, never called; the table stays in `schema.ts`), `sqliteClient.query`/`runQuery`, `databaseInitializer`'s methods other than `initialize`/`close` (three called `sqliteClient` methods that do not exist), authService's `setCurrentUserId`, `refreshUserProfile` and its `global.modelStateService` branches (never set).
- **Kept as it behaves today, for 4a-2:** `broadcastUserState` read `uid`, `mode` and `displayName` from `getCurrentUser()`, which never returns them. So the duplicate check keys on `isLoggedIn` only, and the sign-in branch that synced the user into the dashboard's localStorage never ran; the TypeScript keeps that behavior and drops the unreachable branch.
- **Types and tests:** `@types/better-sqlite3` makes rows from the JavaScript repositories `unknown`; three `transcript-recovery` checks read `transcripts[i].text` and became `toHaveProperty('text', ...)`, same check. `zod`, `pino`, `pino-pretty` are root dependencies (`zod` same range as `whisper_web`).
