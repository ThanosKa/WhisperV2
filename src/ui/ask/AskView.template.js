import { html } from '../../ui/assets/lit-core-2.7.4.min.js';

export const renderTemplate = self => {
    const hasResponse = self.isLoading || self.currentResponse || self.isStreaming;
    const showAnalyzeThinking = self.isAnalyzing || self.isThinking;
    const showHeader = hasResponse || showAnalyzeThinking;
    
    // Response container should be hidden during analyze/thinking states
    const showResponseContainer = hasResponse && !showAnalyzeThinking;
    
    // Header text logic
    let headerText = 'AI Response';
    if (self.isAnalyzing) {
        headerText = 'Analyzing screen';
    } else if (self.isThinking) {
        headerText = 'Thinking';
    } else if (self.isLoading) {
        headerText = 'Thinking';
    }
    
    const isCompact = self.windowHeight < 50;

    return html`
        <div class="ask-container ${isCompact ? 'compact' : ''}">
            <!-- Header Container - using text-input-container styling -->
            <div class="text-input-container ${!showHeader ? 'hidden' : ''} ${showAnalyzeThinking ? 'analyze-thinking' : ''}">
                <div class="header-left">
                    <span class="header-text">${headerText}</span>
                    ${self.isThinking ? html`
                        <div class="header-thinking-dots">
                            <div class="thinking-dot"></div>
                            <div class="thinking-dot"></div>
                            <div class="thinking-dot"></div>
                        </div>
                    ` : ''}
                </div>
                <div class="header-controls">
                    <span class="question-text">${self.getTruncatedQuestion(self.currentQuestion)}</span>
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

            <!-- Response Container -->
            <div class="response-container ${!showResponseContainer ? 'hidden' : ''}" id="responseContainer">
                <!-- Content is dynamically generated in updateResponseContent() -->
            </div>

            <!-- Text Input Container -->
            <div class="text-input-container ${!self.showTextInput ? 'hidden' : ''}">
                <input type="text" id="textInput" placeholder="Ask anything" @keydown=${self.handleTextKeydown} @focus=${self.handleInputFocus} />
                <button class="submit-btn" @click=${self.handleSendText}>
                    <span class="btn-label">Submit</span>
                    <span class="btn-icon"> ↵ </span>
                </button>
            </div>
        </div>
    `;
};
