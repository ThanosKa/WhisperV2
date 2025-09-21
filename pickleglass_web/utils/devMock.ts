// Lightweight dev-mode mock utilities to unblock UI work without Electron/IPC
// Toggle via any of:
// - process.env.NEXT_PUBLIC_DEV_MOCK === '1'
// - localStorage.dev_mock === '1'
// - URL param ?dev=1 (or disable with ?dev=0)

export interface DevUserProfile {
  uid: string;
  display_name: string;
  email: string;
}

export interface DevSession {
  id: string;
  uid: string;
  title: string;
  session_type: string; // keep broad for compatibility with app types
  started_at: number;
  ended_at?: number;
  sync_state: 'clean' | 'dirty';
  updated_at: number;
}

export interface DevTranscript {
  id: string;
  session_id: string;
  start_at: number;
  end_at?: number;
  speaker?: string;
  text: string;
  lang?: string;
  created_at: number;
  sync_state: 'clean' | 'dirty';
}

export interface DevAiMessage {
  id: string;
  session_id: string;
  sent_at: number;
  role: 'user' | 'assistant';
  content: string;
  tokens?: number;
  model?: string;
  created_at: number;
  sync_state: 'clean' | 'dirty';
}

export interface DevSummary {
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
}

export interface DevSessionDetails {
  session: DevSession;
  transcripts: DevTranscript[];
  ai_messages: DevAiMessage[];
  summary: DevSummary | null;
}

export interface DevPromptPreset {
  id: string;
  uid: string;
  title: string;
  prompt: string;
  is_default: 0 | 1;
  created_at: number;
  sync_state: 'clean' | 'dirty';
}

const PRESETS_KEY = 'dev_mock_presets';
const SESSIONS_KEY = 'dev_mock_sessions';
const DETAILS_PREFIX = 'dev_mock_session_details_';
const INIT_KEY = 'dev_mock_init';

export function isDevMockEnabled(): boolean {
  // Env flag works in both SSR and browser; localStorage/URL only in browser
  const envOn = typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_DEV_MOCK === '1';

  if (typeof window === 'undefined') return envOn;

  try {
    const usp = new URLSearchParams(window.location.search);
    if (usp.has('dev')) {
      const v = usp.get('dev');
      if (v === '1') localStorage.setItem('dev_mock', '1');
      if (v === '0') localStorage.setItem('dev_mock', '0');
    }
  } catch {
    // ignore URL parsing errors
  }

  const ls = ((): string | null => {
    try {
      return localStorage.getItem('dev_mock');
    } catch {
      return null;
    }
  })();

  return envOn || ls === '1';
}

export function getMockUser(): DevUserProfile {
  return { uid: 'dev_user', display_name: 'Dev User', email: 'dev@example.com' };
}

export function ensureMockData() {
  if (typeof window === 'undefined') return;
  if (!isDevMockEnabled()) return;

  try {
    const already = localStorage.getItem(INIT_KEY);
    if (already === '1') return;

    // Seed presets
    const now = Math.floor(Date.now() / 1000);
    const presets: DevPromptPreset[] = [
      { id: 'preset-1', uid: 'dev_user', title: 'Brainstorm', prompt: 'You are a creative assistant', is_default: 1, created_at: now - 5000, sync_state: 'clean' },
      { id: 'preset-2', uid: 'dev_user', title: 'Summarize', prompt: 'Summarize the following content', is_default: 0, created_at: now - 4500, sync_state: 'clean' },
      { id: 'preset-3', uid: 'dev_user', title: 'Code Review', prompt: 'Review the code and suggest improvements', is_default: 0, created_at: now - 4000, sync_state: 'clean' },
    ];
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));

    // Seed sessions and details
    const sessions: DevSession[] = [];
    for (let i = 1; i <= 16; i++) {
      const isListen = i % 2 === 0;
      const start = now - (i * 3600);
      const end = isListen ? start + Math.floor(1800 + Math.random() * 1800) : undefined;
      const s: DevSession = {
        id: `sess-${i}`,
        uid: 'dev_user',
        title: isListen ? `Team Sync #${i / 2}` : `Question #${i}`,
        session_type: isListen ? 'listen' : 'ask',
        started_at: start,
        ended_at: end,
        sync_state: 'clean',
        updated_at: start + 60,
      };
      sessions.push(s);

      const details: DevSessionDetails = {
        session: s,
        transcripts: isListen
          ? [
              { id: `tr-${i}-1`, session_id: s.id, start_at: start, end_at: start + 60, speaker: 'alex', text: `Opening remarks for meeting ${i}`, created_at: start + 61, sync_state: 'clean' },
              { id: `tr-${i}-2`, session_id: s.id, start_at: start + 120, end_at: start + 180, speaker: 'sam', text: 'Discussion about roadmap and priorities', created_at: start + 181, sync_state: 'clean' },
            ]
          : [],
        ai_messages: !isListen
          ? [
              { id: `ai-${i}-1`, session_id: s.id, sent_at: start + 10, role: 'user', content: `How do I structure feature ${i}?`, created_at: start + 10, sync_state: 'clean' },
              { id: `ai-${i}-2`, session_id: s.id, sent_at: start + 12, role: 'assistant', content: 'Consider splitting into small components and testing them independently.', created_at: start + 12, sync_state: 'clean' },
            ]
          : [],
        summary: isListen
          ? {
              session_id: s.id,
              generated_at: start + 200,
              text: `Summary for meeting ${i}`,
              tldr: `Meeting ${i} covered roadmap and tasks`,
              bullet_json: JSON.stringify(['Roadmap updates', 'Action items assigned', 'Deadlines discussed']),
              action_json: JSON.stringify(['Prepare Q3 plan', 'Follow up with stakeholders']),
              updated_at: start + 210,
              sync_state: 'clean',
            }
          : null,
      };
      localStorage.setItem(DETAILS_PREFIX + s.id, JSON.stringify(details));
    }
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));

    localStorage.setItem(INIT_KEY, '1');
  } catch {
    // ignore storage errors for dev
  }
}

export function getPresetsMock(): DevPromptPreset[] {
  if (typeof window === 'undefined') return [];
  ensureMockData();
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? (JSON.parse(raw) as DevPromptPreset[]) : [];
  } catch {
    return [];
  }
}

export function setPresetsMock(presets: DevPromptPreset[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {}
}

export function getSessionsMock(): DevSession[] {
  if (typeof window === 'undefined') return [];
  ensureMockData();
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as DevSession[]) : [];
  } catch {
    return [];
  }
}

export function setSessionsMock(sessions: DevSession[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {}
}

export function getSessionDetailsMock(id: string): DevSessionDetails | null {
  if (typeof window === 'undefined') return null;
  ensureMockData();
  try {
    const raw = localStorage.getItem(DETAILS_PREFIX + id);
    return raw ? (JSON.parse(raw) as DevSessionDetails) : null;
  } catch {
    return null;
  }
}

export function setSessionDetailsMock(id: string, details: DevSessionDetails) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DETAILS_PREFIX + id, JSON.stringify(details));
  } catch {}
}
