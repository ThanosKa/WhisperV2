import { z } from 'zod';

// Every environment variable main reads, parsed once at startup. `index.js` imports `dotenv/config`
// first, so `.env` is loaded before this module runs. The dashboard's port and URL values
// (`whisper_API_*`, `whisper_WEB_*`) are not here: main sets them itself at runtime (4b-2 deletes them).

const DEFAULT_API_BASE_URL = 'https://www.app-whisper.com';

const EnvSchema = z.object({
    // WhisperAPP: sign-in and the LLM routes. Point it at a local WhisperAPP or the e2e fake server.
    API_BASE_URL: z
        .url()
        .default(DEFAULT_API_BASE_URL)
        .transform(url => url.replace(/\/$/, '')),
    // The STT relay; when unset, `config` holds the default.
    STT_RELAY_URL: z.url().optional(),
    NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
    // Overrides the transcription language the user picked.
    OPENAI_TRANSCRIBE_LANG: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

// `.env` files and shells leave a variable set to "" when it has no value; the code before this
// module read those with `process.env.X || default`, so an empty value counts as unset.
const withoutEmptyValues = (source: Record<string, string | undefined>) =>
    Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value !== ''));

export function parseEnv(source: Record<string, string | undefined>): Env {
    const result = EnvSchema.safeParse(withoutEmptyValues(source));
    if (!result.success) {
        throw new Error(`Invalid environment, fix these variables in .env or the shell:\n${z.prettifyError(result.error)}`);
    }
    return result.data;
}

export const env = parseEnv(process.env);
