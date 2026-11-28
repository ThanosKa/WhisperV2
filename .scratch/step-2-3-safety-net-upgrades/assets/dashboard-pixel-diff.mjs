// Pixel diff of two sets of dashboard screenshots taken by dashboard-screenshots.mjs.
//
// Rerun from the WhisperV2 repo root (labels are the file prefixes, such as before-chromium159 and after):
//   node .scratch/step-2-3-safety-net-upgrades/assets/dashboard-pixel-diff.mjs <labelA> <labelB> [outDir]
//
// For each of the 10 pages it prints the pixels that differ at all, the pixels that differ by more than 16 levels in
// one channel (what an eye can see), the largest difference, and the box around the differences. When outDir is
// given, it writes diff-<NN>-<page>.png there for each page that differs: image B dimmed, differing pixels red.
// It reads the PNGs with sharp from the repo root's dependencies.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assetsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(assetsDir, '../../..');
const sharp = createRequire(path.join(repoRoot, 'package.json'))('sharp');

const [labelA, labelB, outDir] = process.argv.slice(2);
if (!labelA || !labelB) {
    console.error('usage: dashboard-pixel-diff.mjs <labelA> <labelB> [outDir]');
    process.exit(1);
}
const VISIBLE = 16;
const PAGES = ['01-home', '02-login', '03-activity', '04-activity-details', '05-personalize', '06-settings', '07-billing', '08-privacy', '09-help', '10-download'];

async function readRaw(label, page) {
    const file = path.join(assetsDir, `dashboard-${label}-${page}.png`);
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
}

if (outDir) mkdirSync(outDir, { recursive: true });
for (const page of PAGES) {
    const a = await readRaw(labelA, page);
    const b = await readRaw(labelB, page);
    const width = Math.max(a.width, b.width);
    const height = Math.max(a.height, b.height);
    const out = Buffer.alloc(width * height * 4);
    let differing = 0;
    let visible = 0;
    let maxDelta = 0;
    let box = null;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 4;
            const inBoth = x < a.width && y < a.height && x < b.width && y < b.height;
            let delta = 255;
            if (inBoth) {
                const ia = (y * a.width + x) * 4;
                const ib = (y * b.width + x) * 4;
                delta = 0;
                for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(a.data[ia + c] - b.data[ib + c]));
            }
            if (delta > 0) {
                differing++;
                if (delta > VISIBLE) visible++;
                maxDelta = Math.max(maxDelta, delta);
                box = box
                    ? { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) }
                    : { x0: x, y0: y, x1: x, y1: y };
                out.set([255, 0, 0, 255], o);
            } else {
                const ib = (y * b.width + x) * 4;
                const grey = 200 + Math.round(((b.data[ib] + b.data[ib + 1] + b.data[ib + 2]) / 3 / 255) * 55);
                out.set([grey, grey, grey, 255], o);
            }
        }
    }
    if (outDir && differing > 0) {
        await sharp(out, { raw: { width, height, channels: 4 } }).png().toFile(path.join(outDir, `diff-${page}.png`));
    }
    const where = box ? `x ${box.x0}-${box.x1}, y ${box.y0}-${box.y1}` : '';
    console.log(
        `${page.padEnd(20)} differing ${String(differing).padStart(6)}  visible ${String(visible).padStart(6)}  max ${String(maxDelta).padStart(3)}  ${where}`,
    );
}
