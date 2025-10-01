import { html, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { summaryViewStyles } from './summary-view.css.js';

const DEFAULT_ACTIONS = ['✨ What should I say next?', '💬 Suggest follow-up questions'];

export class SummaryView extends LitElement {
    static styles = summaryViewStyles;

    static properties = {
        structuredData: { type: Object },
        isVisible: { type: Boolean },
        hasCompletedRecording: { type: Boolean },
        insightHistory: { type: Array },
        allActions: { type: Array },
        allFollowUps: { type: Array },
        allSummary: { type: Array },
        presetId: { type: String },
    };

    constructor() {
        super();
        this.structuredData = {
            summary: [],
            actions: [],
            followUps: [],
        };
        this.isVisible = true;
        this.hasCompletedRecording = false;
        this.insightHistory = []; // Array of all analysis results
        this.allActions = []; // Flattened, persistent actions
        this.allFollowUps = []; // Flattened, persistent follow-ups
        this.allSummary = []; // Flattened, persistent summary bullets
        this.hasReceivedFirstText = false; // Track if any text has been received

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
                this.hasReceivedFirstText = true; // Mark that we've received first text
                this.presetId = data.presetId || null;
                this.buildFlattenedLists();

                // Ensure default actions are always present after first text
                if (this.hasReceivedFirstText) {
                    this.ensureDefaultActions();
                }
                this.requestUpdate();
            });

            // Receive existing conversation transcript when Listen window (re)opens
            if (window.api.listenView?.onSyncConversationHistory) {
                window.api.listenView.onSyncConversationHistory((event, history) => {
                    console.log('[SummaryView] received existing transcript, length:', history?.length || 0);
                    // Mark as having received first text if there's history
                    if (history && history.length > 0) {
                        this.hasReceivedFirstText = true;
                        // Ensure default actions are present
                        this.ensureDefaultActions();
                        this.requestUpdate();
                    }
                });
            }
        }
    }

    buildFlattenedLists() {
        const actions = new Set();
        const followUps = new Set();
        const summaryBullets = new Set();

        // Collect all actions, followUps, and summary bullets from insight history
        this.insightHistory.forEach(insight => {
            if (Array.isArray(insight.actions)) {
                insight.actions.forEach(action => actions.add(action));
            }
            if (Array.isArray(insight.followUps)) {
                insight.followUps.forEach(followUp => followUps.add(followUp));
            }
            if (Array.isArray(insight.summary)) {
                insight.summary.forEach(bullet => summaryBullets.add(bullet));
            }
        });

        // Convert to arrays and reverse order (newest first)
        this.allActions = Array.from(actions).reverse();
        this.allFollowUps = Array.from(followUps).reverse();
        this.allSummary = Array.from(summaryBullets).reverse();
    }

    ensureDefaultActions() {
        DEFAULT_ACTIONS.forEach(action => {
            if (!this.allActions.includes(action)) {
                this.allActions.push(action);
            }
        });
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
            actions: [],
            followUps: [],
        };
        this.insightHistory = [];
        this.allActions = [];
        this.allFollowUps = [];
        this.allSummary = [];
        this.hasReceivedFirstText = false; // Reset first text flag
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

    scrollToFollowUps() {
        const container = this.shadowRoot.querySelector('.insights-container');
        if (container && this.allFollowUps.length > 0) {
            // Find the Follow-Ups title element using data attribute
            const followUpsTitle = this.shadowRoot.querySelector('insights-title[data-section="followups"]');
            if (followUpsTitle) {
                // Get the position of the Follow-Ups title relative to the container
                const titleRect = followUpsTitle.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();

                // Calculate the scroll position to center the Follow-Ups section
                const titleTop = titleRect.top - containerRect.top;
                const containerHeight = containerRect.height;
                const scrollTo = titleTop - containerHeight / 2 + titleRect.height / 2;

                // Smooth scroll to the Follow-Ups section
                container.scrollTo({
                    top: Math.max(0, scrollTo),
                    behavior: 'smooth',
                });

                console.log('[SummaryView] Auto-scrolled to Follow-Ups section');
            }
        }
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
        const data = this.structuredData || { summary: [], actions: [] };
        let sections = [];

        if (data.summary && data.summary.length > 0) {
            sections.push(`Current Summary:\n${data.summary.map(s => `• ${s}`).join('\n')}`);
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

            // Auto-scroll to follow-ups section smoothly
            setTimeout(() => {
                this.scrollToFollowUps();
            }, 200);

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
            actions: [],
        };

        const hasAnyContent = this.allSummary.length > 0 || this.allActions.length > 0 || data.actions.length > 0;
        const rawSections = Array.isArray(this.structuredData?.rawLLMOutput?.sections) ? this.structuredData.rawLLMOutput.sections : null;

        const fixedActionSet = new Set(
            this.allActions.filter(
                action => action.includes('What should I say next') || action.includes('Suggest follow-up') || action.includes('Recap meeting')
            )
        );

        const fixedActions = Array.from(fixedActionSet);
        const scrollableActions = this.allActions.filter(action => !fixedActionSet.has(action));

        return html`
            <div class="insights-container">
                ${!hasAnyContent && this.allActions.length === 0
                    ? html`<div class="empty-state">Insights will appear here</div>`
                    : html`
                          <!-- Dynamic Section Title -->
                          ${(() => {
                              let title = 'Summary Insights';
                              if (this.allSummary.length > 0) {
                                  switch (this.presetId) {
                                      case 'sales':
                                          title = 'Sales Insights';
                                          break;
                                      case 'recruiting':
                                          title = 'Recruiting Insights';
                                          break;
                                      case 'customer-support':
                                          title = 'Support Insights';
                                          break;
                                      case 'school':
                                          title = 'Educational Insights';
                                          break;
                                      default:
                                          title = 'Meeting Introduction';
                                  }
                              } else {
                                  if (this.allActions.some(a => a.includes('Objection') || a.includes('Sales Follow-up'))) title = 'Sales Insights';
                                  else if (this.allActions.some(a => a.includes('Gap') || a.includes('Suggested Question')))
                                      title = 'Recruiting Insights';
                                  else if (this.allActions.some(a => a.includes('Root Cause') || a.includes('Troubleshooting Step')))
                                      title = 'Support Insights';
                                  else if (this.allActions.some(a => a.includes('Clarify') || a.includes('Study Question')))
                                      title = 'Educational Insights';
                                  else title = 'Summary Insights';
                              }
                              return html`<insights-title>${title}</insights-title>`;
                          })()}
                          ${this.allSummary.length > 0
                              ? html`
                                    <div class="meeting-intro-container">
                                        ${this.allSummary.map(
                                            (bullet, index) => html`
                                                <div class="meeting-intro-item" data-markdown-id="intro-${index}" data-original-text="${bullet}">
                                                    • ${bullet}
                                                </div>
                                            `
                                        )}
                                    </div>
                                `
                              : this.hasReceivedFirstText
                                ? html` <div class="meeting-intro-item" style="font-style: normal;">• No insights yet</div> `
                                : ''}

                          <!-- Actions Section (always show fixed actions after first text) -->
                          <insights-title>Actions</insights-title>

                          <!-- Scrollable LLM Actions (Top) -->
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

                          <!-- Fixed Defaults (Bottom) -->
                          ${this.hasReceivedFirstText
                              ? html`
                                    <div class="fixed-actions-container">
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
                                    </div>
                                `
                              : ''}

                          <!-- Follow-Ups Section (no border, as before) -->
                          ${this.hasCompletedRecording && this.allFollowUps.length > 0
                              ? html`
                                    <insights-title data-section="followups">Follow-Ups</insights-title>
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

                          <!-- Click to ask Whisper prompt -->
                          ${hasAnyContent ? html` <div class="whisper-prompt">Click to ask Whisper</div> ` : ''}
                      `}
            </div>
        `;
    }
}

customElements.define('summary-view', SummaryView);
