const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, '../..'),
  typescript: { ignoreBuildErrors: true },
};

module.exports = nextConfig;
