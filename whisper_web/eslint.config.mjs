import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

// The same rules as the old `.eslintrc.json` (`next/core-web-vitals` on eslint-config-next 14).
// eslint-config-next 16 turns on rules that 14 did not have: they stay off until the code is reviewed for them.
const RULES_NEW_IN_NEXT_16 = [
    '@next/next/no-location-assign-relative-destination',
    'react-hooks/config',
    'react-hooks/error-boundaries',
    'react-hooks/gating',
    'react-hooks/globals',
    'react-hooks/immutability',
    'react-hooks/incompatible-library',
    'react-hooks/preserve-manual-memoization',
    'react-hooks/purity',
    'react-hooks/refs',
    'react-hooks/set-state-in-effect',
    'react-hooks/set-state-in-render',
    'react-hooks/static-components',
    'react-hooks/unsupported-syntax',
    'react-hooks/use-memo',
];

const eslintConfig = [
    ...nextCoreWebVitals,
    {
        linterOptions: { reportUnusedDisableDirectives: 'off' },
        rules: Object.fromEntries(RULES_NEW_IN_NEXT_16.map(rule => [rule, 'off'])),
    },
    {
        ignores: ['backend_node/dist/**', 'coverage/**'],
    },
];

export default eslintConfig;
