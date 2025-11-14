# WhisperV2 Backend API Agent (`whisper_web/backend_node`)

## Use this file when
- You are editing the Express IPC bridge that lets the Next.js app talk to the Electron desktop session.
- You need to know which route/middleware file to touch when the web UI requires new data.
- You want to confirm the minimum commands/env settings before compiling or testing the backend bridge.

## Files of interest
| Area | Files |
| --- | --- |
| Entry point | `whisper_web/backend_node/index.ts` boots Express, wires CORS + routes. |
| IPC plumbing | `whisper_web/backend_node/ipcBridge.ts` forwards calls into the running desktop app via EventEmitter. |
| Middleware | `whisper_web/backend_node/middleware/auth.ts` adds `req.uid` from the `X-User-ID` header. |
| Routes | `whisper_web/backend_node/routes/{user,conversations,presets,auth}.ts`. |
| Types | `whisper_web/backend_node/types/express-augment.ts` extends Express Request typings. |

## Commands
- `cd whisper_web && npm run build:backend` → TypeScript compile (emits `backend_node/dist/**`). Must succeed before `npm run build` or `npm run dev` in the web app.
- `cd whisper_web && npm run dev` → Runs Next.js dev server and (re)builds backend_node on change; this is the easiest way to test API routes live.
- To run only the backend bridge, execute `npx ts-node backend_node/index.ts` from `whisper_web/` (rarely needed, but helpful for IPC debugging).

## Environment variables
- `NODE_ENV` – toggles dev/prod logging and Express behavior.
- `whisper_WEB_URL` – CORS allowlist (defaults to `http://localhost:3000`). Update when serving the web UI from another origin.
- The bridge itself does **not** handle API keys; those reside inside the desktop app. When you add config, funnel it through `config.js` on the Electron side and send via IPC instead of storing secrets here.

## Typical workflows
1. **Add an endpoint**  
   - Create/expand a route file under `routes/`.  
   - Use `ipcRequest('channel', payload)` from `ipcBridge.ts` to talk to the desktop service (e.g., `listenService`).  
   - Update `types/express-augment.ts` if the request body/params need typing.  
   - Re-run `npm run build:backend` and hit the route from the web app (or curl with `X-User-ID` header).
2. **Adjust auth or identification**  
   - Touch `middleware/auth.ts`. Remember that the desktop app falls back to `default_user`; coordinate with `authService.js` when altering assumptions.
3. **Debug IPC failures**  
   - Start the desktop app (`npm run start` at repo root) so the EventEmitter is registered.  
   - Use the console logging around `ipcBridge.ts` to confirm the message leaves the backend.  
   - If you need isolation, temporarily run `npx ts-node backend_node/index.ts` with `DEBUG_IPC=1` style logs in the desktop app.

## Tests & verification
- There is no dedicated Jest suite for backend_node today; compilation (`npm run build:backend`) is the guardrail. If you add logic, prefer lightweight unit tests colocated with the new module and wire them into `whisper_web/package.json`.
- Web-facing changes still need `npm run lint` + Playwright tests from the web app.

## Gotchas
- Forgetting to rebuild backend_node means the desktop bundle uses stale JS under `public/build`. Always run `npm run build:backend` before packaging or when TypeScript sources change.
- IPC calls return promises; always `await` them in route handlers to avoid sending responses before the desktop replies.
- `whisper_WEB_URL` must include the protocol—CORS will silently block requests otherwise.
