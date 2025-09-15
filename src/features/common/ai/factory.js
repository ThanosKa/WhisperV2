// factory.js - Simplified

const PROVIDERS = {
    gemini: {
        name: 'Gemini',
        handler: () => require('./providers/gemini'),
        llmModels: [{ id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash' }],
        sttModels: [{ id: 'gemini-live-2.5-flash-preview', name: 'Gemini Live 2.5 Flash' }],
    },
};

function sanitizeModelId(model) {
    return typeof model === 'string' ? model.replace(/-glass$/, '') : model;
}

function createSTT(provider, opts) {
    // Only Gemini STT supported
    if (provider !== 'gemini') {
        throw new Error(`STT not supported for provider: ${provider}`);
    }

    const handler = PROVIDERS[provider]?.handler();
    if (!handler?.createSTT) {
        throw new Error(`STT not supported for provider: ${provider}`);
    }

    if (opts && opts.model) {
        opts = { ...opts, model: sanitizeModelId(opts.model) };
    }
    return handler.createSTT(opts);
}

// LLM creation removed; server-backed only

function getProviderClass(providerId) {
    // Only Gemini provider supported
    if (providerId !== 'gemini') return null;

    const providerConfig = PROVIDERS[providerId];
    if (!providerConfig) return null;

    const module = providerConfig.handler();
    return module.GeminiProvider || null;
}

function getAvailableProviders() {
    return { stt: ['gemini'], llm: ['gemini'] };
}

module.exports = {
    PROVIDERS,
    createSTT,
    getProviderClass,
    getAvailableProviders,
};
