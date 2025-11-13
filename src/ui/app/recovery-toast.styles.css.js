import { css } from '../assets/lit-core-2.7.4.min.js';

export const recoveryToastStyles = css`
    :host {
        display: block;
        width: 100%;
        height: 100%;
    }

    .recovery-toast {
        width: 100%;
        height: 100%;
        background: rgba(18, 18, 18, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 10px;
        padding: 16px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), 0 1px 4px rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(10px);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        font-family: system-ui, -apple-system, sans-serif;
        box-sizing: border-box;
        animation: slideInUp 0.3s ease-out;
    }

    .recovery-toast.fade-out {
        animation: fadeOut 0.3s ease-out forwards;
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .header-content {
        display: flex;
        align-items: center;
        flex: 1;
        min-width: 0;
    }

    .status-dot {
        width: 8px;
        height: 8px;
        background: #ffaa00;
        border-radius: 50%;
        margin-right: 10px;
        flex-shrink: 0;
        animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
        0%, 100% {
            opacity: 1;
        }
        50% {
            opacity: 0.5;
        }
    }

    .text-group {
        flex: 1;
        min-width: 0;
    }

    .title {
        color: rgba(255, 255, 255, 0.95);
        font-size: 13px;
        font-weight: 500;
        line-height: 1.2;
    }

    .session-name {
        color: rgba(255, 255, 255, 0.5);
        font-size: 12px;
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .close-btn {
        background: rgba(255, 255, 255, 0.05);
        border: none;
        color: rgba(255, 255, 255, 0.4);
        cursor: pointer;
        padding: 0;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.2s;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 18px;
        line-height: 1;
        flex-shrink: 0;
    }

    .close-btn:hover {
        color: white;
        background: rgba(255, 255, 255, 0.12);
    }

    .actions {
        display: flex;
        justify-content: space-between;
        gap: 8px;
    }

    .action-btn {
        flex: 0 0 auto;
        min-width: 80px;
        height: 28px;
        padding: 0 16px;
        border-radius: 7px;
        border: none;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        font-family: system-ui, -apple-system, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
    }

    .action-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .resume-btn {
        background: rgba(255, 255, 255, 0.12);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .resume-btn.loading {
        color: rgba(255, 255, 255, 0.7);
    }

    .resume-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.2);
        border-color: rgba(255, 255, 255, 0.3);
    }

    .finalize-btn {
        background: transparent;
        color: rgba(255, 255, 255, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.15);
    }

    .finalize-btn:hover:not(:disabled) {
        color: rgba(255, 255, 255, 0.9);
        border-color: rgba(255, 255, 255, 0.25);
    }

    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.5);
        transform: scale(0);
        animation: ripple-animation 0.6s ease-out;
        pointer-events: none;
    }

    @keyframes ripple-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }

    .resume-spinner {
        width: 16px;
        height: 16px;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .resume-spinner .spinner-ring {
        position: absolute;
        border: 2px solid rgba(255, 255, 255, 0.9);
        border-radius: 50%;
        animation: resume-spinner-pulse 2.5s infinite ease-out;
    }

    .resume-spinner .spinner-ring:nth-child(1) {
        animation-delay: 0s;
    }
    .resume-spinner .spinner-ring:nth-child(2) {
        animation-delay: 0.6s;
    }
    .resume-spinner .spinner-ring:nth-child(3) {
        animation-delay: 1.2s;
    }
    .resume-spinner .spinner-ring:nth-child(4) {
        animation-delay: 1.8s;
    }

    @keyframes resume-spinner-pulse {
        0% {
            width: 4px;
            height: 4px;
            opacity: 1;
            border-width: 1.5px;
        }
        70% {
            width: 20px;
            height: 20px;
            opacity: 0.6;
            border-width: 1px;
        }
        100% {
            width: 30px;
            height: 30px;
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
        to {
            opacity: 0;
            transform: scale(0.95);
        }
    }
`;
