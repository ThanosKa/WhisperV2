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
                },
            },
            'whisper_web',
        ],
    },
});
