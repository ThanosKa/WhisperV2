import { html } from '../../ui/assets/lit-core-2.7.4.min.js';

export const renderTemplate = self => {
    // Determine state
    const isThinking = self.isLoading || (self.isStreaming && !self.currentResponse);
    const hasHistoryOrContent = !!(self.currentResponse || (self.messages && self.messages.length > 0));

    // Header should be visible during Thinking and during/after response
    const showHeader = isThinking || hasHistoryOrContent;
    // Response container (bubbles) should be hidden during pure Thinking
    const showResponseContainer = !isThinking && hasHistoryOrContent;

    let headerText = isThinking ? 'Thinking' : 'AI Response';
    let headerClass = isThinking ? 'pulsing' : '';

    const isCompact = self.windowHeight < 50;
    const inputPulsing = !showResponseContainer ? 'pulsing' : '';

    // Show dots for thinking state only
    const showThinkingDots = isThinking;

    // Helper to render assistant message content as sanitized HTML (non-streaming)
    const renderMessageHTML = text => {
        if (!text) return '';
        try {
            if (self.isLibrariesLoaded && self.marked && self.DOMPurify) {
                const parsed = self.marked.parse(text);
                return self.DOMPurify.sanitize(parsed, {
                    ALLOWED_TAGS: [
                        'h1',
                        'h2',
                        'h3',
                        'h4',
                        'h5',
                        'h6',
                        'p',
                        'br',
                        'strong',
                        'b',
                        'em',
                        'i',
                        's',
                        'ul',
                        'ol',
                        'li',
                        'blockquote',
                        'code',
                        'pre',
                        'a',
                        'img',
                        'table',
                        'thead',
                        'tbody',
                        'tr',
                        'th',
                        'td',
                        'hr',
                        'sup',
                        'sub',
                        'del',
                        'ins',
                        // Allow checklist inputs (GFM task lists)
                        'input',
                    ],
                    ALLOWED_ATTR: [
                        'href',
                        'src',
                        'alt',
                        'title',
                        'class',
                        'id',
                        'target',
                        'rel',
                        // Attributes for checklist inputs
                        'type',
                        'checked',
                        'disabled',
                        'value',
                    ],
                });
            }
            // Basic fallback
            return (text || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n\n/g, '</p><p>')
                .replace(/\n/g, '<br>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/`([^`]+)`/g, '<code>$1</code>');
        } catch (e) {
            return text;
        }
    };

    return html`
        <div class="ask-container ${isCompact ? 'compact' : ''}">
            <!-- Response Header -->
            <div class="response-header ${!showHeader ? 'hidden' : ''}">
                <div class="header-left">
                    <div class="response-icon">
                        ${isThinking
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

            <!-- Chat History Container -->
            <div class="response-container ${!showResponseContainer ? 'hidden' : ''}">
                <div class="chat-list">
                    ${self.messages.map((m, idx) => {
                        const isAssistant = m.role === 'assistant';
                        const isLast = idx === self.messages.length - 1;
                        // Only stream into bubble when not in Thinking state
                        const isStreamingTarget = isAssistant && isLast && self.isStreaming && !isThinking;
                        return html` <div class="message ${isAssistant ? 'assistant' : 'user'}">
                            <div class="bubble ${isAssistant ? 'bubble-assistant' : 'bubble-user'}">
                                ${isAssistant
                                    ? html`
                                          <button
                                              class="copy-button bubble-copy ${self.messageCopyState?.[m.id] ? 'copied' : ''}"
                                              @click=${() => self.handleCopyMessage(m.id)}
                                              title="Copy reply"
                                          >
                                              <svg
                                                  class="copy-icon"
                                                  width="14"
                                                  height="14"
                                                  viewBox="0 0 24 24"
                                                  fill="none"
                                                  stroke="currentColor"
                                                  stroke-width="2"
                                              >
                                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                              </svg>
                                              <svg
                                                  class="check-icon"
                                                  width="16"
                                                  height="16"
                                                  viewBox="0 0 24 24"
                                                  fill="none"
                                                  stroke="currentColor"
                                                  stroke-width="2.5"
                                              >
                                                  <path d="M20 6L9 17l-5-5" />
                                              </svg>
                                          </button>
                                      `
                                    : ''}
                                ${isStreamingTarget
                                    ? html`<div class="assistant-stream" id="responseContainer"></div>`
                                    : isAssistant
                                      ? html`
                                            <div class="assistant-html" .innerHTML=${renderMessageHTML(m.content || '')}></div>
                                            ${self.interrupted && isLast && !self.isStreaming
                                                ? html`<div class="interruption-indicator">Interrupted</div>`
                                                : ''}
                                        `
                                      : html`<div class="user-text">${m.content || ''}</div>`}
                            </div>
                        </div>`;
                    })}
                </div>
            </div>

            <!-- Text Input Container -->
            <div class="text-input-container ${!showResponseContainer ? 'no-response' : ''} ${!self.showTextInput ? 'hidden' : ''}">
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
