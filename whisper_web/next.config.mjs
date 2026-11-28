/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    output: 'export',
    distDir: 'out',
    trailingSlash: true,

    images: { unoptimized: true },
};

export default nextConfig;
