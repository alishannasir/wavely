import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { readFileSync } from 'fs';
import { join } from 'path';
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
  /** Shadow queue: flagged users only match other flagged users. */
  flagged?: boolean;
  /** Set by the service (ms). Used for FIFO order and filter relaxation. */
  queuedAt?: number;
}

/** A call shorter than this is treated as an instant skip and costs nothing. */
const FREE_CALL_SECONDS = 10;

/**
 * Minutes billed for a call: partial minutes count as a whole minute (a 1m29s call is 2), but an instant skip is
 * free. Rounded to whole seconds first so a call that lasted exactly N minutes plus a few milliseconds costs N.
 */
export function billableMinutes(durationMs: number): number {
  const seconds = Math.round(durationMs / 1000);
  return seconds < FREE_CALL_SECONDS ? 0 : Math.ceil(seconds / 60);
}

const QUEUE_KEY = 'mm:queue';
const ENTRY_TTL_SEC = 600;
const RECENT_WINDOW_MS = 30 * 60 * 1000;
const RECENT_KEEP = 20;
const MAX_CALL_MS = 2 * 60 * 60 * 1000; // LiveKit token lifetime
const SWEEP_EVERY_MS = 10 * 60 * 1000;

export const RELAX_COUNTRY_MS = parseInt(process.env.MM_RELAX_COUNTRY_MS ?? '15000', 10);
export const RELAX_GENDER_MS = parseInt(process.env.MM_RELAX_GENDER_MS ?? '30000', 10);

const LUA = readFileSync(join(__dirname, 'lua', 'find-or-queue.lua'), 'utf8');

@Injectable()
export class MatchingService implements OnModuleInit, OnModuleDestroy {
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {
    this.redis.defineCommand('mmFindOrQueue', { numberOfKeys: 1, lua: LUA });
  }

  onModuleInit() {
    this.sweepTimer = setInterval(() => void this.sweepOrphans().catch(() => undefined), SWEEP_EVERY_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /**
   * Atomically claims a compatible waiting peer, or queues the entry and returns null.
   * Re-scan a user who is already waiting: `keepQueuedAt` keeps their place in line, and
   * `requireWaiting` makes the call a no-op (no claim, no re-queue) if they have since left or been
   * matched, so a stale re-scan can never resurrect a ghost entry.
   */
  async findOrQueue(
    entry: QueueEntry,
    { keepQueuedAt = false, requireWaiting = false }: { keepQueuedAt?: boolean; requireWaiting?: boolean } = {},
  ): Promise<QueueEntry | null> {
    const now = Date.now();
    const withTime: QueueEntry = { ...entry, queuedAt: keepQueuedAt && entry.queuedAt ? entry.queuedAt : now };
    const raw = await (this.redis as any).mmFindOrQueue(
      QUEUE_KEY,
      now,
      JSON.stringify(withTime),
      RELAX_COUNTRY_MS,
      RELAX_GENDER_MS,
      ENTRY_TTL_SEC,
      RECENT_WINDOW_MS,
      requireWaiting ? '1' : '0',
    );
    return raw ? (JSON.parse(raw) as QueueEntry) : null;
  }

  /**
   * Puts the entry in the queue without looking for a partner (used when every claimed peer turned
   * out to be unusable). Keeps the original place in line when the entry has a queuedAt.
   */
  async enqueueOnly(entry: QueueEntry): Promise<void> {
    const queuedAt = entry.queuedAt ?? Date.now();
    await this.redis
      .multi()
      .set(`mm:entry:${entry.userId}`, JSON.stringify({ ...entry, queuedAt }), 'EX', ENTRY_TTL_SEC)
      .zadd(QUEUE_KEY, queuedAt, entry.userId)
      .exec();
  }

  /** O(1). When socketId is given, only removes the entry if it belongs to that socket (multi-tab safe). */
  async removeFromQueue(userId: string, socketId?: string): Promise<boolean> {
    if (socketId) {
      const raw = await this.redis.get(`mm:entry:${userId}`);
      if (raw && (JSON.parse(raw) as QueueEntry).socketId !== socketId) return false;
    }
    await this.redis.multi().zrem(QUEUE_KEY, userId).del(`mm:entry:${userId}`).exec();
    return true;
  }

  async getQueued(userId: string): Promise<QueueEntry | null> {
    const raw = await this.redis.get(`mm:entry:${userId}`);
    return raw ? (JSON.parse(raw) as QueueEntry) : null;
  }

  /** Waiting entries older than the shortest relaxation window (candidates for a re-scan). */
  async staleWaiting(): Promise<QueueEntry[]> {
    const cutoff = Date.now() - Math.min(RELAX_COUNTRY_MS, RELAX_GENDER_MS);
    const ids = await this.redis.zrangebyscore(QUEUE_KEY, '-inf', cutoff);
    const out: QueueEntry[] = [];
    for (const id of ids) {
      const e = await this.getQueued(id);
      if (e && (e.preferredCountry || e.preferredGender)) out.push(e);
    }
    return out;
  }

  async queueSize(): Promise<number> {
    return this.redis.zcard(QUEUE_KEY);
  }

  /** Remember the pair so they are not matched again for a while. */
  async recordPair(a: string, b: string): Promise<void> {
    const now = Date.now();
    const m = this.redis.multi();
    for (const [x, y] of [[a, b], [b, a]]) {
      const key = `mm:recent:${x}`;
      m.zadd(key, now, y);
      m.zremrangebyrank(key, 0, -(RECENT_KEEP + 1));
      m.pexpire(key, RECENT_WINDOW_MS);
    }
    await m.exec();
  }

  /** Lightweight cross-instance lock so periodic jobs run on one instance at a time. */
  async tryLock(name: string, ttlMs: number): Promise<boolean> {
    return (await this.redis.set(`lock:${name}`, '1', 'PX', ttlMs, 'NX')) === 'OK';
  }

  /** Counts a started call against both users' daily match cap (at match time, not when the call ends). */
  async recordMatchStart(userIds: string[]): Promise<void> {
    const date = new Date(new Date().toISOString().slice(0, 10)); // midnight UTC
    for (const userId of userIds) {
      await this.prisma.dailyUsage.upsert({
        where: { userId_date: { userId, date } },
        create: { userId, date, minutesUsed: 0, matchesUsed: 1 },
        update: { matchesUsed: { increment: 1 } },
      });
    }
  }

  /**
   * Ends the session and bills the minutes to both users (matches were counted at match time).
   * Safe to call from both sides concurrently: only the first caller records usage.
   */
  async closeSession(sessionId: string, endedAt = new Date()): Promise<void> {
    const session = await this.prisma.callSession.findUnique({ where: { id: sessionId } });
    if (!session || session.endedAt) return;
    const capped = new Date(Math.min(endedAt.getTime(), session.startedAt.getTime() + MAX_CALL_MS));
    const claimed = await this.prisma.callSession.updateMany({
      where: { id: sessionId, endedAt: null },
      data: { endedAt: capped },
    });
    if (claimed.count === 0) return;

    // Minutes are billed when the call ends; matches were already counted when it started.
    const minutes = billableMinutes(capped.getTime() - session.startedAt.getTime());
    if (minutes <= 0) return;
    const date = new Date(session.startedAt.toISOString().slice(0, 10)); // day the call started (UTC)
    for (const userId of [session.userAId, session.userBId]) {
      await this.prisma.dailyUsage.upsert({
        where: { userId_date: { userId, date } },
        create: { userId, date, minutesUsed: minutes, matchesUsed: 0 },
        update: { minutesUsed: { increment: minutes } },
      });
    }
  }

  /** Closes sessions that never got a clean end (crash, lost sockets) once past the token lifetime. */
  async sweepOrphans(): Promise<number> {
    if (!(await this.tryLock('sweep-orphans', SWEEP_EVERY_MS - 1000))) return 0;
    const stale = await this.prisma.callSession.findMany({
      where: { endedAt: null, startedAt: { lt: new Date(Date.now() - MAX_CALL_MS - 5 * 60 * 1000) } },
      select: { id: true },
      take: 200,
    });
    for (const s of stale) await this.closeSession(s.id);
    return stale.length;
  }
}
