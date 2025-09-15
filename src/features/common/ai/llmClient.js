const authService = require('../services/authService');

function getBaseUrl() {
    try {
        const raw = process.env.API_BASE_URL || 'http://localhost:3000';
        return raw.replace(/\/$/, '');
    } catch (_) {
        return 'http://localhost:3000';
    }
}

async function chat(messages) {
    const baseUrl = getBaseUrl();
    const sessionUuid = authService?.getCurrentUser()?.sessionUuid || null;
    if (!sessionUuid) {
        throw new Error('Not authenticated: missing session. Please sign in.');
    }

    const res = await fetch(`${baseUrl}/api/llm/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Session-UUID': sessionUuid,
        },
        body: JSON.stringify({ messages }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
        const err = (data && data.error) || `${res.status} ${res.statusText}`;
        throw new Error(`LLM chat API error: ${err}`);
    }

    return { content: data.content, raw: data };
}

async function stream(messages, { signal } = {}) {
    const baseUrl = getBaseUrl();
    const sessionUuid = authService?.getCurrentUser()?.sessionUuid || null;
    if (!sessionUuid) {
        throw new Error('Not authenticated: missing session. Please sign in.');
    }

    const response = await fetch(`${baseUrl}/api/llm/stream`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Session-UUID': sessionUuid,
        },
        body: JSON.stringify({ messages }),
        signal,
    });

    if (!response.ok) {
        let errBody = '';
        try {
            errBody = await response.text();
        } catch (_) {}
        throw new Error(`LLM stream API error: ${response.status} ${response.statusText}`);
    }

    return response;
}

module.exports = { chat, stream };
