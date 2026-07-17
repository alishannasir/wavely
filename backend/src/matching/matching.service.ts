import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';

export interface QueueEntry {
  userId: string;
  socketId: string;
  displayName: string | null;
  gender: string | null;
  country: string | null;
  preferredGender: string | null;
  preferredCountry: string | null;
}

const QUEUE_KEY = 'mm:queue';

@Injectable()
export class MatchingService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  /** Both sides' filters must be satisfied (filters are null for free users). */
  private compatible(a: QueueEntry, b: QueueEntry): boolean {
    if (a.userId === b.userId) return false;
    const aOk =
      (!a.preferredGender || b.gender === a.preferredGender) &&
      (!a.preferredCountry || b.country === a.preferredCountry);
    const bOk =
      (!b.preferredGender || a.gender === b.preferredGender) &&
      (!b.preferredCountry || a.country === b.preferredCountry);
    return aOk && bOk;
  }

  /** Returns a compatible waiting peer, or queues the entry and returns null. */
  async findOrQueue(entry: QueueEntry): Promise<QueueEntry | null> {
    await this.removeFromQueue(entry.userId); // never queue the same user twice
    const items = await this.redis.lrange(QUEUE_KEY, 0, -1);
    for (const item of items) {
      const candidate = JSON.parse(item) as QueueEntry;
      if (this.compatible(entry, candidate)) {
        // LREM returns 0 if another match already claimed this candidate (race guard).
        const removed = await this.redis.lrem(QUEUE_KEY, 1, item);
        if (removed > 0) return candidate;
      }
    }
    await this.redis.rpush(QUEUE_KEY, JSON.stringify(entry));
    return null;
  }

  async removeFromQueue(userId: string): Promise<void> {
    const items = await this.redis.lrange(QUEUE_KEY, 0, -1);
    for (const item of items) {
      if ((JSON.parse(item) as QueueEntry).userId === userId) {
        await this.redis.lrem(QUEUE_KEY, 1, item);
      }
    }
  }

  /** Ends the session and records usage for both users (Phase 3 enforces caps). */
  async closeSession(sessionId: string): Promise<void> {
    const session = await this.prisma.callSession.findUnique({ where: { id: sessionId } });
    if (!session || session.endedAt) return;
    const endedAt = new Date();
    await this.prisma.callSession.update({ where: { id: sessionId }, data: { endedAt } });

    const minutes = Math.max(1, Math.round((endedAt.getTime() - session.startedAt.getTime()) / 60_000));
    const date = new Date(new Date().toISOString().slice(0, 10)); // midnight UTC
    for (const userId of [session.userAId, session.userBId]) {
      await this.prisma.dailyUsage.upsert({
        where: { userId_date: { userId, date } },
        create: { userId, date, minutesUsed: minutes, matchesUsed: 1 },
        update: { minutesUsed: { increment: minutes }, matchesUsed: { increment: 1 } },
      });
    }
  }
}
