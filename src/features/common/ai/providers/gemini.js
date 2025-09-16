const { getRelayUrl } = require('../sttToken');

// Stub class for factory compatibility - STT is now WebSocket-based
class GeminiProvider {}

async function createSTT({ apiKey, language = 'en-US', callbacks = {}, ...config }) {
    // apiKey is ignored – we connect to relay instead
    const relayUrl = await getRelayUrl();
    const WebSocket = require('ws');
    const socket = new WebSocket(relayUrl);

    socket.on('open', () => {
        console.log('[Gemini STT] Connected to relay:', relayUrl);
        // Send the same setup object Gemini expects
        socket.send(
            JSON.stringify({
                setup: {
                    model: 'gemini-live-2.5-flash-preview',
                    language: language.includes('-') ? language : `${language}-US`,
                },
            })
        );
    });

    socket.on('message', raw => {
        try {
            const msg = JSON.parse(raw);

            // Handle relay status notices (don't forward to app)
            if (msg._relayNotice) {
                console.log('[Gemini STT] Relay notice:', msg._relayNotice);
                return;
            }

            console.log('[Gemini STT Message]:', msg);
            msg.provider = 'gemini';
            callbacks.onmessage?.(msg);
        } catch (error) {
            console.error('[Gemini STT] Failed to parse message:', error, 'Raw:', raw);
        }
    });

    socket.on('error', e => {
        console.error('[Gemini STT] Socket error:', e);
        callbacks.onerror?.(e);
    });

    socket.on('close', () => {
        console.log('[Gemini STT] Connection closed');
        callbacks.onclose?.();
    });

    return {
        sendRealtimeInput: async payload => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(payload));
            } else {
                console.warn('[Gemini STT] Socket not ready, cannot send payload');
            }
        },
        close: async () => {
            if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                socket.close();
            }
        },
    };
}

module.exports = {
    GeminiProvider,
    createSTT,
};
