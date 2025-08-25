import { html, css, LitElement } from '../../ui/assets/lit-core-2.7.4.min.js';
import { parser, parser_write, parser_end, default_renderer } from '../../ui/assets/smd.js';
import { styles } from './ask-view.css.js';
import { renderTemplate } from './AskView.template.js';

const BASE_DELAY = 8;  // ms
const MIN_DELAY = 2;   // ms

function calcDelay(wordIndex) {
    // Simple adaptive delay that gets faster over time
    return Math.max(MIN_DELAY, BASE_DELAY * Math.exp(-wordIndex / 150));
}

export class AskView extends LitElement {
    static properties = {
        currentResponse: { type: String },
        currentQuestion: { type: String },
        isLoading: { type: Boolean },
        isAnalyzing: { type: Boolean },
        isTransitioning: { type: Boolean },
        copyState: { type: String },
        isHovering: { type: Boolean },
        hoveredLineIndex: { type: Number },
        lineCopyState: { type: Object },
        showTextInput: { type: Boolean },
        showFollowupInput: { type: Boolean },
        headerText: { type: String },
        headerAnimating: { type: Boolean },
        isStreaming: { type: Boolean },
        windowHeight: { type: Number },
        interrupted: { type: Boolean },
    };

    static styles = styles;

    constructor() {
        super();
        this.currentResponse = '';
        this.currentQuestion = '';
        this.isLoading = false;
        this.isAnalyzing = false;
        this.isTransitioning = false;
        this.copyState = 'idle';
        this.showTextInput = true;
        this.showFollowupInput = false;
        this.headerText = 'AI Response';
        this.headerAnimating = false;
        this.isStreaming = false;
        this.windowHeight = window.innerHeight;
        this.interrupted = false;

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

        // Analysis timing
        this.analyzeTimeout = null;

        this.handleSendText = this.handleSendText.bind(this);
        this.handleTextKeydown = this.handleTextKeydown.bind(this);
        this.handleCopy = this.handleCopy.bind(this);
        this.clearResponseContent = this.clearResponseContent.bind(this);
        this.handleEscKey = this.handleEscKey.bind(this);
        this.handleScroll = this.handleScroll.bind(this);
        this.handleCloseAskWindow = this.handleCloseAskWindow.bind(this);
        this.handleCloseIfNoContent = this.handleCloseIfNoContent.bind(this);

        this.loadLibraries();

        // --- Resize helpers ---
        this.isThrottled = false;
    }

    connectedCallback() {
        super.connectedCallback();

        console.log('📱 AskView connectedCallback - IPC 이벤트 리스너 설정');

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
                console.log('Current state:', {
                    currentResponse: !!this.currentResponse,
                    isLoading: this.isLoading,
                    isAnalyzing: this.isAnalyzing,
                    showFollowupInput: this.showFollowupInput
                });
                const hasActualResponse = this.currentResponse && !this.isLoading && !this.isAnalyzing;
                
                if (hasActualResponse) {
                    // When there's an AI response, show follow-up input instead
                    console.log('Showing follow-up input');
                    if (!this.showFollowupInput) {
                        this.showFollowupInput = true;
                        this.updateComplete.then(() => this.focusFollowupInput());
                    } else {
                        this.focusFollowupInput();
                    }
                } else {
                    // When no response, show main input
                    console.log('Showing main input');
                    if (!this.showTextInput) {
                        this.showTextInput = true;
                        this.updateComplete.then(() => this.focusTextInput());
                    } else {
                        this.focusTextInput();
                    }
                }
            });

            window.api.askView.onScrollResponseUp(() => this.handleScroll('up'));
            window.api.askView.onScrollResponseDown(() => this.handleScroll('down'));
            window.api.askView.onAskStateUpdate((event, newState) => {
                this.currentResponse = newState.currentResponse;
                this.currentQuestion = newState.currentQuestion;
                this.isLoading = newState.isLoading;
                this.isStreaming = newState.isStreaming;
                this.interrupted = newState.interrupted;

                // Clear transitioning state when we get actual response content
                if (newState.currentResponse) {
                    this.isTransitioning = false;
                }

                const wasHidden = !this.showTextInput;
                this.showTextInput = newState.showTextInput;
                
                // Reset follow-up input when starting new conversation
                if (newState.isLoading || newState.isAnalyzing || !newState.currentResponse) {
                    this.showFollowupInput = false;
                }

                if (newState.showTextInput) {
                    if (wasHidden) {
                        this.updateComplete.then(() => this.focusTextInput());
                    } else {
                        this.focusTextInput();
                    }
                }
            });
            console.log('AskView: IPC 이벤트 리스너 등록 완료');
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.typewriterInterval) {
            clearInterval(this.typewriterInterval);
            this.typewriterInterval = null;
        }
        this.resizeObserver?.disconnect();

        console.log('📱 AskView disconnectedCallback - IPC 이벤트 리스너 제거');

        document.removeEventListener('keydown', this.handleEscKey);

        if (this.analyzeTimeout) {
            clearTimeout(this.analyzeTimeout);
        }

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
            window.api.askView.removeOnScrollResponseUp(this.handleScroll);
            window.api.askView.removeOnScrollResponseDown(this.handleScroll);
            console.log('✅ AskView: IPC 이벤트 리스너 제거 필요');
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
        // this.clearResponseContent();
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
        this.showFollowupInput = false;
        this.lastProcessedLength = 0;
        this.smdParser = null;
        this.smdContainer = null;
        this.wordCount = 0;
        this.interrupted = false;
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

    focusFollowupInput() {
        requestAnimationFrame(() => {
            const followupInput = this.shadowRoot?.getElementById('followupInput');
            if (followupInput) {
                followupInput.focus();
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

    handleScroll(direction) {
        const scrollableElement = this.shadowRoot.querySelector('#responseContainer');
        if (scrollableElement) {
            const scrollAmount = 100; // 한 번에 스크롤할 양 (px)
            if (direction === 'up') {
                scrollableElement.scrollTop -= scrollAmount;
            } else {
                scrollableElement.scrollTop += scrollAmount;
            }
        }
    }

    renderContent() {
        const responseContainer = this.shadowRoot.getElementById('responseContainer');
        if (!responseContainer) return;

        // Only render content when there's actual response and not just loading
        if (!this.currentResponse || this.isLoading) {
            // No content to render during loading or when no response
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
                // 마크다운 파싱
                const parsedHtml = this.marked.parse(textToRender);

                // DOMPurify로 정제
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

                responseContainer.innerHTML = cleanHtml;

                // 코드 하이라이팅 적용
                if (this.hljs) {
                    responseContainer.querySelectorAll('pre code').forEach(block => {
                        this.hljs.highlightElement(block);
                    });
                }
            } catch (error) {
                console.error('Error in fallback rendering:', error);
                responseContainer.textContent = textToRender;
            }
        } else {
            // 라이브러리가 로드되지 않았을 때 기본 렌더링
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
        }
    }

    requestWindowResize(targetHeight) {
        if (window.api) {
            window.api.askView.adjustWindowHeight(targetHeight);
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

        // 불완전한 볼드체 처리
        const boldCount = (text.match(/\*\*/g) || []).length;
        if (boldCount % 2 === 1) {
            text += '**';
        }

        // 불완전한 이탤릭체 처리
        const italicCount = (text.match(/(?<!\*)\*(?!\*)/g) || []).length;
        if (italicCount % 2 === 1) {
            text += '*';
        }

        // 불완전한 인라인 코드 처리
        const inlineCodeCount = (text.match(/`/g) || []).length;
        if (inlineCodeCount % 2 === 1) {
            text += '`';
        }

        // 불완전한 링크 처리
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

            // '복사됨' 상태로 UI 즉시 업데이트
            this.lineCopyState = { ...this.lineCopyState, [lineIndex]: true };
            this.requestUpdate(); // LitElement에 UI 업데이트 요청

            // 기존 타임아웃이 있다면 초기화
            if (this.lineCopyTimeouts && this.lineCopyTimeouts[lineIndex]) {
                clearTimeout(this.lineCopyTimeouts[lineIndex]);
            }

            // ✨ 수정된 타임아웃: 1.5초 후 '복사됨' 상태 해제
            this.lineCopyTimeouts[lineIndex] = setTimeout(() => {
                const updatedState = { ...this.lineCopyState };
                delete updatedState[lineIndex];
                this.lineCopyState = updatedState;
                this.requestUpdate(); // UI 업데이트 요청
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

        // Start the analyze screen state for 800ms
        this.isTransitioning = true;
        this.isAnalyzing = true;
        this.showFollowupInput = false; // Hide follow-up input when starting new conversation
        this.requestUpdate();

        // Clear any existing timeout
        if (this.analyzeTimeout) {
            clearTimeout(this.analyzeTimeout);
        }

        // After 800ms, send the actual message and switch to thinking
        this.analyzeTimeout = setTimeout(() => {
            // Set loading state first to ensure smooth transition
            this.isLoading = true;
            this.isAnalyzing = false;
            // Keep isTransitioning true until we get response
            this.requestUpdate();
            
            if (window.api) {
                window.api.askView.sendMessage(text).catch(error => {
                    console.error('Error sending text:', error);
                    // Reset states on error
                    this.isLoading = false;
                    this.isAnalyzing = false;
                    this.isTransitioning = false;
                    this.requestUpdate();
                });
            }
        }, 800);
    }

    async handleFollowupSendText(e, overridingText = '') {
        const followupInput = this.shadowRoot?.getElementById('followupInput');
        const text = (overridingText || followupInput?.value || '').trim();
        if (!text) return;

        followupInput.value = '';
        this.showFollowupInput = false; // Hide follow-up input

        // Start the analyze screen state for 800ms
        this.isTransitioning = true;
        this.isAnalyzing = true;
        this.requestUpdate();

        // Clear any existing timeout
        if (this.analyzeTimeout) {
            clearTimeout(this.analyzeTimeout);
        }

        // After 800ms, send the actual message and switch to thinking
        this.analyzeTimeout = setTimeout(() => {
            // Set loading state first to ensure smooth transition
            this.isLoading = true;
            this.isAnalyzing = false;
            // Keep isTransitioning true until we get response
            this.requestUpdate();
            
            if (window.api) {
                window.api.askView.sendMessage(text).catch(error => {
                    console.error('Error sending text:', error);
                    // Reset states on error
                    this.isLoading = false;
                    this.isAnalyzing = false;
                    this.isTransitioning = false;
                    this.requestUpdate();
                });
            }
        }, 800);
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

    handleFollowupKeydown(e) {
        // Fix for IME composition issue: Ignore Enter key presses while composing.
        if (e.isComposing) {
            return;
        }

        const isPlainEnter = e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey;
        const isModifierEnter = e.key === 'Enter' && (e.metaKey || e.ctrlKey);

        if (isPlainEnter || isModifierEnter) {
            e.preventDefault();
            this.handleFollowupSendText();
        }
    }

    updated(changedProperties) {
        super.updated(changedProperties);

        // ✨ isLoading, isAnalyzing 또는 currentResponse가 변경될 때마다 뷰를 다시 그립니다.
        if (changedProperties.has('isLoading') || changedProperties.has('isAnalyzing') || changedProperties.has('currentResponse')) {
            this.renderContent();
        }

        // Only adjust height for state changes that affect layout, not during typing
        if (changedProperties.has('isLoading') || changedProperties.has('isAnalyzing') || changedProperties.has('currentResponse') || changedProperties.has('showFollowupInput')) {
            this.adjustWindowHeightThrottled();
        }

        if (changedProperties.has('showTextInput') && this.showTextInput) {
            this.focusTextInput();
        }
        
        if (changedProperties.has('showFollowupInput') && this.showFollowupInput) {
            this.focusFollowupInput();
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

    // Dynamically resize the BrowserWindow to fit current content
    adjustWindowHeight() {
        if (!window.api) return;

        this.updateComplete
            .then(() => {
                // Fixed height for ask and thinking states (only input container visible)
                const hasActualResponse = this.currentResponse && !this.isLoading && !this.isAnalyzing;
                
                if (!hasActualResponse) {
                    // Fixed window height for ask anything, analyzing, and thinking states
                    const fixedHeight = 100; // Fixed height for initial states
                    this.windowHeight = fixedHeight;
                    window.api.askView.adjustWindowHeight('ask', fixedHeight);
                    return;
                }

                // Dynamic height calculation only when there's actual AI response content
                const containerEl = this.shadowRoot.querySelector('.text-input-container');
                const responseEl = this.shadowRoot.querySelector('.response-container');
                const followupEl = this.shadowRoot.querySelector('.followup-input-container');

                if (!containerEl) return;

                const containerHeight = containerEl.offsetHeight;
                const responseHeight = responseEl ? responseEl.scrollHeight : 0;
                const followupHeight = followupEl && this.showFollowupInput ? followupEl.offsetHeight : 0;

                // Add extra padding for borders and spacing
                const borderPadding = 10; // Account for container borders and padding
                const idealHeight = containerHeight + responseHeight + followupHeight + borderPadding;

                // Ensure minimum height shows all content including borders 
                const minHeightForContent = 100; // Minimum to show input field + borders properly
                const targetHeight = Math.min(700, Math.max(minHeightForContent, idealHeight));

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
