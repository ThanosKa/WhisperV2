# 06: Dashboard on Next 16, React 19 and Tailwind 4

**What to build:** `whisper_web` runs on Next 16, React 19, Tailwind 4, ESLint 10 and TypeScript 6, and its 10 pages look the same as their "before" screenshots. Follows [Spec: Steps 2 and 3](../spec.md), "Step 3: toolchain", `whisper_web`.

**Blocked by:** 03, 04

**Status:** claimed

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). Tailwind 4 changes default styles, and each visual difference needs judgment on how to fix it.

- [x] `whisper_web` dependencies are on their targets: Next 16, React 19, Tailwind 4 (`tw-animate-css` replaces `tailwindcss-animate`), ESLint 10, TypeScript 6. Jest stays at its current major; only Testing Library is upgraded for React 19
- [x] `swcMinify` and the `webpack` key leave the Next config
- [x] `next lint` becomes `eslint .` with an ESLint 10 flat config holding the same rules as today (`next/core-web-vitals`)
- [x] The Tailwind 4 upgrade tool is run
- [x] The ticket 03 script takes "after" screenshots; each page is compared by eye with its "before" image, with a pixel diff to point at differences, and every difference is fixed. The after images are saved in `assets/`
- [x] `whisper_web` Jest, lint and type-check pass with the ticket 02 counts
- [x] The Electron suite still passes (main serves the dashboard export). Note: deferred to the end-of-spec run (owner, 2026-11-28)
- [ ] Work on its own branch, merged into `dev` through a pull request

## Comments

### 2026-11-28, implementation (branch `step-2-3-06-dashboard-next-16`)

**Versions, checked on npm on 2026-11-28.**

| Package | Before | After |
|---|---|---|
| `next`, `eslint-config-next` | 14.2.35, 14.0.4 | 16.4.6, 16.4.6 |
| `react`, `react-dom` | 18.3.1 | 19.3.1 |
| `@types/react`, `@types/react-dom` | 18.3 | 19.3.3, 19.3.0 |
| `tailwindcss` | 3.4.17 | 4.3.5, with `@tailwindcss/postcss` 4.3.5 |
| `tailwindcss-animate` | 1.0.7 | removed, `tw-animate-css` 1.4.0 instead |
| `autoprefixer` | 10.4 | removed (Tailwind 4 does its job) |
| `eslint` | 8.57.1 | 10.15.0 |
| `typescript` | 5.9.3 | 6.0.3 (7.0 is out; ticket 10 chose 6) |
| `@testing-library/react` | 14.3.1 | 16.3.3, with its `@testing-library/dom` 10.4.2 peer |
| `jest`, `jest-environment-jsdom`, `@types/jest` | 29 | 29 (unchanged on purpose) |
| `lucide-react` | 0.294.0 | 0.294.0 (kept on purpose, see below) |
| `react-markdown` | 9.1.0 | 10.1.0 (review fix, see "Review fixes" below) |

- ESLint 10.16.0 is the newest, but it was published on 2026-11-27, and pnpm's 1-day `minimumReleaseAge` refuses it. 10.15.0 is the newest it accepts.
- `@testing-library/jest-dom` 6 and `user-event` 14 already work with React 19, so they stay. Jest-dom 8 is out, but it is not needed for React 19.

**`lucide-react` stays on 0.294.** Version 0.294 does not list React 19 as a peer. Every release that does list it (0.469 onward) redraws icons the dashboard uses:
- 0.469 redraws 7 of the 33 icons the dashboard uses.
- 1.82 redraws 18 of them. On the download page the phone icon came out narrower, and on the help page the message icon changed.
- 0.294 runs on React 19 with no change.

`pnpm-workspace.yaml` now has `peerDependencyRules.allowedVersions` that accept these peer ranges:
- `lucide-react`'s React range.
- The ESLint 9 ranges of `eslint-plugin-import`, `eslint-plugin-jsx-a11y` and `eslint-plugin-react`. `eslint-config-next` 16 wraps those three plugins for ESLint 10 (`fixupPluginRules`).

`pnpm peers check` reports nothing. New icons can come with the new look in steps 5-6.

**Config changes:**
- `next.config.mjs`:
  - `swcMinify` and the `webpack` key are removed.
  - `agentRules: false` is added. Next 16's `next dev` writes `whisper_web/AGENTS.md` when an AI agent runs it, and the repo's agent docs come in step 8.
- `eslint.config.mjs` replaces `.eslintrc.json`, and `lint` is now `eslint .`.
  - It spreads `eslint-config-next/core-web-vitals`.
  - It switches off the 15 rules that `eslint-config-next` 16 adds: the React Compiler rules of `react-hooks` 7 and `@next/next/no-location-assign-relative-destination`. Left on, they gave 14 errors.
  - Unused disable comments stay unreported, as with ESLint 8.
  - Checked with `--print-config`: the 47 enabled rules and their levels are the same as with ESLint 8 and `eslint-config-next` 14.
- `tsconfig.json`:
  - `baseUrl` is removed. TS 6 deprecates it, and `paths` works without it.
  - `tailwind.config.ts` leaves `include`.
  - Next 16 adds `jsx: react-jsx`, `target: ES2017`, `out/dev/types` and `.next/dev/types` itself. They are committed, because Next writes them again on every run.
- `backend_node/tsconfig.json` moves from `commonjs` and `node` resolution to `node16` and `node16`. TS 6 deprecates `node10`. The emitted `dist/` is byte-identical.
- `components.json`: the Tailwind config path is empty, as shadcn expects on Tailwind 4.

**Code changes the upgrade forced:**
1. TS 6's DOM types add `scrollMargin` to `IntersectionObserver`. The two test mocks, in `jest.setup.ts` and `activity-page.test.tsx`, gain the field.
2. `eslint .` also lints `backend_node`, which `next lint` skipped. Its two anonymous default exports, in `ipcBridge.ts` and `middleware/auth.ts`, now get a name. The emitted shape is the same.
3. The upgrade tool renamed classes in 19 files: `shadow-sm` became `shadow-xs`, `outline-none` became `outline-hidden`, `flex-grow` became `grow`, and so on. The tool also changed the billing page's Button `variant='outline'` to `'outline-solid'`. That is a prop value, not a class, so it is back to `'outline'`.

**Visual differences found and fixed.** The pixel diff counts a pixel as "visible" when one channel differs by more than 16 levels.

1. **Chromium itself changed between the baselines.**
   - Ticket 04 moved Playwright from 1.56 (Chromium 141) to 1.65 (Chromium 159). Ticket 03's "before" images were taken on Chromium 141.
   - On the unchanged dashboard (`dev` at 8a9a6d0), Chromium 159 alone moves text by 2-6 px:
     - billing: 56,549 visible pixels; the card titles sit higher.
     - privacy: 23,964 visible pixels.
     - settings: 1,961 visible pixels; the "Signed in with…" line moves.
   - So before any upgrade, the script took the 10 pages again on Chromium 159 (`assets/dashboard-before-chromium159-*.png`), and the after images are compared with those.
   - Every remaining difference between ticket 03's images and the after images is one of these Chromium shifts.
2. **Next 16's dev-tools badge.** Next 15+ draws an "N" badge over the sidebar's avatar in dev mode. The screenshot script hides `<nextjs-portal>` and prints page and console errors instead, because the hidden portal also holds Next's error overlay.
3. **Tailwind 4's OKLCH palette.** Tailwind 4 redefined its palette in OKLCH, so every gray, slate, stone, blue, green, purple, red and yellow shade shifted slightly, by up to 35 levels: 30,930 visible pixels on download and 18,509 on settings.
   - Fix: `app/tailwind-v3-colors.css` sets those 8 families back to the tailwindcss 3.4.17 values, generated from its `colors.js`.
4. **Placeholder color.** Tailwind 4 draws placeholders in the text color at 50%, so the personalize textarea's placeholder turned dark (407 visible pixels on home and on personalize).
   - Fix: gray-400 again, with the compatibility style from Tailwind's upgrade guide.
   - The same block keeps the pointer cursor on buttons. Tailwind 4 changed it to the arrow; a screenshot cannot show this.
5. **`space-y` and `space-x`.**
   - Tailwind 4 puts the gap after every child but the last, with a zero-specificity selector. Tailwind 3 put it before every child but the first.
   - On settings, the profile header's avatar row gained a 6 px bottom margin, which pushed the divider and the details grid down.
   - Fix: `globals.css` removes Tailwind 4's margin and restores Tailwind 3's sibling rule for the 9 values in use (`space-y-0/1/1.5/2/3/4/8` and `space-x-2/10`). It covers the dialogs, sheets and toasts that the screenshots do not reach. A new `space-*` value would get Tailwind 4's behavior.
6. **Default ring color.**
   - `ring-*` without a color class was blue-500 at 50% and is now the text color.
   - The login page's sync button uses it in its success and error states. That is a focus state, so the screenshots do not show it.
   - Fix: `--default-ring-color` in `@theme`.

The upgrade tool dropped the `tailwindcss-animate` plugin without a replacement. `tw-animate-css` is imported in `globals.css`. It generates all 19 animation classes the dashboard uses; I checked this by compiling them.

**Result: after compared with before-chromium159.** These are the final after images in `assets/`, compared with `dashboard-pixel-diff.mjs before-chromium159 after`:

| Page | Visible pixels | Largest difference |
|---|---|---|
| home, personalize, login, activity details, settings, billing, privacy, help | 0 | ≤ 4 levels: shadow and edge rounding |
| activity | 1,581 | 238. Only the "Total time in meetings" number: the fake data makes it random, and it changes between two runs of the same code too |
| download | 41 | 49. Icon edges only; they look the same by eye at 4x. Download is one of ticket 03's noisy pages |

- I compared each after image by eye with its before image (ticket 03's, and the Chromium 159 one) and saw no difference beyond the Chromium shifts above.
- A rerun after `git merge dev` gave the same numbers, plus 12 pixels on the corners of billing's "Monthly" button. Those look the same at 4x: anti-aliasing noise.
- Activity details shows "Session not found" in every set, including ticket 03's before image. `sessionId=sess-0` is not in the fake data, so that page's normal state is not covered.
- Home logs a 404 for `/favicon.ico`, which the dashboard has never had.

**Files in `assets/`:**
- `dashboard-after-*.png` and `dashboard-before-chromium159-*.png`, as described above.
- `dashboard-pixel-diff.mjs`, which prints a table per page and can write red-on-grey diff images. Rerun from the repo root: `node .scratch/step-2-3-safety-net-upgrades/assets/dashboard-pixel-diff.mjs <labelA> <labelB> [outDir]`.
- `dashboard-screenshots.mjs` now:
  - resolves `next` the way Node does from `whisper_web`. pnpm's hoisted layout has no `whisper_web/node_modules/.bin/next`.
  - hides Next's badge.
  - prints page errors.

**Checks, after `git merge dev` (478bf69):**

| Check | Result | Ticket 02 baseline |
|---|---|---|
| `pnpm install --frozen-lockfile` | exit 0 | n/a |
| `whisper_web` Jest | 5 suites, 49 tests passed | 49 |
| `whisper_web` lint (`eslint .`) | no warnings or errors | same |
| `whisper_web` type-check | exit 0 | exit 0 |
| `pnpm run build:all` (renderer and the static export main serves) | exit 0, 11 routes | exit 0 |

- The export was served the way `src/index.js` serves it (its two Express middlewares, without Electron). All 10 pages and their CSS answered 200, and `backend_node/dist` loads.
- Root Jest was not rerun: the permission check refused it in this session. This ticket changes no root code; only `pnpm-workspace.yaml` and the lockfile changed.
- The Electron suite was not run, as the owner ordered.

### 2026-11-28, CI fix: type-check on a clean checkout (PR #13)

**The failure.** CI's "Type-check web app" step failed with this error:

```
app/layout.tsx(1,8): error TS2882: Cannot find module or type declarations for side-effect import of './globals.css'
```

- TypeScript 6 checks side-effect imports by default.
- The declaration for `*.css` comes from `next/image-types/global`, which the gitignored `next-env.d.ts` references.
- My local runs passed only because `next dev` and `next build` had written that file. A clean worktree reproduced the error.

**The fix.** `type-check` is now `next typegen && tsc --noEmit`.
- `next typegen` (Next 16) writes `next-env.d.ts` and the route types into `out/types` without a build.
- I chose it over a hand-written `declare module '*.css'`, because the types stay Next's own and also cover the routes.
- It leaves `tsconfig.json` unchanged.

**Checks on the clean worktree** (`pnpm install --frozen-lockfile`, then the CI commands):
- type-check: exit 0
- lint: clean
- `whisper_web` Jest: 49 passed

### 2026-11-28, end-of-spec run (branch `step-2-3-end-run`, `dev` at 7ab4197)

End-of-spec run 2026-11-28: passed. The Electron suite against the development app, after `pnpm run build:all` (which builds the dashboard export main serves): 10 of 10 passed in one full run. `whisper_web` Jest 49 passed, lint clean, type-check exit 0.

### 2026-11-28, review fixes (branch `step-2-3-review-fixes`)

- **`react-markdown` 9.1.0 → 10.1.0.** The review found 9 left behind. Its one breaking change in 10.0 removes the `className` prop of `<ReactMarkdown>`. `components/Markdown.tsx` already puts its class on a wrapping `<div>`, so no code changed. A one-off render of a sample with headings, lists, a table, inline and fenced code, a link, a quote and a rule (GFM, a `code` component reading `className`) gave byte-identical HTML on 9.1.0 and 10.1.0.
- **`lucide-react` stays on 0.294.0, on purpose.** Every release that lists React 19 as a peer redraws icons the dashboard uses (see the table above and its note), and the dashboard must look the same until steps 5-6. 0.294 runs on React 19 unchanged.
- **`agentRules: false` in `next.config.mjs` is justified scope.** Next 16's `next dev` writes `whisper_web/AGENTS.md` when an AI agent runs it. That file would be a stray agent doc, and the repo's agent docs come in step 8. Recorded under "Config changes" above.
