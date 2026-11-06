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
  const redis: any = { incr: jest.fn().mockResolvedValue(1), expire: jest.fn() };
  return { svc: new ReportsService(prisma, redis, {} as any), prisma, redis };
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
