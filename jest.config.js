module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/unit/**/*.test.js', '**/tests/integration/**/*.test.js'],
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
