import { css } from '../assets/lit-core-2.7.4.min.js';

export const listenViewStyles = css`
    :host {
        display: block;
        width: 400px;
        max-width: 400px;
        min-width: 400px;
        /* Dynamic height: starts at 250px, grows to 500px based on content */
        min-height: 250px;
        max-height: 500px;
        transform: translate3d(0, 0, 0);
        backface-visibility: hidden;
        transition:
            transform 0.2s cubic-bezier(0.23, 1, 0.32, 1),
            opacity 0.2s ease-out;
        will-change: transform, opacity;
        box-sizing: border-box;
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

    * {
        font-family:
            'Helvetica Neue',
            -apple-system,
            BlinkMacSystemFont,
            'Segoe UI',
            Roboto,
            sans-serif;
        cursor: default;
        user-select: none;
    }

    /* Allow text selection in insights responses */
    .insights-container,
    .insights-container *,
    .markdown-content {
        user-select: text !important;
        cursor: text !important;
    }

    /* highlight.js styles */
    .insights-container pre {
        background: rgba(0, 0, 0, 0.4) !important;
        border-radius: 8px !important;
        padding: 12px !important;
        margin: 8px 0 !important;
        overflow-x: auto !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        white-space: pre !important;
        word-wrap: normal !important;
        word-break: normal !important;
    }

    .insights-container code {
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace !important;
        font-size: 11px !important;
        background: transparent !important;
        white-space: pre !important;
        word-wrap: normal !important;
        word-break: normal !important;
    }

    .insights-container pre code {
        white-space: pre !important;
        word-wrap: normal !important;
        word-break: normal !important;
        display: block !important;
    }

    .insights-container p code {
        background: rgba(255, 255, 255, 0.1) !important;
        padding: 2px 4px !important;
        border-radius: 3px !important;
        color: #ffd700 !important;
    }

    .hljs-keyword {
        color: #ff79c6 !important;
    }

    .hljs-string {
        color: #f1fa8c !important;
    }

    .hljs-comment {
        color: #6272a4 !important;
    }

    .hljs-number {
        color: #bd93f9 !important;
    }

    .hljs-function {
        color: #50fa7b !important;
    }

    .hljs-title {
        color: #50fa7b !important;
    }

    .hljs-variable {
        color: #8be9fd !important;
    }

    .hljs-built_in {
        color: #ffb86c !important;
    }

    .hljs-attr {
        color: #50fa7b !important;
    }

    .hljs-tag {
        color: #ff79c6 !important;
    }

    .assistant-container {
        display: flex;
        flex-direction: column;
        color: #ffffff;
        box-sizing: border-box;
        position: relative;
        background: rgba(11, 11, 11, 0.66);
        border: 1px solid rgba(255, 255, 255, 0.4);
        overflow: hidden;
        border-radius: 12px;
        width: 100%;
        /* Dynamic height: grows with content from 250px to 500px */
        min-height: 250px;
        max-height: 500px;
        height: auto;
    }

    .assistant-container::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border-radius: 12px;
        padding: 1px;
        background: linear-gradient(169deg, rgba(255, 255, 255, 0.17) 0%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.17) 100%);
        -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
        -webkit-mask-composite: destination-out;
        mask-composite: exclude;
        pointer-events: none;
    }

    .assistant-container::before {
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
        z-index: -1;
    }

    .top-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 16px;
        min-height: 32px;
        position: relative;
        z-index: 1;
        width: 100%;
        box-sizing: border-box;
        flex-shrink: 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .bar-left-text {
        color: white;
        font-size: 13px;
        font-family: 'Helvetica Neue', sans-serif;
        font-weight: 500;
        position: relative;
        overflow: hidden;
        white-space: nowrap;
        flex: 1;
        min-width: 0;
        max-width: 200px;
    }

    .bar-left-text-content {
        display: inline-block;
        transition: transform 0.3s ease;
    }

    .bar-left-text-content.slide-in {
        animation: slideIn 0.3s ease forwards;
    }

    .bar-controls {
        display: flex;
        gap: 4px;
        align-items: center;
        flex-shrink: 0;
        width: 200px;
        justify-content: flex-end;
        box-sizing: border-box;
        padding: 4px;
    }

    .profile-dropdown {
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 10px;
        padding: 2px 6px;
        height: 20px;
        min-width: 60px;
        outline: none;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .profile-dropdown:hover {
        background: rgba(0, 0, 0, 0.4);
        border-color: rgba(255, 255, 255, 0.3);
    }

    .profile-dropdown:focus {
        border-color: rgba(255, 255, 255, 0.5);
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2);
    }

    .profile-dropdown option {
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 4px;
    }

    .toggle-button {
        display: flex;
        align-items: center;
        gap: 5px;
        background: transparent;
        color: rgba(255, 255, 255, 0.9);
        border: none;
        outline: none;
        box-shadow: none;
        padding: 4px 8px;
        border-radius: 5px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        height: 24px;
        white-space: nowrap;
        transition: background-color 0.15s ease;
        justify-content: center;
    }

    .toggle-button:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .toggle-button svg {
        flex-shrink: 0;
        width: 12px;
        height: 12px;
    }

    .copy-button {
        background: transparent;
        color: rgba(255, 255, 255, 0.9);
        border: none;
        outline: none;
        box-shadow: none;
        padding: 4px;
        border-radius: 3px;
        cursor: pointer;
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
        background: rgba(255, 255, 255, 0.15);
    }

    .copy-button svg {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        transition:
            opacity 0.2s ease-in-out,
            transform 0.2s ease-in-out;
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

    .timer {
        font-family: 'Monaco', 'Menlo', monospace;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.7);
    }

    /* Bouncing dots animation for listening state */
    .listening-dots {
        position: absolute;
        bottom: 8px;
        right: 12px;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        z-index: 10;
    }

    .listening-dot {
        width: 4px;
        height: 4px;
        background: rgba(255, 255, 255, 0.9);
        border-radius: 50%;
        animation: typing-bounce 1.4s ease-in-out infinite;
    }

    .listening-dot:nth-child(1) {
        animation-delay: 0s;
    }

    .listening-dot:nth-child(2) {
        animation-delay: 0.2s;
    }

    .listening-dot:nth-child(3) {
        animation-delay: 0.4s;
    }

    @keyframes typing-bounce {
        0%,
        60%,
        100% {
            transform: translateY(0);
            opacity: 0.4;
        }
        30% {
            transform: translateY(-8px);
            opacity: 1;
        }
    }

    /* ────────────────[ GLASS BYPASS ]─────────────── */
    :host-context(body.has-glass) .assistant-container,
    :host-context(body.has-glass) .top-bar,
    :host-context(body.has-glass) .toggle-button,
    :host-context(body.has-glass) .copy-button,
    :host-context(body.has-glass) .transcription-container,
    :host-context(body.has-glass) .insights-container,
    :host-context(body.has-glass) .stt-message,
    :host-context(body.has-glass) .outline-item,
    :host-context(body.has-glass) .request-item,
    :host-context(body.has-glass) .markdown-content,
    :host-context(body.has-glass) .insights-container pre,
    :host-context(body.has-glass) .insights-container p code,
    :host-context(body.has-glass) .insights-container pre code {
        background: transparent !important;
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        filter: none !important;
        backdrop-filter: none !important;
    }

    :host-context(body.has-glass) .assistant-container::before,
    :host-context(body.has-glass) .assistant-container::after {
        display: none !important;
    }

    :host-context(body.has-glass) .toggle-button:hover,
    :host-context(body.has-glass) .copy-button:hover,
    :host-context(body.has-glass) .outline-item:hover,
    :host-context(body.has-glass) .request-item.clickable:hover,
    :host-context(body.has-glass) .markdown-content:hover {
        background: transparent !important;
        transform: none !important;
    }

    :host-context(body.has-glass) .transcription-container::-webkit-scrollbar-track,
    :host-context(body.has-glass) .transcription-container::-webkit-scrollbar-thumb,
    :host-context(body.has-glass) .insights-container::-webkit-scrollbar-track,
    :host-context(body.has-glass) .insights-container::-webkit-scrollbar-thumb {
        background: transparent !important;
    }

    :host-context(body.has-glass) * {
        animation: none !important;
        transition: none !important;
        transform: none !important;
        filter: none !important;
        backdrop-filter: none !important;
        box-shadow: none !important;
    }

    /* Exception: Allow bouncing dots animation even in glass mode */
    :host-context(body.has-glass) .listening-dot {
        animation: typing-bounce 1.4s ease-in-out infinite !important;
    }

    :host-context(body.has-glass) .assistant-container,
    :host-context(body.has-glass) .stt-message,
    :host-context(body.has-glass) .toggle-button,
    :host-context(body.has-glass) .copy-button {
        border-radius: 0 !important;
    }

    :host-context(body.has-glass) ::-webkit-scrollbar,
    :host-context(body.has-glass) ::-webkit-scrollbar-track,
    :host-context(body.has-glass) ::-webkit-scrollbar-thumb {
        background: transparent !important;
        width: 0 !important;
    }
`;
