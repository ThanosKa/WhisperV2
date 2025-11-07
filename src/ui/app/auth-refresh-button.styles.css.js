import { css } from '../assets/lit-core-2.7.4.min.js';

export const authRefreshButtonStyles = css`
    :host {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    * {
        font-family:
            system-ui,
            -apple-system,
            sans-serif;
        cursor: default;
        user-select: none;
    }

    /* Auth Refresh Button */
    .auth-refresh-button {
        -webkit-app-region: no-drag;
        width: 24px;
        height: 24px;
        padding: 0;
        background: transparent;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        transition: background 0.15s ease;
    }

    .auth-refresh-button:hover {
        background: rgba(255, 255, 255, 0.18);
    }

    .auth-refresh-button::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.14);
        border-radius: 50%;
        z-index: -1;
        transition: background 0.15s ease;
    }

    .auth-refresh-button:hover::before {
        background: rgba(255, 255, 255, 0.18);
    }

    .auth-refresh-icon {
        width: 16px;
        height: 16px;
        color: #fff;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    /* ────────────────[ GLASS BYPASS ]─────────────── */
    :host-context(body.has-glass) .auth-refresh-button {
        background: transparent !important;
        filter: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
    }

    :host-context(body.has-glass) .auth-refresh-button::before {
        display: none !important;
    }

    :host-context(body.has-glass) .auth-refresh-button:hover::before {
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
`;

