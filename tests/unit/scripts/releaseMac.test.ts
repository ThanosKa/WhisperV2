import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { releaseMac } from '../../../scripts/release-mac';

const RELEASE_FILES = [
    'latest-mac.yml',
    'Whisper-1.7.0-universal.dmg',
    'Whisper-1.7.0-universal.dmg.blockmap',
    'Whisper-1.7.0-universal-mac.zip',
    'Whisper-1.7.0-universal-mac.zip.blockmap',
];

describe('releaseMac', () => {
    let distDir: string;

    const writeDist = ({ names }: { names: string[] }) => {
        for (const name of names) fs.writeFileSync(path.join(distDir, name), name);
    };

    beforeEach(() => {
        distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-mac-'));
    });

    afterEach(() => {
        fs.rmSync(distDir, { recursive: true, force: true });
    });

    test('fails when the upload fails', async () => {
        writeDist({ names: RELEASE_FILES });

        await expect(releaseMac({ distDir, publish: async () => null })).rejects.toThrow('upload failed');
    });

    test('uploads the release files and nothing else from the output folder', async () => {
        writeDist({ names: [...RELEASE_FILES, 'builder-debug.yml', 'latest.yml'] });
        const uploads: string[] = [];

        await releaseMac({
            distDir,
            publish: async ({ files }: { files: string[] }) => {
                uploads.push(...files);
                return files;
            },
        });

        expect(uploads.map(file => path.basename(file)).sort()).toEqual([...RELEASE_FILES].sort());
    });

    test('uploads nothing when a release file is missing', async () => {
        writeDist({ names: RELEASE_FILES.filter(name => !name.endsWith('-mac.zip.blockmap')) });
        const publish = vi.fn(async ({ files }: { files: string[] }) => files);

        await expect(releaseMac({ distDir, publish })).rejects.toThrow('*-mac.zip.blockmap');
        expect(publish).not.toHaveBeenCalled();
    });

    test('the command exits non-zero when the output folder holds no release', () => {
        const { GH_TOKEN: _a, GITHUB_TOKEN: _b, GITHUB_RELEASE_TOKEN: _c, ...env } = process.env;
        const result = spawnSync(process.execPath, [path.join(import.meta.dirname, '../../../scripts/release-mac.js'), distDir], {
            env,
            encoding: 'utf8',
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('latest-mac.yml');
    });
});
