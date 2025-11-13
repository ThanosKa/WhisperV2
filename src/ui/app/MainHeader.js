import { html, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { mainHeaderStyles } from './main-header.styles.css.js';

export class MainHeader extends LitElement {
    static properties = {
        isTogglingSession: { type: Boolean, state: true },
        shortcuts: { type: Object, state: true },
        listenSessionStatus: { type: String, state: true },
        userPlan: { type: String, state: true },
        apiQuota: { type: Object, state: true },
        isLoadingPlan: { type: Boolean, state: true },
        isListenWindowVisible: { type: Boolean, state: true },
        strandedSession: { type: Object, state: true },
    };

    static styles = mainHeaderStyles;

    constructor() {
        super();
        this.shortcuts = {};
        this.isVisible = true;
        this.isAnimating = false;
        this.hasSlidIn = false;
        this.settingsHideTimer = null;
        this.isTogglingSession = false;
        this.listenSessionStatus = 'beforeSession';
        this.animationEndTimer = null;
        this.handleAnimationEnd = this.handleAnimationEnd.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.dragState = null;
        this.wasJustDragged = false;
        this.isListenWindowVisible = false;
        this._listenVisibilityListener = null;

        // Plan / quota state
        this.userPlan = 'free';
        this.apiQuota = null; // { daily, used, remaining }
        this.isLoadingPlan = false;
        this.strandedSession = null;
    }

    async loadShortcuts() {
        if (window.api) {
            this.shortcuts = await window.api.mainHeader.getCurrentShortcuts();
            this.requestUpdate();
        }
    }

    _getListenButtonText(status) {
        switch (status) {
            case 'beforeSession':
                return 'Listen';
            case 'inSession':
                return 'Stop';
            case 'paused':
                return 'Resume';
            case 'afterSession':
                return 'Done';
            default:
                return 'Listen';
        }
    }

    async handleMouseDown(e) {
        // Draggable behavior handled by drag-handle component
        return;
    }

    handleMouseMove(e) {
        if (!this.dragState) return;

        const deltaX = Math.abs(e.screenX - this.dragState.initialMouseX);
        const deltaY = Math.abs(e.screenY - this.dragState.initialMouseY);

        if (deltaX > 3 || deltaY > 3) {
            this.dragState.moved = true;
        }

        const newWindowX = this.dragState.initialWindowX + (e.screenX - this.dragState.initialMouseX);
        const newWindowY = this.dragState.initialWindowY + (e.screenY - this.dragState.initialMouseY);

        window.api.mainHeader.moveHeaderTo(newWindowX, newWindowY);
    }

    handleMouseUp(e) {
        if (!this.dragState) return;

        const wasDragged = this.dragState.moved;

        window.removeEventListener('mousemove', this.handleMouseMove, { capture: true });
        this.dragState = null;

        if (wasDragged) {
            this.wasJustDragged = true;
            setTimeout(() => {
                this.wasJustDragged = false;
            }, 0);
        }
    }

    toggleVisibility() {
        if (this.isAnimating) {
            console.log('[MainHeader] Animation already in progress, ignoring toggle');
            return;
        }

        if (this.animationEndTimer) {
            clearTimeout(this.animationEndTimer);
            this.animationEndTimer = null;
        }

        this.isAnimating = true;

        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    hide() {
        this.classList.remove('showing');
        this.classList.add('hiding');
    }

    show() {
        this.classList.remove('hiding', 'hidden');
        this.classList.add('showing');
    }

    handleAnimationEnd(e) {
        if (e.target !== this) return;

        this.isAnimating = false;

        if (this.classList.contains('hiding')) {
            this.classList.add('hidden');
            if (window.api) {
                window.api.mainHeader.sendHeaderAnimationFinished('hidden');
            }
        } else if (this.classList.contains('showing')) {
            if (window.api) {
                window.api.mainHeader.sendHeaderAnimationFinished('visible');
            }
        }
    }

    startSlideInAnimation() {
        if (this.hasSlidIn) return;
        this.classList.add('sliding-in');
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('animationend', this.handleAnimationEnd);

        this.loadShortcuts();

        if (window.api) {
            // Bootstrap current user and fetch full profile for quota
            window.api.common
                .getCurrentUser()
                .then(user => {
                    if (user) {
                        this.userPlan = user.plan || 'free';
                        if (user.sessionUuid) {
                            this.isLoadingPlan = true;
                            this._fetchUserProfile(user.sessionUuid);
                        }
                    }
                })
                .catch(() => {});

            this._sessionStateTextListener = (event, { success, nextStatus }) => {
                if (success) {
                    this.listenSessionStatus = nextStatus || 'beforeSession';
                } else {
                    this.listenSessionStatus = 'beforeSession';
                }
                this.isTogglingSession = false; // ✨ 로딩 상태만 해제
            };
            window.api.mainHeader.onListenChangeSessionResult(this._sessionStateTextListener);

            // React to auth user state changes
            this._userStateListener = (event, userState) => {
                if (userState) {
                    this.userPlan = userState.plan || 'free';
                    if (userState.sessionUuid) {
                        this.isLoadingPlan = true;
                        this._fetchUserProfile(userState.sessionUuid);
                    } else {
                        this.apiQuota = null;
                        this.isLoadingPlan = false;
                    }
                } else {
                    this.isLoadingPlan = false;
                }
            };
            window.api.headerController.onUserStateChanged(this._userStateListener);

            // Recovery listener
        this._strandedSessionListener = (event, sessionInfo) => {
            console.log('[Recovery] Header received prompt');
            this.strandedSession = sessionInfo;
        };
            window.api.mainHeader.onStrandedSessionDetected(this._strandedSessionListener);

            this._listenVisibilityListener = (event, visible) => {
                this.isListenWindowVisible = !!visible;
            };
            window.api.mainHeader.onListenWindowVisibilityChanged(this._listenVisibilityListener);

            // Initialize listen window visibility state (non-blocking)
            try {
                window.api.mainHeader
                    .isListenWindowVisible()
                    .then(v => {
                        this.isListenWindowVisible = !!v;
                    })
                    .catch(() => {});
            } catch (_) {}
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('animationend', this.handleAnimationEnd);

        if (this.animationEndTimer) {
            clearTimeout(this.animationEndTimer);
            this.animationEndTimer = null;
        }

        if (window.api) {
            if (this._sessionStateTextListener) {
                window.api.mainHeader.removeOnListenChangeSessionResult(this._sessionStateTextListener);
                this._sessionStateTextListener = null;
            }
            if (this._userStateListener) {
                window.api.headerController.removeOnUserStateChanged(this._userStateListener);
                this._userStateListener = null;
            }
            if (this._listenVisibilityListener) {
                window.api.mainHeader.removeOnListenWindowVisibilityChanged(this._listenVisibilityListener);
                this._listenVisibilityListener = null;
            }
            if (this._strandedSessionListener) {
                window.api.mainHeader.removeOnStrandedSessionDetected(this._strandedSessionListener);
                this._strandedSessionListener = null;
            }
        }
    }

    showSettingsWindow(element) {
        if (this.wasJustDragged) return;
        if (window.api) {
            console.log(`[MainHeader] showSettingsWindow called at ${Date.now()}`);
            window.api.mainHeader.showSettingsWindow();
        }
    }

    hideSettingsWindow() {
        if (this.wasJustDragged) return;
        if (window.api) {
            console.log(`[MainHeader] hideSettingsWindow called at ${Date.now()}`);
            window.api.mainHeader.hideSettingsWindow();
        }
    }

    async _handleListenClick() {
        if (this.wasJustDragged) return;
        if (this.isTogglingSession) {
            return;
        }

        this.isTogglingSession = true;

        try {
            const listenButtonText = this._getListenButtonText(this.listenSessionStatus);
            if (window.api) {
                await window.api.mainHeader.sendListenButtonClick(listenButtonText);
            }
        } catch (error) {
            console.error('IPC invoke for session change failed:', error);
            this.isTogglingSession = false;
        }
    }

    async _handleAskClick() {
        if (this.wasJustDragged) return;

        try {
            if (window.api) {
                await window.api.mainHeader.sendAskButtonClick();
            }
        } catch (error) {
            console.error('IPC invoke for ask button failed:', error);
        }
    }

    async _toggleListenWindowVisibility(e) {
        if (this.wasJustDragged) return;
        if (e) e.stopPropagation?.();

        const isSessionLike = this.listenSessionStatus === 'inSession' || this.listenSessionStatus === 'paused';
        if (!isSessionLike) return;

        try {
            if (!window.api?.mainHeader?.isListenWindowVisible || !window.api?.mainHeader?.setListenWindowVisibility) return;
            const currentlyVisible = await window.api.mainHeader.isListenWindowVisible();
            const target = !currentlyVisible;
            await window.api.mainHeader.setListenWindowVisibility(target);
            this.isListenWindowVisible = target;
        } catch (error) {
            console.error('Failed to toggle listen window visibility:', error);
        }
    }

    async _handleDoneClick() {
        if (this.wasJustDragged) return;
        if (this.isTogglingSession) return;
        this.isTogglingSession = true;
        try {
            if (window.api) {
                await window.api.mainHeader.sendListenButtonClick('Done');
            }
        } catch (error) {
            console.error('IPC invoke for Done failed:', error);
            this.isTogglingSession = false;
        }
    }

    async _handleToggleAllWindowsVisibility() {
        if (this.wasJustDragged) return;

        try {
            if (window.api) {
                await window.api.mainHeader.sendToggleAllWindowsVisibility();
            }
        } catch (error) {
            console.error('IPC invoke for all windows visibility button failed:', error);
        }
    }

    renderShortcut(accelerator) {
        if (!accelerator) return html``;

        const isMac = navigator.userAgent.includes('Mac');
        const processedAccelerator = accelerator.replace('CommandOrControl', isMac ? 'Cmd' : 'Ctrl');

        const keyMap = {
            Cmd: '⌘',
            Command: '⌘',
            Ctrl: 'Ctrl',
            Control: 'Ctrl',
            Alt: '⌥',
            Option: '⌥',
            Shift: '⇧',
            Enter: '↵',
            Backspace: '⌫',
            Delete: '⌦',
            Tab: '⇥',
            Escape: '⎋',
            Up: '↑',
            Down: '↓',
            Left: '←',
            Right: '→',
            '\\': html`<svg viewBox="0 0 6 12" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:6px; height:12px;">
                <path d="M1.5 1.3L5.1 10.6" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>`,
        };

        const keys = processedAccelerator.split('+');
        return html`${keys.map(key => html` <div class="icon-box">${keyMap[key] || key}</div> `)}`;
    }

    async _fetchUserProfile(sessionUuid) {
        try {
            const baseUrl = (window.api?.env?.API_BASE_URL || 'https://www.app-whisper.com').replace(/\/$/, '');
            const res = await fetch(`${baseUrl}/api/auth/user-by-session/${sessionUuid}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data && data.success && data.data) {
                this.userPlan = data.data.plan || this.userPlan || 'free';
                this.apiQuota = data.data.apiQuota || null;
                this.requestUpdate();
            }
        } catch (e) {
            // ignore network errors
        } finally {
            this.isLoadingPlan = false;
        }
    }

    _getPlanLabel() {
        if (this.isLoadingPlan) {
            return 'Loading...';
        }
        return (this.userPlan || 'free') === 'pro' ? 'Pro plan' : 'Upgrade to Pro';
    }

    _getPlanTooltip() {
        if (this.isLoadingPlan) {
            return 'Loading plan information...';
        }
        const isPro = (this.userPlan || 'free') !== 'free';
        if (isPro) return 'You have unlimited responses.';
        const remaining = this.apiQuota?.remaining;
        if (typeof remaining === 'number') {
            return `You have ${remaining} free responses left today.`;
        }
        return 'Free plan: limited responses.';
    }

    _handlePlanClick() {
        if (this.isLoadingPlan) return; // Don't allow clicks while loading
        const isFree = (this.userPlan || 'free') === 'free';
        if (!isFree) return;
        const baseUrl = (window.api?.env?.API_BASE_URL || 'https://www.app-whisper.com').replace(/\/$/, '');
        const url = `${baseUrl}/pricing`;
        if (window.api) {
            window.api.common.openExternal(url);
        } else {
            window.open(url, '_blank');
        }
    }

    async _handleRecoveryResume() {
        if (!this.strandedSession || !window.api) return;
        const result = await window.api.mainHeader.handleRecoveryAction('resume', this.strandedSession.id);
        if (result.success) {
            this.strandedSession = null;
        } else {
            console.error('[MainHeader] Resume failed:', result.error);
        }
    }

    async _handleRecoveryFinalize() {
        if (!this.strandedSession || !window.api) return;
        const result = await window.api.mainHeader.handleRecoveryAction('finalize', this.strandedSession.id);
        if (result.success) {
            this.strandedSession = null;
        } else {
            console.error('[MainHeader] Finalize failed:', result.error);
        }
    }

    async _handleRecoveryDismiss() {
        if (!this.strandedSession || !window.api) return;
        await window.api.mainHeader.handleRecoveryAction('dismiss', this.strandedSession.id);
        this.strandedSession = null;
    }

    render() {
        const listenButtonText = this._getListenButtonText(this.listenSessionStatus);

        const isInSession = this.listenSessionStatus === 'inSession';
        const isPaused = this.listenSessionStatus === 'paused';
        const isAfterSession = this.listenSessionStatus === 'afterSession';

        const buttonClasses = {
            active: isInSession,
            done: isAfterSession,
            'icon-only': isInSession || isPaused,
            paused: isPaused,
        };

        return html`
            <div class="header" @mousedown=${this.handleMouseDown}>
                <button
                    class="left-label"
                    @mouseenter=${() => window.api?.mainHeader?.showPlanWindow?.(true)}
                    @mouseleave=${() => window.api?.mainHeader?.showPlanWindow?.(false)}
                    @click=${() => this._handlePlanClick()}
                    title=${this._getPlanTooltip()}
                >
                    ${this._getPlanLabel()}
                </button>
                ${this.strandedSession && this.listenSessionStatus === 'beforeSession'
                    ? html`
                          <div class="recovery-prompt">
                              <span class="recovery-text">Resume ${this.strandedSession.title}?</span>
                              <button class="recovery-action" @click=${this._handleRecoveryResume}>Resume</button>
                              <button class="recovery-action" @click=${this._handleRecoveryFinalize}>Finalize</button>
                              <button class="recovery-dismiss" @click=${this._handleRecoveryDismiss}>×</button>
                          </div>
                      `
                    : ''}
                <button
                    class="listen-button ${Object.keys(buttonClasses)
                        .filter(k => buttonClasses[k])
                        .join(' ')}"
                    @click=${this._handleListenClick}
                    ?disabled=${this.isTogglingSession}
                >
                    ${isInSession || isPaused
                        ? ''
                        : html`
                              <div class="action-text">
                                  <div class="action-text-content">${listenButtonText}</div>
                              </div>
                          `}
                    <div class="listen-icon">
                        ${this.isTogglingSession
                            ? html`
                                  <div class="water-drop-ripple">
                                      <div class="ripple-ring"></div>
                                      <div class="ripple-ring"></div>
                                      <div class="ripple-ring"></div>
                                      <div class="ripple-ring"></div>
                                  </div>
                              `
                            : isInSession
                              ? html`
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="white"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    >
                                        <rect x="14" y="3" width="5" height="18" rx="1" />
                                        <rect x="5" y="3" width="5" height="18" rx="1" />
                                    </svg>
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="12"
                                        height="11"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="white"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        class="lucide lucide-audio-lines-icon lucide-audio-lines wavy-animation"
                                    >
                                        <path d="M2 10v3" />
                                        <path d="M6 6v11" />
                                        <path d="M10 3v18" />
                                        <path d="M14 8v7" />
                                        <path d="M18 5v13" />
                                        <path d="M22 10v3" />
                                    </svg>
                                `
                              : isPaused
                                ? html`
                                      <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          width="16"
                                          height="16"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="white"
                                          stroke-width="2"
                                          stroke-linecap="round"
                                          stroke-linejoin="round"
                                      >
                                          <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
                                      </svg>
                                  `
                                : isAfterSession
                                  ? html`
                                        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <rect width="9" height="9" rx="1" fill="white" />
                                        </svg>
                                    `
                                  : html`
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="12"
                                            height="11"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="white"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            class="lucide lucide-audio-lines-icon lucide-audio-lines"
                                        >
                                            <path d="M2 10v3" />
                                            <path d="M6 6v11" />
                                            <path d="M10 3v18" />
                                            <path d="M14 8v7" />
                                            <path d="M18 5v13" />
                                            <path d="M22 10v3" />
                                        </svg>
                                    `}
                    </div>
                </button>

                ${isInSession || isPaused
                    ? html`
                          <div
                              class="listen-toggle-button"
                              @click=${e => this._toggleListenWindowVisibility(e)}
                              title=${this.isListenWindowVisible ? 'Hide listen window' : 'Show listen window'}
                          >
                              ${this.isListenWindowVisible
                                  ? html`
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="white"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            class="lucide lucide-chevron-up-icon lucide-chevron-up"
                                        >
                                            <path d="m18 15-6-6-6 6" />
                                        </svg>
                                    `
                                  : html`
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="white"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            class="lucide lucide-chevron-down-icon lucide-chevron-down"
                                        >
                                            <path d="m6 9 6 6 6-6" />
                                        </svg>
                                    `}
                          </div>
                      `
                    : ''}
                ${this.listenSessionStatus === 'paused'
                    ? html`
                          <button class="listen-button done" @click=${this._handleDoneClick} ?disabled=${this.isTogglingSession}>
                              <div class="action-text">
                                  <div class="action-text-content">Done</div>
                              </div>
                              <div class="listen-icon">
                                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" xmlns="http://www.w3.org/2000/svg">
                                      <rect width="9" height="9" rx="1" fill="white" />
                                  </svg>
                              </div>
                          </button>
                      `
                    : ''}

                <div class="header-actions" @click=${() => this._handleToggleAllWindowsVisibility()}>
                    <div class="action-text">
                        <div class="action-text-content">Show / Hide</div>
                    </div>
                    <div class="icon-container">${this.renderShortcut(this.shortcuts.toggleVisibility)}</div>
                </div>

                <div class="header-actions ask-action" @click=${() => this._handleAskClick()}>
                    <div class="action-text">
                        <div class="action-text-content">Ask</div>
                    </div>
                    <div class="icon-container">${this.renderShortcut(this.shortcuts.nextStep)}</div>
                </div>

                <button
                    class="settings-button"
                    @mouseenter=${e => this.showSettingsWindow(e.currentTarget)}
                    @mouseleave=${() => this.hideSettingsWindow()}
                >
                    <div class="settings-icon">
                        <svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M8.0013 3.16406C7.82449 3.16406 7.65492 3.2343 7.5299 3.35932C7.40487 3.48435 7.33464 3.65392 7.33464 3.83073C7.33464 4.00754 7.40487 4.17711 7.5299 4.30213C7.65492 4.42716 7.82449 4.4974 8.0013 4.4974C8.17811 4.4974 8.34768 4.42716 8.47271 4.30213C8.59773 4.17711 8.66797 4.00754 8.66797 3.83073C8.66797 3.65392 8.59773 3.48435 8.47271 3.35932C8.34768 3.2343 8.17811 3.16406 8.0013 3.16406ZM8.0013 7.83073C7.82449 7.83073 7.65492 7.90097 7.5299 8.02599C7.40487 8.15102 7.33464 8.32058 7.33464 8.4974C7.33464 8.67421 7.40487 8.84378 7.5299 8.9688C7.65492 9.09382 7.82449 9.16406 8.0013 9.16406C8.17811 9.16406 8.34768 9.09382 8.47271 8.9688C8.59773 8.84378 8.66797 8.67421 8.66797 8.4974C8.66797 8.32058 8.59773 8.15102 8.47271 8.02599C8.34768 7.90097 8.17811 7.83073 8.0013 7.83073ZM8.0013 12.4974C7.82449 12.4974 7.65492 12.5676 7.5299 12.6927C7.40487 12.8177 7.33464 12.9873 7.33464 13.1641C7.33464 13.3409 7.40487 13.5104 7.5299 13.6355C7.65492 13.7605 7.82449 13.8307 8.0013 13.8307C8.17811 13.8307 8.34768 13.7605 8.47271 13.6355C8.59773 13.5104 8.66797 13.3409 8.66797 13.1641C8.66797 12.9873 8.59773 12.8177 8.47271 12.6927C8.34768 12.5676 8.17811 12.4974 8.0013 12.4974Z"
                                fill="white"
                                stroke="white"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        </svg>
                    </div>
                </button>
            </div>
        `;
    }
}

customElements.define('main-header', MainHeader);
