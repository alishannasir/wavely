import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DataRightsService } from './data-rights.service';

const hash = bcrypt.hashSync('mypassword1', 4);

function setup(over: { user?: any; made?: number; received?: number } = {}) {
  const user = 'user' in over ? over.user : { id: 'u', email: 'a@b.co', passwordHash: hash, deletedAt: null };
  const op = (name: string) => jest.fn().mockReturnValue(name);
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue(user), update: op('anonymise'), delete: op('hardDelete') },
    message: { deleteMany: op('messages') },
    friend: { deleteMany: op('friends'), findMany: jest.fn().mockResolvedValue([]) },
    block: { deleteMany: op('blocks'), findMany: jest.fn().mockResolvedValue([{ blockerId: 'u', blockedId: 'x' }]) },
    appeal: { deleteMany: op('appeals'), findMany: jest.fn().mockResolvedValue([]) },
    emailToken: { deleteMany: op('tokens') },
    dailyUsage: { deleteMany: op('usage'), findMany: jest.fn().mockResolvedValue([]) },
    subscription: { deleteMany: op('subs'), findMany: jest.fn().mockResolvedValue([]) },
    callSession: { deleteMany: op('sessions'), findMany: jest.fn().mockResolvedValue([]) },
    message2: {},
    report: { count: jest.fn().mockResolvedValueOnce(over.made ?? 0).mockResolvedValueOnce(over.received ?? 0), findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const chain: any = { srem: jest.fn(() => chain), del: jest.fn(() => chain), zrem: jest.fn(() => chain), exec: jest.fn() };
  const stripe = { cancelSubscriptionsFor: jest.fn() };
  const mail = { trySend: jest.fn() };
  return { svc: new DataRightsService(prisma, { multi: () => chain } as any, stripe as any, mail as any), prisma, chain, stripe, mail };
}

describe('deleteAccount', () => {
  it('needs the right password', async () => {
    await expect(setup().svc.deleteAccount('u', {})).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(setup().svc.deleteAccount('u', { password: 'wrong-one' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('accounts without a password (Google, guests) must type DELETE', async () => {
    const s = setup({ user: { id: 'u', email: 'g@x.co', passwordHash: null } });
    await expect(s.svc.deleteAccount('u', {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.svc.deleteAccount('u', { confirm: 'delete' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.svc.deleteAccount('u', { confirm: 'DELETE' })).resolves.toMatchObject({ ok: true });
  });
  it('unknown or already-deleted accounts are 404', async () => {
    await expect(setup({ user: null }).svc.deleteAccount('u', { password: 'mypassword1' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ user: { id: 'u', deletedAt: new Date() } }).svc.deleteAccount('u', {})).rejects.toBeInstanceOf(NotFoundException);
  });
  it('removes the user entirely when there are no moderation records', async () => {
    const { svc, prisma, stripe } = setup();
    expect(await svc.deleteAccount('u', { password: 'mypassword1' })).toEqual({ ok: true, anonymised: false });
    expect(stripe.cancelSubscriptionsFor).toHaveBeenCalledWith('u');
    const ops = prisma.$transaction.mock.calls[0][0];
    expect(ops).toEqual(expect.arrayContaining(['messages', 'friends', 'blocks', 'appeals', 'tokens', 'usage', 'subs', 'sessions', 'hardDelete']));
    expect(ops).not.toContain('anonymise');
    expect(prisma.callSession.deleteMany.mock.calls[0][0].where.reports).toEqual({ none: {} }); // reported calls are never erased
  });
  it('anonymises and locks the row when the user is in a report (made or received)', async () => {
    for (const over of [{ made: 1 }, { received: 2 }]) {
      const { svc, prisma } = setup(over);
      expect(await svc.deleteAccount('u', { password: 'mypassword1' })).toEqual({ ok: true, anonymised: true });
      const data = prisma.user.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ email: null, passwordHash: null, displayName: 'Deleted user', status: 'BANNED', lastIp: null, lastDeviceId: null, birthdate: null });
      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    }
  });
  it('cleans Redis (block mirrors, queue, presence) and sends a confirmation', async () => {
    const { svc, chain, mail } = setup();
    await svc.deleteAccount('u', { password: 'mypassword1' });
    expect(chain.srem).toHaveBeenCalledWith('mm:block:x', 'u');
    expect(chain.zrem).toHaveBeenCalledWith('mm:queue', 'u');
    expect(chain.del).toHaveBeenCalledWith('mm:block:u', 'mm:recent:u', 'mm:entry:u', 'presence:sockets:u');
    expect(mail.trySend).toHaveBeenCalled();
  });
});

describe('exportData', () => {
  it('has no secrets and no other people\'s identities beyond display names', async () => {
    const { svc, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'u', email: 'a@b.co', passwordHash: hash, tokenVersion: 3, deletedAt: null, displayName: 'Al' });
    prisma.friend.findMany.mockResolvedValue([{ userAId: 'u', userBId: 'f', status: 'ACCEPTED', createdAt: new Date(), userA: { id: 'u', displayName: 'Al' }, userB: { id: 'f', displayName: 'Bo' } }]);
    prisma.message.findMany = jest.fn().mockResolvedValue([{ senderId: 'f', receiverId: 'u', content: 'hi', createdAt: new Date(), sender: { displayName: 'Bo' }, receiver: { displayName: 'Al' } }]);
    prisma.block.findMany.mockResolvedValue([{ createdAt: new Date(), blocked: { displayName: 'Cy' } }]);
    const out: any = await svc.exportData('u');
    expect(out.blockedPeople).toEqual([expect.objectContaining({ name: 'Cy' })]);
    const json = JSON.stringify(out);
    expect(json).not.toContain(hash);
    expect(out.profile.passwordHash).toBeUndefined();
    expect(out.profile.tokenVersion).toBeUndefined();
    expect(out.friends).toEqual([expect.objectContaining({ with: 'Bo', status: 'ACCEPTED' })]);
    expect(out.messages).toEqual([expect.objectContaining({ direction: 'received', with: 'Bo', content: 'hi' })]);
    expect(out.reportsAboutYou).toEqual([]); // counts only, never reporter identities
  });
});
