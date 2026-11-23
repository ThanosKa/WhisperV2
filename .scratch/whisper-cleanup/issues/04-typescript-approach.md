# TypeScript migration approach

Status: resolved
Type: grilling
Blocked by: 01, 02

## Question

How does the Electron app move from JavaScript to TypeScript? Decide: file-by-file with `allowJs` or another path; build tooling; strictness and lint rules (from `CODING_STANDARDS.md`); the schema library for parsing at boundaries (IPC, storage, server responses); how each step is verified not to change behavior; and what "done" means.

## Comments

Grilling notes (2026-11-23), in progress:

- Q1 path: **big bang** (one branch converts everything), not file-by-file. Owner's choice.
- Libraries named by owner: `pino` + `pino-pretty` (logger), `zod` (schemas). Same as `WhisperAPP` (`zod ^4`, `pino ^10`).
- Owner wants **every dependency upgraded** (Node, Electron, Next, `better-sqlite3`, ...): graduates the "Dependency and toolchain health" fog. Facts today: Electron `^30.5`, `better-sqlite3 ^9.6`, Next `^14.2`, React 18, Tailwind 3 (only in `whisper_web`; the Electron UI is Lit with CSS in JS strings).
- Standing preference from owner: **"do what the industry does"**: pick the industry-standard tool or pattern by default. "Modern stack": pnpm, latest stable versions, strict TS, zod, pino.
- Q2/Q3 order: (1) dependency upgrades + pnpm on today's JS code, separately; (2) main + preload to TypeScript, big bang; (3) Electron UI rewritten from Lit to **React + TypeScript + Tailwind** (Lit is not converted to TS first: that would be thrown away). Screenshots of every window and state are taken before (3), so the React UI looks the same. Owner's reasons: Discord, Slack, Notion, Linear are Electron + React; same framework as `whisper_web` and `WhisperAPP`.
- Q4 build: **electron-vite** (builds main, preload, renderer) + keep **electron-builder** for installers, notarize, GitHub releases, auto-update. Replaces `build.js`.
- Q5 tooling defaults, all accepted ("follow the stable industry"): Vitest replaces Jest, Playwright for e2e; ESLint 9 flat config + `typescript-eslint` strict type-checked + `CODING_STANDARDS.md` rules, Prettier kept; `strict: true`; ESM `import`/`export` in source, the 2 import cycles broken, preload bundled into one file; one shared typed IPC channel contract used by main, preload and UI, payloads parsed with zod in main, dead channels deleted; pino everywhere (pino-pretty in dev) replacing `console.*`; Node version pinned in `.nvmrc` + `package.json` `engines`. "Stable" = latest stable/LTS releases, never beta.

## Answer

Resolved 2026-11-23 with the owner. Standing rule: **follow the stable industry standard** (latest stable/LTS, never beta).

**Order (one step at a time, each verified before the next):**

0. **Safety net first.** Playwright drives the real Electron app (`_electron.launch`), written against today's JS code: smoke tests (app opens, header shows, Ask answers with a stubbed LLM, settings save, a session is written to the DB) plus screenshots of every window and state for visual regression. A short manual checklist covers what cannot be automated (mic, system audio, macOS permissions, login). Existing tests are judged in [Which tests to delete](09-which-tests-to-delete.md); many may go.
1. **Upgrades + pnpm** on today's JS code: Node, Electron, `better-sqlite3`, Next, React, Tailwind and the rest, to latest stable. Separate from the TS move, so a break points at one cause.
2. **Main + preload to TypeScript, big bang** (one branch, not file-by-file).
3. **Electron UI rewritten from Lit to React + TypeScript + Tailwind.** The Lit code is not converted to TS first (that work would be thrown away). Must match the step-0 screenshots. Rationale: Electron + React is what Discord, Slack, Notion and Linear use; same framework as `whisper_web` and `WhisperAPP`.

**Tooling:**

- Build: **electron-vite** (main, preload, renderer) replaces `build.js`; **electron-builder** stays for installers, notarize, GitHub releases, auto-update.
- Tests: **Vitest** replaces Jest; **Playwright** for e2e and screenshots.
- Lint/format: ESLint 9 flat config + `typescript-eslint` strict type-checked + `CODING_STANDARDS.md` rules; Prettier kept.
- TypeScript `strict: true`. ESM `import`/`export` in source; the 2 import cycles are broken; preload bundled into one file (sandbox).
- IPC: one shared typed channel contract for main, preload and UI; payloads parsed with **zod** in main; dead channels deleted.
- Logs: **pino** (+ `pino-pretty` in dev) replaces the 724 `console.*` calls.
- Node pinned in `.nvmrc` + `engines`.
- Vendored libs (Lit, marked, hljs, DOMPurify, smd) go away with the React rewrite or become npm packages; `aec.js` stays JS with a `.d.ts`.

**Done means:** no `.js` in `src/` except `aec.js`; `tsc` strict with zero errors; lint with zero errors and no `eslint-disable`; smoke tests, kept unit tests and screenshots pass; CI builds mac/win/linux installers and the mac one launches; manual checklist done.

New tickets: [Target versions for the upgrade](10-upgrade-target-versions.md), [What the smoke tests and screenshots cover](11-smoke-test-coverage.md).
