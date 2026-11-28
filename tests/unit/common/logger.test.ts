import { describe, expect, test } from 'vitest';
import { createLogger } from '../../../src/main/features/common/utils/logger';

const captureLines = () => {
    const lines: unknown[] = [];
    const destination = {
        write: (line: string) => {
            lines.push(JSON.parse(line));
        },
    };
    return { lines, destination };
};

describe('createLogger', () => {
    test('writes one JSON line with the level, the module, the ids in scope and the message', () => {
        const { lines, destination } = captureLines();
        const log = createLogger({ level: 'info', pretty: false, destination }).child({ module: 'AuthService' });

        log.info({ sessionId: 'abc12345' }, 'Session restored');

        expect(lines).toEqual([expect.objectContaining({ level: 30, module: 'AuthService', sessionId: 'abc12345', msg: 'Session restored' })]);
    });

    test('serializes an error passed as `err` with its message and stack', () => {
        const { lines, destination } = captureLines();
        const log = createLogger({ level: 'info', pretty: false, destination });

        log.error({ err: new Error('boom') }, 'Sign-in failed');

        expect(lines).toEqual([
            expect.objectContaining({
                level: 50,
                msg: 'Sign-in failed',
                err: expect.objectContaining({ type: 'Error', message: 'boom', stack: expect.stringContaining('boom') }),
            }),
        ]);
    });

    test('drops lines below the level', () => {
        const { lines, destination } = captureLines();
        const log = createLogger({ level: 'info', pretty: false, destination });

        log.debug('hidden');
        log.warn('shown');

        expect(lines).toEqual([expect.objectContaining({ level: 40, msg: 'shown' })]);
    });
});
