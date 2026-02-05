"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedis = getRedis;
exports.closeRedis = closeRedis;
exports.checkRateLimit = checkRateLimit;
exports.cacheGet = cacheGet;
exports.cacheSet = cacheSet;
exports.cacheDel = cacheDel;
const redis_1 = require("redis");
let client = null;
async function getRedis() {
    if (!client) {
        client = (0, redis_1.createClient)({
            url: process.env.REDIS_URL || 'redis://localhost:6379',
        });
        client.on('error', (err) => {
            console.error('Redis client error:', err);
        });
        await client.connect();
    }
    return client;
}
async function closeRedis() {
    if (client) {
        await client.quit();
        client = null;
    }
}
// Rate limiting helper
async function checkRateLimit(key, limit, windowSeconds) {
    const redis = await getRedis();
    const now = Math.floor(Date.now() / 1000);
    const windowKey = `ratelimit:${key}:${Math.floor(now / windowSeconds)}`;
    const count = await redis.incr(windowKey);
    if (count === 1) {
        await redis.expire(windowKey, windowSeconds);
    }
    const remaining = Math.max(0, limit - count);
    const resetAt = (Math.floor(now / windowSeconds) + 1) * windowSeconds;
    return {
        allowed: count <= limit,
        remaining,
        resetAt,
    };
}
// Cache helpers
async function cacheGet(key) {
    const redis = await getRedis();
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
}
async function cacheSet(key, value, ttlSeconds) {
    const redis = await getRedis();
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
        await redis.setEx(key, ttlSeconds, serialized);
    }
    else {
        await redis.set(key, serialized);
    }
}
async function cacheDel(key) {
    const redis = await getRedis();
    await redis.del(key);
}
