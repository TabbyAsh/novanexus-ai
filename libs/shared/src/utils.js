"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateId = generateId;
exports.nowTimestamp = nowTimestamp;
exports.computeEventHash = computeEventHash;
exports.sleep = sleep;
exports.retry = retry;
exports.safeJsonParse = safeJsonParse;
exports.deepClone = deepClone;
exports.isDefined = isDefined;
exports.omit = omit;
exports.pick = pick;
exports.formatCurrency = formatCurrency;
exports.percentChange = percentChange;
exports.clamp = clamp;
exports.hashObject = hashObject;
const crypto_1 = require("crypto");
/**
 * Generate a UUID v4
 */
function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
/**
 * Get current timestamp in ISO 8601 format
 */
function nowTimestamp() {
    return new Date().toISOString();
}
/**
 * Compute SHA-256 hash for event chaining
 */
function computeEventHash(prevHash, payload, type, ts, actorType, actorId) {
    const canonical = JSON.stringify({
        prevHash,
        payload,
        type,
        ts,
        actorType,
        actorId,
    });
    return (0, crypto_1.createHash)('sha256').update(canonical).digest('hex');
}
/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Retry a function with exponential backoff
 */
async function retry(fn, options = {}) {
    const { maxAttempts = 3, baseDelayMs = 1000, maxDelayMs = 30000 } = options;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt === maxAttempts) {
                break;
            }
            const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
            await sleep(delay);
        }
    }
    throw lastError;
}
/**
 * Safely parse JSON with a fallback
 */
function safeJsonParse(json, fallback) {
    try {
        return JSON.parse(json);
    }
    catch {
        return fallback;
    }
}
/**
 * Deep clone an object
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
/**
 * Check if a value is defined (not null or undefined)
 */
function isDefined(value) {
    return value !== null && value !== undefined;
}
/**
 * Omit keys from an object
 */
function omit(obj, keys) {
    const result = { ...obj };
    for (const key of keys) {
        delete result[key];
    }
    return result;
}
/**
 * Pick keys from an object
 */
function pick(obj, keys) {
    const result = {};
    for (const key of keys) {
        if (key in obj) {
            result[key] = obj[key];
        }
    }
    return result;
}
/**
 * Format currency value
 */
function formatCurrency(value, currency = 'USD', locale = 'en-US') {
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
    }).format(value);
}
/**
 * Calculate percentage change
 */
function percentChange(oldValue, newValue) {
    if (oldValue === 0)
        return newValue === 0 ? 0 : Infinity;
    return ((newValue - oldValue) / Math.abs(oldValue)) * 100;
}
/**
 * Clamp a number between min and max
 */
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
/**
 * Generate a deterministic hash for caching purposes
 */
function hashObject(obj) {
    const canonical = JSON.stringify(obj, Object.keys(obj).sort());
    return (0, crypto_1.createHash)('md5').update(canonical).digest('hex');
}
