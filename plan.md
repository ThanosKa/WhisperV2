# WhisperV2 Electron App Testing Implementation Plan

## Context & Architecture

**Project Type:** Electron 30.x desktop app with Next.js web companion

**Main Process:** `src/index.js` (Node.js environment)

**Key Services:** `src/features/` (ask, listen, settings, shortcuts)

**Database:** SQLite via better-sqlite3

**Current State:** No test infrastructure exists, only `tests/` directory with empty subdirectories

## Phase 1: Jest Unit Testing Setup (Core Services)

### 1.1 Install Jest Dependencies

Add to root `package.json` devDependencies:

```json
"jest": "^29.7.0",
"@types/jest": "^29.5.11",
"jest-environment-node": "^29.7.0",
"@jest/globals": "^29.7.0"
```

Run: `npm install` (from project root `/Users/thaka/Desktop/Cursor/WhisperV2/`)

### 1.2 Create Jest Configuration

**File:** `/Users/thaka/Desktop/Cursor/WhisperV2/jest.config.js`

```javascript
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/unit/**/*.test.js', '**/tests/integration/**/*.test.js'],
    collectCoverageFrom: [
        'src/features/**/*.js',
        'src/bridge/**/*.js',
        '!src/features/**/repositories/*.js', // Skip DB repositories (integration tests)
        '!src/ui/**/*.js', // Skip renderer code
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.js'],
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
    testTimeout: 10000,
};
```

### 1.3 Create Test Setup File

**File:** `/Users/thaka/Desktop/Cursor/WhisperV2/tests/setup/jest.setup.js`

```javascript
// Mock Electron modules (not available in Node test environment)
jest.mock('electron', () => ({
    app: {
        getPath: jest.fn(name => `/mock/app/path/${name}`),
        isPackaged: false,
        getName: jest.fn(() => 'Whisper'),
    },
    BrowserWindow: jest.fn(),
    ipcMain: {
        on: jest.fn(),
        handle: jest.fn(),
        removeHandler: jest.fn(),
    },
    screen: {
        getAllDisplays: jest.fn(() => []),
        getDisplayNearestPoint: jest.fn(),
    },
    desktopCapturer: {
        getSources: jest.fn(() => Promise.resolve([])),
    },
    globalShortcut: {
        register: jest.fn(),
        unregisterAll: jest.fn(),
    },
}));

// Mock electron-store (config persistence)
jest.mock('electron-store', () => {
    return jest.fn().mockImplementation(() => ({
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
        clear: jest.fn(),
    }));
});

// Suppress console logs during tests (optional)
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};
```

### 1.4 Create Test Helpers/Mocks

**File:** `/Users/thaka/Desktop/Cursor/WhisperV2/tests/mocks/llmClient.mock.js`

```javascript
/**
 * Mock LLM client for testing AI services without external API calls
 */
module.exports = {
    stream: jest.fn(async (payload, options) => {
        const mockResponse = 'This is a mock LLM response for testing.';
        return {
            headers: new Map([
                ['x-ratelimit-limit', '100'],
                ['x-ratelimit-used', '10'],
                ['x-ratelimit-remaining', '90'],
            ]),
            body: {
                getReader: () => ({
                    read: jest
                        .fn()
                        .mockResolvedValueOnce({
                            done: false,
                            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Mock"}}]}\n'),
                        })
                        .mockResolvedValueOnce({
                            done: false,
                            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":" response"}}]}\n'),
                        })
                        .mockResolvedValueOnce({ done: true }),
                    cancel: jest.fn(),
                }),
            },
        };
    }),
    chat: jest.fn(async payload => ({
        content: 'Mock chat completion response',
        model: 'mock-model',
    })),
};
```

**File:** `/Users/thaka/Desktop/Cursor/WhisperV2/tests/mocks/database.mock.js`

```javascript
/**
 * Mock database repositories for unit testing services
 */
const createMockRepository = () => ({
    create: jest.fn(async () => 1), // Mock session ID
    getById: jest.fn(async id => ({ id, uid: 'test-user', title: 'Test Session' })),
    getAllByUserId: jest.fn(async () => []),
    update: jest.fn(async () => ({ success: true })),
    delete: jest.fn(async () => ({ success: true })),
    deleteWithRelatedData: jest.fn(async () => ({ success: true })),
    getOrCreateActive: jest.fn(async () => 1),
    end: jest.fn(async () => ({ success: true })),
    endAllActiveSessions: jest.fn(async () => ({ success: true })),
    updateTitle: jest.fn(async () => ({ success: true })),
    touch: jest.fn(async () => ({ success: true })),
});

module.exports = {
    sessionRepository: createMockRepository(),
    sttRepository: {
        addTranscript: jest.fn(async () => ({ success: true })),
        getAllTranscriptsBySessionId: jest.fn(async () => [{ id: 1, speaker: 'User', text: 'Test transcript', timestamp: Date.now() }]),
    },
    askRepository: {
        addAiMessage: jest.fn(async () => ({ success: true })),
        getAllAiMessagesBySessionId: jest.fn(async () => []),
    },
    userRepository: createMockRepository(),
    presetRepository: {
        getPresets: jest.fn(async () => []),
        update: jest.fn(async () => ({ success: true })),
    },
};
```

### 1.5 Create Unit Tests for Ask Service

**File:** `/Users/thaka/Desktop/Cursor/WhisperV2/tests/unit/services/askService.test.js`

```javascript
const { describe, test, expect, jest, beforeEach, afterEach } = require('@jest/globals');

// Mock dependencies BEFORE requiring the service
jest.mock('../../../src/features/common/ai/llmClient', () => require('../../mocks/llmClient.mock'));
jest.mock('../../../src/features/common/repositories/session', () => require('../../mocks/database.mock').sessionRepository);
jest.mock('../../../src/features/ask/repositories', () => require('../../mocks/database.mock').askRepository);

// Mock window manager
jest.mock('../../../src/window/windowManager', () => ({
    windowPool: new Map([
        [
            'ask',
            {
                isDestroyed: () => false,
                isVisible: () => true,
                webContents: { send: jest.fn() },
            },
        ],
    ]),
}));

describe('AskService', () => {
    let askService;

    beforeEach(() => {
        jest.clearAllMocks();
        // Require service AFTER mocks are set up
        askService = require('../../../src/features/ask/askService');
    });

    describe('Intent Detection', () => {
        test('should detect "next" intent from pill click', () => {
            const result = askService._detectIntentFromClickPill('✨ What should I say next?');
            expect(result).toBe('next');
        });

        test('should detect "email" intent from pill click', () => {
            const result = askService._detectIntentFromClickPill('✉️ Draft a follow-up email');
            expect(result).toBe('email');
        });

        test('should detect "summary" intent from pill click', () => {
            const result = askService._detectIntentFromClickPill('📝 Show summary');
            expect(result).toBe('summary');
        });

        test('should return null for unknown pill text', () => {
            const result = askService._detectIntentFromClickPill('Random text');
            expect(result).toBe(null);
        });
    });

    describe('Profile Resolution', () => {
        test('should resolve meeting profile for next intent', () => {
            const result = askService._resolveProfileForIntent('next', 'meeting');
            expect(result.profileToUse).toBe('meeting_next');
            expect(result.useConversationContext).toBe(true);
        });

        test('should resolve sales profile for objection intent', () => {
            const result = askService._resolveProfileForIntent('objection', 'sales');
            expect(result.profileToUse).toBe('sales_objection');
            expect(result.useConversationContext).toBe(true);
        });

        test('should disable context for define intent', () => {
            const result = askService._resolveProfileForIntent('define', 'meeting');
            expect(result.useConversationContext).toBe(false);
        });
    });

    describe('Title Derivation', () => {
        test('should derive clean title from prompt', () => {
            const result = askService._deriveTitleFromPrompt('✨ what is the main topic of this meeting?');
            expect(result).toBe('What is the main topic of this meeting?');
        });

        test('should handle empty prompt gracefully', () => {
            const result = askService._deriveTitleFromPrompt('');
            expect(result).toBe('');
        });

        test('should limit title to 12 words', () => {
            const longPrompt = 'word '.repeat(20);
            const result = askService._deriveTitleFromPrompt(longPrompt);
            const wordCount = result.split(/\s+/).length;
            expect(wordCount).toBeLessThanOrEqual(12);
        });
    });

    describe('Stream Interruption', () => {
        test('should abort stream when interrupted', () => {
            askService.abortController = new AbortController();
            const abortSpy = jest.spyOn(askService.abortController, 'abort');

            askService.interruptStream();

            expect(abortSpy).toHaveBeenCalledWith('User interrupted');
            expect(askService.state.isStreaming).toBe(false);
            expect(askService.state.interrupted).toBe(true);
        });
    });
});
```

### 1.6 Create Unit Tests for Listen Service

**File:** `/Users/thaka/Desktop/Cursor/WhisperV2/tests/unit/services/listenService.test.js`

```javascript
const { describe, test, expect, jest, beforeEach } = require('@jest/globals');

// Mock all dependencies
jest.mock('../../../src/features/listen/stt/sttService', () => {
    return jest.fn().mockImplementation(() => ({
        setCallbacks: jest.fn(),
        initializeSttSessions: jest.fn(async () => true),
        closeSessions: jest.fn(async () => true),
        isSessionActive: jest.fn(() => false),
        sendMicAudioContent: jest.fn(async () => ({ success: true })),
        startMacOSAudioCapture: jest.fn(async () => ({ success: true })),
        stopMacOSAudioCapture: jest.fn(),
        isMacOSAudioRunning: jest.fn(() => false),
    }));
});

jest.mock('../../../src/features/listen/summary/summaryService', () => ({
    setCallbacks: jest.fn(),
    addConversationTurn: jest.fn(),
    resetConversationHistory: jest.fn(),
    setSessionId: jest.fn(),
    getConversationHistory: jest.fn(() => ['Speaker: test message']),
    getCurrentAnalysisData: jest.fn(() => ({})),
    selectedPresetId: 'meetings',
}));

jest.mock('../../../src/features/common/repositories/session', () => require('../../mocks/database.mock').sessionRepository);
jest.mock('../../../src/features/listen/stt/repositories', () => require('../../mocks/database.mock').sttRepository);

describe('ListenService', () => {
    let listenService;

    beforeEach(() => {
        jest.clearAllMocks();
        const ListenService = require('../../../src/features/listen/listenService');
        listenService = ListenService;
    });

    describe('Session Initialization', () => {
        test('should initialize new session successfully', async () => {
            const result = await listenService.initializeNewSession();
            expect(result).toBe(true);
            expect(listenService.currentSessionId).toBe(1);
        });

        test('should set session ID for summary service', async () => {
            const summaryService = require('../../../src/features/listen/summary/summaryService');
            await listenService.initializeNewSession();
            expect(summaryService.setSessionId).toHaveBeenCalledWith(1);
        });

        test('should reset conversation history on new session', async () => {
            const summaryService = require('../../../src/features/listen/summary/summaryService');
            await listenService.initializeNewSession();
            expect(summaryService.resetConversationHistory).toHaveBeenCalled();
        });
    });

    describe('Transcription Handling', () => {
        test('should skip very short transcriptions', async () => {
            const sttRepository = require('../../../src/features/listen/stt/repositories');
            await listenService.handleTranscriptionComplete('User', 'hi');
            expect(sttRepository.addTranscript).not.toHaveBeenCalled();
        });

        test('should save meaningful transcriptions', async () => {
            listenService.currentSessionId = 1;
            const sttRepository = require('../../../src/features/listen/stt/repositories');

            await listenService.handleTranscriptionComplete('User', 'This is a meaningful message');

            expect(sttRepository.addTranscript).toHaveBeenCalledWith({
                sessionId: 1,
                speaker: 'User',
                text: 'This is a meaningful message',
            });
        });
    });

    describe('Session State Management', () => {
        test('should check if session is active', () => {
            const result = listenService.isSessionActive();
            expect(result).toBe(false);
        });

        test('should close session and end in database', async () => {
            listenService.currentSessionId = 5;
            const sessionRepository = require('../../../src/features/common/repositories/session');

            await listenService.closeSession();

            expect(sessionRepository.end).toHaveBeenCalledWith(5);
            expect(listenService.currentSessionId).toBe(null);
        });
    });
});
```

### 1.7 Create Unit Tests for Settings Service

**File:** `/Users/thaka/Desktop/Cursor/WhisperV2/tests/unit/services/settingsService.test.js`

```javascript
const { describe, test, expect, jest, beforeEach } = require('@jest/globals');

// Mock electron-store
const mockStore = {
    get: jest.fn(),
    set: jest.fn(),
};
jest.mock('electron-store', () => jest.fn(() => mockStore));

jest.mock('../../../src/features/common/services/authService', () => ({
    getCurrentUserId: jest.fn(() => 'test-user-id'),
}));

describe('SettingsService', () => {
    let settingsService;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        settingsService = require('../../../src/features/settings/settingsService');
    });

    describe('Get Settings', () => {
        test('should return default settings for new user', async () => {
            mockStore.get.mockReturnValue({});

            const settings = await settingsService.getSettings();

            expect(settings.profile).toBe('school');
            expect(settings.language).toBe('en');
            expect(settings.analysisPresetId).toBe('meetings');
        });

        test('should merge saved settings with defaults', async () => {
            mockStore.get.mockReturnValue({ profile: 'sales', customField: 'value' });

            const settings = await settingsService.getSettings();

            expect(settings.profile).toBe('sales');
            expect(settings.customField).toBe('value');
            expect(settings.language).toBe('en'); // default still present
        });
    });

    describe('Save Settings', () => {
        test('should save settings to store', async () => {
            mockStore.get.mockReturnValue({ profile: 'school' });

            await settingsService.saveSettings({ fontSize: 16 });

            expect(mockStore.set).toHaveBeenCalledWith('users.test-user-id', expect.objectContaining({ fontSize: 16 }));
        });

        test('should return success result', async () => {
            mockStore.get.mockReturnValue({});

            const result = await settingsService.saveSettings({ fontSize: 16 });

            expect(result.success).toBe(true);
        });
    });

    describe('Window Notification Manager', () => {
        test('should initialize without errors', () => {
            expect(() => settingsService.initialize()).not.toThrow();
        });

        test('should cleanup pending notifications', () => {
            expect(() => settingsService.cleanup()).not.toThrow();
        });
    });
});
```

### 1.8 Create Unit Tests for Authentication Service

**File:** `/Users/thaka/Desktop/Cursor/WhisperV2/tests/unit/services/authService.test.js`

```javascript
const { describe, test, expect, jest, beforeEach } = require('@jest/globals');

jest.mock('../../../src/features/common/repositories/user', () => require('../../mocks/database.mock').userRepository);
jest.mock('../../../src/features/common/repositories/session', () => require('../../mocks/database.mock').sessionRepository);

describe('AuthService', () => {
    let authService;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        // Mock fetch for session validation
        global.fetch = jest.fn();
        authService = require('../../../src/features/common/services/authService');
    });

    describe('User ID Management', () => {
        test('should return current user ID', () => {
            authService.currentUser = { uid: 'test-123' };
            expect(authService.getCurrentUserId()).toBe('test-123');
        });

        test('should return null when no user logged in', () => {
            authService.currentUser = null;
            expect(authService.getCurrentUserId()).toBe(null);
        });
    });

    describe('Session Validation', () => {
        test('should validate session UUID successfully', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ uid: 'user-456', email: 'test@example.com' }),
            });

            const result = await authService.validateSessionUuid('valid-uuid');

            expect(result).toEqual({
                valid: true,
                uid: 'user-456',
                email: 'test@example.com',
            });
        });

        test('should reject invalid session UUID', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
            });

            const result = await authService.validateSessionUuid('invalid-uuid');

            expect(result.valid).toBe(false);
        });
    });
});
```

### 1.9 Update package.json Scripts

Add to root `package.json`:

```json
"scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration"
}
```

---

## Phase 2: Playwright E2E Testing Setup

### 2.1 Install Playwright for Electron

In project root, run:

```bash
npm install --save-dev playwright @playwright/test
npx playwright install
```

### 2.2 Create Playwright Configuration

**File:** `/Users/thaka/Desktop/Cursor/WhisperV2/playwright.config.js`

```javascript
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 60000, // Electron startup can be slow
    fullyParallel: false, // Run tests serially for Electron
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1, // Only one worker for Electron tests
    reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],
    use: {
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
});
```

### 2.3 Create Electron Test Helper

**File:** `/Users/thaka/Desktop/Cursor/WhisperV2/tests/setup/electronHelper.js`

```javascript
const { _electron: electron } = require('playwright');
const path = require('path');

/**
 * Launch Electron app for E2E testing
 * @returns {Promise<{electronApp, window}>}
 */
async function launchElectronApp() {
    const electronApp = await electron.launch({
        args: [path.join(__dirname, '../../src/index.js')],
        env: {
            ...process.env,
            NODE_ENV: 'test',
            WHISPER_TEST_MODE: 'true',
        },
    });

    // Wait for first window to open
    const window = await electronApp.firstWindow();

    // Wait for app to be ready
    await window.waitForLoadState('domcontentloaded');

    return { electronApp, window };
}

/**
 * Close Electron app gracefully
 */
async function closeElectronApp(electronApp) {
    await electronApp.close();
}

module.exports = {
    launchElectronApp,
    closeElectronApp,
};
```

### 2.4 Create E2E Test for Listen Flow

**File:** `/Users/thaka/Desktop/Cursor/WhisperV2/tests/e2e/listenFlow.spec.js`

```javascript
const { test, expect } = require('@playwright/test');
const { launchElectronApp, closeElectronApp } = require('../setup/electronHelper');

test.describe('Listen Service E2E', () => {
    let electronApp, window;

    test.beforeEach(async () => {
        ({ electronApp, window } = await launchElectronApp());
    });

    test.afterEach(async () => {
        await closeElectronApp(electronApp);
    });

    test('should initialize listen session', async () => {
        // Click Listen button in header
        await window.click('[data-testid="listen-button"]');

        // Wait for listen window to appear
        await window.waitForSelector('[data-testid="listen-window"]', { timeout: 10000 });

        // Verify session state
        const statusText = await window.textContent('[data-testid="listen-status"]');
        expect(statusText).toContain('Connected');
    });

    test('should pause and resume session', async () => {
        // Start listening
        await window.click('[data-testid="listen-button"]');
        await window.waitForSelector('[data-testid="listen-window"]');

        // Pause session
        await window.click('[data-testid="pause-button"]');
        const pausedStatus = await window.textContent('[data-testid="listen-status"]');
        expect(pausedStatus).toContain('Paused');

        // Resume session
        await window.click('[data-testid="resume-button"]');
        const resumedStatus = await window.textContent('[data-testid="listen-status"]');
        expect(resumedStatus).toContain('Resumed');
    });

    test('should close session and save to database', async () => {
        // Start and immediately stop listening
        await window.click('[data-testid="listen-button"]');
        await window.waitForSelector('[data-testid="listen-window"]');

        await window.click('[data-testid="done-button"]');

        // Verify session closed
        const isClosed = await window.isHidden('[data-testid="listen-window"]');
        expect(isClosed).toBe(true);
    });
});
```

### 2.5 Create E2E Test for Ask Flow

**File:** `/Users/thaka/Desktop/Cursor/WhisperV2/tests/e2e/askFlow.spec.js`

```javascript
const { test, expect } = require('@playwright/test');
const { launchElectronApp, closeElectronApp } = require('../setup/electronHelper');

test.describe('Ask Service E2E', () => {
    let electronApp, window;

    test.beforeEach(async () => {
        ({ electronApp, window } = await launchElectronApp());
    });

    test.afterEach(async () => {
        await closeElectronApp(electronApp);
    });

    test('should open ask window on keyboard shortcut', async () => {
        // Trigger ask window with Cmd+Enter
        await window.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');

        // Verify ask window appeared
        await window.waitForSelector('[data-testid="ask-window"]', { timeout: 5000 });
        const isVisible = await window.isVisible('[data-testid="ask-input"]');
        expect(isVisible).toBe(true);
    });

    test('should send question and receive response', async () => {
        // Open ask window
        await window.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
        await window.waitForSelector('[data-testid="ask-window"]');

        // Type question
        await window.fill('[data-testid="ask-input"]', 'What is the weather today?');
        await window.click('[data-testid="ask-submit"]');

        // Wait for response (mock LLM should respond)
        await window.waitForSelector('[data-testid="ask-response"]', { timeout: 15000 });

        const responseText = await window.textContent('[data-testid="ask-response"]');
        expect(responseText.length).toBeGreaterThan(0);
    });

    test('should handle interruption', async () => {
        // Open ask window and send question
        await window.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
        await window.waitForSelector('[data-testid="ask-window"]');
        await window.fill('[data-testid="ask-input"]', 'Long question');
        await window.click('[data-testid="ask-submit"]');

        // Interrupt immediately
        await window.click('[data-testid="interrupt-button"]');

        // Verify interrupted state
        const statusText = await window.textContent('[data-testid="ask-status"]');
        expect(statusText).toContain('Interrupted');
    });
});
```

### 2.6 Create E2E Test for Authentication

**File:** `/Users/thaka/Desktop/Cursor/WhisperV2/tests/e2e/authentication.spec.js`

```javascript
const { test, expect } = require('@playwright/test');
const { launchElectronApp, closeElectronApp } = require('../setup/electronHelper');

test.describe('Authentication E2E', () => {
    let electronApp, window;

    test.beforeEach(async () => {
        ({ electronApp, window } = await launchElectronApp());
    });

    test.afterEach(async () => {
        await closeElectronApp(electronApp);
    });

    test('should handle deep link authentication', async () => {
        // Simulate deep link protocol URL
        const deepLinkUrl = 'whisper://auth-success?sessionUuid=test-uuid-123&uid=user-456&email=test@example.com';

        // Trigger deep link handler via IPC
        await electronApp.evaluate(({ BrowserWindow }, url) => {
            const mainWindow = BrowserWindow.getAllWindows()[0];
            mainWindow.webContents.send('protocol-url', url);
        }, deepLinkUrl);

        // Wait for auth state to update
        await window.waitForTimeout(2000);

        // Verify user is logged in
        const userIndicator = await window.isVisible('[data-testid="user-avatar"]');
        expect(userIndicator).toBe(true);
    });

    test('should show login UI when not authenticated', async () => {
        // Check for login prompt
        const loginButton = await window.isVisible('[data-testid="login-button"]');
        expect(loginButton).toBe(true);
    });
});
```

### 2.7 Create E2E Test for Settings

**File:** `/Users/thaka/Desktop/Cursor/WhisperV2/tests/e2e/settings.spec.js`

```javascript
const { test, expect } = require('@playwright/test');
const { launchElectronApp, closeElectronApp } = require('../setup/electronHelper');

test.describe('Settings E2E', () => {
    let electronApp, window;

    test.beforeEach(async () => {
        ({ electronApp, window } = await launchElectronApp());
    });

    test.afterEach(async () => {
        await closeElectronApp(electronApp);
    });

    test('should open settings window', async () => {
        // Click settings button
        await window.click('[data-testid="settings-button"]');

        // Verify settings window appeared
        await window.waitForSelector('[data-testid="settings-window"]');
        const isVisible = await window.isVisible('[data-testid="settings-form"]');
        expect(isVisible).toBe(true);
    });

    test('should update analysis preset', async () => {
        await window.click('[data-testid="settings-button"]');
        await window.waitForSelector('[data-testid="settings-window"]');

        // Change preset dropdown
        await window.selectOption('[data-testid="preset-select"]', 'sales');
        await window.click('[data-testid="save-settings"]');

        // Verify saved (check for success message)
        await window.waitForSelector('[data-testid="settings-saved"]');
    });

    test('should persist settings across sessions', async () => {
        // Change setting
        await window.click('[data-testid="settings-button"]');
        await window.waitForSelector('[data-testid="settings-window"]');
        await window.selectOption('[data-testid="language-select"]', 'es');
        await window.click('[data-testid="save-settings"]');

        // Restart app
        await closeElectronApp(electronApp);
        ({ electronApp, window } = await launchElectronApp());

        // Verify setting persisted
        await window.click('[data-testid="settings-button"]');
        const selectedValue = await window.inputValue('[data-testid="language-select"]');
        expect(selectedValue).toBe('es');
    });
});
```

### 2.8 Create E2E Test for Keyboard Shortcuts

**File:** `/Users/thaka/Desktop/Cursor/WhisperV2/tests/e2e/shortcuts.spec.js`

```javascript
const { test, expect } = require('@playwright/test');
const { launchElectronApp, closeElectronApp } = require('../setup/electronHelper');

test.describe('Keyboard Shortcuts E2E', () => {
    let electronApp, window;

    test.beforeEach(async () => {
        ({ electronApp, window } = await launchElectronApp());
    });

    test.afterEach(async () => {
        await closeElectronApp(electronApp);
    });

    test('should toggle visibility with Cmd+\\', async () => {
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

        // Toggle hide
        await window.keyboard.press(`${modifier}+\\`);
        await window.waitForTimeout(500);

        // Toggle show
        await window.keyboard.press(`${modifier}+\\`);
        await window.waitForTimeout(500);

        // Verify window is visible
        const isVisible = await window.isVisible('[data-testid="header"]');
        expect(isVisible).toBe(true);
    });

    test('should trigger ask with Cmd+Enter', async () => {
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

        await window.keyboard.press(`${modifier}+Enter`);

        // Verify ask window opened
        await window.waitForSelector('[data-testid="ask-window"]', { timeout: 5000 });
    });
});
```

### 2.9 Update package.json Scripts for E2E

Add to root `package.json`:

```json
"scripts": {
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "PWDEBUG=1 playwright test"
}
```

---

---

## Testing Execution Order

1. **Run unit tests first** (fast feedback):

    ```bash
    npm run test:unit
    ```

2. **Run E2E tests** (slower but comprehensive):

    ```bash
    npm run test:e2e
    ```

3. **Check coverage**:

    ```bash
    npm run test:coverage
    ```

4. **View E2E results**:
    ```bash
    npx playwright show-report
    ```

---

## Key Files Summary

### New Files Created:

- `/jest.config.js` - Jest configuration
- `/playwright.config.js` - Playwright configuration
- `/tests/setup/jest.setup.js` - Jest test environment setup
- `/tests/setup/electronHelper.js` - Electron E2E helper
- `/tests/mocks/llmClient.mock.js` - Mock LLM API
- `/tests/mocks/database.mock.js` - Mock database repositories
- `/tests/unit/services/askService.test.js` - Ask service tests (8 tests)
- `/tests/unit/services/listenService.test.js` - Listen service tests (7 tests)
- `/tests/unit/services/settingsService.test.js` - Settings service tests (6 tests)
- `/tests/unit/services/authService.test.js` - Auth service tests (4 tests)
- `/tests/e2e/listenFlow.spec.js` - Listen E2E (3 tests)
- `/tests/e2e/askFlow.spec.js` - Ask E2E (3 tests)
- `/tests/e2e/authentication.spec.js` - Auth E2E (2 tests)
- `/tests/e2e/settings.spec.js` - Settings E2E (3 tests)
- `/tests/e2e/shortcuts.spec.js` - Shortcuts E2E (2 tests)

### Modified Files:

- `/package.json` - Add test scripts and dependencies

**Total Test Count: 38 tests (25 unit + 13 E2E)**
