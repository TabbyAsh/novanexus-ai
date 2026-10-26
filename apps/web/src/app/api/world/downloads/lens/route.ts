import { NextResponse } from 'next/server';
import { readWorldSession } from '@/lib/world/session.server';
import { PRIVATE_HEADERS } from '@/lib/world/access';
import { lensZip, lensSha256 } from '@/lib/world/lens-package.server';
export const dynamic = 'force-dynamic';
export async function GET() {
  const access = await readWorldSession();
  if (!access.ok) return NextResponse.json({ error: access.status === 503 ? 'Authentication service unavailable.' : 'Private workspace sign-in required.' }, { status: access.status, headers: PRIVATE_HEADERS });
  return new NextResponse(Buffer.from(lensZip, 'base64'), { headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="Nova-Lens-0.2.1.zip"', 'X-Content-SHA256': lensSha256 } });
}
