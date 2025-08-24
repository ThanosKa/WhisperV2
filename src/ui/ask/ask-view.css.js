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
        85% {
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

    /* Allow text selection in assistant responses */
    .response-container,
    .response-container * {
        user-select: text !important;
        cursor: text !important;
    }

    .response-container pre {
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
    .hljs-variable {
        color: #8be9fd !important;
    }
    .hljs-built_in {
        color: #ffb86c !important;
    }
    .hljs-title {
        color: #50fa7b !important;
    }
    .hljs-attr {
        color: #50fa7b !important;
    }
    .hljs-tag {
        color: #ff79c6 !important;
    }

    .ask-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        background: rgba(0, 0, 0, 0.6);
        border-radius: 12px;
        outline: 0.5px rgba(255, 255, 255, 0.3) solid;
        outline-offset: -1px;
        backdrop-filter: blur(1px);
        box-sizing: border-box;
        position: relative;
        overflow: hidden;
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
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        flex-shrink: 0;
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
        height: 20px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .response-icon svg {
        width: 12px;
        height: 12px;
        stroke: rgba(255, 255, 255, 0.9);
    }

    .response-label {
        font-size: 13px;
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

    .header-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        justify-content: flex-end;
    }

    .question-text {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.7);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 300px;
        margin-right: 8px;
    }

    .header-controls {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-shrink: 0;
    }

    .copy-button {
        background: transparent;
        color: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.2);
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
        max-height: 400px;
        position: relative;
    }

    .response-container.hidden {
        display: none;
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
        width: 8px;
        height: 8px;
        background: rgba(255, 255, 255, 0.6);
        border-radius: 50%;
        animation: pulse 1.5s ease-in-out infinite;
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
        0%,
        80%,
        100% {
            opacity: 0.3;
            transform: scale(0.8);
        }
        40% {
            opacity: 1;
            transform: scale(1.2);
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
        cursor: pointer;
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
    }

    .text-input-container {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        background: rgba(0, 0, 0, 0.1);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        flex-shrink: 0;
        transition:
            opacity 0.1s ease-in-out,
            transform 0.1s ease-in-out;
        transform-origin: bottom;
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
        padding: 10px 14px;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 20px;
        outline: none;
        border: none;
        color: white;
        font-size: 14px;
        font-family: 'Helvetica Neue', sans-serif;
        font-weight: 400;
    }

    #textInput::placeholder {
        color: rgba(255, 255, 255, 0.5);
    }

    #textInput:focus {
        outline: none;
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
    :host-context(body.has-glass) .response-line:hover {
        background: transparent !important;
    }

    :host-context(body.has-glass) .response-container::-webkit-scrollbar-track,
    :host-context(body.has-glass) .response-container::-webkit-scrollbar-thumb {
        background: transparent !important;
    }

    .submit-btn,
    .clear-btn {
        display: flex;
        align-items: center;
        background: transparent;
        color: white;
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
`;
