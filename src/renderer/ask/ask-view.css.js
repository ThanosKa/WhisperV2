import { css } from '../../ui/assets/lit-core-2.7.4.min.js';

export const styles = css`
    :host {
        display: block;
        width: 100%;
        height: 100%;
        color: white;
        transform: translate3d(0, 0, 0);
        backface-visibility: hidden;
        transition:
            transform 0.2s cubic-bezier(0.23, 1, 0.32, 1),
            opacity 0.2s ease-out;
        will-change: transform, opacity;
    }

    :host(.hiding) {
        animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.6, 1) forwards;
    }

    :host(.showing) {
        animation: slideDown 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }

    :host(.hidden) {
        opacity: 0;
        transform: translateY(-150%) scale(0.85);
        pointer-events: none;
    }

    @keyframes slideUp {
        0% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0px);
        }
        30% {
            opacity: 0.7;
            transform: translateY(-20%) scale(0.98);
            filter: blur(0.5px);
        }
        70% {
            opacity: 0.3;
            transform: translateY(-80%) scale(0.92);
            filter: blur(1.5px);
        }
        100% {
            opacity: 0;
            transform: translateY(-150%) scale(0.85);
            filter: blur(2px);
        }
    }

    @keyframes slideDown {
        0% {
            opacity: 0;
            transform: translateY(-150%) scale(0.85);
            filter: blur(2px);
        }
        30% {
            opacity: 0.5;
            transform: translateY(-50%) scale(0.92);
            filter: blur(1px);
        }
        65% {
            opacity: 0.9;
            transform: translateY(-5%) scale(0.99);
            filter: blur(0.2px);
        }
        70% {
            opacity: 0.98;
            transform: translateY(2%) scale(1.005);
            filter: blur(0px);
        }
        100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0px);
        }
    }

    * {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
        cursor: default;
        user-select: none;
    }

    /* Allow text selection in assistant responses (no I-beam cursor) */
    .response-container,
    .response-container * {
        user-select: text !important;
        /* Do not force text cursor; keep default so no hover cursor change */
    }

    /* Override cursor for interactive elements */
    .response-container button,
    .response-container .copy-button,
    .response-container .msg-copy-button,
    .response-container .line-copy-button,
    .response-container a {
        cursor: pointer !important;
    }

    .response-container .code-chrome {
        background: rgba(0, 0, 0, 0.4) !important;
        border-radius: 8px !important;
        margin: 8px 0 !important;
        overflow-x: auto !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
    }

    .response-container .code-bar {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        background: rgba(0, 0, 0, 0.6) !important;
        padding: 6px 12px !important;
        font-size: 11px !important;
        color: rgba(255, 255, 255, 0.7) !important;
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
    }

    .response-container .code-lang {
        color: rgba(255, 255, 255, 0.8) !important;
        font-weight: 500 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
        flex: 1 !important; /* Take available space */
    }

    .response-container .code-copy {
        all: unset !important;
        cursor: pointer !important;
        padding: 3px 8px !important;
        border-radius: 4px !important;
        background: rgba(255, 255, 255, 0.1) !important;
        color: #ffffff !important;
        font-size: 10px !important;
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace !important;
        transition: background-color 0.15s ease !important;
    }

    .response-container .code-copy:hover {
        background: rgba(255, 255, 255, 0.2) !important;
    }

    .response-container .code-chrome pre {
        margin: 0 !important;
        padding: 12px !important;
        background: transparent !important;
        border: none !important;
        border-radius: 0 !important;
        overflow-x: auto !important;
        white-space: pre !important;
        word-wrap: normal !important;
        word-break: normal !important;
    }

    .response-container code {
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace !important;
        font-size: 11px !important;
        background: transparent !important;
        white-space: pre !important;
        word-wrap: normal !important;
        word-break: normal !important;
    }

    .response-container pre code {
        white-space: pre !important;
        word-wrap: normal !important;
        word-break: normal !important;
        display: block !important;
    }

    .response-container p code {
        background: rgba(255, 255, 255, 0.1) !important;
        padding: 2px 4px !important;
        border-radius: 3px !important;
        color: #ffffff !important;
    }

    /* White-only syntax highlighting - no more yellow! */
    .hljs-keyword,
    .hljs-string,
    .hljs-comment,
    .hljs-number,
    .hljs-function,
    .hljs-variable,
    .hljs-built_in,
    .hljs-title,
    .hljs-attr,
    .hljs-tag {
        color: #ffffff !important;
    }

    /* Bold white for emphasis */
    .hljs-strong {
        color: #ffffff !important;
        font-weight: 600 !important;
    }

    .ask-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        background: rgba(11, 11, 11, 0.55);
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.4);
        backdrop-filter: blur(25px);
        box-sizing: border-box;
        position: relative;
        // overflow: hidden;
    }

    .ask-container::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.15);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        border-radius: 12px;
        filter: blur(10px);
        z-index: -1;
    }

    .response-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: transparent;
        border-bottom: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px 6px 0 0;
        flex-shrink: 0;
        height: 40px;
        box-sizing: border-box;
    }

    /* "Thinking..." state: make header match the "Ask anything" input box by hiding the border */
    .response-header:has(+ .response-container:empty:not(.hidden)) {
        border-bottom: none;
    }

    .response-header.hidden {
        display: none;
    }

    .header-left {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }

    .response-icon {
        width: 20px;  
        height: 240x 
        background: none;  
        border-radius: 0;  
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .response-icon svg {
        width: 16px; 
        height: 16px;  
        stroke: rgba(255, 255, 255, 0.9);
    }

    .emoji-icon {
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .response-label {
        font-size: 15px;  
        font-weight: 500;
        color: rgba(255, 255, 255, 0.9);
        white-space: nowrap;
        position: relative;
        overflow: hidden;
    }

    .response-label.animating {
        animation: fadeInOut 0.3s ease-in-out;
    }

    @keyframes fadeInOut {
        0% {
            opacity: 1;
            transform: translateY(0);
        }
        50% {
            opacity: 0;
            transform: translateY(-10px);
        }
        100% {
            opacity: 1;
            transform: translateY(0);
        }
    }

    /* Proper pulsing animation - scale based */
    .response-label.pulsing {
        animation: pulse 1.5s ease-in-out infinite;
    }

    /* Thinking slide-in animation */
    .response-label.thinking-slide-in {
        animation: thinkingSlideIn 0.4s ease-out;
    }

    @keyframes thinkingSlideIn {
        0% {
            opacity: 0;
            transform: translateY(-10px);
        }
        100% {
            opacity: 1;
            transform: translateY(0);
        }
    }

    #textInput.pulsing::placeholder {
        animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
        0%,
        100% {
            transform: scale(1);
            opacity: 1;
        }
        50% {
            transform: scale(1.05);
            opacity: 0.8;
        }
    }

    /* Thinking dots animation - real dots, not text */
    .thinking-dots {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-left: 8px;
    }

    .thinking-dot {
        width: 6px;
        height: 6px;
        background: rgb(255, 255, 255);
        border-radius: 50%;
        animation: bounce 1.4s infinite ease-in-out both;
    }

    .thinking-dot:nth-child(1) {
        animation-delay: -0.32s;
    }

    .thinking-dot:nth-child(2) {
        animation-delay: -0.16s;
    }

    .thinking-dot:nth-child(3) {
        animation-delay: 0s;
    }

    @keyframes bounce {
        0%, 80%, 100% {
            transform: scale(0);
        }
        40% {
            transform: scale(1);
        }
    }

    /* CSS Styles */
.thinking-single {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 8px;
}

.thinking-single-dot {
    width: 8px;
    height: 8px;
    background: rgb(255, 255, 255);
    border-radius: 50%;
    animation: thinkingSinglePulse 1.5s ease-in-out infinite;
}

@keyframes thinkingSinglePulse {
    0%, 100% {
        opacity: 0.3;
        transform: scale(1);
    }
    50% {
        opacity: 1;
        transform: scale(1.4);
    }
}

    .header-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        justify-content: flex-end;
    }

    .question-text {
        font-size: 13px;
        color: rgb(255, 255, 255);
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        padding: 4px 8px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 300px;
        margin-right: 8px;
        transition: background-color 0.15s ease;
    }

    .question-text:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .header-controls {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-shrink: 0;
    }

    .copy-button {
        background: rgba(255, 255, 255, 0.05);
        color: rgba(180, 180, 180, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.15);
        padding: 4px;
        border-radius: 3px;
        cursor: pointer !important;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 24px;
        height: 24px;
        flex-shrink: 0;
        transition: background-color 0.15s ease;
        position: relative;
        overflow: hidden;
    }

    .copy-button:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .copy-button svg {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        transition:
            opacity 0.2s ease-in-out,
            transform 0.2s ease-in-out;
        cursor: pointer !important;
        pointer-events: none;
    }

    .copy-button .check-icon {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.5);
    }

    .copy-button.copied .copy-icon {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.5);
    }

    .copy-button.copied .check-icon {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
    }

    /* Stop button active state */
    .copy-button.stop-active {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #f87171;
    }

    .copy-button.stop-active:hover {
        background: rgba(239, 68, 68, 0.2);
    }

    .close-button {
        background: rgba(255, 255, 255, 0.07);
        color: white;
        border: none;
        padding: 4px;
        border-radius: 20px;
        outline: 1px rgba(255, 255, 255, 0.3) solid;
        outline-offset: -1px;
        backdrop-filter: blur(0.5px);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
    }

    .close-button:hover {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 1);
    }

    .response-container {
        flex: 1;
        padding: 16px;
        padding-left: 48px;
        overflow-y: auto;
        font-size: 14px;
        line-height: 1.6;
        background: transparent;
        min-height: 0;
        // max-height: 70vh;
        max-height: 500px;
        position: relative;
    }

    /* Chat thread */
    .response-container .msg {
        display: flex;
        gap: 8px;
        margin-bottom: 10px;
        align-items: flex-start;
        animation: messageSlideIn 0.4s cubic-bezier(0.25, 1, 0.5, 1);
        position: relative;
        padding-bottom: 28px;
    }
    
    /* Hover state for messages to show copy button */
    .response-container .msg:hover .msg-copy-button {
        opacity: 1;
        pointer-events: auto;
    }
    
    /* Per-message copy button */
    .msg-copy-button {
        position: absolute;
        bottom: 0;
        left: 0;
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
    
    /* Align copy button below message, on left side for both user and assistant */
    .response-container .msg-user .msg-copy-button,
    .response-container .msg-assistant .msg-copy-button {
        bottom: 0;
        left: 0;
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
    .response-container .msg-user {
        justify-content: flex-end;
    }
    .response-container .msg-assistant {
        justify-content: flex-start;
        flex-direction: column;
    }
    .response-container .msg-avatar { display: none; }
    .response-container .msg-user .msg-avatar {
        order: 2;
    }
    .response-container .msg-bubble { background: transparent; border: none; padding: 0; }
    .response-container .msg-content { overflow: visible; margin: 6px 0; }
    
    .response-container .msg-assistant .msg-content {
        box-sizing: border-box;
    }

    /* User message wrapper - flex column container */
    .response-container .msg-user-wrapper {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
    }
    
    /* User message bubble styling */
    .response-container .msg-user-bubble {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        padding: 8px 12px;
        max-width: 300px;
        word-wrap: break-word;
        color: rgba(255, 255, 255, 0.95);
    }
    
    /* Screenshot indicator below user messages */
    .screenshot-indicator {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.6);
        margin-top: 4px;
        padding: 2px 0;
        cursor: pointer;
        transition: color 0.15s ease;
        user-select: none;
        display: block;
        text-align: right;
    }
    
    .screenshot-indicator:hover {
        color: rgba(255, 255, 255, 0.9);
    }
    
    /* AI loading indicator */
    .response-container .loading-indicator {
        display: flex;
        align-items: center;
        padding: 8px 0;
    }
    
    /* Link styling inside AI response */
    .response-container a,
    .response-container a:visited {
        color: #93c5fd;
        text-decoration: underline;
        cursor: pointer !important; /* override global text cursor */
    }
    .response-container a:hover {
        color: #bfdbfe;
        text-decoration: underline;
    }
    .response-container a:active {
        color: #60a5fa;
    }

    /* Citation markers [1] enhanced as links */
    .citation-link {
        color: #60a5fa !important;
        text-decoration: none !important;
        font-size: 0.8em;
        vertical-align: super;
        margin: 0 2px;
        opacity: 0.8;
        transition: all 0.2s ease;
        font-weight: 600;
        cursor: pointer !important;
        display: inline-block;
        pointer-events: auto !important;
        line-height: 1;
        background: rgba(96, 165, 250, 0.1);
        padding: 0 2px;
        border-radius: 3px;
    }

    .citation-link:hover {
        opacity: 1;
        color: #93c5fd !important;
        text-decoration: underline !important;
        background: rgba(96, 165, 250, 0.2);
    }

    /* Markdown Tables */
    .table-wrapper {
        position: relative;
        margin: 16px 0;
        width: 100%;
    }

    .table-copy {
        position: absolute;
        top: -32px;
        right: 0;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        color: #a1a1aa;
        font-size: 11px;
        padding: 4px 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        opacity: 0;
        z-index: 10;
    }

    .table-wrapper:hover .table-copy {
        opacity: 1;
    }

    .table-copy:hover {
        background: rgba(255, 255, 255, 0.1);
        color: white;
    }

    .msg-content table {
        width: 100%;
        border-collapse: collapse;
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        overflow: hidden;
        display: table;
    }

    .msg-content thead {
        background: rgba(255, 255, 255, 0.05);
    }

    .msg-content th {
        padding: 10px 12px;
        text-align: left;
        font-weight: 600;
        color: #ffffff;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        border-right: 1px solid rgba(255, 255, 255, 0.05);
    }

    .msg-content td {
        padding: 8px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        border-right: 1px solid rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.8);
        vertical-align: top;
    }

    .msg-content th:last-child,
    .msg-content td:last-child {
        border-right: none;
    }

    .msg-content tr:last-child td {
        border-bottom: none;
    }

    .msg-content tr:hover td {
        background: rgba(255, 255, 255, 0.02);
    }

    .search-globe-container {
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.4);
    }

    .search-globe-container svg {
        width: 16px;
        height: 16px;
    }

    .response-container.hidden {
        display: none;
    }

    /* Ensure consistent height when response container is empty but visible */
    .response-container:empty {
        min-height: 0;
        padding: 0;
    }

    .response-container::-webkit-scrollbar {
        width: 6px;
    }

    .response-container::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
    }

    .response-container::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }

    .response-container::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }

    .loading-dots {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 40px;
    }

    .loading-dot {
        width: 6px;
        height: 6px;
        background: rgb(255, 255, 255);
        border-radius: 50%;
        animation: pulse 1.5s ease-in-out infinite;
    }

    /* Thinking state container */
    .thinking-container {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 20px;
        background: rgba(11, 11, 11, 0.55);
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 6px;
        height: 40px;
        font-size: 14px;
        color: rgb(255, 255, 255);
    }

    .thinking-text {
        color: rgb(255, 255, 255);
        animation: thinking-pulse 1.5s ease-in-out infinite;
    }

    .brain-icon {
        color: rgb(255, 255, 255);
        width: 16px;
        height: 16px;
    }

    @keyframes thinking-pulse {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.5;
        }
    }

    .loading-dot:nth-child(1) {
        animation-delay: 0s;
    }

    .loading-dot:nth-child(2) {
        animation-delay: 0.2s;
    }

    .loading-dot:nth-child(3) {
        animation-delay: 0.4s;
    }

    @keyframes pulse {
        0%, 80%, 100% {
            opacity: 0.4;
            transform: scale(0.8) translateY(0);
        }
        40% {
            opacity: 1;
            transform: scale(1.2) translateY(-5px);
        }
    }

    .response-line {
        position: relative;
        padding: 2px 0;
        margin: 0;
        transition: background-color 0.15s ease;
    }

    .response-line:hover {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
    }

    .line-copy-button {
        position: absolute;
        left: -32px;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 3px;
        padding: 2px;
        cursor: pointer !important;
        opacity: 0;
        transition:
            opacity 0.15s ease,
            background-color 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
    }

    .response-line:hover .line-copy-button {
        opacity: 1;
    }

    .line-copy-button:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    .line-copy-button.copied {
        background: rgba(40, 167, 69, 0.3);
    }

    .line-copy-button svg {
        width: 12px;
        height: 12px;
        stroke: rgba(255, 255, 255, 0.9);
        cursor: pointer !important;
        pointer-events: none;
    }

    .text-input-container {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        height: 40px;
        background: transparent;
        border-top: 1px solid rgba(255, 255, 255, 0.15);
        flex-shrink: 0;
        transition:
            opacity 0.1s ease-in-out,
            transform 0.1s ease-in-out;
        transform-origin: bottom;
        box-sizing: border-box;
    }

    .text-input-container.hidden {
        opacity: 0;
        transform: scaleY(0);
        padding: 0;
        height: 0;
        overflow: hidden;
        border-top: none;
    }

    .text-input-container.no-response {
        border-top: none;
    }

    #textInput {
        flex: 1;
        padding: 0;
        background: transparent;
        border: none;
        outline: none;
        color: rgb(255, 255, 255);
        font-size: 15px;
        font-family: 'Helvetica Neue', sans-serif;
        font-weight: 400;
    }

    #textInput::placeholder {
        color: rgba(255, 255, 255, 0.5);
    }

    #textInput:focus {
        outline: none;
    }

    /* Character limit warning */
    .character-limit-warning {
        color: #ef4444;
        font-size: 12px;
        background: transparent;
        padding: 4px 0;
        margin-top: 4px;
    }

    .response-line h1,
    .response-line h2,
    .response-line h3,
    .response-line h4,
    .response-line h5,
    .response-line h6 {
        color: rgba(255, 255, 255, 0.95);
        margin: 16px 0 8px 0;
        font-weight: 600;
    }

    .response-line p {
        margin: 8px 0;
        color: rgba(255, 255, 255, 0.9);
    }

    .response-line ul,
    .response-line ol {
        margin: 8px 0;
        padding-left: 20px;
    }

    .response-line li {
        margin: 4px 0;
        color: rgba(255, 255, 255, 0.9);
    }

    .response-line code {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.95);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'Monaco', 'Menlo', monospace;
        font-size: 13px;
    }

    .response-line pre {
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.95);
        padding: 12px;
        border-radius: 6px;
        overflow-x: auto;
        margin: 12px 0;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .response-line pre code {
        background: none;
        padding: 0;
    }

    .response-line blockquote {
        border-left: 3px solid rgba(255, 255, 255, 0.3);
        margin: 12px 0;
        padding: 8px 16px;
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.8);
    }

    .interruption-indicator {
        border-top: 1px solid rgba(255, 255, 255, 0.2);
        margin-top: 16px;
        padding-top: 8px;
        text-align: start; /* align text at the start */
        color: rgba(255, 255, 255, 0.5);
        font-size: 12px;

        opacity: 0;
        animation: fadeIn 0.4s ease forwards;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }

    @keyframes messageSlideIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: rgba(255, 255, 255, 0.5);
        font-size: 14px;
    }

    .btn-gap {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        gap: 4px;
    }

    /* ────────────────[ GLASS BYPASS ]─────────────── */
    :host-context(body.has-glass) .ask-container,
    :host-context(body.has-glass) .response-header,
    :host-context(body.has-glass) .response-icon,
    :host-context(body.has-glass) .copy-button,
    :host-context(body.has-glass) .close-button,
    :host-context(body.has-glass) .line-copy-button,
    :host-context(body.has-glass) .msg-copy-button,
    :host-context(body.has-glass) .text-input-container,
    :host-context(body.has-glass) .response-container pre,
    :host-context(body.has-glass) .response-container p code,
    :host-context(body.has-glass) .response-container pre code {
        background: transparent !important;
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        filter: none !important;
        backdrop-filter: none !important;
    }

    :host-context(body.has-glass) .ask-container::before {
        display: none !important;
    }

    :host-context(body.has-glass) .copy-button:hover,
    :host-context(body.has-glass) .close-button:hover,
    :host-context(body.has-glass) .line-copy-button,
    :host-context(body.has-glass) .line-copy-button:hover,
    :host-context(body.has-glass) .msg-copy-button:hover,
    :host-context(body.has-glass) .response-line:hover,
    :host-context(body.has-glass) .msg:hover {
        background: transparent !important;
    }

    :host-context(body.has-glass) .response-container::-webkit-scrollbar-track,
    :host-context(body.has-glass) .response-container::-webkit-scrollbar-thumb {
        background: transparent !important;
    }

    .use-screen-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(102, 102, 102, 0.3);
        color: #CCC;
        border: 2px solid #666;
        border-radius: 24px;
        font-size: 13px;
        font-family: 'Helvetica Neue', sans-serif;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.25s ease;
        padding: 0 8px;
        height: 32px;
        user-select: none;
        box-shadow: none;
    }

    .use-screen-btn.active {
        background: rgba(74, 158, 255, 0.1);
        border: 2px solid #4A9EFF;
        color: #6BB6FF;
        box-shadow: 0 0 20px rgba(74, 158, 255, 0.3);
    }

    .use-screen-btn.inactive {
        background: rgba(102, 102, 102, 0.3);
        border: 2px solid #666;
        color: #CCC;
        box-shadow: none;
        opacity: 0.5;
    }

    .use-screen-btn.active:hover {
        background: rgba(74, 158, 255, 0.15);
        border-color: #5AAFFF;
        color: #7BC5FF;
        box-shadow: 0 0 25px rgba(74, 158, 255, 0.4);
    }

    .use-screen-btn.inactive:hover {
        background: rgba(102, 102, 102, 0.4);
        border-color: #777;
        color: #DDD;
        opacity: 0.7;
    }

    .submit-btn,
    .clear-btn {
        display: flex;
        align-items: center;
        background: rgba(0, 0, 0, 0);
        color: rgb(255, 255, 255);
        border: none;
        border-radius: 6px;
        margin-left: 8px;
        font-size: 13px;
        font-family: 'Helvetica Neue', sans-serif;
        font-weight: 500;
        overflow: hidden;
        cursor: pointer;
        transition: background 0.15s;
        height: 32px;
        padding: 0 10px;
        box-shadow: none;
    }

    .submit-btn:disabled,
    .clear-btn:disabled {
        background: #6b7280;
        opacity: 0.5;
        cursor: not-allowed;
    }
    .submit-btn:hover,
    .clear-btn:hover {
        background: rgba(255, 255, 255, 0.1);
    }
    .btn-label {
        margin-right: 8px;
        display: flex;
        align-items: center;
        height: 100%;
    }
    .btn-icon {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 13%;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
    }
    .btn-icon img,
    .btn-icon svg {
        width: 13px;
        height: 13px;
        display: block;
    }
    .header-clear-btn {
        background: transparent;
        border: none;
        display: flex;
        align-items: center;
        gap: 2px;
        cursor: pointer;
        padding: 0 2px;
    }
    .header-clear-btn .icon-box {
        color: white;
        font-size: 12px;
        font-family: 'Helvetica Neue', sans-serif;
        font-weight: 500;
        background-color: rgba(255, 255, 255, 0.1);
        border-radius: 13%;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .header-clear-btn:hover .icon-box {
        background-color: rgba(255, 255, 255, 0.18);
    }

    .ask-container.compact .response-header,
    .ask-container.compact .text-input-container {
        padding-top: 4px;
        padding-bottom: 4px;
        min-height: 0;
    }

    .ask-container.compact .response-container {
        padding-top: 0;
        padding-bottom: 0;
    }

    .ask-container.compact #textInput {
        padding: 4px 10px;
        font-size: 13px;
    }

    /* Pulsing animations for UX flow - adapted from previous project */
    .response-label.pulsing {
        animation: textPulse 1.5s ease-in-out infinite;
    }

    #textInput.pulsing::placeholder {
        animation: textPulse 1.5s ease-in-out infinite;
    }

    /* Fix 2: Add smooth transition for thinking states */
    .response-label {
        transition: all 0.3s ease-in-out;
    }

    /* Text pulse animation - exact copy from previous project */
    @keyframes textPulse {
        0%,
        100% {
            opacity: 0.7;
        }
        50% {
            opacity: 1;
        }
    }

    .web-search-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        color: #a1a1aa;
        border: none;
        cursor: pointer;
        transition: all 0.25s ease;
        padding: 0 4px;
        height: 32px;
        user-select: none;
        margin-right: 4px;
    }

    .web-search-btn svg {
        width: 18px;
        height: 18px;
    }

    .web-search-btn.active {
        color: #3b82f6;
        filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.5));
    }

    .web-search-btn:hover {
        color: #ffffff;
    }

    .web-search-btn.active:hover {
        color: #60a5fa;
    }

    .search-status-simple {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0;
        animation: fadeIn 0.3s ease-out;
        margin: 4px 0 12px 0;
        width: 100%;
        max-width: 100%;
    }

    .shiny-text {
        background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.4) 0%,
            rgba(255, 255, 255, 0.9) 50%,
            rgba(255, 255, 255, 0.4) 100%
        );
        background-size: 200% 100%;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: shiny 3s infinite linear;
        display: inline;
    }

    @keyframes shiny {
        0% {
            background-position: 100% 0;
        }
        100% {
            background-position: -100% 0;
        }
    }

    .search-status-content {
        display: flex;
        flex-direction: column;
        gap: 4px;
        color: #a1a1aa;
        font-size: 15px; /* Slightly bigger */
        font-weight: 400;
        width: 100%;
    }

    .search-status-main {
        display: block;
        line-height: 1.5;
        width: 100%;
    }

    .search-globe-container.pulsing {
        animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
        0%,
        100% {
            transform: scale(1);
            opacity: 1;
        }
        50% {
            transform: scale(1.15);
            opacity: 0.7;
        }
    }

    .search-status-text-base {
        display: inline;
        font-size: 15px; /* Slightly bigger */
        color: #a1a1aa;
    }

    .search-query-text {
        display: inline;
        font-size: 15px; /* Slightly bigger */
        font-weight: 500;
        color: #ffffff;
    }

    .search-globe-container {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #a1a1aa; /* Grayish globe to match muted typography */
        margin-right: 8px;
        vertical-align: middle;
        margin-top: -2px;
    }

    .search-globe-container svg {
        width: 16px; /* Slightly bigger */
        height: 16px;
    }

    .search-query-details {
        display: none;
    }

    .search-query-details.hidden {
        display: none;
    }

    .chevron-icon {
        display: none;
    }

    .animate-spin-slow {
        animation: spin 3s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    .citations-container {
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        animation: fadeIn 0.5s ease-out;
        width: 100%;
    }

    .citations-title {
        font-size: 12px;
        font-weight: 600;
        color: white;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .citations-scroll {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding-bottom: 8px;
        scrollbar-width: none;
        -ms-overflow-style: none;
    }

    .citations-scroll::-webkit-scrollbar {
        display: none;
    }

    .citation-card {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 6px 10px;
        cursor: pointer;
        transition: all 0.2s ease;
        max-width: 200px;
    }

    .citation-card:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.2);
    }

    .citation-favicon {
        width: 16px;
        height: 16px;
        border-radius: 4px;
        flex-shrink: 0;
    }

    .citation-info {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .citation-card-title {
        font-size: 12px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.9);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .citation-domain {
        font-size: 10px;
        color: #a1a1aa;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
`;
