import { html, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { authHeaderStyles } from './auth-header.styles.css.js';

export class AuthHeader extends LitElement {
    static properties = {
        isLoggingIn: { type: Boolean, state: true },
    };

    static get styles() {
        return authHeaderStyles;
    }

    constructor() {
        super();
        this.isLoggingIn = false;
        this.wasJustDragged = false;
        this.startSlideInAnimation = this.startSlideInAnimation.bind(this);
        this._handleLoginClick = this._handleLoginClick.bind(this);
    }

    startSlideInAnimation() {
        this.classList.add('sliding-in');
    }

    async startLogin({ ignoreDrag = false } = {}) {
        if ((!ignoreDrag && this.wasJustDragged) || this.isLoggingIn) return;
        this.isLoggingIn = true;
        try {
            if (window.api?.common) {
                await window.api.common.startWebappAuth();
            } else {
                console.warn('[AuthHeader] startLogin called without window.api.common');
                this.isLoggingIn = false;
            }
        } catch (e) {
            console.error('[AuthHeader] Failed to start auth:', e);
            this.isLoggingIn = false;
        }
    }

    async _handleLoginClick() {
        await this.startLogin();
    }

    connectedCallback() {
        super.connectedCallback();
        if (window.api?.common) {
            this._userStateListener = (_event, userState) => {
                if (userState?.isLoggedIn) {
                    this.isLoggingIn = false;
                }
            };
            window.api.common.onUserStateChanged?.(this._userStateListener);
        }
        if (window.api?.headerController) {
            this._authFailedListener = () => {
                this.isLoggingIn = false;
            };
            window.api.headerController.onAuthFailed?.(this._authFailedListener);
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
    }

    render() {
        return html`
            <div class="auth-header">
                <button class="auth-login-button text-link" @click=${this._handleLoginClick} ?disabled=${this.isLoggingIn}>
                    <div class="auth-button-content">
                        <div class="auth-button-text">Open browser to login</div>
                        ${this.isLoggingIn ? html`<div class="loading-dots"><span></span><span></span><span></span></div>` : ''}
                    </div>
                </button>
            </div>
        `;
    }
}

customElements.define('auth-header', AuthHeader);
