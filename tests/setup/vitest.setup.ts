import { beforeEach, vi } from 'vitest';
import { mockStoreInstances, mockWindows } from './electronMocks';

vi.mock('electron', async () => {
    const { electronMock } = await import('./electronMocks');
    return { ...electronMock, default: electronMock };
});

vi.mock('electron-store', async () => {
    const { ElectronStoreMock } = await import('./electronMocks');
    return { default: ElectronStoreMock };
});

beforeEach(() => {
    mockWindows.splice(0, mockWindows.length);
    mockStoreInstances.splice(0, mockStoreInstances.length);
});

// The code under test logs freely; keep the test output readable.
vi.spyOn(console, 'log').mockImplementation(() => undefined);
vi.spyOn(console, 'debug').mockImplementation(() => undefined);
vi.spyOn(console, 'info').mockImplementation(() => undefined);
vi.spyOn(console, 'warn').mockImplementation(() => undefined);
vi.spyOn(console, 'error').mockImplementation(() => undefined);
