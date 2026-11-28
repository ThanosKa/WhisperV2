import { LitElement, html, css } from '../assets/lit-core-2.7.4.min.js';
import { permissionHeaderStyles } from './permission-header.styles.css.js';

// App content dimensions
const APP_CONTENT_WIDTH = 950;
const APP_CONTENT_HEIGHT = 750;

export class PermissionHeader extends LitElement {
    static get styles() {
        return permissionHeaderStyles;
    }

    // Styles moved to separate file: './permission-header.styles.css.js'

    static properties = {
        microphoneGranted: { type: String },
        screenGranted: { type: String },
        isChecking: { type: String },
        continueCallback: { type: Function },
        userMode: { type: String }, // 'local' or 'firebase'
        currentStep: { type: Number },
        isTransitioning: { type: Boolean },
        isLoggedIn: { type: Boolean },
    };

    constructor() {
        super();
        this.microphoneGranted = 'unknown';
        this.screenGranted = 'unknown';
        this.isChecking = false;
        this.continueCallback = null;
        this.userMode = 'local'; // Default to local
        this.currentStep = 0; // 0: Permissions, 1: Commands
        this.isTransitioning = false;
        this.isLoggedIn = false;

        // Command data matching Whisper's onboarding
        this.commands = [
            {
                title: 'Show / Hide',
                description: 'Toggle Whisper visibility',
                shortcuts: ['⌘', '\\'],
            },
            {
                title: 'Ask Anything',
                description: 'Open the AI assistant',
                shortcuts: ['⌘', '↵'],
            },
            {
                title: 'Clear',
                description: 'Clear current conversation and reload',
                shortcuts: ['⌘', 'R'],
            },
            {
                title: 'Move',
                description: 'Reposition Whisper window',
                shortcuts: ['⌘', '←', '→'],
            },
        ];
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        if (changedProperties.has('userMode')) {
            const newHeight = APP_CONTENT_HEIGHT; // Fixed app content height
            console.log(`[PermissionHeader] User mode changed to ${this.userMode}, requesting resize to ${newHeight}px`);
            this.dispatchEvent(
                new CustomEvent('request-resize', {
                    detail: { height: newHeight },
                    bubbles: true,
                    composed: true,
                })
            );
        }
    }

    async connectedCallback() {
        super.connectedCallback();

        if (window.api) {
            try {
                const userState = await window.api.common.getCurrentUser();
                this.userMode = userState.mode;
                this.isLoggedIn = !!(userState && userState.isLoggedIn);
            } catch (e) {
                console.error('[PermissionHeader] Failed to get user state', e);
                this.userMode = 'local'; // Fallback to local
                this.isLoggedIn = false;
            }
        }

        await this.checkPermissions();

        // Set up periodic permission check
        this.permissionCheckInterval = setInterval(async () => {
            if (window.api) {
                try {
                    const userState = await window.api.common.getCurrentUser();
                    this.userMode = userState.mode;
                    this.isLoggedIn = !!(userState && userState.isLoggedIn);
                } catch (e) {
                    this.userMode = 'local';
                    this.isLoggedIn = false;
                }
            }
            this.checkPermissions();
        }, 1000);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.permissionCheckInterval) {
            clearInterval(this.permissionCheckInterval);
        }
    }

    async checkPermissions() {
        if (!window.api || this.isChecking) return;

        this.isChecking = true;

        try {
            const permissions = await window.api.permissionHeader.checkSystemPermissions();
            console.log('[PermissionHeader] Permission check result:', permissions);

            const prevMic = this.microphoneGranted;
            const prevScreen = this.screenGranted;
            this.microphoneGranted = permissions.microphone;
            this.screenGranted = permissions.screen;

            // if permissions changed == UI update
            if (prevMic !== this.microphoneGranted || prevScreen !== this.screenGranted) {
                console.log('[PermissionHeader] Permission status changed, updating UI');
                this.requestUpdate();
            }

            // if all permissions granted and on step 0 == show continue button
            if (this.microphoneGranted === 'granted' && this.screenGranted === 'granted' && this.currentStep === 0) {
                console.log('[PermissionHeader] All permissions granted, showing continue state');
                this.requestUpdate();
            }
        } catch (error) {
            console.error('[PermissionHeader] Error checking permissions:', error);
        } finally {
            this.isChecking = false;
        }
    }

    async handleMicrophoneClick() {
        if (!window.api || this.microphoneGranted === 'granted') return;

        console.log('[PermissionHeader] Requesting microphone permission...');

        try {
            const result = await window.api.permissionHeader.checkSystemPermissions();
            console.log('[PermissionHeader] Microphone permission result:', result);

            if (result.microphone === 'granted') {
                this.microphoneGranted = 'granted';
                this.requestUpdate();
                return;
            }

            if (
                result.microphone === 'not-determined' ||
                result.microphone === 'denied' ||
                result.microphone === 'unknown' ||
                result.microphone === 'restricted'
            ) {
                const res = await window.api.permissionHeader.requestMicrophonePermission();
                if (res.status === 'granted' || res.success === true) {
                    this.microphoneGranted = 'granted';
                    this.requestUpdate();
                    return;
                }
            }

            // Check permissions again after a delay
            // setTimeout(() => this.checkPermissions(), 1000);
        } catch (error) {
            console.error('[PermissionHeader] Error requesting microphone permission:', error);
        }
    }

    async handleScreenClick() {
        if (!window.api || this.screenGranted === 'granted') return;

        console.log('[PermissionHeader] Checking screen recording permission...');

        try {
            const permissions = await window.api.permissionHeader.checkSystemPermissions();
            console.log('[PermissionHeader] Screen permission check result:', permissions);

            if (permissions.screen === 'granted') {
                this.screenGranted = 'granted';
                this.requestUpdate();
                return;
            }
            if (
                permissions.screen === 'not-determined' ||
                permissions.screen === 'denied' ||
                permissions.screen === 'unknown' ||
                permissions.screen === 'restricted'
            ) {
                console.log('[PermissionHeader] Opening screen recording preferences...');
                await window.api.permissionHeader.openSystemPreferences('screen-recording');
            }

            // Check permissions again after a delay
            // (This may not execute if app restarts after permission grant)
            // setTimeout(() => this.checkPermissions(), 2000);
        } catch (error) {
            console.error('[PermissionHeader] Error opening screen recording preferences:', error);
        }
    }

    async handleNext() {
        if (this.isTransitioning || this.currentStep >= 1) return;

        this.isTransitioning = true;

        // Add exiting class for smooth transition
        const stepContent = this.shadowRoot.querySelector('.step-content');
        if (stepContent) {
            stepContent.classList.add('exiting');

            // Wait for exit animation to complete
            setTimeout(() => {
                this.currentStep++;
                this.isTransitioning = false;
                this.requestUpdate();
            }, 150);
        } else {
            this.currentStep++;
            this.isTransitioning = false;
            this.requestUpdate();
        }
    }

    async handleBack() {
        if (this.isTransitioning || this.currentStep <= 0) return;

        this.isTransitioning = true;

        // Add exiting class for smooth transition
        const stepContent = this.shadowRoot.querySelector('.step-content');
        if (stepContent) {
            stepContent.classList.add('exiting');

            // Wait for exit animation to complete
            setTimeout(() => {
                this.currentStep--;
                this.isTransitioning = false;
                this.requestUpdate();
            }, 150);
        } else {
            this.currentStep--;
            this.isTransitioning = false;
            this.requestUpdate();
        }
    }

    async handleContinue() {
        if (this.continueCallback && this.microphoneGranted === 'granted' && this.screenGranted === 'granted') {
            this.continueCallback();
        }
    }

    async handleCommandsPrimaryAction() {
        const allGranted = this.microphoneGranted === 'granted' && this.screenGranted === 'granted';

        if (!this.isLoggedIn) {
            this.dispatchEvent(
                new CustomEvent('request-auth', {
                    bubbles: true,
                    composed: true,
                })
            );
            return;
        }

        // Logged in -> continue if possible
        if (allGranted) {
            this.handleContinue();
        } else {
            // If permissions not ready, guide back to step 0
            this.currentStep = 0;
            this.requestUpdate();
        }
    }

    handleClose() {
        console.log('Close button clicked');
        if (window.api) {
            window.api.common.quitApplication();
        }
    }

    renderPermissionsStep() {
        const allGranted = this.microphoneGranted === 'granted' && this.screenGranted === 'granted';

        return html`
            ${!allGranted
                ? html`
                      <div class="logo-medallion">
                          <div class="logo-letter">W</div>
                      </div>
                      <h1 class="title">Permissions</h1>
                      <div class="subtitle">Give Whisper access to see and hear your screen for the best experience.</div>

                      <div class="rows">
                          <!-- Microphone Row -->
                          <div class="perm-row">
                              <div class="perm-left">
                                  <svg
                                      class="permission-icon"
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="24"
                                      height="24"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="white"
                                      stroke-width="2"
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                  >
                                      <path d="M12 19v3" />
                                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                      <rect x="9" y="2" width="6" height="13" rx="3" />
                                  </svg>
                                  <div class="perm-text">
                                      <div class="perm-title">Microphone</div>
                                      <div class="perm-desc">Let Whisper hear audio for transcription.</div>
                                  </div>
                              </div>
                              <div class="perm-right">
                                  ${this.microphoneGranted === 'granted'
                                      ? html`<svg class="check-icon" viewBox="0 0 20 20" fill="currentColor">
                                            <path
                                                fill-rule="evenodd"
                                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>`
                                      : ''}
                                  <button class="cta-btn" @click=${this.handleMicrophoneClick} ?disabled=${this.microphoneGranted === 'granted'}>
                                      ${this.microphoneGranted === 'granted' ? 'Granted' : 'Request...'}
                                  </button>
                              </div>
                          </div>

                          <!-- Screen Recording Row -->
                          <div class="perm-row">
                              <div class="perm-left">
                                  <svg
                                      class="permission-icon"
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="24"
                                      height="24"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="white"
                                      stroke-width="2"
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                  >
                                      <rect width="18" height="12" x="3" y="4" rx="2" ry="2" />
                                      <line x1="2" x2="22" y1="20" y2="20" />
                                  </svg>
                                  <div class="perm-text">
                                      <div class="perm-title">Screen Recording</div>
                                      <div class="perm-desc">Let Whisper see your screen content.</div>
                                  </div>
                              </div>
                              <div class="perm-right">
                                  ${this.screenGranted === 'granted'
                                      ? html`<svg class="check-icon" viewBox="0 0 20 20" fill="currentColor">
                                            <path
                                                fill-rule="evenodd"
                                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>`
                                      : ''}
                                  <button class="cta-btn" @click=${this.handleScreenClick} ?disabled=${this.screenGranted === 'granted'}>
                                      ${this.screenGranted === 'granted' ? 'Granted' : 'Open'}
                                  </button>
                              </div>
                          </div>
                      </div>
                  `
                : html`
                      <div class="logo-medallion">
                          <div class="logo-letter">W</div>
                      </div>
                      <h1 class="title">Ready to Go</h1>
                      <div class="subtitle">All permissions have been granted successfully.</div>

                      <div class="rows">
                          <div class="perm-row">
                              <div class="perm-left">
                                  <svg
                                      class="permission-icon"
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="24"
                                      height="24"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="white"
                                      stroke-width="2"
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                  >
                                      <path d="M12 19v3" />
                                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                      <rect x="9" y="2" width="6" height="13" rx="3" />
                                  </svg>
                                  <div class="perm-text">
                                      <div class="perm-title">Microphone</div>
                                      <div class="perm-desc">Access granted</div>
                                  </div>
                              </div>
                              <div class="perm-right">
                                  <svg class="check-icon" viewBox="0 0 20 20" fill="currentColor">
                                      <path
                                          fill-rule="evenodd"
                                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                          clip-rule="evenodd"
                                      />
                                  </svg>
                                  <button class="cta-btn" disabled>Granted</button>
                              </div>
                          </div>

                          <div class="perm-row">
                              <div class="perm-left">
                                  <svg
                                      class="permission-icon"
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="24"
                                      height="24"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="white"
                                      stroke-width="2"
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                  >
                                      <rect width="18" height="12" x="3" y="4" rx="2" ry="2" />
                                      <line x1="2" x2="22" y1="20" y2="20" />
                                  </svg>
                                  <div class="perm-text">
                                      <div class="perm-title">Screen Recording</div>
                                      <div class="perm-desc">Access granted</div>
                                  </div>
                              </div>
                              <div class="perm-right">
                                  <svg class="check-icon" viewBox="0 0 20 20" fill="currentColor">
                                      <path
                                          fill-rule="evenodd"
                                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                          clip-rule="evenodd"
                                      />
                                  </svg>
                                  <button class="cta-btn" disabled>Granted</button>
                              </div>
                          </div>
                      </div>
                  `}
        `;
    }

    renderCommandsStep() {
        return html`
            <h1 class="title">Commands We Love</h1>
            <div class="subtitle">Whisper works with these easy to remember commands.</div>

            <div class="commands-list">
                ${this.commands.map(
                    command => html`
                        <div class="command-row">
                            <div class="command-left">
                                <div class="command-title">${command.title}</div>
                                <div class="command-desc">${command.description}</div>
                            </div>
                            <div class="command-shortcuts">
                                ${command.shortcuts.map(key => (key ? html`<div class="key-pill">${key}</div>` : ''))}
                            </div>
                        </div>
                    `
                )}
            </div>
        `;
    }

    render() {
        const allGranted = this.microphoneGranted === 'granted' && this.screenGranted === 'granted';

        const rightButtonLabel = this.currentStep === 1 ? (this.isLoggedIn ? 'Continue' : 'Login') : 'Next';
        const rightButtonDisabled = this.currentStep === 1 ? (this.isLoggedIn ? !allGranted : false) : false;

        return html`
            <div class="container">
                <button class="close-button" @click=${this.handleClose} title="Close application">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" stroke-width="1.5" />
                    </svg>
                </button>

                <div class="step-content ${this.isTransitioning ? '' : 'entering'}">
                    ${this.currentStep === 0 ? this.renderPermissionsStep() : this.renderCommandsStep()}
                </div>

                <!-- Bottom Navigation -->
                <div class="bottom-nav">
                    ${this.currentStep === 1
                        ? html`<button class="nav-button back-button" @click=${this.handleBack}>Back</button>`
                        : html`<div class="nav-spacer"></div>`}
                    ${this.currentStep === 0
                        ? html`<button class="nav-button next-button" @click=${this.handleNext}>Next</button>`
                        : html`<button class="nav-button next-button" @click=${this.handleCommandsPrimaryAction} ?disabled=${rightButtonDisabled}>
                              ${rightButtonLabel}
                          </button>`}
                </div>
            </div>
        `;
    }
}

customElements.define('permission-setup', PermissionHeader);
