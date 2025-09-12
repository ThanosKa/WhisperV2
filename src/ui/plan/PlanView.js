import { html, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { planViewStyles } from './plan-view.css.js';

export class PlanView extends LitElement {
    static styles = planViewStyles;

    static properties = {
        usage: { type: Object, state: true },
        isLoading: { type: Boolean, state: true },
    };

    constructor() {
        super();
        this.usage = null;
        this.isLoading = true;

        // Bind event handlers for mouse interactions
        this.handleMouseEnter = this.handleMouseEnter.bind(this);
        this.handleMouseLeave = this.handleMouseLeave.bind(this);

        console.log('[PlanView] Component created');
    }

    connectedCallback() {
        super.connectedCallback();
        console.log('[PlanView] Component connected');
        this._loadUserData();
    }

    async _loadUserData() {
        this.isLoading = true;

        if (!window.api) {
            this._setDefaultUsage();
            return;
        }

        try {
            const user = await window.api.common.getCurrentUser();

            if (!user || !user.isLoggedIn) {
                this._setDefaultUsage();
                return;
            }

            const plan = user.plan || 'free';

            if (plan !== 'free') {
                this.usage = {
                    plan: 'pro',
                    used: 0,
                    remaining: null,
                    limit: null,
                };
                this.isLoading = false;
                return;
            }

            // Fetch full profile for quota data if user has sessionUuid
            if (user.sessionUuid) {
                await this._fetchUserProfile(user.sessionUuid);
            } else {
                this._setDefaultUsage();
            }
        } catch (error) {
            console.error('[PlanView] Error loading user data:', error);
            this._setDefaultUsage();
        }
    }

    async _fetchUserProfile(sessionUuid) {
        try {
            const baseUrl = (window.api?.env?.API_BASE_URL || 'https://www.app-whisper.com').replace(/\/$/, '');
            const response = await fetch(`${baseUrl}/api/auth/user-by-session/${sessionUuid}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            const data = await response.json().catch(() => ({}));

            if (response.ok && data && data.success && data.data) {
                const apiQuota = data.data.apiQuota;
                const plan = data.data.plan || 'free';

                this.usage = {
                    plan: plan,
                    used: apiQuota?.used || 0,
                    remaining: apiQuota?.remaining || 0,
                    limit: apiQuota?.daily || 10,
                };
            } else {
                this._setDefaultUsage();
            }
        } catch (error) {
            console.error('[PlanView] Error fetching user profile:', error);
            this._setDefaultUsage();
        }

        this.isLoading = false;
    }

    _setDefaultUsage() {
        this.usage = {
            plan: 'free',
            used: 0,
            remaining: 0,
            limit: 10,
        };
        this.isLoading = false;
    }

    show() {
        console.log('[PlanView] Show method called (no-op in separate window)');
    }

    hide() {
        console.log('[PlanView] Hide method called (no-op in separate window)');
    }

    handleMouseEnter() {
        // Keep the tooltip visible when hovering over it
        if (this.isVisible) {
            clearTimeout(this._hideTimeout);
        }
    }

    handleMouseLeave() {
        // Hide after a small delay to allow moving between elements
        this._hideTimeout = setTimeout(() => {
            this.hide();
        }, 100);
    }

    _getPrimaryText() {
        if (this.isLoading) {
            return 'Loading usage data...';
        }

        if (!this.usage) {
            return 'Free plan: limited responses.';
        }

        const isPro = this.usage.plan === 'pro';

        if (isPro) {
            return 'You have unlimited AI responses';
        }

        const remaining = this.usage.remaining || 0;
        return `You have ${remaining} free responses left.`;
    }

    _getSecondaryText() {
        if (this.isLoading || !this.usage) {
            return null;
        }

        const isPro = this.usage.plan === 'pro';

        if (isPro) {
            return null;
        }

        const limit = this.usage.limit || 10;
        return `The free plan is limited to ${limit} full responses per day.`;
    }

    render() {
        const primaryText = this._getPrimaryText();
        const secondaryText = this._getSecondaryText();

        return html`
            <div class="plan-menu-wrapper" @mouseenter=${this.handleMouseEnter} @mouseleave=${this.handleMouseLeave}>
                <div class="plan-content">
                    ${this.isLoading
                        ? html`
                              <div class="plan-loading">
                                  <div class="loading-spinner"></div>
                                  <span>Loading...</span>
                              </div>
                          `
                        : html`
                              <p class="plan-primary-text">${primaryText}</p>
                              ${secondaryText ? html` <p class="plan-secondary-text">${secondaryText}</p> ` : ''}
                          `}
                </div>
            </div>
        `;
    }
}

customElements.define('plan-view', PlanView);
