import { css } from '../assets/lit-core-2.7.4.min.js';

export const authHeaderStyles = css`
    :host {
        display: flex;
        padding: 2px;
        transition:
            transform 0.2s cubic-bezier(0.23, 1, 0.32, 1),
            opacity 0.2s ease-out;
    }

    :host(.sliding-in) {
        animation: fadeIn 0.2s ease-out forwards;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(-6px) scale(0.95);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }

    * {
        font-family:
            system-ui,
            -apple-system,
            sans-serif;
        cursor: default;
        user-select: none;
    }

    .header {
        -webkit-app-region: no-drag;
        width: max-content;
        height: 45px;
        padding: 2px 10px 2px 13px;
        background: transparent;
        border-radius: 9000px;
        justify-content: center;
        align-items: center;
        display: inline-flex;
        box-sizing: border-box;
        position: relative;
    }

    .header::before {
        content: '';
        position: absolute;
        inset: 0;
        background: rgba(11, 11, 11, 0.66);
        border: 1px solid rgba(255, 255, 255, 0.4);
        border-radius: 9000px;
        box-shadow:
            0 4px 12px rgba(0, 0, 0, 0.3),
            0 2px 6px rgba(0, 0, 0, 0.2);
        z-index: -1;
    }

    .listen-button {
        -webkit-app-region: no-drag;
        height: 26px;
        padding: 0 13px;
        background: transparent;
        border-radius: 9000px;
        justify-content: center;
        align-items: center;
        gap: 6px;
        display: flex;
        border: none;
        cursor: pointer;
        position: relative;
    }

    .listen-button:disabled {
        cursor: default;
        opacity: 0.8;
    }

    .listen-button.text-link {
        width: auto;
        padding: 0 6px;
        background: transparent;
        border-radius: 25px;
        transition: background 0.15s ease;
    }

    .listen-button.text-link::before,
    .listen-button.text-link::after {
        display: none;
    }

    .listen-button.text-link .action-text-content {
        color: #fff;
        text-decoration: none;
    }

    .listen-button.text-link:hover {
        background: rgba(128, 128, 128, 0.4);
    }

    .action-text {
        justify-content: center;
        align-items: center;
        gap: 10px;
        display: flex;
    }

    .action-text-content {
        color: rgb(255, 255, 255);
        font-size: 12px;
        font-family:
            system-ui,
            -apple-system,
            sans-serif;
        font-weight: 500;
        white-space: nowrap;
    }

    .loading-dots {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-left: 6px;
    }

    .loading-dots span {
        width: 6px;
        height: 6px;
        background-color: white;
        border-radius: 50%;
        animation: pulse 1.4s infinite ease-in-out both;
    }

    .loading-dots span:nth-of-type(1) {
        animation-delay: -0.32s;
    }

    .loading-dots span:nth-of-type(2) {
        animation-delay: -0.16s;
    }

    @keyframes pulse {
        0%,
        80%,
        100% {
            opacity: 0.2;
        }
        40% {
            opacity: 1;
        }
    }
`;
