import { Redis } from '@upstash/redis';

// In-Memory L1 Cache Entry
interface CacheEntry<T = any> {
  value: T;
  expiresAt: number;
}

// In-memory L1 cache for sub-millisecond responses and fallback
const l1Cache = new Map<string, CacheEntry>();
const MAX_L1_ENTRIES = 1000;

function cleanupL1() {
  const now = Date.now();
  for (const [key, entry] of l1Cache.entries()) {
    if (entry.expiresAt <= now) {
      l1Cache.delete(key);
    }
  }
  if (l1Cache.size > MAX_L1_ENTRIES) {
    const keysToDelete = Array.from(l1Cache.keys()).slice(0, 200);
    for (const k of keysToDelete) {
      l1Cache.delete(k);
    }
  }
}

// Initialize Upstash Redis client
let redisClient: Redis | null = null;
let isReadOnlyWarningLogged = false;

function getRedisInstance(): Redis | null {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  try {
    redisClient = new Redis({
      url,
      token,
    });
    return redisClient;
  } catch (err) {
    console.error('[Redis] Failed to initialize Upstash client:', err);
    return null;
  }
}

/**
 * Retrieve value from L1 memory cache first, then Redis L2.
 */
export async function getCache<T = any>(key: string): Promise<T | null> {
  const now = Date.now();

  // 1. Check Fast L1 Memory Cache (0.002ms)
  const memoryHit = l1Cache.get(key);
  if (memoryHit) {
    if (memoryHit.expiresAt > now) {
      return memoryHit.value as T;
    }
    l1Cache.delete(key);
  }

  // 2. Check Upstash Redis L2 Cache
  const redis = getRedisInstance();
  if (!redis) return null;

  try {
    const data = await redis.get<T>(key);
    if (data !== null && data !== undefined) {
      // Backfill into L1 with default short TTL (30s)
      l1Cache.set(key, { value: data, expiresAt: now + 30000 });
      return data;
    }
    return null;
  } catch (err: any) {
    console.warn(`[Redis] GET error for key ${key}:`, err?.message || err);
    return null;
  }
}

/**
 * Set value into L1 memory cache and Redis L2 with TTL (seconds).
 */
export async function setCache(key: string, value: any, ttlSeconds: number = 300): Promise<boolean> {
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;

  // 1. Save to L1 Memory Cache
  cleanupL1();
  l1Cache.set(key, { value, expiresAt });

  // 2. Save to Upstash Redis L2 Cache
  const redis = getRedisInstance();
  if (!redis) return true;

  try {
    await redis.set(key, value, { ex: ttlSeconds });
    return true;
  } catch (err: any) {
    // If user provided a Read-Only token (NOPERM), keep L1 cache active and log warning once
    if (err?.message?.includes('NOPERM')) {
      if (!isReadOnlyWarningLogged) {
        console.warn(
          '[Redis] Notice: The current Upstash Redis token is READ-ONLY. Data is safely cached in L1 memory. Provide the read-write token (user "default") to persist in Redis L2.'
        );
        isReadOnlyWarningLogged = true;
      }
      return true;
    }
    console.warn(`[Redis] SET error for key ${key}:`, err?.message || err);
    return false;
  }
}

/**
 * Delete key from L1 memory cache and Redis L2.
 */
export async function deleteCache(key: string): Promise<boolean> {
  l1Cache.delete(key);

  const redis = getRedisInstance();
  if (!redis) return true;

  try {
    await redis.del(key);
    return true;
  } catch (err: any) {
    return false;
  }
}

/**
 * Helper to wrap any expensive function (e.g. database query) with caching.
 */
export async function cachedFetch<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await getCache<T>(key);
  if (cached !== null && cached !== undefined) {
    return cached;
  }

  const fresh = await fetcher();
  if (fresh !== null && fresh !== undefined) {
    await setCache(key, fresh, ttlSeconds);
  }
  return fresh;
}

export const redis = getRedisInstance();
