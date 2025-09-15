// factory.js

/**
 * @typedef {object} ModelOption
 * @property {string} id
 * @property {string} name
 */

/**
 * @typedef {object} Provider
 * @property {string} name
 * @property {() => any} handler
 * @property {ModelOption[]} llmModels
 * @property {ModelOption[]} sttModels
 */

/**
 * @type {Object.<string, Provider>}
 */
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
    const handler = PROVIDERS[provider]?.handler();
    if (!handler?.createSTT) {
        throw new Error(`STT not supported for provider: ${provider}`);
    }
    if (opts && opts.model) {
        opts = { ...opts, model: sanitizeModelId(opts.model) };
    }
    return handler.createSTT(opts);
}

function createLLM(provider, opts) {
    const handler = PROVIDERS[provider]?.handler();
    if (!handler?.createLLM) {
        throw new Error(`LLM not supported for provider: ${provider}`);
    }
    if (opts && opts.model) {
        opts = { ...opts, model: sanitizeModelId(opts.model) };
    }
    return handler.createLLM(opts);
}

function createStreamingLLM(provider, opts) {
    const handler = PROVIDERS[provider]?.handler();
    if (!handler?.createStreamingLLM) {
        throw new Error(`Streaming LLM not supported for provider: ${provider}`);
    }
    if (opts && opts.model) {
        opts = { ...opts, model: sanitizeModelId(opts.model) };
    }
    return handler.createStreamingLLM(opts);
}

function getProviderClass(providerId) {
    const providerConfig = PROVIDERS[providerId];
    if (!providerConfig) return null;

    // The handler function returns the module, from which we get the class.
    const module = providerConfig.handler();

    // Map provider IDs to their actual exported class names
    const classNameMap = {
        gemini: 'GeminiProvider',
    };

    const className = classNameMap[providerId];
    return className ? module[className] : null;
}

function getAvailableProviders() {
    const stt = [];
    const llm = [];
    for (const [id, provider] of Object.entries(PROVIDERS)) {
        if (provider.sttModels.length > 0) stt.push(id);
        if (provider.llmModels.length > 0) llm.push(id);
    }
    return { stt: [...new Set(stt)], llm: [...new Set(llm)] };
}

module.exports = {
    PROVIDERS,
    createSTT,
    createLLM,
    createStreamingLLM,
    getProviderClass,
    getAvailableProviders,
};
