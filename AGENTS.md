# AGENTS.md - WhisperV2 Project

## Header

Title: WhisperV2 - AI Assistant Project Agent Manifest
Version: 0.2.5
Author: Whisper Team <dev@whisper.com>
Maintainer: DevOps Team <devops@whisper.com>
Created: 2025-01-15
Last Updated: 2025-Nov-11

## Context Discovery - READ THIS FIRST

**IMPORTANT: Always check `.cursor/agents/` folder first when needing project context.**

**If the question is NOT related to the WhisperV2 project, skip reading context files and answer directly.**

This file is a meta-guide. Detailed documentation lives in `.cursor/agents/` folder. When you need context about the project:

1. **Start with**: Read `.cursor/agents/project-overview.md` to understand overall project structure
2. **Then selectively read** relevant agent files based on the task:
    - `project-overview.md` - Overall project structure, architecture, and configuration
    - `desktop-app.md` - Desktop Electron app details, services, IPC, window management
    - `web-app.md` - Next.js web application details, components, routing, authentication
    - `backend-api.md` - Backend API and services, endpoints, database operations

### When to Read Which File

- **Desktop app changes** → Read `desktop-app.md`
- **Web app changes** → Read `web-app.md`
- **Backend/API changes** → Read `backend-api.md`
- **General questions** → Start with `project-overview.md`
- **Build/test/deployment** → Check relevant component file (desktop-app.md or web-app.md)

**Principle**: Only inject the specific context needed. Read the relevant agent file(s) for detailed information rather than loading everything.
