/**
 * Generate a UUID v4
 */
export declare function generateId(): string;
/**
 * Get current timestamp in ISO 8601 format
 */
export declare function nowTimestamp(): string;
/**
 * Compute SHA-256 hash for event chaining
 */
export declare function computeEventHash(prevHash: string, payload: Record<string, unknown>, type: string, ts: string, actorType: string, actorId: string): string;
/**
 * Sleep for a specified number of milliseconds
 */
export declare function sleep(ms: number): Promise<void>;
/**
 * Retry a function with exponential backoff
 */
export declare function retry<T>(fn: () => Promise<T>, options?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
}): Promise<T>;
/**
 * Safely parse JSON with a fallback
 */
export declare function safeJsonParse<T>(json: string, fallback: T): T;
/**
 * Deep clone an object
 */
export declare function deepClone<T>(obj: T): T;
/**
 * Check if a value is defined (not null or undefined)
 */
export declare function isDefined<T>(value: T | null | undefined): value is T;
/**
 * Omit keys from an object
 */
export declare function omit<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K>;
/**
 * Pick keys from an object
 */
export declare function pick<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>;
/**
 * Format currency value
 */
export declare function formatCurrency(value: number, currency?: string, locale?: string): string;
/**
 * Calculate percentage change
 */
export declare function percentChange(oldValue: number, newValue: number): number;
/**
 * Clamp a number between min and max
 */
export declare function clamp(value: number, min: number, max: number): number;
/**
 * Generate a deterministic hash for caching purposes
 */
export declare function hashObject(obj: Record<string, unknown>): string;
