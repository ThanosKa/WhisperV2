import { html, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { settingsViewStyles } from './settings-view.css.js';

// import { getOllamaProgressTracker } from '../../features/common/services/localProgressTracker.js'; // removed

export class SettingsView extends LitElement {
    static styles = settingsViewStyles;

    //////// after_modelStateService ////////
    static properties = {
        shortcuts: { type: Object, state: true },
        firebaseUser: { type: Object, state: true },
        isLoading: { type: Boolean, state: true },
        isContentProtectionOn: { type: Boolean, state: true },
        presets: { type: Array, state: true },
        showPresets: { type: Boolean, state: true },
        autoUpdateEnabled: { type: Boolean, state: true },
        autoUpdateLoading: { type: Boolean, state: true },
        displays: { type: Array, state: true },
        currentDisplayId: { type: Number, state: true },
        showMonitors: { type: Boolean, state: true },
        isLoggingOut: { type: Boolean, state: true },
    };
    //////// after_modelStateService ////////

    constructor() {
        super();
        this.shortcuts = {};
        this.firebaseUser = null;
        this.isLoading = true;
        this.isContentProtectionOn = true;
        this.presets = [];
        this.showPresets = false;
        this.handleUsePicklesKey = this.handleUsePicklesKey.bind(this);
        this.autoUpdateEnabled = true;
        this.autoUpdateLoading = true;
        this.displays = [];
        this.currentDisplayId = null;
        this.showMonitors = true;
        this.isLoggingOut = false;
        this.loadInitialData();
    }

    async loadAutoUpdateSetting() {
        if (!window.api) return;
        this.autoUpdateLoading = true;
        try {
            const enabled = await window.api.settingsView.getAutoUpdate();
            this.autoUpdateEnabled = enabled;
            console.log('Auto-update setting loaded:', enabled);
        } catch (e) {
            console.error('Error loading auto-update setting:', e);
            this.autoUpdateEnabled = true; // fallback
        }
        this.autoUpdateLoading = false;
        this.requestUpdate();
    }

    async handleToggleAutoUpdate() {
        if (!window.api || this.autoUpdateLoading) return;
        this.autoUpdateLoading = true;
        this.requestUpdate();
        try {
            const newValue = !this.autoUpdateEnabled;
            const result = await window.api.settingsView.setAutoUpdate(newValue);
            if (result && result.success) {
                this.autoUpdateEnabled = newValue;
            } else {
                console.error('Failed to update auto-update setting');
            }
        } catch (e) {
            console.error('Error toggling auto-update:', e);
        }
        this.autoUpdateLoading = false;
        this.requestUpdate();
    }

    //////// after_modelStateService ////////
    async loadInitialData() {
        if (!window.api) return;
        this.isLoading = true;
        try {
            // Load essential data only for current UI
            const [userState, presets, contentProtection, shortcuts] = await Promise.all([
                window.api.settingsView.getCurrentUser(),
                window.api.settingsView.getPresets(),
                window.api.settingsView.getContentProtectionStatus(),
                window.api.settingsView.getCurrentShortcuts(),
            ]);

            if (userState && userState.isLoggedIn) this.firebaseUser = userState;

            this.presets = presets || [];
            this.isContentProtectionOn = contentProtection;
            this.shortcuts = shortcuts || {};
            await this.loadDisplays();
        } catch (error) {
            console.error('Error loading initial settings data:', error);
        } finally {
            this.isLoading = false;
        }
    }

    handleUsePicklesKey(e) {
        e.preventDefault();
        if (this.wasJustDragged) return;

        console.log('Requesting Firebase authentication from main process...');
        window.api.settingsView.startWebappAuth();
    }
    //////// after_modelStateService ////////

    openShortcutEditor() {
        window.api.settingsView.openShortcutSettingsWindow();
    }

    connectedCallback() {
        super.connectedCallback();

        this.setupEventListeners();
        this.setupIpcListeners();
        this.setupWindowResize();
        this.loadAutoUpdateSetting();
        this.loadDisplays();
        // Force one height calculation immediately (innerHeight may be 0 at first)
        setTimeout(() => this.updateScrollHeight(), 0);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.cleanupEventListeners();
        this.cleanupIpcListeners();
        this.cleanupWindowResize();
    }

    setupEventListeners() {
        this.addEventListener('mouseenter', this.handleMouseEnter);
        this.addEventListener('mouseleave', this.handleMouseLeave);
    }

    cleanupEventListeners() {
        this.removeEventListener('mouseenter', this.handleMouseEnter);
        this.removeEventListener('mouseleave', this.handleMouseLeave);
    }

    setupIpcListeners() {
        if (!window.api) return;

        this._userStateListener = (event, userState) => {
            console.log('[SettingsView] Received user-state-changed:', userState);
            if (userState && userState.isLoggedIn) {
                this.firebaseUser = userState;
            } else {
                this.firebaseUser = null;
            }
            this.isLoggingOut = false; // Reset logout state
            this.loadAutoUpdateSetting();
            // Reload model settings when user state changes (Firebase login/logout)
            this.loadInitialData();
        };

        this._settingsUpdatedListener = (event, settings) => {
            console.log('[SettingsView] Received settings-updated');
            this.settings = settings;
            this.requestUpdate();
        };

        // Add preset update listener
        this._presetsUpdatedListener = async event => {
            console.log('[SettingsView] Received presets-updated, refreshing presets');
            try {
                const presets = await window.api.settingsView.getPresets();
                this.presets = presets || [];
                this.requestUpdate();
            } catch (error) {
                console.error('[SettingsView] Failed to refresh presets:', error);
            }
        };

        window.api.settingsView.onUserStateChanged(this._userStateListener);
        window.api.settingsView.onSettingsUpdated(this._settingsUpdatedListener);
        window.api.settingsView.onPresetsUpdated(this._presetsUpdatedListener);
    }

    cleanupIpcListeners() {
        if (!window.api) return;

        if (this._userStateListener) {
            window.api.settingsView.removeOnUserStateChanged(this._userStateListener);
        }
        if (this._settingsUpdatedListener) {
            window.api.settingsView.removeOnSettingsUpdated(this._settingsUpdatedListener);
        }
        if (this._presetsUpdatedListener) {
            window.api.settingsView.removeOnPresetsUpdated(this._presetsUpdatedListener);
        }
    }

    setupWindowResize() {
        this.resizeHandler = () => {
            this.requestUpdate();
            this.updateScrollHeight();
        };
        window.addEventListener('resize', this.resizeHandler);

        // Initial setup
        setTimeout(() => this.updateScrollHeight(), 100);
    }

    cleanupWindowResize() {
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
    }

    updateScrollHeight() {
        // Bug protection where window.innerHeight is reported as 0 at some point in Electron
        const rawHeight = window.innerHeight || (window.screen ? window.screen.height : 0);
        const MIN_HEIGHT = 300; // minimum guaranteed height
        const maxHeight = Math.max(MIN_HEIGHT, rawHeight);

        this.style.maxHeight = `${maxHeight}px`;

        const container = this.shadowRoot?.querySelector('.settings-container');
        if (container) {
            container.style.maxHeight = `${maxHeight}px`;
        }
    }

    handleMouseEnter = () => {
        window.api.settingsView.cancelHideSettingsWindow();
        // Recalculate height in case it was set to 0 before
        this.updateScrollHeight();
        this.loadDisplays();
    };

    handleMouseLeave = () => {
        window.api.settingsView.hideSettingsWindow();
    };

    getMainShortcuts() {
        return [
            { name: 'Show / Hide', accelerator: this.shortcuts.toggleVisibility },
            { name: 'Ask Anything', accelerator: this.shortcuts.nextStep },
        ];
    }

    renderShortcutKeys(accelerator) {
        if (!accelerator) return html`N/A`;

        const isMac = navigator.userAgent.includes('Mac');
        const processedAccelerator = accelerator.replace('CommandOrControl', isMac ? 'Cmd' : 'Ctrl');

        const keyMap = {
            Cmd: '⌘',
            Command: '⌘',
            Ctrl: 'Ctrl',
            Alt: '⌥',
            Shift: '⇧',
            Enter: '↵',
            Up: '↑',
            Down: '↓',
            Left: '←',
            Right: '→',
        };

        // special handling for scrollDown/scrollUp
        if (processedAccelerator.includes('↕')) {
            const keys = processedAccelerator.replace('↕', '').split('+');
            keys.push('↕');
            return html`${keys.map(key => html`<span class="shortcut-key">${keyMap[key] || key}</span>`)}`;
        }

        const keys = processedAccelerator.split('+');
        return html`${keys.map(key => html`<span class="shortcut-key">${keyMap[key] || key}</span>`)}`;
    }

    togglePresets() {
        this.showPresets = !this.showPresets;
    }

    async loadDisplays() {
        try {
            if (!window.api) return;
            const result = await window.api.settingsView.getDisplays();
            if (result && Array.isArray(result.displays)) {
                this.displays = result.displays;
                this.currentDisplayId = result.currentDisplayId;
                this.requestUpdate();
            }
        } catch (e) {
            console.error('[SettingsView] Failed to load displays:', e);
        }
    }

    async handleSelectDisplay(display) {
        try {
            if (!window.api) return;
            const res = await window.api.settingsView.moveToDisplay(display.id);
            if (res && res.success) {
                this.currentDisplayId = display.id;
                this.requestUpdate();
            }
        } catch (e) {
            console.error('[SettingsView] Failed to move to display:', e);
        }
    }

    handleMoveLeft() {
        console.log('Move Left clicked');
        window.api.settingsView.moveWindowStep('left');
    }

    handleMoveRight() {
        console.log('Move Right clicked');
        window.api.settingsView.moveWindowStep('right');
    }

    async handlePersonalize() {
        console.log('Personalize clicked');
        try {
            await window.api.settingsView.openPersonalizePage();
        } catch (error) {
            console.error('Failed to open personalize page:', error);
        }
    }

    async handleToggleInvisibility() {
        console.log('Toggle Invisibility clicked');
        this.isContentProtectionOn = await window.api.settingsView.toggleContentProtection();
        this.requestUpdate();
    }

    handleQuit() {
        console.log('Quit clicked');
        window.api.settingsView.quitApplication();
    }

    handleFirebaseLogout() {
        console.log('Firebase Logout clicked');
        this.isLoggingOut = true;
        this.requestUpdate();
        window.api.settingsView.firebaseLogout();
    }

    handleViewOnboarding = async () => {
        try {
            console.log('[SettingsView] View Onboarding clicked');
            await window.api.settingsView.showPermissionOnboarding();
        } catch (e) {
            console.error('[SettingsView] Failed to show onboarding:', e);
        }
    };

    handleOpenDbPath() {
        console.log('Open DB Path clicked');
        if (window.api && window.api.settingsView && window.api.settingsView.openDbPath) {
            window.api.settingsView.openDbPath();
        } else {
            console.error('IPC handler for openDbPath not available');
        }
    }

    render() {
        if (this.isLoading) {
            return html`
                <div class="settings-container">
                    <div class="loading-state">
                        <div class="loading-spinner"></div>
                        <span>Loading...</span>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="settings-container">
                <div class="header-section">
                    <div>
                        <h1 class="app-title">Whisper</h1>
                        <div class="account-info">
                            ${this.firebaseUser ? html`Account: ${this.firebaseUser.email || 'Logged In'}` : `Account: Not Logged In`}
                        </div>
                    </div>
                </div>

                <div class="toggle-container stealth-toggle ${this.isContentProtectionOn ? 'on' : 'off'}">
                    <div
                        class="invisibility-icon ${this.isContentProtectionOn ? 'visible' : ''}"
                        style="opacity: 1; padding-top: 0; margin-right: 8px;"
                    >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M9.785 7.41787C8.7 7.41787 7.79 8.19371 7.55667 9.22621C7.0025 8.98704 6.495 9.05121 6.11 9.22037C5.87083 8.18204 4.96083 7.41787 3.88167 7.41787C2.61583 7.41787 1.58333 8.46204 1.58333 9.75121C1.58333 11.0404 2.61583 12.0845 3.88167 12.0845C5.08333 12.0845 6.06333 11.1395 6.15667 9.93787C6.355 9.79787 6.87417 9.53537 7.51 9.94954C7.615 11.1454 8.58333 12.0845 9.785 12.0845C11.0508 12.0845 12.0833 11.0404 12.0833 9.75121C12.0833 8.46204 11.0508 7.41787 9.785 7.41787ZM3.88167 11.4195C2.97167 11.4195 2.2425 10.6729 2.2425 9.75121C2.2425 8.82954 2.9775 8.08287 3.88167 8.08287C4.79167 8.08287 5.52083 8.82954 5.52083 9.75121C5.52083 10.6729 4.79167 11.4195 3.88167 11.4195ZM9.785 11.4195C8.875 11.4195 8.14583 10.6729 8.14583 9.75121C8.14583 8.82954 8.875 8.08287 9.785 8.08287C10.695 8.08287 11.43 8.82954 11.43 9.75121C11.43 10.6729 10.6892 11.4195 9.785 11.4195ZM12.6667 5.95954H1V6.83454H12.6667V5.95954ZM8.8925 1.36871C8.76417 1.08287 8.4375 0.931207 8.12833 1.03037L6.83333 1.46204L5.5325 1.03037L5.50333 1.02454C5.19417 0.93704 4.8675 1.10037 4.75083 1.39787L3.33333 5.08454H10.3333L8.91 1.39787L8.8925 1.36871Z"
                                fill="white"
                            />
                        </svg>
                    </div>
                    <span class="toggle-label" style="color: white;">Stealth Mode</span>
                    <div class="toggle-switch ${this.isContentProtectionOn ? 'active' : ''}" @click=${this.handleToggleInvisibility}>
                        <div class="toggle-knob"></div>
                    </div>
                </div>

                <div class="shortcuts-section">
                    ${this.getMainShortcuts().map(
                        shortcut => html`
                            <div class="shortcut-item">
                                <span class="shortcut-name">${shortcut.name}</span>
                                <div class="shortcut-keys">${this.renderShortcutKeys(shortcut.accelerator)}</div>
                            </div>
                        `
                    )}
                </div>

                ${this.displays && this.displays.length > 1
                    ? html`
                          <div class="preset-section">
                              <div class="preset-header">
                                  <span class="preset-title">Monitor display</span>
                              </div>
                              <div class="preset-list">
                                  ${this.displays.map(
                                      d => html`
                                          <div
                                              class="monitor-item ${this.currentDisplayId === d.id ? 'selected' : ''}"
                                              @click=${() => this.handleSelectDisplay(d)}
                                          >
                                              <span class="monitor-name">${d.name}</span>
                                              ${this.currentDisplayId === d.id ? html`<span class="monitor-status">Current</span>` : ''}
                                          </div>
                                      `
                                  )}
                              </div>
                          </div>
                      `
                    : ''}

                <div class="preset-section">
                    <div class="preset-header">
                        <span class="preset-title">
                            My Presets
                            <span class="preset-count">(${this.presets.filter(p => p.is_default === 0).length})</span>
                        </span>
                        <span class="preset-toggle" @click=${this.togglePresets}> ${this.showPresets ? '▼' : '▶'} </span>
                    </div>

                    <div class="preset-list ${this.showPresets ? '' : 'hidden'}">
                        ${this.presets.filter(p => p.is_default === 0).length === 0
                            ? html`
                                  <div class="no-presets-message">
                                      No custom presets yet.<br />
                                      <span class="web-link" @click=${this.handlePersonalize}> Create your first preset </span>
                                  </div>
                              `
                            : this.presets
                                  .filter(p => p.is_default === 0)
                                  .map(
                                      preset => html`
                                          <div class="preset-item preset-item-plain">
                                              <span class="preset-name">${preset.title}</span>
                                          </div>
                                      `
                                  )}
                    </div>
                </div>

                <div class="buttons-section">
                    <button class="settings-button full-width" @click=${this.handlePersonalize}>
                        <span>Personalize / Meeting Notes</span>
                    </button>
                    <div class="toggle-container">
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
                            class="lucide lucide-download-icon lucide-download"
                            style="margin-right: 8px;"
                        >
                            <path d="M12 15V3" />
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <path d="m7 10 5 5 5-5" />
                        </svg>
                        <span class="toggle-label" style="color: white;">Automatic Updates</span>
                        <div class="toggle-switch ${this.autoUpdateEnabled ? 'active' : ''}" @click=${this.handleToggleAutoUpdate}>
                            <div class="toggle-knob"></div>
                        </div>
                    </div>

                    <div class="move-buttons">
                        <button class="settings-button half-width" @click=${this.handleMoveLeft}>
                            <span>← Move</span>
                        </button>
                        <button class="settings-button half-width" @click=${this.handleMoveRight}>
                            <span>Move →</span>
                        </button>
                    </div>

                    <div class="move-buttons">
                        ${this.firebaseUser
                            ? html`
                                  <button
                                      class="settings-button half-width ${this.isLoggingOut ? 'logout-loading' : ''}"
                                      @click=${this.handleFirebaseLogout}
                                  >
                                      <span>Logout</span>
                                      ${this.isLoggingOut
                                          ? html`
                                                <div class="thinking-dots thinking-slide">
                                                    <div class="thinking-dot"></div>
                                                    <div class="thinking-dot"></div>
                                                    <div class="thinking-dot"></div>
                                                </div>
                                            `
                                          : ''}
                                  </button>
                              `
                            : html`
                                  <button class="settings-button half-width" @click=${this.handleUsePicklesKey}>
                                      <span>Login</span>
                                  </button>
                              `}
                        <button class="settings-button half-width" @click=${this.handleQuit}>
                            <span>Quit</span>
                        </button>
                    </div>

                    <div class="move-buttons">
                        <button class="settings-button full-width" @click=${this.handleViewOnboarding}>
                            <span>View Onboarding</span>
                        </button>
                    </div>

                    <div class="move-buttons">
                        <button class="settings-button full-width" @click=${this.handleOpenDbPath}>
                            <span>Open DB Folder</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    //////// after_modelStateService ////////
}

customElements.define('settings-view', SettingsView);
