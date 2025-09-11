/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    output: 'export',
    distDir: 'out',
    trailingSlash: true,

    images: { unoptimized: true },

    // Fix for Windows path issues
    webpack: (config, { dev, isServer }) => {
        // Handle Windows file system issues
        if (process.platform === 'win32') {
            config.watchOptions = {
                ...config.watchOptions,
                poll: 1000,
                aggregateTimeout: 300,
            };
        }
        return config;
    },

    // Disable file system cache on Windows to avoid symlink issues
    experimental: {
        // Remove invalid option
    },
};

module.exports = nextConfig;
