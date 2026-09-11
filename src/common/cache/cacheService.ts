import Redis from 'ioredis';
import { logger } from '../observability/logger';

/**
 * A small cache-aside wrapper around ioredis. `getOrSet` is the one method
 * most callers need: check the cache, and on a miss, compute the value,
 * store it, and return it -- the pattern used by
 * `ProjectsService.listForOrganization` (see projects.repository.ts) to
 * cache a tenant's project list.
 *
 * Deliberately NOT a generic "cache everything" layer -- only reads that
 * are (a) expensive relative to a cache lookup and (b) tolerant of being up
 * to `ttlSeconds` stale are worth wrapping. Every write path that could
 * invalidate a cached value calls `invalidate()` explicitly rather than
 * relying on TTL expiry alone, so cache staleness after a write is bounded
 * by "immediately", not "up to ttlSeconds".
 */
export class CacheService {
  constructor(private readonly redis: Redis) {}

  async getOrSet<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
    try {
      const cached = await this.redis.get(key);
      if (cached !== null) {
        return { value: JSON.parse(cached) as T, hit: true };
      }
    } catch (err) {
      // A Redis outage should degrade to "always compute", not take the
      // whole API down -- caching is a performance optimization, not a
      // correctness dependency.
      logger.warn({ err, key }, 'Cache read failed, falling through to compute()');
    }

    const value = await compute();

    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      logger.warn({ err, key }, 'Cache write failed (value still returned to caller)');
    }

    return { value, hit: false };
  }

  async invalidate(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      logger.warn({ err, key }, 'Cache invalidation failed');
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (err) {
      logger.warn({ err, pattern }, 'Cache pattern invalidation failed');
    }
  }
}

export function createRedisClient(): Redis {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  return new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false });
}
