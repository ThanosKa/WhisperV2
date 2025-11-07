import { css } from '../assets/lit-core-2.7.4.min.js';

export const screenshotViewStyles = css`
    * {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
        cursor: default;
        user-select: none;
    }

    :host {
        display: block;
        width: 100%;
        height: 100%;
        color: white;
    }

    .screenshot-container {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        background: rgba(11, 11, 11, 0.55);
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.4);
        backdrop-filter: blur(25px);
        box-sizing: border-box;
        position: relative;
        padding: 12px;
        overflow: auto;
    }

    .screenshot-container::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.15);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        border-radius: 12px;
        filter: blur(10px);
        z-index: -1;
    }

    .screenshot-image {
        max-width: 100%;
        max-height: 100%;
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        object-fit: contain;
    }

    .loading-state {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        color: rgba(255, 255, 255, 0.7);
        font-size: 12px;
    }

    .screenshot-container::-webkit-scrollbar {
        width: 6px;
    }

    .screenshot-container::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
    }

    .screenshot-container::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }

    .screenshot-container::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }

    /* Glass bypass */
    :host-context(body.has-glass) .screenshot-container,
    :host-context(body.has-glass) .screenshot-container::before {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        filter: none !important;
        backdrop-filter: none !important;
    }
`;

