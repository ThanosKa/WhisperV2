// Types for release-mac.js, a plain Node script, so its TypeScript test type-checks.

// `publish` uploads the files and resolves to null when the upload failed.
export function releaseMac(options: { distDir: string; publish: (args: { files: string[] }) => Promise<unknown> }): Promise<void>;
