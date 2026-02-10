import { NextResponse } from 'next/server';

/**
 * Web Build Version Endpoint
 * Returns the web app's build identity for verification.
 * 
 * GET /api/version
 */
export async function GET() {
  const gitSha = process.env.NEXT_PUBLIC_GIT_SHA || 'dev';
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME || 'unknown';
  
  return NextResponse.json({
    service: 'web',
    version: '0.1.0',
    gitSha,
    buildTime,
    environment: process.env.NODE_ENV || 'development',
    // Include Vercel-specific info if available
    vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    vercelEnv: process.env.VERCEL_ENV || null,
  });
}
