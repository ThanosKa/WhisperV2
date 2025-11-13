import { html, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { recoveryToastStyles } from './recovery-toast.styles.css.js';

export class RecoveryToast extends LitElement {
    static properties = {
        sessionInfo: { type: Object, state: true },
        isFadingOut: { type: Boolean, state: true },
        showRipple: { type: Boolean, state: true },
    };

    static styles = recoveryToastStyles;

    constructor() {
        super();
        this.sessionInfo = null;
        this.isFadingOut = false;
        this.showRipple = false;
    }

    connectedCallback() {
        super.connectedCallback();
        if (window.api) {
            window.api.recoveryToast.onShow((event, sessionInfo) => {
                this.sessionInfo = sessionInfo;
                this.isFadingOut = false;
                this.showRipple = false;
            });
            window.api.recoveryToast.onHide(() => {
                this.hide();
            });
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (window.api) {
            window.api.recoveryToast.removeOnShow();
            window.api.recoveryToast.removeOnHide();
        }
    }

    hide() {
        this.isFadingOut = true;
        setTimeout(() => {
            this.sessionInfo = null;
            this.isFadingOut = false;
        }, 300);
    }

    async _handleResume() {
        if (!this.sessionInfo || !window.api) return;
        this.showRipple = true;
        const result = await window.api.recoveryToast.handleRecoveryAction('resume', this.sessionInfo.id);
        if (result.success) {
            this.hide();
        } else {
            console.error('[RecoveryToast] Resume failed:', result.error);
            this.showRipple = false;
        }
    }

    async _handleFinalize() {
        if (!this.sessionInfo || !window.api) return;
        // Immediately close and clear session
        const sessionId = this.sessionInfo.id;
        this.isFadingOut = true;
        this.sessionInfo = null;
        // Call finalize in background (no waiting)
        window.api.recoveryToast.handleRecoveryAction('finalize', sessionId).catch(err => {
            console.error('[RecoveryToast] Finalize failed:', err);
        });
    }

    async _handleDismiss() {
        // Just hide the window, don't call recovery action
        this.hide();
    }

    render() {
        if (!this.sessionInfo) {
            return html``;
        }

        return html`
            <div class="toast-container ${this.isFadingOut ? 'fading-out' : ''}">
                <div class="toast-content">
                    <div class="toast-header">
                        <span class="toast-text">Resume ${this.sessionInfo.title || 'session'}?</span>
                        <button class="dismiss-button" @click=${this._handleDismiss}>×</button>
                    </div>
                    <div class="toast-actions">
                        <button 
                            class="resume-button ${this.showRipple ? 'with-ripple' : ''}" 
                            @click=${this._handleResume}
                            ?disabled=${this.isFadingOut}
                        >
                            ${this.showRipple ? html`
                                <div class="water-drop-ripple">
                                    <div class="ripple-ring"></div>
                                    <div class="ripple-ring"></div>
                                    <div class="ripple-ring"></div>
                                    <div class="ripple-ring"></div>
                                </div>
                            ` : 'Resume'}
                        </button>
                        <button 
                            class="finalize-button" 
                            @click=${this._handleFinalize}
                            ?disabled=${this.isFadingOut}
                        >
                            Finalize
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('recovery-toast', RecoveryToast);

