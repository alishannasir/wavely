import type Redis from 'ioredis';

/**
 * Fixed-window counter in Redis: true while `key` has been used `limit` times or fewer in the current `windowSec` seconds.
 * Used for socket events, which the HTTP throttler does not see. If Redis is unreachable it lets the request through:
 * a limiter must not take the chat down with it.
 */
export async function withinLimit(redis: Redis, key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSec);
    return n <= limit;
  } catch {
    return true;
  }
}
