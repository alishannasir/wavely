import Redis from 'ioredis';
import { MatchingService, QueueEntry } from './matching.service';
import { CallStateService } from './call-state.service';
import { PresenceService } from '../friends/presence.service';

// Integration tests: need a real Redis (Lua). Run with REDIS_URL_TEST=redis://127.0.0.1:56379 npm test
const url = process.env.REDIS_URL_TEST;
const d = url ? describe : describe.skip;

const entry = (id: string, extra: Partial<QueueEntry> = {}): QueueEntry => ({
  userId: id,
  socketId: `s-${id}`,
  displayName: id,
  gender: 'MALE',
  country: 'US',
  preferredGender: null,
  preferredCountry: null,
  ...extra,
});

d('matching (redis)', () => {
  let redis: Redis;
  let svc: MatchingService;

  beforeAll(() => {
    redis = new Redis(url!);
    svc = new MatchingService(redis, {} as any);
  });
  beforeEach(() => redis.flushdb());
  afterAll(async () => {
    await redis.quit();
  });

  it('queues the first user and matches the second', async () => {
    expect(await svc.findOrQueue(entry('a'))).toBeNull();
    const peer = await svc.findOrQueue(entry('b'));
    expect(peer?.userId).toBe('a');
    expect(await svc.queueSize()).toBe(0);
  });

  it('never queues a user twice', async () => {
    await svc.findOrQueue(entry('a'));
    await svc.findOrQueue(entry('a'));
    expect(await svc.queueSize()).toBe(1);
  });

  it('respects both sides filters', async () => {
    await svc.findOrQueue(entry('a', { country: 'US' }));
    expect(await svc.findOrQueue(entry('b', { preferredCountry: 'GB' }))).toBeNull();
    expect(await svc.findOrQueue(entry('c', { preferredCountry: 'FR', country: 'GB' }))).toBeNull();
    expect(await svc.queueSize()).toBe(3);
  });

  it('keeps flagged users apart from everyone else', async () => {
    await svc.findOrQueue(entry('bad', { flagged: true }));
    expect(await svc.findOrQueue(entry('good'))).toBeNull();
    expect((await svc.findOrQueue(entry('bad2', { flagged: true })))?.userId).toBe('bad');
  });

  it('does not rematch recent partners', async () => {
    await svc.recordPair('a', 'b');
    await svc.findOrQueue(entry('a'));
    expect(await svc.findOrQueue(entry('b'))).toBeNull();
    expect(await svc.queueSize()).toBe(2);
  });

  it('relaxes filters after waiting', async () => {
    const old = entry('a', { preferredCountry: 'GB', queuedAt: Date.now() - 60_000 });
    await redis.set('mm:entry:a', JSON.stringify(old), 'EX', 60);
    await redis.zadd('mm:queue', old.queuedAt!, 'a');
    expect((await svc.findOrQueue(entry('b', { country: 'US' })))?.userId).toBe('a');
  });

  it('drops expired queue entries', async () => {
    await redis.zadd('mm:queue', Date.now(), 'ghost'); // no entry hash
    expect(await svc.findOrQueue(entry('a'))).toBeNull();
    expect(await redis.zscore('mm:queue', 'ghost')).toBeNull();
  });

  it('removeFromQueue only removes the owning socket', async () => {
    await svc.findOrQueue(entry('a'));
    expect(await svc.removeFromQueue('a', 'other-socket')).toBe(false);
    expect(await svc.queueSize()).toBe(1);
    expect(await svc.removeFromQueue('a', 's-a')).toBe(true);
    expect(await svc.queueSize()).toBe(0);
  });

  it('200 concurrent users: nobody is matched twice and nobody is lost', async () => {
    const users = Array.from({ length: 200 }, (_, i) => entry(`u${i}`));
    const results = await Promise.all(users.map((u) => svc.findOrQueue(u)));
    const claimed = results.filter((r): r is QueueEntry => !!r).map((r) => r.userId);
    expect(new Set(claimed).size).toBe(claimed.length); // no peer claimed twice
    const matches = claimed.length;
    expect(matches).toBe(100);
    expect(await svc.queueSize()).toBe(200 - 2 * matches);
  });
});

d('call state (redis)', () => {
  let redis: Redis;
  let calls: CallStateService;
  beforeAll(() => {
    redis = new Redis(url!);
    calls = new CallStateService(redis);
  });
  beforeEach(() => redis.flushdb());
  afterAll(async () => {
    await redis.quit();
  });

  it('ends a call exactly once for both sides', async () => {
    await calls.setActive('sess', { userId: 'a', socketId: 'sa' }, { userId: 'b', socketId: 'sb' });
    expect(await calls.socketInCall('a')).toBe('sa');
    const [x, y] = await Promise.all([calls.endBySocket('sa'), calls.endBySocket('sb')]);
    expect([x, y].filter(Boolean)).toHaveLength(1);
    expect(await calls.socketInCall('b')).toBeNull();
  });

  it('pending calls are single-use and droppable per caller socket', async () => {
    await calls.addPending('c1', { callerUserId: 'a', callerSocketId: 'sa', calleeUserId: 'b' });
    await calls.addPending('c2', { callerUserId: 'a', callerSocketId: 'sa2', calleeUserId: 'b' });
    expect(await calls.takePending('c1')).not.toBeNull();
    expect(await calls.takePending('c1')).toBeNull();
    const dropped = await calls.dropPendingByCaller('a', 'sa2');
    expect(dropped).toHaveLength(1);
    expect(await calls.peekPending('c2')).toBeNull();
  });

  it('keeps the last 50 chat lines, trims text and rate limits', async () => {
    const line = await calls.pushChat('s', 'a', '  hello   there  ');
    expect(line?.text).toBe('hello there');
    expect(await calls.pushChat('s', 'a', '   ')).toBeNull();
    expect(await calls.pushChat('s', 'a', 42 as any)).toBeNull();
    for (let i = 0; i < 60; i++) await calls.pushChat('s2', `u${i}`, `m${i}`); // distinct senders: no rate limit
    const log = await calls.getChat('s2');
    expect(log).toHaveLength(50);
    expect(log[49].text).toBe('m59');
    let accepted = 0;
    for (let i = 0; i < 30; i++) if (await calls.pushChat('s3', 'spam', 'x')) accepted++;
    expect(accepted).toBeLessThanOrEqual(20);
  });

  it('schedules a deadline, claims it once when due, and clears it when the call ends', async () => {
    await calls.setActive('d1', { userId: 'a', socketId: 'sa' }, { userId: 'b', socketId: 'sb' }, { atMs: 1000, limitedUserId: 'b' });
    await calls.setActive('d2', { userId: 'c', socketId: 'sc' }, { userId: 'd', socketId: 'sd' }, { atMs: 9_999_999_999_999, limitedUserId: 'd' });
    expect(await calls.claimDue(500)).toHaveLength(0);
    const [x, y] = await Promise.all([calls.claimDue(2000), calls.claimDue(2000)]);
    const claimed = [...x, ...y];
    expect(claimed).toHaveLength(1); // exactly one instance wins
    expect(claimed[0]).toMatchObject({ sessionId: 'd1', limitedUserId: 'b', users: ['a', 'b'], sockets: ['sa', 'sb'] });
    await calls.endBySocket('sc'); // normal end removes the pending deadline
    expect(await calls.claimDue(Date.now() + 1e13)).toHaveLength(0);
  });

  it('pending calls expire', async () => {
    await calls.addPending('c3', { callerUserId: 'a', callerSocketId: 'sa', calleeUserId: 'b' });
    expect(await redis.ttl('call:pending:c3')).toBeLessThanOrEqual(30);
  });
});

d('presence (redis)', () => {
  let redis: Redis;
  let presence: PresenceService;
  beforeAll(() => {
    redis = new Redis(url!);
    presence = new PresenceService(redis);
  });
  beforeEach(() => redis.flushdb());
  afterAll(async () => {
    await redis.quit();
  });

  it('stays online until the last tab closes', async () => {
    await presence.markOnline('u', 't1');
    await presence.markOnline('u', 't2');
    await presence.markOffline('u', 't1');
    expect(await presence.isOnline('u')).toBe(true);
    await presence.markOffline('u', 't2');
    expect(await presence.isOnline('u')).toBe(false);
  });
});
