# AGENTS.md - WhisperV2 Project

## Header

Title: WhisperV2 - AI Assistant Project Agent Manifest
Version: v2.0.0
Author: Whisper Team <dev@whisper.com>
Maintainer: DevOps Team <devops@whisper.com>
Created: 2025-01-15
Last Updated: 2025-10-14

## Overview

WhisperV2 is a cross-platform AI assistant combining desktop (Electron) and web (Next.js) applications. The desktop app provides real-time audio transcription, AI-powered Q&A, and meeting summaries. The web app offers user management, activity tracking, and billing. This project integrates multiple AI providers (OpenAI, Gemini, Local LLMs) with SQLite databases and secure authentication.

## Configuration

Models: GPT-4, GPT-3.5-turbo, Gemini Flash 2.5, Local Ollama/Whisper
APIs: OpenAI API, Gemini API, Local LLM endpoints
ENV:

- NODE_ENV (development/production)
- OPENAI_API_KEY (optional)
- GEMINI_API_KEY (optional)
- WHISPER_WEB_URL (default: http://localhost:3000)
- DATABASE_PATH (SQLite file location)
  Dependencies:
- Node.js 20.x.x (required)
- Python 3.8+ (for local LLMs)
- SQLite 3.x
- Build Tools for Visual Studio (Windows only)
  Security:
- JWT authentication for web app
- Local database storage (SQLite)
- TLS 1.3 for production deployments
- OAuth 2.0 integration

## Capabilities

Tools:

- Build System: npm scripts with coordinated desktop/web builds
- Testing: Jest for unit tests, Playwright for E2E
- Linting: ESLint with custom rules
- Packaging: Electron Builder for desktop apps
- Deployment: Cross-platform builds (macOS, Windows, Linux)

Functions:

- On PR: Run full test suite across both apps
- On release: Build and package both desktop and web components
- On dependency update: Check compatibility across Node.js/Electron versions
- On API key rotation: Update secure storage and validate connections

Behavior:

- Desktop app must be built before web app
- Web app backend must be compiled before web build
- Database migrations run automatically on startup
- Cross-platform builds require platform-specific dependencies
- Local LLM support requires Python environment

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
- Build Output: public/build/, whisper_web/out/
- Database: User data directory (platform-specific)

Integration:

- GitHub Actions: .github/workflows/ (CI/CD pipelines)
- Electron Builder: electron-builder.yml (packaging config)
- Database: SQLite with migrations in src/features/common/services/
- Authentication: JWT tokens with refresh mechanism

Testing:

- Unit Tests: npm test (Jest across both apps)
- E2E Tests: npm run test:e2e (Playwright for web app)
- Integration Tests: Cross-app communication validation
- Performance Tests: Build time and memory usage monitoring

## Usage

### Development Setup

```bash
# Full project setup (recommended)
npm run setup

# Individual component development
npm run build:renderer    # Build desktop UI
npm run build:web         # Build web app
npm start                 # Start desktop app
cd whisper_web && npm run dev  # Start web app
```

### Build Commands

```bash
# Development builds
npm run build:all         # Build both desktop and web
npm run watch:renderer    # Watch desktop UI changes

# Production builds
npm run build             # Full production build
npm run package           # Create distributable packages
npm run make              # Create platform-specific installers
npm run publish           # Publish to distribution channels
```

### Cross-Platform Builds

```bash
# Windows (64-bit)
npm run build:win

# macOS (Intel/Apple Silicon)
npm run build

# Linux builds via CI/CD
# Configured in electron-builder.yml
```

### Environment Management

```bash
# Set API keys
export OPENAI_API_KEY=your_key_here
export GEMINI_API_KEY=your_key_here

# Configure web app URL
export WHISPER_WEB_URL=https://your-domain.com

# Database location
export DATABASE_PATH=./data/whisper.db
```

### Troubleshooting

Common Issues:

- Node version conflicts: Use nvm to manage Node.js 20.x.x
- Build failures: Ensure Build Tools for Visual Studio on Windows
- Python dependencies: Install Python 3.8+ for local LLMs
- Permission errors: Run as administrator/sudo for system audio access
- Database issues: Check SQLite file permissions and run migrations

Debug Commands:

```bash
# Check Node/Python versions
node --version && python --version

# Validate dependencies
npm ls --depth=0
cd whisper_web && npm ls --depth=0

# Test database connection
npm run db:init

# Check build outputs
ls -la public/build/
ls -la whisper_web/out/
```

## Maintenance

### Version Control

- Semantic versioning (MAJOR.MINOR.PATCH)
- Major version: Breaking API/desktop app changes
- Minor version: New features, web app updates
- Patch version: Bug fixes, security updates

### Update Procedures

Update Checklist:

- [ ] Test all npm scripts work correctly
- [ ] Verify cross-platform builds succeed
- [ ] Update dependency versions in both package.json files
- [ ] Test database migrations
- [ ] Validate API integrations
- [ ] Update documentation (README.md, docs/)
- [ ] Tag release with proper semantic version

### Monitoring

- Build Status: GitHub Actions CI/CD pipelines
- Test Coverage: Jest coverage reports
- Performance: Build time and package size monitoring
- Security: Dependency vulnerability scanning
- User Feedback: GitHub issues and Discord community

### Security Updates

- API Key Rotation: Monthly rotation schedule
- Dependency Updates: Weekly security scans
- Code Signing: Valid certificates for all platforms
- Database Encryption: User data protection
- Network Security: TLS 1.3 enforcement

## Update History

| Date       | Version | Author   | Description                                                 |
| ---------- | ------- | -------- | ----------------------------------------------------------- |
| 2025-10-14 | v2.0.0  | Dev Team | Major refactor: modularized codebase, improved build system |
| 2025-09-15 | v1.8.0  | Dev Team | Added Local LLM support, improved Windows compatibility     |
| 2025-08-01 | v1.7.0  | Dev Team | Gemini API integration, enhanced meeting summaries          |
| 2025-07-15 | v1.6.0  | Dev Team | Claude API support, web app authentication                  |
| 2025-07-01 | v1.5.0  | Dev Team | Cross-platform Windows support, shortcut editing            |
| 2025-06-15 | v1.4.0  | Dev Team | Liquid Glass UI foundation, improved AEC                    |
| 2025-05-01 | v1.3.0  | Dev Team | Full code refactoring, modular architecture                 |
| 2025-04-01 | v1.2.0  | Dev Team | Gemini integration, Intel Mac support                       |
| 2025-03-01 | v1.1.0  | Dev Team | Enhanced real-time meeting features                         |
| 2025-01-15 | v1.0.0  | Dev Team | Initial release with OpenAI integration                     |
