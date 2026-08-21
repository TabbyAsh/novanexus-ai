import type { JWTPayload } from '@nova/shared';
import { contactRateLimitKey } from './contact-rate-limit';

interface RateLimitRequest {
  auth?: Pick<JWTPayload, 'userId' | 'orgId'>;
  ip?: string;
  headers: Record<string, unknown>;
  socket?: { remoteAddress?: string | null };
}

function keyPart(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Build a rate-limit identity without trusting an unverified bearer token.
 * `auth` is populated only after the gateway verifies an access token; all
 * anonymous traffic is therefore isolated by its network identity.
 */
export function requestRateLimitKey(req: RateLimitRequest): string {
  if (req.auth?.userId) {
    return `org:${keyPart(req.auth.orgId || 'none')}:user:${keyPart(req.auth.userId)}`;
  }

  return `ip:${contactRateLimitKey(req)}`;
}
