const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleGenAI } = require('@google/genai');
const authService = require('../../services/authService');

class GeminiProvider {
    static async validateApiKey(key) {
        if (!key || typeof key !== 'string') {
            return { success: false, error: 'Invalid Gemini API key format.' };
        }

        try {
            const validationUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
            const response = await fetch(validationUrl);

            if (response.ok) {
                return { success: true };
            } else {
                const errorData = await response.json().catch(() => ({}));
                const message = errorData.error?.message || `Validation failed with status: ${response.status}`;
                return { success: false, error: message };
            }
        } catch (error) {
            console.error(`[GeminiProvider] Network error during key validation:`, error);
            return { success: false, error: 'A network error occurred during validation.' };
        }
    }
}

/**
 * Creates a Gemini STT session
 * @param {object} opts - Configuration options
 * @param {string} opts.apiKey - Gemini API key
 * @param {string} [opts.language='en-US'] - Language code
 * @param {object} [opts.callbacks] - Event callbacks
 * @returns {Promise<object>} STT session
 */
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

/**
 * Creates a Gemini LLM instance with proper text response handling
 */
function createLLM({ apiKey, model = 'gemini-2.5-flash-lite', temperature = 0.7, maxTokens = 4096, ...config }) {
    const baseUrl = (process.env.API_BASE_URL || 'https://www.app-whisper.com').replace(/\/$/, '');

    // Preserve multimodal content: pass through messages as-is
    const passthroughMessages = messages => messages || [];

    const callChat = async messages => {
        try {
            const hasImage = JSON.stringify(messages || []).includes('image_url') || JSON.stringify(messages || []).includes('inlineData');
            const approxBytes = (() => {
                try {
                    const img = (messages || [])
                        .flatMap(m => (Array.isArray(m?.content) ? m.content : []))
                        .find(p => p?.image_url?.url || p?.inlineData?.data);
                    const b64 = img?.image_url?.url?.split(',')[1] || img?.inlineData?.data;
                    return b64 ? b64.length : 0;
                } catch (_) {
                    return 0;
                }
            })();
            console.log(`[Gemini][chat] msgs=${messages?.length || 0} hasImage=${hasImage} imageB64Len=${approxBytes}`);
        } catch (_) {}
        const sessionUuid = authService?.getCurrentUser()?.sessionUuid || null;
        const reqId = Math.random().toString(36).slice(2, 8);
        if (!sessionUuid) {
            console.warn(`[LLM][${reqId}] Missing session UUID for chat request`);
            throw new Error('Not authenticated: missing session. Please sign in.');
        }
        console.log(`[LLM][${reqId}] POST ${baseUrl}/api/llm/chat`);
        const res = await fetch(`${baseUrl}/api/llm/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(sessionUuid ? { 'X-Session-UUID': sessionUuid } : {}),
            },
            body: JSON.stringify({
                messages: passthroughMessages(messages),
                // model, params omitted — server selects defaults
            }),
        });

        const text = await res.text();
        let data = null;
        try {
            data = JSON.parse(text);
        } catch (_) {}
        if (!res.ok || !data?.success) {
            console.error(`[LLM][${reqId}] Chat error status=${res.status} body=${text?.slice(0, 300)}`);
            const err = (data && data.error) || `${res.status} ${res.statusText}`;
            throw new Error(`LLM chat API error: ${err}`);
        }
        console.log(
            `[LLM][${reqId}] Chat OK contentPreview="${(data.content || '').slice(0, 80)}" tokens=${data.usageMetadata?.totalTokens ?? 'n/a'}`
        );
        return { content: data.content, raw: data };
    };

    return {
        // For compatibility with existing usage
        chat: async messages => callChat(messages),
        generateContent: async parts => {
            // Convert parts to a single user message
            const text = (parts || [])
                .map(p => (typeof p === 'string' ? p : p?.inlineData ? '' : ''))
                .filter(Boolean)
                .join('\n');
            return {
                response: {
                    text: async () => (await callChat([{ role: 'user', content: text }])).content,
                },
            };
        },
    };
}

/**
 * Creates a Gemini streaming LLM instance with text response fix
 */
/**
 * Creates a Gemini streaming LLM instance with FIXED response handling
 */
function createStreamingLLM({ apiKey, model = 'gemini-2.5-flash-lite', temperature = 0.7, maxTokens = 4096, ...config }) {
    const baseUrl = (process.env.API_BASE_URL || 'https://www.app-whisper.com').replace(/\/$/, '');

    // Preserve multimodal content for streaming too
    const passthroughMessages = messages => messages || [];

    return {
        streamChat: async (messages, options = {}) => {
            try {
                const hasImage = JSON.stringify(messages || []).includes('image_url') || JSON.stringify(messages || []).includes('inlineData');
                const approxBytes = (() => {
                    try {
                        const img = (messages || [])
                            .flatMap(m => (Array.isArray(m?.content) ? m.content : []))
                            .find(p => p?.image_url?.url || p?.inlineData?.data);
                        const b64 = img?.image_url?.url?.split(',')[1] || img?.inlineData?.data;
                        return b64 ? b64.length : 0;
                    } catch (_) {
                        return 0;
                    }
                })();
                console.log(`[Gemini][stream] msgs=${messages?.length || 0} hasImage=${hasImage} imageB64Len=${approxBytes}`);
            } catch (_) {}
            const signal = options.signal;
            const sessionUuid = authService?.getCurrentUser()?.sessionUuid || null;
            if (!sessionUuid) {
                throw new Error('Not authenticated: missing session. Please sign in.');
            }

            const reqId = Math.random().toString(36).slice(2, 8);
            console.log(`[LLM][${reqId}] STREAM POST ${baseUrl}/api/llm/stream`);
            try {
                const nm = passthroughMessages(messages);
                const hasImageAfterNormalize = JSON.stringify(nm).includes('image_url') || JSON.stringify(nm).includes('inlineData');
                console.log(`[LLM][${reqId}] passthroughMessages -> msgs=${nm?.length || 0} hasImage=${hasImageAfterNormalize}`);
            } catch (_) {}
            const response = await fetch(`${baseUrl}/api/llm/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(sessionUuid ? { 'X-Session-UUID': sessionUuid } : {}),
                },
                body: JSON.stringify({
                    messages: passthroughMessages(messages),
                    // model, params omitted — server selects defaults
                }),
                signal,
            });

            if (!response.ok) {
                let errBody = '';
                try {
                    errBody = await response.text();
                } catch (_) {}
                console.error(`[LLM][${reqId}] Stream error status=${response.status} body=${(errBody || '').slice(0, 300)}`);
                throw new Error(`LLM stream API error: ${response.status} ${response.statusText}`);
            }

            // FIXED: Server now sends properly formatted JSON, so just pass it through
            const reader = response.body?.getReader?.();
            if (!reader) return response; // Fallback: return as-is

            const stream = new ReadableStream({
                async start(controller) {
                    const decoder = new TextDecoder();
                    const encoder = new TextEncoder();
                    let buffer = '';
                    let count = 0;
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split(/\r?\n/);
                            buffer = lines.pop() || '';

                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (!trimmed.startsWith('data:')) continue;
                                const data = trimmed.replace(/^data:\s?/, '');
                                if (!data) continue;
                                if (data === '[DONE]') {
                                    console.log(`[LLM][${reqId}] Stream DONE`);
                                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                                    continue;
                                }
                                count++;

                                // FIXED: Server now sends JSON, so parse it to extract content for logging
                                try {
                                    const parsedData = JSON.parse(data);
                                    const content = parsedData.choices?.[0]?.delta?.content || '';

                                    if (count <= 3) {
                                        console.log(`[LLM][${reqId}] server content: "${content.slice(0, 80)}"`);
                                    } else if (count === 4) {
                                        console.log(`[LLM][${reqId}] ...(muted further stream logs)`);
                                    }

                                    // Pass through the already properly formatted JSON from server
                                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                                } catch (parseError) {
                                    // Fallback: if server sends raw text (shouldn't happen now)
                                    console.log(`[LLM][${reqId}] Raw text fallback: "${data.slice(0, 80)}"`);
                                    const payload = JSON.stringify({ choices: [{ delta: { content: data } }] });
                                    controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`[LLM][${reqId}] Stream reader error:`, error?.message || error);
                        controller.error(error);
                        return;
                    } finally {
                        console.log(`[LLM][${reqId}] Stream closed. chunks=${count}`);
                        try {
                            controller.close();
                        } catch (_) {}
                    }
                },
            });

            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    Connection: 'keep-alive',
                },
            });
        },
    };
}

module.exports = {
    GeminiProvider,
    createSTT,
    createLLM,
    createStreamingLLM,
};
