import crypto from 'crypto';
import type { Request } from 'express';

export function ipcRequest<T = any>(req: Request, channel: string, payload?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
        if (!req.bridge || typeof (req.bridge as any).emit !== 'function') {
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
            const envelope = { __uid: req.uid, data: payload };
            req.bridge!.emit('web-data-request', channel, responseChannel, envelope);
        } catch (error: any) {
            req.bridge!.removeAllListeners(responseChannel);
            reject(new Error(`Failed to emit IPC request: ${error.message}`));
        }
    });
}

export default { ipcRequest };
