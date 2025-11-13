import { html, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { recoveryToastStyles } from './recovery-toast.styles.css.js';

export class RecoveryToast extends LitElement {
    static properties = {
        sessionInfo: { type: Object, state: true },
        isFadingOut: { type: Boolean, state: true },
    };

    static styles = recoveryToastStyles;

    constructor() {
        super();
        this.sessionInfo = null;
        this.isFadingOut = false;
    }

    connectedCallback() {
        super.connectedCallback();
        if (window.api) {
            window.api.recoveryToast.onShow((event, sessionInfo) => {
                this.sessionInfo = sessionInfo;
                this.isFadingOut = false;
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

    async _handleResume(e) {
        if (!this.sessionInfo || !window.api) return;

        // Create ripple effect
        const button = e.currentTarget;
        const ripple = document.createElement('div');
        ripple.classList.add('ripple');
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        button.appendChild(ripple);

        setTimeout(() => ripple.remove(), 600);

        const result = await window.api.recoveryToast.handleRecoveryAction('resume', this.sessionInfo.id);
        if (result.success) {
            this.hide();
        } else {
            console.error('[RecoveryToast] Resume failed:', result.error);
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
            <div class="recovery-toast ${this.isFadingOut ? 'fade-out' : ''}">
                <div class="header">
                    <div class="header-content">
                        <div class="status-dot"></div>
                        <div class="text-group">
                            <div class="title">Resume session?</div>
                            <div class="session-name">"${this.sessionInfo.title || 'Session'}"</div>
                        </div>
                    </div>
                    <button class="close-btn" @click=${this._handleDismiss}>×</button>
                </div>
                <div class="actions">
                    <button class="action-btn resume-btn" @click=${this._handleResume} ?disabled=${this.isFadingOut}>Resume</button>
                    <button class="action-btn finalize-btn" @click=${this._handleFinalize} ?disabled=${this.isFadingOut}>Finalize</button>
                </div>
            </div>
        `;
    }
}

customElements.define('recovery-toast', RecoveryToast);
