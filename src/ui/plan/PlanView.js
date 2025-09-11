import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';

export class PlanView extends LitElement {
    static styles = css`
        :host {
            display: block;
            width: 100%;
            height: 100%;
            color: white;
            background: rgba(20, 20, 20, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.25);
            border-radius: 10px;
            font-size: 12px;
            box-sizing: border-box;
        }
        .container {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            padding: 6px 10px;
            white-space: nowrap;
        }
    `;

    static properties = {
        message: { type: String, state: true },
    };

    constructor() {
        super();
        this.message = '';
    }

    connectedCallback() {
        super.connectedCallback();
        // Pull user state to compute tooltip
        if (window.api) {
            window.api.common
                .getCurrentUser()
                .then(user => {
                    if (!user || !user.isLoggedIn) {
                        this.message = 'Free plan: limited responses.';
                        return;
                    }
                    const plan = user.plan || 'free';
                    if (plan !== 'free') {
                        this.message = 'You have unlimited responses.';
                        return;
                    }
                    // Fetch full profile for quota
                    if (user.sessionUuid) {
                        this._fetchProfile(user.sessionUuid);
                    } else {
                        this.message = 'Free plan: limited responses.';
                    }
                })
                .catch(() => (this.message = 'Free plan: limited responses.'));
        }
    }

    async _fetchProfile(sessionUuid) {
        try {
            const baseUrl = (window.api?.env?.API_BASE_URL || 'https://www.app-whisper.com').replace(/\/$/, '');
            const res = await fetch(`${baseUrl}/api/auth/user-by-session/${sessionUuid}`, { headers: { 'Content-Type': 'application/json' } });
            const data = await res.json().catch(() => ({}));
            const remaining = data?.data?.apiQuota?.remaining;
            if (typeof remaining === 'number') {
                this.message = `You have ${remaining} free responses left today.`;
            } else {
                this.message = 'Free plan: limited responses.';
            }
        } catch (_) {
            this.message = 'Free plan: limited responses.';
        }
    }

    render() {
        return html`<div class="container">${this.message}</div>`;
    }
}

customElements.define('plan-view', PlanView);
