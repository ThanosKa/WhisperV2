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
    append_text?: string;
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
        // Allow force refresh via URL param ?refresh=1
        const shouldRefresh =
            typeof window !== 'undefined' && (window.location.search.includes('refresh=1') || window.location.search.includes('reset=1'));

        console.log('[DevMock] ensureMockData called:', {
            alreadyInitialized: already === '1',
            shouldRefresh,
            searchParams: typeof window !== 'undefined' ? window.location.search : 'server',
            mockEnabled: isDevMockEnabled(),
        });

        if (already === '1' && !shouldRefresh) return;

        // Clear existing data if refreshing
        if (shouldRefresh) {
            console.log('[DevMock] Force refreshing mock data...');
            localStorage.removeItem(PRESETS_KEY);
            localStorage.removeItem(SESSIONS_KEY);
            // Clear all session details
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(DETAILS_PREFIX)) {
                    localStorage.removeItem(key);
                }
            }
        }

        // Seed presets
        const now = Math.floor(Date.now() / 1000);
        const presets: DevPromptPreset[] = [
            {
                id: 'preset-1',
                uid: 'dev_user',
                title: 'Brainstorm',
                prompt: 'You are a creative assistant',
                append_text: '',
                is_default: 1,
                created_at: now - 5000,
                sync_state: 'clean',
            },
            {
                id: 'preset-2',
                uid: 'dev_user',
                title: 'Summarize',
                prompt: 'Summarize the following content',
                append_text: '',
                is_default: 0,
                created_at: now - 4500,
                sync_state: 'clean',
            },
            {
                id: 'preset-3',
                uid: 'dev_user',
                title: 'Code Review',
                prompt: 'Review the code and suggest improvements',
                append_text: 'Focus on performance',
                is_default: 0,
                created_at: now - 4000,
                sync_state: 'clean',
            },
        ];
        localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));

        // Seed sessions and details
        const sessions: DevSession[] = [];
        for (let i = 1; i <= 26; i++) {
            const isListen = i % 2 === 0;
            const start = now - i * 3600;
            const end = isListen ? start + Math.floor(1800 + Math.random() * 1800) : undefined;
            let title: string;
            if (isListen) {
                if (i <= 16) {
                    title = `Team Sync #${i / 2}`;
                } else {
                    // New meeting titles for sessions 17-26 (meetings)
                    const meetingTitles = [
                        'Product Roadmap Review',
                        'Sprint Planning Session',
                        'Client Presentation Prep',
                        'Bug Triage Meeting',
                        'Design System Discussion',
                    ];
                    title = meetingTitles[(i - 17) % 5];
                }
            } else {
                if (i <= 16) {
                    title = `Question #${i}`;
                } else {
                    // New question titles for sessions 17-26 (questions)
                    const questionTitles = [
                        'API Integration Help',
                        'Database Optimization',
                        'UI Component Design',
                        'Testing Strategy',
                        'Deployment Process',
                    ];
                    title = questionTitles[(i - 17) % 5];
                }
            }
            const s: DevSession = {
                id: `sess-${i}`,
                uid: 'dev_user',
                title: title,
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
                          {
                              id: `tr-${i}-1`,
                              session_id: s.id,
                              start_at: start,
                              end_at: start + 60,
                              speaker: 'me',
                              text: i <= 16 ? `Opening remarks for meeting ${i}` : getMeetingTranscript(i),
                              created_at: start + 61,
                              sync_state: 'clean',
                          },
                          {
                              id: `tr-${i}-2`,
                              session_id: s.id,
                              start_at: start + 120,
                              end_at: start + 180,
                              speaker: 'them',
                              text: i <= 16 ? 'Discussion about roadmap and priorities' : getMeetingDiscussion(i),
                              created_at: start + 181,
                              sync_state: 'clean',
                          },
                          {
                              id: `tr-${i}-3`,
                              session_id: s.id,
                              start_at: start + 240,
                              end_at: start + 300,
                              speaker: 'me',
                              text: i <= 16 ? `Following up on the key points from last meeting` : getMeetingTranscript2(i),
                              created_at: start + 301,
                              sync_state: 'clean',
                          },
                          {
                              id: `tr-${i}-4`,
                              session_id: s.id,
                              start_at: start + 360,
                              end_at: start + 420,
                              speaker: 'them',
                              text: i <= 16 ? 'Good progress made on the deliverables' : getMeetingDiscussion2(i),
                              created_at: start + 421,
                              sync_state: 'clean',
                          },
                          {
                              id: `tr-${i}-5`,
                              session_id: s.id,
                              start_at: start + 480,
                              end_at: start + 540,
                              speaker: 'me',
                              text: i <= 16 ? `Let's schedule the next follow-up session` : getMeetingTranscript3(i),
                              created_at: start + 541,
                              sync_state: 'clean',
                          },
                      ]
                    : [],
                ai_messages: !isListen ? generateAIMessages(i, s.id, start) : [],
                summary: isListen
                    ? {
                          session_id: s.id,
                          generated_at: start + 200,
                          text: i <= 16 ? `Summary for meeting ${i}` : getMeetingSummaryText(i),
                          tldr: i <= 16 ? `Meeting ${i} covered roadmap and tasks` : getMeetingTLDR(i),
                          bullet_json:
                              i <= 16 ? JSON.stringify(['Roadmap updates', 'Action items assigned', 'Deadlines discussed']) : getMeetingBullets(i),
                          action_json: i <= 16 ? JSON.stringify(['Prepare Q3 plan', 'Follow up with stakeholders']) : getMeetingActions(i),
                          updated_at: start + 210,
                          sync_state: 'clean',
                      }
                    : null,
            };
            localStorage.setItem(DETAILS_PREFIX + s.id, JSON.stringify(details));
        }
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));

        // Only set init key if not refreshing (allows multiple refreshes)
        if (!shouldRefresh) {
            localStorage.setItem(INIT_KEY, '1');
        }
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

// Utility function to clear all mock data (can be called from browser console)
export function clearMockData() {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem(PRESETS_KEY);
        localStorage.removeItem(SESSIONS_KEY);
        localStorage.removeItem(INIT_KEY);
        // Clear all session details
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(DETAILS_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        console.log('[DevMock] All mock data cleared. Refresh the page to regenerate.');
    } catch (error) {
        console.error('[DevMock] Error clearing mock data:', error);
    }
}

// Force refresh mock data (can be called from browser console)
export function forceRefreshMockData() {
    if (typeof window === 'undefined') return;
    clearMockData();
    // Force re-initialization by removing the init flag
    localStorage.removeItem(INIT_KEY);
    // Now call ensureMockData to regenerate
    ensureMockData();
    console.log('[DevMock] Mock data refreshed! Page should reload with new data.');
}

// Helper functions for generating varied mock content
function getMeetingTranscript(i: number): string {
    const transcripts = [
        'Opening remarks for product roadmap review',
        'Starting sprint planning discussion',
        'Beginning client presentation preparation',
        'Initiating bug triage process',
        'Starting design system conversation',
    ];
    return transcripts[(i - 17) % 5];
}

function getMeetingDiscussion(i: number): string {
    const discussions = [
        'Reviewing upcoming product features and timelines',
        'Planning tasks for the next development sprint',
        'Coordinating presentation materials and talking points',
        'Categorizing and prioritizing reported issues',
        'Discussing component library updates and guidelines',
    ];
    return discussions[(i - 17) % 5];
}

function getMeetingSummaryText(i: number): string {
    const summaries = [
        'Product roadmap review covered Q4 features and strategic priorities. Team discussed upcoming product launches, feature prioritization, and resource allocation for the next quarter. Key decisions were made about timeline adjustments and dependency management.',
        'Sprint planning established goals and task assignments for next iteration. Development team reviewed backlog items, estimated story points, and allocated tasks based on team capacity and expertise. Sprint goals were clearly defined with measurable outcomes.',
        'Client presentation prep aligned on messaging and deliverables. Marketing and product teams collaborated on presentation structure, key talking points, and visual materials. Timeline for delivery and follow-up actions were established.',
        'Bug triage identified critical issues and assigned ownership. Development team categorized reported bugs by severity, assigned responsible developers, and established priority order for resolution. Root cause analysis was initiated for high-impact issues.',
        'Design system discussion established new component standards. Design and development teams reviewed component library updates, established migration strategy, and created implementation guidelines for consistent UI across the application.',
    ];
    return summaries[(i - 17) % 5];
}

function getMeetingTLDR(i: number): string {
    const tldrs = [
        'Q4 roadmap finalized with feature priorities, timeline adjustments, and resource allocation decisions',
        'Sprint goals established with task assignments, story point estimates, and capacity planning',
        'Client presentation structure completed with messaging alignment and delivery timeline',
        'Bug triage completed with severity categorization and developer assignments',
        'Design system standards established with migration strategy and implementation guidelines',
    ];
    return tldrs[(i - 17) % 5];
}

function getMeetingBullets(i: number): string {
    const bullets = [
        [
            'Q4 feature priorities established with stakeholder input',
            'Timeline adjusted to accommodate key dependencies',
            'Resource allocation reviewed and approved',
            'Risk mitigation strategies discussed in detail',
            'Stakeholder communication plan outlined',
        ],
        [
            'Sprint backlog items estimated using planning poker',
            'Task assignments distributed based on team expertise',
            'Team capacity calculated including time off',
            'Sprint goals defined with measurable success metrics',
            'Daily standup schedule confirmed for the week',
        ],
        [
            'Presentation structure finalized with executive approval',
            'Key messaging points aligned across all slides',
            'Visual materials gathered from design team',
            'Q&A preparation initiated with common questions',
            'Delivery timeline established with buffer time',
        ],
        [
            'Bug severity levels assigned using standard criteria',
            'Critical path issues identified for immediate focus',
            'Developer ownership established with backup assignments',
            'Priority matrix created for transparent decision making',
            'Resolution timeline set with realistic deadlines',
        ],
        [
            'Component library audit completed with usage statistics',
            'Migration strategy defined with phased rollout',
            'Implementation guidelines created for consistency',
            'Team training plan outlined with hands-on sessions',
            'Deprecation timeline established for legacy components',
        ],
    ];
    return JSON.stringify(bullets[(i - 17) % 5]);
}

function getMeetingActions(i: number): string {
    const actions = [
        [
            'Schedule quarterly roadmap review with key stakeholders next week',
            'Update project timeline in project management tool by Friday',
            'Prepare detailed implementation plans for Q4 features',
            'Identify and schedule dependency meetings with external teams',
            'Create comprehensive risk mitigation action plan',
        ],
        [
            'Create detailed task breakdown for each sprint item with acceptance criteria',
            'Set team capacity limits and allocate 20% buffer time',
            'Schedule daily standup meetings at 9 AM for the sprint',
            'Set up sprint tracking dashboard with burndown charts',
            'Prepare sprint retrospective agenda with improvement focus',
        ],
        [
            'Finalize presentation deck with final edits and executive approval',
            'Schedule presentation practice session with team next Monday',
            'Prepare comprehensive Q&A response document with sources',
            'Coordinate with design team for final visual enhancements',
            'Set up presentation delivery logistics and backup plans',
        ],
        [
            'Fix critical authentication bugs by end of week with priority',
            'Update bug tracking system with new priorities and timelines',
            'Communicate status updates to affected users via email',
            'Schedule code review for bug fixes with security team',
            'Create regression testing checklist for authentication flows',
        ],
        [
            'Update component library with new design system standards',
            'Schedule team training sessions on new guidelines next month',
            'Migrate high-priority components to new standards first',
            'Create migration documentation with code examples',
            'Set up component usage monitoring and compliance tracking',
        ],
    ];
    return JSON.stringify(actions[(i - 17) % 5]);
}

function getQuestionContent(i: number): string {
    const questions = [
        'How do I integrate third-party APIs securely?',
        'What are the best practices for database indexing?',
        'How should I design reusable UI components?',
        'What testing strategy works best for React apps?',
        'How do I set up automated deployment pipelines?',
    ];
    return questions[(i - 17) % 5];
}

function getMeetingDiscussion2(i: number): string {
    const discussions = [
        'The Q4 features look solid, but we need to ensure proper testing coverage before release',
        'Sprint capacity looks good, but we should allocate time for technical debt and refactoring',
        'The presentation structure is clear, but we need more compelling visuals and data points',
        'Most bugs are in the authentication flow, should prioritize those for security reasons',
        'The new design system will require updating 50+ components across the entire application',
    ];
    return discussions[(i - 17) % 5];
}

function getMeetingTranscript2(i: number): string {
    const transcripts = [
        'Following up on the Q4 roadmap priorities we discussed last time',
        'Reviewing the sprint backlog and task assignments for this iteration',
        'Going over the client presentation deck and key messaging points',
        'Prioritizing the critical bugs that need immediate developer attention',
        'Discussing the component library migration strategy and timeline',
    ];
    return transcripts[(i - 17) % 5];
}

function getMeetingTranscript3(i: number): string {
    const transcripts = [
        'Let me know if you need any additional resources or support for the roadmap execution',
        "I'll send out the sprint planning notes and task breakdown by end of day",
        "Let's schedule a dry run for the client presentation next Tuesday morning",
        "I'll create tickets for the high-priority bugs we identified in the triage session",
        "I'll prepare the migration documentation and component usage guidelines for the team",
    ];
    return transcripts[(i - 17) % 5];
}

function getQuestionAnswer(i: number): string {
    const answers = [
        'Use environment variables for API keys, implement rate limiting, and validate all inputs thoroughly.',
        'Index frequently queried columns, use composite indexes for multi-column queries, and monitor query performance.',
        'Design with composition in mind, use TypeScript for prop validation, and keep components focused on single responsibilities.',
        'Combine unit tests for components, integration tests for user flows, and E2E tests for critical paths.',
        'Use CI/CD platforms like GitHub Actions, implement staging environments, and automate rollback procedures.',
    ];
    return answers[(i - 17) % 5];
}

function generateAIMessages(sessionIndex: number, sessionId: string, startTime: number): DevAiMessage[] {
    const messages: DevAiMessage[] = [];
    const now = Math.floor(Date.now() / 1000);

    // User messages
    for (let i = 1; i <= 5; i++) {
        const sentAt = startTime + i * 10;
        const content = `How do I structure feature ${i}?`;
        messages.push({
            id: `ai-${sessionIndex}-${sentAt}`,
            session_id: sessionId,
            sent_at: sentAt,
            role: 'user',
            content: content,
            created_at: sentAt,
            sync_state: 'clean',
        });
    }

    // Assistant messages
    for (let i = 1; i <= 5; i++) {
        const sentAt = startTime + i * 10 + 10;
        const content = `Consider splitting into small components and testing them independently.`;
        messages.push({
            id: `ai-${sessionIndex}-${sentAt}`,
            session_id: sessionId,
            sent_at: sentAt,
            role: 'assistant',
            content: content,
            created_at: sentAt,
            sync_state: 'clean',
        });
    }

    return messages;
}
