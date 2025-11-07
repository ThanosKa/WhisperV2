# AGENTS.md - Desktop App (Electron)

## Header

Title: WhisperV2 Desktop App Agent Manifest
Version: 0.2.5
Author: Desktop Team <desktop@whisper.com>
Maintainer: Electron Team <electron@whisper.com>
Created: 2025-01-15
Last Updated: 2025-01-27

## Overview

Desktop Electron application providing real-time AI assistance through audio transcription, contextual Q&A, and meeting intelligence. Features modular architecture with services for listening, asking, settings management, and shortcut handling. Integrates with web app backend for user synchronization and cloud features.

## Configuration

Models: GPT-4, GPT-3.5-turbo, Gemini Flash 2.5, Local Whisper/Ollama
APIs: OpenAI API, Gemini API, Local LLM endpoints, Whisper Web API
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
- AUDIO_DEVICE_ID (optional microphone selection)
  Dependencies:
- Node.js 20.x.x (required)
- Electron 30.5.1
- Better SQLite3 9.6.0
- Sharp 0.34.2 (image processing)
- WS 8.18.0 (WebSocket communication)
- ESBuild 0.25.5 (renderer bundling)
- Jest 29.7.0 (testing)
- Playwright 1.49.0 (E2E testing)
- Electron Builder 26.0.12 (packaging)
- Python 3.8+ (for local LLMs, optional)
- SQLite 3.x
- Build Tools for Visual Studio (Windows only)
  Security:
- Local database storage (SQLite)
- Secure IPC communication
- Audio permission management
- Session-based authentication via web app backend

## Code Style and Conventions

Language Standards:

- JavaScript: ES6+ (ECMAScript 2018+)
- Node.js: 20.x.x
- Electron: 30.5.1

Formatting Rules (Prettier):

- Indentation: 4 spaces (tabWidth: 4)
- Quotes: Single quotes for strings
- Semicolons: Required
- Print Width: 150 characters per line
- Trailing Commas: ES5 style
- Arrow Parens: Avoid parentheses when possible
- End of Line: LF (Unix-style)

Linting Rules:

- Root: ESLint checks .ts, .tsx, .js files
- Run linting: `npm run lint` (root)

Naming Conventions:

- Components: PascalCase (e.g., `ListenView.js`, `AskView.js`)
- Files: camelCase for utilities, PascalCase for components
- Variables/Functions: camelCase
- Constants: UPPER_SNAKE_CASE

Code Organization:

- UI Components: `src/ui/` directory
- Services: Feature-based organization in `src/features/`
- Bridges: `src/bridge/` for IPC communication
- Window Management: `src/window/` for window lifecycle
- Build Output: `public/build/` for renderer bundles

Commit Messages:

- Format: `<type>(<scope>): <short summary>`
- Types: feat, fix, docs, style, refactor, test, chore
- Scope: Optional component/feature name
- Example: `feat(listen): add real-time transcription`

Development Guidelines:

- Use Windows PowerShell commands (not Unix/Mac commands)
- Write complete implementations (no placeholder code)
- Keep responses concise and actionable
- Use TODO lists for complex multi-step tasks

## Capabilities

Tools:

- Build System: ESBuild 0.25.5 for renderer bundling
- Testing: Jest 29.7.0 for unit/integration tests, Playwright 1.49.0 for E2E tests
- Linting: ESLint for code quality
- Debugging: Electron DevTools, Chrome Inspector
- Profiling: Electron performance monitoring
- Packaging: Electron Builder 26.0.12 for distribution

Functions:

- On startup: Initialize database, validate API keys, check permissions
- On listen start: Initialize STT service, audio capture, session tracking
- On ask trigger: Capture screen/audio context, process with AI, return response
- On settings change: Update configuration, restart services if needed
- On shortcut press: Execute corresponding action with context
- On window focus: Update UI state, refresh data from backend

Behavior:

- Invisible operation mode (no dock/taskbar presence)
- Real-time audio processing with echo cancellation
- Contextual AI responses based on screen and audio history
- Automatic session management and data persistence
- Cross-window communication via IPC bridges
- Graceful error handling with user notifications

Limitations:

- Audio processing requires microphone permissions
- Screen capture needs system permissions
- Local LLM requires Python environment and model downloads
- Windows builds need Visual Studio Build Tools
- macOS distribution requires code signing

Performance:

- Startup time: < 3 seconds
- Memory usage: < 300MB during normal operation
- Audio latency: < 500ms for transcription
- AI response time: < 2 seconds for typical queries
- Database operations: < 100ms for common queries

## Implementation

Paths:

- Source Root: src/
- Main Process: src/index.js
- UI Components: src/ui/
- Services: src/features/
- Bridges: src/bridge/
- Window Management: src/window/
- Build Output: public/build/
- Test Directories: tests/unit/, tests/integration/, tests/e2e/, tests/setup/, tests/mocks/
- Database: User data directory (platform-specific)

Integration:

- Web App Backend: IPC communication via EventEmitter (eventBridge)
- Database: SQLite with repository pattern (src/features/common/repositories/)
- AI Clients: Server-side LLM client (src/features/common/ai/llmClient.js)
- Window System: Multi-window management (src/window/windowManager.js)
- IPC Bridges: Internal, window, and feature bridges for secure communication

### Build Configuration

ESBuild (build.js):

- Bundle: true
- Platform: browser
- Format: ESM
- Entry Points: src/ui/app/HeaderController.js, src/ui/app/WhisperApp.js
- Output: public/build/header.js, public/build/content.js
- External: electron
- Sourcemaps: enabled

Electron Builder (electron-builder.yml):

- appId: com.whisper.app
- productName: Whisper
- Files: src/**/\*, whisper_web/backend_node/dist/**/_, public/build/\*\*/_
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
npm start                 # Start desktop app (builds renderer first)
npm run watch:renderer    # Watch mode for UI changes
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
npm run build:renderer    # Build desktop UI only
npm run watch:renderer    # Watch desktop UI changes
npm start                 # Full development build

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

- Audio not working: Check microphone permissions and device selection
- AI responses failing: Validate API keys and network connectivity
- Window not showing: Check window manager initialization and IPC bridges
- Database errors: Verify SQLite file permissions and run migrations
- High memory usage: Monitor for memory leaks in long-running sessions

Performance Issues:

- Slow startup: Check database size and migration status
- Audio lag: Validate audio device settings and system resources
- UI freezing: Check for blocking operations in main process
- High CPU usage: Monitor AI processing and background tasks

Build Issues:

- Windows build fails: Install Visual Studio Build Tools
- macOS codesign fails: Configure code signing certificates
- Dependencies missing: Run `npm install` and check node-gyp
- Bundle size large: Optimize imports and tree-shaking

Debug Commands:

```powershell
# Check Node version (Windows PowerShell)
node --version

# Validate dependencies
npm ls --depth=0

# Check build outputs
Get-ChildItem public\build\

# Enable debug logging
$env:whisper_DEBUG="true"
$env:whisper_LOG_LEVEL="debug"
```

## Service Architecture

### Listen Service (Real-time Audio Processing)

Responsibilities:

- Audio capture and preprocessing
- STT (Speech-to-Text) conversion
- Session management and transcription storage
- Real-time status updates to UI

Key Components:

```javascript
// STT Service integration
this.sttService = new SttService();
this.sttService.setCallbacks({
    onTranscriptionComplete: (speaker, text) => this.handleTranscriptionComplete(speaker, text),
    onStatusUpdate: status => this.sendToRenderer('update-status', status),
});

// Summary Service integration
this.summaryService.setCallbacks({
    onAnalysisComplete: data => this.handleAnalysis(data),
    onStatusUpdate: status => this.sendToRenderer('update-status', status),
});
```

### Ask Service (AI-Powered Q&A)

Responsibilities:

- Screen capture and OCR processing
- Audio context retrieval and analysis
- AI query processing via server-side LLM client
- Response formatting and delivery

Key Components:

```javascript
// LLM Client integration (server-side)
const llmClient = require('../common/ai/llmClient');
const response = await llmClient.stream(payload, { signal });

// Screen capture
const screenshot = await captureScreenshot();
```

### Settings Service (Configuration Management)

Responsibilities:

- Provider API key management (server-side)
- Model selection and preferences
- UI customization settings
- Shortcut configuration

Key Components:

```javascript
// Settings persistence
const settingsRepo = require('./repositories');
await settingsRepo.saveSettings(updatedSettings);
```

## Window Management

### Window Types

- **header**: Primary UI with header controls and navigation
- **listen**: Audio transcription interface and controls
- **ask**: AI query input and response display
- **settings**: Configuration and preferences management
- **plan**: Planning and organization interface

### IPC Communication

```javascript
// Renderer to Main
const { ipcRenderer } = require('electron');
ipcRenderer.send('start-listening');

// Main to Renderer
const { windowPool } = require('../../window/windowManager');
const listenWindow = windowPool.get('listen');
listenWindow.webContents.send('transcription-update', data);
```

## Testing Strategy

### Unit Testing

```javascript
// Example: Testing service methods
describe('ListenService', () => {
    test('should initialize STT service', async () => {
        const service = new ListenService();
        await service.initialize();
        expect(service.sttService).toBeDefined();
    });
});
```

### Integration Testing

```javascript
// Example: Testing IPC communication
describe('IPC Bridges', () => {
    test('should handle status updates', async () => {
        const bridge = new InternalBridge();
        const mockCallback = jest.fn();
        bridge.on('status-update', mockCallback);

        await bridge.sendStatus('ready');
        expect(mockCallback).toHaveBeenCalledWith('ready');
    });
});
```

### E2E Testing

```javascript
// Example: Testing window interactions
test('should open listen window', async ({ page }) => {
    await page.click('[data-testid="listen-button"]');
    await expect(page.locator('[data-testid="listen-window"]')).toBeVisible();
});
```

## Build and Packaging

### Development Builds

```powershell
# Quick rebuild for development
npm run build:renderer

# Full development build
npm run start
```

### Production Builds

```powershell
# Package for current platform
npm run package

# Create distributable installer
npm run make

# Cross-platform build (requires platform-specific setup)
npm run build:win  # Windows
npm run build      # macOS/Linux
```

### Build Configuration

```yaml
# electron-builder.yml key settings
appId: com.whisper.app
productName: Whisper
files:
    - src/**/*
    - whisper_web/backend_node/dist/**/*
    - public/build/**/*
mac:
    category: public.app-category.utilities
    target: [dmg, zip]
    arch: universal
win:
    target: nsis
    arch: x64
```

## Maintenance

### Version Control

- Follow semantic versioning aligned with root project (currently 0.2.5)
- Tag desktop-specific releases when UI or Electron changes occur
- Maintain separate changelog for desktop-specific features

### Update Procedures

Desktop Update Checklist:

- [ ] Test all window types open/close correctly (header, listen, ask, settings, plan)
- [ ] Verify IPC communication works across all services
- [ ] Test audio capture and processing on target platforms
- [ ] Validate AI provider integrations via server-side LLM client
- [ ] Check database migrations work correctly
- [ ] Test keyboard shortcuts functionality
- [ ] Verify secure key storage operations (server-side)
- [ ] Test cross-platform builds succeed
- [ ] Validate memory usage and performance metrics

### Monitoring

- Electron crash reporting and error tracking
- Memory usage monitoring during long sessions
- Audio processing performance metrics
- IPC communication latency tracking
- Database query performance monitoring

### Security Updates

- API key rotation (server-side management)
- Electron security updates and vulnerability patches
- Dependency security scanning
- Code signing certificate renewal
- Database encryption key management

## Update History

| Date       | Version | Author       | Description                                                           |
| ---------- | ------- | ------------ | --------------------------------------------------------------------- |
| 2025-01-27 | 0.2.5   | Desktop Team | Updated AGENTS.md: sync versions, fix window names, PowerShell syntax |
| 2025-10-14 | v2.0.0  | Desktop Team | Major refactor: modular services, improved IPC                        |
| 2025-09-15 | v1.8.0  | Desktop Team | Local LLM integration, enhanced audio processing                      |
| 2025-08-01 | v1.7.0  | Desktop Team | Gemini API support, improved error handling                           |
| 2025-07-15 | v1.6.0  | Desktop Team | Windows support, shortcut customization                               |
| 2025-07-01 | v1.5.0  | Desktop Team | Liquid Glass UI, improved AEC                                         |
| 2025-06-15 | v1.4.0  | Desktop Team | Claude integration, enhanced meeting features                         |
| 2025-05-01 | v1.3.0  | Desktop Team | Full service modularization                                           |
| 2025-04-01 | v1.2.0  | Desktop Team | Cross-platform improvements                                           |
| 2025-03-01 | v1.1.0  | Desktop Team | Enhanced AI context processing                                        |
| 2025-01-15 | v1.0.0  | Desktop Team | Initial desktop app release                                           |

