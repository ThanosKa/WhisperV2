# Target versions for the upgrade

Status: resolved
Type: research
Blocked by: 04

## Question

For step 1 of [TypeScript migration approach](04-typescript-approach.md) (upgrade everything to latest stable on today's JS code): what is the target version of each dependency, and what breaks on the way? Cover the Node LTS to pin; Electron (from `^30.5`); `better-sqlite3` (from `^9.6`, and whether it builds on that Node and Electron); Next (from `^14.2`), React (from 18) and Tailwind (from 3) in `whisper_web`; Playwright, `electron-builder`, `express`, `sharp`; and the tools picked in ticket 04 (electron-vite, Vitest, ESLint 9 + `typescript-eslint`, zod 4, pino). For each: target version, breaking changes that touch this repo, and required code changes. Also: moving from npm to **pnpm** with `electron-builder` (`node-linker=hoisted` or other settings), the stale lockfile, and the 11 root dependencies that are never imported (delete them). Sources: official release notes and migration guides.

## Answer

Full findings: branch `research/upgrade-target-versions` (commit `3474b6a`, local only), file `.scratch/whisper-cleanup/research/10-upgrade-target-versions.md`. Highest stable on npm on 2026-11-23.

- **Electron app:** Node 26.13.1 (LTS), pnpm 12.23.0, Electron 45.4.1, `better-sqlite3` 13.2.0, `electron-builder` 26.18.1, `electron-updater` 6.8.12, `electron-store` 12.0.0, `express` 5.3.0, `sharp` 0.35.5, Playwright 1.65.1.
- **`whisper_web`:** Next 16.4.6, React 19.3.1, Tailwind 4.3.5 (`tw-animate-css` replaces `tailwindcss-animate`).
- **Tools from ticket 04:** `electron-vite` 6.0.0, Vite 8.3.8, Vitest 5.1.1, `typescript-eslint` 8.74.0, zod 4.6.7, pino 10.4.0. Two changes from ticket 04, by the stable-standard rule: **ESLint 10** (v9 is end of life) and **TypeScript 6.0.3** (TS 7 has no compiler API yet, and `typescript-eslint` needs TS < 6.1).
- **The clean-install failure is fixed by `better-sqlite3` 13** (N-API, one prebuilt binary for Electron and Node). The `postinstall` rebuild and `.npmrc` go away.
- **Code changes needed:** `electron-store` 12 is ESM-only (`.default` on two requires and the Jest mock); Express 5 `listen` callbacks at `src/index.js:833,843` must reject on error; `minimumSystemVersion` 11 → 13; in `whisper_web`, drop the `webpack` key and `swcMinify` from `next.config.mjs`, `next lint` → `eslint .` with a flat config, and run the Tailwind 4 upgrade tool.
- **pnpm:** one workspace including `whisper_web` (default, by the stable-standard rule), settings in `pnpm-workspace.yaml`: `nodeLinker: hoisted`, `allowBuilds`, `supportedArchitectures` for the universal mac build. CI moves to Node 26 with `pnpm/action-setup`. Both `package-lock.json` files are deleted, so the stale lockfile needs no repair.
- **Unused dependencies to delete:** root `@google/genai`, `@google/generative-ai`, `axios`, `jsonwebtoken`, `react-hot-toast`, `react-markdown`, `remark-gfm`, `validator`, `wait-on`, `electron-liquid-glass`, `electron-reloader`, plus `@electron/fuses`, `dmg-license`, `node-fetch` (built-in `fetch`) and `electron-squirrel-startup`; in `whisper_web`, `@headlessui/react`, `framer-motion`, `shadcn-ui`, `axios`, `react-hot-toast`. Keep root `cors` and `express`: the packaged bridge loads them at runtime.
- **Risks:** Electron 44+ drops macOS 11 and 12 (product decision, see [macOS minimum version](12-macos-minimum-version.md)); Tailwind 4 will change how the web pages look, and step-0 screenshots cover only Electron windows; Express must move in root and `whisper_web` together; root tests stay on Jest until `src/` is ESM.
- **Unresolved (check while doing the work):** glibc floor of the `better-sqlite3` Linux binaries; whether user ids can contain `.` or `[` (`electron-store` 12 throws); pino transports inside `app.asar` (use `pino-pretty` as a stream in dev).
