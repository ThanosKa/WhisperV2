# whisper_web cleanup scope

Status: resolved
Type: grilling
Blocked by: 07

## Question

For step 4b of [Order of the work](07-work-order.md): `whisper_web/` (Next dashboard) and `whisper_web/backend_node/` (Express bridge) are already TypeScript and get upgraded in step 3. What else is in scope: lint rules from `CODING_STANDARDS.md`, folder structure, the page tests moving from mocking `@/utils/api` to stubbing the network, tests for `backend_node`, and whether `backend_node` should exist at all?

## Answer

Resolved 2026-11-24 with the owner.

**Facts found.** `backend_node` is an Express API that runs inside Electron main on its own random localhost port; a second Express server in `src/index.js` serves the Next static export on another port, so main writes `runtime-config.json` for the dashboard to find the API, and CORS plus `whisper_API_URL/PORT` and `whisper_WEB_URL/PORT` exist only for that split. The dashboard opens in the user's browser. Dead today: `whisper_web/requirements.txt` (old Python backend), committed `test-results/`, and `/api/sync/status`, `/api/desktop/set-user`, `/api/desktop/status` (called by nothing). `utils/devMock.ts` (621 lines) fakes data for `next dev` behind `NEXT_PUBLIC_DEV_MOCK`.

1. **The dashboard API stays, inside main, on Hono.** HTTP stays because the dashboard opens in the browser (IPC would change what the user sees). The code moves to `src/main/webStack/` and `whisper_web/backend_node/` with its own build is deleted. Express is replaced by **Hono** (TypeScript-first, zod validation, typed client), so the dashboard gets the routes' types and server/dashboard mismatches fail at compile time. Same URLs, no visible change. Root `express` and `cors` go.
2. **One server, one port.** The same Hono app serves the static pages and `/api/...`. `runtime-config.json`, CORS and the four port/URL env vars are deleted; the dashboard calls relative `/api/...`.
3. **Lint and TS:** one ESLint 10 flat config at the `WhisperV2` root (`typescript-eslint` + every `CODING_STANDARDS.md` rule) and strict TS for both `src/` and `whisper_web/`; `whisper_web` adds only Next's rules.
4. **Folders:** standard Next + shadcn layout. `app/` unchanged; `components/ui/` for registry components; `components/<feature>/`; `utils/` merges into `lib/`; `api.ts` split per feature on the Hono client; `Sidebar.tsx`, `app/activity/page.tsx` and other large files split into smaller components with no visible change.
5. **Tests (the `tdd` skill):** Vitest replaces Jest. Page tests use Testing Library with **MSW** stubbing the network instead of mocking `@/utils/api`; written against today's code first, kept green through the changes. Each API route is tested through Hono's `app.request()` on a real in-memory DB (seam 2 of [Which tests to delete](09-which-tests-to-delete.md)).
6. **`devMock.ts` and env vars:** kept only if a test or a behavior needs them, judged with `tdd` during the work; the expected outcome is that MSW handlers replace `devMock.ts` and `NEXT_PUBLIC_DEV_MOCK` goes.
7. **Components:** the dashboard moves to Kosmos too, with the shadcn CLI. Kosmos has 13 of the 15 used today; `card` and `sheet` are added to Kosmos first. Values stay the dashboard's own ([DESIGN.md scope](17-design-md-scope.md)).
8. **Visual check (no Playwright, owner's call):** before step 3 the agent takes "before" screenshots of the 10 dashboard pages on fake data with Claude in Chrome, and compares by eye after Tailwind 4 (step 3) and after the Kosmos swap (step 6), fixing any difference before moving on. Less strict than pixel comparison; accepted for a local, single-user dashboard.
9. **Order:** 4b-1 in parallel with 4a: Vitest, MSW page tests, shared lint, folders, large components split, dead files and endpoints deleted. 4a-2: the API moves into main as Hono on one port, with route tests. 4b-2 after 4a-2: the dashboard switches to the Hono client, `api.ts` split, `runtime-config.json` and unused env vars deleted. Step 6: Kosmos components in the dashboard, alongside the Electron UI.

**Not used anywhere: Effect.** Owner asked; rejected for the whole codebase (a second language on top of TS, agents write it less reliably, friction with React/Electron/Next, not the industry standard). Plain strict TS + zod.

## Comments

From [Code structure for main and preload](15-main-code-structure.md): in step 4a-2 the Express app in `backend_node` receives main's typed repositories directly, and the `web-data-request` string messages go. The dashboard's hard-coded `https://www.app-whisper.com` links already match the one `API_BASE_URL` value.

From [React UI structure](16-react-ui-structure.md): the Electron UI takes its components from the owner's Kosmos registry (shadcn format). `whisper_web` already uses shadcn components (`components/ui/`); decide whether they move to Kosmos too.
