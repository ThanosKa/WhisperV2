import { screen } from 'electron';
import type { BrowserWindow, Display, Rectangle } from 'electron';
import { logger } from '../features/common/utils/logger';

const log = logger.child({ module: 'WindowLayoutManager' });

type Position = { x: number; y: number };
export type Direction = 'left' | 'right' | 'up' | 'down';
// The feature windows that get a place next to the header.
export type WindowLayout = Partial<Record<'listen' | 'ask', Rectangle>>;
type Visibility = { listen?: boolean | undefined; ask?: boolean | undefined };

export function getCurrentDisplay(window: BrowserWindow | undefined): Display {
    if (!window || window.isDestroyed()) return screen.getPrimaryDisplay();

    const windowBounds = window.getBounds();
    const windowCenter = {
        x: windowBounds.x + windowBounds.width / 2,
        y: windowBounds.y + windowBounds.height / 2,
    };

    return screen.getDisplayNearestPoint(windowCenter);
}

class WindowLayoutManager {
    private readonly windowPool: Map<string, BrowserWindow>;

    constructor(windowPool: Map<string, BrowserWindow>) {
        this.windowPool = windowPool;
    }

    private determineLayoutStrategy({
        headerBounds,
        screenWidth,
        screenHeight,
        relativeX,
        workAreaX,
        workAreaY,
    }: {
        headerBounds: Rectangle;
        screenWidth: number;
        screenHeight: number;
        relativeX: number;
        workAreaX: number;
        workAreaY: number;
    }): { name: string; primary: string; secondary: string } {
        const headerRelX = headerBounds.x - workAreaX;
        const headerRelY = headerBounds.y - workAreaY;

        const spaceBelow = screenHeight - (headerRelY + headerBounds.height);
        const spaceAbove = headerRelY;
        const spaceLeft = headerRelX;
        const spaceRight = screenWidth - (headerRelX + headerBounds.width);

        if (spaceBelow >= 400) {
            return { name: 'below', primary: 'below', secondary: relativeX < 0.5 ? 'right' : 'left' };
        } else if (spaceAbove >= 400) {
            return { name: 'above', primary: 'above', secondary: relativeX < 0.5 ? 'right' : 'left' };
        } else if (relativeX < 0.3 && spaceRight >= 800) {
            return { name: 'right-side', primary: 'right', secondary: spaceBelow > spaceAbove ? 'below' : 'above' };
        } else if (relativeX > 0.7 && spaceLeft >= 800) {
            return { name: 'left-side', primary: 'left', secondary: spaceBelow > spaceAbove ? 'below' : 'above' };
        } else {
            return { name: 'adaptive', primary: spaceBelow > spaceAbove ? 'below' : 'above', secondary: spaceRight > spaceLeft ? 'right' : 'left' };
        }
    }

    calculateSettingsWindowPosition(): Position | null {
        const header = this.windowPool.get('header');
        const settings = this.windowPool.get('settings');

        if (!header || header.isDestroyed() || !settings || settings.isDestroyed()) {
            return null;
        }

        const headerBounds = header.getBounds();
        const settingsBounds = settings.getBounds();

        log.info({ height: settingsBounds.height, width: settingsBounds.width }, 'Settings window bounds');

        const display = getCurrentDisplay(header);
        const { x: workAreaX, y: workAreaY, width: screenWidth, height: screenHeight } = display.workArea;

        const PAD = 5;
        const buttonPadding = 100;

        const x = headerBounds.x + headerBounds.width - settingsBounds.width + buttonPadding;
        const y = headerBounds.y + headerBounds.height + PAD;

        const clampedX = Math.max(workAreaX + 10, Math.min(workAreaX + screenWidth - settingsBounds.width - 10, x));
        const clampedY = Math.max(workAreaY + 10, Math.min(workAreaY + screenHeight - settingsBounds.height - 10, y));

        const newPosition = { x: Math.round(clampedX), y: Math.round(clampedY) };
        log.info(newPosition, 'Settings window new position');

        return newPosition;
    }

    /** Position the small plan/quota tooltip window near the left side of the header. */
    calculatePlanWindowPosition(): Position | null {
        const header = this.windowPool.get('header');
        const plan = this.windowPool.get('plan');

        if (!header || header.isDestroyed() || !plan || plan.isDestroyed()) {
            return null;
        }

        const headerBounds = header.getBounds();
        const planBounds = plan.getBounds();

        const display = getCurrentDisplay(header);
        const { x: workAreaX, y: workAreaY, width: screenWidth, height: screenHeight } = display.workArea;

        const PAD = 5;
        // Place under left edge near the left label button
        const leftPadding = 12;
        const x = headerBounds.x + leftPadding;
        const y = headerBounds.y + headerBounds.height + PAD;

        const clampedX = Math.max(workAreaX + 10, Math.min(workAreaX + screenWidth - planBounds.width - 10, x));
        const clampedY = Math.max(workAreaY + 10, Math.min(workAreaY + screenHeight - planBounds.height - 10, y));

        return { x: Math.round(clampedX), y: Math.round(clampedY) };
    }

    calculateHeaderResize({ header, width, height }: { header: BrowserWindow; width: number; height: number }): Rectangle {
        const currentBounds = header.getBounds();
        const centerX = currentBounds.x + currentBounds.width / 2;
        const newX = Math.round(centerX - width / 2);
        const display = getCurrentDisplay(header);
        const { x: workAreaX, width: workAreaWidth } = display.workArea;
        const clampedX = Math.max(workAreaX, Math.min(workAreaX + workAreaWidth - width, newX));
        return { x: clampedX, y: currentBounds.y, width, height };
    }

    calculateClampedPosition({ header, x: newX, y: newY }: { header: BrowserWindow; x: number; y: number }): Position {
        const currentDisplay = getCurrentDisplay(header);
        const { x: workAreaX, y: workAreaY, width, height } = currentDisplay.workArea;
        const headerBounds = header.getBounds();
        const clampedX = Math.max(workAreaX, Math.min(newX, workAreaX + width - headerBounds.width));
        const clampedY = Math.max(workAreaY, Math.min(newY, workAreaY + height - headerBounds.height));
        return { x: clampedX, y: clampedY };
    }

    calculateWindowHeightAdjustment({ senderWindow, targetHeight }: { senderWindow: BrowserWindow; targetHeight: number }): Rectangle {
        const currentBounds = senderWindow.getBounds();
        const minHeight = senderWindow.getMinimumSize()[1] ?? 0;
        const maxHeight = senderWindow.getMaximumSize()[1] ?? 0;
        let adjustedHeight = Math.max(minHeight, targetHeight);
        if (maxHeight > 0) {
            adjustedHeight = Math.min(maxHeight, adjustedHeight);
        }

        const display = getCurrentDisplay(senderWindow);
        const { y: workAreaY, height: workAreaHeight } = display.workArea;

        const header = this.windowPool.get('header');
        const headerBounds = header ? header.getBounds() : null;
        const MIN_HEADER_GAP = 8;
        const minY = headerBounds ? headerBounds.y + headerBounds.height + MIN_HEADER_GAP : workAreaY;

        let newY = currentBounds.y;
        const newBottomEdge = currentBounds.y + adjustedHeight;
        const maxBottomEdge = workAreaY + workAreaHeight - 10;

        if (newBottomEdge > maxBottomEdge) {
            newY = Math.max(minY, maxBottomEdge - adjustedHeight);
        }

        return {
            x: currentBounds.x,
            y: Math.round(newY),
            width: currentBounds.width,
            height: adjustedHeight,
        };
    }

    calculateFeatureWindowLayout({ visibility, headerBoundsOverride }: { visibility: Visibility; headerBoundsOverride?: Rectangle }): WindowLayout {
        const header = this.windowPool.get('header');
        const headerBounds = headerBoundsOverride || (header ? header.getBounds() : null);

        if (!headerBounds) return {};

        let display: Display;
        if (headerBoundsOverride) {
            const boundsCenter = {
                x: headerBounds.x + headerBounds.width / 2,
                y: headerBounds.y + headerBounds.height / 2,
            };
            display = screen.getDisplayNearestPoint(boundsCenter);
        } else {
            display = getCurrentDisplay(header);
        }

        const { width: screenWidth, height: screenHeight, x: workAreaX, y: workAreaY } = display.workArea;

        const ask = this.windowPool.get('ask');
        const listen = this.windowPool.get('listen');

        const askB = visibility.ask && ask && !ask.isDestroyed() ? ask.getBounds() : null;
        const listenB = visibility.listen && listen && !listen.isDestroyed() ? listen.getBounds() : null;

        if (!askB && !listenB) return {};

        const PAD = 8;
        const headerTopRel = headerBounds.y - workAreaY;
        const headerCenterXRel = headerBounds.x - workAreaX + headerBounds.width / 2;

        const relativeX = headerCenterXRel / screenWidth;
        const strategy = this.determineLayoutStrategy({ headerBounds, screenWidth, screenHeight, relativeX, workAreaX, workAreaY });

        if (askB) {
            log.info({ height: askB.height, width: askB.width }, 'Ask window bounds');
        }

        const layout: WindowLayout = {};

        if (askB && listenB) {
            let askXRel = headerCenterXRel - askB.width / 2;
            let listenXRel = askXRel - listenB.width - PAD;

            if (listenXRel < PAD) {
                listenXRel = PAD;
                askXRel = listenXRel + listenB.width + PAD;
            }
            if (askXRel + askB.width > screenWidth - PAD) {
                askXRel = screenWidth - PAD - askB.width;
                listenXRel = askXRel - listenB.width - PAD;
            }

            if (strategy.primary === 'above') {
                const windowBottomAbs = headerBounds.y - PAD;
                layout.ask = {
                    x: Math.round(askXRel + workAreaX),
                    y: Math.round(windowBottomAbs - askB.height),
                    width: askB.width,
                    height: askB.height,
                };
                layout.listen = {
                    x: Math.round(listenXRel + workAreaX),
                    y: Math.round(windowBottomAbs - listenB.height),
                    width: listenB.width,
                    height: listenB.height,
                };
            } else {
                // 'below'
                const yAbs = headerBounds.y + headerBounds.height + PAD;
                layout.ask = { x: Math.round(askXRel + workAreaX), y: Math.round(yAbs), width: askB.width, height: askB.height };
                layout.listen = { x: Math.round(listenXRel + workAreaX), y: Math.round(yAbs), width: listenB.width, height: listenB.height };
            }
        } else {
            // Single window
            const winName = askB ? 'ask' : 'listen';
            const winB = askB ?? listenB;
            if (!winB) return {};

            let xRel = headerCenterXRel - winB.width / 2;
            xRel = Math.max(PAD, Math.min(screenWidth - winB.width - PAD, xRel));

            let yPos: number;
            if (strategy.primary === 'above') {
                yPos = headerTopRel - PAD - winB.height;
            } else {
                // 'below'
                yPos = headerTopRel + headerBounds.height + PAD;
            }

            layout[winName] = { x: Math.round(xRel + workAreaX), y: Math.round(yPos + workAreaY), width: winB.width, height: winB.height };
        }
        return layout;
    }

    calculateStepMovePosition({ header, direction }: { header: BrowserWindow; direction: Direction }): Position {
        const currentBounds = header.getBounds();
        const stepSize = 80; // movement interval
        let targetX = currentBounds.x;
        let targetY = currentBounds.y;

        switch (direction) {
            case 'left':
                targetX -= stepSize;
                break;
            case 'right':
                targetX += stepSize;
                break;
            case 'up':
                targetY -= stepSize;
                break;
            case 'down':
                targetY += stepSize;
                break;
        }

        return this.calculateClampedPosition({ header, x: targetX, y: targetY });
    }

    calculateEdgePosition({ header, direction }: { header: BrowserWindow; direction: Direction }): Position {
        const display = getCurrentDisplay(header);
        const { workArea } = display;
        const currentBounds = header.getBounds();

        let targetX = currentBounds.x;
        let targetY = currentBounds.y;

        switch (direction) {
            case 'left':
                targetX = workArea.x;
                break;
            case 'right':
                targetX = workArea.x + workArea.width - currentBounds.width;
                break;
            case 'up':
                targetY = workArea.y;
                break;
            case 'down':
                targetY = workArea.y + workArea.height - currentBounds.height;
                break;
        }
        return { x: targetX, y: targetY };
    }

    calculateNewPositionForDisplay({ window, targetDisplayId }: { window: BrowserWindow; targetDisplayId: number }): Position | null {
        const targetDisplay = screen.getAllDisplays().find(d => d.id === targetDisplayId);
        if (!targetDisplay) return null;

        const currentBounds = window.getBounds();
        const currentDisplay = getCurrentDisplay(window);

        if (currentDisplay.id === targetDisplay.id) return { x: currentBounds.x, y: currentBounds.y };

        const relativeX = (currentBounds.x - currentDisplay.workArea.x) / currentDisplay.workArea.width;
        const relativeY = (currentBounds.y - currentDisplay.workArea.y) / currentDisplay.workArea.height;

        const targetX = targetDisplay.workArea.x + targetDisplay.workArea.width * relativeX;
        const targetY = targetDisplay.workArea.y + targetDisplay.workArea.height * relativeY;

        const clampedX = Math.max(
            targetDisplay.workArea.x,
            Math.min(targetX, targetDisplay.workArea.x + targetDisplay.workArea.width - currentBounds.width)
        );
        const clampedY = Math.max(
            targetDisplay.workArea.y,
            Math.min(targetY, targetDisplay.workArea.y + targetDisplay.workArea.height - currentBounds.height)
        );

        return { x: Math.round(clampedX), y: Math.round(clampedY) };
    }
}

export default WindowLayoutManager;
