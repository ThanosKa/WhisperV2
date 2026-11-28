import { app } from 'electron';
import { pino, type DestinationStream, type Level, type Logger } from 'pino';
import { build as prettyStream } from 'pino-pretty';
import { env } from '../config/env';

// Main's one logger. Each module takes a child with its name and logs one call per event:
//
//     const log = logger.child({ module: 'AuthService' });
//     log.info({ sessionId, uid }, 'Session restored');
//     log.error({ err: error, sessionId }, 'Session validation failed');
//
// The object holds the ids in scope (session, user, window, channel, request) and `err` for an
// error; the message is a fixed sentence, with values in the object rather than in the text.
// Logs go to stdout, as `console.*` did; pretty-printed in development, JSON lines when packaged.

export type { Logger };

type LoggerOptions = {
    level: Level | 'silent';
    pretty: boolean;
    destination?: DestinationStream;
};

export function createLogger({ level, pretty, destination }: LoggerOptions): Logger {
    const stream = pretty ? prettyStream({ sync: true, destination: destination ?? 1 }) : (destination ?? pino.destination({ dest: 1, sync: true }));
    return pino({ level }, stream);
}

const level = (): LoggerOptions['level'] => {
    if (env.NODE_ENV === 'test') return 'silent';
    return app.isPackaged ? 'info' : 'debug';
};

export const logger = createLogger({ level: level(), pretty: !app.isPackaged });
