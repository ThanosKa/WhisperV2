import { html, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { summaryViewStyles } from './summary-view-css.js';

export class SummaryView extends LitElement {
    static styles = summaryViewStyles;

    static properties = {
        structuredData: { type: Object },
        isVisible: { type: Boolean },
        hasCompletedRecording: { type: Boolean },
        insightHistory: { type: Array },
        allActions: { type: Array },
        allFollowUps: { type: Array },
    };

    constructor() {
        super();
        this.structuredData = {
            summary: [],
            topic: { header: '', bullets: [] },
            actions: [],
            followUps: [],
        };
        this.isVisible = true;
        this.hasCompletedRecording = false;
        this.insightHistory = []; // Array of all analysis results
        this.allActions = []; // Flattened, persistent actions
        this.allFollowUps = []; // Flattened, persistent follow-ups

        // 마크다운 라이브러리 초기화
        this.marked = null;
        this.hljs = null;
        this.isLibrariesLoaded = false;
        this.DOMPurify = null;
        this.isDOMPurifyLoaded = false;

        this.loadLibraries();
    }

    connectedCallback() {
        super.connectedCallback();
        if (window.api) {
            window.api.summaryView.onSummaryUpdate((event, data) => {
                // Append to history instead of overwriting
                this.insightHistory.push(data);
                this.structuredData = data; // Keep current for display
                this.buildFlattenedLists();
                this.requestUpdate();
            });

            // Receive existing conversation transcript when Listen window (re)opens
            if (window.api.listenView?.onSyncConversationHistory) {
                window.api.listenView.onSyncConversationHistory((event, history) => {
                    console.log('[SummaryView] received existing transcript, length:', history?.length || 0);
                    // No UI mutation needed here; SummaryService keeps the source of truth
                });
            }
        }
    }

    buildFlattenedLists() {
        const actions = new Set();
        const followUps = new Set();

        // Collect all actions and followUps from insight history
        this.insightHistory.forEach(insight => {
            if (Array.isArray(insight.actions)) {
                insight.actions.forEach(action => actions.add(action));
            }
            if (Array.isArray(insight.followUps)) {
                insight.followUps.forEach(followUp => followUps.add(followUp));
            }
        });

        // Convert to arrays while preserving order (most recent first)
        this.allActions = Array.from(actions);
        this.allFollowUps = Array.from(followUps);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (window.api) {
            window.api.summaryView.removeAllSummaryUpdateListeners();
        }
    }

    // Handle session reset from parent
    resetAnalysis() {
        this.structuredData = {
            summary: [],
            topic: { header: '', bullets: [] },
            actions: [],
            followUps: [],
        };
        this.insightHistory = [];
        this.allActions = [];
        this.allFollowUps = [];
        this.requestUpdate();
    }

    async loadLibraries() {
        try {
            if (!window.marked) {
                await this.loadScript('../../../assets/marked-4.3.0.min.js');
            }

            if (!window.hljs) {
                await this.loadScript('../../../assets/highlight-11.9.0.min.js');
            }

            if (!window.DOMPurify) {
                await this.loadScript('../../../assets/dompurify-3.0.7.min.js');
            }

            this.marked = window.marked;
            this.hljs = window.hljs;
            this.DOMPurify = window.DOMPurify;

            if (this.marked && this.hljs) {
                this.marked.setOptions({
                    highlight: (code, lang) => {
                        if (lang && this.hljs.getLanguage(lang)) {
                            try {
                                return this.hljs.highlight(code, { language: lang }).value;
                            } catch (err) {
                                console.warn('Highlight error:', err);
                            }
                        }
                        try {
                            return this.hljs.highlightAuto(code).value;
                        } catch (err) {
                            console.warn('Auto highlight error:', err);
                        }
                        return code;
                    },
                    breaks: true,
                    gfm: true,
                    pedantic: false,
                    smartypants: false,
                    xhtml: false,
                });

                this.isLibrariesLoaded = true;
                console.log('Markdown libraries loaded successfully');
            }

            if (this.DOMPurify) {
                this.isDOMPurifyLoaded = true;
                console.log('DOMPurify loaded successfully in SummaryView');
            }
        } catch (error) {
            console.error('Failed to load libraries:', error);
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    parseMarkdown(text) {
        if (!text) return '';

        if (!this.isLibrariesLoaded || !this.marked) {
            return text;
        }

        try {
            return this.marked(text);
        } catch (error) {
            console.error('Markdown parsing error:', error);
            return text;
        }
    }

    handleMarkdownClick(originalText) {
        this.handleRequestClick(originalText);
    }

    renderMarkdownContent() {
        if (!this.isLibrariesLoaded || !this.marked) {
            return;
        }

        const markdownElements = this.shadowRoot.querySelectorAll('[data-markdown-id]');
        markdownElements.forEach(element => {
            const originalText = element.getAttribute('data-original-text');
            if (originalText) {
                try {
                    let parsedHTML = this.parseMarkdown(originalText);

                    if (this.isDOMPurifyLoaded && this.DOMPurify) {
                        parsedHTML = this.DOMPurify.sanitize(parsedHTML);

                        if (this.DOMPurify.removed && this.DOMPurify.removed.length > 0) {
                            console.warn('Unsafe content detected in insights, showing plain text');
                            element.textContent = '⚠️ ' + originalText;
                            return;
                        }
                    }

                    element.innerHTML = parsedHTML;
                } catch (error) {
                    console.error('Error rendering markdown for element:', error);
                    element.textContent = originalText;
                }
            }
        });
    }

    async handleRequestClick(requestText) {
        console.log(`[SummaryView] live insight click: ${requestText}`);

        if (window.api) {
            try {
                console.log('[SummaryView] sending insight to ask');
                const result = await window.api.summaryView.sendQuestionFromSummary(requestText);

                if (result.success) {
                    console.log('[SummaryView] sent successfully');
                } else {
                    console.error('[SummaryView] failed to send:', result.error);
                }
            } catch (error) {
                console.error('[SummaryView] error in handleRequestClick:', error);
            }
        } else {
            console.error('⚠️ [SummaryView] window.api not available!');
        }
    }

    getSummaryText() {
        const data = this.structuredData || { summary: [], topic: { header: '', bullets: [] }, actions: [] };
        let sections = [];

        if (data.summary && data.summary.length > 0) {
            sections.push(`Current Summary:\n${data.summary.map(s => `• ${s}`).join('\n')}`);
        }

        if (data.topic && data.topic.header && data.topic.bullets.length > 0) {
            sections.push(`\n${data.topic.header}:\n${data.topic.bullets.map(b => `• ${b}`).join('\n')}`);
        }

        if (data.actions && data.actions.length > 0) {
            sections.push(`\nActions:\n${data.actions.map(a => `▸ ${a}`).join('\n')}`);
        }

        if (data.followUps && data.followUps.length > 0) {
            sections.push(`\nFollow-Ups:\n${data.followUps.map(f => `▸ ${f}`).join('\n')}`);
        }

        return sections.join('\n\n').trim();
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        this.renderMarkdownContent();

        // Log when Follow-ups appear and trigger height adjustment
        if (changedProperties.has('hasCompletedRecording') && this.hasCompletedRecording) {
            console.log('[SummaryView] Follow-ups now available - triggering window height adjustment');

            // Trigger parent height adjustment for Follow-ups content
            setTimeout(() => {
                this.dispatchEvent(
                    new CustomEvent('content-updated', {
                        bubbles: true,
                        detail: { contentType: 'followups', trigger: 'height-adjustment' },
                    })
                );
            }, 100);

            // Debug container dimensions
            setTimeout(() => {
                const container = this.shadowRoot.querySelector('.insights-container');
                if (container && this.structuredData?.followUps?.length > 0) {
                    console.log(
                        `[SummaryView] Container dimensions: scrollHeight=${container.scrollHeight}px, clientHeight=${container.clientHeight}px, offsetHeight=${container.offsetHeight}px`
                    );
                    console.log(`[SummaryView] Scrollable: ${container.scrollHeight > container.clientHeight ? 'YES' : 'NO'}`);
                }
            }, 150);
        }

        // Always log container dimensions when content changes
        setTimeout(() => {
            const container = this.shadowRoot.querySelector('.insights-container');
            if (container) {
                console.log(
                    `[SummaryView] Current container state: scrollHeight=${container.scrollHeight}px, clientHeight=${container.clientHeight}px`
                );
            }
        }, 50);
    }

    render() {
        if (!this.isVisible) {
            return html`<div style="display: none;"></div>`;
        }

        const data = this.structuredData || {
            summary: [],
            topic: { header: '', bullets: [] },
            actions: [],
        };

        const hasAnyContent = data.summary.length > 0 || data.topic.bullets.length > 0 || data.actions.length > 0;

        // Separate actions into fixed buttons and scrollable questions/defines
        const fixedActions = this.allActions.filter(
            action => action.includes('What should I say next') || action.includes('Suggest follow-up') || action.includes('Recap meeting')
        );
        const scrollableActions = this.allActions.filter(action => action.includes('📘 Define') || action.includes('❓'));

        return html`
            <div class="insights-container">
                ${!hasAnyContent && this.allActions.length === 0
                    ? html`<div class="empty-state">No insights yet...</div>`
                    : html`
                          <!-- Meeting Introduction (scrollable summary) -->
                          ${data.summary.length > 0
                              ? html`
                                    <insights-title>Meeting Introduction</insights-title>
                                    <div class="meeting-intro-container">
                                        ${data.summary
                                            .slice(0, 4)
                                            .map(
                                                (bullet, index) => html`
                                                    <div
                                                        class="meeting-intro-item"
                                                        data-markdown-id="intro-${index}"
                                                        data-original-text="${bullet}"
                                                        @click=${() => this.handleMarkdownClick(bullet)}
                                                    >
                                                        ${bullet}
                                                    </div>
                                                `
                                            )}
                                    </div>
                                `
                              : ''}

                          <!-- Current Topic Section -->
                          ${data.topic.header
                              ? html`
                                    <insights-title>${data.topic.header}</insights-title>
                                    ${data.topic.bullets
                                        .slice(0, 3)
                                        .map(
                                            (bullet, index) => html`
                                                <div
                                                    class="markdown-content"
                                                    data-markdown-id="topic-${index}"
                                                    data-original-text="${bullet}"
                                                    @click=${() => this.handleMarkdownClick(bullet)}
                                                >
                                                    ${bullet}
                                                </div>
                                            `
                                        )}
                                `
                              : ''}
                          <insights-title>Actions</insights-title>

                          <!-- Scrollable Questions and Defines -->
                          ${scrollableActions.length > 0
                              ? html`
                                    <div class="scrollable-actions-container">
                                        ${scrollableActions.map(
                                            (action, index) => html`
                                                <div
                                                    class="markdown-content scrollable-action-item"
                                                    data-markdown-id="scrollable-action-${index}"
                                                    data-original-text="${action}"
                                                    @click=${() => this.handleMarkdownClick(action)}
                                                >
                                                    ${action}
                                                </div>
                                            `
                                        )}
                                    </div>
                                `
                              : ''}

                          <!-- Fixed Action Buttons (below questions/defines) -->
                          ${fixedActions.length > 0
                              ? html`
                                    ${fixedActions.map(
                                        (action, index) => html`
                                            <div
                                                class="markdown-content fixed-action-item"
                                                data-markdown-id="fixed-action-${index}"
                                                data-original-text="${action}"
                                                @click=${() => this.handleMarkdownClick(action)}
                                            >
                                                ${action}
                                            </div>
                                        `
                                    )}
                                `
                              : ''}

                          <!-- Follow-Ups Section (no border, as before) -->
                          ${this.hasCompletedRecording && this.allFollowUps.length > 0
                              ? html`
                                    <insights-title>Follow-Ups</insights-title>
                                    ${this.allFollowUps.map(
                                        (followUp, index) => html`
                                            <div
                                                class="markdown-content followup-item"
                                                data-markdown-id="persistent-followup-${index}"
                                                data-original-text="${followUp}"
                                                @click=${() => this.handleMarkdownClick(followUp)}
                                            >
                                                ${followUp}
                                            </div>
                                        `
                                    )}
                                `
                              : ''}
                      `}
            </div>
        `;
    }
}

customElements.define('summary-view', SummaryView);
