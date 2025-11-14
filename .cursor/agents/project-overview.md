# WhisperV2 Project Overview Agent

This is the single entry point before you dive into a component‑specific agent. It keeps only the facts needed to orient yourself and decide which deeper guide to load.

## Use this file when
- You need a fast refresher on the repository layout or runtime expectations.
- You want the minimum environment variables/tests that every surface shares.
- You are deciding whether the next step lives in the desktop app, the web app, or the backend bridge.

## Repo map
| Path | Why it matters |
| --- | --- |
| `package.json` | Electron desktop root scripts (build/package/test). |
| `src/` | Electron sources: windows, services, IPC bridges, preload. |
| `tests/` | Jest + Playwright coverage for desktop (`tests/unit`, `tests/integration`, `tests/e2e`). |
| `docs/` | Long-form references (`docs/stt-pipeline.md`, etc.). |
| `whisper_web/` | Next.js companion app (App Router + Tailwind). |
| `whisper_web/backend_node/` | Express IPC proxy compiled from TypeScript. |
| `.cursor/agents/` | Canonical agent manifests (this file + component playbooks). |

## Setup checklist
1. `npm install` (root Electron dependencies).
2. `cd whisper_web && npm install` (Next.js + backend_node deps), then `cd ..`.
3. Copy `.env.example` to `.env` when you need API keys. Only set the values you actually use.
4. For the first run, build everything once: `npm run build:all`.
5. Start the desktop app with `npm run start`. The web app is bundled into the desktop build; use `cd whisper_web && npm run dev` only when iterating purely on the web UI.

## Shared environment variables
- `NODE_ENV` – determines dev/prod behavior for both Electron and Next.js builds.
- `OPENAI_API_KEY`, `GEMINI_API_KEY` – optional AI providers used by desktop services.
- `whisper_API_URL` / `whisper_WEB_URL` – override the local API/Web defaults when pointing to remote stacks.
- `STT_RELAY_URL` – speech relay endpoint for `src/features/listen/stt/sttService.js`.
- `DATABASE_PATH` – opt-in override for the local SQLite store under `src/features/common/repositories/session`.
- Desktop/web agents add more surface-specific env hints; only set those when you read the relevant file.

## Build + test matrix
| Command | Runs from | Purpose |
| --- | --- | --- |
| `npm run start` | repo root | Builds renderer, launches Electron with the latest `whisper_web` bundle. |
| `npm run build` | repo root | Full production build via `electron-builder`. |
| `npm test` | repo root | Jest suite (`tests/unit`, `tests/integration`). |
| `npm run test:e2e` | repo root | Playwright coverage against desktop UI. |
| `cd whisper_web && npm run dev` | `whisper_web` | Standalone Next.js dev server (hits backend_node or mocks). |
| `cd whisper_web && npm run build` | `whisper_web` | Static Next.js export after compiling backend_node TypeScript. |

## Component agents (read next)
- `.cursor/agents/desktop-app.md` – Windows/macOS Electron runtime, services, IPC, renderer bundles.
- `.cursor/agents/web-app.md` – Next.js UI, Tailwind design system, Playwright flows.
- `.cursor/agents/backend-api.md` – `whisper_web/backend_node` Express bridge that proxies desktop state to the web.

## Extended docs
- `docs/stt-pipeline.md` – in-depth STT relay flow; consult when debugging streaming audio.
- `build-web.md` – extra instructions for web exports or CI packaging.
- `template.md` – example AGENTS template should you add future surfaces.
