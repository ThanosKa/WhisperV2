const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleGenAI } = require('@google/genai');

// Best-effort extraction of web source URLs from Gemini responses
function extractSourceUrlsFromGeminiResponse(resp) {
    try {
        const urls = new Set();

        const addIfUrl = v => {
            if (!v || typeof v !== 'string') return;
            if (/^https?:\/\//i.test(v)) urls.add(v);
        };

        const scanObj = obj => {
            if (!obj || typeof obj !== 'object') return;
            for (const [k, v] of Object.entries(obj)) {
                if (k === 'uri' || k === 'url') addIfUrl(v);
                if (v && typeof v === 'object') scanObj(v);
                if (Array.isArray(v)) v.forEach(scanObj);
            }
        };

        // Known likely locations
        const candidates = resp?.candidates || [];
        for (const c of candidates) {
            // 1) citation metadata
            const citationMeta = c?.citationMetadata || c?.content?.citationMetadata || resp?.citationMetadata;
            if (citationMeta?.citationSources) {
                for (const src of citationMeta.citationSources) addIfUrl(src?.uri || src?.url);
            }

            // 2) grounding metadata variants
            const gm = c?.groundingMetadata || resp?.groundingMetadata;
            if (gm) {
                // groundingAttributions[].source.web.uri
                const atts = gm.groundingAttributions || gm.attributions || [];
                for (const a of atts) addIfUrl(a?.source?.web?.uri || a?.source?.uri || a?.web?.uri);

                // groundingChunks[].web.uri
                const chunks = gm.groundingChunks || gm.chunks || [];
                for (const ch of chunks) addIfUrl(ch?.web?.uri || ch?.uri);
            }
        }

        // Fallback deep scan for any uri/url values
        if (urls.size === 0) scanObj(resp);

        return Array.from(urls);
    } catch (_) {
        return [];
    }
}

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
 * Creates a Gemini LLM instance with proper text response handling and optional Google Search
 */
function createLLM({ apiKey, model = 'gemini-2.5-flash', temperature = 0.7, maxTokens = 8192, enableGoogleSearch = false, ...config }) {
    const client = new GoogleGenerativeAI(apiKey);

    // Configure tools array with optional Google Search
    const tools = [];
    if (enableGoogleSearch) {
        tools.push({
            googleSearch: {},
        });
    }

    return {
        generateContent: async parts => {
            const geminiModel = client.getGenerativeModel({
                model: model,
                tools: tools.length > 0 ? tools : undefined,
                generationConfig: {
                    temperature,
                    maxOutputTokens: maxTokens,
                    // Ensure we get text responses, not JSON
                    responseMimeType: 'text/plain',
                },
            });

            const systemPrompt = '';
            const userContent = [];

            for (const part of parts) {
                if (typeof part === 'string') {
                    // Don't automatically assume strings starting with "You are" are system prompts
                    // Check if it's explicitly marked as a system instruction
                    userContent.push(part);
                } else if (part.inlineData) {
                    userContent.push({
                        inlineData: {
                            mimeType: part.inlineData.mimeType,
                            data: part.inlineData.data,
                        },
                    });
                }
            }

            try {
                const result = await geminiModel.generateContent(userContent);
                const response = await result.response;

                console.log('[Gemini Provider] Non-streaming usage metadata:', response.usageMetadata);

                // If Google Search was enabled, attempt to log web source URLs
                if (tools.length > 0) {
                    const urls = extractSourceUrlsFromGeminiResponse(response);
                    if (urls.length > 0) {
                        console.log('[Gemini Web Search Sources]', urls);
                    } else {
                        console.log('[Gemini Web Search Sources] No explicit sources found');
                    }
                }

                // Return plain text, not wrapped in JSON structure
                return {
                    response: {
                        text: () => response.text(),
                    },
                };
            } catch (error) {
                console.error('Gemini API error:', error);
                throw error;
            }
        },

        chat: async messages => {
            // Filter out any system prompts that might be causing JSON responses
            let systemInstruction = '';
            const history = [];
            let lastMessage;

            messages.forEach((msg, index) => {
                if (msg.role === 'system') {
                    // Clean system instruction - avoid JSON formatting requests
                    systemInstruction = msg.content
                        .replace(/respond in json/gi, '')
                        .replace(/format.*json/gi, '')
                        .replace(/return.*json/gi, '');

                    // Add explicit instruction for natural text
                    if (!systemInstruction.includes('respond naturally')) {
                        systemInstruction += '\n\nRespond naturally in plain text, not in JSON or structured format.';
                    }
                    return;
                }

                const role = msg.role === 'user' ? 'user' : 'model';

                if (index === messages.length - 1) {
                    lastMessage = msg;
                } else {
                    history.push({ role, parts: [{ text: msg.content }] });
                }
            });

            const geminiModel = client.getGenerativeModel({
                model: model,
                tools: tools.length > 0 ? tools : undefined,
                systemInstruction:
                    systemInstruction ||
                    'Respond naturally in plain text format. Do not use JSON or structured responses unless specifically requested.',
                generationConfig: {
                    temperature: temperature,
                    maxOutputTokens: maxTokens,
                    // Force plain text responses
                    responseMimeType: 'text/plain',
                },
            });

            const chat = geminiModel.startChat({
                history: history,
            });

            let content = lastMessage.content;

            // Handle multimodal content
            if (Array.isArray(content)) {
                const geminiContent = [];
                for (const part of content) {
                    if (typeof part === 'string') {
                        geminiContent.push(part);
                    } else if (part.type === 'text') {
                        geminiContent.push(part.text);
                    } else if (part.type === 'image_url' && part.image_url) {
                        const base64Data = part.image_url.url.split(',')[1];
                        geminiContent.push({
                            inlineData: {
                                mimeType: 'image/png',
                                data: base64Data,
                            },
                        });
                    }
                }
                content = geminiContent;
            }

            const result = await chat.sendMessage(content);
            const response = await result.response;

            console.log('[Gemini Provider] Chat usage metadata:', response.usageMetadata);

            // Return plain text content
            return {
                content: response.text(),
                raw: result,
            };
        },
    };
}

/**
 * Creates a Gemini streaming LLM instance with text response fix and optional Google Search
 */
function createStreamingLLM({ apiKey, model = 'gemini-2.5-flash', temperature = 0.7, maxTokens = 8192, enableGoogleSearch = false, ...config }) {
    const client = new GoogleGenerativeAI(apiKey);

    // Configure tools array with optional Google Search
    const tools = [];
    if (enableGoogleSearch) {
        tools.push({
            googleSearch: {},
        });
    }

    return {
        streamChat: async (messages, options = {}) => {
            const signal = options.signal;

            console.log('[Gemini Provider] Starting streaming request' + (enableGoogleSearch ? ' with Google Search' : ''));

            let systemInstruction = '';
            const nonSystemMessages = [];

            for (const msg of messages) {
                if (msg.role === 'system') {
                    // Clean and modify system instruction
                    systemInstruction = msg.content
                        .replace(/respond in json/gi, '')
                        .replace(/format.*json/gi, '')
                        .replace(/return.*json/gi, '');

                    if (!systemInstruction.includes('respond naturally')) {
                        systemInstruction += '\n\nRespond naturally in plain text, not in JSON or structured format.';
                    }
                } else {
                    nonSystemMessages.push(msg);
                }
            }

            const geminiModel = client.getGenerativeModel({
                model: model,
                tools: tools.length > 0 ? tools : undefined,
                systemInstruction:
                    systemInstruction ||
                    'Respond naturally in plain text format. Do not use JSON or structured responses unless specifically requested.',
                generationConfig: {
                    temperature,
                    maxOutputTokens: maxTokens || 8192,
                    // Force plain text responses
                    responseMimeType: 'text/plain',
                },
            });

            const stream = new ReadableStream({
                async start(controller) {
                    try {
                        const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];
                        let geminiContent = [];

                        if (Array.isArray(lastMessage.content)) {
                            for (const part of lastMessage.content) {
                                if (typeof part === 'string') {
                                    geminiContent.push(part);
                                } else if (part.type === 'text') {
                                    geminiContent.push(part.text);
                                } else if (part.type === 'image_url' && part.image_url) {
                                    const base64Data = part.image_url.url.split(',')[1];
                                    geminiContent.push({
                                        inlineData: {
                                            mimeType: 'image/png',
                                            data: base64Data,
                                        },
                                    });
                                }
                            }
                        } else {
                            geminiContent = [lastMessage.content];
                        }

                        const contentParts = geminiContent.map(part => {
                            if (typeof part === 'string') {
                                return { text: part };
                            } else if (part.inlineData) {
                                return { inlineData: part.inlineData };
                            }
                            return part;
                        });

                        const result = await geminiModel.generateContentStream({
                            contents: [
                                {
                                    role: 'user',
                                    parts: contentParts,
                                },
                            ],
                        });

                        for await (const chunk of result.stream) {
                            if (signal?.aborted) {
                                console.log('[Gemini Provider] Stream aborted by signal.');
                                break;
                            }
                            const chunkText = chunk.text() || '';

                            // Format as SSE data - this should now be plain text
                            const data = JSON.stringify({
                                choices: [
                                    {
                                        delta: {
                                            content: chunkText,
                                        },
                                    },
                                ],
                            });
                            try {
                                controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
                            } catch (e) {
                                if (e.name === 'TypeError') {
                                    // Stream was probably closed.
                                    console.log('[Gemini Provider] Stream closed, cannot enqueue.');
                                    break;
                                }
                                throw e;
                            }
                        }

                        if (!signal?.aborted) {
                            try {
                                const finalResponse = await result.response;
                                if (finalResponse.usageMetadata) {
                                    console.log('[Gemini Provider] Streaming usage metadata:', finalResponse.usageMetadata);
                                }
                                // If Google Search was enabled, attempt to log web source URLs
                                if (tools.length > 0) {
                                    const urls = extractSourceUrlsFromGeminiResponse(finalResponse);
                                    if (urls.length > 0) {
                                        console.log('[Gemini Web Search Sources]', urls);
                                    } else {
                                        console.log('[Gemini Web Search Sources] No explicit sources found');
                                    }
                                }
                            } catch (e) {
                                console.error('[Gemini Provider] Error getting usage metadata/sources after stream:', e);
                            }
                            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                            controller.close();
                        }
                    } catch (error) {
                        console.error('[Gemini Provider] Streaming error:', error);
                        controller.error(error);
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
