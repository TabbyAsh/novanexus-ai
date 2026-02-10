import { NextResponse } from 'next/server';
import buildInfo from '@/build-info.json';

// Direct backend URL for server-side checks
const BACKEND_URL = process.env.BACKEND_URL || 'https://abackend-production.up.railway.app';

export async function GET(request: Request) {
  const host = request.headers.get('host') || 'unknown';
  
  // Fetch backend version directly (server-side)
  let apiGitSha = 'unknown';
  let apiError: string | null = null;
  
  try {
    const response = await fetch(`${BACKEND_URL}/version`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      apiGitSha = data.gitSha || data.commitSha || data.buildId || 'unknown';
    } else {
      apiError = `Backend returned ${response.status}`;
    }
  } catch (error) {
    apiError = error instanceof Error ? error.message : 'Failed to reach backend';
  }

  const webGitSha = buildInfo.gitSha || 'dev';
  const webBuildTime = buildInfo.buildTime || 'unknown';
  
  // Check for mismatch (first 7 chars)
  const webShort = webGitSha.substring(0, 7);
  const apiShort = apiGitSha.substring(0, 7);
  const mismatch = webGitSha !== 'dev' && apiGitSha !== 'unknown' && webShort !== apiShort;

  return NextResponse.json({
    host,
    webGitSha,
    webBuildTime,
    apiBaseUrl: '/api/proxy',  // Client uses same-origin proxy
    backendUrl: BACKEND_URL,   // Actual backend (for debugging)
    apiGitSha,
    mismatch,
    ...(apiError && { apiError }),
  });
}
