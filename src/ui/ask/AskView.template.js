import { html } from '../../ui/assets/lit-core-2.7.4.min.js';

export const renderTemplate = self => {
    const hasResponse = self.isLoading || self.currentResponse || self.isStreaming;
    let headerText = 'AI Response';
    let headerClass = '';

    if (self.isAnalyzing) {
        headerText = 'Analyzing';
        headerClass = 'pulsing';
    } else if (self.isLoading || (self.isStreaming && !self.currentResponse)) {
        headerText = 'Thinking';
        headerClass = 'pulsing';
    }

    const isCompact = self.windowHeight < 50;
    const inputPulsing = !hasResponse ? 'pulsing' : '';

    // Show dots for both analyzing and thinking states
    const showAnalyzingDots = self.isAnalyzing;
    const showThinkingDots = (self.isLoading || (self.isStreaming && !self.currentResponse)) && !self.isAnalyzing;

    return html`
        <div class="ask-container ${isCompact ? 'compact' : ''}">
            <!-- Response Header -->
            <div class="response-header ${!hasResponse ? 'hidden' : ''}">
                <div class="header-left">
                    <div class="response-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                            <path d="M8 12l2 2 4-4" />
                        </svg>
                    </div>
                    <span class="response-label ${headerClass}">${headerText}</span>
                    ${showAnalyzingDots
                        ? html`
                              <div class="thinking-dots analyzing-slide">
                                  <div class="thinking-dot"></div>
                                  <div class="thinking-dot"></div>
                                  <div class="thinking-dot"></div>
                              </div>
                          `
                        : ''}
                    ${showThinkingDots
                        ? html`
                              <div class="thinking-dots thinking-slide">
                                  <div class="thinking-dot"></div>
                                  <div class="thinking-dot"></div>
                                  <div class="thinking-dot"></div>
                              </div>
                          `
                        : ''}
                </div>
                <div class="header-right">
                    <span class="question-text">${self.getTruncatedQuestion(self.currentQuestion)}</span>
                    <div class="header-controls">
                        <button class="copy-button ${self.copyState === 'copied' ? 'copied' : ''}" @click=${self.handleCopy}>
                            <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                            <svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <path d="M20 6L9 17l-5-5" />
                            </svg>
                        </button>
                        <button class="close-button" @click=${self.handleCloseAskWindow}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Response Container -->
            <div class="response-container ${!hasResponse ? 'hidden' : ''}" id="responseContainer">
                <!-- Content is dynamically generated in updateResponseContent() -->
            </div>

            <!-- Text Input Container -->
            <div class="text-input-container ${!hasResponse ? 'no-response' : ''} ${!self.showTextInput ? 'hidden' : ''}">
                <input
                    type="text"
                    id="textInput"
                    class="${inputPulsing}"
                    placeholder="Ask anything"
                    @keydown=${self.handleTextKeydown}
                    @focus=${self.handleInputFocus}
                />
                <button class="submit-btn" @click=${self.handleSendText}>
                    <span class="btn-label">Submit</span>
                    <span class="btn-icon"> ↵ </span>
                </button>
            </div>
        </div>
    `;
};
