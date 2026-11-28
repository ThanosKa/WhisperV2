// Main passes values to the sandboxed preload through `webPreferences.additionalArguments`, which
// Electron appends to the renderer's `process.argv`.

const API_BASE_URL_PREFIX = '--whisper-api-base-url=';

export const apiBaseUrlArgument = (apiBaseUrl: string): string => `${API_BASE_URL_PREFIX}${apiBaseUrl}`;

export const readApiBaseUrlArgument = (argv: readonly string[]): string | undefined =>
    argv.find(argument => argument.startsWith(API_BASE_URL_PREFIX))?.slice(API_BASE_URL_PREFIX.length);
