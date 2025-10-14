# AGENTS.md - Desktop App (Electron)

## Header

Title: WhisperV2 Desktop App Agent Manifest
Version: v2.0.0
Author: Desktop Team <desktop@whisper.com>
Maintainer: Electron Team <electron@whisper.com>
Created: 2025-01-15
Last Updated: 2025-10-14

## Overview

Desktop Electron application providing real-time AI assistance through audio transcription, contextual Q&A, and meeting intelligence. Features modular architecture with services for listening, asking, settings management, and shortcut handling. Integrates with web app backend for user synchronization and cloud features.

## Configuration

Models: GPT-4, GPT-3.5-turbo, Gemini Flash 2.5, Local Whisper/Ollama
APIs: OpenAI API, Gemini API, Local LLM endpoints, Whisper Web API
ENV:

- NODE_ENV (development/production)
- OPENAI_API_KEY (optional)
- GEMINI_API_KEY (optional)
- WHISPER_WEB_URL (for backend sync)
- DATABASE_PATH (SQLite location)
- AUDIO_DEVICE_ID (optional microphone selection)
  Dependencies:
- Electron 30.x.x
- Better SQLite3 9.x.x
- Keytar 7.x.x (secure credential storage)
- Sharp 0.34.x (image processing)
- WS 8.x.x (WebSocket communication)
  Security:
- Secure key storage via OS keychain
- Encrypted database storage
- Secure IPC communication
- Audio permission management

## Capabilities

Tools:

- Build System: ESBuild for renderer bundling
- Testing: Jest for service unit tests
- Linting: ESLint for code quality
- Debugging: Electron DevTools, Chrome Inspector
- Profiling: Electron performance monitoring
- Packaging: Electron Builder for distribution

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

Integration:

- Web App Backend: IPC communication via WebSocket/EventEmitter
- Database: SQLite with repository pattern (src/features/common/repositories/)
- AI Clients: Modular LLM client (src/features/common/ai/llmClient.js)
- Window System: Multi-window management (src/window/windowManager.js)
- IPC Bridges: Internal and window bridges for secure communication

Testing:

- Unit Tests: Service layer testing with mocked dependencies
- Integration Tests: IPC communication and window management
- Audio Tests: Microphone access and transcription accuracy
- AI Tests: LLM client responses and error handling
- Performance Tests: Memory usage and response times

## Usage

### Development Workflow

```bash
# Start development mode
npm start

# Build renderer only
npm run build:renderer

# Watch mode for UI changes
npm run watch:renderer
```

### Service Development

```javascript
// Example: Testing Listen Service
const listenService = require('./features/listen/listenService');
// Initialize and test STT functionality
await listenService.initializeSTT();

// Example: Testing Ask Service
const askService = require('./features/ask/askService');
// Test AI query with context
const response = await askService.processQuery('What was discussed in the meeting?');
```

### Window Management

```javascript
// Access window pool
const { windowPool } = require('./window/windowManager');
const mainWindow = windowPool.get('main');

// IPC communication
const internalBridge = require('./bridge/internalBridge');
internalBridge.send('update-status', { status: 'ready' });
```

### Database Operations

```javascript
// Repository pattern usage
const sessionRepo = require('./features/common/repositories/session');
const sessions = await sessionRepo.getRecentSessions();

// Migration management
const migrationService = require('./features/common/services/migrationService');
await migrationService.runMigrations();
```

### Debugging Commands

```bash
# Enable debug logging
export DEBUG=whisper:*

# Test audio devices
const { getAudioDevices } = require('./features/listen/stt/audioCore');
const devices = await getAudioDevices();

# Validate API keys
const authService = require('./features/common/services/authService');
const isValid = await authService.validateAPIKeys();
```

### Troubleshooting

Common Desktop Issues:

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
    onTranscriptionComplete: (speaker, text) => this.handleTranscription(speaker, text),
});

// Summary Service integration
this.summaryService.setCallbacks({
    onAnalysisComplete: data => this.handleAnalysis(data),
});
```

### Ask Service (AI-Powered Q&A)

Responsibilities:

- Screen capture and OCR processing
- Audio context retrieval and analysis
- AI query processing with multiple providers
- Response formatting and delivery

Key Components:

```javascript
// LLM Client integration
const llmClient = require('../common/ai/llmClient');
const response = await llmClient.query({
    provider: 'openai',
    model: 'gpt-4',
    prompt: builtPrompt,
    context: { screenshots, audioHistory },
});
```

### Settings Service (Configuration Management)

Responsibilities:

- Provider API key management
- Model selection and preferences
- UI customization settings
- Shortcut configuration

Key Components:

```javascript
// Secure key storage
const keytar = require('keytar');
await keytar.setPassword('whisper', 'openai_key', apiKey);

// Settings persistence
const settingsRepo = require('./repositories');
await settingsRepo.saveSettings(updatedSettings);
```

## Window Management

### Window Types

- **Main Window**: Primary UI with header controls and navigation
- **Listen Window**: Audio transcription interface and controls
- **Ask Window**: AI query input and response display
- **Settings Window**: Configuration and preferences management

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

### Audio Testing

```javascript
// Example: Testing audio capture
describe('Audio Core', () => {
    test('should list available devices', async () => {
        const devices = await getAudioDevices();
        expect(Array.isArray(devices)).toBe(true);
        expect(devices.length).toBeGreaterThan(0);
    });
});
```

## Build and Packaging

### Development Builds

```bash
# Quick rebuild for development
npm run build:renderer

# Full development build
npm run start
```

### Production Builds

```bash
# Package for current platform
npm run package

# Create distributable installer
npm run make

# Cross-platform build (requires platform-specific setup)
npm run build:win  # Windows
npm run build      # macOS/Linux
```

### Build Configuration

```javascript
// electron-builder.yml key settings
appId: com.whisper.desktop
productName: Whisper
directories:
  output: dist/
files:
  - src/
  - public/
  - node_modules/
mac:
  category: public.app-category.productivity
  target: dmg
win:
  target: nsis
```

## Maintenance

### Version Control

- Follow semantic versioning aligned with root project
- Tag desktop-specific releases when UI or Electron changes occur
- Maintain separate changelog for desktop-specific features

### Update Procedures

Desktop Update Checklist:

- [ ] Test all window types open/close correctly
- [ ] Verify IPC communication works across all services
- [ ] Test audio capture and processing on target platforms
- [ ] Validate AI provider integrations
- [ ] Check database migrations work correctly
- [ ] Test keyboard shortcuts functionality
- [ ] Verify secure key storage operations
- [ ] Test cross-platform builds succeed
- [ ] Validate memory usage and performance metrics

### Monitoring

- Electron crash reporting and error tracking
- Memory usage monitoring during long sessions
- Audio processing performance metrics
- IPC communication latency tracking
- Database query performance monitoring

### Security Updates

- API key rotation in secure storage
- Electron security updates and vulnerability patches
- Dependency security scanning
- Code signing certificate renewal
- Database encryption key management

## Update History

| Date       | Version | Author       | Description                                      |
| ---------- | ------- | ------------ | ------------------------------------------------ |
| 2025-10-14 | v2.0.0  | Desktop Team | Major refactor: modular services, improved IPC   |
| 2025-09-15 | v1.8.0  | Desktop Team | Local LLM integration, enhanced audio processing |
| 2025-08-01 | v1.7.0  | Desktop Team | Gemini API support, improved error handling      |
| 2025-07-15 | v1.6.0  | Desktop Team | Windows support, shortcut customization          |
| 2025-07-01 | v1.5.0  | Desktop Team | Liquid Glass UI, improved AEC                    |
| 2025-06-15 | v1.4.0  | Desktop Team | Claude integration, enhanced meeting features    |
| 2025-05-01 | v1.3.0  | Desktop Team | Full service modularization                      |
| 2025-04-01 | v1.2.0  | Desktop Team | Cross-platform improvements                      |
| 2025-03-01 | v1.1.0  | Desktop Team | Enhanced AI context processing                   |
| 2025-01-15 | v1.0.0  | Desktop Team | Initial desktop app release                      |
