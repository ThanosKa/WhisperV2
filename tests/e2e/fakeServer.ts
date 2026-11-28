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

// The answer the fake LLM streams to Ask, sent in several chunks.
export const FAKE_ANSWER_CHUNKS = ['The fake server', ' answers', ' this question.'] as const;
export const FAKE_ANSWER = FAKE_ANSWER_CHUNKS.join('');

export type LlmRequest = { route: 'chat' | 'stream'; body: unknown };

export type FakeServer = {
    url: string;
    wsUrl: string;
    unknownRequests: string[];
    llmRequests: LlmRequest[];
    close: () => Promise<void>;
};

type Reply = { kind: 'json'; status: number; body: unknown } | { kind: 'sse'; events: readonly string[] };

type RouteRequest = { match: RegExpMatchArray; headers: http.IncomingHttpHeaders; body: unknown };

type Route = {
    method: 'GET' | 'POST';
    pattern: RegExp;
    reply: (request: RouteRequest) => Reply;
};

const json = (status: number, body: unknown): Reply => ({ kind: 'json', status, body });

const sessionReply = (sessionUuid: string | undefined, data: unknown): Reply =>
    sessionUuid === FAKE_SESSION_UUID ? json(200, { success: true, data }) : json(404, { success: false, error: 'Session not found' });

const isFakeSession = (headers: http.IncomingHttpHeaders) => headers['x-session-uuid'] === FAKE_SESSION_UUID;

// The OpenAI-style server-sent events that WhisperAPP's /api/llm/stream sends.
const answerEvents = FAKE_ANSWER_CHUNKS.map(content => JSON.stringify({ choices: [{ delta: { content } }] })).concat('[DONE]');

const ROUTES: Route[] = [
    {
        method: 'GET',
        pattern: /^\/api\/auth\/session\/([^/]+)$/,
        reply: ({ match: [, sessionUuid] }) => sessionReply(sessionUuid, { status: 'authenticated' }),
    },
    {
        method: 'GET',
        pattern: /^\/api\/auth\/user-by-session\/([^/]+)$/,
        reply: ({ match: [, sessionUuid] }) => sessionReply(sessionUuid, FAKE_USER),
    },
    {
        method: 'POST',
        pattern: /^\/api\/llm\/stream$/,
        reply: ({ headers }) => (isFakeSession(headers) ? { kind: 'sse', events: answerEvents } : json(401, { success: false })),
    },
];

const findRoute = ({ method, pathname }: { method: string; pathname: string }) => {
    for (const route of ROUTES) {
        if (route.method !== method) continue;
        const match = pathname.match(route.pattern);
        if (match) return { route, match };
    }
    return undefined;
};

const readJsonBody = async (req: http.IncomingMessage): Promise<unknown> => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text) return undefined;
    try {
        const parsed: unknown = JSON.parse(text);
        return parsed;
    } catch {
        return text;
    }
};

const sendReply = async ({ res, reply }: { res: http.ServerResponse; reply: Reply }) => {
    switch (reply.kind) {
        case 'json':
            res.writeHead(reply.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(reply.body));
            return;
        case 'sse':
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
            // One event per write, so the app reads the answer as a stream, not as one block.
            for (const event of reply.events) {
                res.write(`data: ${event}\n\n`);
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            res.end();
            return;
    }
};

export async function startFakeServer(): Promise<FakeServer> {
    const unknownRequests: string[] = [];
    const llmRequests: LlmRequest[] = [];

    const handle = async (req: http.IncomingMessage, res: http.ServerResponse) => {
        const method = req.method ?? 'GET';
        const pathname = new URL(req.url ?? '/', 'http://fake.local').pathname;
        const found = findRoute({ method, pathname });
        if (!found) {
            unknownRequests.push(`${method} ${req.url ?? ''}`);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Unknown request in the e2e fake server' }));
            return;
        }
        const body = await readJsonBody(req);
        if (pathname === '/api/llm/stream') llmRequests.push({ route: 'stream', body });
        const reply = found.route.reply({ match: found.match, headers: req.headers, body });
        await sendReply({ res, reply });
    };

    const server = http.createServer((req, res) => {
        handle(req, res).catch(error => {
            unknownRequests.push(`FAILED ${req.method ?? ''} ${req.url ?? ''}: ${String(error)}`);
            res.destroy();
        });
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
        llmRequests,
        close: () =>
            new Promise<void>((resolve, reject) => {
                server.closeAllConnections();
                server.close(error => (error ? reject(error) : resolve()));
            }),
    };
}
