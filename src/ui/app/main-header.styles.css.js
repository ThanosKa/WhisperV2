import { css } from '../assets/lit-core-2.7.4.min.js';

export const mainHeaderStyles = css`
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

    .header {
        -webkit-app-region: no-drag;
        width: max-content;
        height: 45px;
        padding: 2px 10px 2px 13px;
        background: transparent;
        // overflow: hidden;
        border-radius: 9000px;
        /* backdrop-filter: blur(1px); */
        justify-content: space-between;
        align-items: center;
        display: inline-flex;
        box-sizing: border-box;
        position: relative;
    }

    .header::before {
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

    .header::after {
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

    .listen-button {
        -webkit-app-region: no-drag;
        height: 26px;
        padding: 0 13px;
        background: transparent;
        border-radius: 9000px;
        justify-content: center;
        width: 78px;
        align-items: center;
        gap: 6px;
        display: flex;
        border: none;
        cursor: pointer;
        position: relative;
        overflow: hidden; /* For overlay containment */
    }

    .listen-button.icon-only {
        width: auto;
        padding: 0 10px;
        gap: 4px;
    }

    .listen-button.icon-only .listen-icon {
        gap: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .listen-button.icon-only .listen-icon svg {
        width: 16px;
        height: 16px;
    }

    .listen-button:disabled {
        cursor: default;
        opacity: 0.8;
    }

    .listen-button.active::before,
    .listen-button.active:hover::before {
        background: transparent;
    }

    .listen-button.paused::before,
    .listen-button.paused:hover::before {
        background: transparent;
    }

    .listen-button.done {
        background-color: transparent;
        transition: none;
    }

    .listen-button.done .action-text-content {
        color: white;
    }

    .listen-button.done .listen-icon svg rect,
    .listen-button.done .listen-icon svg path {
        fill: white;
    }

    .listen-button.done:hover {
        background-color: transparent;
    }

    .listen-button:hover::before {
        background: rgba(255, 255, 255, 0.18);
    }

    .listen-button::before {
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

    .listen-button::after {
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

    .listen-button.done::after {
        display: none;
    }

    /* Overlay container */
    .listen-loader-overlay {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.1); /* Optional: slight overlay background */
        border-radius: inherit; /* Match button border radius */
        pointer-events: none; /* Allow button clicks to pass through */
    }

    /* Ring loader container */
    .ring-loader {
        position: relative;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    /* Pulsing rings - water drop effect */
    .ring-loader-circle {
        position: relative;
        width: 30px;
        height: 30px;
    }

    .ring-loader-circle::before,
    .ring-loader-circle::after {
        content: '';
        position: absolute;
        border: 2px solid rgba(255, 255, 255, 0.8);
        border-radius: 50%;
        opacity: 1;
        animation: pulse-ring 2s ease-out infinite;
    }

    .ring-loader-circle::after {
        animation-delay: -1s;
    }

    @keyframes pulse-ring {
        0% {
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            margin-top: 0;
            margin-left: 0;
            opacity: 1;
        }
        100% {
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            margin-top: 0;
            margin-left: 0;
            opacity: 0;
        }
    }

    /* Optional: Dim the button content when loading */
    .listen-button.loading .action-text,
    .listen-button.loading .listen-icon {
        opacity: 0.6;
    }

    /* Text-only variant for auth header login button */
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

    /* Match Show/Hide hover background */
    .listen-button.text-link:hover {
        background: rgba(128, 128, 128, 0.4);
        border-radius: 25px;
    }

    .header-actions {
        -webkit-app-region: no-drag;
        height: 26px;
        box-sizing: border-box;
        justify-content: flex-start;
        align-items: center;
        display: flex;
        gap: 6px;
        border-radius: 25px;
        transition: background 0.15s ease;
        margin-left: 8px;
        padding: 2px 4px;
    }

    .header-actions:hover {
        background: rgba(128, 128, 128, 0.4);
        border-radius: 25px;
    }

    .ask-action {
        margin-left: 4px;
    }

    .action-button,
    .action-text {
        padding-bottom: 1px;
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
        word-wrap: break-word;
        white-space: nowrap;
        background: transparent;
    }

    .icon-container {
        justify-content: flex-start;
        align-items: center;
        gap: 4px;
        display: flex;
    }

    .icon-container.ask-icons svg,
    .icon-container.showhide-icons svg {
        width: 12px;
        height: 12px;
    }

    .listen-icon svg {
        width: 12px;
        height: 11px;
        position: relative;
        top: 1px;
    }

    .icon-box {
        color: rgb(255, 255, 255);
        font-size: 12px;
        font-family:
            system-ui,
            -apple-system,
            sans-serif;
        font-weight: 500;
        background-color: rgba(128, 128, 128, 0.3);
        border-radius: 25%;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 2px;
    }

    .settings-button {
        -webkit-app-region: no-drag;
        padding: 5px;
        border-radius: 50%;
        background: transparent;
        transition: background 0.15s ease;
        color: rgb(255, 255, 255);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .settings-button:hover {
        background: rgba(128, 128, 128, 0.2);
    }
    .left-label {
        background-color: rgba(59, 130, 246, 0.5);
        color: rgb(255, 255, 255);
        font-size: 13px;
        font-weight: 600;
        height: 28px;
        border-radius: 18px;
        padding: 0 16px;
        border: none;
        cursor: pointer;
        opacity: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        margin-right: 8px;
    }
    .settings-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 3px;
    }

    .settings-icon svg {
        width: 16px;
        height: 16px;
    }

    @keyframes audio-wave {
        0% {
            transform: scaleY(0.4);
        }
        25% {
            transform: scaleY(1);
        }
        50% {
            transform: scaleY(0.6);
        }
        75% {
            transform: scaleY(0.8);
        }
        100% {
            transform: scaleY(0.4);
        }
    }

    .wavy-animation path {
        animation: audio-wave 1.2s ease-in-out infinite;
        transform-origin: center;
    }

    .wavy-animation path:nth-child(1) {
        animation-delay: -0.2s;
    }
    .wavy-animation path:nth-child(2) {
        animation-delay: -0.4s;
    }
    .wavy-animation path:nth-child(3) {
        animation-delay: -0.6s;
    }
    .wavy-animation path:nth-child(4) {
        animation-delay: -0.8s;
    }
    .wavy-animation path:nth-child(5) {
        animation-delay: -1s;
    }
    .wavy-animation path:nth-child(6) {
        animation-delay: -1.2s;
    }

    /* ────────────────[ GLASS BYPASS ]─────────────── */
    :host-context(body.has-glass) .header,
    :host-context(body.has-glass) .listen-button,
    :host-context(body.has-glass) .header-actions,
    :host-context(body.has-glass) .settings-button {
        background: transparent !important;
        filter: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
    }
    :host-context(body.has-glass) .icon-box {
        background: transparent !important;
        border: none !important;
    }

    :host-context(body.has-glass) .header::before,
    :host-context(body.has-glass) .header::after,
    :host-context(body.has-glass) .listen-button::before,
    :host-context(body.has-glass) .listen-button::after {
        display: none !important;
    }

    :host-context(body.has-glass) .header-actions:hover,
    :host-context(body.has-glass) .settings-button:hover,
    :host-context(body.has-glass) .listen-button:hover::before {
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

    :host-context(body.has-glass) .header,
    :host-context(body.has-glass) .listen-button,
    :host-context(body.has-glass) .header-actions,
    :host-context(body.has-glass) .settings-button,
    :host-context(body.has-glass) .icon-box {
        border-radius: 0 !important;
    }
    :host-context(body.has-glass) {
        animation: none !important;
        transition: none !important;
        transform: none !important;
        will-change: auto !important;
    }
`;
