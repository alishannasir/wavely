import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

export interface ActiveCall {
  sessionId: string;
  userId: string;
  peerUserId: string;
  peerSocketId: string;
}

export interface PendingCall {
  callerUserId: string;
  callerSocketId: string;
  calleeUserId: string;
}

const ACTIVE_TTL_SEC = 3 * 60 * 60; // longer than the 2h LiveKit token
export const PENDING_TTL_SEC = 30;

/** Call state in Redis so it survives restarts and works with several API instances. */
@Injectable()
export class CallStateService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async setActive(
    sessionId: string,
    a: { userId: string; socketId: string },
    b: { userId: string; socketId: string },
  ): Promise<void> {
    const m = this.redis.multi();
    for (const [me, peer] of [[a, b], [b, a]]) {
      const info: ActiveCall = {
        sessionId,
        userId: me.userId,
        peerUserId: peer.userId,
        peerSocketId: peer.socketId,
      };
      m.set(`call:sock:${me.socketId}`, JSON.stringify(info), 'EX', ACTIVE_TTL_SEC);
      m.set(`call:user:${me.userId}`, me.socketId, 'EX', ACTIVE_TTL_SEC);
    }
    await m.exec();
  }

  async getBySocket(socketId: string): Promise<ActiveCall | null> {
    const raw = await this.redis.get(`call:sock:${socketId}`);
    return raw ? (JSON.parse(raw) as ActiveCall) : null;
  }

  /** The socket a user is currently in a call on, if any. */
  async socketInCall(userId: string): Promise<string | null> {
    return this.redis.get(`call:user:${userId}`);
  }

  /** Atomically removes both sides of a call and returns this side's info (null if already ended). */
  async endBySocket(socketId: string): Promise<ActiveCall | null> {
    const raw = await this.redis.getdel(`call:sock:${socketId}`);
    if (!raw) return null;
    const info = JSON.parse(raw) as ActiveCall;
    // Both sides may end the call at the same moment; only the first to claim the session wins.
    const won = (await this.redis.set(`call:ended:${info.sessionId}`, '1', 'EX', 60, 'NX')) === 'OK';
    const m = this.redis.multi();
    m.del(`call:sock:${info.peerSocketId}`);
    m.del(`call:user:${info.userId}`);
    m.del(`call:user:${info.peerUserId}`);
    await m.exec();
    return won ? info : null;
  }

  async addPending(callId: string, call: PendingCall): Promise<void> {
    const m = this.redis.multi();
    m.set(`call:pending:${callId}`, JSON.stringify(call), 'EX', PENDING_TTL_SEC);
    m.sadd(`call:pending:by:${call.callerUserId}`, callId);
    m.expire(`call:pending:by:${call.callerUserId}`, PENDING_TTL_SEC * 2);
    await m.exec();
  }

  async peekPending(callId: string): Promise<PendingCall | null> {
    const raw = await this.redis.get(`call:pending:${callId}`);
    return raw ? (JSON.parse(raw) as PendingCall) : null;
  }

  /** Single-use: returns the pending call and removes it. */
  async takePending(callId: string): Promise<PendingCall | null> {
    const raw = await this.redis.getdel(`call:pending:${callId}`);
    if (!raw) return null;
    const call = JSON.parse(raw) as PendingCall;
    await this.redis.srem(`call:pending:by:${call.callerUserId}`, callId);
    return call;
  }

  /** Drops the pending calls a user placed from one socket (that tab disconnected / left). */
  async dropPendingByCaller(userId: string, callerSocketId: string): Promise<PendingCall[]> {
    const ids = await this.redis.smembers(`call:pending:by:${userId}`);
    const dropped: PendingCall[] = [];
    for (const id of ids) {
      const peeked = await this.peekPending(id);
      if (!peeked) {
        await this.redis.srem(`call:pending:by:${userId}`, id); // expired
      } else if (peeked.callerSocketId === callerSocketId) {
        const c = await this.takePending(id);
        if (c) dropped.push(c);
      }
    }
    return dropped;
  }
}
