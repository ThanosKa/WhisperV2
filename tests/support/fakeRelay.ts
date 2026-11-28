import type { AddressInfo } from 'net';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';

// A local stand-in for the Soniox relay (`../websocket`): a real WebSocket server on a free port
// that records what the app sends and answers the way the relay does. A test drives it with
// `send` and `close`; `onOpen` decides how it answers the app's OPEN message.

const ClientMessageSchema = z.looseObject({ type: z.string() });

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export type RelayConnection = {
    headers: Record<string, string | string[] | undefined>;
    // Settles once the socket is closed on the relay's side.
    closed: Promise<void>;
    received: ClientMessage[];
    send: (message: Record<string, unknown>) => void;
    sendRaw: (text: string) => void;
    close: ({ code, reason }: { code: number; reason: string }) => void;
    terminate: () => void;
};

export type FakeRelay = {
    url: string;
    connections: RelayConnection[];
    // How the relay answers OPEN; by default it sends CONNECTED, as the real relay does once both
    // streams are open upstream.
    onOpen: (connection: RelayConnection) => void;
    latest: () => RelayConnection;
    stop: () => Promise<void>;
};

const connectedAnswer = (connection: RelayConnection) => connection.send({ type: 'CONNECTED', provider: 'soniox', sessionId: 'relay-session' });

export async function startFakeRelay(): Promise<FakeRelay> {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise<void>(resolve => server.once('listening', () => resolve()));
    const address: AddressInfo | string | null = server.address();
    if (address === null || typeof address === 'string') throw new Error('Fake relay has no port');

    const relay: FakeRelay = {
        url: `ws://127.0.0.1:${address.port}`,
        connections: [],
        onOpen: connectedAnswer,
        latest: () => {
            const connection = relay.connections.at(-1);
            if (!connection) throw new Error('No connection to the fake relay yet');
            return connection;
        },
        stop: () =>
            new Promise<void>(resolve => {
                server.clients.forEach(client => client.terminate());
                server.close(() => resolve());
            }),
    };

    server.on('connection', (socket: WebSocket, request) => {
        const connection: RelayConnection = {
            headers: request.headers,
            closed: new Promise<void>(resolve => socket.once('close', () => resolve())),
            received: [],
            send: message => socket.send(JSON.stringify(message)),
            sendRaw: text => socket.send(text),
            close: ({ code, reason }) => socket.close(code, reason),
            terminate: () => socket.terminate(),
        };
        relay.connections.push(connection);
        socket.on('message', raw => {
            const message = ClientMessageSchema.parse(JSON.parse(raw.toString()));
            connection.received.push(message);
            if (message.type === 'OPEN') relay.onOpen(connection);
        });
    });

    return relay;
}
