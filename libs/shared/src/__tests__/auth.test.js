"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jwt_1 = require("../jwt");
describe('JWT Functions', () => {
    const mockPayload = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        orgId: '123e4567-e89b-12d3-a456-426614174001',
        role: 'OWNER',
        scopes: ['trade.read', 'admin.users'],
    };
    describe('signAccessToken', () => {
        it('should generate a valid access token', () => {
            const token = (0, jwt_1.signAccessToken)(mockPayload);
            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.split('.').length).toBe(3); // JWT format
        });
        it('should include type: access in token', () => {
            const token = (0, jwt_1.signAccessToken)(mockPayload);
            const decoded = (0, jwt_1.decodeToken)(token);
            expect(decoded?.type).toBe('access');
        });
    });
    describe('signRefreshToken', () => {
        it('should generate a valid refresh token', () => {
            const token = (0, jwt_1.signRefreshToken)(mockPayload);
            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
        });
        it('should include type: refresh in token', () => {
            const token = (0, jwt_1.signRefreshToken)(mockPayload);
            const decoded = (0, jwt_1.decodeToken)(token);
            expect(decoded?.type).toBe('refresh');
        });
    });
    describe('generateTokenPair', () => {
        it('should generate both access and refresh tokens', () => {
            const tokens = (0, jwt_1.generateTokenPair)(mockPayload);
            expect(tokens.accessToken).toBeDefined();
            expect(tokens.refreshToken).toBeDefined();
            expect(tokens.expiresIn).toBeGreaterThan(0);
        });
        it('should generate different access and refresh tokens', () => {
            const tokens = (0, jwt_1.generateTokenPair)(mockPayload);
            expect(tokens.accessToken).not.toBe(tokens.refreshToken);
        });
    });
    describe('verifyToken', () => {
        it('should verify a valid access token', () => {
            const token = (0, jwt_1.signAccessToken)(mockPayload);
            const verified = (0, jwt_1.verifyToken)(token);
            expect(verified).not.toBeNull();
            expect(verified?.userId).toBe(mockPayload.userId);
            expect(verified?.orgId).toBe(mockPayload.orgId);
            expect(verified?.role).toBe(mockPayload.role);
        });
        it('should return null for invalid token', () => {
            const verified = (0, jwt_1.verifyToken)('invalid.token.here');
            expect(verified).toBeNull();
        });
        it('should return null for empty token', () => {
            const verified = (0, jwt_1.verifyToken)('');
            expect(verified).toBeNull();
        });
    });
    describe('decodeToken', () => {
        it('should decode token without verification', () => {
            const token = (0, jwt_1.signAccessToken)(mockPayload);
            const decoded = (0, jwt_1.decodeToken)(token);
            expect(decoded).not.toBeNull();
            expect(decoded?.userId).toBe(mockPayload.userId);
        });
        it('should return null for invalid token', () => {
            const decoded = (0, jwt_1.decodeToken)('not-a-valid-jwt');
            expect(decoded).toBeNull();
        });
    });
    describe('isTokenExpired', () => {
        it('should return false for fresh token', () => {
            const token = (0, jwt_1.signAccessToken)(mockPayload);
            expect((0, jwt_1.isTokenExpired)(token)).toBe(false);
        });
        it('should return true for invalid token', () => {
            expect((0, jwt_1.isTokenExpired)('invalid')).toBe(true);
        });
    });
});
describe('RBAC Functions', () => {
    describe('getDefaultScopes', () => {
        it('should return all scopes for OWNER role', () => {
            const scopes = (0, jwt_1.getDefaultScopes)('OWNER');
            expect(scopes).toContain('admin.killswitch');
            expect(scopes).toContain('admin.billing');
            expect(scopes).toContain('trade.live.execute');
            expect(scopes.length).toBeGreaterThan(20);
        });
        it('should return limited scopes for VIEWER role', () => {
            const scopes = (0, jwt_1.getDefaultScopes)('VIEWER');
            expect(scopes).toContain('trade.read');
            expect(scopes).not.toContain('trade.paper.execute');
            expect(scopes).not.toContain('admin.killswitch');
        });
        it('should return appropriate scopes for ADMIN role', () => {
            const scopes = (0, jwt_1.getDefaultScopes)('ADMIN');
            expect(scopes).toContain('admin.users');
            expect(scopes).not.toContain('admin.killswitch');
            expect(scopes).toContain('trade.paper.execute');
        });
        it('should return paper trading for MEMBER role', () => {
            const scopes = (0, jwt_1.getDefaultScopes)('MEMBER');
            expect(scopes).toContain('trade.paper.execute');
            expect(scopes).not.toContain('trade.live.execute');
        });
        it('should return BOT scopes correctly', () => {
            const scopes = (0, jwt_1.getDefaultScopes)('BOT');
            expect(scopes).toContain('trade.read');
            expect(scopes).toContain('trade.paper.execute');
            expect(scopes).not.toContain('admin.users');
        });
        it('should return empty array for invalid role', () => {
            const scopes = (0, jwt_1.getDefaultScopes)('INVALID');
            expect(scopes).toEqual([]);
        });
    });
});
describe('Role Hierarchy', () => {
    const roleHierarchy = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'];
    it('should have OWNER with most scopes', () => {
        const ownerScopes = (0, jwt_1.getDefaultScopes)('OWNER');
        const adminScopes = (0, jwt_1.getDefaultScopes)('ADMIN');
        expect(ownerScopes.length).toBeGreaterThan(adminScopes.length);
    });
    it('should have each role with progressively fewer scopes', () => {
        let prevCount = Infinity;
        for (const role of roleHierarchy) {
            const scopes = (0, jwt_1.getDefaultScopes)(role);
            expect(scopes.length).toBeLessThanOrEqual(prevCount);
            prevCount = scopes.length;
        }
    });
    it('should not allow non-owners to use killswitch', () => {
        for (const role of roleHierarchy.slice(1)) {
            const scopes = (0, jwt_1.getDefaultScopes)(role);
            expect(scopes).not.toContain('admin.killswitch');
        }
    });
});
