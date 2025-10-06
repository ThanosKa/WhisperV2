/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    output: 'export',
    distDir: 'out',
    trailingSlash: true,

    images: { unoptimized: true },

    webpack: config => {
        if (process.platform === 'win32') {
            config.watchOptions = {
                ...config.watchOptions,
                poll: 1000,
                aggregateTimeout: 300,
            };
        }
        return config;
    },
};

export default nextConfig;
