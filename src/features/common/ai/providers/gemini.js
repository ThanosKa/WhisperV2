const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleGenAI } = require('@google/genai');

class GeminiProvider {}

async function createSTT({ apiKey, language = 'en-US', callbacks = {}, ...config }) {
    const liveClient = new GoogleGenAI({ vertexai: false, apiKey });

    // Language code BCP-47 conversion
    const lang = language.includes('-') ? language : `${language}-US`;

    const session = await liveClient.live.connect({
        model: 'gemini-live-2.5-flash-preview',
        callbacks: {
            ...callbacks,
            onMessage: msg => {
                if (!msg || typeof msg !== 'object') return;
                console.log('[Gemini STT Message]:', msg);
                msg.provider = 'gemini';
                callbacks.onmessage?.(msg);
            },
        },

        config: {
            inputAudioTranscription: {},
            speechConfig: { languageCode: lang },
        },
    });

    return {
        sendRealtimeInput: async payload => session.sendRealtimeInput(payload),
        close: async () => session.close(),
    };
}

module.exports = {
    GeminiProvider,
    createSTT,
};
