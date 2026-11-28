import { html, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { dragHandleStyles } from './drag-handle.styles.css.js';

export class DragHandle extends LitElement {
    static properties = {};

    static get styles() {
        return dragHandleStyles;
    }

    constructor() {
        super();
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.dragState = null;
    }

    async handleMouseDown(e) {
        e.preventDefault();

        if (!window.api?.mainHeader?.getHeaderPosition) {
            return;
        }

        const initialPosition = await window.api.mainHeader.getHeaderPosition();

        this.dragState = {
            initialMouseX: e.screenX,
            initialMouseY: e.screenY,
            initialWindowX: initialPosition.x,
            initialWindowY: initialPosition.y,
            moved: false,
        };

        window.addEventListener('mousemove', this.handleMouseMove, { capture: true });
        window.addEventListener('mouseup', this.handleMouseUp, { once: true, capture: true });
    }

    handleMouseMove(e) {
        if (!this.dragState || !window.api?.mainHeader?.moveHeaderTo) return;

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

        window.removeEventListener('mousemove', this.handleMouseMove, { capture: true });
        this.dragState = null;
    }

    render() {
        return html`
            <button class="drag-handle-button" @mousedown=${this.handleMouseDown}>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="lucide lucide-move-icon lucide-move"
                >
                    <path d="M12 2v20" />
                    <path d="m15 19-3 3-3-3" />
                    <path d="m19 9 3 3-3 3" />
                    <path d="M2 12h20" />
                    <path d="m5 9-3 3 3 3" />
                    <path d="m9 5 3-3 3 3" />
                </svg>
            </button>
        `;
    }
}

customElements.define('drag-handle', DragHandle);

