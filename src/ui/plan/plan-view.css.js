import { css } from '../assets/lit-core-2.7.4.min.js';

export const planViewStyles = css`
    :host {
        display: block;
        width: 100%;
        height: 100%;
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
    }

    .plan-menu-wrapper {
        background: rgba(11, 11, 11, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 10px;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 4px 16px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        overflow: hidden;
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        min-height: 60px;
    }

    .plan-content {
        padding: 12px 16px;
        color: white;
        font-family:
            'Helvetica Neue',
            -apple-system,
            BlinkMacSystemFont,
            'Segoe UI',
            Roboto,
            sans-serif;
    }

    .plan-primary-text {
        font-size: 14px;
        font-weight: 500;
        color: white;
        line-height: 1.4;
        margin: 0 0 4px 0;
    }

    .plan-secondary-text {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
        line-height: 1.3;
        margin: 0;
    }

    .plan-loading {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .loading-spinner {
        width: 12px;
        height: 12px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-top: 1px solid rgba(255, 255, 255, 0.8);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }

    /* Enhanced visual styling matching the glass design */
    .plan-menu-wrapper::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 50%, rgba(255, 255, 255, 0.02) 100%);
        border-radius: 10px;
        pointer-events: none;
        z-index: -1;
    }

    /* Responsive adjustments */
    @media (max-width: 320px) {
        :host {
            min-width: 200px;
        }

        .plan-content {
            padding: 10px 12px;
        }

        .plan-primary-text {
            font-size: 13px;
        }

        .plan-secondary-text {
            font-size: 11px;
        }
    }

    /* Glass bypass mode compatibility */
    :host-context(body.has-glass) .plan-menu-wrapper {
        background: transparent !important;
        border: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        box-shadow: none !important;
    }

    :host-context(body.has-glass) .plan-menu-wrapper::before {
        display: none !important;
    }

    :host-context(body.has-glass) .plan-content {
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

    /* Exception: Allow loading spinner animation even in glass mode */
    :host-context(body.has-glass) .loading-spinner {
        animation: spin 1s linear infinite !important;
    }
`;
