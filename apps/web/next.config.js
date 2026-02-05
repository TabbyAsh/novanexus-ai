// Deployment trigger: 2026-02-05 01:08:00
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@nova/shared'],
  output: 'standalone',
};

module.exports = nextConfig;

