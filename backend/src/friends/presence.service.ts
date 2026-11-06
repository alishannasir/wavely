import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

// ZSET userId -> time of the last heartbeat (ms). A new key name: the old one was a plain set.
const ONLINE_KEY = 'presence:online:v2';
const SOCKET_SET_TTL_SEC = 24 * 60 * 60;
/** A user whose API instance stopped refreshing them (crash, deploy) is offline after this long. */
export const PRESENCE_STALE_MS = 2 * 60 * 1000;

/**
 * A user is online while at least one of their sockets is connected AND some API instance keeps
 * refreshing their heartbeat (`touch`). Heartbeats make presence self-heal after a crash.
 */
@Injectable()
export class PresenceService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key(userId: string) {
    return `presence:sockets:${userId}`;
  }

  async markOnline(userId: string, socketId: string): Promise<void> {
    await this.redis
      .multi()
      .sadd(this.key(userId), socketId)
      .expire(this.key(userId), SOCKET_SET_TTL_SEC)
      .zadd(ONLINE_KEY, Date.now(), userId)
      .exec();
  }

  /** Removes one socket; the user goes offline only when their last socket is gone. */
  async markOffline(userId: string, socketId: string): Promise<void> {
    await this.redis.srem(this.key(userId), socketId);
    if ((await this.redis.scard(this.key(userId))) === 0) {
      await this.redis.zrem(ONLINE_KEY, userId);
    }
  }

  /** Heartbeat for users with a socket on THIS instance, plus cleanup of entries nobody refreshes. */
  async heartbeat(userIds: string[]): Promise<void> {
    const now = Date.now();
    const m = this.redis.multi();
    for (const id of new Set(userIds)) m.zadd(ONLINE_KEY, now, id);
    m.zremrangebyscore(ONLINE_KEY, '-inf', now - PRESENCE_STALE_MS);
    await m.exec();
  }

  async isOnline(userId: string): Promise<boolean> {
    const score = await this.redis.zscore(ONLINE_KEY, userId);
    return score !== null && Number(score) > Date.now() - PRESENCE_STALE_MS;
  }

  async onlineMap(userIds: string[]): Promise<Record<string, boolean>> {
    const cutoff = Date.now() - PRESENCE_STALE_MS;
    const scores = await Promise.all(userIds.map((id) => this.redis.zscore(ONLINE_KEY, id)));
    return Object.fromEntries(userIds.map((id, i) => [id, scores[i] !== null && Number(scores[i]) > cutoff]));
  }

  async onlineCount(): Promise<number> {
    return this.redis.zcount(ONLINE_KEY, Date.now() - PRESENCE_STALE_MS, '+inf');
  }
}
