import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

const ONLINE_KEY = 'presence:online';
const SOCKETS_KEY = 'presence:sockets';

@Injectable()
export class PresenceService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async markOnline(userId: string, socketId: string): Promise<void> {
    await Promise.all([
      this.redis.sadd(ONLINE_KEY, userId),
      this.redis.hset(SOCKETS_KEY, userId, socketId),
    ]);
  }

  /** Only clears presence if this socket is still the user's current one (reconnect-safe). */
  async markOffline(userId: string, socketId: string): Promise<void> {
    const current = await this.redis.hget(SOCKETS_KEY, userId);
    if (current !== socketId) return;
    await Promise.all([
      this.redis.srem(ONLINE_KEY, userId),
      this.redis.hdel(SOCKETS_KEY, userId),
    ]);
  }

  async socketFor(userId: string): Promise<string | null> {
    return this.redis.hget(SOCKETS_KEY, userId);
  }

  async onlineMap(userIds: string[]): Promise<Record<string, boolean>> {
    const flags = await Promise.all(userIds.map((id) => this.redis.sismember(ONLINE_KEY, id)));
    return Object.fromEntries(userIds.map((id, i) => [id, flags[i] === 1]));
  }
}
