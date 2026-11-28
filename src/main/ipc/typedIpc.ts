import { ipcMain } from 'electron';
import type { z } from 'zod';
import {
    invokeArgSchemas,
    sendArgSchemas,
    type InvokeChannel,
    type InvokeParsedArgs,
    type InvokeResult,
    type SendChannel,
    type SendParsedArgs,
} from '../../shared/ipc';
import { logger } from '../features/common/utils/logger';

// Every `ipcMain` registration goes through here, so each payload is parsed with its channel's
// schema from src/shared/ipc.ts before a handler sees it. A payload that fails is logged with the
// channel and the zod issues; an invoke then rejects, as a handler that throws did before, and a
// send is dropped.

const log = logger.child({ module: 'Ipc' });

type InvokeHandler<C extends InvokeChannel> = (...args: InvokeParsedArgs[C]) => InvokeResult[C] | Promise<InvokeResult[C]>;
type SendListener<C extends SendChannel> = (...args: SendParsedArgs[C]) => void;

function parsePayload<T>({ channel, schema, args }: { channel: string; schema: z.ZodType<T>; args: unknown[] }): T | undefined {
    const parsed = schema.safeParse(args);
    if (parsed.success) return parsed.data;
    log.error({ channel, issues: parsed.error.issues }, 'IPC payload failed its schema');
    return undefined;
}

export function handle<C extends InvokeChannel>({ channel, handler }: { channel: C; handler: InvokeHandler<C> }): void {
    const schema = invokeArgSchemas[channel].args;
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
        const parsed = parsePayload({ channel, schema, args });
        if (parsed === undefined) throw new Error(`Invalid payload on IPC channel ${channel}`);
        return handler(...parsed);
    });
}

export function on<C extends SendChannel>({ channel, listener }: { channel: C; listener: SendListener<C> }): void {
    const schema = sendArgSchemas[channel].args;
    ipcMain.on(channel, (_event, ...args: unknown[]) => {
        const parsed = parsePayload({ channel, schema, args });
        if (parsed !== undefined) listener(...parsed);
    });
}
