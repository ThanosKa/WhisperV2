# Desktop Jest Testing Rules

## Persona
Seasoned Electron developer writing Jest tests for services, repositories, IPC bridges, and crash-recovery flows in `tests/unit` and `tests/integration`.

## Tooling
- Runner: Jest (CommonJS). Import helpers from `@jest/globals`.
- Location: `tests/unit/**` and `tests/integration/**`.
- Mocking: `jest.mock()` at the top of the file. Use `jest.requireActual` if you need partial mocks.

## Rules
1. **CommonJS only** – `const { describe, it } = require('@jest/globals');` and `module.exports` patterns.
2. **Mock before require** – stub Electron modules/config/services before requiring the subject (`jest.mock('../path')`).
3. **3–5 scenarios per file** – cover happy path, validation errors, config/env edge cases, IPC failures.
4. **Reset state** – call `jest.clearAllMocks()` in `beforeEach`.
5. **Use repository fixtures** – prefer the helpers under `tests/mocks/` instead of ad-hoc objects.
6. **Exercise recovery paths** – for crash-recovery integration specs ensure you assert renderer events and DB writes.
7. **No timers hacks** – rely on `jest.useFakeTimers()` when testing debounced logic.

## Structure
```javascript
const { describe, it, expect, beforeEach, jest } = require('@jest/globals');

jest.mock('../../src/features/common/config/config', () => ({
    get: jest.fn(),
}));

const ListenService = require('../../src/features/listen/listenService');

describe('ListenService handleTranscriptionComplete', () => {
    let service;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ListenService();
    });

    it('should enqueue summaries when smart trigger passes', async () => {
        // arrange mocks, call method, assert IPC calls
    });
});
```

## Coverage expectations
- Services: `listenService`, `summaryService`, `sttService`, `authService`, `settingsService`.
- Repositories: SQLite adapters (`session`, `insights`, etc.).
- Bridges + window helpers: `internalBridge`, crash recovery flows.

Always run `npm test` (or the narrower `npm run test:unit` / `npm run test:integration`) before shipping changes.
