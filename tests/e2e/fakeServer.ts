import http from 'node:http';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';

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

// The transcript the fake STT relay sends for the microphone ("me") stream.
export const FAKE_TRANSCRIPT = 'This is the fake transcript from the relay.';

export type LlmRequest = { route: 'chat' | 'stream'; body: unknown };

// What the fake relay received, per stream, so a test can tell the fake microphone reached it.
export type RelayAudio = { me: number; them: number };

export type FakeServer = {
    url: string;
    wsUrl: string;
    unknownRequests: string[];
    llmRequests: LlmRequest[];
    relayAudio: RelayAudio;
    close: () => Promise<void>;
};

type Reply = { kind: 'json'; status: number; body: unknown } | { kind: 'sse'; events: readonly string[] };

type RouteRequest = { match: RegExpMatchArray; headers: http.IncomingHttpHeaders; body: unknown };

type Route = {
    method: 'GET' | 'POST';
    pattern: RegExp;
    // LLM routes log their request body, so a test can check what the app asked for.
    llm?: LlmRequest['route'];
    reply: (request: RouteRequest) => Reply;
};

const json = (status: number, body: unknown): Reply => ({ kind: 'json', status, body });

const sessionReply = (sessionUuid: string | undefined, data: unknown): Reply =>
    sessionUuid === FAKE_SESSION_UUID ? json(200, { success: true, data }) : json(404, { success: false, error: 'Session not found' });

const isFakeSession = (headers: http.IncomingHttpHeaders) => headers['x-session-uuid'] === FAKE_SESSION_UUID;

// What WhisperAPP's /api/llm/chat returns: the model's text in `content`. Listen's Done asks for a
// `comprehensive_summary`, whose text the app parses as this JSON.
const FAKE_SUMMARY = { title: 'E2E meeting', summary: 'A fixed summary.', key_topics: ['e2e'], action_items: [] };

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
        llm: 'stream',
        reply: ({ headers }) => (isFakeSession(headers) ? { kind: 'sse', events: answerEvents } : json(401, { success: false })),
    },
    {
        method: 'POST',
        pattern: /^\/api\/llm\/chat$/,
        llm: 'chat',
        reply: ({ headers }) =>
            isFakeSession(headers) ? json(200, { success: true, content: JSON.stringify(FAKE_SUMMARY) }) : json(401, { success: false }),
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const parseRelayMessage = (raw: RawData): Record<string, unknown> | undefined => {
    try {
        const parsed: unknown = JSON.parse(raw.toString());
        return isRecord(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
};

// Speaks the STT relay's protocol (the `websocket` repo, src/index.ts): OPEN is answered with
// CONNECTED; the first AUDIO chunk on the "me" stream gets the fixed transcript as a PARTIAL and a
// TURN_COMPLETE; CLOSE gets CLOSED. Any other message type is recorded as unknown.
const serveRelay = ({
    socket,
    relayAudio,
    unknownRequests,
}: {
    socket: WebSocket;
    relayAudio: RelayAudio;
    unknownRequests: string[];
}) => {
    let sessionId: unknown = null;
    let transcriptSent = false;
    const send = (message: Record<string, unknown>) => socket.send(JSON.stringify({ sessionId, ...message }));

    socket.on('message', raw => {
        const message = parseRelayMessage(raw);
        switch (message?.type) {
            case 'OPEN':
                sessionId = message.sessionId;
                send({ type: 'CONNECTED', provider: 'soniox', sessionUuid: FAKE_SESSION_UUID });
                return;
            case 'AUDIO': {
                const stream = message.stream === 'them' ? 'them' : 'me';
                relayAudio[stream] += 1;
                if (stream === 'me' && !transcriptSent) {
                    transcriptSent = true;
                    send({ type: 'PARTIAL', stream: 'me', text: FAKE_TRANSCRIPT, timestamp: 0 });
                    send({ type: 'TURN_COMPLETE', stream: 'me' });
                }
                return;
            }
            case 'CLOSE':
                send({ type: 'CLOSED' });
                return;
            default:
                unknownRequests.push(`RELAY ${String(message?.type ?? raw.toString().slice(0, 80))}`);
        }
    });
};

export async function startFakeServer(): Promise<FakeServer> {
    const unknownRequests: string[] = [];
    const llmRequests: LlmRequest[] = [];
    const relayAudio: RelayAudio = { me: 0, them: 0 };

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
        if (found.route.llm) llmRequests.push({ route: found.route.llm, body });
        const reply = found.route.reply({ match: found.match, headers: req.headers, body });
        await sendReply({ res, reply });
    };

    const server = http.createServer((req, res) => {
        handle(req, res).catch(error => {
            unknownRequests.push(`FAILED ${req.method ?? ''} ${req.url ?? ''}: ${String(error)}`);
            res.destroy();
        });
    });

    // The app connects to STT_RELAY_URL itself, with the session in a header, as the real relay expects.
    const relay = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
        if (req.url !== '/' || !isFakeSession(req.headers)) {
            unknownRequests.push(`WEBSOCKET ${req.url ?? ''}`);
            socket.destroy();
            return;
        }
        relay.handleUpgrade(req, socket, head, ws => serveRelay({ socket: ws, relayAudio, unknownRequests }));
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
        relayAudio,
        close: () =>
            new Promise<void>((resolve, reject) => {
                for (const client of relay.clients) client.terminate();
                relay.close();
                server.closeAllConnections();
                server.close(error => (error ? reject(error) : resolve()));
            }),
    };
}
