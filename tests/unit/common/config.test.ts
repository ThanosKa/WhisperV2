import { describe, expect, test } from 'vitest';
import { settingsFromUserConfig } from '../../../src/main/features/common/config/config';

// The values a user with no ~/.whisper/config.json gets.
const defaults = {
    sttRelayUrl: 'wss://websocket-production-395f.up.railway.app',
    analysisStep: 1,
    utteranceSilenceMs: 800,
    maxUtteranceChars: 200,
    recapStep: 15,
    smartTrigger: { enabled: true, minTokenCount: 12, minCharCount: 80, maxWaitUtterances: 6 },
};

describe('settingsFromUserConfig', () => {
    test('no user config gives the defaults', () => {
        expect(settingsFromUserConfig({ userConfig: undefined })).toEqual(defaults);
    });

    test('a known key in the user config replaces its default', () => {
        expect(settingsFromUserConfig({ userConfig: { recapStep: 30, smartTrigger: { enabled: false } } })).toEqual({
            ...defaults,
            recapStep: 30,
            smartTrigger: { enabled: false },
        });
    });

    test('a valid key still applies when another key is invalid, which keeps its default', () => {
        expect(settingsFromUserConfig({ userConfig: { recapStep: 'thirty', analysisStep: 3 } })).toEqual({ ...defaults, analysisStep: 3 });
    });

    test('keys no code reads any more do not stop the others applying', () => {
        expect(settingsFromUserConfig({ userConfig: { apiUrl: 'http://localhost:9001', logLevel: 'debug', maxUtteranceChars: 120 } })).toEqual({
            ...defaults,
            maxUtteranceChars: 120,
        });
    });

    test('a file that is not a JSON object gives the defaults', () => {
        expect(settingsFromUserConfig({ userConfig: ['recapStep', 30] })).toEqual(defaults);
        expect(settingsFromUserConfig({ userConfig: null })).toEqual(defaults);
    });
});
