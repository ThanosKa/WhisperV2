import { css } from '../../assets/lit-core-2.7.4.min.js';

export const summaryViewStyles = css`
    :host {
        display: block;
        width: 100%;
    }

    /* Inherit font styles from parent */

    /* highlight.js 스타일 추가 */
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

    .insights-container {
        overflow-y: auto;
        padding: 12px 16px 16px 16px;
        position: relative;
        z-index: 1;
        /* Dynamic sizing: grows with content, scrolls when exceeds window */
        min-height: 200px; /* Minimum for empty state */
        max-height: 450px; /* Leave room for top bar */
        height: auto;
        flex: 1;
        box-sizing: border-box;
    }

    /* Visibility handled by parent component */

    .insights-container::-webkit-scrollbar {
        width: 8px;
    }
    .insights-container::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.1);
        border-radius: 4px;
    }
    .insights-container::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 4px;
    }
    .insights-container::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.5);
    }

    insights-title {
        color: rgba(255, 255, 255, 0.8);
        font-size: 15px;
        font-weight: 500;
        font-family: 'Helvetica Neue', sans-serif;
        margin: 12px 0 8px 0;
        display: block;
    }

    .insights-container h4 {
        color: #ffffff;
        font-size: 12px;
        font-weight: 600;
        margin: 12px 0 8px 0;
        padding: 4px 8px;
        border-radius: 4px;
        background: transparent;
        cursor: default;
    }

    .insights-container h4:hover {
        background: transparent;
    }

    .insights-container h4:first-child {
        margin-top: 0;
    }

    .outline-item {
        color: #ffffff;
        font-size: 11px;
        line-height: 1.4;
        margin: 4px 0;
        padding: 6px 8px;
        border-radius: 4px;
        background: transparent;
        transition: background-color 0.15s ease;
        cursor: pointer;
        word-wrap: break-word;
    }

    .outline-item:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .request-item {
        color: #ffffff;
        font-size: 12px;
        line-height: 1.2;
        margin: 4px 0;
        padding: 6px 8px;
        border-radius: 4px;
        background: transparent;
        cursor: default;
        word-wrap: break-word;
        transition: background-color 0.15s ease;
    }

    .request-item.clickable {
        cursor: pointer;
        transition: all 0.15s ease;
    }
    .request-item.clickable:hover {
        background: rgba(255, 255, 255, 0.1);
        transform: translateX(2px);
    }

    /* 마크다운 렌더링된 콘텐츠 스타일 */
    .markdown-content {
        color: #ffffff;
        font-size: 11px;
        line-height: 1.4;
        margin: 4px 0;
        padding: 6px 8px;
        border-radius: 4px;
        background: transparent;
        cursor: pointer;
        word-wrap: break-word;
        transition: all 0.15s ease;
    }

    .markdown-content:hover {
        background: rgba(255, 255, 255, 0.1);
        transform: translateX(2px);
    }

    .markdown-content p {
        margin: 4px 0;
    }

    .markdown-content ul,
    .markdown-content ol {
        margin: 4px 0;
        padding-left: 16px;
    }

    .markdown-content li {
        margin: 2px 0;
    }

    .markdown-content a {
        color: #8be9fd;
        text-decoration: none;
    }

    .markdown-content a:hover {
        text-decoration: underline;
    }

    .markdown-content strong {
        font-weight: 600;
        color: #f8f8f2;
    }

    .markdown-content em {
        font-style: italic;
        color: #f1fa8c;
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
