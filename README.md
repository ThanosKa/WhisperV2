Cluely Alternative 

Whisper – Electron + Next.js monorepo for the Whisper assistant.

This is the client a.k.a Desktop app. In order for this to work you need to connect it a server for the LLM and a microservice for the STT 

## Documentation

| Document | Description |
|----------|-------------|
| [SETUP.md](./SETUP.md) | Complete setup guide for developers |
| [DATABASE.md](./DATABASE.md) | SQLite schema and data management |
| [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md) | STT relay and external service configuration |
| [AGENTS.md](./AGENTS.md) | AI agent documentation for codebase navigation |
| [docs/](./docs/) | Architecture deep-dives (auth, LLM, STT pipelines) |

## Prereqs

- Download & install Python and Node. On Windows also install Build Tools for Visual Studio.
- Use Node 20.x.x to avoid native build errors:

```
node --version
# If you need Node 20 via nvm:
# curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
# nvm install 20
# nvm use 20
```

## Repo layout

- `src/` – Electron app (windows, services, IPC).
- `whisper_web/` – Next.js web UI + `backend_node/` Express bridge.
- `tests/` – Jest + Playwright for desktop; `whisper_web/e2e/` for web.
- `docs/` – Pipelines and architecture references.

## Install

```bash
npm run setup
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

## Environment Setup

1. Copy `.env.example` to `.env`
2. Configure required variables (see [SETUP.md](./SETUP.md#environment-variables))
3. For macOS distribution, set Apple signing credentials

```bash
cp .env.example .env
# Edit .env with your values
```


## Notes

- Env vars: see `.env.example` for all options, `src/features/common/config/config.js` for defaults.
- Keep `whisper_web/backend_node` rebuilt (`npm run build:backend`) before packaging.
