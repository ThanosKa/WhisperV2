module.exports = {
    testEnvironment: 'node',
    testMatch: ['<rootDir>/tests/unit/**/*.test.js', '<rootDir>/tests/integration/**/*.test.js'],
    // Agent worktrees live under .claude/worktrees/ and hold full copies of the repo.
    modulePathIgnorePatterns: ['<rootDir>/.claude/'],
    // The app's source is ESM (electron-vite bundles it); these CommonJS tests load it through Babel
    // until they move to Vitest. A module with only a default export keeps it as `module.exports`
    // (add-module-exports), so `require()` returns what it returned before the move to ESM.
    transform: {
        '\\.js$': [
            'babel-jest',
            {
                babelrc: false,
                configFile: false,
                sourceType: 'unambiguous',
                plugins: [
                    '@babel/plugin-transform-dynamic-import',
                    '@babel/plugin-transform-modules-commonjs',
                    'babel-plugin-add-module-exports',
                ],
            },
        ],
    },
    collectCoverageFrom: [
        'src/main/features/**/*.js',
        'src/main/bridge/**/*.js',
        '!src/main/features/**/repositories/*.js',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.js'],
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
    testTimeout: 10000,
};
