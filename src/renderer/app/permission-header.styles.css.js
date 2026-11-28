import { css } from '../assets/lit-core-2.7.4.min.js';

export const permissionHeaderStyles = css`
    :host {
        display: block;
        transition:
            opacity 0.15s ease-out,
            transform 0.15s ease-out;
        will-change: opacity, transform;
    }

    :host(.sliding-out) {
        opacity: 0;
        transform: translateY(-20px);
    }

    :host(.hidden) {
        opacity: 0;
        pointer-events: none;
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
        box-sizing: border-box;
    }

    .container {
        -webkit-app-region: no-drag;
        width: 950px;
        height: 750px;
        padding: 40px;
        background: linear-gradient(180deg, rgba(0, 1, 11, 0.9) 0%, rgba(10, 15, 44, 0.85) 50%, rgba(17, 22, 58, 0.8) 100%);
        border: none;
        border-radius: 0;
        overflow: hidden;
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(20px);
    }

    /* Center radial glow */
    .container::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 600px;
        height: 600px;
        transform: translate(-50%, -50%) scale(var(--glow-scale, 0));
        background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0) 60%);
        pointer-events: none;
        border-radius: 50%;
        opacity: 0.15;
        animation: glowIn 0.4s ease-out 0.05s forwards;
    }

    @keyframes glowIn {
        to {
            transform: translate(-50%, -50%) scale(1);
        }
    }

    /* Close button */
    .close-button {
        -webkit-app-region: no-drag;
        position: absolute;
        top: 40px;
        right: 40px;
        width: 32px;
        height: 32px;
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition:
            transform 0.1s ease,
            color 0.1s ease;
        z-index: 10;
        font-size: 18px;
        line-height: 1;
        padding: 0;
        animation: closeFadeIn 0.4s ease-out 0.2s both;
    }

    @keyframes closeFadeIn {
        from {
            opacity: 0;
            transform: translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .close-button:hover {
        transform: scale(1.1);
        color: rgba(255, 255, 255, 1);
    }

    .close-button:active {
        transform: scale(0.9);
    }

    /* Step content container with transitions */
    .step-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        max-width: 600px;
        position: relative;
    }

    .step-content.entering {
        animation: stepSlideIn 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
    }

    .step-content.exiting {
        animation: stepSlideOut 0.15s cubic-bezier(0.55, 0.06, 0.68, 0.19) forwards;
    }

    @keyframes stepSlideIn {
        from {
            opacity: 0;
            transform: translateY(50px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    @keyframes stepSlideOut {
        from {
            opacity: 1;
            transform: translateY(0);
        }
        to {
            opacity: 0;
            transform: translateY(-50px);
        }
    }

    /* Logo medallion */
    .logo-medallion {
        width: 100px;
        height: 100px;
        background: #000;
        border: 2px solid rgba(255, 255, 255, 0.2);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 24px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        animation: logoSpringIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55) 0.15s forwards;
        transform: rotate(-180deg) scale(0);
    }

    @keyframes logoSpringIn {
        to {
            transform: rotate(0deg) scale(1);
        }
    }

    .logo-letter {
        color: white;
        font-size: 40px;
        font-weight: 700;
        letter-spacing: -1px;
    }

    .title {
        margin: 0 0 8px 0;
        text-align: center;
        font-size: 48px;
        font-weight: 700;
        letter-spacing: -0.5px;
        background: linear-gradient(135deg, #ffffff, #e0e7ff, #c7d2fe);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        text-shadow: 0 0 20px rgba(59, 130, 246, 0.15);
        animation: titleFadeIn 0.5s ease-out 0.3s both;
    }

    @keyframes titleFadeIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .subtitle {
        color: rgba(255, 255, 255, 0.8);
        font-size: 18px;
        font-weight: 400;
        text-align: center;
        margin: 0 0 40px 0;
        line-height: 1.4;
        animation: subtitleFadeIn 0.5s ease-out 0.4s both;
    }

    @keyframes subtitleFadeIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    /* Permission rows */
    .rows {
        display: flex;
        flex-direction: column;
        gap: 16px;
        width: 100%;
        animation: rowsFadeIn 0.5s ease-out 0.5s both;
    }

    @keyframes rowsFadeIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .perm-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        padding: 20px 24px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .perm-right {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .perm-left {
        display: flex;
        align-items: center;
        gap: 16px;
        min-width: 0;
    }

    .permission-icon {
        width: 28px;
        height: 28px;
        opacity: 0.9;
        flex-shrink: 0;
    }

    .check-icon {
        width: 28px;
        height: 28px;
        color: rgba(34, 197, 94, 0.95);
        flex-shrink: 0;
    }

    .perm-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .perm-title {
        color: #fff;
        font-size: 22px;
        font-weight: 600;
        line-height: 1.2;
    }

    .perm-desc {
        color: rgba(255, 255, 255, 0.6);
        font-size: 16px;
        line-height: 1.3;
    }

    .cta-btn {
        -webkit-app-region: no-drag;
        white-space: nowrap;
        background: rgba(11, 11, 11, 0.55);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        padding: 10px 20px;
        min-width: 120px;
        text-align: center;
        backdrop-filter: blur(25px);
        transition:
            transform 0.08s ease,
            background 0.08s ease,
            opacity 0.15s ease;
        cursor: pointer;
    }

    .cta-btn:hover:not(:disabled) {
        transform: translateY(-1px) scale(1.02);
        background: rgba(11, 11, 11, 0.65);
    }

    .cta-btn:active:not(:disabled) {
        transform: scale(0.98);
    }

    .cta-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    /* Commands step styles */
    .commands-list {
        display: flex;
        flex-direction: column;
        gap: 20px;
        width: 100%;
        animation: commandsFadeIn 0.5s ease-out 0.5s both;
    }

    @keyframes commandsFadeIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .command-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        padding: 16px 0;
        animation: commandRowSlideIn 0.4s ease-out both;
    }

    .command-row:nth-child(1) {
        animation-delay: 0.6s;
    }
    .command-row:nth-child(2) {
        animation-delay: 0.7s;
    }
    .command-row:nth-child(3) {
        animation-delay: 0.8s;
    }
    .command-row:nth-child(4) {
        animation-delay: 0.9s;
    }

    @keyframes commandRowSlideIn {
        from {
            opacity: 0;
            transform: translateX(-20px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }

    .command-left {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .command-title {
        color: #fff;
        font-size: 22px;
        font-weight: 600;
        line-height: 1.2;
    }

    .command-desc {
        color: rgba(255, 255, 255, 0.6);
        font-size: 16px;
        line-height: 1.3;
    }

    .command-shortcuts {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .key-pill {
        background: rgba(11, 11, 11, 0.55);
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 6px;
        padding: 8px 12px;
        min-width: 32px;
        text-align: center;
        font-size: 14px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(25px);
    }

    /* Bottom navigation */
    .bottom-nav {
        position: absolute;
        bottom: 40px;
        left: 40px;
        right: 40px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        pointer-events: none;
    }

    .nav-button {
        -webkit-app-region: no-drag;
        white-space: nowrap;
        background: rgba(11, 11, 11, 0.55);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        padding: 10px 20px;
        min-width: 120px;
        text-align: center;
        backdrop-filter: blur(25px);
        transition:
            transform 0.08s ease,
            background 0.08s ease,
            opacity 0.15s ease;
        cursor: pointer;
        pointer-events: auto;
        animation: navButtonFadeIn 0.4s ease-out 0.7s both;
    }

    @keyframes navButtonFadeIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .nav-button:hover:not(:disabled) {
        transform: translateY(-2px) scale(1.04);
        background: rgba(11, 11, 11, 0.75);
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        border-color: rgba(255, 255, 255, 0.4);
    }

    .nav-button:active:not(:disabled) {
        transform: scale(0.98);
    }

    .nav-button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        pointer-events: none;
    }

    .continue-button {
        -webkit-app-region: no-drag;
        width: 100%;
        max-width: 300px;
        height: 48px;
        background: rgba(34, 197, 94, 0.85);
        border: none;
        border-radius: 12px;
        color: white;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition:
            transform 0.08s ease,
            background 0.1s ease;
        position: relative;
        overflow: hidden;
        margin-top: 24px;
        animation: continueFadeIn 0.5s ease-out 0.7s both;
    }

    @keyframes continueFadeIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .continue-button::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border-radius: 12px;
        padding: 1px;
        background: linear-gradient(169deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0) 50%, rgba(255, 255, 255, 0.3) 100%);
        -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
        -webkit-mask-composite: destination-out;
        mask-composite: exclude;
        pointer-events: none;
    }

    .continue-button:hover:not(:disabled) {
        background: rgba(34, 197, 94, 0.95);
        transform: translateY(-1px) scale(1.02);
    }

    .continue-button:disabled {
        background: rgba(255, 255, 255, 0.2);
        cursor: not-allowed;
    }

    .footnote {
        color: rgba(255, 255, 255, 0.6);
        font-size: 14px;
        line-height: 1.4;
        text-align: center;
        margin-top: 16px;
        animation: footnoteFadeIn 0.5s ease-out 0.8s both;
    }

    @keyframes footnoteFadeIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    /* ────────────────[ GLASS BYPASS ]─────────────── */
    :host-context(body.has-glass) .container,
    :host-context(body.has-glass) .cta-btn,
    :host-context(body.has-glass) .continue-button,
    :host-context(body.has-glass) .close-button,
    :host-context(body.has-glass) .nav-button,
    :host-context(body.has-glass) .key-pill {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        filter: none !important;
        backdrop-filter: none !important;
    }

    :host-context(body.has-glass) .container::before,
    :host-context(body.has-glass) .continue-button::after {
        display: none !important;
    }

    :host-context(body.has-glass) .cta-btn:hover,
    :host-context(body.has-glass) .continue-button:hover,
    :host-context(body.has-glass) .close-button:hover,
    :host-context(body.has-glass) .nav-button:hover {
        background: transparent !important;
    }

    :host-context(body.has-glass) .logo-medallion {
        background: transparent !important;
        border: 2px solid rgba(255, 255, 255, 0.2) !important;
    }
`;
