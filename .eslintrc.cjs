module.exports = {
    root: true,
    env: {
        browser: true,
        node: true,
        es2022: true,
    },
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
    },
    settings: {
        react: {
            version: 'detect',
        },
    },
    plugins: ['react', 'react-hooks'],
    extends: ['eslint:recommended', 'plugin:react/recommended'],
    overrides: [
        {
            files: ['**/*.{ts,tsx}'],
            parser: '@typescript-eslint/parser',
            parserOptions: {
                project: './tsconfig.base.json',
            },
            plugins: ['@typescript-eslint', 'react', 'react-hooks'],
            extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
            rules: {
                '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            },
        },
        {
            files: ['**/*.{js,jsx,mjs,cjs}'],
            extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
        },
    ],
    rules: {
        'react/react-in-jsx-scope': 'off',
    },
    ignorePatterns: ['out/', 'dist/', 'public/build/', 'whisper_web/out/'],
};
