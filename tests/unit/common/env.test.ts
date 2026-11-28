import { describe, expect, test } from 'vitest';
import { parseEnv } from '../../../src/main/features/common/config/env';

describe('parseEnv', () => {
    test('defaults API_BASE_URL to the www domain, so no request goes through the 308 redirect', () => {
        expect(parseEnv({}).API_BASE_URL).toBe('https://www.app-whisper.com');
    });

    test('removes a trailing slash from API_BASE_URL', () => {
        expect(parseEnv({ API_BASE_URL: 'http://localhost:3000/' }).API_BASE_URL).toBe('http://localhost:3000');
    });

    test('reads the values main uses and ignores the rest of the environment', () => {
        expect(
            parseEnv({
                API_BASE_URL: 'http://127.0.0.1:4010',
                STT_RELAY_URL: 'ws://localhost:8080',
                NODE_ENV: 'development',
                OPENAI_TRANSCRIBE_LANG: 'el',
                PATH: '/usr/bin',
            })
        ).toEqual({
            API_BASE_URL: 'http://127.0.0.1:4010',
            STT_RELAY_URL: 'ws://localhost:8080',
            NODE_ENV: 'development',
            OPENAI_TRANSCRIBE_LANG: 'el',
        });
    });

    test('treats an empty value as unset, as `process.env.X || default` did', () => {
        expect(parseEnv({ API_BASE_URL: '', STT_RELAY_URL: '', OPENAI_TRANSCRIBE_LANG: '' })).toEqual({
            API_BASE_URL: 'https://www.app-whisper.com',
        });
    });

    test('stops with a message naming the variable when a value is wrong', () => {
        expect(() => parseEnv({ API_BASE_URL: 'not a url' })).toThrow(/API_BASE_URL/);
        expect(() => parseEnv({ STT_RELAY_URL: 'relay' })).toThrow(/STT_RELAY_URL/);
        expect(() => parseEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    });
});
