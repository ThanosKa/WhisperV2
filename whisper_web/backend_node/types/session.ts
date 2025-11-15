export type Session = {
    id: string;
    uid: string;
    title: string;
    session_type: string;
    started_at: number;
    ended_at?: number;
    sync_state: 'clean' | 'dirty';
    updated_at: number;
};

export type AiMessage = {
    id: string;
    session_id: string;
    sent_at: number;
    role: 'user' | 'assistant';
    content: string;
    tokens?: number;
    model?: string;
    created_at: number;
    sync_state: 'clean' | 'dirty';
};

export type Summary = {
    session_id: string;
    generated_at: number;
    model?: string;
    text: string;
    tldr: string;
    bullet_json: string;
    action_json: string;
    tokens_used?: number;
    updated_at: number;
    sync_state: 'clean' | 'dirty';
};

export type SessionDetails = {
    session: Session;
    transcripts: Array<{
        id: string;
        session_id: string;
        start_at: number;
        end_at?: number;
        speaker?: string;
        text: string;
        lang?: string;
        created_at: number;
        sync_state: 'clean' | 'dirty';
    }>;
    ai_messages: AiMessage[];
    summary: Summary | null;
    insights?: Array<{ analysis_round: number; payload: { summary?: string[]; actions?: string[] } }> | null;
};

