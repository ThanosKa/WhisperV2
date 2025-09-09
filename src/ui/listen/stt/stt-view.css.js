import { css } from '../../assets/lit-core-2.7.4.min.js';

export const sttViewStyles = css`
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
        padding: 8px 36px 8px 12px;
        border-radius: 12px;
        max-width: 80%;
        word-wrap: break-word;
        word-break: break-word;
        line-height: 1.5;
        font-size: 13px;
        margin-bottom: 4px;
        box-sizing: border-box;
        position: relative;
        transition: background-color 0.15s ease;
        user-select: text;
        cursor: text;
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
        transition:
            opacity 0.2s ease,
            background-color 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        z-index: 10;
        user-select: none;
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
        transition:
            opacity 0.2s ease,
            transform 0.2s ease;
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
    }
`;
