// Dashboard screenshots on fake data: one full-page PNG for each of the 10 pages.
//
// Rerun from the WhisperV2 repo root (the label is "before" by default, "after" for the comparison):
//   node .scratch/step-2-3-safety-net-upgrades/assets/dashboard-screenshots.mjs [before|after]
//
// What it does: starts `next dev` in whisper_web on a free port with NEXT_PUBLIC_DEV_MOCK=1, opens each page
// in Playwright's own headless Chromium (1440x900, light colors, animations off, clock frozen so the fake
// data's dates do not change), waits for the page to settle, saves assets/dashboard-<label>-<NN>-<page>.png,
// and stops only the dev server it started. It needs the Chromium that `npx playwright install chromium` fetches (it runs as the new headless mode, channel chromium).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const label = process.argv[2] ?? 'before';
const assetsDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(assetsDir, '../../../whisper_web');
const VIEWPORT = { width: 1440, height: 900 };
const FIXED_TIME = new Date('2026-01-15T12:00:00Z');

const PAGES = [
    { name: 'home', route: '/' },
    { name: 'login', route: '/login' },
    { name: 'activity', route: '/activity' },
    { name: 'activity-details', route: '/activity/details?sessionId=sess-0' },
    { name: 'personalize', route: '/personalize' },
    { name: 'settings', route: '/settings' },
    { name: 'billing', route: '/settings/billing' },
    { name: 'privacy', route: '/settings/privacy' },
    { name: 'help', route: '/help' },
    { name: 'download', route: '/download' },
];

const NO_ANIMATION_CSS = `*, *::before, *::after {
    animation: none !important; transition: none !important; caret-color: transparent !important; scroll-behavior: auto !important;
}`;

function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

async function waitForServer({ url, timeoutMs }) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(url);
            if (res.status < 500) return;
        } catch {
            // server not listening yet
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error(`dev server did not answer at ${url} within ${timeoutMs} ms`);
}

async function main() {
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    const nextBin = path.join(webDir, 'node_modules', '.bin', 'next');
    const server = spawn(nextBin, ['dev', '-p', String(port), '-H', '127.0.0.1'], {
        cwd: webDir,
        env: { ...process.env, NEXT_PUBLIC_DEV_MOCK: '1', NEXT_TELEMETRY_DISABLED: '1' },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let serverLog = '';
    server.stdout.on('data', chunk => (serverLog += chunk));
    server.stderr.on('data', chunk => (serverLog += chunk));
    const stopServer = () => {
        try {
            process.kill(-server.pid, 'SIGTERM');
        } catch {
            // already stopped
        }
    };
    process.on('exit', stopServer);

    let browser;
    try {
        await waitForServer({ url: `${base}/login`, timeoutMs: 120_000 });
        browser = await chromium.launch({ channel: 'chromium' });
        const context = await browser.newContext({
            viewport: VIEWPORT,
            deviceScaleFactor: 1,
            colorScheme: 'light',
            reducedMotion: 'reduce',
            locale: 'en-US',
            timezoneId: 'UTC',
        });
        await context.clock.setFixedTime(FIXED_TIME);
        await context.addInitScript(() => {
            try {
                localStorage.setItem('dev_mock', '1');
            } catch {
                // storage unavailable
            }
        });
        const page = await context.newPage();
        mkdirSync(assetsDir, { recursive: true });

        for (const [index, { name, route }] of PAGES.entries()) {
            await page.goto(`${base}${route}`, { waitUntil: 'load', timeout: 120_000 });
            await page.addStyleTag({ content: NO_ANIMATION_CSS });
            await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
            await page.evaluate(() => document.fonts.ready);
            await page.waitForTimeout(1500);
            const file = path.join(assetsDir, `dashboard-${label}-${String(index + 1).padStart(2, '0')}-${name}.png`);
            await page.screenshot({ path: file, fullPage: true, animations: 'disabled', caret: 'initial' });
            console.log(`saved ${path.relative(process.cwd(), file)}  (${route})`);
        }
    } catch (error) {
        console.error(serverLog.split('\n').slice(-30).join('\n'));
        throw error;
    } finally {
        if (browser) await browser.close();
        stopServer();
    }
}

main().then(
    () => process.exit(0),
    error => {
        console.error(error);
        process.exit(1);
    },
);
