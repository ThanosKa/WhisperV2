import type { WebContents } from 'electron';
import type { EventArgs, EventChannel } from '../../shared/ipc';

// Every main-to-renderer event goes through here, so the channel must be in src/shared/ipc.ts and
// the payload must match what it declares. Each element of `args` is one positional argument the
// renderer's listener receives, as `webContents.send(channel, ...args)` sends it.
export function sendEvent<C extends EventChannel>({
    webContents,
    channel,
    args,
}: {
    webContents: Pick<WebContents, 'send'>;
    channel: C;
    args: EventArgs[C];
}): void {
    webContents.send(channel, ...args);
}
