import { html, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { authRefreshButtonStyles } from './auth-refresh-button.styles.css.js';

export class AuthRefreshButton extends LitElement {
    static properties = {
        isLoggingIn: { type: Boolean, state: true },
    };

    static get styles() {
        return authRefreshButtonStyles;
    }

    constructor() {
        super();
        this.isLoggingIn = false;
        this._handleRefreshClick = this._handleRefreshClick.bind(this);
    }

    async _handleRefreshClick() {
        if (window.api?.common) {
            await window.api.common.resetAuthState();
        }
        this.isLoggingIn = false;
        this.requestUpdate();

        // Also reset AuthHeader state if it exists
        const authHeader = this.closest('#header-container')?.querySelector('auth-header');
        if (authHeader) {
            authHeader.isLoggingIn = false;
            authHeader.requestUpdate();
        }
    }

    connectedCallback() {
        super.connectedCallback();
        if (window.api?.common) {
            this._userStateListener = (_event, userState) => {
                if (userState?.isLoggedIn) {
                    this.isLoggingIn = false;
                    this.requestUpdate();
                }
            };
            window.api.common.onUserStateChanged?.(this._userStateListener);
        }
        if (window.api?.headerController) {
            this._authFailedListener = () => {
                this.isLoggingIn = false;
                this.requestUpdate();
            };
            window.api.headerController.onAuthFailed?.(this._authFailedListener);

            this._authStartedListener = () => {
                this.isLoggingIn = true;
                this.requestUpdate();
            };
            window.api.headerController.onAuthStarted?.(this._authStartedListener);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (window.api?.common && this._userStateListener) {
            window.api.common.removeOnUserStateChanged?.(this._userStateListener);
        }
        if (window.api?.headerController && this._authFailedListener) {
            window.api.headerController.removeOnAuthFailed?.(this._authFailedListener);
        }
        if (window.api?.headerController && this._authStartedListener) {
            window.api.headerController.removeOnAuthStarted?.(this._authStartedListener);
        }
    }

    render() {
        if (!this.isLoggingIn) {
            return html``;
        }
        return html`
            <button class="auth-refresh-button" @click=${this._handleRefreshClick}>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="auth-refresh-icon"
                >
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 16h5v5" />
                </svg>
            </button>
        `;
    }
}

customElements.define('auth-refresh-button', AuthRefreshButton);

