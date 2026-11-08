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
const DEADLINES_KEY = 'call:deadlines';
const CHAT_KEEP = 50;
const CHAT_MAX_LEN = 500;
const CHAT_PER_10S = 20;

export interface ChatLine {
  userId: string;
  text: string;
  at: number;
}

/**
 * Starts a call only if neither user is already in one. A user counts as in a call when their `call:user` key points at
 * a socket that still has a `call:sock` entry (a key left behind by a crashed instance does not block anyone).
 * Returns 1 when the call was recorded, 0 when someone is busy. Runs as one script, so two matches that claim the same
 * user at the same moment cannot both succeed.
 */
const SET_ACTIVE_LUA = `
local function busy(k)
  local s = redis.call('GET', k)
  if not s then return false end
  return redis.call('EXISTS', 'call:sock:' .. s) == 1
end
if busy(KEYS[1]) or busy(KEYS[2]) then return 0 end
local ttl = tonumber(ARGV[1])
redis.call('SET', KEYS[3], ARGV[2], 'EX', ttl)
redis.call('SET', KEYS[4], ARGV[3], 'EX', ttl)
redis.call('SET', KEYS[5], ARGV[4], 'EX', ttl)
redis.call('SET', KEYS[1], ARGV[5], 'EX', ttl)
redis.call('SET', KEYS[2], ARGV[6], 'EX', ttl)
if ARGV[7] ~= '' then redis.call('ZADD', KEYS[6], tonumber(ARGV[7]), ARGV[8]) end
return 1
`;

/** Call state in Redis so it survives restarts and works with several API instances. */
@Injectable()
export class CallStateService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Records a call. Returns false (and changes nothing) when either user is already in a call. */
  async setActive(
    sessionId: string,
    a: { userId: string; socketId: string },
    b: { userId: string; socketId: string },
    deadline?: { atMs: number; limitedUserId: string } | null,
  ): Promise<boolean> {
    const info = (me: typeof a, peer: typeof a): ActiveCall => ({
      sessionId,
      userId: me.userId,
      peerUserId: peer.userId,
      peerSocketId: peer.socketId,
    });
    const claimed = await this.redis.eval(
      SET_ACTIVE_LUA,
      6,
      `call:user:${a.userId}`,
      `call:user:${b.userId}`,
      `call:session:${sessionId}`,
      `call:sock:${a.socketId}`,
      `call:sock:${b.socketId}`,
      DEADLINES_KEY,
      ACTIVE_TTL_SEC,
      JSON.stringify({ users: [a.userId, b.userId], sockets: [a.socketId, b.socketId], limitedUserId: deadline?.limitedUserId ?? null }),
      JSON.stringify(info(a, b)),
      JSON.stringify(info(b, a)),
      a.socketId,
      b.socketId,
      deadline ? String(deadline.atMs) : '',
      sessionId,
    );
    return claimed === 1;
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
    if (won) {
      m.zrem(DEADLINES_KEY, info.sessionId);
      m.del(`call:session:${info.sessionId}`);
    }
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

  /** Drops the pending calls a user placed: from one socket (that tab left), or all of them when no socket is given (the user started something else). */
  async dropPendingByCaller(userId: string, callerSocketId?: string): Promise<PendingCall[]> {
    const ids = await this.redis.smembers(`call:pending:by:${userId}`);
    const dropped: PendingCall[] = [];
    for (const id of ids) {
      const peeked = await this.peekPending(id);
      if (!peeked) {
        await this.redis.srem(`call:pending:by:${userId}`, id); // expired
      } else if (!callerSocketId || peeked.callerSocketId === callerSocketId) {
        const c = await this.takePending(id);
        if (c) dropped.push(c);
      }
    }
    return dropped;
  }

  /**
   * Stores one in-call chat line (last 50 kept for abuse reports) and returns the cleaned line, or
   * null if it is empty or the sender is going too fast.
   */
  async pushChat(sessionId: string, userId: string, rawText: unknown): Promise<ChatLine | null> {
    if (typeof rawText !== 'string') return null;
    const text = rawText.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
    if (!text) return null;
    const rlKey = `call:chatrl:${userId}`;
    const n = await this.redis.incr(rlKey);
    if (n === 1) await this.redis.expire(rlKey, 10);
    if (n > CHAT_PER_10S) return null;
    const line: ChatLine = { userId, text, at: Date.now() };
    const key = `call:chat:${sessionId}`;
    await this.redis
      .multi()
      .rpush(key, JSON.stringify(line))
      .ltrim(key, -CHAT_KEEP, -1)
      .expire(key, ACTIVE_TTL_SEC)
      .exec();
    return line;
  }

  /** Counter with an expiry set when it is first used. Returns the new count. */
  async bump(key: string, ttlSec: number): Promise<number> {
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, ttlSec);
    return n;
  }

  async getChat(sessionId: string): Promise<ChatLine[]> {
    const raw = await this.redis.lrange(`call:chat:${sessionId}`, 0, -1);
    return raw.map((r) => JSON.parse(r) as ChatLine);
  }

  /**
   * Sessions whose free-tier time ran out. Each is claimed with ZREM, so with several API
   * instances exactly one of them handles a given session.
   */
  async claimDue(nowMs: number): Promise<{ sessionId: string; limitedUserId: string | null; users: string[]; sockets: string[] }[]> {
    const ids = await this.redis.zrangebyscore(DEADLINES_KEY, '-inf', nowMs);
    const out: { sessionId: string; limitedUserId: string | null; users: string[]; sockets: string[] }[] = [];
    for (const sessionId of ids) {
      if ((await this.redis.zrem(DEADLINES_KEY, sessionId)) !== 1) continue;
      const raw = await this.redis.get(`call:session:${sessionId}`);
      if (!raw) continue;
      out.push({ sessionId, ...(JSON.parse(raw) as { users: string[]; sockets: string[]; limitedUserId: string | null }) });
    }
    return out;
  }
}
