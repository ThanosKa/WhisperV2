import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeEach } from 'vitest';
import { __resetApiTestState } from '@/lib/api';
import { resetDesktop, sentRequests, server } from './__tests__/support/desktop';
import { installIntersectionObserver } from './__tests__/support/intersection-observer';

installIntersectionObserver();

// Listen before the test file is imported: `utils/api` fetches `/runtime-config.json` as soon as it loads.
// A request with no handler is an error, and the test that sent it fails below.
const unhandledRequests: string[] = [];
server.events.on('request:unhandled', ({ request }) => {
    unhandledRequests.push(`${request.method} ${request.url}`);
});
server.listen({ onUnhandledFrame: 'error' });

beforeEach(() => {
    // `utils/api` keeps the API origin it read from `/runtime-config.json`: read it again for each test.
    __resetApiTestState();
});

// Vitest runs without globals, so Testing Library cannot unmount by itself between tests.
afterEach(() => {
    cleanup();
    server.resetHandlers();
    resetDesktop();
    sentRequests.length = 0;
    localStorage.clear();
    const unhandled = unhandledRequests.splice(0);
    if (unhandled.length > 0) {
        throw new Error(`The page sent requests that no MSW handler knows: ${unhandled.join(', ')}`);
    }
});

afterAll(() => {
    server.close();
});
