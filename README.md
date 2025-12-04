WhisperV2 – Electron + Next.js monorepo for the Whisper assistant.

## Prereqs

- Node 20.x (native deps fail on older/newer majors): `node --version`.

## Repo layout

- `src/` – Electron app (windows, services, IPC).
- `whisper_web/` – Next.js web UI + `backend_node/` Express bridge.
- `tests/` – Jest + Playwright for desktop; `whisper_web/e2e/` for web.
- `docs/` – Pipelines and architecture references.

## Install

```bash
npm install
cd whisper_web && npm install && cd ..
```

## Dev

- Desktop (bundles web): `npm run start` (builds renderer then launches Electron).
- Renderer only watch: `npm run watch:renderer` (launch Electron separately if needed).
- Web UI alone: `cd whisper_web && npm run dev` (uses backend_node or mocks).

## Build / package

- Renderer: `npm run build:renderer`
- Web bundle: `npm run build:web`
- Everything (renderer + web): `npm run build:all`
- Electron dist: `npm run build` (or `dist:mac | dist:win | dist:linux | dist:all`)
- Package only: `npm run package`; Publish via electron-builder: `npm run publish`

## Tests

- Desktop Jest: `npm test` (or `test:unit`, `test:integration`)
- Desktop Playwright: `npm run test:e2e` (headed/ui/debug variants available)
- Web lint/tests: `cd whisper_web && npm run lint && npm run test` (or `test:e2e`)

## Release automation (monorepo)

- Command: `npm run release` (optional `BUMP=major|minor|patch`, defaults to patch).
- Actions:
    - Require clean git tree.
    - Bump version in root + `whisper_web` package.json and both lockfiles.
    - Commit with `Release vX.Y.Z`, tag `vX.Y.Z`, push commit + tag to origin.

## Notes

- Env vars: see `src/features/common/config/config.js` and `whisper_web/next.config.mjs`.
- Keep `whisper_web/backend_node` rebuilt (`npm run build:backend`) before packaging.
