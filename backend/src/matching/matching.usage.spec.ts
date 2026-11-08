import { MatchingService, billableMinutes } from './matching.service';

function setup(session: any) {
  const prisma: any = {
    callSession: {
      findUnique: jest.fn().mockResolvedValue(session),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    dailyUsage: { upsert: jest.fn() },
  };
  const redis: any = { defineCommand: jest.fn() };
  return { svc: new MatchingService(redis, prisma), prisma };
}

const startedAt = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000);

describe('usage accounting', () => {
  it('counts a match when the call starts (matches only)', async () => {
    const { svc, prisma } = setup(null);
    await svc.recordMatchStart(['a', 'b']);
    expect(prisma.dailyUsage.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.dailyUsage.upsert.mock.calls[0][0].update).toEqual({ matchesUsed: { increment: 1 } });
  });

  it('bills minutes (not matches) when the call ends', async () => {
    const { svc, prisma } = setup({ id: 's', userAId: 'a', userBId: 'b', startedAt: startedAt(5), endedAt: null });
    await svc.closeSession('s');
    expect(prisma.dailyUsage.upsert).toHaveBeenCalledTimes(2);
    const call = prisma.dailyUsage.upsert.mock.calls[0][0];
    expect(call.update).toEqual({ minutesUsed: { increment: 5 } });
    expect(call.create.matchesUsed).toBe(0);
  });

  it('does not bill an instant skip', async () => {
    const { svc, prisma } = setup({ id: 's', userAId: 'a', userBId: 'b', startedAt: startedAt(0), endedAt: null });
    await svc.closeSession('s');
    expect(prisma.dailyUsage.upsert).not.toHaveBeenCalled();
  });

  it('caps a stuck session at the 2h token lifetime', async () => {
    const { svc, prisma } = setup({ id: 's', userAId: 'a', userBId: 'b', startedAt: startedAt(600), endedAt: null });
    await svc.closeSession('s');
    expect(prisma.dailyUsage.upsert.mock.calls[0][0].update).toEqual({ minutesUsed: { increment: 120 } });
  });

  it('is a no-op if another side already closed it', async () => {
    const { svc, prisma } = setup({ id: 's', userAId: 'a', userBId: 'b', startedAt: startedAt(5), endedAt: null });
    prisma.callSession.updateMany.mockResolvedValue({ count: 0 });
    await svc.closeSession('s');
    expect(prisma.dailyUsage.upsert).not.toHaveBeenCalled();
  });
});

describe('billableMinutes', () => {
  it('instant skips are free, partial minutes count as a whole minute', () => {
    expect(billableMinutes(0)).toBe(0);
    expect(billableMinutes(9_000)).toBe(0); // a skip
    expect(billableMinutes(10_000)).toBe(1);
    expect(billableMinutes(29_000)).toBe(1); // used to round down to 0: free chatting
    expect(billableMinutes(60_000)).toBe(1);
    expect(billableMinutes(89_000)).toBe(2);
    expect(billableMinutes(5 * 60_000 + 40)).toBe(5); // a few ms over a whole minute is not another minute
  });
});
