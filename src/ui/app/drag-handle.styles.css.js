import { css } from '../assets/lit-core-2.7.4.min.js';

export const dragHandleStyles = css`
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

    /* Drag Handle Button */
    .drag-handle-button {
        -webkit-app-region: drag;
        width: 24px;
        height: 24px;
        padding: 0;
        background: transparent;
        border: none;
        border-radius: 50%;
        cursor: move;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        transition: background 0.15s ease;
    }

    .drag-handle-button:hover {
        background: transparent;
    }

    .drag-handle-button::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(11, 11, 11, 0.66);
        border-radius: 50%;
        z-index: -1;
        transition: background 0.15s ease;
    }

    .drag-handle-button:hover::before {
        background: rgba(11, 11, 11, 0.75);
    }

    .lucide-move {
        width: 16px;
        height: 16px;
        color: #fff;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    /* ────────────────[ GLASS BYPASS ]─────────────── */
    :host-context(body.has-glass) .drag-handle-button {
        background: transparent !important;
        filter: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
    }

    :host-context(body.has-glass) .drag-handle-button::before {
        display: none !important;
    }

    :host-context(body.has-glass) .drag-handle-button:hover::before {
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

