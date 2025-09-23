const { EventEmitter } = require('events');
const Store = require('electron-store');
const encryptionService = require('./encryptionService');
const providerSettingsRepository = require('../repositories/providerSettings');
const authService = require('./authService');

// Local provider configuration (client-side) — STT is server-backed via relay
const LOCAL_PROVIDERS = {
    gemini: {
        name: 'Gemini',
        sttModels: [{ id: 'gemini-live-2.5-flash-preview', name: 'Gemini Live 2.5 Flash' }],
    },
};

class ModelStateService extends EventEmitter {
    constructor() {
        super();
        this.authService = authService;
        this.store = new Store({ name: 'pickle-glass-model-state' });
    }

    async initialize() {
        console.log('[ModelStateService] Initializing one-time setup...');
        await this._initializeEncryption();
        await this._runMigrations();

        // Load API keys from .env file if they exist
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
                    // Only migrate Gemini keys
                    if (apiKey && provider === 'gemini') {
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
        // Only include Gemini provider
        const setting = providerSettings.find(s => s.provider === 'gemini');
        if (setting) {
            apiKeys['gemini'] = setting.api_key || null;
        }

        const activeSettings = await providerSettingsRepository.getActiveSettings();
        const selectedModels = {
            llm: null, // LLM selection removed (server-backed)
            stt: activeSettings.stt?.selected_stt_model || null,
        };

        return { apiKeys, selectedModels };
    }

    async _autoSelectAvailableModels(forceReselectionForTypes = [], isInitialBoot = false) {
        console.log(`[ModelStateService] Running auto-selection. Force re-selection for: [${forceReselectionForTypes.join(', ')}]`);
        const { selectedModels } = await this.getLiveState();
        const types = ['stt']; // LLM removed from client selection

        for (const type of types) {
            const currentModelId = selectedModels[type];
            let isCurrentModelValid = false;
            const forceReselection = forceReselectionForTypes.includes(type);

            if (currentModelId && !forceReselection) {
                const provider = this.getProviderForModel(currentModelId, type);
                // For LLM: Gemini no longer requires a key (server-backed). For STT still require key.
                const apiKey = process.env.GEMINI_API_KEY;
                if (provider === 'gemini' && !!apiKey) {
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
        // Only allow Gemini provider
        if (provider !== 'gemini') {
            return { success: false, error: 'Only Gemini provider is supported' };
        }

        console.log(`[ModelStateService] setApiKey for ${provider}`);
        if (!provider) {
            throw new Error('Provider is required');
        }

        const validationResult = await this.validateApiKey(provider, key);
        if (!validationResult.success) {
            console.warn(`[ModelStateService] API key validation failed for ${provider}: ${validationResult.error}`);
            return validationResult;
        }

        // Save a placeholder to the DB, NEVER the actual key
        const existingSettings = (await providerSettingsRepository.getByProvider(provider)) || {};
        await providerSettingsRepository.upsert(provider, { ...existingSettings, api_key: 'loaded_from_env' });

        // Key has been added/changed, so check if we can auto-select models for this provider
        await this._autoSelectAvailableModels([]);

        this.emit('state-updated', await this.getLiveState());
        this.emit('settings-updated');
        return { success: true };
    }

    async getAllApiKeys() {
        const allSettings = await providerSettingsRepository.getAll();
        const apiKeys = {};
        // Only include Gemini
        const geminiSetting = allSettings.find(s => s.provider === 'gemini');
        if (geminiSetting) {
            apiKeys['gemini'] = geminiSetting.api_key;
        }
        return apiKeys;
    }

    async removeApiKey(provider) {
        // Only allow removing Gemini keys
        if (provider !== 'gemini') {
            return false;
        }

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

    isLoggedInWithFirebase() {
        return this.authService.getCurrentUser().isLoggedIn;
    }

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

        // Only Gemini STT models supported for client
        const models = type === 'stt' ? LOCAL_PROVIDERS['gemini'].sttModels : [];
        if (models && models.some(m => m.id === modelId)) {
            return 'gemini';
        }
        return null;
    }

    async getSelectedModels() {
        const active = await providerSettingsRepository.getActiveSettings();
        return {
            llm: null, // LLM selection removed
            stt: active.stt?.selected_stt_model || null,
        };
    }

    async setSelectedModel(type, modelId) {
        if (type === 'llm') {
            console.warn('[ModelStateService] LLM selection is not supported on client.');
            return false;
        }
        const provider = this.getProviderForModel(modelId, type);
        // Only allow Gemini provider
        if (provider !== 'gemini') {
            console.warn(`[ModelStateService] No provider found for model ${modelId}`);
            return false;
        }

        const existingSettings = (await providerSettingsRepository.getByProvider(provider)) || {};
        const newSettings = { ...existingSettings };

        newSettings.selected_stt_model = modelId;

        await providerSettingsRepository.upsert(provider, newSettings);
        await providerSettingsRepository.setActiveProvider(provider, type);

        console.log(`[ModelStateService] Selected ${type} model: ${modelId} (provider: ${provider})`);

        this.emit('state-updated', await this.getLiveState());
        this.emit('settings-updated');
        return true;
    }

    async getAvailableModels(type) {
        // Client exposes STT models only
        if (type === 'llm') return [];
        const models = LOCAL_PROVIDERS['gemini']?.sttModels || [];
        const apiKey = process.env.GEMINI_API_KEY;
        return apiKey ? models : [];
    }

    async getCurrentModelInfo(type) {
        if (type !== 'stt') return null;
        const activeSetting = await providerSettingsRepository.getActiveProvider('stt');
        if (!activeSetting || !activeSetting.selected_stt_model) return null;
        const apiKey = activeSetting.provider === 'gemini' ? process.env.GEMINI_API_KEY : null;
        return {
            provider: activeSetting.provider,
            model: activeSetting.selected_stt_model,
            apiKey: apiKey,
        };
    }

    // Handler and utility methods

    async validateApiKey(provider, key) {
        // Only validate Gemini keys
        if (provider !== 'gemini') {
            return { success: false, error: 'Only Gemini provider is supported' };
        }

        if (!key || key.trim() === '') {
            return { success: false, error: 'API key cannot be empty.' };
        }
        // Validation moved server-side; accept non-empty key here.
        return { success: true };
    }

    getProviderConfig() {
        // Return Gemini provider config with LLM entries removed
        const { sttModels, name } = LOCAL_PROVIDERS['gemini'];
        return { gemini: { name, sttModels, llmModels: [] } };
    }

    async handleRemoveApiKey(provider) {
        // Only allow removing Gemini keys
        if (provider !== 'gemini') {
            return false;
        }

        const success = await this.removeApiKey(provider);
        if (success) {
            const selectedModels = await this.getSelectedModels();
        }
        return success;
    }

    // Compatibility Helpers
    async handleValidateKey(provider, key) {
        // Only allow validating Gemini keys
        if (provider !== 'gemini') {
            return { success: false, error: 'Only Gemini provider is supported' };
        }
        return await this.setApiKey(provider, key);
    }

    async handleSetSelectedModel(type, modelId) {
        return await this.setSelectedModel(type, modelId);
    }

    async areProvidersConfigured() {
        // Only STT requires local configuration
        return !!process.env.GEMINI_API_KEY;
    }
}

const modelStateService = new ModelStateService();
module.exports = modelStateService;
