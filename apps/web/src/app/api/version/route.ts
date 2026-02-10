import { NextResponse } from 'next/server';

// Import build info generated at build time by next.config.js
import buildInfo from '@/build-info.json';

/**
 * Web Build Version Endpoint
 * Returns the web app's build identity for verification.
 * 
 * GET /api/version
 */
export async function GET() {
  return NextResponse.json({
    service: 'web',
    version: '0.1.0',
    gitSha: buildInfo.gitSha,
    buildTime: buildInfo.buildTime,
    buildId: buildInfo.buildId,
    environment: buildInfo.environment,
    vercelEnv: buildInfo.vercelEnv,
  });
}
