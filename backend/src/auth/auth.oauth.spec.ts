import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

const jwt = new JwtService({ secret: 'k'.repeat(40) });
const profile = { provider: 'GOOGLE' as const, email: 'new@gmail.com', displayName: 'Gina G', avatarUrl: 'https://img/x.png' };

function setup(opts: { byEmail?: any; guest?: any } = {}) {
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockImplementation(async ({ where }: any) => (where.email ? opts.byEmail ?? null : opts.guest ?? null)),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'guest1', isGuest: false, status: 'ACTIVE', tokenVersion: 1, ...data })),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'new1', status: 'ACTIVE', tokenVersion: 0, ...data })),
    },
  };
  const session = { issue: jest.fn((u: any) => ({ access_token: 't', user: u })) };
  return { svc: new AuthService(prisma, jwt, {} as any, session as any, { sendVerificationQuietly: jest.fn() } as any), prisma };
}
const activeGuest = { id: 'guest1', isGuest: true, status: 'ACTIVE', displayName: 'Guest1234' };

describe('guest merge state', () => {
  it('only guests can ask for one, and it is a signed 15-minute token', async () => {
    await expect(setup({ guest: { isGuest: false } }).svc.createGuestMergeState('u')).rejects.toBeInstanceOf(BadRequestException);
    const { svc } = setup({ guest: { isGuest: true } });
    const { state } = await svc.createGuestMergeState('guest1');
    expect(svc.readGuestMergeState(state)).toBe('guest1');
    const payload: any = jwt.decode(state);
    expect(payload.exp - payload.iat).toBe(15 * 60);
  });
  it('ignores anything that is not a valid merge token (login tokens, garbage, other signatures)', () => {
    const { svc } = setup();
    expect(svc.readGuestMergeState(jwt.sign({ sub: 'victim' }))).toBeNull(); // an ordinary login token is not a merge token
    expect(svc.readGuestMergeState('garbage')).toBeNull();
    expect(svc.readGuestMergeState(undefined)).toBeNull();
    expect(svc.readGuestMergeState(new JwtService({ secret: 'other-secret-other-secret-other-secret!' }).sign({ sub: 'x', purpose: 'guest-merge' }))).toBeNull();
  });
});

describe('oauthLogin with a guest session', () => {
  it('turns the guest into the Google account (same row, nothing lost)', async () => {
    const { svc, prisma } = setup({ guest: activeGuest });
    await svc.oauthLogin(profile, 'US', 'guest1');
    expect(prisma.user.create).not.toHaveBeenCalled();
    const upd = prisma.user.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'guest1' });
    expect(upd.data).toMatchObject({ email: 'new@gmail.com', authProvider: 'GOOGLE', isGuest: false, displayName: 'Gina G', tokenVersion: { increment: 1 } });
    expect(upd.data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(upd.data.trialEndsAt).toBeInstanceOf(Date);
  });
  it('signs in to an existing account for that email and leaves the guest alone', async () => {
    const existing = { id: 'old1', email: 'new@gmail.com', status: 'ACTIVE', isGuest: false };
    const { svc, prisma } = setup({ byEmail: existing, guest: activeGuest });
    await svc.oauthLogin(profile, 'US', 'guest1');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
  it('does not merge a suspended or non-guest row; creates a normal new account instead', async () => {
    for (const guest of [{ ...activeGuest, status: 'SUSPENDED' }, { ...activeGuest, isGuest: false }]) {
      const { svc, prisma } = setup({ guest });
      await svc.oauthLogin(profile, 'US', 'guest1');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.create).toHaveBeenCalled();
    }
  });
  it('without a guest it creates the account as before (verified, onboarding collects the birthdate)', async () => {
    const { svc, prisma } = setup();
    await svc.oauthLogin(profile, 'US');
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: 'new@gmail.com', authProvider: 'GOOGLE' });
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
  });
  it('banned accounts cannot sign in with Google', async () => {
    await expect(setup({ byEmail: { id: 'b', status: 'BANNED' } }).svc.oauthLogin(profile, null)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
