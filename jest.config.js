module.exports = {
    testEnvironment: 'node',
    testMatch: ['<rootDir>/tests/unit/**/*.test.js', '<rootDir>/tests/integration/**/*.test.js'],
    // Agent worktrees live under .claude/worktrees/ and hold full copies of the repo.
    modulePathIgnorePatterns: ['<rootDir>/.claude/'],
    collectCoverageFrom: [
        'src/features/**/*.js',
        'src/bridge/**/*.js',
        '!src/features/**/repositories/*.js',
        '!src/ui/**/*.js',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.js'],
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
    testTimeout: 10000,
};
