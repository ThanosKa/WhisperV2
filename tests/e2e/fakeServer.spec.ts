import { expect, test } from '@playwright/test';
import { WebSocket } from 'ws';
import { FAKE_SESSION_UUID, FAKE_TRANSCRIPT, startFakeServer, type FakeServer } from './fakeServer';

// The fake server on its own, without the app: what it records as unknown is what fails a test.

let fakeServer: FakeServer;

test.beforeEach(async () => {
    fakeServer = await startFakeServer();
});

test.afterEach(async () => {
    await fakeServer.close();
});

const openRelay = async ({ headers }: { headers: Record<string, string> }): Promise<{ socket: WebSocket; replies: unknown[] }> => {
    const socket = new WebSocket(fakeServer.wsUrl, { headers });
    const replies: unknown[] = [];
    socket.on('message', (raw: Buffer) => replies.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve, reject) => {
        socket.once('open', () => resolve());
        socket.once('error', reject);
    });
    return { socket, replies };
};

test('an unknown HTTP request is recorded and answered 404', async () => {
    const response = await fetch(`${fakeServer.url}/api/unknown?x=1`, { method: 'POST' });

    expect(response.status).toBe(404);
    expect(fakeServer.unknownRequests).toEqual([{ kind: 'http', method: 'POST', url: '/api/unknown?x=1' }]);
});

test('a relay connection without the fake session is recorded and refused', async () => {
    const socket = new WebSocket(fakeServer.wsUrl);
    await new Promise(resolve => socket.once('error', resolve));

    expect(fakeServer.unknownRequests).toEqual([{ kind: 'websocket', url: '/' }]);
});

test('the relay answers OPEN, the first microphone AUDIO and CLOSE', async () => {
    const { socket, replies } = await openRelay({ headers: { 'X-Session-UUID': FAKE_SESSION_UUID } });

    socket.send(JSON.stringify({ type: 'OPEN', sessionId: 's1' }));
    socket.send(JSON.stringify({ type: 'AUDIO', stream: 'them', data: '' }));
    socket.send(JSON.stringify({ type: 'AUDIO', stream: 'me', data: '' }));
    socket.send(JSON.stringify({ type: 'AUDIO', stream: 'me', data: '' }));
    socket.send(JSON.stringify({ type: 'CLOSE' }));

    await expect.poll(() => replies.length).toBe(4);
    expect(replies).toEqual([
        { sessionId: 's1', type: 'CONNECTED', provider: 'soniox', sessionUuid: FAKE_SESSION_UUID },
        { sessionId: 's1', type: 'PARTIAL', stream: 'me', text: FAKE_TRANSCRIPT, timestamp: 0 },
        { sessionId: 's1', type: 'TURN_COMPLETE', stream: 'me' },
        { sessionId: 's1', type: 'CLOSED' },
    ]);
    expect(fakeServer.relayAudio).toEqual({ me: 2, them: 1 });
    expect(fakeServer.unknownRequests).toEqual([]);
    socket.close();
});

test('a relay message the fake does not know is recorded', async () => {
    const { socket } = await openRelay({ headers: { 'X-Session-UUID': FAKE_SESSION_UUID } });

    socket.send(JSON.stringify({ type: 'PING' }));
    socket.send('not json');

    await expect.poll(() => fakeServer.unknownRequests.length).toBe(2);
    expect(fakeServer.unknownRequests).toEqual([
        { kind: 'relay', message: '{"type":"PING"}' },
        { kind: 'relay', message: 'not json' },
    ]);
    socket.close();
});
