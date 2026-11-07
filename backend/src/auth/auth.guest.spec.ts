import { BadRequestException, HttpException } from '@nestjs/common';
import { AuthService } from './auth.service';

function setup(counts: { device?: number; ip?: number } = {}) {
  const prisma: any = {
    user: {
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'g1', ...data })),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const redis: any = {
    incr: jest.fn().mockImplementation(async (key: string) =>
      key.includes(':device:') ? counts.device ?? 1 : counts.ip ?? 1,
    ),
    expire: jest.fn(),
  };
  const jwt: any = { sign: jest.fn().mockReturnValue('tok') };
  return { svc: new AuthService(prisma, jwt, redis, { issue: jest.fn() } as any, { sendVerificationQuietly: jest.fn() } as any), prisma, jwt };
}

const ctx = { ip: '1.2.3.4', deviceId: 'dev-0123456789abcdef', country: 'US' };

describe('AuthService guests', () => {
  it('creates an attested-adult guest without email and with a short token', async () => {
    const { svc, prisma, jwt } = setup();
    const res = await svc.createGuest(ctx);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.isGuest).toBe(true);
    expect(data.email).toBeUndefined();
    expect(data.adultAttestedAt).toBeInstanceOf(Date);
    expect(data.trialEndsAt.getTime()).toBeLessThan(Date.now()); // free plan, no filters
    expect(jwt.sign).toHaveBeenCalledWith({ sub: 'g1', guest: true }, { expiresIn: '4h' });
    expect(res.access_token).toBe('tok');
  });

  it('requires a device id', async () => {
    await expect(setup().svc.createGuest({ ...ctx, deviceId: null })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('caps guests per device and per IP', async () => {
    await expect(setup({ device: 4 }).svc.createGuest(ctx)).rejects.toBeInstanceOf(HttpException);
    await expect(setup({ ip: 11 }).svc.createGuest(ctx)).rejects.toBeInstanceOf(HttpException);
  });

  it('only upgrades guests, and only to adults', async () => {
    const { svc, prisma } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'u', isGuest: false });
    await expect(
      svc.upgradeGuest('u', { email: 'a@b.co', password: 'password1', displayName: 'Al', birthdate: '1990-01-01', gender: 'MALE' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'g', isGuest: true });
    await expect(
      svc.upgradeGuest('g', { email: 'a@b.co', password: 'password1', displayName: 'Al', birthdate: '2015-01-01', gender: 'MALE' }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('AuthService.isAdultUser', () => {
  const old = new Date('1990-01-01');
  const young = new Date(Date.now() - 10 * 365 * 24 * 3600 * 1000);
  it('uses birthdate when present', () => {
    expect(AuthService.isAdultUser({ birthdate: old })).toBe(true);
    expect(AuthService.isAdultUser({ birthdate: young, isGuest: true, adultAttestedAt: new Date() })).toBe(false);
  });
  it('accepts attestation only for guests', () => {
    expect(AuthService.isAdultUser({ birthdate: null, isGuest: true, adultAttestedAt: new Date() })).toBe(true);
    expect(AuthService.isAdultUser({ birthdate: null, isGuest: false, adultAttestedAt: new Date() })).toBe(false);
    expect(AuthService.isAdultUser({ birthdate: null })).toBe(false);
  });
});
