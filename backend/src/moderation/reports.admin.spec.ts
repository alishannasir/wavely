import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminGuard, ModeratorGuard } from './roles.guard';
import { ReportsService } from './reports.service';

function setup(report: any = { id: 'r1', reportedUserId: 'u', status: 'OPEN', reasonCode: 'NUDITY', legalHold: false }) {
  const prisma: any = {
    report: {
      findUnique: jest.fn().mockResolvedValue(report),
      findMany: jest.fn().mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]),
      updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    user: { update: jest.fn(), findUnique: jest.fn().mockResolvedValue({ role: 'USER' }) },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const bans = { banUserFootprint: jest.fn(), liftUserFootprint: jest.fn() };
  const audit = { log: jest.fn(), list: jest.fn().mockResolvedValue({ items: [], total: 0 }) };
  const redis = { incr: jest.fn(), expire: jest.fn(), lrange: jest.fn(), publish: jest.fn().mockResolvedValue(1) };
  const svc = new ReportsService(prisma, redis as any, bans as any, audit as any);
  return { svc, prisma, bans, audit, redis };
}

describe('evidence purge keeps what must be kept', () => {
  it('never purges legal holds or undecided possible-minor reports', async () => {
    const { svc, prisma } = setup();
    await svc.purgeExpiredEvidence();
    const where = prisma.report.updateMany.mock.calls[0][0].where;
    expect(where.legalHold).toBe(false);
    expect(where.NOT).toEqual({ reasonCode: 'MINOR_CONCERN', status: { not: 'RESOLVED' } });
    expect(where.evidenceExpiresAt.lt).toBeInstanceOf(Date);
  });
});

describe('resolve', () => {
  it('keeps evidence of an actioned report for 90 days and writes an audit entry', async () => {
    const { svc, prisma, audit, bans } = setup();
    await svc.resolve('r1', 'mod', 'BAN');
    expect(prisma.report.updateMany.mock.calls[0][0].data.resolution).toBe('BAN');
    const retention = prisma.report.updateMany.mock.calls[1][0];
    expect(retention.where.legalHold).toBe(false); // evidence under legal hold keeps its hold, no new expiry
    const days = (retention.data.evidenceExpiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89);
    expect(days).toBeLessThan(91);
    expect(bans.banUserFootprint).toHaveBeenCalledWith('u', 'mod', 'report r1');
    expect(audit.log).toHaveBeenCalledWith('mod', 'REPORT_RESOLVED', expect.objectContaining({ reportId: 'r1', meta: { action: 'BAN', reportsResolved: 2 } }));
  });
  it('a moderator cannot ban, suspend or restore an administrator through a report; an administrator can', async () => {
    const { svc, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    await expect(svc.resolve('r1', 'mod', 'BAN', 'MODERATOR')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.resolve('r1', 'mod', 'SUSPEND')).rejects.toBeInstanceOf(ForbiddenException); // role defaults to the weakest
    await expect(svc.resolve('r1', 'boss', 'BAN', 'ADMIN')).resolves.toMatchObject({ ok: true });
    await expect(svc.resolve('r1', 'mod', 'DISMISS', 'MODERATOR')).resolves.toMatchObject({ ok: true }); // dismissing harms nobody
  });
  it('a suspension or ban drops the user\'s live sockets', async () => {
    const { svc, redis } = setup();
    await svc.resolve('r1', 'mod', 'SUSPEND', 'MODERATOR');
    expect(redis.publish).toHaveBeenCalledWith('wavely:user-kick', 'u');
  });
  it('a dismissal does not extend retention', async () => {
    const { svc, prisma } = setup();
    await svc.resolve('r1', 'mod', 'DISMISS');
    expect(prisma.report.updateMany).toHaveBeenCalledTimes(1); // only the status update, no retention change
  });
  it('moderators cannot rule on reports about themselves', async () => {
    const { svc } = setup();
    await expect(svc.resolve('r1', 'u', 'DISMISS')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('legal hold', () => {
  it('escalation locks the evidence, moves the report to review and is audited', async () => {
    const { svc, prisma, audit } = setup();
    await svc.escalate('r1', 'mod', 'suspected CSAM');
    expect(prisma.report.update.mock.calls[0][0].data).toMatchObject({
      legalHold: true,
      evidenceExpiresAt: null,
      status: 'REVIEWING',
      escalatedById: 'mod',
      escalationNote: 'suspected CSAM',
    });
    expect(audit.log).toHaveBeenCalledWith('mod', 'REPORT_ESCALATED', expect.objectContaining({ reportId: 'r1' }));
  });
  it('releasing a hold restores a normal expiry and is audited', async () => {
    const { svc, prisma, audit } = setup({ id: 'r1', reportedUserId: 'u', legalHold: true });
    await svc.releaseHold('r1', 'admin');
    const data = prisma.report.update.mock.calls[0][0].data;
    expect(data.legalHold).toBe(false);
    expect(data.evidenceExpiresAt).toBeInstanceOf(Date);
    expect(audit.log).toHaveBeenCalledWith('admin', 'HOLD_RELEASED', expect.anything());
  });
  it('releasing a report that is not on hold does nothing', async () => {
    const { svc, prisma, audit } = setup();
    await svc.releaseHold('r1', 'admin');
    expect(prisma.report.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
  it('unknown reports are 404', async () => {
    const { svc, prisma } = setup();
    prisma.report.findUnique.mockResolvedValue(null);
    await expect(svc.escalate('x', 'mod')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('queue', () => {
  it('filters, paginates and lists held reports first', async () => {
    const { svc, prisma } = setup();
    prisma.report.findMany.mockResolvedValue([]);
    await svc.listForReview({ status: 'OPEN', reason: 'MINOR_CONCERN', source: 'USER', hold: 'true', skip: 20, take: 500 });
    const q = prisma.report.findMany.mock.calls[0][0];
    expect(q.where).toMatchObject({ status: 'OPEN', reasonCode: 'MINOR_CONCERN', source: 'USER', legalHold: true });
    expect(q.skip).toBe(20);
    expect(q.take).toBe(100); // capped
    expect(q.orderBy[0]).toEqual({ legalHold: 'desc' });
  });
});

describe('role guards', () => {
  const ctx = (role?: string) => ({ switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) }) as any;
  it('moderator endpoints need MODERATOR or ADMIN', () => {
    const g = new ModeratorGuard();
    expect(g.canActivate(ctx('MODERATOR'))).toBe(true);
    expect(g.canActivate(ctx('ADMIN'))).toBe(true);
    expect(() => g.canActivate(ctx('USER'))).toThrow(ForbiddenException);
    expect(() => g.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
  it('admin-only endpoints reject moderators', () => {
    const g = new AdminGuard();
    expect(g.canActivate(ctx('ADMIN'))).toBe(true);
    expect(() => g.canActivate(ctx('MODERATOR'))).toThrow(ForbiddenException);
  });
});
