import { defineProject } from 'vitest/config';

export default defineProject({
    resolve: {
        // The `@/*` path from tsconfig.json.
        tsconfigPaths: true,
    },
    test: {
        name: 'whisper_web',
        environment: 'jsdom',
        include: ['**/*.test.{ts,tsx}'],
        // `__tests__/` still runs on Jest until ticket 08 moves it here.
        exclude: ['**/node_modules/**', '.next/**', 'out/**', 'backend_node/**', '__tests__/**'],
        setupFiles: ['./vitest.setup.ts'],
    },
});
