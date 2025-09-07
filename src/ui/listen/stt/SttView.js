import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class SttView extends LitElement {
    static styles = css`
        :host {
            display: block;
            width: 100%;
        }

        /* Inherit font styles from parent */

        .transcription-container {
            overflow-y: auto;
            padding: 12px 12px 16px 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            /* Dynamic sizing: grows with content, scrolls when exceeds window */
            min-height: 200px; /* Minimum for empty state */
            max-height: 450px; /* Leave room for top bar */
            height: auto;
            position: relative;
            z-index: 1;
            flex: 1;
            box-sizing: border-box;
        }

        /* Visibility handled by parent component */

        .transcription-container::-webkit-scrollbar {
            width: 8px;
        }
        .transcription-container::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.1);
            border-radius: 4px;
        }
        .transcription-container::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.3);
            border-radius: 4px;
        }
        .transcription-container::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.5);
        }

        .stt-message {
            padding: 8px 12px;
            border-radius: 12px;
            max-width: 80%;
            word-wrap: break-word;
            word-break: break-word;
            line-height: 1.5;
            font-size: 13px;
            margin-bottom: 4px;
            box-sizing: border-box;
            position: relative;
            cursor: pointer;
            transition: background-color 0.15s ease;
        }

        .stt-message.them {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.9);
            align-self: flex-start;
            border-bottom-left-radius: 4px;
            margin-right: auto;
        }

        .stt-message.them:hover {
            background: rgba(255, 255, 255, 0.15);
        }

        .stt-message.me {
            background: rgba(0, 122, 255, 0.8);
            color: white;
            align-self: flex-end;
            border-bottom-right-radius: 4px;
            margin-left: auto;
        }

        .stt-message.me:hover {
            background: rgba(0, 122, 255, 0.9);
        }

        /* Hover state for messages to show copy button */
        .stt-message:hover .msg-copy-button {
            opacity: 1;
            pointer-events: auto;
        }

        /* Per-message copy button - matching AskView styles */
        .msg-copy-button {
            position: absolute;
            top: 8px;
            right: 8px;
            background: rgba(0, 0, 0, 0.8);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 4px;
            padding: 4px;
            cursor: pointer !important;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease, background-color 0.15s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            z-index: 10;
        }

        .msg-copy-button:hover {
            background: rgba(0, 0, 0, 0.9);
        }

        /* Match header copy button behavior on copy (icon swap only, no green bg) */
        .msg-copy-button.copied {
            background: rgba(0, 0, 0, 0.8);
        }

        .msg-copy-button svg {
            width: 12px;
            height: 12px;
            color: rgba(255, 255, 255, 0.9);
            transition: opacity 0.2s ease, transform 0.2s ease;
            cursor: pointer !important;
            pointer-events: none;
        }

        .msg-copy-button .check-icon {
            opacity: 0;
            transform: scale(0.5);
            position: absolute;
        }

        .msg-copy-button.copied .copy-icon {
            opacity: 0;
            transform: scale(0.5);
        }

        .msg-copy-button.copied .check-icon {
            opacity: 1;
            transform: scale(1);
        }

        .empty-state {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100px;
            color: rgba(255, 255, 255, 0.6);
            font-size: 12px;
            font-style: italic;
        }
    `;

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
                    ? html`<div class="empty-state">Waiting for speech...</div>`
                    : this.sttMessages.map(msg => {
                        const copyState = this.copyStates.get(msg.id);
                        return html`
                            <div class="stt-message ${this.getSpeakerClass(msg.speaker)}">
                                ${msg.text}
                                <button 
                                    class="msg-copy-button ${copyState === 'copied' ? 'copied' : ''}"
                                    @click=${(e) => this.handleCopyMessage(e, msg.id, msg.text)}
                                    title="Copy message"
                                >
                                    <svg class="copy-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                    </svg>
                                    <svg class="check-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
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
