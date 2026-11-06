import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

const ONLINE_KEY = 'presence:online';
const SOCKET_SET_TTL_SEC = 24 * 60 * 60;

/** A user is online while at least one of their sockets (tabs/devices) is connected. */
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
      .sadd(ONLINE_KEY, userId)
      .exec();
  }

  /** Removes one socket; the user goes offline only when their last socket is gone. */
  async markOffline(userId: string, socketId: string): Promise<void> {
    await this.redis.srem(this.key(userId), socketId);
    if ((await this.redis.scard(this.key(userId))) === 0) {
      await this.redis.srem(ONLINE_KEY, userId);
    }
  }

  async isOnline(userId: string): Promise<boolean> {
    return (await this.redis.sismember(ONLINE_KEY, userId)) === 1;
  }

  async onlineMap(userIds: string[]): Promise<Record<string, boolean>> {
    const flags = await Promise.all(userIds.map((id) => this.redis.sismember(ONLINE_KEY, id)));
    return Object.fromEntries(userIds.map((id, i) => [id, flags[i] === 1]));
  }

  async onlineCount(): Promise<number> {
    return this.redis.scard(ONLINE_KEY);
  }
}
