import { BadRequestException, ConflictException, HttpException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AppealsService } from './appeals.service';

const DAY = 86_400_000;
const hash = bcrypt.hashSync('password123', 4);

function setup(opts: { user?: any; last?: any; attempts?: number } = {}) {
  const user = 'user' in opts ? opts.user : { id: 'u', passwordHash: hash, status: 'BANNED' };
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn() },
    appeal: {
      findFirst: jest.fn().mockResolvedValue(opts.last ?? null),
      create: jest.fn().mockResolvedValue({ id: 'a1', status: 'OPEN' }),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const redis: any = { incr: jest.fn().mockResolvedValue(opts.attempts ?? 1), expire: jest.fn() };
  const audit = { log: jest.fn() };
  const bans = { liftUserFootprint: jest.fn() };
  return { svc: new AppealsService(prisma, redis, audit as any, bans as any), prisma, audit, bans };
}
const msg = 'I was banned by mistake, my brother used my laptop that evening.';

describe('AppealsService.create', () => {
  it('lets a banned user with the right password appeal', async () => {
    const { svc, prisma } = setup();
    await expect(svc.create('a@b.co', 'password123', msg)).resolves.toEqual({ id: 'a1', status: 'OPEN' });
    expect(prisma.appeal.create.mock.calls[0][0].data).toEqual({ userId: 'u', message: msg });
  });
  it('gives the same error for a wrong password and an unknown email', async () => {
    await expect(setup().svc.create('a@b.co', 'nope', msg)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(setup({ user: null }).svc.create('a@b.co', 'password123', msg)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('limits password attempts per email', async () => {
    await expect(setup({ attempts: 11 }).svc.create('a@b.co', 'password123', msg)).rejects.toBeInstanceOf(HttpException);
  });
  it('refuses active accounts, short messages, a second open appeal and appealing again too soon', async () => {
    await expect(setup({ user: { id: 'u', passwordHash: hash, status: 'ACTIVE' } }).svc.create('a@b.co', 'password123', msg)).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup().svc.create('a@b.co', 'password123', 'too short')).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ last: { status: 'OPEN', createdAt: new Date() } }).svc.create('a@b.co', 'password123', msg)).rejects.toBeInstanceOf(ConflictException);
    const soon = setup({ last: { status: 'REJECTED', createdAt: new Date(Date.now() - 2 * DAY) } });
    await expect(soon.svc.create('a@b.co', 'password123', msg)).rejects.toMatchObject({ status: 429 });
    const later = setup({ last: { status: 'REJECTED', createdAt: new Date(Date.now() - 8 * DAY) } });
    await expect(later.svc.create('a@b.co', 'password123', msg)).resolves.toMatchObject({ status: 'OPEN' });
  });
});

describe('AppealsService.lookup', () => {
  it('reports whether the user can appeal', async () => {
    expect((await setup().svc.lookup('a@b.co', 'password123')).canAppeal).toBe(true);
    const open = await setup({ last: { status: 'OPEN', createdAt: new Date() } }).svc.lookup('a@b.co', 'password123');
    expect(open.canAppeal).toBe(false);
    expect(open.appeal?.status).toBe('OPEN');
    const rejected = await setup({ last: { status: 'REJECTED', createdAt: new Date(), decisionNote: 'Clear violation' } }).svc.lookup('a@b.co', 'password123');
    expect(rejected.canAppeal).toBe(false);
    expect(rejected.nextAppealAt).toBeInstanceOf(Date);
    expect((await setup({ user: { id: 'u', passwordHash: hash, status: 'ACTIVE' } }).svc.lookup('a@b.co', 'password123')).canAppeal).toBe(false);
  });
});

describe('AppealsService.decide', () => {
  const open = { id: 'a1', userId: 'u', status: 'OPEN' };
  it('approving restores the account, lifts the device/IP bans and is audited', async () => {
    const { svc, prisma, bans, audit } = setup();
    prisma.appeal.findUnique.mockResolvedValue(open);
    await svc.decide('mod', 'a1', 'APPROVE', 'ok');
    expect(bans.liftUserFootprint).toHaveBeenCalledWith('u');
    expect(prisma.user.update.mock.calls[0][0].data.status).toBe('ACTIVE');
    expect(prisma.appeal.update.mock.calls[0][0].data).toMatchObject({ status: 'APPROVED', decidedById: 'mod', decisionNote: 'ok' });
    expect(audit.log).toHaveBeenCalledWith('mod', 'APPEAL_DECIDED', expect.objectContaining({ targetUserId: 'u' }));
  });
  it('rejecting leaves the account as it is', async () => {
    const { svc, prisma, bans } = setup();
    prisma.appeal.findUnique.mockResolvedValue(open);
    await svc.decide('mod', 'a1', 'REJECT', 'Clear violation');
    expect(bans.liftUserFootprint).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.appeal.update.mock.calls[0][0].data.status).toBe('REJECTED');
  });
  it('cannot decide twice or decide your own appeal', async () => {
    const { svc, prisma } = setup();
    prisma.appeal.findUnique.mockResolvedValue({ ...open, status: 'APPROVED' });
    await expect(svc.decide('mod', 'a1', 'APPROVE')).rejects.toBeInstanceOf(ConflictException);
    prisma.appeal.findUnique.mockResolvedValue(open);
    await expect(svc.decide('u', 'a1', 'APPROVE')).rejects.toBeInstanceOf(BadRequestException);
  });
});
