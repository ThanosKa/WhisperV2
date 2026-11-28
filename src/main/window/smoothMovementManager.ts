import type { BrowserWindow, Rectangle } from 'electron';
import type { WindowLayout } from './windowLayoutManager';

type Position = { x: number; y: number };

type AnimationOptions = {
    onComplete?: (() => void) | undefined;
    duration?: number | undefined;
};

type FadeOptions = { win: BrowserWindow; from?: number | undefined; to: number; duration?: number | undefined; onComplete?: (() => void) | undefined };

class SmoothMovementManager {
    private readonly windowPool: Map<string, BrowserWindow>;
    private readonly animationDuration = 300;
    isAnimating = false;
    private readonly animationTimers = new Map<BrowserWindow, ReturnType<typeof setTimeout>>();

    constructor(windowPool: Map<string, BrowserWindow>) {
        this.windowPool = windowPool;
    }

    private isWindowValid(win: BrowserWindow): boolean {
        if (win.isDestroyed()) {
            // Clean up timer if it exists for this window
            const timer = this.animationTimers.get(win);
            if (timer !== undefined) {
                clearTimeout(timer);
                this.animationTimers.delete(win);
            }
            return false;
        }
        return true;
    }

    fade({ win, from, to, duration = 250, onComplete }: FadeOptions) {
        if (!this.isWindowValid(win)) {
            if (onComplete) onComplete();
            return;
        }
        const startOpacity = from ?? win.getOpacity();
        const startTime = Date.now();

        const step = () => {
            if (!this.isWindowValid(win)) {
                if (onComplete) onComplete();
                return;
            }
            const progress = Math.min(1, (Date.now() - startTime) / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            win.setOpacity(startOpacity + (to - startOpacity) * eased);

            if (progress < 1) {
                setTimeout(step, 8);
            } else {
                win.setOpacity(to);
                if (onComplete) onComplete();
            }
        };
        step();
    }

    animateWindowBounds({ win, targetBounds, ...options }: { win: BrowserWindow; targetBounds: Rectangle } & AnimationOptions) {
        const pending = this.animationTimers.get(win);
        if (pending !== undefined) {
            clearTimeout(pending);
        }

        if (!this.isWindowValid(win)) {
            if (options.onComplete) options.onComplete();
            return;
        }

        this.isAnimating = true;

        const startBounds = win.getBounds();
        const startTime = Date.now();
        const duration = options.duration || this.animationDuration;

        const step = () => {
            if (!this.isWindowValid(win)) {
                if (options.onComplete) options.onComplete();
                return;
            }

            const progress = Math.min(1, (Date.now() - startTime) / duration);
            const eased = 1 - Math.pow(1 - progress, 3);

            const newBounds = {
                x: Math.round(startBounds.x + (targetBounds.x - startBounds.x) * eased),
                y: Math.round(startBounds.y + (targetBounds.y - startBounds.y) * eased),
                width: Math.round(startBounds.width + (targetBounds.width - startBounds.width) * eased),
                height: Math.round(startBounds.height + (targetBounds.height - startBounds.height) * eased),
            };
            win.setBounds(newBounds);

            if (progress < 1) {
                const timerId = setTimeout(step, 8);
                this.animationTimers.set(win, timerId);
            } else {
                win.setBounds(targetBounds);
                this.animationTimers.delete(win);

                if (this.animationTimers.size === 0) {
                    this.isAnimating = false;
                }

                if (options.onComplete) options.onComplete();
            }
        };
        step();
    }

    animateWindowPosition({ win, targetPosition, ...options }: { win: BrowserWindow; targetPosition: Position } & AnimationOptions) {
        if (!this.isWindowValid(win)) {
            if (options.onComplete) options.onComplete();
            return;
        }
        const currentBounds = win.getBounds();
        const targetBounds = { ...currentBounds, ...targetPosition };
        this.animateWindowBounds({ win, targetBounds, ...options });
    }

    animateLayout({ layout, animated = true }: { layout: WindowLayout; animated?: boolean }) {
        for (const [winName, targetBounds] of Object.entries(layout)) {
            const win = this.windowPool.get(winName);
            if (win && !win.isDestroyed() && targetBounds) {
                if (animated) {
                    this.animateWindowBounds({ win, targetBounds });
                } else {
                    win.setBounds(targetBounds);
                }
            }
        }
    }
}

export default SmoothMovementManager;
