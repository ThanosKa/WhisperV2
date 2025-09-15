const { EventEmitter } = require('events');
const Store = require('electron-store');
const { PROVIDERS, getProviderClass } = require('../ai/factory');
const encryptionService = require('./encryptionService');
const providerSettingsRepository = require('../repositories/providerSettings');
const authService = require('./authService');

class ModelStateService extends EventEmitter {
    constructor() {
        super();
        this.authService = authService;
        // electron-store is used exclusively for legacy data migration purposes.
        this.store = new Store({ name: 'pickle-glass-model-state' });
    }

    async initialize() {
        console.log('[ModelStateService] Initializing one-time setup...');
        await this._initializeEncryption();
        await this._runMigrations();

        // Load API keys from .env file.
        // LLM via Gemini uses server (no local key), but STT still requires provider keys.
        if (process.env.GEMINI_API_KEY) {
            await this.setApiKey('gemini', process.env.GEMINI_API_KEY);
        }

        await this._autoSelectAvailableModels([], true);
        console.log('[ModelStateService] One-time setup complete.');
    }

    async _initializeEncryption() {
        try {
            const rows = await providerSettingsRepository.getRawApiKeys();
            if (rows.some(r => r.api_key && encryptionService.looksEncrypted(r.api_key))) {
                console.log('[ModelStateService] Encrypted keys detected, initializing encryption...');
                const userIdForMigration = this.authService.getCurrentUserId();
                await encryptionService.initializeKey(userIdForMigration);
            } else {
                console.log('[ModelStateService] No encrypted keys detected, skipping encryption initialization.');
            }
        } catch (err) {
            console.warn('[ModelStateService] Error while checking encrypted keys:', err.message);
        }
    }

    async _runMigrations() {
        console.log('[ModelStateService] Checking for data migrations...');
        const userId = this.authService.getCurrentUserId();

        try {
            const sqliteClient = require('./sqliteClient');
            const db = sqliteClient.getDb();
            const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_model_selections'").get();

            if (tableExists) {
                const selections = db.prepare('SELECT * FROM user_model_selections WHERE uid = ?').get(userId);
                if (selections) {
                    console.log('[ModelStateService] Migrating from user_model_selections table...');
                    if (selections.llm_model) {
                        const llmProvider = this.getProviderForModel(selections.llm_model, 'llm');
                        if (llmProvider) {
                            await this.setSelectedModel('llm', selections.llm_model);
                        }
                    }
                    if (selections.stt_model) {
                        const sttProvider = this.getProviderForModel(selections.stt_model, 'stt');
                        if (sttProvider) {
                            await this.setSelectedModel('stt', selections.stt_model);
                        }
                    }
                    db.prepare('DROP TABLE user_model_selections').run();
                    console.log('[ModelStateService] user_model_selections migration complete.');
                }
            }
        } catch (error) {
            console.error('[ModelStateService] user_model_selections migration failed:', error);
        }

        try {
            const legacyData = this.store.get(`users.${userId}`);
            if (legacyData && legacyData.apiKeys) {
                console.log('[ModelStateService] Migrating from electron-store...');
                for (const [provider, apiKey] of Object.entries(legacyData.apiKeys)) {
                    if (apiKey && PROVIDERS[provider]) {
                        await this.setApiKey(provider, apiKey);
                    }
                }
                if (legacyData.selectedModels?.llm) {
                    await this.setSelectedModel('llm', legacyData.selectedModels.llm);
                }
                if (legacyData.selectedModels?.stt) {
                    await this.setSelectedModel('stt', legacyData.selectedModels.stt);
                }
                this.store.delete(`users.${userId}`);
                console.log('[ModelStateService] electron-store migration complete.');
            }
        } catch (error) {
            console.error('[ModelStateService] electron-store migration failed:', error);
        }
    }

    async getLiveState() {
        const providerSettings = await providerSettingsRepository.getAll();
        const apiKeys = {};
        Object.keys(PROVIDERS).forEach(provider => {
            const setting = providerSettings.find(s => s.provider === provider);
            apiKeys[provider] = setting?.api_key || null;
        });

        const activeSettings = await providerSettingsRepository.getActiveSettings();
        const selectedModels = {
            llm: activeSettings.llm?.selected_llm_model || null,
            stt: activeSettings.stt?.selected_stt_model || null,
        };

        return { apiKeys, selectedModels };
    }

    async _autoSelectAvailableModels(forceReselectionForTypes = [], isInitialBoot = false) {
        console.log(`[ModelStateService] Running auto-selection. Force re-selection for: [${forceReselectionForTypes.join(', ')}]`);
        const { selectedModels } = await this.getLiveState();
        const types = ['llm', 'stt'];

        for (const type of types) {
            const currentModelId = selectedModels[type];
            let isCurrentModelValid = false;
            const forceReselection = forceReselectionForTypes.includes(type);

            if (currentModelId && !forceReselection) {
                const provider = this.getProviderForModel(currentModelId, type);
                // For LLM: Gemini no longer requires a key (server-backed). For STT still require Gemini key.
                const apiKey = process.env.GEMINI_API_KEY;
                if (provider && (type === 'llm' ? true : !!apiKey)) {
                    isCurrentModelValid = true;
                }
            }

            if (!isCurrentModelValid) {
                console.log(`[ModelStateService] No valid ${type.toUpperCase()} model selected or selection forced. Finding an alternative...`);
                const availableModels = await this.getAvailableModels(type);
                if (availableModels.length > 0) {
                    const newModel = availableModels[0];
                    await this.setSelectedModel(type, newModel.id);
                    console.log(`[ModelStateService] Auto-selected ${type.toUpperCase()} model: ${newModel.id}`);
                } else {
                    await providerSettingsRepository.setActiveProvider(null, type);
                    if (!isInitialBoot) {
                        this.emit('state-updated', await this.getLiveState());
                    }
                }
            }
        }
    }

    async setApiKey(provider, key) {
        console.log(`[ModelStateService] setApiKey for ${provider}`);
        if (!provider) {
            throw new Error('Provider is required');
        }

        const validationResult = await this.validateApiKey(provider, key);
        if (!validationResult.success) {
            console.warn(`[ModelStateService] API key validation failed for ${provider}: ${validationResult.error}`);
            return validationResult;
        }

        // --- MODIFIED: Save a placeholder to the DB, NEVER the actual key. ---
        const existingSettings = (await providerSettingsRepository.getByProvider(provider)) || {};
        await providerSettingsRepository.upsert(provider, { ...existingSettings, api_key: 'loaded_from_env' });
        // ---

        // Key has been added/changed, so check if we can auto-select models for this provider
        await this._autoSelectAvailableModels([]);

        this.emit('state-updated', await this.getLiveState());
        this.emit('settings-updated');
        return { success: true };
    }

    async getAllApiKeys() {
        const allSettings = await providerSettingsRepository.getAll();
        const apiKeys = {};
        allSettings.forEach(s => {
            apiKeys[s.provider] = s.api_key;
        });
        return apiKeys;
    }

    async removeApiKey(provider) {
        const setting = await providerSettingsRepository.getByProvider(provider);
        if (setting && setting.api_key) {
            await providerSettingsRepository.upsert(provider, { ...setting, api_key: null });
            await this._autoSelectAvailableModels(['llm', 'stt']);
            this.emit('state-updated', await this.getLiveState());
            this.emit('settings-updated');
            return true;
        }
        return false;
    }

    /**
     * Checks if the user is logged in with Firebase.
     */
    isLoggedInWithFirebase() {
        return this.authService.getCurrentUser().isLoggedIn;
    }

    /**
     * Checks if at least one valid API key is configured.
     */
    async hasValidApiKey() {
        if (this.isLoggedInWithFirebase()) return true;

        const allSettings = await providerSettingsRepository.getAll();
        return allSettings.some(s => s.api_key && s.api_key.trim().length > 0);
    }

    getProviderForModel(arg1, arg2) {
        // Compatibility: support both (type, modelId) old order and (modelId, type) new order
        let type, modelId;
        if (arg1 === 'llm' || arg1 === 'stt') {
            type = arg1;
            modelId = arg2;
        } else {
            modelId = arg1;
            type = arg2;
        }
        if (!modelId || !type) return null;
        for (const providerId in PROVIDERS) {
            const models = type === 'llm' ? PROVIDERS[providerId].llmModels : PROVIDERS[providerId].sttModels;
            if (models && models.some(m => m.id === modelId)) {
                return providerId;
            }
        }
        return null;
    }

    async getSelectedModels() {
        const active = await providerSettingsRepository.getActiveSettings();
        return {
            llm: active.llm?.selected_llm_model || null,
            stt: active.stt?.selected_stt_model || null,
        };
    }

    async setSelectedModel(type, modelId) {
        const provider = this.getProviderForModel(modelId, type);
        if (!provider) {
            console.warn(`[ModelStateService] No provider found for model ${modelId}`);
            return false;
        }

        const existingSettings = (await providerSettingsRepository.getByProvider(provider)) || {};
        const newSettings = { ...existingSettings };

        if (type === 'llm') {
            newSettings.selected_llm_model = modelId;
        } else {
            newSettings.selected_stt_model = modelId;
        }

        await providerSettingsRepository.upsert(provider, newSettings);
        await providerSettingsRepository.setActiveProvider(provider, type);

        console.log(`[ModelStateService] Selected ${type} model: ${modelId} (provider: ${provider})`);

        this.emit('state-updated', await this.getLiveState());
        this.emit('settings-updated');
        return true;
    }

    async getAvailableModels(type) {
        const available = [];
        const modelListKey = type === 'llm' ? 'llmModels' : 'sttModels';

        for (const providerId in PROVIDERS) {
            const hasModels = PROVIDERS[providerId]?.[modelListKey]?.length > 0;
            if (!hasModels) continue;

            if (type === 'llm') {
                // LLM: Gemini is always available (server-backed).
                if (providerId === 'gemini') {
                    available.push(...PROVIDERS[providerId][modelListKey]);
                }
            } else {
                // STT: require Gemini key
                const apiKey = process.env.GEMINI_API_KEY;
                if (providerId === 'gemini' && apiKey) available.push(...PROVIDERS[providerId][modelListKey]);
            }
        }

        return [...new Map(available.map(item => [item.id, item])).values()];
    }

    async getCurrentModelInfo(type) {
        const activeSetting = await providerSettingsRepository.getActiveProvider(type);
        if (!activeSetting) return null;

        const model = type === 'llm' ? activeSetting.selected_llm_model : activeSetting.selected_stt_model;
        if (!model) return null;

        // Read keys from env.
        // LLM: Gemini uses server and needs no key; STT: Gemini requires GEMINI_API_KEY.
        let apiKey = null;
        if (activeSetting.provider === 'gemini') {
            apiKey = type === 'stt' ? process.env.GEMINI_API_KEY : null;
        }
        // ---

        return {
            provider: activeSetting.provider,
            model: model,
            apiKey: apiKey, // Use the key from .env
        };
    }

    // --- Handler and utility methods ---

    async validateApiKey(provider, key) {
        if (!key || key.trim() === '') {
            return { success: false, error: 'API key cannot be empty.' };
        }
        const ProviderClass = getProviderClass(provider);
        if (!ProviderClass || typeof ProviderClass.validateApiKey !== 'function') {
            return { success: true };
        }
        try {
            return await ProviderClass.validateApiKey(key);
        } catch (error) {
            return { success: false, error: 'An unexpected error occurred during validation.' };
        }
    }

    getProviderConfig() {
        const config = {};
        for (const key in PROVIDERS) {
            const { handler, ...rest } = PROVIDERS[key];
            config[key] = rest;
        }
        return config;
    }

    async handleRemoveApiKey(provider) {
        const success = await this.removeApiKey(provider);
        if (success) {
            const selectedModels = await this.getSelectedModels();
            // Removed force-show-apikey-header emission (no ApiKey UI)
        }
        return success;
    }

    /*-------------- Compatibility Helpers --------------*/
    async handleValidateKey(provider, key) {
        return await this.setApiKey(provider, key);
    }

    async handleSetSelectedModel(type, modelId) {
        return await this.setSelectedModel(type, modelId);
    }

    async areProvidersConfigured() {
        // LLM is considered configured if either OpenAI key exists or Gemini server mode is available (always on client side).
        const llmConfigured = true; // Gemini server-backed path

        // STT requires Gemini key presence
        const sttConfigured = !!process.env.GEMINI_API_KEY;

        return llmConfigured && sttConfigured;
    }
}

const modelStateService = new ModelStateService();
module.exports = modelStateService;
