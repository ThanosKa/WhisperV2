import { css } from '../assets/lit-core-2.7.4.min.js';

export const recoveryToastStyles = css`
    :host {
        display: block;
        width: 100%;
        height: 100%;
    }

    .toast-container {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        padding: 12px;
        box-sizing: border-box;
    }

    .toast-content {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px 12px;
        background: rgba(11, 11, 11, 0.66);
        border: 1px solid rgba(255, 255, 255, 0.4);
        border-radius: 12px;
        box-shadow:
            0 4px 12px rgba(0, 0, 0, 0.3),
            0 2px 6px rgba(0, 0, 0, 0.2);
        animation: slideInUp 0.3s ease-out;
        width: 100%;
        max-width: 220px;
    }

    .toast-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
    }

    .toast-container.fading-out .toast-content {
        animation: fadeOut 0.3s ease-out forwards;
    }

    .toast-text {
        color: rgba(255, 255, 255, 0.95);
        font-size: 11px;
        font-weight: 500;
        white-space: nowrap;
        font-family: system-ui, -apple-system, sans-serif;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .toast-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        width: 100%;
    }

    .resume-button,
    .finalize-button {
        padding: 4px 8px;
        background: rgba(128, 128, 128, 0.3);
        border: none;
        border-radius: 6px;
        color: white;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
        font-family: system-ui, -apple-system, sans-serif;
        position: relative;
        min-width: 55px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .resume-button:hover:not(:disabled),
    .finalize-button:hover:not(:disabled) {
        background: rgba(128, 128, 128, 0.5);
        transform: translateY(-1px);
    }

    .resume-button:active:not(:disabled),
    .finalize-button:active:not(:disabled) {
        transform: translateY(0);
    }

    .resume-button:disabled,
    .finalize-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .resume-button.with-ripple {
        background: transparent;
    }

    .dismiss-button {
        padding: 0;
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
        transition: color 0.2s;
        font-family: system-ui, -apple-system, sans-serif;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .dismiss-button:hover {
        color: rgba(255, 255, 255, 1);
    }

    /* Water Drop Ripple Effect */
    .water-drop-ripple {
        width: 12px;
        height: 11px;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: visible;
    }

    .ripple-ring {
        position: absolute;
        border: 2px solid rgba(255, 255, 255, 0.9);
        border-radius: 50%;
        animation: water-ripple-pulse 2.5s infinite ease-out;
    }

    .ripple-ring:nth-child(1) {
        animation-delay: 0s;
    }

    .ripple-ring:nth-child(2) {
        animation-delay: 0.8s;
    }

    .ripple-ring:nth-child(3) {
        animation-delay: 1.6s;
    }

    .ripple-ring:nth-child(4) {
        animation-delay: 2.4s;
    }

    @keyframes water-ripple-pulse {
        0% {
            width: 4px;
            height: 4px;
            opacity: 1;
            border-width: 1.5px;
        }
        70% {
            width: 24px;
            height: 24px;
            opacity: 0.6;
            border-width: 1px;
        }
        100% {
            width: 36px;
            height: 36px;
            opacity: 0;
            border-width: 0.5px;
        }
    }

    @keyframes slideInUp {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    @keyframes fadeOut {
        from {
            opacity: 1;
            transform: translateY(0);
        }
        to {
            opacity: 0;
            transform: translateY(-10px);
        }
    }
`;

