import { describe, expect, test } from 'vitest';
import { apiBaseUrlArgument, readApiBaseUrlArgument } from '../../../src/shared/preloadArguments';

describe('API_BASE_URL from main to preload', () => {
    test('preload reads back the value main put in the window arguments', () => {
        const argv = ['/Applications/Whisper.app/Contents/Frameworks/Whisper Helper', '--type=renderer', apiBaseUrlArgument('http://127.0.0.1:4010')];

        expect(readApiBaseUrlArgument(argv)).toBe('http://127.0.0.1:4010');
    });

    test('reads nothing when main did not pass the argument', () => {
        expect(readApiBaseUrlArgument(['--type=renderer'])).toBeUndefined();
    });
});
