import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BlocksService } from './blocks.service';
import { FriendsService } from '../friends/friends.service';

function setup(opts: { target?: any; reverse?: any } = {}) {
  const exec = jest.fn();
  const chain: any = { sadd: jest.fn(() => chain), srem: jest.fn(() => chain), exec };
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue('target' in opts ? opts.target : { id: 'b' }) },
    block: {
      upsert: jest.fn().mockReturnValue('upsert'),
      deleteMany: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(opts.reverse ?? null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    friend: { deleteMany: jest.fn().mockReturnValue('deleteFriends') },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const redis: any = { multi: jest.fn(() => chain) };
  return { svc: new BlocksService(prisma, redis), prisma, chain };
}

describe('BlocksService', () => {
  it('cannot block yourself or a user that does not exist', async () => {
    await expect(setup().svc.block('a', 'a')).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ target: null }).svc.block('a', 'b')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocking records the block, ends any friendship, and mirrors both directions in Redis', async () => {
    const { svc, prisma, chain } = setup();
    await svc.block('a', 'b');
    expect(prisma.block.upsert.mock.calls[0][0].create).toEqual({ blockerId: 'a', blockedId: 'b' });
    expect(prisma.friend.deleteMany.mock.calls[0][0].where.OR).toEqual([
      { userAId: 'a', userBId: 'b' },
      { userAId: 'b', userBId: 'a' },
    ]);
    expect(prisma.$transaction).toHaveBeenCalledWith(['upsert', 'deleteFriends']);
    expect(chain.sadd).toHaveBeenCalledWith('mm:block:a', 'b');
    expect(chain.sadd).toHaveBeenCalledWith('mm:block:b', 'a');
  });

  it('unblocking clears the mirror, unless the other person blocked us too', async () => {
    const plain = setup();
    await plain.svc.unblock('a', 'b');
    expect(plain.chain.srem).toHaveBeenCalledWith('mm:block:a', 'b');
    expect(plain.chain.srem).toHaveBeenCalledWith('mm:block:b', 'a');
    const mutual = setup({ reverse: { id: 'x' } });
    await mutual.svc.unblock('a', 'b');
    expect(mutual.chain.srem).not.toHaveBeenCalled();
  });

  it('either direction counts as blocked', async () => {
    const { svc, prisma } = setup({ reverse: { id: 'x' } });
    expect(await svc.isBlockedEitherWay('a', 'b')).toBe(true);
    expect(prisma.block.findFirst.mock.calls[0][0].where.OR).toHaveLength(2);
  });
});

describe('friend requests across a block', () => {
  it('are refused without revealing who blocked whom', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'b', status: 'ACTIVE' }) } };
    const svc = new FriendsService(prisma, {} as any, { isBlockedEitherWay: jest.fn().mockResolvedValue(true) } as any);
    await expect(svc.sendRequest('a', 'b')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.sendRequest('a', 'b')).rejects.toThrow('You cannot add this person');
  });
});
