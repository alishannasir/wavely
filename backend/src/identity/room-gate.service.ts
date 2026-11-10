import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, RoomGate } from '@prisma/client';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { AuditService } from '../moderation/audit.service';
import { adultGateEnabled, decideAdultGeo } from './adult-geo';

export type GateEventType = 'PAUSED' | 'STATUS' | 'RESUMED' | 'BLOCKED';
export interface GateEvent {
  type: GateEventType;
  sessionId: string;
  userAId: string;
  userBId: string;
  /** Who has a verified adult identity right now. */
  verified: Record<string, boolean>;
  reason?: string;
}
export type TriggerResult = 'NONE' | 'CHANGED' | 'END';

const STATE_TTL_SEC = 3 * 60 * 60;
const stateKey = (sessionId: string) => `gate:state:${sessionId}`;
const ipKey = (sessionId: string) => `gate:ip:${sessionId}`;

export const pauseTimeoutMs = () => (Number(process.env.GATE_PAUSE_TIMEOUT_MIN) || 15) * 60_000;

/** A verified adult: the provider approved the check and the date of birth on the document is 18+ today. */
export function isVerifiedAdult(user: { idVerifiedAt: Date | null; verifiedBirthdate: Date | null }, now = new Date()): boolean {
  if (!user.idVerifiedAt || !user.verifiedBirthdate) return false;
  const b = user.verifiedBirthdate;
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age -= 1;
  return age >= 18;
}

/**
 * Friend calls that turn sexual. State machine, one row per call:
 *   (none) -> PAUSED_VERIFY -> RESUMED | BLOCKED          a second detection in a BLOCKED room ends the call.
 * While PAUSED_VERIFY or BLOCKED nothing is relayed in the in-call chat, and the gateway mutes both people's media.
 * Transitions are single conditional updates, so with several API instances exactly one of them performs each one.
 */
@Injectable()
export class RoomGateService {
  private readonly log = new Logger(RoomGateService.name);
  private readonly listeners: Array<(e: GateEvent) => void | Promise<void>> = [];

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly audit: AuditService,
  ) {}

  /** The socket gateway registers here to tell people and to mute or unmute media. */
  onEvent(fn: (e: GateEvent) => void | Promise<void>) {
    this.listeners.push(fn);
  }

  private async emit(e: GateEvent) {
    for (const fn of this.listeners) {
      try {
        await fn(e);
      } catch (err) {
        this.log.warn(`gate listener failed: ${(err as Error).message}`);
      }
    }
  }

  /** Fast check used for every chat line. */
  async stateOf(sessionId: string): Promise<'NONE' | 'PAUSED_VERIFY' | 'RESUMED' | 'BLOCKED'> {
    const cached = await this.redis.get(stateKey(sessionId));
    if (cached) return cached as 'PAUSED_VERIFY' | 'RESUMED' | 'BLOCKED';
    const row = await this.prisma.roomGate.findUnique({ where: { sessionId } });
    if (!row) return 'NONE';
    await this.redis.set(stateKey(sessionId), row.state, 'EX', STATE_TTL_SEC);
    return row.state;
  }

  async isHeld(sessionId: string): Promise<boolean> {
    const s = await this.stateOf(sessionId);
    return s === 'PAUSED_VERIFY' || s === 'BLOCKED';
  }

  private async verifiedMap(userIds: string[]): Promise<Record<string, boolean>> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, idVerifiedAt: true, verifiedBirthdate: true },
    });
    const out: Record<string, boolean> = {};
    for (const id of userIds) out[id] = false;
    for (const u of users) out[u.id] = isVerifiedAdult(u);
    return out;
  }

  private async documentCountries(userIds: string[]): Promise<string[]> {
    const rows = await this.prisma.identityVerification.findMany({
      where: { userId: { in: userIds }, status: 'APPROVED', documentCountry: { not: null } },
      orderBy: { completedAt: 'desc' },
      select: { userId: true, documentCountry: true },
    });
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rows) {
      if (seen.has(r.userId)) continue; // latest approved check per person
      seen.add(r.userId);
      out.push(r.documentCountry as string);
    }
    return out;
  }

  /** The viewer's browser (or, later, the text classifier) says this friend call turned sexual. */
  async trigger(
    sessionId: string,
    trigger: 'VIDEO' | 'TEXT',
    score: number | null,
    ipCountries: Array<string | null>,
  ): Promise<TriggerResult> {
    if (!adultGateEnabled()) return 'NONE';
    const session = await this.prisma.callSession.findUnique({
      where: { id: sessionId },
      select: { kind: true, userAId: true, userBId: true, endedAt: true },
    });
    if (!session || session.kind !== 'FRIEND' || session.endedAt) return 'NONE';

    const existing = await this.prisma.roomGate.findUnique({ where: { sessionId } });
    if (existing) return existing.state === 'BLOCKED' ? 'END' : 'NONE'; // a second detection in a blocked room ends it

    const ids = [session.userAId, session.userBId];
    const verified = await this.verifiedMap(ids);
    const docs = await this.documentCountries(ids);
    const both = ids.every((id) => verified[id]);

    let state: 'PAUSED_VERIFY' | 'RESUMED' | 'BLOCKED';
    let reason: string | undefined;
    const early = decideAdultGeo({ ip: ipCountries, document: docs }, { final: both });
    if (!early.ok) {
      state = 'BLOCKED';
      reason = `GEO_${early.reason}`;
    } else {
      state = both ? 'RESUMED' : 'PAUSED_VERIFY';
    }

    try {
      await this.prisma.roomGate.create({
        data: {
          sessionId,
          userAId: session.userAId,
          userBId: session.userBId,
          state,
          trigger,
          score,
          reason,
          decidedAt: state === 'PAUSED_VERIFY' ? null : new Date(),
        },
      });
    } catch (err) {
      if ((err as Prisma.PrismaClientKnownRequestError)?.code === 'P2002') return 'NONE'; // two flags at once: the first one won
      throw err;
    }
    await this.redis.set(stateKey(sessionId), state, 'EX', STATE_TTL_SEC);
    await this.redis.set(ipKey(sessionId), JSON.stringify(ipCountries), 'EX', STATE_TTL_SEC);
    await this.audit.log('SYSTEM', 'GATE_PAUSED', { meta: { sessionId, trigger, score, state, reason } });
    await this.emit({
      type: state === 'PAUSED_VERIFY' ? 'PAUSED' : state === 'RESUMED' ? 'RESUMED' : 'BLOCKED',
      sessionId,
      userAId: session.userAId,
      userBId: session.userBId,
      verified,
      reason,
    });
    return 'CHANGED';
  }

  /** One conditional update: only a room that is still paused can move, and only once. */
  private async move(gate: RoomGate, to: 'RESUMED' | 'BLOCKED', reason?: string): Promise<boolean> {
    const res = await this.prisma.roomGate.updateMany({
      where: { id: gate.id, state: 'PAUSED_VERIFY' },
      data: { state: to, decidedAt: new Date(), reason },
    });
    if (res.count !== 1) return false;
    await this.redis.set(stateKey(gate.sessionId), to, 'EX', STATE_TTL_SEC);
    await this.audit.log('SYSTEM', to === 'RESUMED' ? 'GATE_RESUMED' : 'GATE_BLOCKED', { meta: { sessionId: gate.sessionId, reason } });
    await this.emit({
      type: to === 'RESUMED' ? 'RESUMED' : 'BLOCKED',
      sessionId: gate.sessionId,
      userAId: gate.userAId,
      userBId: gate.userBId,
      verified: await this.verifiedMap([gate.userAId, gate.userBId]),
      reason,
    });
    return true;
  }

  /** Called after any identity result for this person (webhook). */
  async onIdentityResult(userId: string): Promise<void> {
    const gates = await this.prisma.roomGate.findMany({
      where: { state: 'PAUSED_VERIFY', OR: [{ userAId: userId }, { userBId: userId }] },
    });
    for (const gate of gates) await this.evaluate(gate);
  }

  private async evaluate(gate: RoomGate) {
    const ids = [gate.userAId, gate.userBId];
    const failed = await this.prisma.identityVerification.findFirst({
      where: { userId: { in: ids }, status: { in: ['DECLINED', 'EXPIRED'] }, completedAt: { gte: gate.pausedAt } },
    });
    if (failed) {
      await this.move(gate, 'BLOCKED', 'ID_DECLINED');
      return;
    }
    const verified = await this.verifiedMap(ids);
    if (!ids.every((id) => verified[id])) {
      // One of them passed: tell both who is still missing.
      await this.emit({ type: 'STATUS', sessionId: gate.sessionId, userAId: gate.userAId, userBId: gate.userBId, verified });
      return;
    }
    let ip: Array<string | null> = [];
    try {
      ip = JSON.parse((await this.redis.get(ipKey(gate.sessionId))) ?? '[]');
    } catch {
      ip = [];
    }
    const geo = decideAdultGeo({ ip, document: await this.documentCountries(ids) }, { final: true });
    if (!geo.ok) await this.move(gate, 'BLOCKED', `GEO_${geo.reason}`);
    else await this.move(gate, 'RESUMED');
  }

  /** The person closed the popup or said no. */
  async decline(sessionId: string, userId: string): Promise<void> {
    const gate = await this.prisma.roomGate.findUnique({ where: { sessionId } });
    if (!gate || gate.state !== 'PAUSED_VERIFY') return;
    if (gate.userAId !== userId && gate.userBId !== userId) return;
    await this.move(gate, 'BLOCKED', 'DECLINED_BY_USER');
  }

  /** Rooms nobody finished verifying in time are blocked. */
  async timeoutTick(now = Date.now()): Promise<number> {
    const due = await this.prisma.roomGate.findMany({
      where: { state: 'PAUSED_VERIFY', pausedAt: { lt: new Date(now - pauseTimeoutMs()) } },
      take: 50,
    });
    let n = 0;
    for (const gate of due) if (await this.move(gate, 'BLOCKED', 'TIMEOUT')) n += 1;
    return n;
  }

  /** What the popup needs after a page reload. */
  async statusFor(sessionId: string, userId: string) {
    const gate = await this.prisma.roomGate.findUnique({ where: { sessionId } });
    if (!gate || (gate.userAId !== userId && gate.userBId !== userId)) return null;
    const verified = await this.verifiedMap([gate.userAId, gate.userBId]);
    const peerId = gate.userAId === userId ? gate.userBId : gate.userAId;
    return {
      sessionId,
      state: gate.state,
      reason: gate.reason,
      me: verified[userId],
      peer: verified[peerId],
      expiresAt: new Date(gate.pausedAt.getTime() + pauseTimeoutMs()).toISOString(),
    };
  }
}
