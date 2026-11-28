import { z } from 'zod';
import authService from '../services/authService';
import { env } from '../config/env';

// What the features send to WhisperAPP's /api/llm routes. `profile` picks the server prompt; the
// other fields (userContent, context, role, forceSearch, images) depend on the profile.
export type LlmPayload = { profile: string; userContent?: unknown; [field: string]: unknown };

// /api/llm/chat answers `{ success: true, content }`, or `{ success: false, error }`.
const ChatResponseSchema = z.object({
    success: z.boolean().optional(),
    content: z.unknown(),
    error: z.string().optional(),
});

const ChatContentSchema = z.string();

function requireSession(): string {
    const sessionUuid = authService.sessionUuid;
    if (!sessionUuid) {
        throw new Error('Not authenticated: missing session. Please sign in.');
    }
    return sessionUuid;
}

// The features are still JavaScript, so the payload's shape is checked here as before.
function validatePayload(payload: LlmPayload): void {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid payload: must be an object');
    }
    if (!payload.profile) {
        throw new Error('Invalid payload: missing required field "profile"');
    }
    // userContent is optional for analysis profiles and comprehensive_summary
    const requiresUserContent = !payload.profile.endsWith('_analysis') && payload.profile !== 'comprehensive_summary';
    if (requiresUserContent && (payload.userContent === undefined || payload.userContent === null)) {
        throw new Error('Invalid payload: missing required field "userContent"');
    }
}

async function chat(payload: LlmPayload): Promise<{ content: string }> {
    const sessionUuid = requireSession();
    validatePayload(payload);

    const res = await fetch(`${env.API_BASE_URL}/api/llm/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Session-UUID': sessionUuid,
        },
        body: JSON.stringify(payload),
    });

    const body: unknown = await res.json().catch(() => ({}));
    const data = ChatResponseSchema.safeParse(body);
    if (!res.ok || !data.success || !data.data.success) {
        const err = (data.success && data.data.error) || `${res.status} ${res.statusText}`;
        throw new Error(`LLM chat API error: ${err}`);
    }

    const content = ChatContentSchema.safeParse(data.data.content);
    if (!content.success) {
        throw new Error('LLM chat API error: the answer has no text content');
    }
    return { content: content.data };
}

async function stream({ payload, signal }: { payload: LlmPayload; signal?: AbortSignal | undefined }): Promise<Response> {
    const sessionUuid = requireSession();
    validatePayload(payload);

    const response = await fetch(`${env.API_BASE_URL}/api/llm/stream`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Session-UUID': sessionUuid,
        },
        body: JSON.stringify(payload),
        signal: signal ?? null,
    });

    if (!response.ok) {
        throw new Error(`LLM stream API error: ${response.status} ${response.statusText}`);
    }

    return response;
}

export { chat, stream };
