import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersAdminService } from './users-admin.service';

function setup(user: any = { id: 'u', status: 'ACTIVE', role: 'USER', isGuest: false }) {
  const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) } };
  const bans = { banUserFootprint: jest.fn(), liftUserFootprint: jest.fn() };
  const audit = { log: jest.fn(), list: jest.fn() };
  const redis = { publish: jest.fn().mockResolvedValue(1) };
  return { svc: new UsersAdminService(prisma, bans as any, audit as any, redis as any), prisma, bans, audit, redis };
}
const mod = { userId: 'mod', role: 'MODERATOR' };

describe('UsersAdminService', () => {
  it('bans: status change, device/IP footprint and an audit entry', async () => {
    const { svc, prisma, bans, audit } = setup();
    await svc.setStatus(mod, 'u', 'BAN', 'abuse');
    expect(prisma.user.update.mock.calls[0][0].data.status).toBe('BANNED');
    expect(bans.banUserFootprint).toHaveBeenCalledWith('u', 'mod', 'abuse');
    expect(audit.log).toHaveBeenCalledWith('mod', 'USER_STATUS', { targetUserId: 'u', meta: { from: 'ACTIVE', to: 'BANNED', note: 'abuse' } });
  });
  it('suspending or banning also drops the user\'s live sockets; restoring does not', async () => {
    const a = setup();
    await a.svc.setStatus(mod, 'u', 'SUSPEND');
    expect(a.redis.publish).toHaveBeenCalledWith('wavely:user-kick', 'u');
    const b = setup({ id: 'u', status: 'BANNED', role: 'USER' });
    await b.svc.setStatus(mod, 'u', 'RESTORE');
    expect(b.redis.publish).not.toHaveBeenCalled();
  });
  it('restore lifts the footprint', async () => {
    const { svc, bans } = setup({ id: 'u', status: 'BANNED', role: 'USER' });
    await svc.setStatus(mod, 'u', 'RESTORE');
    expect(bans.liftUserFootprint).toHaveBeenCalledWith('u');
  });
  it('cannot change your own status, nor act on an admin unless you are one', async () => {
    const { svc } = setup();
    await expect(svc.setStatus({ userId: 'u', role: 'MODERATOR' }, 'u', 'BAN')).rejects.toBeInstanceOf(BadRequestException);
    const admin = setup({ id: 'a', status: 'ACTIVE', role: 'ADMIN' });
    await expect(admin.svc.setStatus(mod, 'a', 'BAN')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(admin.svc.setStatus({ userId: 'boss', role: 'ADMIN' }, 'a', 'SUSPEND')).resolves.toMatchObject({ ok: true });
  });
  it('roles: not your own, not for guests, audited', async () => {
    const { svc, audit } = setup();
    await expect(svc.setRole('x', 'x', 'ADMIN')).rejects.toBeInstanceOf(BadRequestException);
    await svc.setRole('admin', 'u', 'MODERATOR');
    expect(audit.log).toHaveBeenCalledWith('admin', 'ROLE_CHANGED', { targetUserId: 'u', meta: { from: 'USER', to: 'MODERATOR' } });
    const guest = setup({ id: 'g', role: 'USER', isGuest: true });
    await expect(guest.svc.setRole('admin', 'g', 'MODERATOR')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('search matches id, email, name, ip and device and caps results', async () => {
    const { svc, prisma } = setup();
    await svc.search('  1.2.3.4 ');
    const q = prisma.user.findMany.mock.calls[0][0];
    expect(q.take).toBe(25);
    expect(q.where.OR).toEqual(expect.arrayContaining([{ lastIp: '1.2.3.4' }, { lastDeviceId: '1.2.3.4' }, { id: '1.2.3.4' }]));
    expect(await svc.search('   ')).toEqual([]);
  });
});
