import { css } from '../assets/lit-core-2.7.4.min.js';

export const settingsViewStyles = css`
    * {
        font-family:
            system-ui,
            -apple-system,
            sans-serif;
        cursor: default;
        user-select: none;
    }

    :host {
        display: block;
        width: 240px;
        height: 100%;
        color: white;
    }

    /* ────────────────[ TOGGLE SWITCH STYLING ]─────────────── */
    .toggle-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 0;
        transition: all 0.15s ease;
    }

    .toggle-label {
        font-size: 12px;
        font-weight: 500;
        color: white;
        flex: 1;
    }

    /* Stealth mode specific styling */
    .stealth-toggle.off {
        opacity: 0.5;
    }

    .stealth-toggle.on {
        opacity: 1;
    }

    .toggle-switch {
        position: relative;
        width: 32px;
        height: 16px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 9999px;
        cursor: pointer;
        transition: all 0.2s ease;
        flex-shrink: 0;
    }

    .toggle-switch.active {
        background: #3b82f6;
    }

    .toggle-knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 12px;
        height: 12px;
        background: white;
        border-radius: 50%;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        transition: transform 0.2s ease;
    }

    .toggle-switch.active .toggle-knob {
        transform: translateX(16px);
    }

    /* ────────────────[ KEYBOARD SHORTCUT STYLING ]─────────────── */
    .shortcut-key {
        background: rgba(255, 255, 255, 0.05);
        color: white;
        border-radius: 4px;
        padding: 2px 8px;
        font-size: 12px;
        line-height: 1;
        transition: all 0.15s ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 16px;
        height: 16px;
    }

    .shortcut-key:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .shortcut-keys {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    /* ────────────────[ GLASSMORPHISM ENHANCEMENTS ]─────────────── */
    .settings-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(12px);
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.4);
        box-sizing: border-box;
        position: relative;
        overflow-y: auto;
        padding: 12px 12px;
        z-index: 1000;
    }

    .settings-container::-webkit-scrollbar {
        width: 6px;
    }

    .settings-container::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
    }

    .settings-container::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }

    .settings-container::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }

    .settings-container::before {
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

    .header-section {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        position: relative;
        z-index: 1;
    }

    .app-title {
        font-size: 12px;
        font-weight: 500;
        color: white;
        margin: 0 0 4px 0;
    }

    .account-info {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
        margin: 0;
    }

    .invisibility-icon {
        padding-top: 2px;
        opacity: 0;
        transition: opacity 0.3s ease;
    }

    .invisibility-icon.visible {
        opacity: 1;
    }

    .invisibility-icon svg {
        width: 16px;
        height: 16px;
    }

    .shortcuts-section {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 4px 0;
        position: relative;
        z-index: 1;
    }

    .shortcut-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;
        color: white;
        font-size: 12px;
    }

    .shortcut-name {
        font-weight: 300;
    }

    .shortcut-keys {
        display: flex;
        align-items: center;
        gap: 3px;
    }

    .cmd-key,
    .shortcut-key {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
        width: auto;
        min-width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 500;
        color: white;
        padding: 2px 8px;
        line-height: 1;
        transition: all 0.15s ease;
    }

    .cmd-key:hover,
    .shortcut-key:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    /* Buttons Section */
    .buttons-section {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-top: 6px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        position: relative;
        z-index: 1;
        flex: 1;
    }

    .settings-button {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        color: white;
        padding: 5px 10px;
        font-size: 12px;
        font-weight: 400;
        cursor: pointer;
        transition: all 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
    }

    .settings-button:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.2);
    }

    .settings-button:active {
        transform: translateY(1px);
    }

    .settings-button.full-width {
        width: 100%;
    }

    .settings-button.half-width {
        flex: 1;
    }

    .settings-button.danger {
        background: rgba(255, 59, 48, 0.1);
        border-color: rgba(255, 59, 48, 0.3);
        color: rgba(255, 59, 48, 0.9);
    }

    .settings-button.danger:hover {
        background: rgba(255, 59, 48, 0.15);
        border-color: rgba(255, 59, 48, 0.4);
    }

    .move-buttons,
    .bottom-buttons {
        display: flex;
        gap: 4px;
    }

    /* Preset Management Section */
    .preset-section {
        padding: 6px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .preset-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
    }

    .preset-title {
        font-size: 12px;
        font-weight: 500;
        color: white;
    }

    .preset-count {
        font-size: 9px;
        color: rgba(255, 255, 255, 0.5);
        margin-left: 4px;
    }

    .preset-toggle {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.6);
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 2px;
        transition: background-color 0.15s ease;
    }

    .preset-toggle:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .preset-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-height: 120px;
        overflow-y: auto;
    }

    .preset-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 6px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
        cursor: pointer;
        transition: all 0.15s ease;
        font-size: 11px;
        border: 1px solid transparent;
    }

    .preset-item:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.1);
    }

    .preset-item.selected {
        background: rgba(0, 122, 255, 0.25);
        border-color: rgba(0, 122, 255, 0.6);
        box-shadow: 0 0 0 1px rgba(0, 122, 255, 0.3);
    }

    .preset-name {
        color: white;
        flex: 1;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        font-weight: 300;
    }

    .preset-item.selected .preset-name {
        font-weight: 500;
    }

    .preset-status {
        font-size: 9px;
        color: rgba(0, 122, 255, 0.8);
        font-weight: 500;
        margin-left: 6px;
    }

    .no-presets-message {
        padding: 12px 8px;
        text-align: center;
        color: rgba(255, 255, 255, 0.5);
        font-size: 10px;
        line-height: 1.4;
    }

    .no-presets-message .web-link {
        color: rgba(0, 122, 255, 0.8);
        text-decoration: underline;
        cursor: pointer;
    }

    .no-presets-message .web-link:hover {
        color: rgba(0, 122, 255, 1);
    }

    .loading-state {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        color: rgba(255, 255, 255, 0.7);
        font-size: 12px;
    }

    .loading-spinner {
        width: 12px;
        height: 12px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-top: 1px solid rgba(255, 255, 255, 0.8);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-right: 6px;
    }

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }

    .hidden {
        display: none;
    }

    /* ────────────────[ GLASS BYPASS ]─────────────── */
    :host-context(body.has-glass) {
        animation: none !important;
        transition: none !important;
        transform: none !important;
        will-change: auto !important;
    }

    :host-context(body.has-glass) * {
        background: transparent !important;
        filter: none !important;
        backdrop-filter: none !important;
        box-shadow: none !important;
        outline: none !important;
        border: none !important;
        border-radius: 0 !important;
        transition: none !important;
        animation: none !important;
    }

    :host-context(body.has-glass) .settings-container::before {
        display: none !important;
    }
`;
