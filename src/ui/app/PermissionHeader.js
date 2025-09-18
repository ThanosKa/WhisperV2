import { LitElement, html, css } from '../assets/lit-core-2.7.4.min.js';

// App content dimensions
const APP_CONTENT_WIDTH = 950;
const APP_CONTENT_HEIGHT = 750;

export class PermissionHeader extends LitElement {
    static styles = css`
        :host {
            display: block;
            transition:
                opacity 0.15s ease-out,
                transform 0.15s ease-out;
            will-change: opacity, transform;
        }

        :host(.sliding-out) {
            opacity: 0;
            transform: translateY(-20px);
        }

        :host(.hidden) {
            opacity: 0;
            pointer-events: none;
        }

        * {
            font-family:
                'Helvetica Neue',
                -apple-system,
                BlinkMacSystemFont,
                'Segoe UI',
                Roboto,
                sans-serif;
            cursor: default;
            user-select: none;
            box-sizing: border-box;
        }

        .container {
            -webkit-app-region: no-drag;
            width: ${APP_CONTENT_WIDTH}px;
            height: ${APP_CONTENT_HEIGHT}px;
            padding: 40px;
            background: linear-gradient(180deg, rgba(0, 1, 11, 0.9) 0%, rgba(10, 15, 44, 0.85) 50%, rgba(17, 22, 58, 0.8) 100%);
            border: none;
            border-radius: 0;
            overflow: hidden;
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(20px);
        }

        /* Center radial glow */
        .container::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 600px;
            height: 600px;
            transform: translate(-50%, -50%) scale(var(--glow-scale, 0));
            background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0) 60%);
            pointer-events: none;
            border-radius: 50%;
            opacity: 0.15;
            animation: glowIn 0.4s ease-out 0.05s forwards;
        }

        @keyframes glowIn {
            to {
                transform: translate(-50%, -50%) scale(1);
            }
        }

        /* Close button */
        .close-button {
            -webkit-app-region: no-drag;
            position: absolute;
            top: 40px;
            right: 40px;
            width: 32px;
            height: 32px;
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.7);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition:
                transform 0.1s ease,
                color 0.1s ease;
            z-index: 10;
            font-size: 18px;
            line-height: 1;
            padding: 0;
            animation: closeFadeIn 0.4s ease-out 0.2s both;
        }

        @keyframes closeFadeIn {
            from {
                opacity: 0;
                transform: translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .close-button:hover {
            transform: scale(1.1);
            color: rgba(255, 255, 255, 1);
        }

        .close-button:active {
            transform: scale(0.9);
        }

        /* Step content container with transitions */
        .step-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            max-width: 600px;
            position: relative;
        }

        .step-content.entering {
            animation: stepSlideIn 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }

        .step-content.exiting {
            animation: stepSlideOut 0.15s cubic-bezier(0.55, 0.06, 0.68, 0.19) forwards;
        }

        @keyframes stepSlideIn {
            from {
                opacity: 0;
                transform: translateY(50px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        @keyframes stepSlideOut {
            from {
                opacity: 1;
                transform: translateY(0);
            }
            to {
                opacity: 0;
                transform: translateY(-50px);
            }
        }

        /* Logo medallion */
        .logo-medallion {
            width: 100px;
            height: 100px;
            background: #000;
            border: 2px solid rgba(255, 255, 255, 0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 24px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            animation: logoSpringIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55) 0.15s forwards;
            transform: rotate(-180deg) scale(0);
        }

        @keyframes logoSpringIn {
            to {
                transform: rotate(0deg) scale(1);
            }
        }

        .logo-letter {
            color: white;
            font-size: 40px;
            font-weight: 700;
            letter-spacing: -1px;
        }

        .title {
            margin: 0 0 8px 0;
            text-align: center;
            font-size: 48px;
            font-weight: 700;
            letter-spacing: -0.5px;
            background: linear-gradient(135deg, #ffffff, #e0e7ff, #c7d2fe);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            text-shadow: 0 0 20px rgba(59, 130, 246, 0.15);
            animation: titleFadeIn 0.5s ease-out 0.3s both;
        }

        @keyframes titleFadeIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .subtitle {
            color: rgba(255, 255, 255, 0.8);
            font-size: 18px;
            font-weight: 400;
            text-align: center;
            margin: 0 0 40px 0;
            line-height: 1.4;
            animation: subtitleFadeIn 0.5s ease-out 0.4s both;
        }

        @keyframes subtitleFadeIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        /* Permission rows */
        .rows {
            display: flex;
            flex-direction: column;
            gap: 16px;
            width: 100%;
            animation: rowsFadeIn 0.5s ease-out 0.5s both;
        }

        @keyframes rowsFadeIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .perm-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
            padding: 20px 24px;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .perm-right {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .perm-left {
            display: flex;
            align-items: center;
            gap: 16px;
            min-width: 0;
        }

        .permission-icon {
            width: 28px;
            height: 28px;
            opacity: 0.9;
            flex-shrink: 0;
        }

        .check-icon {
            width: 28px;
            height: 28px;
            color: rgba(34, 197, 94, 0.95);
            flex-shrink: 0;
        }

        .perm-text {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .perm-title {
            color: #fff;
            font-size: 22px;
            font-weight: 600;
            line-height: 1.2;
        }

        .perm-desc {
            color: rgba(255, 255, 255, 0.6);
            font-size: 16px;
            line-height: 1.3;
        }

        .cta-btn {
            -webkit-app-region: no-drag;
            white-space: nowrap;
            background: rgba(11, 11, 11, 0.55);
            color: #fff;
            border: 1px solid rgba(255, 255, 255, 0.25);
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            padding: 10px 20px;
            min-width: 120px;
            text-align: center;
            backdrop-filter: blur(25px);
            transition:
                transform 0.08s ease,
                background 0.08s ease,
                opacity 0.15s ease;
            cursor: pointer;
        }

        .cta-btn:hover:not(:disabled) {
            transform: translateY(-1px) scale(1.02);
            background: rgba(11, 11, 11, 0.65);
        }

        .cta-btn:active:not(:disabled) {
            transform: scale(0.98);
        }

        .cta-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        /* Commands step styles */
        .commands-list {
            display: flex;
            flex-direction: column;
            gap: 20px;
            width: 100%;
            animation: commandsFadeIn 0.5s ease-out 0.5s both;
        }

        @keyframes commandsFadeIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .command-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
            padding: 16px 0;
            animation: commandRowSlideIn 0.4s ease-out both;
        }

        .command-row:nth-child(1) {
            animation-delay: 0.6s;
        }
        .command-row:nth-child(2) {
            animation-delay: 0.7s;
        }
        .command-row:nth-child(3) {
            animation-delay: 0.8s;
        }
        .command-row:nth-child(4) {
            animation-delay: 0.9s;
        }

        @keyframes commandRowSlideIn {
            from {
                opacity: 0;
                transform: translateX(-20px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }

        .command-left {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .command-title {
            color: #fff;
            font-size: 22px;
            font-weight: 600;
            line-height: 1.2;
        }

        .command-desc {
            color: rgba(255, 255, 255, 0.6);
            font-size: 16px;
            line-height: 1.3;
        }

        .command-shortcuts {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .key-pill {
            background: rgba(11, 11, 11, 0.55);
            border: 1px solid rgba(255, 255, 255, 0.25);
            border-radius: 6px;
            padding: 8px 12px;
            min-width: 32px;
            text-align: center;
            font-size: 14px;
            font-weight: 500;
            color: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(25px);
        }

        /* Bottom navigation */
        .bottom-nav {
            position: absolute;
            bottom: 40px;
            left: 40px;
            right: 40px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            pointer-events: none;
        }

        .nav-button {
            -webkit-app-region: no-drag;
            white-space: nowrap;
            background: rgba(11, 11, 11, 0.55);
            color: #fff;
            border: 1px solid rgba(255, 255, 255, 0.25);
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            padding: 10px 20px;
            min-width: 120px;
            text-align: center;
            backdrop-filter: blur(25px);
            transition:
                transform 0.08s ease,
                background 0.08s ease,
                opacity 0.15s ease;
            cursor: pointer;
            pointer-events: auto;
            animation: navButtonFadeIn 0.4s ease-out 0.7s both;
        }

        @keyframes navButtonFadeIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .nav-button:hover:not(:disabled) {
            transform: translateY(-2px) scale(1.04);
            background: rgba(11, 11, 11, 0.75);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
            border-color: rgba(255, 255, 255, 0.4);
        }

        .nav-button:active:not(:disabled) {
            transform: scale(0.98);
        }

        .nav-button:disabled {
            opacity: 0.4;
            cursor: not-allowed;
            pointer-events: none;
        }

        .continue-button {
            -webkit-app-region: no-drag;
            width: 100%;
            max-width: 300px;
            height: 48px;
            background: rgba(34, 197, 94, 0.85);
            border: none;
            border-radius: 12px;
            color: white;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition:
                transform 0.08s ease,
                background 0.1s ease;
            position: relative;
            overflow: hidden;
            margin-top: 24px;
            animation: continueFadeIn 0.5s ease-out 0.7s both;
        }

        @keyframes continueFadeIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .continue-button::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border-radius: 12px;
            padding: 1px;
            background: linear-gradient(169deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0) 50%, rgba(255, 255, 255, 0.3) 100%);
            -webkit-mask:
                linear-gradient(#fff 0 0) content-box,
                linear-gradient(#fff 0 0);
            -webkit-mask-composite: destination-out;
            mask-composite: exclude;
            pointer-events: none;
        }

        .continue-button:hover:not(:disabled) {
            background: rgba(34, 197, 94, 0.95);
            transform: translateY(-1px) scale(1.02);
        }

        .continue-button:disabled {
            background: rgba(255, 255, 255, 0.2);
            cursor: not-allowed;
        }

        .footnote {
            color: rgba(255, 255, 255, 0.6);
            font-size: 14px;
            line-height: 1.4;
            text-align: center;
            margin-top: 16px;
            animation: footnoteFadeIn 0.5s ease-out 0.8s both;
        }

        @keyframes footnoteFadeIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        /* ────────────────[ GLASS BYPASS ]─────────────── */
        :host-context(body.has-glass) .container,
        :host-context(body.has-glass) .cta-btn,
        :host-context(body.has-glass) .continue-button,
        :host-context(body.has-glass) .close-button,
        :host-context(body.has-glass) .nav-button,
        :host-context(body.has-glass) .key-pill {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            filter: none !important;
            backdrop-filter: none !important;
        }

        :host-context(body.has-glass) .container::before,
        :host-context(body.has-glass) .continue-button::after {
            display: none !important;
        }

        :host-context(body.has-glass) .cta-btn:hover,
        :host-context(body.has-glass) .continue-button:hover,
        :host-context(body.has-glass) .close-button:hover,
        :host-context(body.has-glass) .nav-button:hover {
            background: transparent !important;
        }

        :host-context(body.has-glass) .logo-medallion {
            background: transparent !important;
            border: 2px solid rgba(255, 255, 255, 0.2) !important;
        }
    `;

    static properties = {
        microphoneGranted: { type: String },
        screenGranted: { type: String },
        keychainGranted: { type: String },
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
        this.keychainGranted = 'unknown';
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
            const prevKeychain = this.keychainGranted;

            this.microphoneGranted = permissions.microphone;
            this.screenGranted = permissions.screen;
            this.keychainGranted = permissions.keychain;

            // if permissions changed == UI update
            if (prevMic !== this.microphoneGranted || prevScreen !== this.screenGranted || prevKeychain !== this.keychainGranted) {
                console.log('[PermissionHeader] Permission status changed, updating UI');
                this.requestUpdate();
            }

            const isKeychainRequired = this.userMode === 'firebase';
            const keychainOk = !isKeychainRequired || this.keychainGranted === 'granted';

            // if all permissions granted and on step 0 == show continue button
            if (this.microphoneGranted === 'granted' && this.screenGranted === 'granted' && keychainOk && this.currentStep === 0) {
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

    async handleKeychainClick() {
        if (!window.api || this.keychainGranted === 'granted') return;

        console.log('[PermissionHeader] Requesting keychain permission...');

        try {
            // Trigger initializeKey to prompt for keychain access
            // Assuming encryptionService is accessible or via API
            await window.api.permissionHeader.initializeEncryptionKey(); // New IPC handler needed

            // After success, update status
            this.keychainGranted = 'granted';
            this.requestUpdate();
        } catch (error) {
            console.error('[PermissionHeader] Error requesting keychain permission:', error);
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
        const isKeychainRequired = this.userMode === 'firebase';
        const keychainOk = !isKeychainRequired || this.keychainGranted === 'granted';

        if (this.continueCallback && this.microphoneGranted === 'granted' && this.screenGranted === 'granted' && keychainOk) {
            // Mark permissions as completed
            if (window.api && isKeychainRequired) {
                try {
                    await window.api.permissionHeader.markKeychainCompleted();
                    console.log('[PermissionHeader] Marked keychain as completed');
                } catch (error) {
                    console.error('[PermissionHeader] Error marking keychain as completed:', error);
                }
            }

            this.continueCallback();
        }
    }

    async handleCommandsPrimaryAction() {
        const isKeychainRequired = this.userMode === 'firebase';
        const keychainOk = !isKeychainRequired || this.keychainGranted === 'granted';
        const allGranted = this.microphoneGranted === 'granted' && this.screenGranted === 'granted' && keychainOk;

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
        const isKeychainRequired = this.userMode === 'firebase';
        const keychainOk = !isKeychainRequired || this.keychainGranted === 'granted';
        const allGranted = this.microphoneGranted === 'granted' && this.screenGranted === 'granted' && keychainOk;

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

                          ${isKeychainRequired
                              ? html`
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
                                                <ellipse cx="12" cy="5" rx="9" ry="3" />
                                                <path d="M3 5V19A9 3 0 0 0 21 19V5" />
                                                <path d="M3 12A9 3 0 0 0 21 12" />
                                            </svg>
                                            <div class="perm-text">
                                                <div class="perm-title">Data Encryption</div>
                                                <div class="perm-desc">Secure your data with Keychain.</div>
                                            </div>
                                        </div>
                                        <div class="perm-right">
                                            ${this.keychainGranted === 'granted'
                                                ? html`<svg class="check-icon" viewBox="0 0 20 20" fill="currentColor">
                                                      <path
                                                          fill-rule="evenodd"
                                                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                                          clip-rule="evenodd"
                                                      />
                                                  </svg>`
                                                : ''}
                                            <button
                                                class="cta-btn"
                                                @click=${this.handleKeychainClick}
                                                ?disabled=${this.keychainGranted === 'granted'}
                                            >
                                                ${this.keychainGranted === 'granted' ? 'Enabled' : 'Enable'}
                                            </button>
                                        </div>
                                    </div>
                                `
                              : ''}
                      </div>

                      ${isKeychainRequired ? html` <div class="footnote">If prompted, press "Always Allow" in the Keychain dialog.</div> ` : ''}
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

                          ${isKeychainRequired
                              ? html`
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
                                                <ellipse cx="12" cy="5" rx="9" ry="3" />
                                                <path d="M3 5V19A9 3 0 0 0 21 19V5" />
                                                <path d="M3 12A9 3 0 0 0 21 12" />
                                            </svg>
                                            <div class="perm-text">
                                                <div class="perm-title">Data Encryption</div>
                                                <div class="perm-desc">Enabled</div>
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
                                            <button class="cta-btn" disabled>Enabled</button>
                                        </div>
                                    </div>
                                `
                              : ''}
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
        const isKeychainRequired = this.userMode === 'firebase';
        const keychainOk = !isKeychainRequired || this.keychainGranted === 'granted';
        const allGranted = this.microphoneGranted === 'granted' && this.screenGranted === 'granted' && keychainOk;

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
