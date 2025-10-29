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
    __resetMocks: () => {
        stream.mockClear();
        chat.mockClear();
    },
};
