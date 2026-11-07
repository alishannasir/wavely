import { BadRequestException, ConflictException, ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AccountService } from './account.service';
import { EmailTokensService, TOKEN_TTL_MS, hashToken } from './email-tokens.service';
import { isVerificationRequired } from './verification';
import { RequireVerifiedGuard } from '../auth/verified.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { resetPasswordMail, verifyEmailMail } from '../mail/templates';
import { MailService, isMailDeliveryConfigured, mailTransport } from '../mail/mail.service';

const hash = bcrypt.hashSync('oldpassword1', 4);

function tokens(prismaOver: any = {}, redisOver: any = {}) {
  const prisma: any = {
    emailToken: { deleteMany: jest.fn(), create: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn().mockResolvedValue({ userId: 'u', newEmail: null }) },
    $transaction: jest.fn().mockResolvedValue([]),
    ...prismaOver,
  };
  const redis: any = { incr: jest.fn().mockResolvedValue(1), expire: jest.fn(), ...redisOver };
  return { svc: new EmailTokensService(prisma, redis), prisma, redis };
}

describe('EmailTokensService', () => {
  it('stores only a hash of the secret, with the right expiry per type', async () => {
    const { svc, prisma } = tokens();
    const raw = await svc.issue('u', 'RESET_PASSWORD');
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    const data = prisma.emailToken.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(hashToken(raw));
    expect(data.tokenHash).not.toContain(raw);
    const mins = (data.expiresAt.getTime() - Date.now()) / 60000;
    expect(mins).toBeGreaterThan(58);
    expect(mins).toBeLessThanOrEqual(60);
    expect(TOKEN_TTL_MS.VERIFY_EMAIL).toBe(24 * 3600_000);
    expect(prisma.emailToken.deleteMany.mock.calls[0][0].where).toEqual({ userId: 'u', type: 'RESET_PASSWORD', usedAt: null }); // older unused links die
  });
  it('a link works once: consume claims it with a single conditional update', async () => {
    const { svc, prisma } = tokens();
    expect(await svc.consume('VERIFY_EMAIL', 'secret')).not.toBeNull();
    const where = prisma.emailToken.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tokenHash: hashToken('secret'), type: 'VERIFY_EMAIL', usedAt: null });
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
    prisma.emailToken.updateMany.mockResolvedValue({ count: 0 }); // already used / expired / unknown
    expect(await svc.consume('VERIFY_EMAIL', 'secret')).toBeNull();
  });
  it('limits mails per address (3/h) and per IP (10/h)', async () => {
    await expect(tokens({}, { incr: jest.fn().mockResolvedValue(4) }).svc.checkSendLimit('a@b.co', '1.1.1.1')).rejects.toBeInstanceOf(HttpException);
    const ipOnly = tokens({}, { incr: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(11) });
    await expect(ipOnly.svc.checkSendLimit('a@b.co', '1.1.1.1')).rejects.toBeInstanceOf(HttpException);
    await expect(tokens().svc.checkSendLimit('a@b.co', null)).resolves.toBeUndefined();
  });
});

function account(user: any = { id: 'u', email: 'a@b.co', displayName: 'Al', passwordHash: hash, isGuest: false, emailVerifiedAt: null, tokenVersion: 0 }) {
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn().mockImplementation(async ({ data }) => ({ ...user, ...data })), updateMany: jest.fn() },
  };
  const tk = { issue: jest.fn().mockResolvedValue('RAWTOKEN'), consume: jest.fn(), checkSendLimit: jest.fn() };
  const mail = { send: jest.fn(), trySend: jest.fn() };
  const session = { issue: jest.fn().mockReturnValue({ access_token: 'new' }) };
  return { svc: new AccountService(prisma, tk as any, mail as any, session as any), prisma, tk, mail, session };
}

describe('AccountService', () => {
  it('verification: resend is refused when already verified, and mails a /verify-email link', async () => {
    const done = account({ id: 'u', email: 'a@b.co', emailVerifiedAt: new Date(), isGuest: false });
    await expect(done.svc.resendVerification('u', null)).rejects.toBeInstanceOf(BadRequestException);
    const { svc, mail } = account();
    await svc.resendVerification('u', '1.1.1.1');
    expect(mail.send.mock.calls[0][0].text).toContain('/verify-email?token=RAWTOKEN');
  });
  it('verifyEmail marks the user verified, and rejects bad links', async () => {
    const { svc, tk, prisma } = account();
    tk.consume.mockResolvedValue({ userId: 'u' });
    await svc.verifyEmail('x');
    expect(prisma.user.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'u', emailVerifiedAt: null } });
    tk.consume.mockResolvedValue(null);
    await expect(svc.verifyEmail('x')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('forgot password: same answer whether or not the email exists; no mail for unknown or Google-only accounts', async () => {
    const known = account();
    expect(await known.svc.forgotPassword('a@b.co', null)).toEqual({ ok: true });
    expect(known.mail.trySend.mock.calls[0][0].text).toContain('/reset-password?token=RAWTOKEN');
    const unknown = account(null);
    expect(await unknown.svc.forgotPassword('who@x.co', null)).toEqual({ ok: true });
    expect(unknown.mail.trySend).not.toHaveBeenCalled();
    const google = account({ id: 'g', email: 'g@x.co', passwordHash: null });
    await google.svc.forgotPassword('g@x.co', null);
    expect(google.mail.trySend).not.toHaveBeenCalled();
  });
  it('reset password: new hash, all sessions revoked (tokenVersion bump), security notice', async () => {
    const { svc, tk, prisma, mail } = account();
    tk.consume.mockResolvedValue({ userId: 'u' });
    await svc.resetPassword('x', 'brandnewpass');
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(await bcrypt.compare('brandnewpass', data.passwordHash)).toBe(true);
    expect(data.tokenVersion).toEqual({ increment: 1 });
    expect(mail.trySend).toHaveBeenCalled();
    tk.consume.mockResolvedValue(null);
    await expect(svc.resetPassword('x', 'brandnewpass')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('change password: needs the current password, must differ, signs out other devices, returns a fresh token', async () => {
    const { svc, prisma, session } = account();
    await expect(svc.changePassword('u', 'wrongpass1', 'newpassword1')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(svc.changePassword('u', 'oldpassword1', 'oldpassword1')).rejects.toBeInstanceOf(BadRequestException);
    expect(await svc.changePassword('u', 'oldpassword1', 'newpassword1')).toEqual({ access_token: 'new' });
    expect(prisma.user.update.mock.calls[0][0].data.tokenVersion).toEqual({ increment: 1 });
    expect(session.issue).toHaveBeenCalled();
    await expect(account({ id: 'g', passwordHash: null }).svc.changePassword('g', 'a', 'b')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('change email: password required, address must be free, link goes to the NEW address, old address is warned', async () => {
    const { svc, prisma, mail, tk } = account();
    await expect(svc.requestEmailChange('u', 'wrongpass1', 'new@x.co', null)).rejects.toBeInstanceOf(UnauthorizedException);
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'u', email: 'a@b.co', passwordHash: hash }).mockResolvedValueOnce({ id: 'other' });
    await expect(svc.requestEmailChange('u', 'oldpassword1', 'taken@x.co', null)).rejects.toBeInstanceOf(ConflictException);
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'u', email: 'a@b.co', passwordHash: hash }).mockResolvedValueOnce(null);
    await svc.requestEmailChange('u', 'oldpassword1', 'new@x.co', null);
    expect(tk.issue).toHaveBeenCalledWith('u', 'CHANGE_EMAIL', 'new@x.co');
    expect(mail.send.mock.calls[0][0].to).toBe('new@x.co');
    expect(mail.trySend.mock.calls[0][0].to).toBe('a@b.co');
  });
  it('confirm email change: applies it, marks verified, revokes sessions', async () => {
    const { svc, prisma, tk } = account();
    tk.consume.mockResolvedValue({ userId: 'u', newEmail: 'new@x.co' });
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ email: 'a@b.co' });
    await svc.confirmEmailChange('x');
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: 'new@x.co', tokenVersion: { increment: 1 } });
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
  });
});

describe('verification requirement', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });
  const ctx = (user: any) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any;
  it('is off in console (dev) mode and on once real mail delivery is configured; overridable', () => {
    delete process.env.MAIL_TRANSPORT; delete process.env.REQUIRE_EMAIL_VERIFICATION;
    expect(mailTransport()).toBe('console');
    expect(isMailDeliveryConfigured()).toBe(false);
    expect(isVerificationRequired()).toBe(false);
    process.env.MAIL_TRANSPORT = 'smtp';
    expect(isVerificationRequired()).toBe(true);
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    expect(isVerificationRequired()).toBe(false);
    process.env.MAIL_TRANSPORT = 'console'; process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    expect(isVerificationRequired()).toBe(true);
  });
  it('the guard blocks unverified accounts only when required', () => {
    const g = new RequireVerifiedGuard();
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    expect(() => g.canActivate(ctx({ emailVerifiedAt: null }))).toThrow(ForbiddenException);
    expect(g.canActivate(ctx({ emailVerifiedAt: new Date() }))).toBe(true);
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    expect(g.canActivate(ctx({ emailVerifiedAt: null }))).toBe(true);
  });
});

describe('JwtStrategy session revocation', () => {
  const make = (user: any) => new JwtStrategy({ get: () => 'k'.repeat(40) } as any, { user: { findUnique: jest.fn().mockResolvedValue(user) } } as any);
  const row = { status: 'ACTIVE', role: 'USER', isGuest: false, emailVerifiedAt: null, tokenVersion: 2 };
  it('accepts a token with the current version and rejects older ones', async () => {
    await expect(make(row).validate({ sub: 'u', email: 'a@b.co', tv: 2 })).resolves.toMatchObject({ userId: 'u' });
    await expect(make(row).validate({ sub: 'u', email: 'a@b.co', tv: 1 })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(make(row).validate({ sub: 'u', email: 'a@b.co' })).rejects.toBeInstanceOf(UnauthorizedException); // pre-upgrade token, version bumped since
    await expect(make({ ...row, tokenVersion: 0 }).validate({ sub: 'u', email: 'a@b.co' })).resolves.toBeDefined(); // guests / never-changed accounts
  });
});

describe('mail', () => {
  it('templates carry the link in text and html and escape names', () => {
    const m = verifyEmailMail('a@b.co', '<b>Al</b>', 'https://x.co/verify-email?token=T');
    expect(m.text).toContain('https://x.co/verify-email?token=T');
    expect(m.html).toContain('href="https://x.co/verify-email?token=T"');
    expect(m.html).not.toContain('<b>Al</b>');
    expect(resetPasswordMail('a@b.co', 'https://x.co/r').subject).toMatch(/Reset your/);
  });
  it('console transport sends nothing out, and trySend never throws', async () => {
    delete process.env.MAIL_TRANSPORT;
    const svc = new MailService();
    await expect(svc.send({ to: 'a@b.co', subject: 's', text: 't', html: 'h' })).resolves.toBeUndefined();
    process.env.MAIL_TRANSPORT = 'resend'; process.env.RESEND_API_KEY = 'x';
    const original = global.fetch;
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'domain not verified' });
    expect(await svc.trySend({ to: 'a@b.co', subject: 's', text: 't', html: 'h' })).toBe(false);
    (global as any).fetch = original;
    delete process.env.MAIL_TRANSPORT;
  });
});

describe('JwtStrategy cookie login', () => {
  it('accepts the token from the session cookie when there is no Authorization header', async () => {
    const { JwtService } = await import('@nestjs/jwt');
    const secret = 'k'.repeat(40);
    const token = new JwtService({ secret }).sign({ sub: 'u', tv: 0 });
    const strategy: any = new JwtStrategy({ get: () => secret } as any, { user: { findUnique: jest.fn() } } as any);
    // passport-jwt keeps the extractor on the strategy
    const extract = strategy._jwtFromRequest;
    expect(extract({ headers: { cookie: `ovc_session=${token}` } })).toBe(token);
    expect(extract({ headers: { authorization: `Bearer ${token}` } })).toBe(token);
    expect(extract({ headers: {} })).toBeNull();
  });
});
