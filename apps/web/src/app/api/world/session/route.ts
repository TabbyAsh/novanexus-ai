import { NextRequest, NextResponse } from 'next/server';
import { isSameOrigin, PRIVATE_HEADERS, verifyWorldToken, WORLD_COOKIE } from '@/lib/world/access';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Same-origin sign-in required.' }, { status: 403, headers: PRIVATE_HEADERS });
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  const access = await verifyWorldToken(token);
  const response = NextResponse.json(access.ok ? { ok: true } : { error: access.status === 503 ? 'Authentication service is unavailable. Try again shortly.' : access.status === 403 ? 'This account does not have private workspace access.' : 'Sign in again to continue.' }, { status: access.ok ? 200 : access.status, headers: PRIVATE_HEADERS });
  response.cookies.set(WORLD_COOKIE, access.ok ? token! : '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: access.ok ? 900 : 0 });
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Same-origin sign-out required.' }, { status: 403, headers: PRIVATE_HEADERS });
  const response = NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
  response.cookies.set(WORLD_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 });
  return response;
}
