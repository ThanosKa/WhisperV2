import { html, css, LitElement } from '../../ui/assets/lit-core-2.7.4.min.js';
import { parser, parser_write, parser_end, default_renderer } from '../../ui/assets/smd.js';
import { styles } from './ask-view.css.js';
import { renderTemplate } from './AskView.template.js';

const BASE_DELAY = 1; // ms - Much faster
const MIN_DELAY = 0; // ms

function calcDelay(wordIndex) {
    // Faster adaptive delay - speeds up quickly
    return Math.max(MIN_DELAY, BASE_DELAY * Math.exp(-wordIndex / 30));
}

export class AskView extends LitElement {
    static properties = {
        currentResponse: { type: String },
        currentQuestion: { type: String },
        isLoading: { type: Boolean },
        copyState: { type: String },
        isHovering: { type: Boolean },
        hoveredLineIndex: { type: Number },
        lineCopyState: { type: Object },
        showTextInput: { type: Boolean },
        headerText: { type: String },
        headerAnimating: { type: Boolean },
        isStreaming: { type: Boolean },
        windowHeight: { type: Number },
        interrupted: { type: Boolean },
        isAnalyzing: { type: Boolean },
    };

    static styles = styles;

    constructor() {
        super();
        this.currentResponse = '';
        this.currentQuestion = '';
        this.isLoading = false;
        this.copyState = 'idle';
        this.showTextInput = true;
        this.headerText = 'AI Response';
        this.headerAnimating = false;
        this.isStreaming = false;
        this.windowHeight = window.innerHeight;
        this.interrupted = false;
        this.isAnalyzing = false;

        this.isAnimating = false; // Tracks typewriter animation state

        this.displayBuffer = ''; // what the user sees
        this.typewriterInterval = null; // interval id
        this.pendingText = ''; // full answer still arriving

        // Tracks whether we already appended the current question locally
        this._appendedCurrentQuestion = false;

        this.marked = null;
        this.hljs = null;
        this.DOMPurify = null;
        this.isLibrariesLoaded = false;

        // SMD.js streaming markdown parser
        this.smdParser = null;
        this.smdContainer = null;
        this.lastProcessedLength = 0;
        this.wordCount = 0;

        this.handleSendText = this.handleSendText.bind(this);
        this.handleTextKeydown = this.handleTextKeydown.bind(this);
        this.handleCopy = this.handleCopy.bind(this);
        this.clearResponseContent = this.clearResponseContent.bind(this);
        this.handleEscKey = this.handleEscKey.bind(this);
        this.handleCloseAskWindow = this.handleCloseAskWindow.bind(this);
        this.handleCloseIfNoContent = this.handleCloseIfNoContent.bind(this);

        // Analyze timeout reference
        this.analyzeTimeout = null;

        this.loadLibraries();

        // --- Resize helpers ---
        this.isThrottled = false;

        // Link interception flag
        this._linkHandlerAttached = false;

        // Auto-scroll state
        this._autoScroll = true; // keep scrolled to bottom while streaming
        this._scrollHandlerAttached = false;
        this._onResponseScroll = null;
    }

    connectedCallback() {
        super.connectedCallback();

        console.log('📱 AskView connectedCallback - Setting up IPC event listeners');

        document.addEventListener('keydown', this.handleEscKey);

        this.resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const contentHeight = entry.contentRect.height;
                const borderPadding = 10;
                const targetHeight = Math.min(650, Math.max(50, contentHeight + borderPadding));

                // Only resize if window is smaller than needed content
                if (targetHeight > window.innerHeight - 4) {
                    this.requestWindowResize(targetHeight);
                }
            }
        });

        const container = this.shadowRoot?.querySelector('.ask-container');
        if (container) this.resizeObserver.observe(container);

        // Attach scroll listener when response container is available
        this.updateComplete.then(() => this.attachResponseScrollHandler());

        this.handleQuestionFromAssistant = (event, question) => {
            console.log('AskView: Received question from ListenView:', question);
            this.handleSendText(null, question);
        };

        if (window.api) {
            this._onShowTextInputFn = () => {
                console.log('Show text input signal received');
                if (!this.showTextInput) {
                    this.showTextInput = true;
                    this.updateComplete.then(() => this.focusTextInput());
                } else {
                    this.focusTextInput();
                }
            };
            window.api.askView.onShowTextInput(this._onShowTextInputFn);

            this._onAskStateUpdateFn = (event, newState) => {
                const wasLoading = this.isLoading;
                this.currentResponse = newState.currentResponse;
                this.currentQuestion = newState.currentQuestion;
                this.isLoading = newState.isLoading;
                this.isStreaming = newState.isStreaming;
                this.interrupted = newState.interrupted;

                // Handle analyze state transition
                if (newState.isLoading && !wasLoading) {
                    this.startAnalyzeState();
                }

                const wasHidden = !this.showTextInput;
                this.showTextInput = newState.showTextInput;

                if (newState.showTextInput) {
                    if (wasHidden) {
                        this.updateComplete.then(() => this.focusTextInput());
                    } else {
                        this.focusTextInput();
                    }
                }

                // If a new request started from backend (no local append), add user bubble
                if (newState.isLoading && !wasLoading && newState.currentQuestion) {
                    if (this._appendedCurrentQuestion) {
                        // We already appended locally for this question; reset flag to avoid duplicates
                        this._appendedCurrentQuestion = false;
                    } else {
                        this.appendUserMessage(newState.currentQuestion);
                    }
                }
            };
            window.api.askView.onAskStateUpdate(this._onAskStateUpdateFn);
            // Fallback UI for AI/stream errors
            this.handleAskStreamError = (event, payload) => {
                console.warn('AskView: Stream error received', payload?.error);
                this.isLoading = false;
                this.isStreaming = true;
                this.interrupted = false;
                this.showTextInput = false;

                const isQuota = payload && (payload.error === 'quota_exceeded' || /429|too many requests/i.test(String(payload.error || '')));
                if (isQuota) {
                    const baseUrl = (window.api?.env?.API_BASE_URL || 'https://app.glass.ai').replace(/\/$/, '');
                    const pricingUrl = `${baseUrl}/pricing`;
                    this.currentResponse = `**Daily limit reached**\n\nYou've used all your free responses for today.\n\n[Upgrade to Pro](${pricingUrl}) for unlimited responses.`;
                } else {
                    this.currentResponse = 'Something went wrong.';
                }
                this.renderContent();
                this.adjustWindowHeightThrottled();
            };
            window.api.askView.onAskStreamError(this.handleAskStreamError);
            console.log('AskView: IPC event listeners registered successfully');
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.typewriterInterval) {
            clearInterval(this.typewriterInterval);
            this.typewriterInterval = null;
        }
        this.resizeObserver?.disconnect();

        console.log('📱 AskView disconnectedCallback - Removing IPC event listeners');

        document.removeEventListener('keydown', this.handleEscKey);

        if (this.copyTimeout) {
            clearTimeout(this.copyTimeout);
        }

        if (this.headerAnimationTimeout) {
            clearTimeout(this.headerAnimationTimeout);
        }

        if (this.streamingTimeout) {
            clearTimeout(this.streamingTimeout);
        }

        if (this.analyzeTimeout) {
            clearTimeout(this.analyzeTimeout);
        }

        Object.values(this.lineCopyTimeouts).forEach(timeout => clearTimeout(timeout));

        if (window.api) {
            if (this._onAskStateUpdateFn) {
                window.api.askView.removeOnAskStateUpdate(this._onAskStateUpdateFn);
                this._onAskStateUpdateFn = null;
            }
            if (this._onShowTextInputFn) {
                window.api.askView.removeOnShowTextInput(this._onShowTextInputFn);
                this._onShowTextInputFn = null;
            }
            if (this.handleAskStreamError) {
                window.api.askView.removeOnAskStreamError(this.handleAskStreamError);
            }
            console.log('✅ AskView: IPC event listeners removed');
        }

        // Detach scroll listener
        const resp = this.shadowRoot?.getElementById('responseContainer');
        if (resp && this._onResponseScroll) {
            resp.removeEventListener('scroll', this._onResponseScroll);
        }
        this._scrollHandlerAttached = false;
        this._onResponseScroll = null;
    }

    async loadLibraries() {
        try {
            if (!window.marked) {
                await this.loadScript('../../assets/marked-4.3.0.min.js');
            }

            if (!window.hljs) {
                await this.loadScript('../../assets/highlight-11.9.0.min.js');
            }

            if (!window.DOMPurify) {
                await this.loadScript('../../assets/dompurify-3.0.7.min.js');
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
                this.renderContent();
                console.log('Markdown libraries loaded successfully in AskView');
            }

            if (this.DOMPurify) {
                this.isDOMPurifyLoaded = true;
                console.log('DOMPurify loaded successfully in AskView');
            }
        } catch (error) {
            console.error('Failed to load libraries in AskView:', error);
        }
    }

    handleCloseAskWindow() {
        this.clearResponseContent();
        this.clearConversationHistory();
        window.api.askView.closeAskWindow();
    }

    handleCloseIfNoContent() {
        if (!this.currentResponse && !this.isLoading && !this.isStreaming) {
            this.handleCloseAskWindow();
        }
    }

    handleEscKey(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            if (this.isStreaming || this.isAnimating) {
                this.handleInterrupt();
            } else {
                this.handleCloseIfNoContent();
            }
        }
    }

    clearResponseContent() {
        this.currentResponse = '';
        this.currentQuestion = '';
        this.isLoading = false;
        this.isStreaming = false;
        this.isAnalyzing = false;
        this.headerText = 'AI Response';
        this.showTextInput = true;
        this.lastProcessedLength = 0;
        this.smdParser = null;
        this.smdContainer = null;
        this.wordCount = 0;
        this.interrupted = false;
        this._appendedCurrentQuestion = false;

        // Clear analyze timeout
        if (this.analyzeTimeout) {
            clearTimeout(this.analyzeTimeout);
            this.analyzeTimeout = null;
        }
    }

    clearConversationHistory() {
        const responseContainer = this.shadowRoot?.getElementById('responseContainer');
        if (responseContainer) {
            responseContainer.innerHTML = '';
        }
        console.log('Conversation history cleared');
    }

    startAnalyzeState() {
        this.isAnalyzing = true;

        // Clear any existing timeout
        if (this.analyzeTimeout) {
            clearTimeout(this.analyzeTimeout);
        }

        // Transition to thinking after 800ms
        this.analyzeTimeout = setTimeout(() => {
            this.isAnalyzing = false;
            this.requestUpdate();
        }, 800);

        this.requestUpdate();
    }

    handleInputFocus() {
        this.isInputFocused = true;
    }

    focusTextInput() {
        requestAnimationFrame(() => {
            const textInput = this.shadowRoot?.getElementById('textInput');
            if (textInput) {
                textInput.focus();
            }
        });
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
            console.error('Markdown parsing error in AskView:', error);
            return text;
        }
    }

    fixIncompleteCodeBlocks(text) {
        if (!text) return text;

        const codeBlockMarkers = text.match(/```/g) || [];
        const markerCount = codeBlockMarkers.length;

        if (markerCount % 2 === 1) {
            return text + '\n```';
        }

        return text;
    }

    renderContent() {
        const responseContainer = this.shadowRoot.getElementById('responseContainer');
        if (!responseContainer) return;

        // Show loading indicator during initial loading (before any response content)
        if (this.isLoading && !this.currentResponse) {
            this.ensureLoadingContainer(responseContainer);
            // Enable auto-scroll for new loading state
            this._autoScroll = true;
        } else {
            // Remove loading container when we start streaming content
            const loadingContainer = responseContainer.querySelector('#loadingContainer');
            if (loadingContainer) {
                loadingContainer.parentElement.remove();
            }
        }

        // Show streaming loading indicator when we're streaming but no content yet
        if (this.isStreaming && !this.currentResponse) {
            this.ensureStreamingLoadingContainer(responseContainer);
            // Enable auto-scroll for new streaming loading state
            this._autoScroll = true;
        } else {
            // Remove streaming loading container when content starts arriving
            const streamingLoadingContainer = responseContainer.querySelector('#streamingLoadingContainer');
            if (streamingLoadingContainer) {
                streamingLoadingContainer.parentElement.remove();
            }
        }

        // Ensure scroll handler exists
        this.attachResponseScrollHandler();

        // Set streaming markdown parser
        if (this.currentResponse) {
            // Only initialize or re-render streaming view when actively streaming
            // or when there is no existing rendered container (e.g., first paint).
            const containerMissing = !this.smdContainer || !this.smdContainer.isConnected;
            if (this.isStreaming || containerMissing) {
                this.renderStreamingMarkdown(responseContainer);
            }
        }

        // After updating content, recalculate window height
        this.adjustWindowHeightThrottled();
    }

    resetStreamingParser() {
        this.smdParser = null;
        this.smdContainer = null;
        this.lastProcessedLength = 0;
        this.wordCount = 0;
    }

    renderStreamingMarkdown(responseContainer) {
        try {
            const streamTarget = this.ensureAssistantStreamContainer(responseContainer);
            if (!this.smdParser || this.smdContainer !== streamTarget) {
                this.smdContainer = streamTarget;
                streamTarget.innerHTML = '';
                const renderer = default_renderer(this.smdContainer);
                this.smdParser = parser(renderer);
                this.displayBuffer = '';
                this.pendingText = '';
                this.lastProcessedLength = 0;
                this.wordCount = 0;
                // New stream: re-enable auto-scroll by default
                this._autoScroll = true;
            }

            this.pendingText = this.currentResponse;

            if (!this.typewriterInterval) {
                const typeNextChunk = () => {
                    if (!this.isStreaming && this.displayBuffer.length >= this.pendingText.length) {
                        this.stop();
                        return;
                    }

                    const nextWordEnd = this.pendingText.indexOf(' ', this.displayBuffer.length + 1);
                    const sliceEnd = nextWordEnd === -1 ? this.pendingText.length : nextWordEnd;
                    const nextChunk = this.pendingText.slice(this.displayBuffer.length, sliceEnd);

                    if (nextChunk) {
                        this.displayBuffer += nextChunk;
                        parser_write(this.smdParser, nextChunk);
                        this.wordCount++;

                        if (this.hljs) {
                            this.smdContainer.querySelectorAll('pre code:not([data-highlighted])').forEach(block => {
                                this.hljs.highlightElement(block);
                                block.setAttribute('data-highlighted', 'true');
                            });
                        }
                        // Ensure links look and behave correctly
                        this.decorateLinks(this.smdContainer);
                        this.attachLinkInterceptor();
                        // Smart buffer handles resize frequency
                        this.adjustWindowHeightThrottled();

                        // Auto-scroll to bottom while streaming unless user scrolled up
                        if (this._autoScroll) {
                            requestAnimationFrame(() => {
                                try {
                                    responseContainer.scrollTop = responseContainer.scrollHeight;
                                } catch (_) {}
                            });
                        }
                    }

                    if (this.displayBuffer.length < this.pendingText.length || this.isStreaming) {
                        this.typewriterInterval = setTimeout(typeNextChunk, calcDelay(this.wordCount));
                    } else {
                        this.stop();
                    }
                };
                this.typewriterInterval = setTimeout(typeNextChunk, calcDelay(this.wordCount));
                this.isAnimating = true;
            }
        } catch (err) {
            console.error('Streaming render error:', err);
            this.renderFallbackContent(responseContainer);
        }
    }

    ensureAssistantStreamContainer(responseContainer) {
        // Return existing active stream if present
        let active = responseContainer.querySelector('#assistantStream');
        if (active) return active;

        // Create minimal assistant message block (no avatar/text, no background)
        const msg = document.createElement('div');
        msg.className = 'msg msg-assistant';
        const inner = document.createElement('div');
        inner.className = 'msg-content';
        inner.id = 'assistantStream';

        // Add copy button for AI messages (hidden during streaming)
        const copyButton = document.createElement('button');
        copyButton.className = 'msg-copy-button';
        copyButton.style.display = 'none'; // Hide during streaming
        copyButton.innerHTML = `
            <svg class="copy-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            <svg class="check-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M20 6L9 17l-5-5" />
            </svg>
        `;
        copyButton.addEventListener('click', () => this.handleMessageCopy(inner));

        msg.appendChild(inner);
        msg.appendChild(copyButton);
        responseContainer.appendChild(msg);
        return inner;
    }

    ensureLoadingContainer(responseContainer) {
        // Return existing loading container if present
        let loading = responseContainer.querySelector('#loadingContainer');
        if (loading) return loading;

        // Create loading message block with bouncing dots
        const msg = document.createElement('div');
        msg.className = 'msg msg-assistant';
        const inner = document.createElement('div');
        inner.className = 'msg-content loading-indicator';
        inner.id = 'loadingContainer';
        inner.innerHTML = `
    <div class="thinking-single">
        <div class="thinking-single-dot"></div>
    </div>
        `;

        // Add copy button for loading messages (hidden initially)
        const copyButton = document.createElement('button');
        copyButton.className = 'msg-copy-button';
        copyButton.style.display = 'none'; // Hide for loading state
        copyButton.innerHTML = `
            <svg class="copy-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            <svg class="check-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M20 6L9 17l-5-5" />
            </svg>
        `;
        copyButton.addEventListener('click', () => this.handleMessageCopy(inner));

        msg.appendChild(inner);
        msg.appendChild(copyButton);
        responseContainer.appendChild(msg);

        // Auto-scroll to show the loading indicator
        requestAnimationFrame(() => {
            try {
                responseContainer.scrollTop = responseContainer.scrollHeight;
            } catch (_) {}
        });

        return inner;
    }

    ensureStreamingLoadingContainer(responseContainer) {
        // Return existing streaming loading container if present
        let loading = responseContainer.querySelector('#streamingLoadingContainer');
        if (loading) return loading;

        // Create streaming loading message block with bouncing dots
        const msg = document.createElement('div');
        msg.className = 'msg msg-assistant';
        const inner = document.createElement('div');
        inner.className = 'msg-content loading-indicator';
        inner.id = 'streamingLoadingContainer';
        inner.innerHTML = `
            <div class="thinking-dots">
                <div class="thinking-dot"></div>
                <div class="thinking-dot"></div>
                <div class="thinking-dot"></div>
            </div>
        `;

        // Add copy button for streaming loading messages (hidden initially)
        const copyButton = document.createElement('button');
        copyButton.className = 'msg-copy-button';
        copyButton.style.display = 'none'; // Hide for loading state
        copyButton.innerHTML = `
            <svg class="copy-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            <svg class="check-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M20 6L9 17l-5-5" />
            </svg>
        `;
        copyButton.addEventListener('click', () => this.handleMessageCopy(inner));

        msg.appendChild(inner);
        msg.appendChild(copyButton);
        responseContainer.appendChild(msg);

        // Auto-scroll to show the streaming loading indicator
        requestAnimationFrame(() => {
            try {
                responseContainer.scrollTop = responseContainer.scrollHeight;
            } catch (_) {}
        });

        return inner;
    }

    appendUserMessage(text) {
        const responseContainer = this.shadowRoot.getElementById('responseContainer');
        if (!responseContainer) return;
        const msg = document.createElement('div');
        msg.className = 'msg msg-user';
        const inner = document.createElement('div');
        inner.className = 'msg-content msg-user-bubble';
        inner.textContent = text; // plain text to avoid injection

        // Add copy button for user messages
        const copyButton = document.createElement('button');
        copyButton.className = 'msg-copy-button';
        copyButton.innerHTML = `
            <svg class="copy-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            <svg class="check-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M20 6L9 17l-5-5" />
            </svg>
        `;
        copyButton.addEventListener('click', () => this.handleMessageCopy(inner));

        msg.appendChild(inner);
        msg.appendChild(copyButton);
        responseContainer.appendChild(msg);

        requestAnimationFrame(() => {
            try {
                responseContainer.scrollTop = responseContainer.scrollHeight;
            } catch (_) {}
        });
        this.adjustWindowHeightThrottled();
    }

    attachResponseScrollHandler() {
        if (this._scrollHandlerAttached) return;
        const resp = this.shadowRoot?.getElementById('responseContainer');
        if (!resp) return;
        this._onResponseScroll = () => {
            const threshold = 24; // px from bottom treated as "at bottom"
            const distanceFromBottom = resp.scrollHeight - resp.scrollTop - resp.clientHeight;
            this._autoScroll = distanceFromBottom <= threshold;
        };
        resp.addEventListener('scroll', this._onResponseScroll, { passive: true });
        this._scrollHandlerAttached = true;
    }

    renderFallbackContent(responseContainer) {
        const textToRender = this.currentResponse || '';
        // Render into the active assistant stream container if available
        const target = this.ensureAssistantStreamContainer(responseContainer);

        if (this.isLibrariesLoaded && this.marked && this.DOMPurify) {
            try {
                // Markdown parsing
                const parsedHtml = this.marked.parse(textToRender);

                // Sanitize with DOMPurify
                const cleanHtml = this.DOMPurify.sanitize(parsedHtml, {
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
                    ],
                    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel'],
                });

                target.innerHTML = cleanHtml;

                // Apply code highlighting
                if (this.hljs) {
                    target.querySelectorAll('pre code').forEach(block => {
                        this.hljs.highlightElement(block);
                    });
                }

                // Ensure links look and behave correctly
                this.decorateLinks(target);
                this.attachLinkInterceptor();
            } catch (error) {
                console.error('Error in fallback rendering:', error);
                target.textContent = textToRender;
            }
        } else {
            // Basic rendering when libraries are not loaded
            const basicHtml = textToRender
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n\n/g, '</p><p>')
                .replace(/\n/g, '<br>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/`([^`]+)`/g, '<code>$1</code>');

            target.innerHTML = `<p>${basicHtml}</p>`;
            this.decorateLinks(target);
            this.attachLinkInterceptor();
        }

        // Show copy button for completed fallback content
        const msgContainer = target.closest('.msg');
        const copyButton = msgContainer?.querySelector('.msg-copy-button');
        if (copyButton) {
            copyButton.style.display = 'flex';
        }
    }

    // Add target/rel/class to anchors as they appear
    decorateLinks(container) {
        if (!container) return;
        const anchors = container.querySelectorAll('a');
        anchors.forEach(a => {
            if (a.dataset.linkDecorated === 'true') return;
            a.dataset.linkDecorated = 'true';
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
            if (!a.classList.contains('ai-link')) a.classList.add('ai-link');
        });
    }

    // Intercept clicks on anchors and open in system browser
    attachLinkInterceptor() {
        if (this._linkHandlerAttached) return;
        this._linkHandlerAttached = true;

        // Delegate on the component's shadow root to catch dynamic links
        this.shadowRoot?.addEventListener('click', e => {
            // Find the first anchor in the composed path
            const path = e.composedPath ? e.composedPath() : [];
            let anchor = null;
            for (const el of path) {
                if (el && el.tagName === 'A') {
                    anchor = el;
                    break;
                }
            }
            if (!anchor) return;

            const href = anchor.getAttribute('href') || '';
            if (!href) return;

            // Only handle http/https, let others fall through
            const isHttp = /^https?:\/\//i.test(href);
            if (!isHttp) return;

            e.preventDefault();
            e.stopPropagation();
            try {
                if (window.api?.common?.openExternal) {
                    window.api.common.openExternal(href);
                } else if (window?.open) {
                    window.open(href, '_blank', 'noopener');
                }
            } catch (err) {
                console.warn('Failed to open external link:', err);
            }
        });
    }

    requestWindowResize(targetHeight) {
        if (window.api) {
            window.api.askView.adjustWindowHeight('ask', targetHeight);
        }
    }

    animateHeaderText(text) {
        this.headerAnimating = true;
        this.requestUpdate();

        setTimeout(() => {
            this.headerText = text;
            this.headerAnimating = false;
            this.requestUpdate();
        }, 150);
    }

    startHeaderAnimation() {
        this.animateHeaderText('thinking...');

        if (this.headerAnimationTimeout) {
            clearTimeout(this.headerAnimationTimeout);
        }
    }

    renderMarkdown(content) {
        if (!content) return '';

        if (this.isLibrariesLoaded && this.marked) {
            return this.parseMarkdown(content);
        }

        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
    }

    fixIncompleteMarkdown(text) {
        if (!text) return text;

        // Handle incomplete bold text
        const boldCount = (text.match(/\*\*/g) || []).length;
        if (boldCount % 2 === 1) {
            text += '**';
        }

        // Handle incomplete italic text
        const italicCount = (text.match(/(?<!\*)\*(?!\*)/g) || []).length;
        if (italicCount % 2 === 1) {
            text += '*';
        }

        // Handle incomplete inline code
        const inlineCodeCount = (text.match(/`/g) || []).length;
        if (inlineCodeCount % 2 === 1) {
            text += '`';
        }

        // Handle incomplete links
        const openBrackets = (text.match(/\[/g) || []).length;
        const closeBrackets = (text.match(/\]/g) || []).length;
        if (openBrackets > closeBrackets) {
            text += ']';
        }

        const openParens = (text.match(/\]\(/g) || []).length;
        const closeParens = (text.match(/\)\s*$/g) || []).length;
        if (openParens > closeParens && text.endsWith('(')) {
            text += ')';
        }

        return text;
    }

    async handleMessageCopy(messageElement) {
        const messageText = messageElement.textContent?.trim() || '';
        if (!messageText) return;

        try {
            await navigator.clipboard.writeText(messageText);
            console.log('Message copied to clipboard');

            // Add visual feedback - find the copy button in the parent message container
            const msgContainer = messageElement.closest('.msg');
            const copyButton = msgContainer?.querySelector('.msg-copy-button');
            if (copyButton) {
                copyButton.classList.add('copied');
                setTimeout(() => {
                    copyButton.classList.remove('copied');
                }, 1500);
            }
        } catch (err) {
            console.error('Failed to copy message:', err);
        }
    }

    getConversationHistory() {
        const responseContainer = this.shadowRoot?.getElementById('responseContainer');
        if (!responseContainer) return '';

        const messages = [];
        const userMessages = responseContainer.querySelectorAll('.msg-user .msg-content');
        const aiMessages = responseContainer.querySelectorAll('.msg-assistant .msg-content');

        // Assuming alternating pattern: user message, then AI response
        const maxLength = Math.max(userMessages.length, aiMessages.length);

        for (let i = 0; i < maxLength; i++) {
            if (userMessages[i]) {
                const questionText = userMessages[i].textContent?.trim() || '';
                if (questionText) {
                    messages.push(`Question ${i + 1}: ${questionText}`);
                }
            }
            if (aiMessages[i]) {
                const answerText = aiMessages[i].textContent?.trim() || '';
                if (answerText) {
                    messages.push(`Answer ${i + 1}: ${answerText}`);
                }
            }
            if (i < maxLength - 1) messages.push(''); // Empty line between Q&A pairs
        }

        return messages.join('\n');
    }

    async handleCopy() {
        if (this.copyState === 'copied') return;

        let responseToCopy = this.currentResponse;

        if (this.isDOMPurifyLoaded && this.DOMPurify) {
            const testHtml = this.renderMarkdown(responseToCopy);
            const sanitized = this.DOMPurify.sanitize(testHtml);

            if (this.DOMPurify.removed && this.DOMPurify.removed.length > 0) {
                console.warn('Unsafe content detected, copy blocked');
                return;
            }
        }

        // For global copy, include full conversation context
        const conversationHistory = this.getConversationHistory();
        const textToCopy = conversationHistory.length > 0 ? conversationHistory : `Question: ${this.currentQuestion}\n\nAnswer: ${responseToCopy}`;

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

    async handleLineCopy(lineIndex) {
        const originalLines = this.currentResponse.split('\n');
        const lineToCopy = originalLines[lineIndex];

        if (!lineToCopy) return;

        try {
            await navigator.clipboard.writeText(lineToCopy);
            console.log('Line copied to clipboard');

            // Update UI immediately with 'copied' state
            this.lineCopyState = { ...this.lineCopyState, [lineIndex]: true };
            this.requestUpdate(); // Request UI update for LitElement

            // Clear existing timeout if any
            if (this.lineCopyTimeouts && this.lineCopyTimeouts[lineIndex]) {
                clearTimeout(this.lineCopyTimeouts[lineIndex]);
            }

            // Modified timeout: Release 'copied' state after 1.5 seconds
            this.lineCopyTimeouts[lineIndex] = setTimeout(() => {
                const updatedState = { ...this.lineCopyState };
                delete updatedState[lineIndex];
                this.lineCopyState = updatedState;
                this.requestUpdate(); // Request UI update
            }, 1500);
        } catch (err) {
            console.error('Failed to copy line:', err);
        }
    }

    async handleInterrupt() {
        console.log('[AskView] User interrupted stream from frontend.');
        this.interrupted = true; // Set state immediately on frontend
        if (window.api) {
            try {
                await window.api.askView.interruptStream();
                console.log('Interruption signal sent');
            } catch (error) {
                console.error('Failed to send interruption signal:', error);
            }
        }
        this.stop();
    }

    stop() {
        if (this.typewriterInterval) {
            clearTimeout(this.typewriterInterval);
            this.typewriterInterval = null;
        }
        if (this.smdParser) {
            parser_end(this.smdParser);
        }
        this.isStreaming = false;
        this.isAnimating = false;

        // Finalize streaming container so a new one is created next time
        const responseContainer = this.shadowRoot.getElementById('responseContainer');
        const active = responseContainer?.querySelector('#assistantStream');
        if (active) {
            active.removeAttribute('id');
            // Show copy button for completed AI message
            const msgContainer = active.closest('.msg');
            const copyButton = msgContainer?.querySelector('.msg-copy-button');
            if (copyButton) {
                copyButton.style.display = 'flex';
            }
        }

        // Final highlight check
        if (this.hljs && this.smdContainer) {
            this.smdContainer.querySelectorAll('pre code:not([data-highlighted])').forEach(block => {
                this.hljs.highlightElement(block);
                block.setAttribute('data-highlighted', 'true');
            });
        }
        if (this.interrupted) {
            const responseContainer = this.shadowRoot.getElementById('responseContainer');
            if (responseContainer && !responseContainer.querySelector('.interruption-indicator')) {
                const indicator = document.createElement('div');
                indicator.className = 'interruption-indicator';
                indicator.textContent = 'Interrupted';
                responseContainer.appendChild(indicator);
                this.adjustWindowHeightThrottled(); // Recalculate height to include indicator
            }
        }
        console.log('Typewriter stopped');
    }

    async handleSendText(e, overridingText = '') {
        const textInput = this.shadowRoot?.getElementById('textInput');
        let text = (overridingText || textInput?.value || '').trim();

        // If no text provided, use the hardcoded fallback
        if (!text) {
            text = 'Assist me';
        }

        if (textInput) {
            textInput.value = '';
        }

        // Append user's message to the chat thread immediately
        this.appendUserMessage(text);
        // Mark that we've appended locally so backend update won't duplicate
        this._appendedCurrentQuestion = true;

        if (window.api) {
            window.api.askView.sendMessage(text).catch(error => {
                console.error('Error sending text:', error);
            });
        }
    }

    handleTextKeydown(e) {
        // Fix for IME composition issue: Ignore Enter key presses while composing.
        if (e.isComposing) {
            return;
        }

        const isPlainEnter = e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey;
        const isModifierEnter = e.key === 'Enter' && (e.metaKey || e.ctrlKey);

        if (isPlainEnter || isModifierEnter) {
            e.preventDefault();
            this.handleSendText();
        }
    }

    updated(changedProperties) {
        super.updated(changedProperties);

        // Redraw the view whenever isLoading, isAnalyzing, or currentResponse changes
        if (changedProperties.has('isLoading') || changedProperties.has('isAnalyzing') || changedProperties.has('currentResponse')) {
            this.renderContent();
        }

        if (changedProperties.has('showTextInput') || changedProperties.has('isLoading') || changedProperties.has('currentResponse')) {
            this.adjustWindowHeightThrottled();
        }

        if (changedProperties.has('showTextInput') && this.showTextInput) {
            this.focusTextInput();
        }
    }

    firstUpdated() {
        setTimeout(() => this.adjustWindowHeight(), 300); // Increased delay to ensure full DOM rendering
    }

    getTruncatedQuestion(question, maxLength = 30) {
        if (!question) return '';
        if (question.length <= maxLength) return question;
        return question.substring(0, maxLength) + '...';
    }

    render() {
        return renderTemplate(this);
    }

    // Simple window height calculation based on actual content
    adjustWindowHeight() {
        if (!window.api) return;

        this.updateComplete
            .then(() => {
                const container = this.shadowRoot.querySelector('.ask-container');
                if (!container) return;

                // Get the actual content height by measuring the container's scroll height
                const contentHeight = container.scrollHeight;
                const borderPadding = 10; // Small buffer for borders/padding

                const targetHeight = Math.min(650, Math.max(50, contentHeight + borderPadding));

                this.windowHeight = targetHeight;
                window.api.askView.adjustWindowHeight('ask', targetHeight);
            })
            .catch(err => console.error('AskView adjustWindowHeight error:', err));
    }

    // Throttled wrapper to avoid excessive IPC spam (executes at most once per animation frame)
    adjustWindowHeightThrottled() {
        if (this.isThrottled) return;

        this.isThrottled = true;
        requestAnimationFrame(() => {
            this.adjustWindowHeight();
            this.isThrottled = false;
        });
    }
}

customElements.define('ask-view', AskView);
