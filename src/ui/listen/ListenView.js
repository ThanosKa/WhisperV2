import { html, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { listenViewStyles } from './listen-view.css.js';
import './stt/SttView.js';
import './summary/SummaryView.js';

export class ListenView extends LitElement {
    static styles = listenViewStyles;

    static properties = {
        viewMode: { type: String },
        isHovering: { type: Boolean },
        isAnimating: { type: Boolean },
        copyState: { type: String },
        elapsedTime: { type: String },
        captureStartTime: { type: Number },
        isSessionActive: { type: Boolean },
        hasCompletedRecording: { type: Boolean },
        presets: { type: Array },
        selectedPresetId: { type: String },
    };

    constructor() {
        super();
        this.isSessionActive = false;
        this.hasCompletedRecording = false;
        this.viewMode = 'insights';
        this.isHovering = false;
        this.isAnimating = false;
        this.elapsedTime = '00:00';
        this.captureStartTime = null;
        this.timerInterval = null;
        this.adjustHeightThrottle = null;
        this.isThrottled = false;
        this.copyState = 'idle';
        this.copyTimeout = null;

        this.adjustWindowHeight = this.adjustWindowHeight.bind(this);

        // Analysis presets state
        this.presets = [];
        this.selectedPresetId = null;

        // Scroll position preservation
        this.transcriptScrollTop = 0;
    }

    async connectedCallback() {
        super.connectedCallback();
        // Only start timer if session is active
        if (this.isSessionActive) {
            this.startTimer();
        }

        // Simplified - no profile selection needed for meeting copilot

        // Listen for content updates from child components
        this.addEventListener('content-updated', event => {
            console.log('[ListenView] Content updated:', event.detail);
            if (event.detail.trigger === 'height-adjustment') {
                this.adjustWindowHeightThrottled();
            }
        });

        if (window.api) {
            window.api.listenView.onSessionStateChanged((_, { isActive, mode }) => {
                const wasActive = this.isSessionActive;
                this.isSessionActive = isActive;

                if (!wasActive && isActive) {
                    this.hasCompletedRecording = false;
                    this.startTimer();
                    // Only reset on true start, not on resume
                    if (mode === 'start') {
                        this.updateComplete.then(() => {
                            const sttView = this.shadowRoot.querySelector('stt-view');
                            const summaryView = this.shadowRoot.querySelector('summary-view');
                            if (sttView) sttView.resetTranscript();
                            if (summaryView) {
                                summaryView.resetAnalysis();
                                summaryView.prepareAwaitingAnalysis?.();
                            }
                        });
                    }
                    this.requestUpdate();
                }
                if (wasActive && !isActive) {
                    this.hasCompletedRecording = true;
                    this.stopTimer();
                    this.requestUpdate();
                    this.adjustWindowHeight();
                }
            });

            // Initialize presets selection on attach
            try {
                const [{ presetId }, presets] = await Promise.all([
                    window.api.listenView.getAnalysisPreset(),
                    window.api.listenView.listAnalysisPresets(),
                ]);
                this.presets = Array.isArray(presets) ? presets : [];
                this.selectedPresetId = presetId || null;
            } catch (e) {
                console.warn('[ListenView] Failed to load analysis presets:', e.message);
            }

            // Subscribe to preset updates to refresh the dropdown live
            this._onPresetsUpdated = async () => {
                try {
                    const presets = await window.api.listenView.listAnalysisPresets();
                    this.presets = Array.isArray(presets) ? presets : [];
                } catch (e) {
                    console.warn('[ListenView] Failed to refresh presets on update:', e.message);
                }
            };
            window.api.listenView.onPresetsUpdated(this._onPresetsUpdated);
        }
    }

    // Profile selection removed - simplified to single meeting mode

    disconnectedCallback() {
        super.disconnectedCallback();
        this.stopTimer();

        if (this.adjustHeightThrottle) {
            clearTimeout(this.adjustHeightThrottle);
            this.adjustHeightThrottle = null;
        }
        if (this.copyTimeout) {
            clearTimeout(this.copyTimeout);
        }

        if (window.api && this._onPresetsUpdated) {
            window.api.listenView.removeOnPresetsUpdated(this._onPresetsUpdated);
            this._onPresetsUpdated = null;
        }
    }

    startTimer() {
        this.captureStartTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.captureStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60)
                .toString()
                .padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            this.elapsedTime = `${minutes}:${seconds}`;
            this.requestUpdate();
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    adjustWindowHeight() {
        if (!window.api) return;

        this.updateComplete
            .then(() => {
                const topBar = this.shadowRoot.querySelector('.top-bar');
                const activeContent =
                    this.viewMode === 'transcript' ? this.shadowRoot.querySelector('stt-view') : this.shadowRoot.querySelector('summary-view');

                if (!topBar || !activeContent) return;

                const topBarHeight = topBar.offsetHeight;
                const contentHeight = activeContent.scrollHeight;
                const idealHeight = topBarHeight + contentHeight;

                // Dynamic sizing: min 250px, max 500px
                const targetHeight = Math.max(250, Math.min(500, idealHeight));

                console.log(
                    `[Height Adjusted] Mode: ${this.viewMode}, TopBar: ${topBarHeight}px, Content: ${contentHeight}px, Ideal: ${idealHeight}px, Target: ${targetHeight}px`
                );

                window.api.listenView.adjustWindowHeight('listen', targetHeight);
            })
            .catch(error => {
                console.error('Error in adjustWindowHeight:', error);
            });
    }

    toggleViewMode() {
        // Save scroll position when leaving transcript view
        if (this.viewMode === 'transcript') {
            const sttView = this.shadowRoot.querySelector('stt-view');
            if (sttView && sttView.shadowRoot) {
                const scrollContainer = sttView.shadowRoot.querySelector('.transcription-container');
                if (scrollContainer) {
                    this.transcriptScrollTop = scrollContainer.scrollTop;
                }
            }
        }

        this.viewMode = this.viewMode === 'insights' ? 'transcript' : 'insights';
        this.requestUpdate();
    }

    async handlePresetChange(event) {
        const presetId = event?.target?.value || null;
        try {
            await window.api.listenView.setAnalysisPreset({ presetId });
            this.selectedPresetId = presetId;
            // optional: refresh list in case of external updates
        } catch (e) {
            console.error('[ListenView] Failed to set analysis preset:', e.message);
        }
    }

    handleCopyHover(isHovering) {
        this.isHovering = isHovering;
        if (isHovering) {
            this.isAnimating = true;
        } else {
            this.isAnimating = false;
        }
        this.requestUpdate();
    }

    async handleCopy() {
        if (this.copyState === 'copied') return;

        let textToCopy = '';

        if (this.viewMode === 'transcript') {
            const sttView = this.shadowRoot.querySelector('stt-view');
            textToCopy = sttView ? sttView.getTranscriptText() : '';
        } else {
            const summaryView = this.shadowRoot.querySelector('summary-view');
            textToCopy = summaryView ? summaryView.getSummaryText() : '';
        }

        try {
            await navigator.clipboard.writeText(textToCopy);
            console.log('Content copied to clipboard');

            this.copyState = 'copied';
            this.requestUpdate();

            if (this.copyTimeout) {
                clearTimeout(this.copyTimeout);
            }

            this.copyTimeout = setTimeout(() => {
                this.copyState = 'idle';
                this.requestUpdate();
            }, 1500);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }

    adjustWindowHeightThrottled() {
        if (this.isThrottled) {
            return;
        }

        this.adjustWindowHeight();

        this.isThrottled = true;

        this.adjustHeightThrottle = setTimeout(() => {
            this.isThrottled = false;
        }, 16);
    }

    updated(changedProperties) {
        super.updated(changedProperties);

        // Re-enabled: Window now grows dynamically from 250px to 500px based on content
        if (changedProperties.has('viewMode')) {
            this.adjustWindowHeight();

            // Restore scroll position when switching to transcript view
            if (this.viewMode === 'transcript' && this.transcriptScrollTop > 0) {
                this.updateComplete.then(() => {
                    setTimeout(() => {
                        const sttView = this.shadowRoot.querySelector('stt-view');
                        if (sttView && sttView.shadowRoot) {
                            const scrollContainer = sttView.shadowRoot.querySelector('.transcription-container');
                            if (scrollContainer) {
                                scrollContainer.scrollTop = this.transcriptScrollTop;
                            }
                        }
                    }, 10); // Small delay to ensure DOM is fully rendered
                });
            }
        }
    }

    handleSttMessagesUpdated(event) {
        // Handle messages update from SttView - adjust height as content grows
        this.adjustWindowHeightThrottled();
    }

    firstUpdated() {
        super.firstUpdated();
        // Re-enabled: Window starts at 250px and grows with content
        setTimeout(() => this.adjustWindowHeight(), 200);
    }

    render() {
        const selectedPresetName = (() => {
            if (!this.selectedPresetId) return 'Meetings (Default)';
            const found = (this.presets || []).find(p => p && p.id === this.selectedPresetId);
            return found?.title || 'Meetings';
        })();

        const displayText = this.isHovering
            ? this.viewMode === 'transcript'
                ? 'Copy Transcript'
                : 'Copy Analysis'
            : this.viewMode === 'insights'
              ? `Live insights`
              : `Listening ${this.elapsedTime}`;

        // Show bouncing dots when actively listening and in transcript mode
        const showListeningDots = !this.isHovering && this.viewMode === 'transcript' && this.isSessionActive;

        return html`
            <div class="assistant-container">
                <div class="top-bar">
                    <div class="bar-left-text">
                        <span class="bar-left-text-content ${this.isAnimating ? 'slide-in' : ''}"> ${displayText} </span>
                    </div>
                    <div class="bar-controls">
                        <select class="preset-select" @change=${this.handlePresetChange} @click=${this._refreshPresetsOnOpen?.bind(this)}>
                            ${(this.presets || []).map(
                                p => html`<option value="${p.id}" ?selected=${(this.selectedPresetId || '') === (p.id || '')}>${p.title}</option>`
                            )}
                        </select>
                        <button class="toggle-button" @click=${this.toggleViewMode}>
                            ${this.viewMode === 'insights'
                                ? html`
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                                          <circle cx="12" cy="12" r="3" />
                                      </svg>
                                      <span>Show Transcript</span>
                                  `
                                : html`
                                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                          <path d="M9 11l3 3L22 4" />
                                          <path d="M22 12v7a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                                      </svg>
                                      <span>Show Insights</span>
                                  `}
                        </button>
                        <button
                            class="copy-button ${this.copyState === 'copied' ? 'copied' : ''}"
                            @click=${this.handleCopy}
                            @mouseenter=${() => this.handleCopyHover(true)}
                            @mouseleave=${() => this.handleCopyHover(false)}
                        >
                            <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                            <svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <path d="M20 6L9 17l-5-5" />
                            </svg>
                        </button>
                    </div>
                </div>

                <stt-view .isVisible=${this.viewMode === 'transcript'} @stt-messages-updated=${this.handleSttMessagesUpdated}></stt-view>

                <summary-view .isVisible=${this.viewMode === 'insights'} .hasCompletedRecording=${this.hasCompletedRecording}></summary-view>

                ${showListeningDots
                    ? html`
                          <div class="listening-dots">
                              <span class="listening-dot"></span>
                              <span class="listening-dot"></span>
                              <span class="listening-dot"></span>
                          </div>
                      `
                    : ''}
            </div>
        `;
    }
}

customElements.define('listen-view', ListenView);
