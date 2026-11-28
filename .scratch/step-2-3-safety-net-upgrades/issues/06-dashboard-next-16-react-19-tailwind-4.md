# 06: Dashboard on Next 16, React 19 and Tailwind 4

**What to build:** `whisper_web` runs on Next 16, React 19, Tailwind 4, ESLint 10 and TypeScript 6, and its 10 pages look the same as their "before" screenshots. Follows [Spec: Steps 2 and 3](../spec.md), "Step 3: toolchain", `whisper_web`.

**Blocked by:** 03, 04

**Status:** claimed

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). Tailwind 4 changes default styles, and each visual difference needs judgment on how to fix it.

- [ ] `whisper_web` dependencies are on their targets: Next 16, React 19, Tailwind 4 (`tw-animate-css` replaces `tailwindcss-animate`), ESLint 10, TypeScript 6. Jest stays at its current major; only Testing Library is upgraded for React 19
- [ ] `swcMinify` and the `webpack` key leave the Next config
- [ ] `next lint` becomes `eslint .` with an ESLint 10 flat config holding the same rules as today (`next/core-web-vitals`)
- [ ] The Tailwind 4 upgrade tool is run
- [ ] The ticket 03 script takes "after" screenshots; each page is compared by eye with its "before" image, with a pixel diff to point at differences, and every difference is fixed. The after images are saved in `assets/`
- [ ] `whisper_web` Jest, lint and type-check pass with the ticket 02 counts
- [ ] The Electron suite still passes (main serves the dashboard export)
- [ ] Work on its own branch, merged into `dev` through a pull request
