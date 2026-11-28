import { html, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { screenshotViewStyles } from './screenshot-view.css.js';

export class ScreenshotView extends LitElement {
    static styles = screenshotViewStyles;

    static properties = {
        screenshotData: { type: String },
    };

    constructor() {
        super();
        this.screenshotData = null;
        // Bind handlers
        this.handleMouseEnter = this.handleMouseEnter.bind(this);
        this.handleMouseLeave = this.handleMouseLeave.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        
        // Listen for screenshot data from main process
        if (window.api) {
            this._onScreenshotDataFn = (event, data) => {
                this.screenshotData = data;
                this.requestUpdate();
            };
            window.api.screenshotView.onScreenshotData(this._onScreenshotDataFn);
            
            // Handle mouse enter/leave to cancel hide timer (backup host-level handlers)
            this.addEventListener('mouseenter', this.handleMouseEnter);
            this.addEventListener('mouseleave', this.handleMouseLeave);
        }
    }

    handleMouseEnter() {
        if (window.api) {
            window.api.screenshotView.cancelHideScreenshotWindow();
        }
    }

    handleMouseLeave() {
        if (window.api) {
            window.api.screenshotView.hideScreenshotWindow();
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (window.api && this._onScreenshotDataFn) {
            window.api.screenshotView.removeOnScreenshotData(this._onScreenshotDataFn);
        }
        // Clean up event listeners
        this.removeEventListener('mouseenter', this.handleMouseEnter);
        this.removeEventListener('mouseleave', this.handleMouseLeave);
    }

    render() {
        if (!this.screenshotData) {
            return html`<div class="screenshot-container" @mouseenter=${this.handleMouseEnter} @mouseleave=${this.handleMouseLeave}>
                <div class="loading-state">Loading screenshot...</div>
            </div>`;
        }

        const imageSrc = `data:image/jpeg;base64,${this.screenshotData}`;

        return html`
            <div class="screenshot-container" @mouseenter=${this.handleMouseEnter} @mouseleave=${this.handleMouseLeave}>
                <img src="${imageSrc}" alt="Screenshot" class="screenshot-image" />
            </div>
        `;
    }
}

customElements.define('screenshot-view', ScreenshotView);

