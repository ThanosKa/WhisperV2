import '@testing-library/jest-dom';

type IntersectionObserverStore = Array<{ callback: IntersectionObserverCallback }>;

declare global {
    interface Window {
        __intersectionObserverInstances?: IntersectionObserverStore;
    }
    // eslint-disable-next-line no-var
    var __intersectionObserverInstances: IntersectionObserverStore | undefined;
}

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
const mockFetch = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockImplementation(async () => new Response('{}', { status: 200 }));
globalThis.fetch = mockFetch;
if (typeof window !== 'undefined') {
    window.fetch = mockFetch;
}

// Mock IntersectionObserver with accessible instances for tests
const intersectionObserverInstances: IntersectionObserverStore = [];
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
if (typeof globalThis !== 'undefined') {
    globalThis.__intersectionObserverInstances = intersectionObserverInstances;
}
if (typeof window !== 'undefined') {
    window.__intersectionObserverInstances = intersectionObserverInstances;
    window.IntersectionObserver = MockIntersectionObserver as typeof IntersectionObserver;
}
globalThis.IntersectionObserver = MockIntersectionObserver as typeof IntersectionObserver;

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
