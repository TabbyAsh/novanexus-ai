import { createHash } from 'crypto';

/**
 * Generate a UUID v4
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get current timestamp in ISO 8601 format
 */
export function nowTimestamp(): string {
  return new Date().toISOString();
}

// Crockford's Base32 alphabet (excludes I, L, O, U to avoid ambiguity)
const ULID_ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_TIME_LEN = 10;
const ULID_RANDOM_LEN = 16;

/**
 * Generate a ULID — Universally Unique Lexicographically Sortable Identifier.
 * 48-bit timestamp + 80-bit randomness, Crockford Base32 encoded.
 * Used as the canonical ID for Decision Cards so they sort by creation time.
 */
export function ulid(seedTime?: number): string {
  const time = seedTime ?? Date.now();

  let timeChars = '';
  let t = time;
  for (let i = ULID_TIME_LEN - 1; i >= 0; i--) {
    const mod = t % 32;
    timeChars = ULID_ENCODING[mod] + timeChars;
    t = (t - mod) / 32;
  }

  let randChars = '';
  for (let i = 0; i < ULID_RANDOM_LEN; i++) {
    randChars += ULID_ENCODING[Math.floor(Math.random() * 32)];
  }

  return timeChars + randChars;
}

/**
 * Compute SHA-256 hash for event chaining
 */
export function computeEventHash(
  prevHash: string,
  payload: Record<string, unknown>,
  type: string,
  ts: string,
  actorType: string,
  actorId: string
): string {
  const canonical = JSON.stringify({
    prevHash,
    payload,
    type,
    ts,
    actorType,
    actorId,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000, maxDelayMs = 30000 } = options;
  
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
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
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if a value is defined (not null or undefined)
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Omit keys from an object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/**
 * Pick keys from an object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
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
export function formatCurrency(
  value: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(value);
}

/**
 * Calculate percentage change
 */
export function percentChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return newValue === 0 ? 0 : Infinity;
  return ((newValue - oldValue) / Math.abs(oldValue)) * 100;
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Generate a deterministic hash for caching purposes
 */
export function hashObject(obj: Record<string, unknown>): string {
  const canonical = JSON.stringify(obj, Object.keys(obj).sort());
  return createHash('md5').update(canonical).digest('hex');
}
