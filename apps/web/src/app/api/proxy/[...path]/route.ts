import { NextRequest, NextResponse } from 'next/server';
import { resolveBackendUrl } from '@/lib/backend-url';
import { requestIdFor } from '@/lib/request-id';

// Headers to forward from client
const FORWARD_HEADERS = ['authorization', 'content-type', 'accept', 'x-request-id'];

// Headers to NOT forward back (hop-by-hop)
const STRIP_RESPONSE_HEADERS = ['transfer-encoding', 'connection', 'keep-alive', 'x-powered-by'];

async function proxyRequest(request: NextRequest, params: { path: string[] }) {
  const requestId = requestIdFor(request.headers.get('x-request-id'));
  const backendUrl = resolveBackendUrl();
  if (!backendUrl) {
    const response = NextResponse.json(
      {
        success: false,
        error: {
          code: 'BACKEND_NOT_CONFIGURED',
          message: 'This deployment is not connected to a Nova backend.',
        },
      },
      { status: 503 },
    );
    response.headers.set('X-Request-ID', requestId);
    return response;
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
    if (name === 'x-request-id') return;
    const value = request.headers.get(name);
    if (value) {
      headers[name] = value;
    }
  });
  headers['x-request-id'] = requestId;

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
    responseHeaders.set('X-Request-ID', requestIdFor(response.headers.get('x-request-id'), () => requestId));

    // Get response body
    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`[Proxy Error] requestId=${requestId}`, error);
    const response = NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 'PROXY_ERROR', 
          message: 'The Nova backend could not be reached.'
        } 
      },
      { status: 502 }
    );
    response.headers.set('X-Request-ID', requestId);
    return response;
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
