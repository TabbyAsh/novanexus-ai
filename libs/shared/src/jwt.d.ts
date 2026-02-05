import type { UUID, UserRole, Scope } from './types';
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
export declare function signAccessToken(payload: Omit<JWTPayload, 'type'>): string;
/**
 * Sign a JWT refresh token
 */
export declare function signRefreshToken(payload: Omit<JWTPayload, 'type'>): string;
/**
 * Generate both access and refresh tokens
 */
export declare function generateTokenPair(payload: Omit<JWTPayload, 'type'>): TokenPair;
/**
 * Verify and decode a JWT token
 */
export declare function verifyToken(token: string): JWTPayload | null;
/**
 * Decode a JWT token without verification (for debugging)
 */
export declare function decodeToken(token: string): JWTPayload | null;
/**
 * Check if token is expired
 */
export declare function isTokenExpired(token: string): boolean;
/**
 * Get default scopes for a role
 */
export declare function getDefaultScopes(role: UserRole): Scope[];
