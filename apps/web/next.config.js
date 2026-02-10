// Deployment trigger: 2026-02-10-phase71-v2
const fs = require('fs');
const path = require('path');

// Generate build info at config evaluation time (during build)
const BUILD_INFO = {
  gitSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_GIT_SHA || process.env.GIT_SHA || 'dev',
  buildTime: new Date().toISOString(),
  buildId: process.env.NEXT_PUBLIC_BUILD_ID || `build-${Date.now()}`,
  environment: process.env.NODE_ENV || 'development',
  vercelEnv: process.env.VERCEL_ENV || null,
};

// Write build info to a JSON file that can be imported at runtime
const buildInfoPath = path.join(__dirname, 'src', 'build-info.json');
try {
  fs.writeFileSync(buildInfoPath, JSON.stringify(BUILD_INFO, null, 2));
  console.log(`[next.config.js] Build info written: gitSha=${BUILD_INFO.gitSha.substring(0, 7)}`);
} catch (e) {
  console.warn('[next.config.js] Could not write build-info.json:', e.message);
}

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
  // Inject build identity at build time (for client components)
  env: {
    NEXT_PUBLIC_GIT_SHA: BUILD_INFO.gitSha,
    NEXT_PUBLIC_BUILD_TIME: BUILD_INFO.buildTime,
    NEXT_PUBLIC_BUILD_ID: BUILD_INFO.buildId,
  },
};

module.exports = nextConfig;

