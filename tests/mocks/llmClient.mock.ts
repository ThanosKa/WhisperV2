const defaultHeaders = new Map([
    ['x-ratelimit-limit', '100'],
    ['x-ratelimit-used', '10'],
    ['x-ratelimit-remaining', '90'],
]);

const encoded = text => {
    const encoder = new TextEncoder();
    return encoder.encode(text);
};

const createStreamReader = () => {
    const read = jest
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
const createSearchStreamReader = events => {
    const eventQueue = events.map(event => ({
        done: false,
        value: encoded(event),
    }));
    eventQueue.push({ done: true, value: undefined });

    let index = 0;
    return {
        read: jest.fn(async () => eventQueue[index++] || { done: true }),
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

const stream = jest.fn(async () => ({
    headers: defaultHeaders,
    body: {
        getReader: () => createStreamReader(),
    },
}));

const chat = jest.fn(async payload => ({
    content: `Mock response for ${payload?.profile || 'unknown'}`,
    raw: { success: true },
}));

module.exports = {
    stream,
    chat,
    createSearchStreamReader,
    createSimpleSearchStream,
    createSequentialSearchStream,
    __resetMocks: () => {
        stream.mockClear();
        chat.mockClear();
    },
};
