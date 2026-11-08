import { ConflictException } from '@nestjs/common';
import { FriendsService } from './friends.service';

function setup(existing: any) {
  const tx: any = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    friend: {
      findFirst: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'f1', ...data })),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'new', ...data })),
    },
  };
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'x', status: 'ACTIVE' }) },
    callSession: { findFirst: jest.fn().mockResolvedValue({ id: 's' }) },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(tx)),
  };
  const blocks: any = { isBlockedEitherWay: jest.fn().mockResolvedValue(false) };
  return { svc: new FriendsService(prisma, {} as any, blocks), tx, prisma };
}

describe('friend requests', () => {
  it('check-and-create runs inside one transaction holding a lock for the pair', async () => {
    const { svc, tx, prisma } = setup(null);
    await svc.sendRequest('a', 'b');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.friend.create).toHaveBeenCalledWith({ data: { userAId: 'a', userBId: 'b', status: 'PENDING' } });
  });
  it('the lock is the same whichever side asks first', async () => {
    const first = setup(null);
    await first.svc.sendRequest('a', 'b');
    const second = setup(null);
    await second.svc.sendRequest('b', 'a');
    const key = (t: any) => t.tx.$executeRaw.mock.calls[0].slice(1)[0];
    expect(key(first)).toBe(key(second));
  });
  it('a request that crosses an earlier one from the other side accepts it instead of duplicating', async () => {
    const { svc, tx } = setup({ id: 'f1', userAId: 'b', userBId: 'a', status: 'PENDING' });
    await svc.sendRequest('a', 'b');
    expect(tx.friend.create).not.toHaveBeenCalled();
    expect(tx.friend.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { status: 'ACCEPTED' } });
  });
  it('asking twice is refused', async () => {
    const { svc } = setup({ id: 'f1', userAId: 'a', userBId: 'b', status: 'PENDING' });
    await expect(svc.sendRequest('a', 'b')).rejects.toBeInstanceOf(ConflictException);
  });
});
