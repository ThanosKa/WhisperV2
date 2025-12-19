# AGENTS.md - WhisperV2 Project

Monorepo project
-src folder contains the desktop app in electron.
-whisper_web contains the local webapp dashboard. Its not the server!!

This projects connets to 2 servers that are seperated from this codebase. You do not have access to them

1. The STT microservice with soniox proiver deployed on railway
2. The landing page which is the main server deployed on vercel

## Context Discovery - READ THIS FIRST

**Always load the canonical files stored in `.cursor/agents/`.**  
Everything else is just a pointer.  
Behavioral rules live in `.cursor/rules/behavior.mdc` — read that first to understand how to respond.

### Default TODO list before touching code

1. Open `.cursor/agents/project-overview.md` to confirm repo layout, shared env, and scripts.
2. Decide which surface you are editing, then read the matching playbook:
    - `.cursor/agents/desktop-app.md`
    - `.cursor/agents/web-app.md`
    - `.cursor/agents/backend-api.md`
    - When editing `whisper_web/`, also open `whisper_web/.cursor/rules/typescript.mdc` for the TypeScript-specific coding rules.
3. Follow the commands/tests called out inside that playbook.
4. Need to add or modify tests? Open the matching guide in `.cursor/tests/` (desktop: `desktop-jest.md`, `desktop-playwright.md`; web app: `webapp-react-testing.md`, `webapp-playwright.md`) before writing specs.

### Routing guide

- **General orientation / env / installation** → `project-overview.md`
- **Electron desktop (services, windows, IPC)** → `desktop-app.md`
- **Next.js companion web app** → `web-app.md`
- **Express IPC bridge supporting the web app** → `backend-api.md`

Skip all of these if the user request is not related to WhisperV2.
