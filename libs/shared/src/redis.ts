import { createClient, RedisClientType } from 'redis';

let client: RedisClientType | null = null;

export async function getRedis(): Promise<RedisClientType> {
  if (!client) {
    client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    client.on('error', (err) => {
      console.error('Redis client error:', err);
    });

    await client.connect();
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}

// Rate limiting helper
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
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
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = await getRedis();
  const value = await redis.get(key);
  return value ? JSON.parse(value) : null;
}

export async function cacheSet(key: string, value: any, ttlSeconds?: number): Promise<void> {
  const redis = await getRedis();
  const serialized = JSON.stringify(value);
  if (ttlSeconds) {
    await redis.setEx(key, ttlSeconds, serialized);
  } else {
    await redis.set(key, serialized);
  }
}

export async function cacheDel(key: string): Promise<void> {
  const redis = await getRedis();
  await redis.del(key);
}
