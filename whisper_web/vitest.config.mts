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
        exclude: ['**/node_modules/**', '.next/**', 'out/**', 'backend_node/**'],
        setupFiles: ['./vitest.setup.ts'],
    },
});
