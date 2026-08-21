import { NextRequest, NextResponse } from 'next/server';
import { resolveBackendUrl } from '@/lib/backend-url';

// Headers to forward from client
const FORWARD_HEADERS = ['authorization', 'content-type', 'accept', 'x-request-id', 'idempotency-key'];

// Headers to NOT forward back (hop-by-hop)
const STRIP_RESPONSE_HEADERS = ['transfer-encoding', 'connection', 'keep-alive'];

async function proxyRequest(request: NextRequest, params: { path: string[] }) {
  const backendUrl = resolveBackendUrl();
  if (!backendUrl) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'BACKEND_NOT_CONFIGURED',
          message: 'This deployment is not connected to a Nova backend.',
        },
      },
      { status: 503 },
    );
  }

  const path = '/' + params.path.join('/');
  const url = new URL(path, backendUrl);
  
  // Forward query params
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  // Build headers to forward
  const headers: Record<string, string> = {};
  FORWARD_HEADERS.forEach(name => {
    const value = request.headers.get(name);
    if (value) {
      headers[name] = value;
    }
  });

  // Make the request to backend
  try {
    const response = await fetch(url.toString(), {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' 
        ? await request.text() 
        : undefined,
      // Don't follow redirects - let client handle them
      redirect: 'manual',
    });

    // Build response headers
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (!STRIP_RESPONSE_HEADERS.includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    responseHeaders.set('X-Nova-Proxy', 'same-origin');

    // Get response body
    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[Proxy Error]', error);
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 'PROXY_ERROR', 
          message: error instanceof Error ? error.message : 'Backend unreachable' 
        } 
      },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxyRequest(request, params);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxyRequest(request, params);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxyRequest(request, params);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxyRequest(request, params);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxyRequest(request, params);
}
