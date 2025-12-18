import { html, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { planViewStyles } from './plan-view.css.js';

export class PlanView extends LitElement {
    static styles = planViewStyles;

    static properties = {
        usage: { type: Object, state: true },
        sttUsage: { type: Object, state: true }, // STT quota: { used, limit, remaining } in seconds
        isLoading: { type: Boolean, state: true },
    };

    constructor() {
        super();
        this.usage = null;
        this.sttUsage = null; // { used: seconds, limit: seconds, remaining: seconds }
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

        // Listen for user state changes to keep plan and STT quota in sync
        try {
            if (window.api?.headerController?.onUserStateChanged) {
                this._onUserStateChanged = (_event, userState) => {
                    console.log('[PlanView] User state changed received');
                    if (userState?.currentUser) {
                        const currentUser = userState.currentUser;
                        const plan = currentUser.plan || 'free';
                        const apiQuota = currentUser.apiQuota;
                        const sttQuota = currentUser.sttQuota;

                        if (apiQuota) {
                            this.usage = {
                                plan: plan,
                                used: apiQuota.used || 0,
                                remaining: apiQuota.remaining || 0,
                                limit: apiQuota.daily || (plan === 'pro' ? null : 10),
                            };
                        }

                        if (sttQuota) {
                            this.sttUsage = {
                                used: sttQuota.audioSecondsUsed || 0,
                                limit: sttQuota.audioSecondsLimit || 900,
                                remaining: sttQuota.audioSecondsRemaining || 0,
                            };
                        }
                        this.isLoading = false;
                        this.requestUpdate();
                    }
                };
                window.api.headerController.onUserStateChanged(this._onUserStateChanged);
            }
        } catch (e) {
            console.warn('[PlanView] Failed to subscribe to user state changes:', e);
        }

        // Subscribe to real-time quota updates from main (headers on stream start)
        try {
            if (window.api?.quota?.onUpdate) {
                this._onQuotaUpdate = (_event, payload) => {
                    const limit = typeof payload?.limit === 'number' ? payload.limit : undefined;
                    const used = typeof payload?.used === 'number' ? payload.used : undefined;
                    const remaining = typeof payload?.remaining === 'number' ? payload.remaining : undefined;

                    if (typeof limit === 'undefined' && typeof used === 'undefined' && typeof remaining === 'undefined') {
                        // Check if payload has STT quota instead
                        if (payload?.sttQuota) {
                            this.sttUsage = {
                                used: payload.sttQuota.audioSecondsUsed || 0,
                                limit: payload.sttQuota.audioSecondsLimit || 900,
                                remaining: payload.sttQuota.audioSecondsRemaining || 0,
                            };
                        }
                        return;
                    }

                    // If we don't yet know plan, assume free when limit is finite
                    const plan = limit && limit >= 1000 ? 'pro' : 'free';

                    const next = {
                        plan: plan,
                        limit: typeof limit === 'number' ? limit : (this.usage?.limit ?? 10),
                        used: typeof used === 'number' ? used : (this.usage?.used ?? 0),
                        remaining:
                            typeof remaining === 'number'
                                ? remaining
                                : typeof limit === 'number' && typeof used === 'number'
                                  ? Math.max(0, limit - used)
                                  : (this.usage?.remaining ?? 0),
                    };

                    this.usage = next;

                    // Update STT if present in payload
                    if (payload?.sttQuota) {
                        this.sttUsage = {
                            used: payload.sttQuota.audioSecondsUsed || 0,
                            limit: payload.sttQuota.audioSecondsLimit || 900,
                            remaining: payload.sttQuota.audioSecondsRemaining || 0,
                        };
                    }

                    this.isLoading = false;
                };
                window.api.quota.onUpdate(this._onQuotaUpdate);
            }
        } catch (e) {
            console.warn('[PlanView] Failed to subscribe to quota updates:', e?.message || e);
        }
    }

    disconnectedCallback() {
        try {
            if (this._onUserStateChanged && window.api?.headerController?.removeOnUserStateChanged) {
                window.api.headerController.removeOnUserStateChanged(this._onUserStateChanged);
            }
            if (this._onQuotaUpdate && window.api?.quota?.removeOnUpdate) {
                window.api.quota.removeOnUpdate(this._onQuotaUpdate);
            }
        } catch (_) {}
        super.disconnectedCallback();
    }

    async _loadUserData() {
        this.isLoading = true;

        if (!window.api) {
            this._setDefaultUsage();
            return;
        }

        try {
            const userState = await window.api.common.getCurrentUser();

            if (!userState || !userState.isLoggedIn) {
                this._setDefaultUsage();
                return;
            }

            const currentUser = userState.currentUser;
            if (!currentUser) {
                this._setDefaultUsage();
                return;
            }

            const plan = currentUser.plan || 'free';
            const apiQuota = currentUser.apiQuota;
            const sttQuota = currentUser.sttQuota;

            if (apiQuota) {
                this.usage = {
                    plan: plan,
                    used: apiQuota.used || 0,
                    remaining: apiQuota.remaining || 0,
                    limit: apiQuota.daily || (plan === 'pro' ? null : 10),
                };

                if (sttQuota) {
                    this.sttUsage = {
                        used: sttQuota.audioSecondsUsed || 0,
                        limit: sttQuota.audioSecondsLimit || 900,
                        remaining: sttQuota.audioSecondsRemaining || 0,
                    };
                }

                this.isLoading = false;
                return;
            }

            // Fallback: fetch full profile if no quota in userState
            if (currentUser.sessionUuid) {
                await this._fetchUserProfile(currentUser.sessionUuid);
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

                // Extract STT quota if available (server returns audioSecondsUsed, audioSecondsLimit, audioSecondsRemaining)
                const sttQuota = data.data.sttQuota;
                if (sttQuota) {
                    this.sttUsage = {
                        used: sttQuota.audioSecondsUsed || 0,
                        limit: sttQuota.audioSecondsLimit || 900, // 15 min default for free
                        remaining: sttQuota.audioSecondsRemaining || 0,
                    };
                }
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
        this.sttUsage = {
            used: 0,
            limit: 900,
            remaining: 900,
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
        console.log('[PlanView] handleMouseEnter fired at', Date.now());
        if (window.api) {
            console.log('[PlanView] Calling cancelHidePlanWindow');
            window.api.planView.cancelHidePlanWindow();
        } else {
            console.warn('[PlanView] window.api not available');
        }
    }

    handleMouseLeave() {
        console.log('[PlanView] handleMouseLeave fired at', Date.now());
        if (window.api) {
            console.log('[PlanView] Calling hidePlanWindow');
            window.api.planView.hidePlanWindow();
        } else {
            console.warn('[PlanView] window.api not available');
        }
    }

    _getPrimaryText() {
        if (this.isLoading) {
            return 'Loading usage data...';
        }

        if (!this.usage) {
            return 'Free plan: limited responses.';
        }

        const plan = (this.usage.plan || 'free').toLowerCase();

        if (plan === 'ultra') {
            return 'You have unlimited AI responses';
        }

        const remaining = this.usage.remaining || 0;
        return `You have ${remaining} responses left.`;
    }

    _getSecondaryText() {
        if (this.isLoading || !this.usage) {
            return null;
        }

        const plan = (this.usage.plan || 'free').toLowerCase();

        if (plan === 'ultra') {
            return null;
        }

        const limit = this.usage.limit || 10;
        const normalizedPlan = plan
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        return `The ${normalizedPlan} plan is limited to ${limit} responses per day.`;
    }

    _getSttText() {
        if (!this.sttUsage) {
            return null;
        }

        const plan = (this.usage?.plan || 'free').toLowerCase();
        if (plan === 'ultra') {
            return 'Meeting Time: Unlimited';
        }

        const remainingSecs = this.sttUsage.remaining || 0;
        const remainingMins = Math.floor(remainingSecs / 60);

        if (remainingMins >= 60) {
            const hours = Math.floor(remainingMins / 60);
            const mins = remainingMins % 60;
            return `Meeting Time: ${hours}h ${mins}m remaining`;
        }

        return `Meeting Time: ${remainingMins}m remaining`;
    }

    render() {
        const primaryText = this._getPrimaryText();
        const secondaryText = this._getSecondaryText();
        const sttText = this._getSttText();

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
                              ${sttText ? html` <p class="plan-secondary-text">${sttText}</p> ` : ''}
                          `}
                </div>
            </div>
        `;
    }
}

customElements.define('plan-view', PlanView);
