import fs from 'fs';
import { EventEmitter } from 'events';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { startFakeRelay, type FakeRelay } from '../../support/fakeRelay';

// Listen end to end in main: the real ListenService, SttService and SummaryService, the real
// repositories on an in-memory SQLite database, and a local fake of the STT relay. Only what cannot
// run here is replaced: the signed-in user (WhisperAPP), the LLM route (WhisperAPP) and the windows.

type FakeWindow = { isDestroyed: () => boolean; webContents: { send: ReturnType<typeof vi.fn> } };

const { fakeAuth, windowPool, chat } = vi.hoisted(() => ({
    fakeAuth: {
        sessionUuid: 'desktop-session-uuid',
        getCurrentUserId: () => 'user-1',
        getCurrentUser: () => ({ uid: 'user-1', isLoggedIn: true }),
    },
    windowPool: new Map<string, FakeWindow>(),
    chat: vi.fn(async (): Promise<{ content: string }> => ({ content: '{}' })),
}));

vi.mock('../../../src/main/features/common/services/authService', () => ({ default: fakeAuth }));
vi.mock('../../../src/main/window/windowManager', () => ({ windowPool }));
vi.mock('../../../src/main/features/common/ai/llmClient', () => ({ chat, stream: vi.fn() }));

type Modules = {
    listenService: typeof import('../../../src/main/features/listen/listenService').default;
    sqliteClient: typeof import('../../../src/main/features/common/services/sqliteClient').default;
    sessionRepository: typeof import('../../../src/main/features/common/repositories/session').default;
    sttRepository: typeof import('../../../src/main/features/listen/stt/repositories').default;
    summaryRepository: typeof import('../../../src/main/features/listen/summary/repositories').default;
    internalBridge: EventEmitter;
};

let relay: FakeRelay;
let m: Modules;

const fakeWindow = (): FakeWindow => ({ isDestroyed: () => false, webContents: { send: vi.fn() } });
let header: FakeWindow;
let listenWindow: FakeWindow;

const sentTo = (win: FakeWindow, channel: string): unknown[] =>
    win.webContents.send.mock.calls.filter(([sent]) => sent === channel).map(([, payload]) => payload);

const lastResult = () => sentTo(header, 'listen:changeSessionResult').at(-1);

const currentSessionId = (): string => {
    const { sessionId } = m.listenService.getCurrentSessionData();
    if (typeof sessionId !== 'string') throw new Error('No listen session');
    return sessionId;
};

beforeAll(async () => {
    relay = await startFakeRelay();
    // sttService reads the relay URL when it loads, so the modules load after the relay is up.
    vi.stubEnv('STT_RELAY_URL', relay.url);
    const [listen, sqlite, session, stt, summary, bridge] = await Promise.all([
        import('../../../src/main/features/listen/listenService'),
        import('../../../src/main/features/common/services/sqliteClient'),
        import('../../../src/main/features/common/repositories/session'),
        import('../../../src/main/features/listen/stt/repositories'),
        import('../../../src/main/features/listen/summary/repositories'),
        import('../../../src/main/bridge/internalBridge'),
    ]);
    m = {
        listenService: listen.default,
        sqliteClient: sqlite.default,
        sessionRepository: session.default,
        sttRepository: stt.default,
        summaryRepository: summary.default,
        internalBridge: bridge.default,
    };
    m.sessionRepository.setAuthService(fakeAuth);
});

afterAll(async () => {
    await relay.stop();
    vi.unstubAllEnvs();
});

beforeEach(() => {
    m.sqliteClient.connect(':memory:');
    m.sqliteClient.initTables();
    header = fakeWindow();
    listenWindow = fakeWindow();
    windowPool.set('header', header);
    windowPool.set('listen', listenWindow);
    relay.connections.length = 0;
    relay.onOpen = connection => connection.send({ type: 'CONNECTED', provider: 'soniox', sessionId: 'relay-session' });
    // summaryService appends a debug trace to ./response.txt on every analysis round.
    vi.spyOn(fs, 'appendFileSync').mockImplementation(() => undefined);
});

afterEach(async () => {
    await m.listenService.sttService.closeSessions();
    // The app's socket reports its close a moment later; let that land before the next test opens
    // a new one, or its close handler would clear the new connection's state. A socket the app lost
    // track of (see the retry test) is closed from the relay's side.
    relay.connections.forEach(connection => connection.terminate());
    await Promise.all(relay.connections.map(connection => connection.closed));
    await new Promise(resolve => setTimeout(resolve, 20));
    m.listenService.currentSessionId = null;
    m.listenService.strandedSession = null;
    m.listenService.isRecoveryDismissed = false;
    m.listenService.summaryService.resetConversationHistory();
    await m.listenService.summaryService.setAnalysisPreset(null);
    m.sqliteClient.close();
    windowPool.clear();
});

describe('Listen button', () => {
    test('Listen opens the relay, starts a listen session and tells both windows', async () => {
        const visibility: unknown[] = [];
        m.internalBridge.on('window:requestVisibility', request => visibility.push(request));

        await m.listenService.handleListenRequest('Listen');

        expect(lastResult()).toEqual({ success: true, nextStatus: 'inSession' });
        expect(sentTo(listenWindow, 'change-listen-capture-state')).toContainEqual({ status: 'start' });
        expect(sentTo(listenWindow, 'session-state-changed')).toContainEqual({ isActive: true, mode: 'start' });
        expect(visibility).toContainEqual({ name: 'listen', visible: true });

        const connection = relay.latest();
        expect(connection.headers['x-session-uuid']).toBe('desktop-session-uuid');
        expect(connection.received[0]).toMatchObject({ type: 'OPEN', streams: ['me', 'them'] });

        const sessionId = m.listenService.getCurrentSessionData().sessionId;
        expect(sessionId).toEqual(expect.any(String));
        const session = m.sessionRepository.getById(sessionId);
        expect(session).toMatchObject({ uid: 'user-1', session_type: 'listen', ended_at: null });
        expect(m.listenService.isSessionActive()).toBe(true);
        m.internalBridge.removeAllListeners('window:requestVisibility');
    });

    test('Stop pauses capture and keeps the relay; Resume restarts capture', async () => {
        await m.listenService.handleListenRequest('Listen');

        await m.listenService.handleListenRequest('Stop');
        expect(lastResult()).toEqual({ success: true, nextStatus: 'paused' });
        expect(sentTo(listenWindow, 'session-state-changed')).toContainEqual({ isActive: false, mode: 'pause' });
        expect(m.listenService.isSessionActive()).toBe(true);

        await m.listenService.handleListenRequest('Resume');
        expect(lastResult()).toEqual({ success: true, nextStatus: 'inSession' });
        expect(sentTo(listenWindow, 'session-state-changed')).toContainEqual({ isActive: true, mode: 'resume' });
        expect(sentTo(listenWindow, 'update-status')).toContain('Resumed listening.');
    });

    test('Listen during an active session reopens the window without a new relay connection', async () => {
        await m.listenService.handleListenRequest('Listen');
        const sessionId = m.listenService.getCurrentSessionData().sessionId;

        await m.listenService.handleListenRequest('Listen');

        expect(lastResult()).toEqual({ success: true, nextStatus: 'inSession' });
        expect(relay.connections).toHaveLength(1);
        expect(m.listenService.getCurrentSessionData().sessionId).toBe(sessionId);
    });

    test('Done closes the relay, ends the session and saves the meeting summary from the LLM', async () => {
        chat.mockResolvedValue({
            content: '```json\n{"title":"Quarterly planning","summary":"We planned Q3.","key_topics":["budget"],"action_items":["Send deck"]}\n```',
        });
        await m.listenService.handleListenRequest('Listen');
        const sessionId = currentSessionId();
        relay.latest().send({ type: 'PARTIAL', stream: 'me', text: 'Let us plan the third quarter' });
        relay.latest().send({ type: 'TURN_COMPLETE', stream: 'me' });
        await vi.waitFor(() => expect(m.sttRepository.getAllTranscriptsBySessionId(sessionId)).toHaveLength(1));
        const connection = relay.latest();

        await m.listenService.handleListenRequest('Done');

        expect(lastResult()).toEqual({ success: true, nextStatus: 'beforeSession' });
        expect(sentTo(listenWindow, 'session-state-changed')).toContainEqual({ isActive: false, mode: 'end' });
        await vi.waitFor(() => expect(connection.received.map(message => message.type)).toContain('CLOSE'));
        expect(m.listenService.isSessionActive()).toBe(false);
        expect(m.listenService.getConversationHistory()).toEqual([]);
        expect(m.sessionRepository.getById(sessionId)?.ended_at).toEqual(expect.any(Number));

        await vi.waitFor(() => expect(m.sessionRepository.getById(sessionId)?.title).toBe('Quarterly planning'));
        expect(chat).toHaveBeenCalledWith({
            profile: 'comprehensive_summary',
            userContent: '',
            context: { transcript: 'Me: Let us plan the third quarter' },
        });
        expect(m.summaryRepository.getSummaryBySessionId(sessionId)).toMatchObject({
            tldr: 'We planned Q3.',
            bullet_json: '["budget"]',
            action_json: '["Send deck"]',
            model: 'comprehensive_summary',
        });
    });

    test('Done saves a fallback summary when the LLM answer is not JSON', async () => {
        chat.mockResolvedValue({ content: 'Sorry, I cannot help with that.' });
        await m.listenService.handleListenRequest('Listen');
        const sessionId = currentSessionId();
        relay.latest().send({ type: 'PARTIAL', stream: 'them', text: 'Hello there everyone' });
        relay.latest().send({ type: 'TURN_COMPLETE', stream: 'them' });
        await vi.waitFor(() => expect(m.sttRepository.getAllTranscriptsBySessionId(sessionId)).toHaveLength(1));

        await m.listenService.handleListenRequest('Done');

        await vi.waitFor(() => expect(m.summaryRepository.getSummaryBySessionId(sessionId)).not.toBeNull());
        expect(m.summaryRepository.getSummaryBySessionId(sessionId)).toMatchObject({
            tldr: 'Meeting transcript analysis completed. 1 conversation turns recorded.',
            text: 'Sorry, I cannot help with that.',
            bullet_json: '["Meeting recorded"]',
            action_json: '[]',
        });
    });

    test('an unknown button text is rejected and reported to the header', async () => {
        await expect(m.listenService.handleListenRequest('Pause')).rejects.toThrow('unknown listenButtonText: Pause');
        expect(lastResult()).toEqual({ success: false });
    });
});

describe('Starting a session', () => {
    test('retries the relay after an error and starts once it connects', async () => {
        let attempts = 0;
        relay.onOpen = connection => {
            attempts += 1;
            if (attempts === 1) connection.send({ type: 'ERROR', code: 'UPSTREAM_UNAVAILABLE', message: 'Soniox down' });
            else connection.send({ type: 'CONNECTED' });
        };

        await m.listenService.handleListenRequest('Listen');

        expect(attempts).toBe(2);
        expect(lastResult()).toEqual({ success: true, nextStatus: 'inSession' });
        expect(sentTo(listenWindow, 'update-status')).toContain('Relay error');
        expect(sentTo(listenWindow, 'update-status')).toContain('Connected. Ready to listen.');
    });

    test('fails without a signed-in desktop session and leaves the header before the session', async () => {
        const sessionUuid = fakeAuth.sessionUuid;
        Reflect.set(fakeAuth, 'sessionUuid', null);
        vi.useFakeTimers({ toFake: ['setTimeout'] });
        try {
            const request = m.listenService.handleListenRequest('Listen');
            await vi.runAllTimersAsync();
            await request;
        } finally {
            vi.useRealTimers();
            Reflect.set(fakeAuth, 'sessionUuid', sessionUuid);
        }

        expect(lastResult()).toEqual({ success: false, nextStatus: 'beforeSession' });
        expect(sentTo(listenWindow, 'update-status')).toContain('Initialization failed.');
        expect(relay.connections).toHaveLength(0);
    });
});

describe('Live transcription', () => {
    test('relay partials go to the window, and a completed turn is saved and shown as final', async () => {
        await m.listenService.handleListenRequest('Listen');
        const sessionId = currentSessionId();

        relay.latest().send({ type: 'PARTIAL', stream: 'them', text: 'How is the' });
        relay.latest().send({ type: 'PARTIAL', stream: 'them', text: 'How is the project going' });
        relay.latest().send({ type: 'TURN_COMPLETE', stream: 'them' });

        await vi.waitFor(() => expect(m.sttRepository.getAllTranscriptsBySessionId(sessionId)).toHaveLength(1));
        const updates = sentTo(listenWindow, 'stt-update');
        expect(updates).toContainEqual(expect.objectContaining({ speaker: 'Them', text: 'How is the', isPartial: true, isFinal: false }));
        expect(updates.at(-1)).toMatchObject({ speaker: 'Them', text: 'How is the project going', isPartial: false, isFinal: true });
        expect(m.sttRepository.getAllTranscriptsBySessionId(sessionId)[0]).toMatchObject({
            session_id: sessionId,
            speaker: 'Them',
            text: 'How is the project going',
        });
        expect(m.listenService.getConversationHistory()).toEqual(['them: How is the project going']);
    });

    test('noise and very short turns are not saved', async () => {
        await m.listenService.handleListenRequest('Listen');
        const sessionId = currentSessionId();

        relay.latest().send({ type: 'PARTIAL', stream: 'me', text: '<noise>' });
        relay.latest().send({ type: 'TURN_COMPLETE', stream: 'me' });
        relay.latest().send({ type: 'PARTIAL', stream: 'me', text: 'ok' });
        relay.latest().send({ type: 'TURN_COMPLETE', stream: 'me' });
        relay.latest().send({ type: 'PARTIAL', stream: 'them', text: 'Sounds good to me' });
        relay.latest().send({ type: 'TURN_COMPLETE', stream: 'them' });

        await vi.waitFor(() => expect(m.sttRepository.getAllTranscriptsBySessionId(sessionId)).toHaveLength(1));
        expect(m.sttRepository.getAllTranscriptsBySessionId(sessionId)[0]).toMatchObject({ speaker: 'Them', text: 'Sounds good to me' });
        expect(sentTo(listenWindow, 'stt-update')).not.toContainEqual(expect.objectContaining({ text: '<noise>' }));
    });

    test('relay messages that are not JSON, or events Listen does not use, are ignored', async () => {
        await m.listenService.handleListenRequest('Listen');
        const sessionId = currentSessionId();

        relay.latest().sendRaw('not json');
        relay.latest().send({ type: 'QUOTA', quotaStatus: { remaining: 10 } });
        relay.latest().send({ type: 'USAGE', stream: 'me', promptTokens: 3, candidateTokens: 4 });
        relay.latest().send({ type: 'PARTIAL', stream: 'me', text: 'Still listening here' });
        relay.latest().send({ type: 'TURN_COMPLETE', stream: 'me' });

        await vi.waitFor(() => expect(m.sttRepository.getAllTranscriptsBySessionId(sessionId)).toHaveLength(1));
        expect(m.listenService.isSessionActive()).toBe(true);
    });

    test('microphone audio goes to the relay on the me stream', async () => {
        const before = await m.listenService.handleSendMicAudioContent('AAAA', 'audio/pcm;rate=24000');
        expect(before).toEqual({ success: false, error: 'User STT session not active' });

        await m.listenService.handleListenRequest('Listen');
        const result = await m.listenService.handleSendMicAudioContent('AAAA', 'audio/pcm;rate=24000');

        expect(result).toEqual({ success: true });
        await vi.waitFor(() =>
            expect(relay.latest().received).toContainEqual(
                expect.objectContaining({ type: 'AUDIO', stream: 'me', data: 'AAAA', mimeType: 'audio/pcm;rate=24000', sessionId: expect.any(String) })
            )
        );
    });

    test('system audio goes to the relay on the them stream', async () => {
        await m.listenService.handleListenRequest('Listen');

        const result = await m.listenService.sttService.sendSystemAudioContent('BBBB', undefined);

        expect(result).toEqual({ success: true });
        await vi.waitFor(() =>
            expect(relay.latest().received).toContainEqual(
                expect.objectContaining({ type: 'AUDIO', stream: 'them', data: 'BBBB', mimeType: 'audio/pcm;rate=16000' })
            )
        );
    });

    test('the relay closing with 4429 stops listening and reports the audio quota', async () => {
        await m.listenService.handleListenRequest('Listen');

        relay.latest().close({ code: 4429, reason: 'quota resetAt=2026-11-29T00:00:00.000Z' });

        await vi.waitFor(() => expect(sentTo(header, 'stt:quotaExceeded')).toEqual([{ resetAt: '2026-11-29T00:00:00.000Z' }]));
        expect(lastResult()).toEqual({ success: false, nextStatus: 'beforeSession', error: 'STT_AUDIO_QUOTA_EXCEEDED' });
        expect(sentTo(listenWindow, 'stt:quotaExceeded')).toEqual([{ resetAt: '2026-11-29T00:00:00.000Z' }]);
        expect(sentTo(listenWindow, 'session-state-changed')).toContainEqual({ isActive: false, mode: 'quotaExceeded' });
        expect(sentTo(listenWindow, 'update-status')).toContain('Daily audio limit reached');
        expect(m.listenService.isSessionActive()).toBe(false);
    });

    test('the relay dropping an open connection reports a disconnect', async () => {
        await m.listenService.handleListenRequest('Listen');

        relay.latest().close({ code: 1011, reason: 'restart' });

        await vi.waitFor(() => expect(sentTo(listenWindow, 'update-status')).toContain('Relay disconnected'));
        expect(m.listenService.isSessionActive()).toBe(false);
        expect(sentTo(header, 'stt:quotaExceeded')).toEqual([]);
    });
});

describe('Live insights', () => {
    const analysisAnswer = JSON.stringify({
        sections: [
            { type: 'insights', items: ['- Budget is "tight" this quarter'] },
            { type: 'questions', items: ['Who owns the launch?'] },
            { type: 'defines', items: ['OKR (objectives and key results)'] },
            { type: 'searches', items: ['Search: market size 2026'] },
            { type: 'unknown_kind', items: ['ignored'] },
        ],
    });

    const sayTurns = async (sessionId: string, turns: string[]) => {
        for (const [index, text] of turns.entries()) {
            relay.latest().send({ type: 'PARTIAL', stream: index % 2 === 0 ? 'me' : 'them', text });
            relay.latest().send({ type: 'TURN_COMPLETE', stream: index % 2 === 0 ? 'me' : 'them' });
            await vi.waitFor(() => expect(m.sttRepository.getAllTranscriptsBySessionId(sessionId)).toHaveLength(index + 1));
        }
    };

    const turns = [
        'We need to talk about the budget for the launch',
        'Yes, the budget is tight this quarter, we should plan',
        'Then let us agree on OKR targets for the team today',
    ];

    test('after enough conversation the LLM analysis is shown in the window and saved for recovery', async () => {
        chat.mockResolvedValue({ content: analysisAnswer });
        await m.listenService.handleListenRequest('Listen');
        const sessionId = currentSessionId();

        await sayTurns(sessionId, turns);

        await vi.waitFor(() => expect(sentTo(listenWindow, 'summary-update')).toHaveLength(2));
        const [initial, analysis] = sentTo(listenWindow, 'summary-update');
        expect(initial).toEqual({ summary: [], actions: [], followUps: [], presetId: 'meetings' });
        expect(analysis).toMatchObject({
            summary: ['Budget is tight this quarter'],
            actions: ['❓ Who owns the launch?', '📘 Define OKR', '🌐 Search: market size 2026'],
            followUps: ['✉️ Draft a follow-up email', '✅ Generate action items', '📝 Show summary'],
            presetId: 'meetings',
        });

        expect(chat).toHaveBeenCalledWith(
            expect.objectContaining({
                profile: 'meeting_analysis',
                userContent: '',
                role: expect.stringContaining('You are a meeting assistant.'),
                context: { previousItems: [], transcript: turns.map((text, index) => `${index % 2 === 0 ? 'me' : 'them'}: ${text}`).join('\n') },
            })
        );

        await vi.waitFor(() => expect(m.summaryRepository.getAllInsightsBySessionId(sessionId)).toHaveLength(1));
        expect(m.summaryRepository.getAllInsightsBySessionId(sessionId)[0]).toMatchObject({
            session_id: sessionId,
            payload: {
                summary: ['Budget is tight this quarter'],
                actions: ['❓ Who owns the launch?', '📘 Define OKR', '🌐 Search: market size 2026'],
                sections: [],
            },
        });
        expect(m.summaryRepository.getSummaryBySessionId(sessionId)).toMatchObject({
            model: 'server',
            tldr: 'Budget is tight this quarter',
            action_json: JSON.stringify(['❓ Who owns the launch?', '📘 Define OKR', '🌐 Search: market size 2026']),
        });
        expect(m.listenService.getCurrentSessionData()).toMatchObject({
            totalTexts: 3,
            analysisData: { conversationLength: 3, definedTerms: [], detectedQuestions: [] },
        });
    });

    test('a non-JSON analysis answer shows the default actions', async () => {
        chat.mockResolvedValue({ content: 'I could not analyse this.' });
        await m.listenService.handleListenRequest('Listen');

        await sayTurns(currentSessionId(), turns);

        await vi.waitFor(() => expect(sentTo(listenWindow, 'summary-update')).toHaveLength(2));
        expect(sentTo(listenWindow, 'summary-update')[1]).toMatchObject({
            summary: [],
            actions: ['✨ What should I say next?', '💬 Suggest follow-up questions'],
            followUps: ['✉️ Draft a follow-up email', '✅ Generate action items', '📝 Show summary'],
        });
    });

    test('a sales preset sends the sales profile and its role, and maps sales sections', async () => {
        chat.mockResolvedValue({
            content: JSON.stringify({
                sections: [
                    { type: 'opportunities', items: ['Upsell the team plan'] },
                    { type: 'objections', items: ['Price is too high'] },
                    { type: 'follow_ups', items: ['Send pricing'] },
                ],
            }),
        });
        await m.listenService.handleListenRequest('Listen');
        const preset = await m.listenService.summaryService.setAnalysisPreset('sales');
        expect(preset).toEqual({ success: true });

        await sayTurns(currentSessionId(), turns);

        await vi.waitFor(() => expect(sentTo(listenWindow, 'summary-update')).toHaveLength(2));
        expect(chat).toHaveBeenCalledWith(
            expect.objectContaining({ profile: 'sales_analysis', role: expect.stringContaining('You are a real-time AI sales assistant') })
        );
        expect(sentTo(listenWindow, 'summary-update')[1]).toMatchObject({
            summary: ['Upsell the team plan'],
            actions: ['❗❗ Objection: Price is too high', '📈 Sales Follow-Up: Send pricing'],
            presetId: 'sales',
        });
        expect(m.listenService.summaryService.getCurrentContext()).toEqual({
            definedTerms: [],
            detectedQuestions: [],
            analysisProfile: 'sales_analysis',
            selectedPresetId: 'sales',
        });
    });

    test('an unknown preset is reported and clears the role', async () => {
        const result = await m.listenService.summaryService.setAnalysisPreset('no-such-preset');

        expect(result).toEqual({ success: false, error: 'preset_not_found' });
        expect(m.listenService.summaryService.selectedRoleText).toBe('');
    });
});

describe('Recovering a session left open by a crash', () => {
    const leaveSessionOpen = () => {
        const sessionId = m.sessionRepository.getOrCreateActive('listen');
        if (typeof sessionId !== 'string') throw new Error('No session created');
        m.sttRepository.addTranscript({ sessionId, speaker: 'Me', text: 'Before the crash we discussed hiring' });
        m.sttRepository.addTranscript({ sessionId, speaker: 'Them', text: 'And the new office' });
        m.summaryRepository.saveInsight({
            sessionId,
            analysisRound: 1,
            payload: { summary: ['Hiring plan'], actions: ['❓ When do we hire?'], followUps: [], sections: [] },
        });
        return sessionId;
    };

    test('the header is told, and Listen is blocked until the user decides', async () => {
        const sessionId = leaveSessionOpen();

        await m.listenService.bootstrapRecovery();

        expect(sentTo(header, 'listen:stranded-session-detected')).toEqual([{ id: sessionId, title: expect.any(String), started_at: expect.any(Number) }]);
        expect(m.listenService.getStrandedSessionInfo()).toMatchObject({ id: sessionId });

        await m.listenService.handleListenRequest('Listen');
        expect(lastResult()).toEqual({ success: false, nextStatus: 'beforeSession' });
        expect(relay.connections).toHaveLength(0);
    });

    test('resume reconnects and shows the saved transcript and insights again', async () => {
        const sessionId = leaveSessionOpen();
        await m.listenService.bootstrapRecovery();

        const result = await m.listenService.handleRecoveryAction('resume', sessionId);

        expect(result).toEqual({ success: true });
        expect(lastResult()).toEqual({ success: true, nextStatus: 'inSession' });
        expect(sentTo(listenWindow, 'stt-update')).toEqual([
            { speaker: 'Me', text: 'Before the crash we discussed hiring', isFinal: true, isPartial: false },
            { speaker: 'Them', text: 'And the new office', isFinal: true, isPartial: false },
        ]);
        expect(sentTo(listenWindow, 'summary-update')).toEqual([
            { summary: ['Hiring plan'], actions: ['❓ When do we hire?'], followUps: [], sections: [], presetId: null },
        ]);
        expect(m.listenService.getConversationHistory()).toEqual(['me: Before the crash we discussed hiring', 'them: And the new office']);
        expect(m.listenService.getCurrentSessionData().sessionId).toBe(sessionId);
        expect(m.listenService.getStrandedSessionInfo()).toBeNull();
        expect(m.listenService.isSessionActive()).toBe(true);
    });

    test('finalize ends the session in the background and frees Listen', async () => {
        chat.mockResolvedValue({ content: '{"title":"Hiring sync","summary":"Hiring and office."}' });
        const sessionId = leaveSessionOpen();
        await m.listenService.bootstrapRecovery();

        const result = await m.listenService.handleRecoveryAction('finalize', sessionId);

        expect(result).toEqual({ success: true });
        expect(m.listenService.getStrandedSessionInfo()).toBeNull();
        await vi.waitFor(() => expect(m.sessionRepository.getById(sessionId)?.ended_at).toEqual(expect.any(Number)));
        expect(m.sessionRepository.getById(sessionId)?.title).toBe('Hiring sync');
        expect(m.summaryRepository.getSummaryBySessionId(sessionId)).toMatchObject({ tldr: 'Hiring and office.' });
    });

    test('an action for another session is refused', async () => {
        leaveSessionOpen();
        await m.listenService.bootstrapRecovery();

        const result = await m.listenService.handleRecoveryAction('dismiss', 'other-session');

        expect(result).toEqual({ success: false, error: 'Session mismatch' });
        expect(m.listenService.getStrandedSessionInfo()).not.toBeNull();
    });
});
