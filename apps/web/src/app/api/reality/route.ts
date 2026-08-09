import { NextResponse } from 'next/server';
import buildInfo from '@/build-info.json';
import { resolveBackendUrl } from '@/lib/backend-url';

export async function GET(request: Request) {
  const host = request.headers.get('host') || 'unknown';
  const backendUrl = resolveBackendUrl();
  if (!backendUrl) {
    return NextResponse.json({
      host,
      webGitSha: buildInfo.gitSha || 'dev',
      webBuildTime: buildInfo.buildTime || 'unknown',
      apiBaseUrl: '/api/proxy',
      backendConfigured: false,
      apiGitSha: 'unknown',
      mismatch: false,
      apiError: 'This deployment is not connected to a Nova backend.',
    }, { status: 503 });
  }
  
  // Fetch backend version directly (server-side)
  let apiGitSha = 'unknown';
  let apiError: string | null = null;
  
  try {
    const response = await fetch(`${backendUrl}/version`, {
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
    backendConfigured: true,
    apiGitSha,
    mismatch,
    ...(apiError && { apiError }),
  });
}
