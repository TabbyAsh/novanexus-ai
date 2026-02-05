"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = signAccessToken;
exports.signRefreshToken = signRefreshToken;
exports.generateTokenPair = generateTokenPair;
exports.verifyToken = verifyToken;
exports.decodeToken = decodeToken;
exports.isTokenExpired = isTokenExpired;
exports.getDefaultScopes = getDefaultScopes;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'nova-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN || '7d';
/**
 * Sign a JWT access token
 */
function signAccessToken(payload) {
    const options = { expiresIn: JWT_EXPIRES_IN };
    return jsonwebtoken_1.default.sign({ ...payload, type: 'access' }, JWT_SECRET, options);
}
/**
 * Sign a JWT refresh token
 */
function signRefreshToken(payload) {
    const options = { expiresIn: REFRESH_TOKEN_EXPIRES_IN };
    return jsonwebtoken_1.default.sign({ ...payload, type: 'refresh' }, JWT_SECRET, options);
}
/**
 * Generate both access and refresh tokens
 */
function generateTokenPair(payload) {
    return {
        accessToken: signAccessToken(payload),
        refreshToken: signRefreshToken(payload),
        expiresIn: parseExpiresIn(JWT_EXPIRES_IN),
    };
}
/**
 * Verify and decode a JWT token
 */
function verifyToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        return decoded;
    }
    catch (error) {
        return null;
    }
}
/**
 * Decode a JWT token without verification (for debugging)
 */
function decodeToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.decode(token);
        return decoded;
    }
    catch (error) {
        return null;
    }
}
/**
 * Check if token is expired
 */
function isTokenExpired(token) {
    const decoded = decodeToken(token);
    if (!decoded)
        return true;
    const payload = decoded;
    if (!payload.exp)
        return true;
    return Date.now() >= payload.exp * 1000;
}
/**
 * Parse expires in string to seconds
 */
function parseExpiresIn(expiresIn) {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match)
        return 3600; // default 1 hour
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
function getDefaultScopes(role) {
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
