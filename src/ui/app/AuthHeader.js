import { html, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { authHeaderStyles } from './auth-header.styles.css.js';

export class AuthHeader extends LitElement {
    static properties = {
        isLoggingIn: { type: Boolean, state: true },
    };

    static styles = authHeaderStyles;

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

    async _handleLoginClick() {
        if (this.wasJustDragged || this.isLoggingIn) return;
        this.isLoggingIn = true;
        try {
            if (window.api?.common) {
                await window.api.common.startWebappAuth();
            }
        } catch (e) {
            console.error('[AuthHeader] Failed to start auth:', e);
            this.isLoggingIn = false;
        }
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
            <div class="header">
                <button class="listen-button text-link" @click=${this._handleLoginClick} ?disabled=${this.isLoggingIn}>
                    <div class="action-text">
                        <div class="action-text-content">Open broswer to login</div>
                        ${this.isLoggingIn ? html`<div class="loading-dots"><span></span><span></span><span></span></div>` : ''}
                    </div>
                </button>
            </div>
        `;
    }
}

customElements.define('auth-header', AuthHeader);
