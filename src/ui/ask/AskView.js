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
        messageCopyState: { type: Object },
        isHovering: { type: Boolean },
        hoveredLineIndex: { type: Number },
        lineCopyState: { type: Object },
        showTextInput: { type: Boolean },
        headerText: { type: String },
        headerAnimating: { type: Boolean },
        isStreaming: { type: Boolean },
        windowHeight: { type: Number },
        interrupted: { type: Boolean },
        // In-memory chat history; not persisted or fetched
        messages: { type: Array },
    };

    static styles = styles;

    constructor() {
        super();
        this.currentResponse = '';
        this.currentQuestion = '';
        this.isLoading = false;
        this.copyState = 'idle';
        this.messageCopyState = {};
        this.showTextInput = true;
        this.headerText = 'AI Response';
        this.headerAnimating = false;
        this.isStreaming = false;
        this.windowHeight = window.innerHeight;
        this.interrupted = false;
        this.messages = [];
        this._pendingAssistantIndex = null; // index of assistant message being streamed
        this._lastQuestionSeen = '';
        this._pendingUserQuestion = '';
        this._userBubbleAppended = false;
        this._idCounter = 0; // for unique message IDs

        this.isAnimating = false; // Tracks typewriter animation state

        this.displayBuffer = ''; // what the user sees
        this.typewriterInterval = null; // interval id
        this.pendingText = ''; // full answer still arriving

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
        this.handleCopyMessage = this.handleCopyMessage.bind(this);
        this.clearResponseContent = this.clearResponseContent.bind(this);
        this.handleEscKey = this.handleEscKey.bind(this);
        this.handleCloseAskWindow = this.handleCloseAskWindow.bind(this);
        this.handleCloseIfNoContent = this.handleCloseIfNoContent.bind(this);

        this.loadLibraries();

        // --- Resize helpers ---
        this.isThrottled = false;

        // Link interception flag
        this._linkHandlerAttached = false;
    }

    generateId() {
        // Monotonic unique id for messages
        this._idCounter += 1;
        return `${Date.now()}-${this._idCounter}`;
    }

    connectedCallback() {
        super.connectedCallback();

        console.log('📱 AskView connectedCallback - Setting up IPC event listeners');

        document.addEventListener('keydown', this.handleEscKey);

        this.resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const needed = entry.contentRect.height;
                const current = window.innerHeight;

                if (needed > current - 4) {
                    this.requestWindowResize(Math.ceil(needed));
                }
            }
        });

        const container = this.shadowRoot?.querySelector('.ask-container');
        if (container) this.resizeObserver.observe(container);

        this.handleQuestionFromAssistant = (event, question) => {
            console.log('AskView: Received question from ListenView:', question);
            this.handleSendText(null, question);
        };

        if (window.api) {
            window.api.askView.onShowTextInput(() => {
                console.log('Show text input signal received');
                if (!this.showTextInput) {
                    this.showTextInput = true;
                    this.updateComplete.then(() => this.focusTextInput());
                } else {
                    this.focusTextInput();
                }
            });
            window.api.askView.onAskStateUpdate((event, newState) => {
                this.currentResponse = newState.currentResponse;
                this.currentQuestion = newState.currentQuestion;
                this.isLoading = newState.isLoading;
                this.isStreaming = newState.isStreaming;
                this.interrupted = newState.interrupted;

                // If a new question was initiated outside AskView, store it as pending only (no bubble yet)
                if (newState.isLoading && newState.currentQuestion) {
                    const q = (newState.currentQuestion || '').trim();
                    if (q && q !== this._lastQuestionSeen) {
                        this._pendingUserQuestion = q;
                        this._lastQuestionSeen = q; // prevent duplicates
                        this._userBubbleAppended = false;
                    }
                }

                const wasHidden = !this.showTextInput;
                this.showTextInput = newState.showTextInput;

                // Chat history management (no DB fetch):
                // - No bubbles during pure Thinking
                // - Only when first content arrives, append pending user bubble, then create assistant bubble
                if (newState.currentResponse && newState.currentResponse.length > 0 && this._pendingAssistantIndex === null) {
                    if (this._pendingUserQuestion && !this._userBubbleAppended) {
                        this.messages = [...this.messages, { id: this.generateId(), role: 'user', content: this._pendingUserQuestion }];
                        this._userBubbleAppended = true;
                    }
                    const lastMsg = this.messages[this.messages.length - 1];
                    const needsPlaceholder = !lastMsg || lastMsg.role !== 'assistant';
                    if (needsPlaceholder) {
                        this._pendingAssistantIndex = this.messages.length;
                        this.messages = [...this.messages, { id: this.generateId(), role: 'assistant', content: newState.currentResponse || '' }];
                    }
                }

                // - While streaming, update the pending assistant content so it persists after stream
                if (newState.isStreaming && typeof newState.currentResponse === 'string' && this._pendingAssistantIndex !== null) {
                    const updated = [...this.messages];
                    if (updated[this._pendingAssistantIndex]) {
                        updated[this._pendingAssistantIndex] = {
                            ...updated[this._pendingAssistantIndex],
                            content: newState.currentResponse,
                        };
                        this.messages = updated;
                    }
                }

                // - When stream finishes, ensure content is finalized
                if (
                    !newState.isStreaming &&
                    !newState.isLoading &&
                    typeof newState.currentResponse === 'string' &&
                    this._pendingAssistantIndex !== null
                ) {
                    const updated = [...this.messages];
                    if (updated[this._pendingAssistantIndex]) {
                        updated[this._pendingAssistantIndex] = {
                            ...updated[this._pendingAssistantIndex],
                            content: newState.currentResponse,
                        };
                        this.messages = updated;
                    }
                    // Keep pointer for safety but next turn will overwrite
                }

                if (newState.showTextInput) {
                    if (wasHidden) {
                        this.updateComplete.then(() => this.focusTextInput());
                    } else {
                        this.focusTextInput();
                    }
                }

                // Auto-scroll chat to bottom on updates
                this.updateComplete.then(() => this.scrollChatToBottom());
            });
            // Fallback UI for AI/stream errors
            this.handleAskStreamError = (event, payload) => {
                console.warn('AskView: Stream error received', payload?.error);
                this.isLoading = false;
                this.isStreaming = true;
                this.interrupted = false;
                this.showTextInput = false;
                this.currentResponse = 'Something went wrong.';
                // Ensure bubbles exist so the error can render
                if (this._pendingUserQuestion && !this._userBubbleAppended) {
                    this.messages = [...this.messages, { id: this.generateId(), role: 'user', content: this._pendingUserQuestion }];
                    this._userBubbleAppended = true;
                }
                if (this._pendingAssistantIndex === null) {
                    this._pendingAssistantIndex = this.messages.length;
                    this.messages = [...this.messages, { id: this.generateId(), role: 'assistant', content: this.currentResponse }];
                } else {
                    const updated = [...this.messages];
                    if (updated[this._pendingAssistantIndex]) {
                        updated[this._pendingAssistantIndex] = {
                            ...updated[this._pendingAssistantIndex],
                            content: this.currentResponse,
                        };
                        this.messages = updated;
                    }
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

        Object.values(this.lineCopyTimeouts).forEach(timeout => clearTimeout(timeout));

        if (window.api) {
            window.api.askView.removeOnAskStateUpdate(this.handleAskStateUpdate);
            window.api.askView.removeOnShowTextInput(this.handleShowTextInput);
            if (this.handleAskStreamError) {
                window.api.askView.removeOnAskStreamError(this.handleAskStreamError);
            }
            console.log('✅ AskView: IPC event listeners removal needed');
        }
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
        // Clear chat history when user closes the window
        this.messages = [];
        this._pendingAssistantIndex = null;
        this._lastQuestionSeen = '';
        this._pendingUserQuestion = '';
        this._userBubbleAppended = false;
        this.clearResponseContent();
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
        this.headerText = 'AI Response';
        this.showTextInput = true;
        this.lastProcessedLength = 0;
        this.smdParser = null;
        this.smdContainer = null;
        this.wordCount = 0;
        this.interrupted = false;
    }

    handleInputFocus() {
        this.isInputFocused = true;
    }

    scrollChatToBottom() {
        const list = this.shadowRoot?.querySelector('.chat-list');
        if (list) {
            list.scrollTop = list.scrollHeight;
        }
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

        // Check loading state
        if (this.isLoading) {
            responseContainer.innerHTML = '';
            this.resetStreamingParser();
            return;
        }

        // If there is no response, show empty state
        if (!this.currentResponse) {
            responseContainer.innerHTML = '';
            this.resetStreamingParser();
            return;
        }

        // Set streaming markdown parser
        this.renderStreamingMarkdown(responseContainer);

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
            if (!this.smdParser || this.smdContainer !== responseContainer) {
                this.smdContainer = responseContainer;
                responseContainer.innerHTML = '';
                const renderer = default_renderer(this.smdContainer);
                this.smdParser = parser(renderer);
                this.displayBuffer = '';
                this.pendingText = '';
                this.lastProcessedLength = 0;
                this.wordCount = 0;
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
                            responseContainer.querySelectorAll('pre code:not([data-highlighted])').forEach(block => {
                                this.hljs.highlightElement(block);
                                block.setAttribute('data-highlighted', 'true');
                            });
                        }
                        // Ensure links look and behave correctly
                        this.decorateLinks(responseContainer);
                        this.attachLinkInterceptor();
                        // Smart buffer handles resize frequency
                        this.adjustWindowHeightThrottled();
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

    renderFallbackContent(responseContainer) {
        const textToRender = this.currentResponse || '';

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

                responseContainer.innerHTML = cleanHtml;

                // Apply code highlighting
                if (this.hljs) {
                    responseContainer.querySelectorAll('pre code').forEach(block => {
                        this.hljs.highlightElement(block);
                    });
                }

                // Ensure links look and behave correctly
                this.decorateLinks(responseContainer);
                this.attachLinkInterceptor();
                this.scrollChatToBottom();
            } catch (error) {
                console.error('Error in fallback rendering:', error);
                responseContainer.textContent = textToRender;
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

            responseContainer.innerHTML = `<p>${basicHtml}</p>`;
            this.decorateLinks(responseContainer);
            this.attachLinkInterceptor();
            this.scrollChatToBottom();
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

    // Wrap plain <pre><code> blocks with a header bar and copy button (for non-streaming renders)
    decorateCodeBlocks(container) {
        if (!container) return;
        const codePres = container.querySelectorAll('pre > code');
        codePres.forEach(codeEl => {
            const pre = codeEl.parentElement;
            if (!pre) return;
            // Skip if already wrapped by our SMD chrome
            if (pre.parentElement && pre.parentElement.classList.contains('code-chrome')) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'code-chrome';

            const bar = document.createElement('div');
            bar.className = 'code-bar';

            const langLabel = document.createElement('span');
            langLabel.className = 'code-lang';
            const className = codeEl.className || '';
            const langMatch = className.match(/language-([a-z0-9+-]+)/i);
            langLabel.textContent = langMatch ? (langMatch[1] || '').toUpperCase() : '';
            bar.appendChild(langLabel);

            const copyBtn = document.createElement('button');
            copyBtn.className = 'code-copy';
            copyBtn.textContent = 'Copy';
            copyBtn.onclick = () => {
                try {
                    navigator.clipboard.writeText(codeEl.textContent || '');
                    copyBtn.textContent = 'Copied';
                    setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
                } catch (_) {}
            };
            bar.appendChild(copyBtn);

            // Insert wrapper before pre and move pre inside
            const parent = pre.parentElement;
            parent.insertBefore(wrapper, pre);
            wrapper.appendChild(bar);
            wrapper.appendChild(pre);
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
            window.api.askView.adjustWindowHeight(targetHeight);
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

        const textToCopy = `Question: ${this.currentQuestion}\n\nAnswer: ${responseToCopy}`;

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

    async handleCopyMessage(messageId) {
        try {
            const msg = (this.messages || []).find(m => m.id === messageId);
            if (!msg) return;

            const text = msg.content || '';
            console.log('[AskView] Copying assistant message:', {
                id: messageId,
                role: msg.role,
                preview: (text || '').slice(0, 80),
            });
            await navigator.clipboard.writeText(text);

            // Mark copied state for this message
            this.messageCopyState = { ...(this.messageCopyState || {}), [messageId]: true };
            this.requestUpdate();

            // Clear any previous timeout and set a new one to reset state
            if (!this._messageCopyTimeouts) this._messageCopyTimeouts = {};
            if (this._messageCopyTimeouts[messageId]) {
                clearTimeout(this._messageCopyTimeouts[messageId]);
            }
            this._messageCopyTimeouts[messageId] = setTimeout(() => {
                const next = { ...(this.messageCopyState || {}) };
                delete next[messageId];
                this.messageCopyState = next;
                this.requestUpdate();
            }, 1500);
        } catch (err) {
            console.error('Failed to copy message:', err);
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
            // Ensure we don't carry parser state into the next render
            this.resetStreamingParser();
        }
        this.isStreaming = false;
        this.isAnimating = false;

        // After finalizing stream, ensure container shows clean HTML
        const container = this.shadowRoot?.getElementById('responseContainer');
        if (container) {
            try {
                this.renderFallbackContent(container);
            } catch (_) {}
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
        const text = (overridingText || textInput?.value || '').trim();
        if (!text) return;

        textInput.value = '';

        // Defer user bubble until first tokens arrive (pure Thinking UX)
        this._pendingUserQuestion = text;
        this._lastQuestionSeen = text;
        this._userBubbleAppended = false;
        // Reset pending assistant pointer to ensure a fresh placeholder for next turn
        this._pendingAssistantIndex = null;
        this.updateComplete.then(() => this.scrollChatToBottom());

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

        // Redraw the view whenever isLoading or currentResponse changes
        if (changedProperties.has('isLoading') || changedProperties.has('currentResponse')) {
            this.renderContent();
        }

        if (changedProperties.has('showTextInput') || changedProperties.has('isLoading') || changedProperties.has('currentResponse')) {
            this.adjustWindowHeightThrottled();
        }

        if (changedProperties.has('showTextInput') && this.showTextInput) {
            this.focusTextInput();
        }

        // After DOM updates, decorate any static assistant HTML blocks with code chrome + copy
        if (changedProperties.has('messages') || changedProperties.has('currentResponse')) {
            this.updateComplete.then(() => {
                const assistants = this.shadowRoot?.querySelectorAll('.assistant-html');
                if (!assistants || assistants.length === 0) return;
                assistants.forEach(container => {
                    this.decorateCodeBlocks(container);
                    this.decorateLinks(container);
                    if (this.hljs) {
                        container.querySelectorAll('pre code:not([data-highlighted])').forEach(block => {
                            try {
                                this.hljs.highlightElement(block);
                                block.setAttribute('data-highlighted', 'true');
                            } catch (_) {}
                        });
                    }
                });
            });
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

    // Simple window height with small buffer
    adjustWindowHeight() {
        if (!window.api) return;

        this.updateComplete
            .then(() => {
                const headerEl = this.shadowRoot.querySelector('.response-header');
                const responseEl = this.shadowRoot.querySelector('.response-container');
                const inputEl = this.shadowRoot.querySelector('.text-input-container');

                if (!headerEl || !responseEl) return;

                const headerHeight = headerEl.classList.contains('hidden') ? 0 : headerEl.offsetHeight;
                const responseHeight = responseEl.classList.contains('hidden') ? 0 : responseEl.scrollHeight;
                const inputHeight = inputEl && !inputEl.classList.contains('hidden') ? inputEl.offsetHeight : 0;

                const borderPadding = 10;
                let idealHeight = headerHeight + responseHeight + inputHeight + borderPadding;

                const hasResponse = this.isLoading || this.currentResponse || this.isStreaming;
                const CONSISTENT_BASE_HEIGHT = 50;

                if (!hasResponse) {
                    idealHeight = CONSISTENT_BASE_HEIGHT;
                } else if (this.isLoading && !this.currentResponse) {
                    idealHeight = CONSISTENT_BASE_HEIGHT;
                } else {
                    // Add buffer to reduce resizing
                    idealHeight += 0;
                }

                const targetHeight = Math.min(650, Math.max(CONSISTENT_BASE_HEIGHT, idealHeight));
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
