import { ReportsService } from './reports.service';

function setup() {
  const prisma: any = {
    callSession: { findUnique: jest.fn().mockResolvedValue({ userAId: 'a', userBId: 'b' }) },
    report: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'r', status: 'OPEN' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: { updateMany: jest.fn(), update: jest.fn() },
  };
  const redis: any = { incr: jest.fn().mockResolvedValue(1), expire: jest.fn(), lrange: jest.fn().mockResolvedValue([]) };
  return { svc: new ReportsService(prisma, redis, {} as any, { log: jest.fn() } as any), prisma, redis };
}

describe('ReportsService.createAutoNsfw', () => {
  it('creates an AUTO_NSFW NUDITY report with a clamped score', async () => {
    const { svc, prisma } = setup();
    await svc.createAutoNsfw('a', 'b', 's1', 7, 'data:image/jpeg;base64,AAAA');
    const data = prisma.report.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ source: 'AUTO_NSFW', reasonCode: 'NUDITY', nsfwScore: 1, evidenceImage: 'data:image/jpeg;base64,AAAA' });
  });
  it('drops evidence that is not a JPEG data URL', async () => {
    const { svc, prisma } = setup();
    await svc.createAutoNsfw('a', 'b', 's1', 0.9, '<script>alert(1)</script>');
    expect(prisma.report.create.mock.calls[0][0].data.evidenceImage).toBeUndefined();
  });
  it('uses a separate rate-limit bucket from manual reports', async () => {
    const { svc, redis } = setup();
    await svc.createAutoNsfw('a', 'b', 's1', 0.9);
    expect(redis.incr).toHaveBeenCalledWith('report:rl:auto:a');
  });
  it('rejects a session the reporter was not in', async () => {
    const { svc } = setup();
    await expect(svc.createAutoNsfw('x', 'b', 's1', 0.9)).rejects.toBeDefined();
  });
});

describe('chat log evidence', () => {
  it('attaches the server-side chat log, labelled from the reporter point of view', async () => {
    const { svc, prisma, redis } = setup();
    redis.lrange.mockResolvedValue([
      JSON.stringify({ userId: 'a', text: 'hi', at: 1 }),
      JSON.stringify({ userId: 'b', text: 'yo', at: 2 }),
    ]);
    await svc.createAutoNsfw('a', 'b', 's1', 0.9);
    const data = prisma.report.create.mock.calls[0][0].data;
    expect(data.chatLog).toEqual([
      { from: 'reporter', text: 'hi', at: 1 },
      { from: 'reported', text: 'yo', at: 2 },
    ]);
    expect(data.evidenceExpiresAt).toBeInstanceOf(Date);
  });
});

describe('auto reports vs suspension', () => {
  it('only counts USER reports toward auto-suspension', async () => {
    const { svc, prisma } = setup();
    await svc.createAutoNsfw('a', 'b', 's1', 0.95);
    const suspendQueries = prisma.report.findMany.mock.calls.map((c: any[]) => c[0].where).filter((w: any) => w.reasonCode);
    expect(suspendQueries.length).toBeGreaterThan(0);
    for (const w of suspendQueries) expect(w.source).toBe('USER');
  });

  it('five distinct classifier reports can flag but never suspend', async () => {
    const { svc, prisma } = setup();
    // the suspension query filters source=USER, so it sees none; the flag query sees all five
    prisma.report.findMany.mockImplementation(async ({ where }: any) =>
      where.source === 'USER' ? [] : ['1', '2', '3', '4', '5'].map((r) => ({ reporterId: r })),
    );
    await svc.createAutoNsfw('a', 'b', 's1', 0.95);
    expect(prisma.user.update).toHaveBeenCalled(); // shadow queue flag
    expect(prisma.user.updateMany).not.toHaveBeenCalled(); // no suspension
  });

  it('upgrades an earlier automatic report when the person files their own', async () => {
    const { svc, prisma } = setup();
    prisma.report.findUnique.mockResolvedValue({ id: 'auto1', status: 'OPEN', source: 'AUTO_NSFW', evidenceImage: 'data:image/jpeg;base64,OLD' });
    prisma.report.update = jest.fn();
    const res = await svc.create('a', { reportedUserId: 'b', sessionId: 's1', reasonCode: 'HARASSMENT', evidenceImage: 'data:image/jpeg;base64,NEW' });
    expect(res.id).toBe('auto1');
    expect(prisma.report.create).not.toHaveBeenCalled();
    expect(prisma.report.update.mock.calls[0][0].data).toMatchObject({ source: 'USER', reasonCode: 'HARASSMENT', evidenceImage: 'data:image/jpeg;base64,NEW' });
  });

  it('keeps the old evidence if the manual report has none, and never downgrades a manual report', async () => {
    const { svc, prisma } = setup();
    prisma.report.update = jest.fn();
    prisma.report.findUnique.mockResolvedValue({ id: 'auto1', status: 'OPEN', source: 'AUTO_NSFW', evidenceImage: 'data:image/jpeg;base64,OLD' });
    await svc.create('a', { reportedUserId: 'b', sessionId: 's1', reasonCode: 'SPAM' });
    expect(prisma.report.update.mock.calls[0][0].data.evidenceImage).toBe('data:image/jpeg;base64,OLD');
    prisma.report.update.mockClear();
    prisma.report.findUnique.mockResolvedValue({ id: 'm1', status: 'OPEN', source: 'USER' });
    await svc.createAutoNsfw('a', 'b', 's1', 0.9);
    expect(prisma.report.update).not.toHaveBeenCalled();
  });
  it('puts the chat log in time order even if lines were stored out of order', async () => {
    const { svc, prisma, redis } = setup();
    redis.lrange.mockResolvedValue([
      JSON.stringify({ userId: 'b', text: 'second', at: 20 }),
      JSON.stringify({ userId: 'a', text: 'first', at: 10 }),
    ]);
    await svc.createAutoNsfw('a', 'b', 's1', 0.9);
    expect(prisma.report.create.mock.calls[0][0].data.chatLog.map((m: any) => m.text)).toEqual(['first', 'second']);
  });
});
