import { BadRequestException, HttpException } from '@nestjs/common';
import { ReportsService } from './reports.service';

function setup(overrides: { session?: any; rate?: number; existing?: any } = {}) {
  const prisma: any = {
    callSession: {
      findUnique: jest.fn().mockResolvedValue(
        'session' in overrides ? overrides.session : { userAId: 'a', userBId: 'b' },
      ),
    },
    report: {
      findUnique: jest.fn().mockResolvedValue(overrides.existing ?? null),
      create: jest.fn().mockResolvedValue({ id: 'r1', status: 'OPEN' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: { updateMany: jest.fn(), update: jest.fn() },
  };
  const redis: any = {
    incr: jest.fn().mockResolvedValue(overrides.rate ?? 1),
    expire: jest.fn(),
    lrange: jest.fn().mockResolvedValue([]),
  };
  return { svc: new ReportsService(prisma, redis, {} as any, { log: jest.fn() } as any), prisma };
}

const dto = { reportedUserId: 'b', sessionId: 's1', reasonCode: 'NUDITY' as const };

describe('ReportsService.create', () => {
  it('rejects self reports', async () => {
    await expect(setup().svc.create('b', dto)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects reports for sessions the reporter was not in', async () => {
    await expect(setup().svc.create('x', dto)).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ session: null }).svc.create('a', dto)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rate limits reporters', async () => {
    await expect(setup({ rate: 11 }).svc.create('a', dto)).rejects.toBeInstanceOf(HttpException);
  });
  it('returns the existing report instead of creating a duplicate', async () => {
    const { svc, prisma } = setup({ existing: { id: 'old', status: 'OPEN' } });
    await expect(svc.create('a', dto)).resolves.toEqual({ id: 'old', status: 'OPEN' });
    expect(prisma.report.create).not.toHaveBeenCalled();
  });
  it('does not suspend when too few distinct reporters', async () => {
    const { svc, prisma } = setup();
    prisma.report.findMany.mockResolvedValue(Array(5).fill({ reporterId: 'same' }));
    await svc.create('a', dto);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it('suspends at the threshold of distinct aged reporters', async () => {
    const { svc, prisma } = setup();
    prisma.report.findMany.mockResolvedValue(['1', '2', '3', '4', '5'].map((r) => ({ reporterId: r })));
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    await svc.create('a', dto);
    expect(prisma.user.updateMany).toHaveBeenCalled();
  });
  it('flags (shadow queue) at 3 distinct reporters without suspending', async () => {
    const { svc, prisma } = setup();
    prisma.report.findMany.mockResolvedValue(['1', '2', '3'].map((r) => ({ reporterId: r })));
    await svc.create('a', { ...dto, reasonCode: 'SPAM' as any });
    expect(prisma.user.update).toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
