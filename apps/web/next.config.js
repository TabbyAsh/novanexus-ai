// Deployment trigger: 2026-02-10-phase71
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@nova/shared'],
  output: 'standalone',
  // Skip type checking during build (handled by CI)
  typescript: {
    ignoreBuildErrors: true,
  },
  // Skip ESLint during build (handled by CI)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Inject build identity at build time
  env: {
    // VERCEL_GIT_COMMIT_SHA is auto-set by Vercel during builds
    // GIT_SHA can be set manually for local/other deployments
    NEXT_PUBLIC_GIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || 'dev',
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

module.exports = nextConfig;

