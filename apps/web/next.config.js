/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@nova/shared'],
  output: 'standalone',
};

module.exports = nextConfig;
