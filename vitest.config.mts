import { defineConfig } from 'vitest/config';

// One Vitest run for the repo, one project per package: `pnpm test` runs both.
export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: 'main',
                    environment: 'node',
                    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
                    // Agent worktrees under .claude/ hold full copies of the repo.
                    exclude: ['**/node_modules/**', '.claude/**'],
                    setupFiles: ['tests/setup/vitest.setup.ts'],
                    clearMocks: true,
                    mockReset: true,
                    restoreMocks: true,
                    testTimeout: 10000,
                },
            },
            'whisper_web',
        ],
    },
});
