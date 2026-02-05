import { RedisClientType } from 'redis';
export declare function getRedis(): Promise<RedisClientType>;
export declare function closeRedis(): Promise<void>;
export declare function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
}>;
export declare function cacheGet<T>(key: string): Promise<T | null>;
export declare function cacheSet(key: string, value: any, ttlSeconds?: number): Promise<void>;
export declare function cacheDel(key: string): Promise<void>;
