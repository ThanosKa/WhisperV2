import crypto from 'crypto';
import type { Request } from 'express';
import { EventEmitter } from 'events';

export function ipcRequest<T = unknown>(req: Request, channel: string, payload?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
        if (!req.bridge || !(req.bridge instanceof EventEmitter) || typeof req.bridge.emit !== 'function') {
            reject(new Error('IPC bridge is not available'));
            return;
        }

        const responseChannel = `${channel}-${crypto.randomUUID()}`;

        const onResponse = (response: { success: boolean; data?: T; error?: string } | undefined) => {
            if (!response) {
                reject(new Error(`No response received from ${channel}`));
                return;
            }

            if (response.success) {
                resolve(response.data as T);
            } else {
                reject(new Error(response.error || `IPC request to ${channel} failed`));
            }
        };

        req.bridge!.once(responseChannel, onResponse);

        try {
            req.bridge!.emit('web-data-request', channel, responseChannel, payload);
        } catch (error) {
            req.bridge!.removeAllListeners(responseChannel);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            reject(new Error(`Failed to emit IPC request: ${errorMessage}`));
        }
    });
}

export default { ipcRequest };
