import type { ForgeConfig } from '@electron-forge/shared-types';

const config: ForgeConfig = {
    packagerConfig: {
        asar: true,
    },
    rebuildConfig: {},
    makers: [],
    plugins: [
        {
            name: '@electron-forge/plugin-vite',
            config: {
                renderer: [
                    {
                        name: 'main_window',
                        config: 'forge.vite.renderer.config.ts',
                    },
                ],
            },
        },
    ],
};

export default config;
