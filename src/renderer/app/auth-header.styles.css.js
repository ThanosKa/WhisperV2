import { css } from '../assets/lit-core-2.7.4.min.js';

export const authHeaderStyles = css`
    :host {
        display: flex;
        padding: 2px;
        transition:
            transform 0.2s cubic-bezier(0.23, 1, 0.32, 1),
            opacity 0.2s ease-out;
    }

    :host(.hiding) {
        animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.6, 1) forwards;
    }

    :host(.showing) {
        animation: slideDown 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }

    :host(.sliding-in) {
        animation: fadeIn 0.2s ease-out forwards;
    }

    :host(.hidden) {
        opacity: 0;
        transform: translateY(-150%) scale(0.85);
        pointer-events: none;
    }

    * {
        font-family:
            system-ui,
            -apple-system,
            sans-serif;
        cursor: default;
        user-select: none;
    }

    /* Auth Header Container */
    .auth-header {
        -webkit-app-region: no-drag;
        width: max-content;
        height: 45px;
        padding: 2px 10px 2px 13px;
        background: transparent;
        border-radius: 9000px;
        justify-content: space-between;
        align-items: center;
        display: inline-flex;
        box-sizing: border-box;
        position: relative;
    }

    .auth-header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;
        background: rgba(11, 11, 11, 0.66);
        border: 1px solid rgba(255, 255, 255, 0.4);
        border-radius: 9000px;
        box-shadow:
            0 4px 12px rgba(0, 0, 0, 0.3),
            0 2px 6px rgba(0, 0, 0, 0.2);
        z-index: -1;
    }

    .auth-header::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border-radius: 9000px;
        padding: 1px;
        background: transparent;
        pointer-events: none;
    }

    /* Auth Login Button */
    .auth-login-button {
        -webkit-app-region: no-drag;
        height: 26px;
        padding: 0 13px;
        background: transparent;
        border-radius: 9000px;
        justify-content: center;
        width: auto;
        align-items: center;
        gap: 6px;
        display: flex;
        border: none;
        cursor: pointer;
        position: relative;
        overflow: hidden;
    }

    .auth-login-button:disabled {
        cursor: default;
        opacity: 0.8;
    }

    .auth-login-button:hover::before {
        background: rgba(255, 255, 255, 0.18);
    }

    .auth-login-button::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.14);
        border-radius: 9000px;
        z-index: -1;
        transition: background 0.15s ease;
    }

    .auth-login-button::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border-radius: 9000px;
        padding: 1px;
        background: linear-gradient(169deg, rgba(255, 255, 255, 0.17) 0%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.17) 100%);
        -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
        -webkit-mask-composite: destination-out;
        mask-composite: exclude;
        pointer-events: none;
    }

    /* Text-only variant for auth login button */
    .auth-login-button.text-link {
        width: auto;
        padding: 0 6px;
        background: transparent;
        border-radius: 25px;
        transition: background 0.15s ease;
    }

    .auth-login-button.text-link::before,
    .auth-login-button.text-link::after {
        display: none;
    }

    .auth-login-button.text-link .auth-button-text {
        color: #fff;
        text-decoration: none;
    }

    /* Match hover background */
    .auth-login-button.text-link:hover {
        background: rgba(128, 128, 128, 0.4);
        border-radius: 25px;
    }

    /* Auth button content */
    .auth-button-content {
        padding-bottom: 1px;
        justify-content: center;
        align-items: center;
        gap: 10px;
        display: flex;
    }

    .auth-button-text {
        color: rgb(255, 255, 255);
        font-size: 12px;
        font-family:
            system-ui,
            -apple-system,
            sans-serif;
        font-weight: 500;
        word-wrap: break-word;
        white-space: nowrap;
        background: transparent;
    }

    /* Loading dots styles for AuthHeader */
    .loading-dots {
        display: flex;
        align-items: center;
        gap: 5px;
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

    /* Water Drop Ripple animation */
    .water-drop-ripple {
        width: 30px;
        height: 30px;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .ripple-ring {
        position: absolute;
        border: 1.5px solid rgba(255, 255, 255, 0.8);
        border-radius: 50%;
        animation: water-ripple-pulse 3s infinite ease-out;
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
            border-width: 2px;
        }
        70% {
            width: 28px;
            height: 28px;
            opacity: 0.6;
            border-width: 1px;
        }
        100% {
            width: 40px;
            height: 40px;
            opacity: 0;
            border-width: 0.5px;
        }
    }

    /* ────────────────[ GLASS BYPASS ]─────────────── */
    :host-context(body.has-glass) .auth-header,
    :host-context(body.has-glass) .auth-login-button {
        background: transparent !important;
        filter: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
    }

    :host-context(body.has-glass) .auth-header::before,
    :host-context(body.has-glass) .auth-header::after,
    :host-context(body.has-glass) .auth-login-button::before,
    :host-context(body.has-glass) .auth-login-button::after {
        display: none !important;
    }

    :host-context(body.has-glass) .auth-login-button:hover::before {
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

    :host-context(body.has-glass) .auth-header,
    :host-context(body.has-glass) .auth-login-button {
        border-radius: 0 !important;
    }
    :host-context(body.has-glass) {
        animation: none !important;
        transition: none !important;
        transform: none !important;
        will-change: auto !important;
    }
`;
