# Spec: Steps 4a-1 and 4b-1, main and preload to TypeScript, dashboard cleanup

Status: open
Label: ready-for-agent

Steps 4a-1 and 4b-1 of [Order of the work](../whisper-cleanup/issues/07-work-order.md), from the [Whisper cleanup map](../whisper-cleanup/map.md), run as one spec at the owner's request (2026-11-28). The two run in parallel after a shared tooling ticket. Decisions come from [TypeScript migration approach](../whisper-cleanup/issues/04-typescript-approach.md), [Which tests to delete](../whisper-cleanup/issues/09-which-tests-to-delete.md), [Code structure for main and preload](../whisper-cleanup/issues/15-main-code-structure.md), [whisper_web cleanup scope](../whisper-cleanup/issues/18-whisper-web-cleanup.md) and `CODING_STANDARDS.md` at the workspace root. It starts from the state recorded in [Spec: Steps 2 and 3](../step-2-3-safety-net-upgrades/spec.md).

## Problem Statement

The owner wants the Whisper desktop app and its local dashboard written to one standard (strict TypeScript, the rules in `CODING_STANDARDS.md`), so that later steps (the new main structure, the React UI, direct-to-Soniox) can be done safely, including by agents. After steps 2 and 3 everything runs on supported versions, but:

- **Main and preload are untyped JavaScript.** 41 CommonJS files (about 10,000 lines) ship unbuilt. Nothing checks that a service calls another with the right arguments, that an IPC payload has the fields main expects, or that a database row has the shape the code reads. A mistake shows up only when a user hits it.
- **IPC is stringly typed.** 68 `ipcMain` handlers and the preload's ~115 calls agree on channel names and payloads only by convention. A renamed channel or a missing field fails silently.
- **External data is trusted as it arrives.** Environment variables, WhisperAPP responses, stored settings and IPC payloads are read without being checked.
- **Two defaults for one domain.** Auth and LLM default to `https://app-whisper.com` (which answers every request with a 308 redirect), preload and the UI default to `https://www.app-whisper.com`.
- **Logs are 533 `console.*` calls in main** with no level, id or context, so a log line cannot be traced to a session or a request.
- **There is no lint in the root.** ESLint is not installed there; `pnpm lint` fails. The dashboard is linted with Next's rules only, and 15 newer Next rules are switched off until the code is reviewed for them.
- **Two build tools for one app.** `build.js` (esbuild) builds the renderer; main and preload are not built at all.
- **The root tests run on Jest**, which the plan replaces with Vitest.
- **The dashboard's page tests mock the code under test.** They replace `@/utils/api` and `@/utils/auth` with mocks, so they pass even if the real API calls break. The dashboard also carries dead files and endpoints, and files of 500-600 lines (`Sidebar.tsx`, the activity pages).

## Solution

One shared tooling ticket comes first. Then two tracks run side by side:

- **4a-1, main and preload in TypeScript, today's structure.** electron-vite builds main, preload and the Lit renderer (moved as it is), replacing `build.js`; electron-builder still packages. Main and preload are strict TypeScript with ESM imports, under `src/main/`, `src/preload/`, `src/shared/` and `src/renderer/`. One typed list of IPC channels in `src/shared/` is used by main and preload; main parses each payload with zod. Environment values are parsed once, with one `API_BASE_URL` defaulting to `https://www.app-whisper.com`. pino replaces `console.*` in main and preload. The root tests move to Vitest as they are, minus the ones already marked for deletion. The services, the bridges, the import cycles and `windowManager` keep their shape: changing that is step 4a-2.
- **4b-1, dashboard cleanup.** The dashboard moves to Vitest. Its page tests are rewritten with Testing Library and MSW (a library that answers the page's real network requests with fixed data), against today's code first, and stay green through every later change. It follows the shared lint and strict TypeScript, including the 15 Next rules now switched off. Its folders take the standard Next + shadcn layout, its large components are split, and its dead files and endpoints are deleted. The 10 dashboard pages look the same as their step-3 screenshots.

Nothing the user sees changes, in the desktop app or in the dashboard.

## User Stories

### Shared tooling

1. As the owner, I want one ESLint 10 flat config at the `WhisperV2` root for both the desktop app and the dashboard, so that one set of rules covers all the TypeScript I own.
2. As the owner, I want the mechanical rules of `CODING_STANDARDS.md` enforced by lint (no `any`, no type assertions, no non-null `!`, no `console`, exhaustive `switch`, object arguments), so that an agent cannot skip them.
3. As the owner, I want `pnpm lint` to work in the root, so that the command that fails today becomes a real check.
4. As the owner, I want one strict base TypeScript config that the app and the dashboard extend, so that strictness is set in one place.
5. As the owner, I want Vitest to run the root and dashboard tests from one command, so that the agent and CI run one test step.
6. As the owner, I want CI to run lint, type-check and tests for the whole repo on every pull request to `dev`, so that a break is caught before it merges.
7. As an agent, I want lint failures to never be silenced with `eslint-disable`, so that a rule is either followed or changed in the config on purpose.

### 4a-1: build

8. As the owner, I want electron-vite to build main, preload and the renderer, so that the app has one build tool and `build.js` goes.
9. As the owner, I want electron-builder to keep packaging, signing, notarizing and publishing from the electron-vite output, so that the release path from steps 2-3 keeps working.
10. As the owner, I want the packaged app to launch and pass the smoke tests, so that a packaging break (paths, asar, native modules) is caught now, not at step 9.
11. As a developer, I want one `pnpm dev` that starts the app with reload on change, so that working on it is quick.
12. As the owner, I want the preload built into one file that runs in Electron's sandbox, so that the renderer stays isolated as today.
13. As the owner, I want `SystemAudioDump`, the icons and the other assets found at the same place in dev and in the packaged app, so that Listen and the windows work in both.

### 4a-1: folders and TypeScript

14. As an agent, I want the electron-vite folders (`src/main/`, `src/preload/`, `src/renderer/`, `src/shared/`), so that I know at once which process a file runs in.
15. As an agent, I want main's feature folders kept as they are today inside `src/main/`, so that this step changes the language and nothing else, and a break points at one cause.
16. As the owner, I want every main and preload file in strict TypeScript with zero type errors, so that wrong calls fail at compile time.
17. As the owner, I want ESM `import`/`export` in all source, so that the code matches the rest of my repos and the bundler can check imports.
18. As the owner, I want zero lint errors in main, preload, shared and the e2e tests, so that the standard holds from the first TypeScript commit.
19. As the owner, I want file and folder names kept as they are today (only `.js` becomes `.ts`), so that this step does not also decide a naming style.
20. As the owner, I want the Lit renderer moved as it is, not converted to TypeScript, so that no work is spent on code that step 6 replaces.
21. As the owner, I want database rows typed and parsed where they are read, so that a column change fails loudly instead of returning `undefined`.

### 4a-1: IPC

22. As the owner, I want one list of every IPC channel in `src/shared/`, with each channel's payload and result types and a zod schema, so that main and preload cannot disagree.
23. As the owner, I want main to parse every payload from a window with its schema before using it, so that a bad payload is rejected and logged, not acted on.
24. As the owner, I want each schema to accept exactly what today's UI sends, so that parsing changes nothing for the user.
25. As the owner, I want preload to expose the same `window.api` the Lit UI calls today, typed from the list, so that the UI keeps working unchanged.
26. As the owner, I want channels that nothing sends or handles deleted, so that the list holds only live channels.

### 4a-1: config, domain, logs

27. As the owner, I want environment values read and validated once in main with zod, so that a wrong value fails at startup with a clear message.
28. As the owner, I want one `API_BASE_URL` defaulting to `https://www.app-whisper.com`, used by auth, LLM, preload and the UI, so that no request goes through the 308 redirect and no file hard-codes the domain.
29. As the owner, I want preload to receive `API_BASE_URL` from main, so that the renderer and main always use the same value.
30. As the owner, I want local WhisperAPP still reachable through the `API_BASE_URL` override, and the e2e fake server through the same variable, so that development and tests work as before.
31. As the owner, I want pino logs with a level, an id and context in main and preload, pretty-printed in dev, so that a log line can be traced to a session or request.
32. As the owner, I want logs to go where `console.*` goes today (stdout), so that this step does not decide what leaves the Mac (that is [Error reporting from the desktop app](../whisper-cleanup/issues/20-error-reporting.md)).

### 4a-1: tests

33. As the owner, I want the tests already marked for deletion deleted first (`authService.test.js`, `listenService.test.js`, the two "does not throw" tests in `settingsService.test.js`), so that nothing is ported that is being thrown away.
34. As the owner, I want the other root tests moved to Vitest in TypeScript with the same checks, so that the service logic stays guarded while the language changes.
35. As the owner, I want the e2e suite launched from the electron-vite build, in dev and packaged, with no change to what it checks, so that it judges this step against the step-3 baseline.
36. As the owner, I want the e2e test files type-checked and linted, so that the suite follows the same standard as the app.
37. As the owner, I want the six window screenshots to match the step-3 baselines, so that moving the renderer to a new bundler changes nothing visible.

### 4b-1: dashboard

38. As the owner, I want the dashboard tests on Vitest, so that one test tool runs everywhere and Jest, `ts-node` and `next/jest` go.
39. As the owner, I want page tests that stub the network with MSW instead of mocking `@/utils/api` and `@/utils/auth`, so that the tests exercise the real API calls the page makes.
40. As the owner, I want those page tests written against today's code before anything else changes, so that they guard the folder moves and component splits.
41. As the owner, I want MSW to fail a test on any request it does not know, so that a changed endpoint is noticed.
42. As the owner, I want tests that only re-check what a page test already covers deleted, so that the suite has no slop.
43. As the owner, I want the dashboard under the shared lint and strict TypeScript, so that it follows the same rules as the app.
44. As the owner, I want the 15 Next 16 rules that are switched off today turned on and the code fixed for them, so that the dashboard is reviewed for them as planned.
45. As an agent, I want the standard Next + shadcn folders (`app/` unchanged, `components/ui/` for registry components, `components/<feature>/`, `lib/` instead of `utils/`), so that I find things where Next projects keep them.
46. As an agent, I want `Sidebar.tsx`, the activity page, the activity details page and `SearchPopup.tsx` split into smaller components, so that each file does one thing.
47. As the owner, I want `requirements.txt`, `test-types.d.ts` and the three endpoints nothing calls (`/api/sync/status`, `/api/desktop/set-user`, `/api/desktop/status`) deleted, so that only live code is left.
48. As the owner, I want the 10 dashboard pages to look the same as their step-3 screenshots after every 4b-1 change, so that the cleanup is invisible.
49. As the owner, I want `devMock.ts` kept for now, so that the screenshot script still has fake data; its fate is decided in 4b-2.

### Running the work

50. As the owner, I want 4a-1 and 4b-1 to run in parallel after the shared tooling ticket, so that the step finishes sooner.
51. As an agent, I want the type-check, lint and Vitest suites run after every ticket, and the full Electron suite once at the end of the spec (dev and packaged), so that a break points at one change without the windows taking the owner's screen all day.
52. As the owner, I want each ticket on its own branch and pull request into `dev`, merged by the agent, so that `main` and releases stay untouched until step 9.

## Implementation Decisions

### Order and tickets

- **Ticket 1, shared tooling, blocks both tracks:** the root ESLint config, the base TypeScript config, Vitest at the root with one project per package, and CI. Each package's own files join lint and type-check in its own track.
- **Then two tracks in parallel.** 4a-1 touches `src/`, `tests/`, the build and the packaging config. 4b-1 touches `whisper_web/`, except `whisper_web/backend_node/`. Shared files (root `package.json`, `pnpm-lock.yaml`, the ESLint config) can conflict: a branch rebases on `dev` and re-runs `pnpm install` before its PR.
- **4a-1 is one big-bang conversion** ([TypeScript migration approach](../whisper-cleanup/issues/04-typescript-approach.md)): the move to TypeScript lands on one branch, because main does not run half CommonJS and half bundled ESM. `/to-tickets` may still cut it where each cut builds and passes on its own (for example: electron-vite with today's JS first, then TypeScript, then IPC typing, then pino, then the Vitest move).
- **4b-1 order:** the MSW page tests on Vitest first; then lint and strict-type fixes, folders, component splits and deletions, each checked against the page tests and the dashboard screenshots.
- Branches follow the map: one per ticket, PR into `dev`, merged by the agent. Nothing goes to `main`.

### Shared tooling

- **ESLint 10 flat config** at the `WhisperV2` root, with `typescript-eslint` strict type-checked. Rules that carry `CODING_STANDARDS.md`: `no-explicit-any`, `consistent-type-assertions` with assertions forbidden (`as const` allowed), `no-non-null-assertion`, `no-console`, `switch-exhaustiveness-check`, and a rule that named functions take at most one parameter, with inline callbacks exempt. The exact rule that does this last part is chosen in the ticket. The judgment rules (discriminated unions, branded IDs, parse at the boundary) are followed in code, not linted. `whisper_web` adds only `eslint-config-next`.
- **Not linted in this spec:** the Lit renderer under `src/renderer/` (rewritten in step 6, including the vendored `aec.js`, which gets a `.d.ts` then), `whisper_web/backend_node/` (rewritten on Hono in 4a-2), and build and release scripts outside `src/` (`scripts/`, `notarize.js`, configs). Each is listed in the config's `ignores` with the step that removes it.
- **No naming rule.** File and folder names keep today's style. Which style to enforce is not decided (owner, 2026-11-28).
- **TypeScript:** a strict base config in the root (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), extended by main, preload, shared, the e2e tests and `whisper_web`. TypeScript 6 everywhere, as in `whisper_web` today. One `pnpm type-check` runs them all.
- **Vitest** at the root with projects: main (Node environment), `whisper_web` (jsdom). `pnpm test` runs both. Jest, `jest-environment-*`, `@jest/globals`, `@types/jest`, `ts-node`, the Jest configs and setup files are deleted when their last test has moved.
- **CI** (`ci.yml`): install, lint, type-check, Vitest. The Electron suite still runs only on the owner's Mac (see Out of Scope).

### 4a-1: build with electron-vite

- electron-vite builds three targets: main, preload and renderer. Its output folder is what electron-builder packages. `electron-builder.yml`'s `files`, `asarUnpack` and `extraResources` follow the new paths. The `package.json` `main` field points at the built main.
- **Output format:** main and preload are built as CommonJS, which is electron-vite's default without `"type": "module"`. A sandboxed preload must be CommonJS, `__dirname` keeps working in main, and the CommonJS scripts in the repo stay as they are. The source is ESM.
- **Renderer:** the Lit UI moves to `src/renderer/` unchanged, built by electron-vite's renderer build with today's three HTML entries (header, content, recovery toast). The vendored scripts (Lit, marked, highlight.js, DOMPurify, smd) and `aec.js` are served as they are. If the renderer build cannot serve them without changing the Lit code, the renderer keeps `build.js` until step 6, and the ticket records why.
- **Windows load** the built HTML from the electron-vite output in the packaged app, and from the dev server in `pnpm dev`, as electron-vite does by default. `SystemAudioDump` and the icons resolve the same way in dev and packaged.
- The dashboard export and `backend_node` build are unchanged; main still loads `backend_node`'s compiled output until 4a-2.

### 4a-1: folders and TypeScript

- `src/main/` holds what is today `src/index.js`, `src/window/`, `src/bridge/` and `src/features/`, with the same folders and file names inside. `src/preload/` holds the preload. `src/shared/` holds what main and preload share: the IPC list and its types. `src/renderer/` holds the Lit UI.
- **Today's structure stays** ([Code structure for main and preload](../whisper-cleanup/issues/15-main-code-structure.md), 4a-1): module-level singletons, `featureBridge`, `windowBridge`, `internalBridge`, the repository `index` layers, the two import cycles and `windowManager` keep their shape. electron-vite bundles the cycles, since their `require`s already run only inside functions. If an import must run inside a function to keep a cycle working, the ticket uses a dynamic `import()` at the same place and records it.
- **Types come from schemas** where data enters (`CODING_STANDARDS.md`, "Parse at the boundary"): environment, WhisperAPP responses (auth, LLM, the stream's chunks), `electron-store` reads, database rows and IPC payloads are parsed with zod into named types, and trusted from there. Types between modules are derived from those (`z.infer`, `ReturnType`, `Pick`) before new interfaces are declared.
- **Database rows:** each repository's read functions parse rows into a named type. The schema in `config/schema.js` stays the source of the tables.
- **Domain modelling stays light in this step.** Discriminated unions and branded IDs are used where the types need them to compile without casts. A deeper reshaping is 4a-2.

### 4a-1: IPC contract

- **One list** in `src/shared/` names every channel, its kind (`invoke`, renderer-to-main `send`, main-to-renderer event), its payload schema and its result type. Main and preload import it.
- **Main:** `featureBridge`, `windowBridge` and the other `ipcMain` registrations stay where they are but register through one typed helper. The helper parses the payload with the channel's schema. A failed parse is logged with the channel name and the zod issues, and the call is rejected, which is what a thrown handler does today.
- **Schemas match today's senders.** Each is written from the renderer's call sites and the main handler's reads, so that today's UI passes them. The 4 smoke tests and the 6 screenshots confirm it.
- **Preload** exposes the same `window.api` shape as today. Its functions are typed from the list, so a renamed channel fails type-check in preload. The Lit UI does not change.
- **Dead channels:** a channel with no sender or no handler is deleted on both sides. The list of deleted channels goes in the ticket.
- Moving the registrations into each feature and deleting the two bridge files is 4a-2.

### 4a-1: config and domain

- **One config module in main** parses `process.env` with zod at startup, after `dotenv` loads. It covers every variable main reads today: `API_BASE_URL`, `STT_RELAY_URL`, `NODE_ENV`, `OPENAI_TRANSCRIBE_LANG`, and the `whisper_*` values. A variable that nothing reads is deleted. The four dashboard port/URL variables stay until 4b-2.
- **`API_BASE_URL`** defaults to `https://www.app-whisper.com`, trailing slash removed. Auth, the LLM client, preload and the UI all use it. The `https://app-whisper.com` defaults are deleted, and no other main or preload file contains the domain.
- **Preload** gets the value from main, through the window's `additionalArguments` or a synchronous IPC call, as the ticket finds simplest in the sandbox. It still exposes it at `window.api.env.API_BASE_URL`, which the Lit UI reads. The UI's own `'https://www.app-whisper.com'` fallbacks stay until step 6, since the renderer is not changed here.
- `STT_RELAY_URL` keeps its Railway default until step 7.

### 4a-1: logs

- **pino** is the logger in main and preload (`pino-pretty` in dev), through one logger module. Each `console.*` call becomes a pino call at the same level, with an object holding the ids in scope (session id, window name, request or channel) and the message.
- Logs still go to stdout, as `console.*` does today. Whether error logs leave the Mac is decided in [Error reporting from the desktop app](../whisper-cleanup/issues/20-error-reporting.md).
- The Lit renderer keeps its `console.*` calls until step 6.

### 4a-1: tests

- **Deleted first:** `tests/unit/services/authService.test.js`, `tests/unit/services/listenService.test.js`, and the two "does not throw" tests in `settingsService.test.js` ([Which tests to delete](../whisper-cleanup/issues/09-which-tests-to-delete.md)).
- **Moved to Vitest as they are:** the other root unit and integration tests, and their mocks and setup, in TypeScript. `jest.fn`/`jest.mock` become `vi.fn`/`vi.mock`. Module paths follow the new folders. The checks stay the same, so a passing count shows the conversion kept the behavior. They are moved this way on purpose (owner, 2026-11-28): they guard the service logic during the TypeScript move, and 4a-2 rewrites them at seam 2.
- **The e2e suite** keeps its 14 tests and baselines. Its launch helpers point at the electron-vite output (dev) and the packaged app. Its main-process preload stays plain JavaScript loaded with `-r`, because it must run before the app's code. The suite's TypeScript files join type-check and lint.

### 4b-1: dashboard

- **Vitest** with jsdom, React Testing Library and `@testing-library/jest-dom`'s Vitest entry. `next/jest`, `jest.config.ts`, `jest.setup.ts` go.
- **MSW** (`msw/node`) stubs the dashboard's network in tests: the `/runtime-config.json` fetch, every `/api/...` route the pages call, and the WhisperAPP links. Handlers return fixed data shaped like `backend_node`'s real responses. Unknown requests fail the test (`onUnhandledRequest: 'error'`).
- **Page tests** for login, activity and settings are rewritten to MSW against today's code, then stay green through every 4b-1 change. Pages with no test today get one only where a 4b-1 change touches their logic (for example the split activity details page). `__tests__/utils/api.test.ts` and `__tests__/utils/auth.test.ts` are judged with the `tdd` skill: a check that a page test now covers through the network is deleted, the rest are rewritten to MSW.
- **Lint and types:** `whisper_web` extends the shared config and the base TypeScript config. The 15 Next 16 rules that are switched off today are turned on, and the code is fixed for them with no visible change.
- **Folders:** `app/` unchanged; `components/ui/` holds the shadcn components; feature components go to `components/<feature>/` (`activity`, `settings`, `layout` for the sidebar and shell); `utils/` merges into `lib/`. Imports keep the `@/` alias. File names keep their current style.
- **Splits:** `Sidebar.tsx`, `app/activity/page.tsx`, `app/activity/details/page.tsx` and `SearchPopup.tsx` are split into smaller components in their feature folder, with no change in output.
- **Deleted:** `requirements.txt`, `test-types.d.ts`, and in `backend_node` the three endpoints nothing calls. Nothing else in `backend_node` changes, since 4a-2 rewrites it.
- **Kept until 4b-2:** `devMock.ts` and `NEXT_PUBLIC_DEV_MOCK`, because the screenshot script uses them; `utils/api.ts`, which moves to `lib/` unsplit; `runtime-config.json` and the port/URL variables.
- **Visual check:** after each 4b-1 ticket the agent runs the step-3 script in `../step-2-3-safety-net-upgrades/assets/` (`dashboard-screenshots.mjs`, then `dashboard-pixel-diff.mjs`) against the `dashboard-after-*` images. Any difference is fixed before the ticket closes.

## Testing Decisions

The seams below match [Which tests to delete](../whisper-cleanup/issues/09-which-tests-to-delete.md). The owner confirmed (2026-11-28) that 4a-1 moves the old service tests to Vitest as they are.

- **A good test checks only what a user or caller sees:** a window's content, a streamed answer, a saved session, a page's text after its API answers. It stubs only what cannot run locally: WhisperAPP, the STT relay, macOS permissions, the network of the dashboard. It does not mock the module it tests.
- **Seam 1, the Electron app through Playwright:** the 14-test suite from steps 2-3 (4 smoke, 6 screenshots, 4 fake-server), unchanged in what it checks. It is the main guard for 4a-1. It runs once at the end of the spec, after the code-review fixes, in dev and on the packaged build; a failing test may be rerun alone once (map, "When the Electron suite runs"). If a ticket in the middle of 4a-1 moves the renderer to electron-vite, that ticket also runs the six screenshots once, since that change is where a visual break would come from.
- **Seam 2, services through their public methods:** not written in this spec. The old root tests are moved to Vitest as they are, as a temporary net. 4a-2 rewrites them at this seam on a real in-memory DB.
- **Seam 3, dashboard pages through Testing Library with MSW:** written first in 4b-1, against today's code, then kept green.
- **Dashboard by eye:** the step-3 screenshot script and pixel diff after each 4b-1 ticket. Not part of the automated suite.
- **After every ticket:** `pnpm type-check`, `pnpm lint` and `pnpm test` (Vitest, both projects) pass. Counts are recorded in each ticket, against the step-3 counts (root 130, `whisper_web` 49) minus the tests deleted on purpose.
- **Prior art:** the e2e fixtures and fake server in `tests/e2e/` (stub only the boundary); `whisper_web/__tests__/` (Testing Library, to be moved off mocks); the step-3 baseline in `../step-2-3-safety-net-upgrades/assets/baseline.md` for how counts are recorded.

## Out of Scope

- **4a-2, the new main structure:** factories with dependencies passed in, only `windowManager` touching windows, repositories without the `index` layer, the small `auth` module, IPC registration per feature with the two bridge files deleted, `internalBridge` deleted, `index` split, the dashboard backend on Hono in `src/main/webStack/`, and the Vitest service tests at seam 2.
- **The two `Object has been destroyed` bugs in `windowManager`** (Spec: Steps 2 and 3): they are fixed in 4a-2, where `windowManager` is rewritten. 4a-1 keeps today's behavior.
- **4b-2:** the dashboard on the Hono client, `api.ts` split per feature, `runtime-config.json`, CORS and the port/URL variables deleted, and whether `devMock.ts` goes.
- **A rule for file and folder names.** Not decided; names keep today's style (owner, 2026-11-28).
- **Error reporting** and where logs go: [Error reporting from the desktop app](../whisper-cleanup/issues/20-error-reporting.md), after 4a-1.
- **The renderer in TypeScript or React,** the UI's direct `fetch` calls to WhisperAPP, and Kosmos components: step 6.
- **Build and release scripts in TypeScript** (`scripts/`, `notarize.js`).
- **Running the Electron suite in CI,** for the reason given in Spec: Steps 2 and 3.
- Any release, deploy or push to `main`: step 9.

## Further Notes

- **Main's `console` count:** 533 calls in main and preload, 213 in the Lit renderer (left alone).
- **Risk: zod schemas stricter than today's UI.** A schema that rejects a field the Lit UI sends breaks a feature only on the path that sends it, and the smoke tests do not reach every path. Each schema is written from its call sites, and any parse failure in the end-of-spec run is a bug in the schema, not in the UI.
- **Risk: bundling changes import order.** Today each `require` runs where it is written; a bundle hoists static imports. The import cycles stay working only while the cyclic imports run inside functions. The 4 smoke tests catch a broken startup.
- **Risk: vendored renderer scripts under Vite.** The fallback (keep `build.js` for the renderer until step 6) is written above so that the ticket does not stall.
- **The parallel tracks share files.** A branch rebases on `dev` and re-runs `pnpm install` before its PR, so `pnpm-lock.yaml` conflicts are resolved by the tool, not by hand.
- This spec holds roughly 8-10 tickets for `/to-tickets`. The shared tooling, the electron-vite move, the TypeScript conversion, the IPC list and the MSW page tests need judgment (Opus). The Jest-to-Vitest moves, the deletions and the folder moves are mechanical (Sonnet).
