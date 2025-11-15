import '@testing-library/jest-dom';

// Suppress React act() warnings from Radix UI components
const originalError = console.error;
beforeAll(() => {
    console.error = (...args: unknown[]) => {
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
global.fetch = mockFetch as typeof fetch;
if (typeof window !== 'undefined') {
    window.fetch = mockFetch as typeof fetch;
}

// Mock IntersectionObserver with accessible instances for tests
const intersectionObserverInstances: Array<{ callback: IntersectionObserverCallback }> = [];
class MockIntersectionObserver implements IntersectionObserver {
    callback: IntersectionObserverCallback;
    root: Element | null = null;
    rootMargin: string = '';
    thresholds: ReadonlyArray<number> = [];
    constructor(callback: IntersectionObserverCallback = () => {}) {
        this.callback = callback;
        intersectionObserverInstances.push({ callback: this.callback });
    }
    disconnect() {}
    observe() {}
    takeRecords(): IntersectionObserverEntry[] {
        return [];
    }
    unobserve() {}
}
if (typeof global !== 'undefined') {
    (global as typeof globalThis).__intersectionObserverInstances = intersectionObserverInstances;
}
if (typeof window !== 'undefined') {
    window.__intersectionObserverInstances = intersectionObserverInstances;
    window.IntersectionObserver = MockIntersectionObserver as typeof IntersectionObserver;
}
global.IntersectionObserver = MockIntersectionObserver as typeof IntersectionObserver;

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
