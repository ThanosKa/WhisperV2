import { html } from '../../ui/assets/lit-core-2.7.4.min.js';

export const renderTemplate = self => {
    const hasResponse = self.isLoading || self.currentResponse || self.isStreaming || self.isSearching;
    let headerText = 'AI Response';
    let headerClass = '';

    // Prioritize search/analyze states
    if (self.isSearching && !self.searchCompleted) {
        headerText = 'Searching';
        headerClass = 'pulsing';
    } else if (self.isAnalyzing) {
        headerText = 'Analyze';
        headerClass = 'pulsing';
    } else if (self.isLoading || (self.isStreaming && !self.currentResponse)) {
        headerText = 'Thinking';
        headerClass = 'pulsing thinking-slide-in';
    }

    const isCompact = self.windowHeight < 50;
    const inputPulsing = !hasResponse ? 'pulsing' : '';

    // Show dots for analyze, thinking, and searching states
    const showThinkingDots = self.isAnalyzing || self.isLoading || (self.isStreaming && !self.currentResponse) || self.isSearching;

    // Determine which icon to show based on state
    const isThinking = (self.isLoading || (self.isStreaming && !self.currentResponse)) && !self.isSearching;
    const isAnalyzing = self.isAnalyzing && !self.isSearching;
    const isSearching = self.isSearching;

    return html`
        <div class="ask-container ${isCompact ? 'compact' : ''}">
            <!-- Response Header -->
            <div class="response-header ${!hasResponse ? 'hidden' : ''}">
                <div class="header-left">
                    <div class="response-icon">
                        ${isSearching
                            ? html`
                                  <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="24"
                                      height="24"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      stroke-width="2"
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                      class="lucide lucide-globe-icon lucide-globe"
                                  >
                                      <circle cx="12" cy="12" r="10" />
                                      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                                      <path d="M2 12h20" />
                                  </svg>
                              `
                            : isAnalyzing || isThinking
                              ? html`
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="24"
                                        height="24"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        class="lucide lucide-brain-icon lucide-brain"
                                    >
                                        <path d="M12 18V5" />
                                        <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
                                        <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
                                        <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
                                        <path d="M18 18a4 4 0 0 0 2-7.464" />
                                        <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
                                        <path d="M6 18a4 4 0 0 1-2-7.464" />
                                        <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
                                    </svg>
                                `
                              : html`
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="24"
                                        height="24"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        class="lucide lucide-sparkles-icon lucide-sparkles"
                                    >
                                        <path
                                            d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
                                        />
                                        <path d="M20 2v4" />
                                        <path d="M22 4h-4" />
                                        <circle cx="4" cy="20" r="2" />
                                    </svg>
                                `}
                    </div>
                    <span class="response-label ${headerClass}">${headerText}</span>
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
                    ${self.currentQuestion ? html`<span class="question-text">${self.getTruncatedQuestion(self.currentQuestion)}</span>` : ''}
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

            <!-- Response Container Placeholder -->
            <div id="responseContainerSlot"></div>

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
                <button
                    class="web-search-btn ${self.webSearchEnabled ? 'active' : 'inactive'}"
                    @click=${self.handleToggleWebSearch}
                    title="Toggle Web Search"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        class="lucide lucide-globe-icon lucide-globe"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                        <path d="M2 12h20" />
                    </svg>
                </button>
                <button class="use-screen-btn ${self.useScreenCapture ? 'active' : 'inactive'}" @click=${self.handleToggleScreenCapture}>
                    Use Screen
                </button>
                <button class="submit-btn" @click=${self.handleSendText}>
                    <span class="btn-label">Submit</span>
                    <span class="btn-icon"> ↵ </span>
                </button>
            </div>
        </div>
    `;
};
