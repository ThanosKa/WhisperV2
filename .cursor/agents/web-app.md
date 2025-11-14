# WhisperV2 Web App Agent (Next.js)

## Use this file when
- You are inside `whisper_web/` editing the Next.js UI, Tailwind styling, or App Router routes.
- You are updating the backend proxy that lives in `whisper_web/backend_node/`.
- You need to know which command to run for linting, type checking, or Playwright tests that target the web UI.

## Directory quick map
| Path | Notes |
| --- | --- |
| `whisper_web/app/` | App Router routes + layouts. Server components live alongside client components. |
| `whisper_web/components/` | Shared UI primitives, includes `ui/` shadcn exports. |
| `whisper_web/hooks/`, `whisper_web/utils/`, `whisper_web/lib/` | Client helpers (API, storage, formatting). |
| `whisper_web/backend_node/` | Express bridge written in TypeScript (see `.cursor/agents/backend-api.md`). |
| `whisper_web/next.config.mjs` | Static export settings + env passthrough. |
| `whisper_web/tailwind.config.ts` | Design system tokens; update when adding shadcn primitives. |

## Commands
| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js dev server with hot reload (must run inside `whisper_web`). |
| `npm run build` | Compiles backend_node (`npm run build:backend`) then builds Next.js for production/out. |
| `npm run build:backend` | Type-checks/compiles `backend_node`. Run this when backend TypeScript changes. |
| `npm run lint` | ESLint + TypeScript rules (core-web-vitals). |
| `npm run test:e2e` | Playwright tests targeting the web UI (configure baseURL first). |

## Environment switches
- `NEXT_PUBLIC_DEV_MOCK=1` – forces API helpers in `utils/devMock.ts` to stub responses (no backend_node required).
- `whisper_WEB_URL` – consumed by backend_node for CORS; defaults to `http://localhost:3000`.
- `NODE_ENV` – Next.js dev/prod toggles, also forwarded to backend_node compile step.
- Use desktop env vars (API keys, relay URL) only if you embed the web UI back into the Electron bundle; otherwise, you typically set just the values above.

## Typical workflows
1. **Pure UI or layout change** → Edit files under `app/` or `components/`, run `npm run dev`, and rely on Tailwind classes. Add snapshots or Playwright assertions when the change affects flows.
2. **API/IPC-backed views** → Update the client helper in `utils/api.ts` or `hooks/useSessions.ts`, ensure backend_node exposes/updates the matching route, then keep `npm run dev` + backend_node running (or use `NEXT_PUBLIC_DEV_MOCK=1`).
3. **Adding a shadcn component** → Generate via shadcn CLI (if configured), register styles in `tailwind.config.ts`, and document the path inside this agent for future references.

## Tests and validation
- `npm run lint` must pass before committing web changes.
- Web Playwright specs live under `whisper_web/e2e/`; scope them with `npm run test:e2e -- --grep <name>` when iterating.
- Backend bridge compilation is covered by `npm run build:backend`; fix TypeScript errors there before running the main build.
- When implementing tests, follow `.cursor/tests/webapp-react-testing.md` (unit/component) or `.cursor/tests/webapp-playwright.md` (E2E).

## Troubleshooting
- Build complains about missing backend files → Make sure `npm run build:backend` completed and `dist/` exists.
- Dev mock mode stuck? Clear `NEXT_PUBLIC_DEV_MOCK` (PowerShell: `Remove-Item Env:NEXT_PUBLIC_DEV_MOCK`) or restart `npm run dev`.
- Static export failures usually stem from server-only modules imported inside client components—check warnings emitted by Next.js build output.
- When API requests fail in dev, verify whether the desktop app is running (so IPC responses exist) or temporarily enable mock mode.
