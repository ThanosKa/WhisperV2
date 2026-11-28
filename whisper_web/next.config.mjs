/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    output: 'export',
    distDir: 'out',
    trailingSlash: true,

    images: { unoptimized: true },

    // Next 16's `next dev` writes an AGENTS.md when an AI agent runs it. The repo's agent docs are planned
    // separately (step 8 of the cleanup map), so it stays off.
    agentRules: false,
};

export default nextConfig;
