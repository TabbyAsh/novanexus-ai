// Deployment trigger: 2026-02-06 22:05:00
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
};

module.exports = nextConfig;

