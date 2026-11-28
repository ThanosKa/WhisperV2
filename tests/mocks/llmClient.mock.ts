import { vi } from 'vitest';

type StreamReader = { read: () => Promise<{ done: boolean; value?: Uint8Array | undefined }> };

export type StreamResponse = {
    headers: Map<string, string>;
    body: { getReader: () => StreamReader };
};

// What the code under test sends to `llmClient.stream`; only the fields the tests read.
export type StreamPayload = {
    profile: string;
    role?: string;
    userContent?: string;
    forceSearch?: boolean;
    context: { transcript: string; previousItems: string[] };
};

const defaultHeaders = new Map([
    ['x-ratelimit-limit', '100'],
    ['x-ratelimit-used', '10'],
    ['x-ratelimit-remaining', '90'],
]);

const encoded = (text: string) => {
    const encoder = new TextEncoder();
    return encoder.encode(text);
};

const createStreamReader = (): StreamReader => {
    const read = vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: encoded('data: {"choices":[{"delta":{"content":"Hello"}}]}\n') })
        .mockResolvedValueOnce({ done: false, value: encoded('data: {"choices":[{"delta":{"content":" world"}}]}\n') })
        .mockResolvedValueOnce({ done: false, value: encoded('data: [DONE]\n') })
        .mockResolvedValue({ done: true, value: undefined });

    return {
        read,
    };
};

// Flexible stream reader factory for search events
const createSearchStreamReader = (events: string[]): StreamReader => {
    const eventQueue: { done: boolean; value: Uint8Array | undefined }[] = events.map(event => ({
        done: false,
        value: encoded(event),
    }));
    eventQueue.push({ done: true, value: undefined });

    let index = 0;
    return {
        read: vi.fn(async () => eventQueue[index++] || { done: true }),
    };
};

// Simple search SSE stream (status → query → content → citations)
const createSimpleSearchStream = () =>
    createSearchStreamReader([
        'data: {"status":"searching"}\n',
        'data: {"status":"searching","query":"test query"}\n',
        'data: {"choices":[{"delta":{"content":"Result text"}}]}\n',
        'data: {"citations":[{"url":"https://example.com","title":"Example"}]}\n',
        'data: [DONE]\n',
    ]);

// Sequential search stream (ReAct loop: search → content → search → content)
const createSequentialSearchStream = () =>
    createSearchStreamReader([
        'data: {"status":"searching","query":"TSLA stock"}\n',
        'data: {"choices":[{"delta":{"content":"Tesla at $481. "}}]}\n',
        'data: {"status":"searching","query":"Tesla AI news"}\n',
        'data: {"choices":[{"delta":{"content":"Tesla announced..."}}]}\n',
        'data: {"citations":[{"url":"https://a.com","title":"Source A"}]}\n',
        'data: [DONE]\n',
    ]);

const createLlmClientMock = () => ({
    stream: vi.fn(async (_request?: { payload: StreamPayload; signal?: AbortSignal }): Promise<StreamResponse> => ({
        headers: defaultHeaders,
        body: {
            getReader: () => createStreamReader(),
        },
    })),
    chat: vi.fn(async (payload?: { profile?: string }) => ({
        content: `Mock response for ${payload?.profile || 'unknown'}`,
    })),
});

// Tests call `vi.resetModules()`, which would give this file a second copy of `stream`. Keeping
// one on `globalThis` means the code under test and the test assert on the same function.
declare global {
    var __whisperLlmClientMock: ReturnType<typeof createLlmClientMock> | undefined;
}

const llmClientMock = (globalThis.__whisperLlmClientMock ??= createLlmClientMock());

export const { stream, chat } = llmClientMock;

export const firstStreamPayload = (): StreamPayload => {
    const [request] = stream.mock.calls[0] ?? [];
    const payload = request?.payload;
    if (!payload) throw new Error('llmClient.stream was not called');
    return payload;
};

export { createSearchStreamReader, createSimpleSearchStream, createSequentialSearchStream };
