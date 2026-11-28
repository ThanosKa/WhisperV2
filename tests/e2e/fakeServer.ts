import http from 'node:http';

// One local server that stands in for WhisperAPP (HTTP) and the STT relay (WebSocket).
// It answers known requests with fixed data and records every other request,
// so the fixture can fail the test on it instead of letting it hang or reach the real network.

export const FAKE_SESSION_UUID = 'e2e-session-0001';

export const FAKE_USER = {
    uid: 'e2e-user-0001',
    email: 'e2e@example.test',
    displayName: 'E2E User',
    plan: 'free',
    apiQuota: { limit: 10, used: 0, remaining: 10 },
} as const;

export type FakeServer = {
    url: string;
    wsUrl: string;
    unknownRequests: string[];
    close: () => Promise<void>;
};

type Reply = { status: number; body: unknown };

type Route = {
    method: 'GET' | 'POST';
    pattern: RegExp;
    reply: (match: RegExpMatchArray) => Reply;
};

const sessionReply = (sessionUuid: string | undefined, data: unknown): Reply =>
    sessionUuid === FAKE_SESSION_UUID
        ? { status: 200, body: { success: true, data } }
        : { status: 404, body: { success: false, error: 'Session not found' } };

const ROUTES: Route[] = [
    {
        method: 'GET',
        pattern: /^\/api\/auth\/session\/([^/]+)$/,
        reply: ([, sessionUuid]) => sessionReply(sessionUuid, { status: 'authenticated' }),
    },
    {
        method: 'GET',
        pattern: /^\/api\/auth\/user-by-session\/([^/]+)$/,
        reply: ([, sessionUuid]) => sessionReply(sessionUuid, FAKE_USER),
    },
];

const findReply = ({ method, pathname }: { method: string; pathname: string }): Reply | undefined => {
    for (const route of ROUTES) {
        if (route.method !== method) continue;
        const match = pathname.match(route.pattern);
        if (match) return route.reply(match);
    }
    return undefined;
};

export async function startFakeServer(): Promise<FakeServer> {
    const unknownRequests: string[] = [];

    const server = http.createServer((req, res) => {
        const method = req.method ?? 'GET';
        const pathname = new URL(req.url ?? '/', 'http://fake.local').pathname;
        const reply = findReply({ method, pathname });
        if (!reply) {
            unknownRequests.push(`${method} ${req.url ?? ''}`);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Unknown request in the e2e fake server' }));
            return;
        }
        res.writeHead(reply.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(reply.body));
    });

    server.on('upgrade', (req, socket) => {
        unknownRequests.push(`WEBSOCKET ${req.url ?? ''}`);
        socket.destroy();
    });

    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
        throw new Error('The e2e fake server did not get a TCP port');
    }
    const { port } = address;

    return {
        url: `http://127.0.0.1:${port}`,
        wsUrl: `ws://127.0.0.1:${port}`,
        unknownRequests,
        close: () =>
            new Promise<void>((resolve, reject) => {
                server.closeAllConnections();
                server.close(error => (error ? reject(error) : resolve()));
            }),
    };
}
