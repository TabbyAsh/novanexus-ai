import jwt, { SignOptions } from 'jsonwebtoken';
import type { UUID, UserRole, Scope } from './types';

const JWT_SECRET = process.env.JWT_SECRET || 'nova-dev-secret-change-in-production';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '1h';
const REFRESH_TOKEN_EXPIRES_IN: string = process.env.REFRESH_EXPIRES_IN || '7d';

export interface JWTPayload {
  userId: UUID;
  orgId: UUID;
  role: UserRole;
  scopes: Scope[];
  type: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Sign a JWT access token
 */
export function signAccessToken(payload: Omit<JWTPayload, 'type'>): string {
  const options: SignOptions = { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] };
  return jwt.sign(
    { ...payload, type: 'access' },
    JWT_SECRET,
    options
  );
}

/**
 * Sign a JWT refresh token
 */
export function signRefreshToken(payload: Omit<JWTPayload, 'type'>): string {
  const options: SignOptions = { expiresIn: REFRESH_TOKEN_EXPIRES_IN as jwt.SignOptions['expiresIn'] };
  return jwt.sign(
    { ...payload, type: 'refresh' },
    JWT_SECRET,
    options
  );
}

/**
 * Generate both access and refresh tokens
 */
export function generateTokenPair(payload: Omit<JWTPayload, 'type'>): TokenPair {
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    expiresIn: parseExpiresIn(JWT_EXPIRES_IN),
  };
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Decode a JWT token without verification (for debugging)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.decode(token) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token);
  if (!decoded) return true;
  
  const payload = decoded as any;
  if (!payload.exp) return true;
  
  return Date.now() >= payload.exp * 1000;
}

/**
 * Parse expires in string to seconds
 */
function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 3600; // default 1 hour
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return 3600;
  }
}

/**
 * Get default scopes for a role
 */
export function getDefaultScopes(role: UserRole): Scope[] {
  switch (role) {
    case 'OWNER':
      return [
        'trade.read', 'trade.paper.execute', 'trade.live.execute', 'trade.backtest',
        'store.read', 'store.write', 'store.pricing', 'store.orders',
        'social.read', 'social.schedule', 'social.post',
        'research.read', 'research.write', 'research.propose',
        'forge.read', 'forge.propose', 'forge.approve',
        'ops.read', 'ops.deploy', 'ops.admin',
        'admin.users', 'admin.billing', 'admin.killswitch', 'admin.audit',
      ];
    case 'ADMIN':
      return [
        'trade.read', 'trade.paper.execute', 'trade.backtest',
        'store.read', 'store.write', 'store.pricing', 'store.orders',
        'social.read', 'social.schedule', 'social.post',
        'research.read', 'research.write', 'research.propose',
        'forge.read', 'forge.propose',
        'ops.read', 'ops.deploy',
        'admin.users', 'admin.audit',
      ];
    case 'MEMBER':
      return [
        'trade.read', 'trade.paper.execute', 'trade.backtest',
        'store.read', 'store.write',
        'social.read', 'social.schedule',
        'research.read', 'research.write',
        'forge.read',
        'ops.read',
      ];
    case 'VIEWER':
      return [
        'trade.read',
        'store.read',
        'social.read',
        'research.read',
        'ops.read',
      ];
    case 'BOT':
      return [
        'trade.read', 'trade.paper.execute', 'trade.backtest',
        'store.read', 'store.write',
        'social.read',
        'research.read', 'research.write',
      ];
    default:
      return [];
  }
}
