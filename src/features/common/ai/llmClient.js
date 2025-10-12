const authService = require('../services/authService');

function getBaseUrl() {
    try {
        const raw = process.env.API_BASE_URL || 'http://localhost:3000';
        return raw.replace(/\/$/, '');
    } catch (_) {
        return 'http://localhost:3000';
    }
}

async function chat(payload) {
    const baseUrl = getBaseUrl();
    const sessionUuid = authService.sessionUuid || null; // Direct access
    if (!sessionUuid) {
        throw new Error('Not authenticated: missing session. Please sign in.');
    }

    // Validate new payload format
    if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid payload: must be an object');
    }
    if (!payload.profile) {
        throw new Error('Invalid payload: missing required field "profile"');
    }
    // userContent is optional for analysis profiles and comprehensive_summary
    const requiresUserContent = payload.profile && !payload.profile.endsWith('_analysis') && payload.profile !== 'comprehensive_summary';
    if (requiresUserContent && (payload.userContent === undefined || payload.userContent === null)) {
        throw new Error('Invalid payload: missing required field "userContent"');
    }

    const res = await fetch(`${baseUrl}/api/llm/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Session-UUID': sessionUuid,
        },
        body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
        const err = (data && data.error) || `${res.status} ${res.statusText}`;
        throw new Error(`LLM chat API error: ${err}`);
    }

    return { content: data.content, raw: data };
}

async function stream(payload, { signal } = {}) {
    const baseUrl = getBaseUrl();
    const sessionUuid = authService.sessionUuid || null; // Direct access
    if (!sessionUuid) {
        throw new Error('Not authenticated: missing session. Please sign in.');
    }

    // Validate new payload format
    if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid payload: must be an object');
    }
    if (!payload.profile) {
        throw new Error('Invalid payload: missing required field "profile"');
    }
    // userContent is optional for analysis profiles and comprehensive_summary
    const requiresUserContent = payload.profile && !payload.profile.endsWith('_analysis') && payload.profile !== 'comprehensive_summary';
    if (requiresUserContent && (payload.userContent === undefined || payload.userContent === null)) {
        throw new Error('Invalid payload: missing required field "userContent"');
    }

    const response = await fetch(`${baseUrl}/api/llm/stream`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Session-UUID': sessionUuid,
        },
        body: JSON.stringify(payload),
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
