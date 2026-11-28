// App settings: built-in defaults, overridden by the user's ~/.whisper/config.json.
// Environment variables are not read here: they are parsed once in `env.ts`.
import os from 'os';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { errorMessage } from '../utils/errors';

const log = logger.child({ module: 'Config' });

// Smart trigger for meeting analysis. A user config replaces the whole object, so each field can be
// missing; summaryService has a fallback for each.
const SmartTriggerSchema = z.object({
    enabled: z.boolean().optional(),
    minTokenCount: z.number().optional(), // ~8-10 words using rough tokenizer
    minCharCount: z.number().optional(), // safety for very short tokens
    maxWaitUtterances: z.number().optional(), // ensure analysis at least every N turns
});

const SettingsSchema = z.object({
    // The STT relay; `env.STT_RELAY_URL` wins over it.
    sttRelayUrl: z.url(),
    // Listen feature settings
    analysisStep: z.number(), // Trigger analysis every N utterances when the smart trigger is off
    utteranceSilenceMs: z.number(), // Silence debounce time for utterance completion (ms)
    maxUtteranceChars: z.number(), // Hard split threshold for a single utterance bubble
    recapStep: z.number(), // Show recap button after N utterances
    smartTrigger: SmartTriggerSchema,
});

export type Settings = z.infer<typeof SettingsSchema>;

// Unknown keys in the user's file (settings that no code reads any more) are dropped.
const UserConfigSchema = SettingsSchema.partial();

const DEFAULTS: Settings = {
    sttRelayUrl: 'wss://websocket-production-395f.up.railway.app',
    analysisStep: 1,
    utteranceSilenceMs: 800,
    maxUtteranceChars: 200,
    recapStep: 15,
    smartTrigger: {
        enabled: true,
        minTokenCount: 12,
        minCharCount: 80,
        maxWaitUtterances: 6,
    },
};

class Config {
    private config: Settings;

    constructor() {
        this.config = SettingsSchema.parse({ ...DEFAULTS, ...this.loadUserConfig() });
    }

    private loadUserConfig(): z.infer<typeof UserConfigSchema> {
        try {
            const userConfigPath = this.getUserConfigPath();
            if (!fs.existsSync(userConfigPath)) return {};
            const parsed = UserConfigSchema.safeParse(JSON.parse(fs.readFileSync(userConfigPath, 'utf-8')));
            if (!parsed.success) {
                log.warn({ userConfigPath, issues: z.prettifyError(parsed.error) }, 'Ignoring invalid user config');
                return {};
            }
            log.info({ userConfigPath }, 'User config loaded');
            return parsed.data;
        } catch (error) {
            log.warn({ error: errorMessage(error) }, 'Failed to load user config');
            return {};
        }
    }

    private getUserConfigPath(): string {
        const configDir = path.join(os.homedir(), '.whisper');
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        return path.join(configDir, 'config.json');
    }

    get<K extends keyof Settings>(key: K): Settings[K] {
        return this.config[key];
    }

    set<K extends keyof Settings>({ key, value }: { key: K; value: Settings[K] }): void {
        this.config[key] = value;
    }
}

const config = new Config();

export default config;
