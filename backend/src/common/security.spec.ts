import { withinLimit } from './rate-limit';
import { isSessionRevoked, revokeSession } from './session-revocation';
import { startOauth, verifyOauthState } from '../auth/oauth-nonce';
import { sanitizeUser, exportUser } from '../account/session-token.service';
import { AuthService } from '../auth/auth.service';

const fakeRedis = () => {
  const store = new Map<string, { v: string; ttl?: number }>();
  return {
    store,
    incr: jest.fn(async (k: string) => {
      const n = Number(store.get(k)?.v ?? 0) + 1;
      store.set(k, { v: String(n), ttl: store.get(k)?.ttl });
      return n;
    }),
    expire: jest.fn(async (k: string, s: number) => void (store.get(k)!.ttl = s)),
    set: jest.fn(async (k: string, v: string, _ex: string, ttl: number) => void store.set(k, { v, ttl })),
    exists: jest.fn(async (k: string) => (store.has(k) ? 1 : 0)),
    getdel: jest.fn(async (k: string) => {
      const e = store.get(k);
      store.delete(k);
      return e?.v ?? null;
    }),
  } as any;
};

describe('per-user event limit', () => {
  it('allows up to the limit in a window, then refuses', async () => {
    const r = fakeRedis();
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await withinLimit(r, 'k', 3, 60));
    expect(results).toEqual([true, true, true, false, false]);
    expect(r.expire).toHaveBeenCalledTimes(1); // the window starts at the first use
  });
  it('lets the request through when Redis is down: a limiter must not take chat down', async () => {
    const r = { incr: jest.fn().mockRejectedValue(new Error('down')) } as any;
    expect(await withinLimit(r, 'k', 1, 60)).toBe(true);
  });
});

describe('signing out ends the login', () => {
  it('a revoked token id is refused until the token would have expired', async () => {
    const r = fakeRedis();
    const exp = Math.floor(Date.now() / 1000) + 3600;
    expect(await isSessionRevoked(r, 'abc')).toBe(false);
    await revokeSession(r, { jti: 'abc', exp });
    expect(await isSessionRevoked(r, 'abc')).toBe(true);
    expect(await isSessionRevoked(r, 'someone-else')).toBe(false);
    expect(r.store.get('revoked:abc')!.ttl).toBeGreaterThan(3500);
  });
  it('does nothing for tokens without an id, or already expired ones', async () => {
    const r = fakeRedis();
    await revokeSession(r, { exp: Math.floor(Date.now() / 1000) + 60 });
    await revokeSession(r, { jti: 'old', exp: Math.floor(Date.now() / 1000) - 10 });
    expect(r.set).not.toHaveBeenCalled();
    expect(await isSessionRevoked(r, undefined)).toBe(false);
  });
});

describe('Google sign-in is tied to the browser that started it', () => {
  const res = () => {
    const cookies: Record<string, string> = {};
    return { cookies, cookie: (n: string, v: string) => void (cookies[n] = v) } as any;
  };
  it('accepts the state that comes back with the same cookie, and returns the guest part', () => {
    const r = res();
    const state = startOauth(r, 'GUESTTOKEN');
    expect(verifyOauthState(state, `ovc_oauth=${r.cookies.ovc_oauth}`)).toEqual({ nonce: r.cookies.ovc_oauth, guestState: 'GUESTTOKEN' });
    expect(verifyOauthState(startOauth(r, undefined), `x=1; ovc_oauth=${r.cookies.ovc_oauth}`)?.guestState).toBe('');
  });
  it('refuses a link followed in a different browser (no cookie), a different cookie, or a made-up state', () => {
    const r = res();
    const state = startOauth(r, undefined);
    expect(verifyOauthState(state, undefined)).toBeNull();
    expect(verifyOauthState(state, 'ovc_oauth=' + 'f'.repeat(32))).toBeNull();
    expect(verifyOauthState('no-separator', `ovc_oauth=${r.cookies.ovc_oauth}`)).toBeNull();
    expect(verifyOauthState(undefined, `ovc_oauth=${r.cookies.ovc_oauth}`)).toBeNull();
  });
});

describe('login code is bound to the browser', () => {
  const svc = (redis: any) => new AuthService({ user: { findUnique: jest.fn().mockResolvedValue({ id: 'u', status: 'ACTIVE', tokenVersion: 0 }) } } as any, {} as any, redis, { issue: jest.fn(() => ({ access_token: 't' })) } as any, {} as any);
  it('works with the nonce it was made for, once', async () => {
    const r = fakeRedis();
    const s = svc(r);
    const code = await s.createLoginCode('u', 'nonce1');
    await expect(s.exchangeLoginCode(code, 'nonce1')).resolves.toMatchObject({ access_token: 't' });
    await expect(s.exchangeLoginCode(code, 'nonce1')).rejects.toThrow('Invalid or expired code');
  });
  it('a code posted from another browser is refused and spent', async () => {
    const r = fakeRedis();
    const s = svc(r);
    const code = await s.createLoginCode('u', 'nonce1');
    await expect(s.exchangeLoginCode(code, 'attacker')).rejects.toThrow('Invalid or expired code');
    await expect(s.exchangeLoginCode(code, null)).rejects.toThrow('Invalid or expired code');
    await expect(s.exchangeLoginCode(code, 'nonce1')).rejects.toThrow('Invalid or expired code'); // already spent
  });
});

describe('what the browser learns about you', () => {
  const user: any = {
    id: 'u', email: 'a@b.co', isGuest: false, role: 'USER', authProvider: 'EMAIL', emailVerifiedAt: null, displayName: 'Al', avatarUrl: null,
    birthdate: null, gender: null, country: 'US', createdAt: new Date(), trialEndsAt: new Date(), currentStreak: 0, creditCents: 0, rulesAcceptedAt: null,
    passwordHash: 'x', tokenVersion: 3, deletedAt: null, flaggedUntil: new Date(), lastIp: '1.2.3.4', lastDeviceId: 'dev', status: 'ACTIVE', lastActiveDate: new Date(), adultAttestedAt: null,
  };
  it('has no moderation state, IP, device, token version or password hash', () => {
    const out = sanitizeUser(user) as Record<string, unknown>;
    for (const secret of ['passwordHash', 'tokenVersion', 'flaggedUntil', 'lastIp', 'lastDeviceId', 'status', 'deletedAt']) expect(out).not.toHaveProperty(secret);
    expect(out).toMatchObject({ id: 'u', email: 'a@b.co', displayName: 'Al', country: 'US' });
  });
  it('a column added to the table later is not sent by default', () => {
    expect(sanitizeUser({ ...user, brandNewColumn: 'x' }) as object).not.toHaveProperty('brandNewColumn');
  });
  it('the download-my-data export still has the person\'s own IP and device, but never secrets', () => {
    const out = exportUser(user) as Record<string, unknown>;
    expect(out.lastIp).toBe('1.2.3.4');
    for (const secret of ['passwordHash', 'tokenVersion', 'deletedAt']) expect(out).not.toHaveProperty(secret);
  });
});
