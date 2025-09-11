import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { sttViewStyles } from './stt-view.css.js';

export class SttView extends LitElement {
    static styles = sttViewStyles;

    static properties = {
        sttMessages: { type: Array },
        isVisible: { type: Boolean },
        copyStates: { type: Object, state: true },
    };

    constructor() {
        super();
        this.sttMessages = [];
        this.isVisible = true;
        this.messageIdCounter = 0;
        this._shouldScrollAfterUpdate = false;
        this.copyStates = new Map(); // Track copy states for each message

        this.handleSttUpdate = this.handleSttUpdate.bind(this);
        this.handleCopyMessage = this.handleCopyMessage.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        if (window.api) {
            window.api.sttView.onSttUpdate(this.handleSttUpdate);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (window.api) {
            window.api.sttView.removeOnSttUpdate(this.handleSttUpdate);
        }
    }

    // Handle session reset from parent
    resetTranscript() {
        this.sttMessages = [];
        this.requestUpdate();
    }

    handleSttUpdate(event, { speaker, text, isFinal, isPartial }) {
        if (text === undefined) return;

        const container = this.shadowRoot.querySelector('.transcription-container');
        this._shouldScrollAfterUpdate = container ? container.scrollTop + container.clientHeight >= container.scrollHeight - 10 : false;

        const findLastPartialIdx = spk => {
            for (let i = this.sttMessages.length - 1; i >= 0; i--) {
                const m = this.sttMessages[i];
                if (m.speaker === spk && m.isPartial) return i;
            }
            return -1;
        };

        const newMessages = [...this.sttMessages];
        const targetIdx = findLastPartialIdx(speaker);

        if (isPartial) {
            if (targetIdx !== -1) {
                newMessages[targetIdx] = {
                    ...newMessages[targetIdx],
                    text,
                    isPartial: true,
                    isFinal: false,
                };
            } else {
                newMessages.push({
                    id: this.messageIdCounter++,
                    speaker,
                    text,
                    isPartial: true,
                    isFinal: false,
                });
            }
        } else if (isFinal) {
            if (targetIdx !== -1) {
                newMessages[targetIdx] = {
                    ...newMessages[targetIdx],
                    text,
                    isPartial: false,
                    isFinal: true,
                };
            } else {
                newMessages.push({
                    id: this.messageIdCounter++,
                    speaker,
                    text,
                    isPartial: false,
                    isFinal: true,
                });
            }
        }

        this.sttMessages = newMessages;

        // Notify parent component about message updates
        this.dispatchEvent(
            new CustomEvent('stt-messages-updated', {
                detail: { messages: this.sttMessages },
                bubbles: true,
            })
        );
    }

    scrollToBottom() {
        setTimeout(() => {
            const container = this.shadowRoot.querySelector('.transcription-container');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }, 0);
    }

    getSpeakerClass(speaker) {
        return speaker.toLowerCase() === 'me' ? 'me' : 'them';
    }

    getTranscriptText() {
        return this.sttMessages.map(msg => `${msg.speaker}: ${msg.text}`).join('\n');
    }

    async handleCopyMessage(event, messageId, messageText) {
        event.stopPropagation();
        event.preventDefault();

        try {
            await navigator.clipboard.writeText(messageText);

            // Set copy state
            this.copyStates.set(messageId, 'copied');
            this.requestUpdate();

            // Reset after 2 seconds
            setTimeout(() => {
                this.copyStates.delete(messageId);
                this.requestUpdate();
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    }

    updated(changedProperties) {
        super.updated(changedProperties);

        if (changedProperties.has('sttMessages')) {
            if (this._shouldScrollAfterUpdate) {
                this.scrollToBottom();
                this._shouldScrollAfterUpdate = false;
            }
        }
    }

    render() {
        if (!this.isVisible) {
            return html`<div style="display: none;"></div>`;
        }

        return html`
            <div class="transcription-container">
                ${this.sttMessages.length === 0
                    ? html`<div class="empty-state">Waiting for speech</div>`
                    : this.sttMessages.map(msg => {
                          const copyState = this.copyStates.get(msg.id);
                          return html`
                              <div class="stt-message ${this.getSpeakerClass(msg.speaker)}">
                                  ${msg.text}
                                  <button
                                      class="msg-copy-button ${copyState === 'copied' ? 'copied' : ''}"
                                      @click=${e => this.handleCopyMessage(e, msg.id, msg.text)}
                                      title="Copy message"
                                  >
                                      <svg
                                          class="copy-icon"
                                          width="12"
                                          height="12"
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
                                          width="12"
                                          height="12"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          stroke-width="2.5"
                                      >
                                          <path d="M20 6L9 17l-5-5" />
                                      </svg>
                                  </button>
                              </div>
                          `;
                      })}
            </div>
        `;
    }
}

customElements.define('stt-view', SttView);
