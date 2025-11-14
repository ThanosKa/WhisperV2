import '@testing-library/jest-dom';

// Suppress React act() warnings from Radix UI components
const originalError = console.error;
beforeAll(() => {
    console.error = (...args: any[]) => {
        if (
            typeof args[0] === 'string' &&
            (args[0].includes('Warning: An update to') ||
                args[0].includes('was not wrapped in act(...)') ||
                args[0].includes('act(...) is not supported'))
        ) {
            return;
        }
        originalError.call(console, ...args);
    };
});

afterAll(() => {
    console.error = originalError;
});

// Provide a default fetch mock so runtime-config requests don't blow up in node
const mockFetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => '',
}));
(global as any).fetch = mockFetch;
(window as any).fetch = mockFetch;

// Mock IntersectionObserver with accessible instances for tests
const intersectionObserverInstances: Array<{ callback: IntersectionObserverCallback }> = [];
class MockIntersectionObserver {
    callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback = () => {}) {
        this.callback = callback;
        intersectionObserverInstances.push({ callback: this.callback });
    }
    disconnect() {}
    observe() {}
    takeRecords() {
        return [];
    }
    unobserve() {}
}
(global as any).__intersectionObserverInstances = intersectionObserverInstances;
(window as any).__intersectionObserverInstances = intersectionObserverInstances;
global.IntersectionObserver = MockIntersectionObserver as any;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    })),
});

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: jest.fn((key: string) => store[key] || null),
        setItem: jest.fn((key: string, value: string) => {
            store[key] = value.toString();
        }),
        removeItem: jest.fn((key: string) => {
            delete store[key];
        }),
        clear: jest.fn(() => {
            store = {};
        }),
    };
})();
Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
});

// Reset localStorage before each test
beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
    intersectionObserverInstances.length = 0;
    mockFetch.mockClear();
});
