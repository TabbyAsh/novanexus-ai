import { NextResponse } from 'next/server';
import buildInfo from '@/build-info.json';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.novanexus-ai.com';

export async function GET(request: Request) {
  const host = request.headers.get('host') || 'unknown';
  
  // Fetch backend version
  let apiGitSha = 'unknown';
  let apiError: string | null = null;
  
  try {
    const response = await fetch(`${GATEWAY_URL}/version`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      apiGitSha = data.gitSha || data.version || 'unknown';
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
    apiBaseUrl: GATEWAY_URL,
    apiGitSha,
    mismatch,
    ...(apiError && { apiError }),
  });
}
