# AGENTS.md - WhisperV2 Project

## Header

Title: WhisperV2 - AI Assistant Project Agent Manifest
Version: 0.2.5
Author: Whisper Team <dev@whisper.com>
Maintainer: DevOps Team <devops@whisper.com>
Created: 2025-01-15
Last Updated: 2025-Nov-11

## Overview

WhisperV2 is a cross-platform AI assistant combining desktop (Electron) and web (Next.js) applications. The desktop app provides real-time audio transcription, AI-powered Q&A, and meeting summaries. The web app offers user management, activity tracking, and billing. This project integrates multiple AI providers (OpenAI, Gemini, Local LLMs) with SQLite databases and secure authentication.

## Configuration

Models: GPT-4, GPT-3.5-turbo, Gemini Flash 2.5, Local Ollama/Whisper
APIs: OpenAI API, Gemini API, Local LLM endpoints
ENV:

- NODE_ENV (development/production)
- OPENAI_API_KEY (optional)
- GEMINI_API_KEY (optional)
- whisper_API_URL (default: http://localhost:9001)
- whisper_API_PORT (auto-allocated if not set)
- whisper_WEB_URL (default: http://localhost:3000)
- whisper_WEB_PORT (auto-allocated if not set)
- STT_RELAY_URL (default: wss://websocket-production-395f.up.railway.app)
- whisper_API_TIMEOUT (default: 10000)
- whisper_ENABLE_JWT (default: false)
- whisper_CACHE_TIMEOUT (default: 300000)
- whisper_LOG_LEVEL (default: info, options: debug/info/warn/error)
- whisper_DEBUG (default: false)
- DATABASE_PATH (SQLite file location, platform-specific)
  Dependencies:
- Node.js 20.x.x (required)
- Electron 30.5.1
- Next.js 14.2.30
- React 18.x
- TypeScript 5.x
- Better SQLite3 9.6.0
- Sharp 0.34.2
- WS 8.18.0
- Python 3.8+ (for local LLMs)
- SQLite 3.x
- Build Tools for Visual Studio (Windows only)
  Security:
- JWT authentication for web app
- Local database storage (SQLite)
- TLS 1.3 for production deployments
- OAuth 2.0 integration

## Code Style and Conventions

Language Standards:

- TypeScript: 5.x with strict mode
- JavaScript: ES6+ (ECMAScript 2018+)
- React: 18.x with functional components and hooks
- Node.js: 20.x.x
- Next.js: 14.2.30 (App Router architecture)

Formatting Rules (Prettier):

- Indentation: 4 spaces (tabWidth: 4)
- Quotes: Single quotes for strings
- Semicolons: Required
- Print Width: 150 characters per line
- Trailing Commas: ES5 style
- Arrow Parens: Avoid parentheses when possible
- End of Line: LF (Unix-style)

Linting Rules:

- Web App (whisper_web/): ESLint with Next.js core-web-vitals and TypeScript rules (.eslintrc.json)
- Functions (functions/): ESLint with Google style guide, double quotes, prefer arrow callbacks (.eslintrc.js)
- Root: ESLint checks .ts, .tsx, .js files
- Run linting: `npm run lint` (root), `cd whisper_web && npm run lint` (web app)

Naming Conventions:

- Components: PascalCase (e.g., `UserProfile.tsx`, `AuthGuard.tsx`)
- Files: camelCase for utilities, PascalCase for components
- Variables/Functions: camelCase
- Constants: UPPER_SNAKE_CASE
- TypeScript Interfaces/Types: PascalCase

UI and Styling:

- CSS Framework: Tailwind CSS for all styling
- Component Library: Shadcn UI (New York style)
- Animations: Framer Motion
- Icons: Lucide React
- Import Aliases: @/components, @/lib, @/utils, @/hooks

TypeScript Usage:

- Strict typing enabled
- Prefer type inference where possible
- Use interfaces for object shapes
- Avoid `any` type
- Run type checking: `npm run lint` (includes TypeScript validation)

Code Organization:

- Components: `components/` directory with `ui/` subdirectory for Shadcn components
- Utilities: `lib/` or `utils/` directories
- Hooks: `hooks/` directory
- API Routes: `app/api/` (Next.js App Router)
- Services: Feature-based organization in `src/features/`

Commit Messages:

- Format: `<type>(<scope>): <short summary>`
- Types: feat, fix, docs, style, refactor, test, chore
- Scope: Optional component/feature name
- Example: `feat(auth): add JWT token refresh`

Development Guidelines:

- Always run TypeScript type checking on changes
- Use Windows PowerShell commands (not Unix/Mac commands)
- Write complete implementations (no placeholder code)
- Keep responses concise and actionable
- Use TODO lists for complex multi-step tasks

## Capabilities

Tools:

- Build System: npm scripts with coordinated desktop/web builds, ESBuild for renderer bundling
- Testing: Jest 29.7.0 for unit/integration tests, Playwright 1.49.0 for E2E tests
- Linting: ESLint with Next.js rules (web app) and Google style guide (functions)
- Formatting: Prettier 3.6.2 with project-specific rules
- Packaging: Electron Builder 26.0.12 for desktop apps
- Deployment: Cross-platform builds (macOS universal, Windows x64, Linux)

Functions:

- On release: Build and package both desktop and web components
- On dependency update: Check compatibility across Node.js/Electron versions
- On API key rotation: Update secure storage and validate connections
- On build: Compile backend_node TypeScript before web build

Behavior:

- Desktop app renderer must be built before starting
- Web app backend (backend_node) must be compiled before web build (npm run build:backend)
- Web app build automatically compiles backend_node TypeScript
- Database migrations run automatically on startup
- Cross-platform builds require platform-specific dependencies
- Local LLM support requires Python environment
- Port allocation: API and web ports auto-allocated if not set via env vars

Limitations:

- Windows builds require Visual Studio Build Tools
- macOS builds require code signing certificates for distribution
- Local LLM features require Python and model downloads
- Real-time audio processing requires system audio permissions

Performance:

- Build time: < 5 minutes for full build
- Test suite: < 3 minutes execution time
- Package size: < 200MB for desktop app
- Memory usage: < 500MB during development

## Implementation

Paths:

- Root: /
- Desktop App: src/
- Web App: whisper_web/
- Backend Node: whisper_web/backend_node/ (TypeScript source and compiled dist/)
- Build Output: public/build/ (renderer), whisper_web/out/ (Next.js static)
- Test Directories: tests/unit/, tests/integration/, tests/e2e/, tests/setup/, tests/mocks/
- Database: User data directory (platform-specific)

Integration:

- Electron Builder: electron-builder.yml (packaging config)
- Database: SQLite with migrations in src/features/common/services/
- Authentication: JWT tokens with refresh mechanism
- Backend Node: TypeScript backend compiled to JavaScript (whisper_web/backend_node/)

### Build Configuration

Electron Builder (electron-builder.yml):

- appId: com.whisper.app
- productName: Whisper
- Publish: GitHub releases (provider: github, owner: ThanosKa, repo: whisper-desktop, releaseType: draft)
- Protocols: Deep linking support (whisper://)
- Files: src/**/\*, package.json, whisper_web/backend_node/dist/**/_, public/build/\*\*/_
- Extra Resources: whisper_web/out → resources/out
- ASAR Unpack: SystemAudioDump, sharp, @img modules
- Windows: NSIS installer, x64 arch, icon: src/ui/assets/wlogo.ico
- macOS: DMG/ZIP targets, universal arch, category: utilities, entitlements.plist

Jest Configuration (jest.config.js):

- Test Environment: Node.js
- Test Match: tests/unit/**/\*.test.js, tests/integration/**/\*.test.js
- Coverage: src/features/**/\*.js, src/bridge/**/\*.js (excludes repositories and UI)
- Setup: tests/setup/jest.setup.js
- Timeout: 10000ms

Playwright Configuration (playwright.config.js):

- Test Directory: tests/e2e/
- Timeout: 60000ms
- Workers: 1 (not fully parallel)
- Retries: 2 in CI, 0 locally
- Reporter: HTML and list
- Trace: on-first-retry
- Screenshot: only-on-failure
- Video: retain-on-failure

Testing:

- Unit Tests: npm test (Jest - tests/unit/\*_/_.test.js)
- Integration Tests: npm run test:integration (Jest - tests/integration/\*_/_.test.js)
- E2E Tests: npm run test:e2e (Playwright - tests/e2e/)
- Test Coverage: npm run test:coverage (Jest coverage reports)
- Test Setup: tests/setup/jest.setup.js, tests/setup/electronHelper.js
- Test Mocks: tests/mocks/ (database.mock.js, llmClient.mock.js)

## Usage

### Development Setup

```powershell
# Full project setup (recommended)
npm run setup

# Individual component development
npm run build:renderer    # Build desktop UI
npm run build:web         # Build web app (compiles backend_node TypeScript)
npm start                 # Start desktop app (builds renderer first)
cd whisper_web; npm run dev  # Start web app dev server
```

### Testing Commands

```powershell
# Run all tests
npm test                  # Jest unit and integration tests

# Jest test commands
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage reports
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only

# Playwright E2E tests
npm run test:e2e          # Run E2E tests
npm run test:e2e:headed   # Run with browser UI
npm run test:e2e:ui       # Playwright UI mode
npm run test:e2e:debug    # Debug mode (Windows: $env:PWDEBUG=1; npm run test:e2e)
```

### Build Commands

```powershell
# Development builds
npm run build:all         # Build both desktop and web
npm run build:renderer    # Build desktop UI only
npm run build:web         # Build web app (includes backend compilation)
npm run watch:renderer    # Watch desktop UI changes

# Production builds
npm run build             # Full production build with electron-builder
npm run build:win         # Windows 64-bit build
npm run package           # Create distributable packages (--dir)
npm run make              # Create platform-specific installers
npm run publish           # Publish to distribution channels (GitHub)
```

### Cross-Platform Builds

```powershell
# Windows (64-bit)
npm run build:win

# macOS (Intel/Apple Silicon - Universal)
npm run build
# Creates DMG and ZIP targets with universal architecture

# Build Configuration
# See electron-builder.yml for platform-specific settings:
# - Windows: NSIS installer, x64 arch
# - macOS: DMG/ZIP, universal arch, entitlements.plist
# - Publish: GitHub releases (draft)
```

### Environment Management

```powershell
# Set API keys (Windows PowerShell)
$env:OPENAI_API_KEY="your_key_here"
$env:GEMINI_API_KEY="your_key_here"

# Configure API and web URLs
$env:whisper_API_URL="http://localhost:9001"
$env:whisper_WEB_URL="http://localhost:3000"
$env:STT_RELAY_URL="wss://your-relay-url.com"

# Configure advanced settings
$env:whisper_API_TIMEOUT="10000"
$env:whisper_ENABLE_JWT="true"
$env:whisper_LOG_LEVEL="debug"
$env:whisper_DEBUG="true"

# Database location (optional, uses platform-specific default if not set)
$env:DATABASE_PATH=".\data\whisper.db"
```

### Troubleshooting

Common Issues:

- Node version conflicts: Use nvm to manage Node.js 20.x.x
- Build failures: Ensure Build Tools for Visual Studio on Windows
- Python dependencies: Install Python 3.8+ for local LLMs
- Permission errors: Run as administrator/sudo for system audio access
- Database issues: Check SQLite file permissions and run migrations

Debug Commands:

```powershell
# Check Node/Python versions (Windows PowerShell)
node --version; python --version

# Validate dependencies
npm ls --depth=0
cd whisper_web; npm ls --depth=0

# Check build outputs
Get-ChildItem public\build\
Get-ChildItem whisper_web\out\

# Check backend compilation
Get-ChildItem whisper_web\backend_node\dist\
```

## Maintenance

### Version Control

- Semantic versioning (MAJOR.MINOR.PATCH)
- Major version: Breaking API/desktop app changes
- Minor version: New features, web app updates
- Patch version: Bug fixes, security updates

### Update Procedures

Update Checklist:

- [ ] Test all npm scripts work correctly (root and whisper_web)
- [ ] Verify cross-platform builds succeed (Windows x64, macOS universal)
- [ ] Update dependency versions in both package.json files
- [ ] Compile backend_node TypeScript before web build
- [ ] Test database migrations
- [ ] Validate API integrations (OpenAI, Gemini, STT relay)
- [ ] Run test suite (unit, integration, E2E)
- [ ] Update documentation (README.md, AGENTS.md, docs/)
- [ ] Tag release with proper semantic version

### Monitoring

- Test Coverage: Jest coverage reports (npm run test:coverage)
- Performance: Build time and package size monitoring
- Security: Dependency vulnerability scanning
- User Feedback: GitHub issues and community

### Security Updates

- API Key Rotation: Monthly rotation schedule
- Dependency Updates: Weekly security scans
- Code Signing: Valid certificates for all platforms
- Database Encryption: User data protection
- Network Security: TLS 1.3 enforcement

## Update History

| Date       | Version | Author   | Description                                                                                        |
| ---------- | ------- | -------- | -------------------------------------------------------------------------------------------------- |
| 2025-01-27 | 0.2.5   | Dev Team | Updated AGENTS.md documentation: sync versions, env vars, build configs, Windows PowerShell syntax |
| 2025-10-14 | v2.0.0  | Dev Team | Major refactor: modularized codebase, improved build system                                        |
| 2025-09-15 | v1.8.0  | Dev Team | Added Local LLM support, improved Windows compatibility                                            |
| 2025-08-01 | v1.7.0  | Dev Team | Gemini API integration, enhanced meeting summaries                                                 |
| 2025-07-15 | v1.6.0  | Dev Team | Claude API support, web app authentication                                                         |
| 2025-07-01 | v1.5.0  | Dev Team | Cross-platform Windows support, shortcut editing                                                   |
| 2025-06-15 | v1.4.0  | Dev Team | Liquid Glass UI foundation, improved AEC                                                           |
| 2025-05-01 | v1.3.0  | Dev Team | Full code refactoring, modular architecture                                                        |
| 2025-04-01 | v1.2.0  | Dev Team | Gemini integration, Intel Mac support                                                              |
| 2025-03-01 | v1.1.0  | Dev Team | Enhanced real-time meeting features                                                                |
| 2025-01-15 | v1.0.0  | Dev Team | Initial release with OpenAI integration                                                            |
