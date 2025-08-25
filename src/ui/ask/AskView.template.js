import { html } from '../../ui/assets/lit-core-2.7.4.min.js';

export const renderTemplate = self => {
    const hasActualResponse = self.currentResponse && !self.isLoading && !self.isAnalyzing;
    const isCompact = self.windowHeight < 50;
    
    // Determine current state for unified container
    let currentState = 'ask'; // Default state
    let stateText = 'Ask anything';
    let showIcon = false;
    let showTextInput = true;
    let showHeaderControls = false;
    
    if (self.isAnalyzing) {
        currentState = 'analyzing';
        stateText = 'Analyzing screen';
        showIcon = true;
        showTextInput = false;
        showHeaderControls = false;
    } else if (self.isLoading) {
        currentState = 'thinking';
        stateText = 'Thinking';
        showIcon = true;
        showTextInput = false;
        showHeaderControls = false;
    } else if (hasActualResponse) {
        currentState = 'response';
        stateText = 'AI Response';
        showIcon = true;
        showTextInput = false;
        showHeaderControls = true;
    }

    return html`
        <div class="ask-container ${isCompact ? 'compact' : ''}">
            <!-- Unified State Container -->
            <div class="text-input-container ${currentState === 'ask' ? 'ask-state' : ''} ${currentState === 'analyzing' ? 'analyzing-state' : ''} ${currentState === 'thinking' ? 'thinking-state' : ''} ${currentState === 'response' ? 'response-state' : ''}">
                ${showIcon ? html`
                    <div class="state-icon">
                        ${currentState === 'analyzing' || currentState === 'thinking' ? html`
                            <svg class="brain-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
                                <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
                                <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
                                <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
                                <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
                                <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
                                <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
                                <path d="M6 18a4 4 0 0 1-1.967-.516"/>
                                <path d="M19.967 17.484A4 4 0 0 1 18 18"/>
                            </svg>
                        ` : html`
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 0 1-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 1 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 1 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 1-3.09 3.09Z"/>
                                <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"/>
                                <path d="M16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"/>
                            </svg>
                        `}
                    </div>
                ` : ''}
                
                <!-- Analyzing State -->
                ${currentState === 'analyzing' ? html`
                    <div class="state-content analyzing-content">
                        <span class="header-text analyzing-text">${stateText}</span>
                    </div>
                ` : ''}
                
                <!-- Thinking State -->
                ${currentState === 'thinking' ? html`
                    <div class="state-content thinking-content">
                        <span class="header-text thinking-text">${stateText}</span>
                        <div class="thinking-dots">
                            <div class="thinking-dot"></div>
                            <div class="thinking-dot"></div>
                            <div class="thinking-dot"></div>
                        </div>
                    </div>
                ` : ''}
                
                <!-- Response State -->
                ${currentState === 'response' ? html`
                    <span class="header-text">${stateText}</span>
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
                ` : ''}
                
                ${showTextInput ? html`
                    <input type="text" id="textInput" placeholder="${stateText}" @keydown=${self.handleTextKeydown} @focus=${self.handleInputFocus} />
                    <button class="submit-btn" @click=${self.handleSendText}>
                        <span class="btn-label">Submit</span>
                        <span class="btn-icon"> ↵ </span>
                    </button>
                ` : ''}
            </div>

            <!-- Response Container - Only shown when there's actual content -->
            ${hasActualResponse ? html`
                <div class="response-container" id="responseContainer">
                    <!-- Content is dynamically generated in renderContent() -->
                </div>
            ` : ''}
        </div>
    `;
};
