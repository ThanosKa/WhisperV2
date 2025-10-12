# Electron Renderer Migration Tasks

## Overview

- Goal: migrate renderer from Lit/JS to React/TS without breaking the existing pipeline.
- Strategy: stage-by-stage rollout keeping legacy `.js` assets disabled only after validation.
- Status: foundations + first Zustand bridge done; IPC typing and component swaps up next.

## Completed

- [x] Add TypeScript config, Vite renderer project, and Electron Forge adjustments while keeping current esbuild pipeline intact — `main.cjs`, `tsconfig.*`, Forge plugin scaffolded.
- [x] Install React, ReactDOM, Tailwind CSS, Shadcn UI tooling, Zustand, classnames, TypeScript, and supporting ESLint/Prettier plugins — dependencies added via `package.json`, installed successfully.
- [x] Configure shared `tsconfig.json`, path aliases, and ESLint/Prettier rules for mixed TS/JS codebase — `.eslintrc.cjs`, `prettier.config.cjs`, path aliases aligned.
- [x] Rename `src/main/index.js` and renderer bootstrap files to `.ts` variants, update imports, verify run, then archive originals as `.js.disabled` — `src/index.ts` active; legacy saved as `index.js.disabled`.
- [x] Create React renderer entry (`src/renderer/index.tsx`), integrate with Vite dev server, maintain Lit build until replacement ready — Vite entry + HTML scaffold in place without touching Lit windows.
- [x] Initialize `tailwind.config.ts`, `postcss.config.cjs`, and base CSS layers with Shadcn UI setup scripts — Tailwind tokens plus `button` primitive wired.
- [x] Add first Zustand store coexisting with current manual state, bridge data flow between new React components and legacy modules — `useUserStore`, `useBootstrapUser`, and `window.api` typings synchronize auth state.

## Active / Upcoming

- [ ] Define typed IPC contracts in TS modules and adapt both main/renderer sides, leaving JS originals disabled post-verification — next up: start from `windowBridge` channels.
- [ ] Incrementally rewrite Lit components into React counterparts, validating each and disabling the lit version — likely begin with header/ask flows once IPC types are stable.
- [ ] Document run/test checklist after each conversion and ensure both TypeScript and legacy bundles pass lint/build — capture dual-build QA steps after first component swap.
