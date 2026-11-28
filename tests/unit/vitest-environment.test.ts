import { describe, expect, it } from 'vitest';

// Guards the Vitest `main` project: main-process tests run in Node, with no DOM, like the
// Electron main process. Delete it once ticket 03 has moved the real root tests here.
describe('the main Vitest project', () => {
    it('runs in Node without a DOM', () => {
        expect(typeof process.versions.node).toBe('string');
        expect('document' in globalThis).toBe(false);
    });
});
