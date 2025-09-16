const authService = require('../services/authService');

function getBaseUrl() {
    try {
        const raw = process.env.API_BASE_URL || 'http://localhost:3000';
        return raw.replace(/\/$/, '');
    } catch (_) {
        return 'http://localhost:3000';
    }
}

async function getRelayUrl() {
    const sessionUuid = authService?.getCurrentUser()?.sessionUuid;
    if (!sessionUuid) throw new Error('Not authenticated');

    const res = await fetch(`${getBaseUrl()}/api/stt/token`, {
        method: 'POST',
        headers: { 'X-Session-UUID': sessionUuid },
    });

    if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Failed to fetch relay URL: ${res.status} ${res.statusText} - ${errorText}`);
    }

    const data = await res.json();
    if (!data.relayUrl) {
        throw new Error('Invalid response: missing relayUrl');
    }

    return data.relayUrl; // ws://localhost:8080 or wss://relay.fly.dev
}

module.exports = { getRelayUrl };
