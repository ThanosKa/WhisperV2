# Target versions for the upgrade

Status: open
Type: research
Blocked by: 04

## Question

For step 1 of [TypeScript migration approach](04-typescript-approach.md) (upgrade everything to latest stable on today's JS code): what is the target version of each dependency, and what breaks on the way? Cover the Node LTS to pin; Electron (from `^30.5`); `better-sqlite3` (from `^9.6`, and whether it builds on that Node and Electron); Next (from `^14.2`), React (from 18) and Tailwind (from 3) in `whisper_web`; Playwright, `electron-builder`, `express`, `sharp`; and the tools picked in ticket 04 (electron-vite, Vitest, ESLint 9 + `typescript-eslint`, zod 4, pino). For each: target version, breaking changes that touch this repo, and required code changes. Also: moving from npm to **pnpm** with `electron-builder` (`node-linker=hoisted` or other settings), the stale lockfile, and the 11 root dependencies that are never imported (delete them). Sources: official release notes and migration guides.
